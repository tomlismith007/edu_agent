export interface TimetableItem {
  name: string;
  teacher?: string;
  weeks?: string;
  room?: string;
  rawText: string;
}

export interface TimetableEntry {
  day: string;
  dayNum: number;
  section: string;
  sectionStart: number;
  sectionEnd: number;
  detail: string[];
  items?: TimetableItem[];
}

export const DAYS = [
  { num: 1, label: '周一' },
  { num: 2, label: '周二' },
  { num: 3, label: '周三' },
  { num: 4, label: '周四' },
  { num: 5, label: '周五' },
  { num: 6, label: '周六' },
  { num: 7, label: '周日' },
];

export const TIME_SLOTS = [
  { start: 1, end: 2, label: '01-02 节', time: '08:00 - 09:35', period: '上午' },
  { start: 3, end: 4, label: '03-04 节', time: '10:05 - 11:40', period: '上午' },
  { start: 5, end: 6, label: '05-06 节', time: '14:00 - 15:35', period: '下午' },
  { start: 7, end: 8, label: '07-08 节', time: '15:55 - 17:30', period: '下午' },
  { start: 9, end: 10, label: '09-10 节', time: '19:00 - 20:35', period: '晚上' },
  { start: 11, end: 12, label: '11-12 节', time: '20:45 - 22:10', period: '晚上' },
];

export const COLOR_PALETTES = [
  {
    bg: 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-900 dark:text-blue-200 border-blue-300/60 dark:border-blue-700/50 hover:bg-blue-500/20',
    badge: 'bg-blue-500/15 text-blue-800 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border-emerald-300/60 dark:border-emerald-700/50 hover:bg-emerald-500/20',
    badge: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    bg: 'bg-violet-500/10 dark:bg-violet-500/20 text-violet-900 dark:text-violet-200 border-violet-300/60 dark:border-violet-700/50 hover:bg-violet-500/20',
    badge: 'bg-violet-500/15 text-violet-800 dark:text-violet-300',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  {
    bg: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-300/60 dark:border-amber-700/50 hover:bg-amber-500/20',
    badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  {
    bg: 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-900 dark:text-rose-200 border-rose-300/60 dark:border-rose-700/50 hover:bg-rose-500/20',
    badge: 'bg-rose-500/15 text-rose-800 dark:text-rose-300',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  {
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 border-indigo-300/60 dark:border-indigo-700/50 hover:bg-indigo-500/20',
    badge: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    bg: 'bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-900 dark:text-cyan-200 border-cyan-300/60 dark:border-cyan-700/50 hover:bg-cyan-500/20',
    badge: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300',
    icon: 'text-cyan-600 dark:text-cyan-400',
  },
];

export function getCourseColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTES.length;
  return COLOR_PALETTES[index];
}

/** 检查某门课的周次字符串 (例如 1-16(周), 1-8,10-15(周), 18(周), 1-8(单)) 是否包含目标周次 */
export function isCourseInWeek(weeksStr: string | undefined, targetWeek: number | 'all') {
  if (targetWeek === 'all' || !weeksStr) return true;
  // 同时兼容 "1-16周" 单段、单周 "18周"、逗号多段 "1-8,10-15(周)"
  const ranges = Array.from(weeksStr.matchAll(/(\d+)(?:-(\d+))?/g));
  if (ranges.length > 0) {
    for (const m of ranges) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : start;
      if (targetWeek >= start && targetWeek <= end) {
        if (weeksStr.includes('单')) return targetWeek % 2 !== 0;
        if (weeksStr.includes('双')) return targetWeek % 2 === 0;
        return true;
      }
    }
    return false;
  }
  return true;
}
