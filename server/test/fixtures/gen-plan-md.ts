/**
 * 从真实页面夹具生成《培养方案》Markdown 存档（原文保留 + 结构化表格 + 审核快照）
 * 运行：npx tsx test/fixtures/gen-plan-md.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTablesIn } from '../../src/core/html.js';
import { parseDetail, parseAudit, parseScores, buildReport } from '../../src/services/graduation.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const detailHtml = fs.readFileSync(path.join(dir, 'topyfamx.html'), 'utf8');
const auditHtml = fs.readFileSync(path.join(dir, 'xxwcqk.html'), 'utf8');
const cjcxHtml = fs.readFileSync(path.join(dir, 'cjcx_list.html'), 'utf8');

/** HTML -> 带段落换行的纯文本（<p> 视为段落、<br> 视为换行） */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// ---------- 正文文字（培养目标 ~ 课程设置总表 之前），两张分配表的文字形态剔除、改用结构化表格 ----------
const full = htmlToText(detailHtml);
const startIdx = full.indexOf('一、培养目标');
const planEnd = full.indexOf('三、课程设置总表');
let prose = full.slice(startIdx > 0 ? startIdx : 0, planEnd > 0 ? planEnd : undefined);
const cutA = prose.indexOf('理论课程学分分配表');
const cutB = prose.indexOf('总学分：');
if (cutA > 0 && cutB > cutA) prose = prose.slice(0, cutA) + prose.slice(cutB);

// 章节标题转 Markdown
const H2 = ['一、培养目标', '二、详细说明'];
const H3 = ['一、专业简介', '二、培养目标', '三、培养要求', '四、毕业合格标准及学分要求', '五、学制与学位', '六、专业核心课程'];
prose = prose
  .split('\n')
  .map((line) => {
    const t = line.trim();
    if (H2.includes(t)) return `## ${t}`;
    if (H3.includes(t)) return `### ${t}`;
    return line;
  })
  .join('\n');

// ---------- 结构化数据 ----------
const detail = parseDetail(detailHtml);
const audit = parseAudit(auditHtml);
const real = buildReport({
  source: 'detail',
  gradeYear: detail.gradeYear,
  plan: detail.courses,
  scores: parseScores(cjcxHtml),
  conclusion: audit.conclusion,
  publicElectives: audit.publicElectives,
  reqs: detail.reqs,
});

const tables = parseTablesIn(detailHtml);

// 理论课程学分分配表（课程类别/课程性质/学时/学分/百分比）
const theoryTable = tables.find(
  (t) =>
    t.filter((r) => r.length >= 5 && ['必修', '选修'].includes((r[1] || '').trim()) && /^[\d.]+$/.test((r[3] || '').trim()))
      .length >= 3,
);
const theoryRows: string[][] = [];
if (theoryTable) {
  let lastCat = '';
  for (const row of theoryTable) {
    const c = row.map((x) => x.trim());
    if (c[0] === '合计') {
      theoryRows.push(['合计', '', c[2], c[3], c[4]]);
    } else if (c.length >= 5 && c[0] && c[0] !== '必修' && c[0] !== '选修' && (c[1] === '必修' || c[1] === '选修')) {
      lastCat = c[0];
      theoryRows.push([c[0], c[1], c[2], c[3], c[4]]);
    } else if ((c[0] === '必修' || c[0] === '选修') && c.length >= 4 && lastCat) {
      theoryRows.push([lastCat, c[0], c[1], c[2], c[3]]);
    }
  }
}

// 实践学分分配表
const practiceIdx = tables.findIndex((t) => t.some((r) => r.some((x) => x.includes('学周')) && r.some((x) => x.trim() === '学分')));
const practiceRows: string[][] = [];
if (practiceIdx >= 0) {
  const t = tables[practiceIdx];
  const hr = t.findIndex((r) => r.some((x) => x.includes('学周')));
  for (const row of t.slice(hr + 1)) {
    const c = row.map((x) => x.trim());
    if (c.length >= 4 && c[0]) practiceRows.push([c[0], c[1], c[2], c[3], c[4] || '']);
  }
}

// 课程设置总表：按体系分块，保留全部学时构成列 + 小计
const big = tables.find((t) => t.some((r) => r.some((x) => x.trim() === '体系') && r.some((x) => x.trim() === '课号')));
interface CourseRow {
  code: string;
  name: string;
  cat: string;
  credit: string;
  cols: string[]; // 讲授/专题讲座/课程实践/自主学习/课外实践/上机/总学时/开设学期
}
interface Block {
  system: string;
  rows: CourseRow[];
  sub: string[] | null;
}
const blocks: Block[] = [];
if (big) {
  let system = '';
  for (const row of big) {
    const c = row.map((x) => x.trim());
    if (!c.length) continue;
    if (c[0] === '小计') {
      if (blocks.length) blocks[blocks.length - 1].sub = c.slice(1);
      continue;
    }
    if (c[0] === '合计') continue;
    const i = c.findIndex((x) => /^\d{8}$/.test(x));
    if (i < 0) continue;
    if (i >= 2 && c[0]) system = c[0];
    if (!blocks.length || blocks[blocks.length - 1].system !== system) blocks.push({ system, rows: [], sub: null });
    blocks[blocks.length - 1].rows.push({
      code: c[i],
      name: c[i + 1],
      cat: c[i + 2],
      credit: c[i + 3],
      cols: c.slice(i + 4, i + 12),
    });
  }
}

