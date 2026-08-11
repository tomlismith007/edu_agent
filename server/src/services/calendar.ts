import { getJ, postForm } from '../core/http.js';
import { JXSD_BASE } from '../core/config.js';
import { parseRows } from '../core/html.js';

export interface CalendarWeek {
  week: number;
  /** 周一~周日，YYYY-MM-DD */
  dates: string[];
  note: string;
}

const fmtFull = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 解析周历中"MM月DD日"格式日期 → Date，年份从学期推断（下半年→学年第一部分，上半年→第二部分） */
function parseDate(text: string, term: string): Date | null {
  const md = text.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (!md) return null;
  const [, month, day] = md;
  const yearA = parseInt(term.slice(0, 4), 10);
  const yearB = yearA + 1;
  const year = parseInt(month, 10) >= 9 ? yearA : yearB;
  return new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
}

/** 根据每行周六(完整日期)反推整周周一~周日 */
function buildWeekDates(cells: string[], term: string): Date[] | null {
  const saturday = parseDate(cells[6], term);
  if (!saturday) return null;
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(saturday);
    d.setDate(d.getDate() - 5 + i);
    days.push(d);
  }
  return days;
}

/** 校验某周推算结果与页面周一~周五数字列一致（跨月容错，页面为两位补零格式） */
function verifyWeek(cells: string[], days: Date[]): boolean {
  for (let i = 1; i <= 5; i++) {
    if (String(days[i - 1].getDate()).padStart(2, '0') !== cells[i]) return false;
  }
  return true;
}

/**
 * 拉取教学周历并推算每周日期
 * 接口：POST /jsxsd/jxzl/jxzl_query?Ves632DSdyV=NEW_XSD_WDZM
 */
export async function fetchCalendarWeeks(term: string): Promise<CalendarWeek[]> {
  const r = await postForm(
    `${JXSD_BASE}/jxzl/jxzl_query?Ves632DSdyV=NEW_XSD_WDZM`,
    { xnxq01id: term },
    `${JXSD_BASE}/jxzl/jxzl_query?Ves632DSdyV=NEW_XSD_WDZM`,
  );
  const html = String(r.data);
  const rawRows = parseRows(html, 8, true);
  if (!rawRows.length) throw new Error(`未解析到教学周历数据 (${term})`);
  const rawWeeks = rawRows.map((cells) => ({
    week: parseInt(cells[0], 10),
    cells,
    note: cells[8] || '',
  }));

  const weeks: CalendarWeek[] = [];
  for (const w of rawWeeks) {
    const days = buildWeekDates(w.cells, term);
    if (!days || !verifyWeek(w.cells, days)) continue;
    weeks.push({ week: w.week, dates: days.map(fmtFull), note: w.note });
  }
  if (!weeks.length) throw new Error('周历解析失败');
  return weeks;
}

/** 返回某日期所在周（含学期首尾判定） */
export function findTodayWeek(weeks: CalendarWeek[], today: Date = new Date()): CalendarWeek | null {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  for (const w of weeks) {
    const s = new Date(`${w.dates[0]}T00:00:00`);
    const e = new Date(`${w.dates[6]}T00:00:00`);
    if (t >= s && t <= e) return w;
  }
  return null;
}

export interface TodayInfo {
  date: string;
  weekday: string;
  inTerm: boolean;
  week: number | null;
  weekRange: [string, string] | null;
  progress: number | null;
  remaining: number | null;
  note: string;
}

export function todayInfo(weeks: CalendarWeek[], today: Date = new Date()): TodayInfo {
  const base: TodayInfo = {
    date: fmtFull(today),
    weekday: '周' + '一二三四五六日'[today.getDay() === 0 ? 6 : today.getDay() - 1],
    inTerm: false,
    week: null,
    weekRange: null,
    progress: null,
    remaining: null,
    note: '',
  };
  const w = findTodayWeek(weeks, today);
  if (!w) return base;
  return {
    ...base,
    inTerm: true,
    week: w.week,
    weekRange: [w.dates[0], w.dates[6]],
    progress: (w.week / weeks.length) * 100,
    remaining: weeks.length - w.week,
    note: w.note,
  };
}

export function termRange(weeks: CalendarWeek[]): { start: string; end: string } {
  return { start: weeks[0].dates[0], end: weeks[weeks.length - 1].dates[6] };
}
