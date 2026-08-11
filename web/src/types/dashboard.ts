// Dashboard 各业务页面的数据契约（与 server/src/services/* 返回结构对齐）。

export interface ScoreItem {
  term: string;
  code: string;
  name: string;
  grade: string;
  credit: number;
  method: string;
  attr: string;
  nature: string;
}

export interface TeacherCourse {
  course: string;
  klass: string;
  weeks: string;
  room: string;
}

export interface TeacherTimetable {
  name: string;
  cells: { day: string; jc: string; courses: TeacherCourse[] }[];
}

export interface CalendarWeek {
  week: number;
  dates: string[];
  note: string;
}

export interface CalendarToday {
  inTerm: boolean;
  week: number | null;
  weekRange: [string, string] | null;
  progress: number | null;
  remaining: number | null;
  note: string;
  date: string;
  weekday: string;
}

export interface GradGroupStat {
  key: string;
  name: string;
  categories: string;
  rule: 'all' | 'credits';
  ruleText: string;
  requiredCredit: number;
  poolCredit: number;
  poolCount: number;
  doneCount: number;
  doneCredit: number;
  ok: boolean;
}

export interface GraduationData {
  source: 'detail' | 'plan';
  gradeYear: number | null;
  summary: {
    totalRequiredCredit: number;
    totalEarnedCredit: number;
    earnedPct: number;
    conclusion: string | null;
    ok: boolean;
    planCount: number;
    doneCount: number;
    missCount: number;
  };
  groups: GradGroupStat[];
  requirements: { category: string; nature: string; credit: number }[];
  mustMiss: { term: string; code: string; name: string; credit: number; system: string; category: string }[];
  zeroMiss: { term: string; code: string; name: string }[];
  publicElectives: { term: string; code: string; name: string; credit: number; grade: string; earned: boolean }[];
}

export interface CreditsData {
  planStats?: {
    source: 'detail' | 'plan';
    total: number;
    totalRequiredCredit: number;
    /** 与毕业进度页同源同构的模块达标对照 */
    modules: GradGroupStat[];
  };
  studyCompletion?: {
    conclusion: string;
  };
  innovation?: {
    totalCredit: number;
    byType: Record<string, { count: number; credit: number }>;
    records: {
      term: string;
      code: string;
      name: string;
      credit: number;
      type: string;
      note: string;
    }[];
  };
  summary: {
    totalEarned: number;
    planCredit: number | null;
    gap: number | null;
  };
}

export interface UserInfo {
  name: string;
  studentId: string;
}
