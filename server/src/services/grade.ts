/**
 * 成绩 → 数值分 换算（权威定义，服务端单一来源）
 *
 * 注意：前端 web/src/lib/grade.ts 必须与此保持一致（含 优秀/良好/中等/合格）。
 * 若调整映射，请同步两处，否则 Chat（后端统计）与 Dashboard（前端统计）会给出
 * 不一致的加权平均分。
 */
export const GRADE_MAP: Record<string, number> = {
  优: 95,
  良: 85,
  中: 75,
  及格: 65,
  不及格: 55,
  优秀: 95,
  良好: 85,
  中等: 75,
  合格: 75,
};

/** 成绩转数值分：数字直接用，等级按 GRADE_MAP 换算，空/异常返回 null */
export function gradeToScore(grade: string | undefined | null): number | null {
  if (!grade) return null;
  const g = String(grade).trim();
  if (/^\d+(\.\d+)?$/.test(g)) return parseFloat(g);
  return GRADE_MAP[g] ?? null;
}
