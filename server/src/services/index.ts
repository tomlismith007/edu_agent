import { cache, CachedValue } from '../cache/cache.js';
import { config } from '../core/config.js';
import { session } from '../core/session.js';
import * as calendar from './calendar.js';
import * as credits from './credits.js';
import * as graduation from './graduation.js';
import * as scores from './scores.js';
import * as teacher from './teacher.js';
import * as timetable from './timetable.js';

async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  refresh?: boolean,
): Promise<CachedValue<T>> {
  return cache.get(key, ttl, fetcher, { refresh });
}

export { scores, timetable, teacher, calendar, credits, graduation };
export { DEPT_MAP } from './teacher.js';

/** 当前登录用户信息（来自会话） */
export async function getUserInfo() {
  await session.ensureLoggedIn();
  return session.getUser();
}

// ==================== 缓存化访问接口 ====================

export function getScores(term: string, xsfs: string, refresh?: boolean) {
  return withCache(`scores:${term}:${xsfs}`, config.ttl.scores, () => scores.fetchScores(term, xsfs), refresh);
}

export function getTimetable(term: string, refresh?: boolean) {
  return withCache(`timetable:${term}`, config.ttl.timetable, () => timetable.fetchTimetable(term), refresh);
}

export interface TeacherQuery {
  term: string;
  skyx?: string;
  jszc?: string;
  name?: string;
}

export function getTeacherTimetable({ term, skyx, jszc, name }: TeacherQuery, refresh?: boolean) {
  const skyxCode = teacher.resolveDept(skyx);
  const fetch = async () => {
    const all = await teacher.fetchTeacherKb(term, skyxCode, jszc || '');
    if (name) {
      const filtered = all.filter((t) => t.name.includes(name));
      if (!filtered.length) throw new Error(`未找到姓名包含 "${name}" 的教师`);
      return filtered;
    }
    return all;
  };
  return withCache(`teacher:${term}:${skyxCode}:${jszc || ''}`, config.ttl.teacher, fetch, refresh);
}

export function getCalendar(term: string, refresh?: boolean) {
  return withCache(`calendar:${term}`, config.ttl.calendar, () => calendar.fetchCalendarWeeks(term), refresh);
}

/** 获取富化周历（含今日状态与学期起止），供路由与工具层统一使用 */
export async function getCalendarEnriched(term: string, refresh?: boolean) {
  const r = await getCalendar(term, refresh);
  const weeks = r.data;
  return {
    term,
    weeks,
    data: weeks,
    today: calendar.todayInfo(weeks),
    termRange: calendar.termRange(weeks),
    fromCache: r.fromCache,
    cachedAt: r.cachedAt,
  };
}

export function getGraduation(refresh?: boolean) {
  // v3：解析器兼容大写标签原始响应，避免命中 v2 时期的降级缓存
  return withCache('graduation:v3', config.ttl.graduation, () => graduation.buildGraduation(), refresh);
}

export function getCredits(refresh?: boolean) {
  // v4：模块分布改为复用毕业进度计算（含已获学分/状态），两页数据完全一致
  return withCache('credits:v4', config.ttl.credits, () => credits.buildCredits(), refresh);
}
