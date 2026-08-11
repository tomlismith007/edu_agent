import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { config } from '../core/config.js';
import { retrieve } from '../rag/retrieve.js';
import {
  getCalendarEnriched,
  getCredits,
  getGraduation,
  getScores,
  getTeacherTimetable,
  getTimetable,
  getUserInfo,
} from '../services/index.js';

/** 学期格式强约束：YYYY-YYYY-1 或 YYYY-YYYY-2 */
const termSchema = z
  .string()
  .regex(/^\d{4}-\d{4}-[12]$/, '学期格式形如 2025-2026-2')
  .optional();

/** 成绩查询 */
export const scoresTool = tool(
  async ({ term, xsfs, refresh }) => {
    const r = await getScores(term || '', xsfs || 'all', refresh);
    return JSON.stringify({ ...r.data, fromCache: r.fromCache, cachedAt: r.cachedAt });
  },
  {
    name: 'get_scores',
    description:
      '查询学生成绩明细与统计。term 形如 "2025-2026-2"（留空查询全部学期）；xsfs 为 all(全部成绩) 或 best(最好成绩)。' +
      '返回课程列表(学期/课程名/成绩/学分/性质)及统计(加权平均分/算术平均分/最高最低分/挂科清单)。' +
      '数据默认缓存24小时，refresh=true 可强制重新抓取。',
    schema: z.object({
      term: termSchema.describe('学年学期，如 2025-2026-2，不填为全部学期'),
      xsfs: z.enum(['all', 'best']).optional().describe('all=全部成绩，best=最好成绩'),
      refresh: z.boolean().optional().describe('是否强制刷新缓存'),
    }),
  },
);

/** 学生课表 */
export const timetableTool = tool(
  async ({ term, refresh }) => {
    const t = term || config.currentTerm;
    const r = await getTimetable(t, refresh);
    return JSON.stringify({ term: t, courses: r.data, fromCache: r.fromCache, cachedAt: r.cachedAt });
  },
  {
    name: 'get_timetable',
    description:
      '查询本人(学生)课表。term 形如 "2025-2026-2"，默认当前学期。返回课程(星期/节次/课程名/班级/周次/教室)。' +
      '数据默认缓存6小时，refresh=true 可强制重新抓取。',
    schema: z.object({
      term: termSchema.describe('学年学期，如 2025-2026-2'),
      refresh: z.boolean().optional().describe('是否强制刷新缓存'),
    }),
  },
);

/** 教师课表 */
export const teacherTimetableTool = tool(
  async ({ term, dept, name, jszc, refresh }) => {
    const r = await getTeacherTimetable({ term: term || config.currentTerm, skyx: dept, name, jszc }, refresh);
    return JSON.stringify({ term: term || config.currentTerm, teachers: r.data, fromCache: r.fromCache, cachedAt: r.cachedAt });
  },
  {
    name: 'get_teacher_timetable',
    description:
      '查询院系教师课表。term 形如 "2025-2026-2"；dept 传院系名称(如 计算机与人工智能学院)或代码；' +
      'name 传教师姓名关键词过滤；jszc 为职称代码(可选)。返回每位教师的周课表明细(星期/节次/课程/班级/周次/教室)。' +
      '数据默认缓存6小时，refresh=true 可强制重新抓取。',
    schema: z.object({
      term: termSchema.describe('学年学期，如 2025-2026-2'),
      dept: z.string().optional().describe('院系名称或代码，默认计算机与人工智能学院'),
      name: z.string().optional().describe('教师姓名关键词，用于过滤'),
      jszc: z.string().optional().describe('职称代码，如 011(教授) 012(副教授) 013(讲师)'),
      refresh: z.boolean().optional().describe('是否强制刷新缓存'),
    }),
  },
);

/** 教学周历 */
export const calendarTool = tool(
  async ({ term, refresh }) => {
    const t = term || config.currentTerm;
    const r = await getCalendarEnriched(t, refresh);
    return JSON.stringify({
      term: t,
      weeks: r.weeks,
      today: r.today,
      termRange: r.termRange,
      fromCache: r.fromCache,
      cachedAt: r.cachedAt,
    });
  },
  {
    name: 'get_calendar',
    description:
      '查询教学周历(校历)。term 形如 "2025-2026-2"。返回每教学周的日期范围(周一~周日)与备注，' +
      '以及"今天"对应的周次、学期进度、剩余周数。可用于回答"今天是第几周/学期还剩几周"。' +
      '数据默认缓存1小时，refresh=true 可强制重新抓取。',
    schema: z.object({
      term: termSchema.describe('学年学期，如 2025-2026-2'),
      refresh: z.boolean().optional().describe('是否强制刷新缓存'),
    }),
  },
);

