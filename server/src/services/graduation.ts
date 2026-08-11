import { getJ, postForm } from '../core/http.js';
import { JXSD_BASE } from '../core/config.js';
import { parseRows, parseTablesIn } from '../core/html.js';
import { fetchScores as fetchAllScores } from './scores.js';

/**
 * 毕业进度（按官方《培养方案-毕业合格标准及学分要求》口径）
 *
 * 官方规则（2022级数据科学与大数据技术，来源 /jsxsd/pyfa/topyfamx）：
 * - 必修类模块（思政/通识必修/公共基础/学科基础/专业必修）：须全部修完，要求学分=方案学分；
 * - 专业课（选修）：限选+任选合并为同一个选课组，修满 20 学分即可（池共 52 学分），
 *   而非把执行计划里"任选 18 门 36 学分"的池子总量当成要求；
 * - 通识教育课（选修，公选课）：不在执行计划内，按成绩单/毕业审核修满 10 学分；
 * - 集中实践课：须全部修完；总学分 = 理论 137 + 集中实践 24.5 = 161.5。
 */

export interface DetailCourse {
  /** 体系（课程设置总表分组）：思想政治课/通识教育必修课/公共基础必修课/学科（专业）基础课/专业必修课/专业选修课/集中实践课 */
  system: string;
  code: string;
  name: string;
  /** 类别：必修/限选/任选/实践 */
  category: string;
  credit: number;
  /** 开设学期序号 1-8（执行计划降级来源时为 0） */
  semester: number;
  /** 学年学期，如 2023-2024-1；无法换算时为 "第N学期" */
  term: string;
}

export interface PlanCourse {
  term: string;
  code: string;
  name: string;
  unit: string;
  credit: number;
  hours: string;
  method: string;
  attr: string;
}

export interface ScoreBrief {
  term: string;
  code: string;
  name: string;
  grade: string;
  credit: number;
  nature: string;
}

export interface CheckItem extends DetailCourse {
  status: 'done' | 'miss';
  score: ScoreBrief | null;
}

/** 公共选修课（通识教育课-选修）修读记录，来源毕业审核页 */
export interface PublicElective {
  term: string;
  code: string;
  name: string;
  credit: number;
  grade: string;
  earned: boolean;
}

/** 学分分配表行（官方各模块要求学分） */
export interface ReqRow {
  category: string;
  nature: string;
  credit: number;
}

export interface GroupStat {
  key: string;
  name: string;
  /** 类别构成描述，如 "必修" / "限选+任选" / "公选课" */
  categories: string;
  /** all=须全部修完；credits=修满要求学分即可 */
  rule: 'all' | 'credits';
  ruleText: string;
  requiredCredit: number;
  /** 方案池学分（公选课不限池，为 0） */
  poolCredit: number;
  poolCount: number;
  doneCount: number;
  doneCredit: number;
  ok: boolean;
}

export interface GraduationReport {
  /** 课程体系来源：detail=培养方案明细（官方口径）；plan=执行计划（页面结构变更时的降级口径） */
  source: 'detail' | 'plan';
  gradeYear: number | null;
  summary: {
    totalRequiredCredit: number;
    totalEarnedCredit: number;
    earnedPct: number;
    conclusion: string | null;
    ok: boolean;
    planCount: number;
    doneCount: number;
    missCount: number;
  };
  groups: GroupStat[];
  requirements: ReqRow[];
  mustMiss: CheckItem[];
  zeroMiss: CheckItem[];
  nameOnly: CheckItem[];
  publicElectives: PublicElective[];
  plan: CheckItem[];
  scores: ScoreBrief[];
}

/** 官方学分分配表兜底值（页面结构变更时仍能按官方标准判定） */
const FALLBACK_REQ: Record<string, number> = {
  '思想政治课|必修': 17,
  '公共基础课|必修': 16,
  '通识教育课|必修': 11,
  '通识教育课|选修': 10,
  '学科（专业）基础课|必修': 42,
  '专业课|必修': 21,
  '专业课|选修': 20,
  '集中实践课|必修': 24.5,
};

/** 体系 -> 学分分配表键 */
const REQ_KEY: Record<string, string> = {
  思想政治课: '思想政治课|必修',
  通识教育必修课: '通识教育课|必修',
  公共基础必修课: '公共基础课|必修',
  '学科（专业）基础课': '学科（专业）基础课|必修',
  专业必修课: '专业课|必修',
  专业选修课: '专业课|选修',
  集中实践课: '集中实践课|必修',
  通识教育选修课: '通识教育课|选修',
};