const SYSTEM_TITLE: Record<string, string> = {
  思想政治课: '思想政治课',
  通识教育必修课: '通识教育必修课',
  '学科（专业）基础课': '学科（专业）基础课',
  专业必修课: '专业必修课',
  专业选修课: '专业选修课（限选+任选，修满 20 学分即可）',
  公共基础必修课: '公共基础必修课',
  集中实践课: '集中实践课',
};

function semLabel(raw: string): string {
  const n = parseInt(raw) || 0;
  if (!n) return raw;
  const start = (detail.gradeYear || 2022) + Math.ceil(n / 2) - 1;
  return `${n}（${start}-${start + 1}-${((n - 1) % 2) + 1}）`;
}

function mdTable(header: string[], rows: string[][]): string {
  const esc = (s: string) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${header.map(esc).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

// ---------- 组装 Markdown ----------
const out: string[] = [];
out.push('# 2022级数据科学与大数据技术专业人才培养方案');
out.push('');
out.push(`> 来源：湖南财经大学教务系统《培养方案明细》（/jsxsd/pyfa/topyfamx），抓取存档于 2026-08-23。`);
out.push('> 本文为原始方案全文 + 结构化表格；"毕业合格标准及学分要求"即毕业评分细则。');
out.push('');

out.push(prose.trim());
out.push('');

// 在"四、毕业合格标准及学分要求"小节（正文已剔除表格文字）后插入结构化分配表：
// 直接追加到正文之后会有章节错位 —— 改为在渲染时把分配表插入 prose 中"本专业总学分及各环节学分的具体要求见下表："之后
const anchor = '本专业总学分及各环节学分的具体要求见下表：';
const theoryMd =
  '**1. 理论课程学分分配表**\n\n' +
  mdTable(['课程类别', '课程性质', '学时', '学分', '百分比（%）（占总学分比例）'], theoryRows) +
  '\n\n**2. 实践学分分配表**\n\n' +
  mdTable(['类别', '学周+学时', '学分', '百分比（%）(占总学分比例)', '备注'], practiceRows);
const proseLines = prose.trim().split('\n');
const anchorLine = proseLines.findIndex((l) => l.includes(anchor));
if (anchorLine >= 0) proseLines.splice(anchorLine + 1, 0, '', theoryMd, '');

// ---------- 课程设置总表 ----------
out.length = 0;
out.push('# 2022级数据科学与大数据技术专业人才培养方案');
out.push('');
out.push(`> 来源：湖南财经大学教务系统《培养方案明细》（/jsxsd/pyfa/topyfamx），抓取存档于 2026-08-23。`);
out.push('> 本文为原始方案全文 + 结构化表格；"四、毕业合格标准及学分要求"即毕业评分细则。');
out.push('');
out.push(proseLines.join('\n'));
out.push('');
out.push('## 三、课程设置总表');
out.push('');
out.push('> 开设学期括号内为换算后的学年学期（2022 级入学）。小计行数值依次为：学分/讲授/专题讲座/课程实践/自主学习/课外实践/上机/总学时。');
out.push('');
const HEADER = ['课号', '课程名称', '类别', '学分', '讲授', '专题讲座', '课程实践', '自主学习', '课外实践', '上机', '总学时', '开设学期'];
for (const b of blocks) {
  out.push(`### ${SYSTEM_TITLE[b.system] || b.system}`);
  out.push('');
  const rows = b.rows.map((r) => [r.code, r.name, r.cat, r.credit, ...r.cols.slice(0, 7), semLabel(r.cols[7] || '')]);
  if (b.sub) rows.push(['小计', '', '', ...b.sub]);
  out.push(mdTable(HEADER, rows));
  out.push('');
}

// ---------- 附录：毕业审核快照 ----------
out.push('## 附录：毕业审核快照（2026-08-23，/jsxsd/xxwcqk/xxwcqk_byxfqkcx.do）');
out.push('');
out.push(`教务系统毕业结论：**${audit.conclusion ?? '（未获取）'}**`);
out.push('');
out.push('按上文"毕业合格标准"逐模块对照（已获学分依据当日成绩单）：');
out.push('');
out.push(
  mdTable(
    ['模块', '类别构成', '考核规则', '要求学分', '已获学分', '方案池学分', '状态'],
    real.groups.map((g) => [
      g.name,
      g.categories,
      g.ruleText,
      String(g.requiredCredit),
      String(g.doneCredit),
      g.poolCredit ? String(g.poolCredit) : '—',
      g.ok ? '达标' : '未达标',
    ]),
  ),
);
out.push('');
out.push(`总学分：${real.summary.totalEarnedCredit} / ${real.summary.totalRequiredCredit}（要求）。公共选修课修读 ${real.publicElectives.filter((p) => p.earned).length} 门、已获 ${real.publicElectives.filter((p) => p.earned).reduce((s, p) => s + p.credit, 0)} 学分。`);
out.push('');

const target = path.resolve(dir, '../../../培养方案_2022级数据科学与大数据技术.md');
fs.writeFileSync(target, out.join('\n'), 'utf8');
console.log('已生成:', target, `${(fs.statSync(target).size / 1024).toFixed(1)} KB`);
console.log('课程分块:', blocks.map((b) => `${b.system}(${b.rows.length}门)`).join(', '));
console.log('分配表行数: 理论', theoryRows.length, '实践', practiceRows.length);
