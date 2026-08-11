import { getJ } from '../core/http.js';
import { JXSD_BASE } from '../core/config.js';
import { parseTablesIn } from '../core/html.js';
import { buildGraduation, type GroupStat } from './graduation.js';

export interface CourseRecord {
  term: string;
  code: string;
  name: string;
  credit: number;
  grade: string;
  status: string;
}

export interface StudyGroup {
  header: string[] | undefined;
  courses: CourseRecord[];
  totalCredit: number;
  earnedCredit: number;
}

export interface StudyCompletion {
  summary: Record<string, string[]>;
  conclusion: string;
  nonGroup: StudyGroup;
  electives: StudyGroup;
}

export interface InnovationCredit {
  header: string[] | undefined;
  records: {
    term: string;
    code: string;
    name: string;
    studentId: string;
    studentName: string;
    credit: number;
    type: string;
    note: string;
  }[];
  totalCredit: number;
  byType: Record<string, { count: number; credit: number }>;
}

export interface PlanStats {
  /** detail=培养方案明细（官方模块口径）；plan=执行计划降级口径 */
  source: 'detail' | 'plan';
  total: number;
  totalRequiredCredit: number;
  /** 与毕业进度页同源同构的模块达标对照（含已获学分与状态） */
  modules: GroupStat[];
}

export interface CreditsReport {
  planStats: PlanStats;
  studyCompletion: StudyCompletion;
  innovation: InnovationCredit;
  summary: { totalEarned: number; planCredit: number | null; gap: number | null };
}

/** 1. 学习过程情况查询（个人修读情况） */
export async function fetchStudyCompletion(): Promise<StudyCompletion> {
  const r = await getJ(`${JXSD_BASE}/xxwcqk/xxwcqk_byxfqkcx.do`);
  const tables = parseTablesIn(String(r.data));

  // tables[0] = 汇总表（毕业结论列通过 rowspan 合并，值出现在首数据行末列）
  // tables[1] = 非选课组修读情况（[0]标题行 [1]表头行 [2..]课程行）
  // tables[2] = 公共选修课修读情况
  const summaryTable = tables[0] || [];
  const nonGroupTable = tables[1] || [];
  const electiveTable = tables[2] || [];

  const summaryRows: Record<string, string[]> = {};
  summaryTable.slice(1).forEach((row) => {
    if (row[0]) summaryRows[row[0]] = row.slice(1);
  });
  const conclusion =
    summaryTable.flat().find((c) => ['毕业', '结业', '肄业', '未毕业', '不予毕业'].includes(c)) || '—';

  // 课程行固定 7 列: [序号, 学年学期, 课程编号, 课程名称, 学分, 成绩, 获学分状态]
  function parseCourses(table: string[][]): CourseRecord[] {
    return table.slice(2).map((c) => ({
      term: c[1],
      code: c[2],
      name: c[3],
      credit: parseFloat(c[4]) || 0,
      grade: c[5],
      status: c[6],
    }));
  }

  const nonGroupCourses = parseCourses(nonGroupTable);
  const electiveCourses = parseCourses(electiveTable);

  const sum = (list: CourseRecord[], status?: string) =>
    list.filter((c) => !status || c.status === status).reduce((s, c) => s + c.credit, 0);

  return {
    summary: summaryRows,
    conclusion,
    nonGroup: {
      header: nonGroupTable[1],
      courses: nonGroupCourses,
      totalCredit: sum(nonGroupCourses),
      earnedCredit: sum(nonGroupCourses, '已获'),
    },
    electives: {
      header: electiveTable[1],
      courses: electiveCourses,
      totalCredit: sum(electiveCourses),
      earnedCredit: sum(electiveCourses, '已获'),
    },
  };
}

/** 3. 创新学分查询 */
export async function fetchInnovationCredit(): Promise<InnovationCredit> {
  const r = await getJ(`${JXSD_BASE}/pyfa/cxxf_query`);
  const tables = parseTablesIn(String(r.data));
  const table = tables[0] || [];
  // 行结构: [序号, 学年学期, 项目编号, 项目名称, 学号, 姓名, 学分, 学分类型, 备注]
  const records = table.slice(1).map((c) => ({
    term: c[1],
    code: c[2],
    name: c[3],
    studentId: c[4],
    studentName: c[5],
    credit: parseFloat(c[6]) || 0,
    type: c[7],
    note: c[8],
  }));
  const byType: Record<string, { count: number; credit: number }> = {};
  records.forEach((x) => {
    byType[x.type] = byType[x.type] || { count: 0, credit: 0 };
    byType[x.type].count += 1;
    byType[x.type].credit += x.credit;
  });
  return {
    header: table[0],
    records,
    totalCredit: records.reduce((s, x) => s + x.credit, 0),
    byType,
  };
}

/** 学分查询总报告 */
export async function buildCredits(): Promise<CreditsReport> {
  // 模块分布与达标对照直接复用毕业进度的计算（同一数据源、同一判定，两页数字保持一致）
  const [grad, studyCompletion, innovation] = await Promise.all([
    buildGraduation(),
    fetchStudyCompletion(),
    fetchInnovationCredit(),
  ]);
  const planStats: PlanStats = {
    source: grad.source,
    total: grad.summary.planCount,
    totalRequiredCredit: grad.summary.totalRequiredCredit,
    modules: grad.groups,
  };
  const totalEarned = studyCompletion.nonGroup.earnedCredit + studyCompletion.electives.earnedCredit;
  const planCredit = grad.summary.totalRequiredCredit;
  const gap = planCredit != null ? totalEarned - planCredit : null;
  return { planStats, studyCompletion, innovation, summary: { totalEarned, planCredit, gap } };
}