/** 展示顺序与命名（官方"理论课程学分分配表"+实践表口径） */
const GROUP_META: Record<string, { name: string; categories: string }> = {
  思想政治课: { name: '思想政治课', categories: '必修' },
  通识教育必修课: { name: '通识教育课（必修）', categories: '必修' },
  公共基础必修课: { name: '公共基础课', categories: '必修' },
  '学科（专业）基础课': { name: '学科（专业）基础课', categories: '必修' },
  专业必修课: { name: '专业课（必修）', categories: '必修' },
  专业选修课: { name: '专业课（选修）', categories: '限选+任选' },
  集中实践课: { name: '集中实践课', categories: '实践' },
  通识教育选修课: { name: '通识教育课（选修·公选）', categories: '公选课' },
  必修课程: { name: '必修课程', categories: '必修' },
};
const GROUP_ORDER = [
  '思想政治课',
  '通识教育必修课',
  '公共基础必修课',
  '学科（专业）基础课',
  '专业必修课',
  '专业选修课',
  '集中实践课',
  '通识教育选修课',
  '必修课程',
];

/** 按学分考核（而非全部修完）的体系 */
const CREDITS_RULE = new Set(['专业选修课', '通识教育选修课']);

/** 开设学期序号 -> 学年学期（2022 级第 3 学期 = 2023-2024-1） */
function semesterToTerm(n: number, gradeYear: number | null): string {
  if (!n) return '';
  if (!gradeYear) return `第${n}学期`;
  const start = gradeYear + Math.ceil(n / 2) - 1;
  return `${start}-${start + 1}-${((n - 1) % 2) + 1}`;
}

/** 解析培养方案明细页：课程设置总表（带体系分组）+ 理论/实践学分分配表 */
export function parseDetail(html: string): {
  courses: DetailCourse[];
  reqs: ReqRow[];
  gradeYear: number | null;
} {
  const tables = parseTablesIn(html);
  const gradeYear = Number((html.match(/(\d{4})级/) || [])[1]) || null;

  const reqs: ReqRow[] = [];
  for (const t of tables) {
    // 理论课程学分分配表。Word 导出页存在表格嵌套，表头首格"课程类别"可能被外层
    // 单元格吞掉，因此优先按表头识别、退化为按数据行特征识别（>=3 行形如
    // [课程类别, 必修/选修, 学时, 学分, 百分比]；课程类别列带 rowspan，续行只有 4 格）
    const thIdx = t.findIndex((r) => r.some((x) => x.trim() === '课程类别') && r.some((x) => x.trim() === '课程性质'));
    const theoryData = t.filter(
      (r) => r.length >= 5 && ['必修', '选修'].includes((r[1] || '').trim()) && /^[\d.]+$/.test((r[3] || '').trim()),
    );
    if (thIdx >= 0 || theoryData.length >= 3) {
      let lastCat = '';
      for (const row of t) {
        const c = row.map((x) => x.trim());
        if (c[0] === '合计') continue;
        if (c.length >= 5 && c[0] && c[0] !== '必修' && c[0] !== '选修' && (c[1] === '必修' || c[1] === '选修')) {
          lastCat = c[0];
          reqs.push({ category: c[0], nature: c[1], credit: parseFloat(c[3]) || 0 });
        } else if ((c[0] === '必修' || c[0] === '选修') && c.length >= 4 && lastCat) {
          reqs.push({ category: lastCat, nature: c[0], credit: parseFloat(c[2]) || 0 });
        }
      }
      continue;
    }
    // 实践学分分配表：只取集中实践课（"理论课程中的实践"已计入理论学分）
    const prIdx = t.findIndex((r) => r.some((x) => x.includes('学周')) && r.some((x) => x.trim() === '学分'));
    if (prIdx >= 0) {
      for (const row of t.slice(prIdx + 1)) {
        const c = row.map((x) => x.trim());
        if (c[0] === '集中实践课') reqs.push({ category: '集中实践课', nature: '必修', credit: parseFloat(c[2]) || 0 });
      }
    }
  }

  // 课程设置总表：表头行含 体系+课号；体系列 rowspan，块首行课号在第 3 列、续行在第 2 列，
  // 以 8 位纯数字课号为锚点定位各列
  const courses: DetailCourse[] = [];
  const big = tables.find((t) => t.some((r) => r.some((x) => x.trim() === '体系') && r.some((x) => x.trim() === '课号')));
  if (big) {
    let system = '';
    for (const row of big) {
      const c = row.map((x) => x.trim());
      if (!c.length || c[0] === '小计' || c[0] === '合计') continue;
      const codeIdx = c.findIndex((x) => /^\d{8}$/.test(x));
      if (codeIdx < 0) continue;
      if (codeIdx >= 2 && c[0]) system = c[0];
      const semester = parseInt(c[c.length - 1]) || 0;
      courses.push({
        system,
        code: c[codeIdx],
        name: c[codeIdx + 1] || '',
        category: c[codeIdx + 2] || '',
        credit: parseFloat(c[codeIdx + 3]) || 0,
        semester,
        term: semesterToTerm(semester, gradeYear),
      });
    }
  }
  return { courses, reqs, gradeYear };
}

