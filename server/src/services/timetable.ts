import { postForm } from '../core/http.js';
import { JXSD_BASE } from '../core/config.js';

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
  items: TimetableItem[];
}

export const DAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 教师/职称特征词：用于无 font 语义时按行序兜底识别教师 */
const TEACHER_RE = /(教授|副教授|助教|讲师|未评级|副高级|高级|中级|初级)/;

/** 节次行标记，如 [01-02]节（与周次/教室无关，识别后排除） */
const SECTION_MARK_RE = /^\[?\d{2}-\d{2}\]?\s*节$/;

/** 提取 font title 语义字段：<font title='老师'>…</font> 等 */
function pickFont(raw: string, label: string): string | undefined {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = raw.match(new RegExp(`<font\\s+title=['"]${esc}['"][^>]*>([\\s\\S]*?)</font>`, 'i'));
  const v = m?.[1]?.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
  return v || undefined;
}

/**
 * 解析单元格内的一个课程块（多个课程由 ----------------- 分隔）。
 * 新正方渲染的格子含两种 div：可见的 class="kbcontent1"（课程/周次/教室）与
 * 隐藏的 class="kbcontent"（另含教师行和 [01-02]节 标记），字段以 <font title='…'> 语义标注。
 * 优先按 title 语义提取，无语义（旧版页面）时按行序兜底。
 */
function parseBlock(rawBlock: string): TimetableItem | null {
  const teacher = pickFont(rawBlock, '老师');
  const weeks = pickFont(rawBlock, '周次(节次)') ?? pickFont(rawBlock, '周次');
  const room = pickFont(rawBlock, '教室');

  // 课程名 = 去标签后首个非空行（块可能以 <br> 开头）
  const lines = rawBlock
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const name = lines[0] || '';
  if (!name) return null;

  // 无 font 语义时按行序兜底（可见 div 的行序：课程/周次/教室；隐藏 div：课程/教师/周次/[01-02]节/教室）
  let t = teacher;
  let w = weeks;
  let r = room;
  if (!t && !w && !r) {
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (SECTION_MARK_RE.test(l)) continue;
      if (TEACHER_RE.test(l) && !/周|室|楼|馆|房|中心|实验室|机房/.test(l)) {
        if (!t) t = l;
      } else if (!w && /(\(周\)|周\)|周$|\d+-\d+|\d+周)/.test(l) && !/室|楼|馆|房|中心|实验室/.test(l)) {
        w = l;
      } else if (!r && /室|楼|馆|房|中心|实验室|机房|\d/.test(l)) {
        r = l;
      }
    }
  }

  return {
    name,
    teacher: t || undefined,
    weeks: w || undefined,
    room: r || undefined,
    rawText: [name, t, w, r].filter(Boolean).join(' / '),
  };
}

/** 解析单元格 HTML → 课程块列表：优先取隐藏完整版 kbcontent（含教师），其次可见版 kbcontent1 */
function parseCell(rawCell: string): TimetableItem[] {
  const divs: { rich: boolean; raw: string }[] = [];
  const divRe = /<div[^>]*class="kbcontent(1)?"[^>]*>([\s\S]*?)<\/div>/g;
  let dm: RegExpExecArray | null;
  while ((dm = divRe.exec(rawCell))) {
    divs.push({ rich: dm[1] !== '1', raw: dm[2] });
  }
  if (divs.length === 0) return [];

  const blocks = (raw: string) =>
    raw
      .split(/-{8,}/)
      .map((b) => b.trim())
      .filter((b) => {
        const t = b
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return t.length > 0;
      });
  // 完整版（隐藏 div）块数通常与可见版一致，优先取能解析出教师的那份
  const richDiv = divs.find((d) => d.rich && blocks(d.raw).length > 0);
  const source = richDiv ?? divs[0];
  return blocks(source.raw)
    .map((b) => parseBlock(b))
    .filter((x): x is TimetableItem => x !== null);
}

/**
 * 拉取学生课表
 * 接口：POST /jsxsd/xskb/xskb_list.do?Ves632DSdyV=NEW_XSD_PYGL
 * 返回服务端渲染 HTML：行=节次(0102~1112)，列=星期(1-7)，格子 ID {UUID}-{星期}-{序号}
 */
export async function fetchTimetable(term: string): Promise<TimetableEntry[]> {
  const r = await postForm(
    `${JXSD_BASE}/xskb/xskb_list.do?Ves632DSdyV=NEW_XSD_PYGL`,
    { zc: '', xnxq01id: term, demo: '', sfFD: '1' },
    `${JXSD_BASE}/xskb/xskb_list.do?Ves632DSdyV=NEW_XSD_PYGL`,
  );
  const html = String(r.data);
  const courses: TimetableEntry[] = [];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const rowHtml = m[1];
    const sectionM = rowHtml.match(/^\s*<th[^>]*>\s*(\d{2,4})节?/);
    if (!sectionM) continue;
    const section = sectionM[1];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowHtml))) {
      const cell = cm[1];
      const idM = cell.match(/id="([0-9A-F]+)-(\d)-\d"/);
      if (!idM) continue;

      // 支持 kbcontent 和 kbcontent1 两种 div 类名；多门课/分周次块由 parseCell 内部按 ---------- 拆分
      const items = parseCell(cell);
      if (items.length === 0) continue;

      const dayNum = +idM[2]; // 1 ~ 7
      let secStart = 1;
      let secEnd = 2;
      if (section.length === 4) {
        secStart = parseInt(section.slice(0, 2), 10);
        secEnd = parseInt(section.slice(2, 4), 10);
      } else if (section.length === 2) {
        secStart = parseInt(section, 10);
        secEnd = secStart;
      }

      courses.push({
        day: DAY_NAMES[dayNum] || `周${dayNum}`,
        dayNum,
        section: `${section.slice(0, 2)}-${section.slice(2)}节`,
        sectionStart: secStart,
        sectionEnd: secEnd,
        detail: items.map((i) => i.rawText),
        items,
      });
    }
  }
  return courses;
}
