import { getJ, postForm } from '../core/http.js';
import { JXSD_BASE } from '../core/config.js';
import { parseRows } from '../core/html.js';

export interface Course {
  term: string;
  code: string;
  name: string;
  grade: string;
  credit: number;
  hours: string;
  point: string;
  method: string;
  attr: string;
  nature: string;
}

import { gradeToScore } from './grade.js';

export interface WeightedStats {
  count: number;
  scoredCount: number;
  creditSum: number;
  weightAvg: number;
  avg: number;
  max: number;
  min: number;
  passedCredit: number;
  failed: Course[];
}

/** 计算加权平均分与统计（成绩>=60 或等级非不及格视为通过） */
export function weightedStats(courses: Course[]): WeightedStats {
  let weightSum = 0;
  let creditSum = 0;
  let passed = 0;
  const failed: Course[] = [];
  const scored: number[] = [];
  for (const c of courses) {
    const s = gradeToScore(c.grade);
    if (s == null || !c.credit) continue;
    scored.push(s);
    weightSum += s * c.credit;
    creditSum += c.credit;
    if (s >= 60) passed += c.credit;
    else failed.push(c);
  }
  return {
    count: courses.length,
    scoredCount: scored.length,
    creditSum,
    weightAvg: creditSum ? weightSum / creditSum : 0,
    avg: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0,
    max: scored.length ? Math.max(...scored) : 0,
    min: scored.length ? Math.min(...scored) : 0,
    passedCredit: passed,
    failed,
  };
}

/**
 * 拉取成绩列表（全部学期可传空）
 * @param term 学年学期，如 2025-2026-2；空=全部
 * @param xsfs all=全部成绩 best=最好成绩
 */
export async function fetchScores(term = '', xsfs = 'all'): Promise<Course[]> {
  const r = await postForm(
    `${JXSD_BASE}/kscj/cjcx_list`,
    { kksj: term, kcxz: '', kcmc: '', xsfs },
    `${JXSD_BASE}/kscj/cjcx_query?Ves632DSdyV=NEW_XSD_XJCJ`,
  );
  const html = String(r.data);
  const rows = parseRows(html, 11, true);
  return rows.map((c) => ({
    term: c[1],
    code: c[2],
    name: c[3],
    grade: c[4],
    credit: parseFloat(c[5]) || 0,
    hours: c[6],
    point: c[7],
    method: c[8],
    attr: c[9],
    nature: c[10],
  }));
}