/** 解析毕业审核页（学习过程情况查询）：毕业结论 + 公共选修课修读清单 */
export function parseAudit(html: string): { conclusion: string | null; publicElectives: PublicElective[] } {
  const tables = parseTablesIn(html);
  let conclusion: string | null = null;
  const summary = tables.find((t) => (t[0] || []).some((x) => x.includes('毕业结论')));
  if (summary) {
    const row = summary.find((r) => r.some((x) => x.includes('应修学分') || x.includes('已修学分')));
    const last = row?.[row.length - 1]?.trim();
    if (row && last) conclusion = last;
  }

  // 修读明细表（非选课组在前、公共选修课在后），表头含"获学分状态"
  const detailTables = tables.filter((t) => t.some((r) => r.some((x) => x.trim() === '获学分状态')));
  const pub = detailTables[detailTables.length - 1] || [];
  const publicElectives: PublicElective[] = pub
    .filter((r) => /^\d+$/.test((r[0] || '').trim()))
    .map((r) => ({
      // [序号, 学年学期, 课程编号, 课程名称, 学分, 成绩, 获学分状态]
      term: (r[1] || '').trim(),
      code: (r[2] || '').trim(),
      name: (r[3] || '').trim(),
      credit: parseFloat(r[4]) || 0,
      grade: (r[5] || '').trim(),
      earned: (r[6] || '').trim() === '已获',
    }));
  return { conclusion, publicElectives };
}

/** 拉取培养方案明细（官方课程体系与学分分配表），同时返回原始 HTML（RAG 序列化需要原文） */
export async function fetchDetailRaw(): Promise<{
  html: string;
  courses: DetailCourse[];
  reqs: ReqRow[];
  gradeYear: number | null;
}> {
  const r = await getJ(`${JXSD_BASE}/pyfa/topyfamx`);
  const html = String(r.data);
  return { html, ...parseDetail(html) };
}

/** 拉取培养方案明细的结构化结果（内部用） */
async function fetchDetail(): Promise<{ courses: DetailCourse[]; reqs: ReqRow[]; gradeYear: number | null }> {
  const { html, ...parsed } = await fetchDetailRaw();
  return parsed;
}

/** 拉取执行计划（明细页不可用时的降级课程来源） */
async function fetchPlan(): Promise<DetailCourse[]> {
  const r = await getJ(`${JXSD_BASE}/pyfa/pyfa_query`);
  const rows = parseRows(String(r.data), 10, true);
  // 执行计划只有课程属性（必修/限选/任选/实践），映射到体系口径
  const attrToSystem: Record<string, string> = {
    必修: '必修课程',
    限选: '专业选修课',
    任选: '专业选修课',
    实践: '集中实践课',
  };
  return rows.map((c) => {
    // [序号, 开课学期, 课程编号, 课程名称, 开课单位, 学分, 总学时, 考核方式, 课程属性, 是否考试]
    const attr = (c[8] || '').trim();
    return {
      system: attrToSystem[attr] || attr,
      code: (c[2] || '').trim(),
      name: (c[3] || '').trim(),
      category: attr,
      credit: parseFloat(c[5]) || 0,
      semester: 0,
      term: (c[1] || '').trim(),
    };
  });
}

/** 拉取毕业审核页（学习过程情况查询） */
async function fetchAudit(): Promise<{ conclusion: string | null; publicElectives: PublicElective[] }> {
  const r = await getJ(`${JXSD_BASE}/xxwcqk/xxwcqk_byxfqkcx.do`);
  return parseAudit(String(r.data));
}

/** 解析全部课程成绩页（cjcx_list） */
export function parseScores(html: string): ScoreBrief[] {
  const rows = parseRows(html, 11, true);
  return rows.map((c) => ({
    // [序号, 学年学期, 课程编号, 课程名称, 成绩, 学分, 总学时, 绩点, 考核方式, 课程属性, 课程性质]
    term: c[1],
    code: c[2],
    name: c[3],
    grade: c[4],
    credit: parseFloat(c[5]) || 0,
    nature: c[10],
  }));
}

