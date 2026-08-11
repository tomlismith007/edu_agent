/**
 * 离线验证：用浏览器保存的真实页面夹具检验毕业进度解析与官方口径分组
 * 运行：npx tsx test/fixtures/parse-check.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDetail, parseAudit, parseScores, buildReport, planModulesOf } from '../../src/services/graduation.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const detailHtml = fs.readFileSync(path.join(dir, 'topyfamx.html'), 'utf8');
const auditHtml = fs.readFileSync(path.join(dir, 'xxwcqk.html'), 'utf8');
const cjcxHtml = fs.readFileSync(path.join(dir, 'cjcx_list.html'), 'utf8');

let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.error(`✗ ${name}: 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

// ---- 培养方案明细 ----
const detail = parseDetail(detailHtml);
const bySystem = new Map<string, { count: number; credit: number }>();
for (const c of detail.courses) {
  const s = bySystem.get(c.system) || { count: 0, credit: 0 };
  s.count++;
  s.credit += c.credit;
  bySystem.set(c.system, s);
}
console.log('体系分组:', JSON.stringify([...bySystem.entries()]));
check('课程总数 82', detail.courses.length, 82);
check('思想政治课 13门17学分', bySystem.get('思想政治课'), { count: 13, credit: 17 });
check('通识教育必修课 11门11学分', bySystem.get('通识教育必修课'), { count: 11, credit: 11 });
check('学科（专业）基础课 12门42学分', bySystem.get('学科（专业）基础课'), { count: 12, credit: 42 });
check('专业必修课 6门21学分', bySystem.get('专业必修课'), { count: 6, credit: 21 });
check('专业选修课 25门52学分', bySystem.get('专业选修课'), { count: 25, credit: 52 });
check('公共基础必修课 5门16学分', bySystem.get('公共基础必修课'), { count: 5, credit: 16 });
check('集中实践课 10门24.5学分', bySystem.get('集中实践课'), { count: 10, credit: 24.5 });
check('专业选修课=限选7门16学分', detail.courses.filter((c) => c.system === '专业选修课' && c.category === '限选').length, 7);
check('专业选修课=任选18门36学分', [
  detail.courses.filter((c) => c.system === '专业选修课' && c.category === '任选').length,
  detail.courses.filter((c) => c.system === '专业选修课' && c.category === '任选').reduce((s, c) => s + c.credit, 0),
], [18, 36]);
check('年级 2022', detail.gradeYear, 2022);
check('学期换算 思政第1门=2022-2023-1', detail.courses.find((c) => c.code === '09015141')?.term, '2022-2023-1');
check('学期换算 金融学(第3学期)=2023-2024-1', detail.courses.find((c) => c.code === '02033535')?.term, '2023-2024-1');

const reqTotal = detail.reqs.reduce((s, r) => s + r.credit, 0);
console.log('学分分配表:', JSON.stringify(detail.reqs));
check('分配表 8 行', detail.reqs.length, 8);
check('总要求学分 161.5', reqTotal, 161.5);
check('专业课选修要求 20', detail.reqs.find((r) => r.category === '专业课' && r.nature === '选修')?.credit, 20);
check('通识教育课选修要求 10', detail.reqs.find((r) => r.category === '通识教育课' && r.nature === '选修')?.credit, 10);
check('集中实践课 24.5', detail.reqs.find((r) => r.category === '集中实践课')?.credit, 24.5);

// ---- 原始响应兼容：Word 导出页面标签为大写（<TD>/<TR>），浏览器 outerHTML 才是小写 ----
{
  const rawLike = detailHtml.replace(
    /<(\/?)([a-z][a-z0-9]*)/gi,
    (_m: string, slash: string, tag: string) => '<' + slash + tag.toUpperCase(),
  );
  const rawDetail = parseDetail(rawLike);
  check('大写标签原始响应解析 82 门课', rawDetail.courses.length, 82);
  check('大写标签原始响应解析分配表 8 行', rawDetail.reqs.length, 8);
  const rawReport = buildReport({
    source: 'detail',
    gradeYear: rawDetail.gradeYear,
    plan: rawDetail.courses,
    scores: [],
    conclusion: null,
    publicElectives: [],
    reqs: rawDetail.reqs,
  });
  check('大写标签下总要求仍为 161.5', rawReport.summary.totalRequiredCredit, 161.5);
}

// ---- 官方模块分布（学分概况页共用） ----
const modules = planModulesOf(detail.courses, detail.reqs);
console.log('官方模块分布:', modules.map((m) => `${m.name}[${m.rule}]${m.requiredCredit}/${m.poolCredit}(${m.poolCount}门)`).join(', '));
check('模块数 8（7体系+公选）', modules.length, 8);
check('模块总要求学分 161.5', modules.reduce((s, m) => s + m.requiredCredit, 0), 161.5);
const zx = modules.find((m) => m.system === '专业选修课');
check('专业选修模块 credits/要求20/池52/25门', [zx?.rule, zx?.requiredCredit, zx?.poolCredit, zx?.poolCount], ['credits', 20, 52, 25]);
const gx = modules.find((m) => m.system === '通识教育选修课');
check('公选模块 credits/要求10/不限池', [gx?.rule, gx?.requiredCredit, gx?.poolCredit, gx?.poolCount], ['credits', 10, 0, 0]);
check(
  '必修类模块规则均为all且顺序正确',
  modules.filter((m) => m.rule === 'all').map((m) => m.system),
  ['思想政治课', '通识教育必修课', '公共基础必修课', '学科（专业）基础课', '专业必修课', '集中实践课'],
);

// ---- 毕业审核页 ----
const audit = parseAudit(auditHtml);
const earned = audit.publicElectives.filter((p) => p.earned);
console.log('毕业结论:', audit.conclusion, '公选课:', audit.publicElectives.length, '门，已获', earned.reduce((s, p) => s + p.credit, 0), '学分');
check('毕业结论=毕业', audit.conclusion, '毕业');
check('公选课 8 门', audit.publicElectives.length, 8);
check('公选已获学分 11.5', earned.reduce((s, p) => s + p.credit, 0), 11.5);

// ---- 分组判定（空成绩单：除公选外全部未达标；公选 11.5≥10 达标）----
const report = buildReport({
  source: 'detail',
  gradeYear: detail.gradeYear,
  plan: detail.courses,
  scores: [],
  conclusion: audit.conclusion,
  publicElectives: audit.publicElectives,
  reqs: detail.reqs,
});
console.log('分组判定:');
for (const g of report.groups) console.log(`  ${g.name} [${g.rule}] ${g.doneCredit}/${g.requiredCredit} ok=${g.ok}`);
check('总要求学分 161.5', report.summary.totalRequiredCredit, 161.5);
check('空成绩单时仅公选组达标', report.groups.filter((g) => g.ok).map((g) => g.key), ['通识教育选修课']);
// 全部修完类体系中有学分课程：思政6+通识必修8+公基5+学科基础12+专业必修6+实践10=47（0学分进 zeroMiss，选修池未修不算缺口）
check('必修/实践缺口=47', report.mustMiss.length, 47);
check('专业选修池未修不影响缺口判定', report.mustMiss.filter((m) => m.system === '专业选修课').length, 0);

// ---- 端到端：真实成绩单（浏览器会话抓取的 cjcx_list） ----
const scores = parseScores(cjcxHtml);
console.log(`真实成绩单 ${scores.length} 条`);
const real = buildReport({
  source: 'detail',
  gradeYear: detail.gradeYear,
  plan: detail.courses,
  scores,
  conclusion: audit.conclusion,
  publicElectives: audit.publicElectives,
  reqs: detail.reqs,
});
console.log('真实数据分组判定:');
for (const g of real.groups) console.log(`  ${g.name} [${g.rule}] 已获${g.doneCredit}/要求${g.requiredCredit} ok=${g.ok}`);
console.log('总学分:', real.summary.totalEarnedCredit, '/', real.summary.totalRequiredCredit, '毕业结论:', real.summary.conclusion);
check('真实成绩单下所有模块达标', real.groups.every((g) => g.ok), true);
check('真实总获学分 165', real.summary.totalEarnedCredit, 165);
check('专业选修组已获22学分(限选16+任选6)', real.groups.find((g) => g.key === '专业选修课')?.doneCredit, 22);
check('无必修缺口', real.mustMiss.length, 0);

if (failed) {
  console.error(`\n${failed} 项断言失败`);
  process.exit(1);
}
console.log('\n全部断言通过');
