/**
 * 成绩 → 数值分 换算（前端权威定义，须与 server/src/services/grade.ts 保持一致）
 *
 * 务必包含 优秀/良好/中等/合格 全量映射：此前前端漏了这四项，导致成绩为
 * 「优秀」时 gradeToScore 返回 null 被排除出加权均分，与后端 Chat 给出的
 * 平均分不一致。
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