/** 拉取全部课程成绩（复用 scores 模块） */
async function fetchScores(): Promise<ScoreBrief[]> {
  const all = await fetchAllScores('', 'all');
  return all.map((c) => ({
    term: c.term,
    code: c.code,
    name: c.name,
    grade: c.grade,
    credit: c.credit,
    nature: c.nature,
  }));
}

/** 课程名称归一化（去空格/括号等干扰） */
function normName(s: string): string {
  return String(s || '').replace(/[（(]/g, '').replace(/[）)]/g, '').replace(/[\s·．.\-]/g, '');
}

/** 成绩按课号建索引：优先保留有学分的记录（挂科后重修通过的场景） */
function indexScores(scores: ScoreBrief[]): Map<string, ScoreBrief> {
  const byCode = new Map<string, ScoreBrief>();
  for (const s of scores) {
    if (!s.code) continue;
    const old = byCode.get(s.code);
    if (!old || (old.credit <= 0 && s.credit > 0)) byCode.set(s.code, s);
  }
  return byCode;
}

/** 计划 vs 已修交叉比对：编号为主键，名称为兜底 */
function crossCheck(plan: DetailCourse[], scores: ScoreBrief[]): CheckItem[] {
  const byCode = indexScores(scores);
  return plan.map((p) => {
    const hitByCode = p.code ? byCode.get(p.code) : undefined;
    const hitByName = !hitByCode ? scores.find((s) => s.code && normName(s.name) === normName(p.name)) : undefined;
    if (hitByCode || hitByName) {
      return { ...p, status: 'done', score: hitByCode || hitByName || null };
    }
    return { ...p, status: 'miss', score: null };
  });
}

/** 审核页不可用时，用"成绩单中不属于方案的课程"估算公选课 */
function fallbackPublicElectives(scores: ScoreBrief[], planCodes: Set<string>): PublicElective[] {
  const seen = new Map<string, PublicElective>();
  for (const s of scores) {
    if (!s.code || planCodes.has(s.code)) continue;
    const old = seen.get(s.code);
    const item: PublicElective = {
      term: s.term,
      code: s.code,
      name: s.name,
      credit: s.credit,
      grade: s.grade,
      earned: s.credit > 0,
    };
    if (!old || (old.credit <= 0 && item.credit > 0)) seen.set(s.code, item);
  }
  return [...seen.values()];
}

/** 官方模块（体系）方案侧统计：池规模 + 要求学分，毕业进度与学分概况共用 */
export interface PlanModule {
  system: string;
  name: string;
  categories: string;
  /** all=须全部修完；credits=修满要求学分即可 */
  rule: 'all' | 'credits';
  requiredCredit: number;
  /** 方案池学分（公选课不限池，为 0） */
  poolCredit: number;
  poolCount: number;
}

/** 按官方"毕业合格标准"汇总各模块的方案侧数据（纯函数，便于离线验证） */
export function planModulesOf(courses: DetailCourse[], reqs: ReqRow[]): PlanModule[] {
  const reqMap = new Map(reqs.map((r) => [`${r.category}|${r.nature}`, r.credit]));
  const requiredOf = (system: string, poolCredit: number): number => {
    const key = REQ_KEY[system];
    if (key && reqMap.has(key)) return reqMap.get(key)!;
    return FALLBACK_REQ[key ?? ''] ?? poolCredit;
  };

  const modules: PlanModule[] = [];
  for (const system of [...new Set(courses.map((p) => p.system))]) {
    const items = courses.filter((p) => p.system === system);
    const poolCredit = items.reduce((s, p) => s + p.credit, 0);
    const meta = GROUP_META[system] || { name: system, categories: [...new Set(items.map((i) => i.category))].join('/') };
    modules.push({
      system,
      name: meta.name,
      categories: meta.categories,
      rule: CREDITS_RULE.has(system) ? 'credits' : 'all',
      requiredCredit: system === '必修课程' ? poolCredit : requiredOf(system, poolCredit),
      poolCredit,
      poolCount: items.length,
    });
  }
  // 通识教育选修（公选课）：不在方案池内，仅考核学分
  modules.push({
    system: '通识教育选修课',
    name: GROUP_META['通识教育选修课'].name,
    categories: '公选课',
    rule: 'credits',
    requiredCredit: requiredOf('通识教育选修课', 0),
    poolCredit: 0,
    poolCount: 0,
  });
  return modules.sort((a, b) => GROUP_ORDER.indexOf(a.system) - GROUP_ORDER.indexOf(b.system));
}