/** 毕业进度 */
export const graduationTool = tool(
  async ({ refresh }) => {
    const r = await getGraduation(refresh);
    const g = r.data;
    return JSON.stringify({
      summary: g.summary,
      groups: g.groups,
      requirements: g.requirements,
      mustMiss: g.mustMiss,
      zeroMiss: g.zeroMiss,
      publicElectives: g.publicElectives,
      nameOnly: g.nameOnly,
      fromCache: r.fromCache,
      cachedAt: r.cachedAt,
    });
  },
  {
    name: 'get_graduation_progress',
    description:
      '查询毕业进度（按培养方案"毕业合格标准及学分要求"官方口径）：各课程模块要求学分 vs 已获学分。' +
      '必修类模块（思政/通识必修/公共基础/学科基础/专业必修/集中实践）须全部修完；' +
      '专业课选修=限选+任选合并修满20学分；通识教育选修（公选课）修满10学分；总学分161.5。' +
      '附教务系统毕业结论、全部修完类模块的未修清单、公选课修读明细。数据默认缓存24小时，refresh=true 强制重抓。',
    schema: z.object({
      refresh: z.boolean().optional().describe('是否强制刷新缓存'),
    }),
  },
);

/** 学分查询 */
export const creditsTool = tool(
  async ({ refresh }) => {
    const r = await getCredits(refresh);
    const c = r.data;
    return JSON.stringify({
      totalRequiredCredit: c.planStats.totalRequiredCredit,
      planStats: c.planStats,
      summary: c.summary,
      conclusion: c.studyCompletion.conclusion,
      innovationTotal: c.innovation.totalCredit,
      innovationByType: c.innovation.byType,
      fromCache: r.fromCache,
      cachedAt: r.cachedAt,
    });
  },
  {
    name: 'get_credits',
    description:
      '查询学分情况：培养方案总学分(161.5)与理论/实践学分分配表、按官方"毕业合格标准"模块的学分分布' +
      '(必修类模块要求学分/池学分/门数；专业选修=限选+任选修满20学分；公选课修满10学分)、' +
      '个人修读情况汇总(已获学分/非选课组/公共选修课/毕业结论)、创新学分。可回答"我还差多少学分毕业/已修多少学分"。' +
      '数据默认缓存24小时，refresh=true 可强制重新抓取。',
    schema: z.object({
      refresh: z.boolean().optional().describe('是否强制刷新缓存'),
    }),
  },
);

/** 用户信息 */
export const userInfoTool = tool(
  async () => JSON.stringify(await getUserInfo()),
  {
    name: 'get_user_info',
    description: '获取当前登录学生的姓名与学号。',
    schema: z.object({}),
  },
);

/** 校内知识库检索（培养方案/规章制度等静态知识） */
export const knowledgeTool = tool(
  async ({ query }) => {
    const hits = await retrieve(query);
    if (!hits.length) {
      return JSON.stringify({ hits: [], note: '知识库未命中。涉及学校规定的问题请如实告知用户暂无资料，不要编造。' });
    }
    return JSON.stringify({
      hits: hits.map((h) => ({ 章节: h.section, 原文: h.text, 来源: h.source })),
    });
  },
  {
    name: 'search_school_knowledge',
    description:
      '检索校内知识库（培养方案、毕业要求、学分规定、课程体系、学籍制度等静态规章原文）。' +
      '当用户询问学校规定、专业培养方案、某模块要修多少学分、有哪些课程、学制学位等问题时调用；' +
      '学生个人数据（我的成绩/我的课表/我的学分进度）不要用本工具，改用对应的数据查询工具。' +
      '回答时引用原文并注明章节来源。',
    schema: z.object({
      query: z.string().describe('检索关键词短语，如「专业选修课 学分要求」「课程设置 思想政治课」'),
    }),
  },
);

export const allTools = [
  scoresTool,
  timetableTool,
  teacherTimetableTool,
  calendarTool,
  graduationTool,
  creditsTool,
  userInfoTool,
  knowledgeTool,
];
