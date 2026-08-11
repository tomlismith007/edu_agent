import { postForm } from '../core/http.js';
import { JXSD_BASE } from '../core/config.js';

const JCS = ['0102', '0304', '0506', '0708', '0910', '1112'];
const DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

export interface TeacherCourse {
  course: string;
  klass: string;
  weeks: string;
  room: string;
}

export interface TeacherCell {
  day: string;
  jc: string;
  courses: TeacherCourse[];
}

export interface TeacherTimetable {
  name: string;
  cells: TeacherCell[];
}

// 院系代码映射（2026-08-10 抓取自 kbxx_teacher 页面下拉）
export const DEPT_MAP: [string, string][] = [
  ['00001', '会计学院'],
  ['00002', '财政金融学院'],
  ['00003', '工商管理学院'],
  ['00005', '计算机与人工智能学院'],
  ['00004', '法学与公共管理学院'],
  ['00006', '外国语学院'],
  ['00012', '工程管理学院'],
  ['000001094', '人文与艺术学院'],
  ['00008', '马克思主义学院'],
  ['00007', '大数据与统计学院'],
  ['00009', '体育学院'],
  ['1027', '学生工作部'],
  ['000001104', '就业创业中心'],
  ['000001095', '厚生国际教育学院'],
  ['UI7FqhEQbw', '经济地理学院'],
  ['xJ13DHkluk', '雷锋学院'],
  ['apdvmMTPEc', '创新创业与人工智能学院'],
  ['n4mAHk1UqI', '继续教育学院'],
  ['uD8iTninc5', '财经大数据研究院'],
];
const DEFAULT_DEPT = '00005';

/** 解析院系参数：接受代码(00005)或名称(计算机与人工智能学院/04)，返回 skyx 代码 */
export function resolveDept(arg: string | undefined): string {
  if (!arg) return DEFAULT_DEPT;
  const t = String(arg).trim();
  if (/^\d{5}$/.test(t)) return t;
  const found = DEPT_MAP.find(([, name]) => name.includes(t) || t.includes(name));
  if (found) return found[0];
  // 1~3 位纯数字不可能是合法 skyx（最短真实代码为 1026/1027 这类 4 位数字），
  // 多为前端把数组索引当下拉 value 的 bug；直接报错，避免透传给教务系统后 404 难以排查
  if (/^\d{1,3}$/.test(t)) {
    throw new Error(`院系参数不合法: "${t}"（应为院系代码如 ${DEFAULT_DEPT}，或院系名称）`);
  }
  return t; // 未知名（含加密代码）透传，由教务系统兜底
}

/** 解析 div.kbcontent1 课程块文本 → {course, klass, weeks, room} */
export function parseCourseBlock(raw: string): TeacherCourse | null {
  const text = String(raw).replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ').replace(/\r/g, '');
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return null;
  const course = lines[0];
  let klass = '';
  let weeks = '';
  let room = '';
  const rest = lines.slice(1);
  // 周次行：独立行 "(1-16周)" 或跟在班级后 "(1-16周)"
  const wkIdx = rest.findIndex((l) => /[（(].*\d+周[)）]/.test(l) && !/教室|机房|实验室|[\d]{3,}[)\s]*$/.test(l));
  const wkMatch = rest.join('\n').match(/[（(]([^（()）]*\d+周[^（()）]*)[)）]/);
  if (wkMatch) weeks = wkMatch[1].trim();
  if (wkIdx >= 0) {
    klass = rest.slice(0, wkIdx).join('、').replace(/\s+$/g, '');
    const roomCands = rest.slice(wkIdx + 1);
    room = roomCands.join('、');
  } else {
    // 无周次标记：最后一行视为教室，其余视为班级
    klass = rest.slice(0, Math.max(0, rest.length - 1)).join('、');
    room = rest[rest.length - 1] || '';
  }
  if (!klass && weeks) klass = rest.find((l) => !weeks.includes(l)) || '';
  return { course, klass: klass.trim(), weeks, room: room.trim() };
}

/** 解析教师课表 HTML：行=教师，列=星期×节次(42 个格子) */
export function parseTeacherKb(html: string): TeacherTimetable[] {
  const teachers: TeacherTimetable[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const rowHtml = m[1];
    const nameMatch = rowHtml.match(/<nobr>\s*([^<\s][^<]*)<\/nobr>/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name || /节次/.test(name)) continue;
    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tdRe.exec(rowHtml))) tds.push(tm[1]);
    if (tds.length < 2) continue;
    const cells: TeacherCell[] = [];
    for (let i = 1; i < tds.length; i++) {
      const day = DAYS[Math.floor((i - 1) / JCS.length)];
      const jc = JCS[(i - 1) % JCS.length];
      const courses: TeacherCourse[] = [];
      const divRe = /<div[^>]*class="kbcontent1"[^>]*>([\s\S]*?)<\/div>/g;
      let dm: RegExpExecArray | null;
      while ((dm = divRe.exec(tds[i]))) {
        const c = parseCourseBlock(dm[1]);
        if (c) courses.push(c);
      }
      if (courses.length) cells.push({ day, jc, courses });
    }
    teachers.push({ name, cells });
  }
  if (!teachers.length) throw new Error('未解析到教师课表数据（检查院系代码是否正确）');
  return teachers;
}

/**
 * 拉取院系教师课表
 * @param term 学年学期，如 2025-2026-2
 * @param skyx 院系代码（如 00005）
 * @param jszc 职称代码（空=全部）
 */
export async function fetchTeacherKb(term: string, skyx: string, jszc = ''): Promise<TeacherTimetable[]> {
  const r = await postForm(
    `${JXSD_BASE}/kbcx/kbxx_teacher_ifr`,
    { xnxqh: term, skyx, jszc, zc1: '', zc2: '', jc1: '', jc2: '' },
    `${JXSD_BASE}/kbcx/kbxx_teacher`,
  );
  if (r.status !== 200) throw new Error(`教师课表接口返回 HTTP ${r.status}`);
  return parseTeacherKb(String(r.data));
}