/** 按官方标准汇总各模块达标情况（纯函数，便于离线验证） */
export function buildReport(input: {
  source: 'detail' | 'plan';
  gradeYear: number | null;
  plan: DetailCourse[];
  scores: ScoreBrief[];
  conclusion: string | null;
  publicElectives: PublicElective[];
  reqs: ReqRow[];
}): GraduationReport {
  const { source, gradeYear, plan, scores, conclusion, publicElectives, reqs } = input;
  const checked = crossCheck(plan, scores);
  const done = checked.filter((x) => x.status === 'done');
  const miss = checked.filter((x) => x.status === 'miss');

  const groups = planModulesOf(plan, reqs).map<GroupStat>((m) => {
    let doneCount = 0;
    let doneCredit = 0;
    if (m.system === '通识教育选修课') {
      // 公选课：已获学分来自教务审核的修读记录（或成绩单估算）
      const earned = publicElectives.filter((p) => p.earned);
      doneCount = earned.length;
      doneCredit = earned.reduce((s, p) => s + p.credit, 0);
    } else {
      const doneItems = checked.filter((x) => x.system === m.system && x.status === 'done');
      doneCount = doneItems.length;
      doneCredit = doneItems.reduce((s, p) => s + (p.score ? p.score.credit : p.credit), 0);
    }
    return {
      ...m,
      key: m.system,
      ruleText:
        m.rule === 'all'
          ? `须全部修完（${m.requiredCredit} 学分）`
          : `修满 ${m.requiredCredit} 学分即可${m.poolCredit ? `（池共 ${m.poolCredit} 学分）` : '（不限课程池）'}`,
      doneCount,
      doneCredit,
      ok: m.requiredCredit > 0 ? doneCredit >= m.requiredCredit : true,
    };
  });

  const allRuleSystems = new Set(groups.filter((g) => g.rule === 'all').map((g) => g.key));
  const mustMiss = miss.filter((p) => allRuleSystems.has(p.system) && p.credit > 0);
  const zeroMiss = miss.filter((p) => p.credit === 0);
  const nameOnly = done.filter((x) => !x.score?.code || x.score.code !== x.code);

  const totalRequiredCredit = groups.reduce((s, g) => s + g.requiredCredit, 0);
  const totalEarnedCredit = groups.reduce((s, g) => s + g.doneCredit, 0);
  const requirements = reqs.length
    ? reqs
    : Object.entries(FALLBACK_REQ).map(([k, credit]) => {
        const [category, nature] = k.split('|');
        return { category, nature, credit };
      });

  return {
    source,
    gradeYear,
    summary: {
      totalRequiredCredit,
      totalEarnedCredit,
      earnedPct: totalRequiredCredit > 0 ? (totalEarnedCredit / totalRequiredCredit) * 100 : 0,
      conclusion,
      ok: groups.every((g) => g.ok),
      planCount: plan.length,
      doneCount: done.length,
      missCount: miss.length,
    },
    groups,
    requirements,
    mustMiss,
    zeroMiss,
    nameOnly,
    publicElectives,
    plan: checked,
    scores,
  };
}

/** 毕业进度总分析 */
export async function buildGraduation(): Promise<GraduationReport> {
  const detail = await fetchDetail().catch((e) => {
    console.warn('[graduation] 培养方案明细页解析失败，降级为执行计划口径:', (e as Error).message);
    return null;
  });
  const audit = await fetchAudit().catch((e) => {
    console.warn('[graduation] 毕业审核页获取失败，公选课改用成绩单估算:', (e as Error).message);
    return null;
  });
  const scores = await fetchScores();

  if (detail && detail.courses.length) {
    const publicElectives = audit?.publicElectives.length
      ? audit.publicElectives
      : fallbackPublicElectives(scores, new Set(detail.courses.map((c) => c.code)));
    return buildReport({
      source: 'detail',
      gradeYear: detail.gradeYear,
      plan: detail.courses,
      scores,
      conclusion: audit?.conclusion ?? null,
      publicElectives,
      reqs: detail.reqs,
    });
  }
  const plan = await fetchPlan();
  const publicElectives = audit?.publicElectives.length
    ? audit.publicElectives
    : fallbackPublicElectives(scores, new Set(plan.map((p) => p.code)));
  return buildReport({
    source: 'plan',
    gradeYear: null,
    plan,
    scores,
    conclusion: audit?.conclusion ?? null,
    publicElectives,
    reqs: [],
  });
}
