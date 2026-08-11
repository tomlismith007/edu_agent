import { htmlToCleanText, dedupeBlocks } from './clean.js';
import type { DetailCourse, ReqRow } from '../services/graduation.js';

/**
 * 结构化培养方案 → 分节 Markdown 知识文档（rag-spec.md §4.2）。
 * 序列化逻辑源自 test/fixtures/gen-plan-md.ts（离线存档生成器），提升为运行时模块。
 * 表格原子化：课程设置总表按「体系」拆为子表，每张子表整体一个 chunk。
 */

export interface KbDocument {
  id: string;
  title: string;
  markdown: string;
  meta: { gradeYear: number | null; major: string };
}

const H3_HEADINGS = [
  '一、专业简介',
  '二、培养目标',
  '三、培养要求',
  '四、毕业合格标准及学分要求',
  '五、学制与学位',
  '六、专业核心课程',
];

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

/** 从页面标题提取年级与专业名（如「2022级数据科学与大数据技术专业人才培养方案」） */
function extractGradeMajor(html: string): { gradeYear: number | null; major: string } {
  const m = html.match(/(\d{4})级\s*([^\s<（）()]{2,30}?)专业/);
  if (m) return { gradeYear: Number(m[1]), major: m[2].trim() };
  return { gradeYear: null, major: '未知专业' };
}

/** 正文段落区：培养目标起、课程设置总表前；剔除学分分配表的文字形态（改用结构化表格） */
function proseOf(html: string): string {
  const full = htmlToCleanText(html);
  const start = full.indexOf('一、培养目标');
  const end = full.indexOf('三、课程设置总表');
  let prose = full.slice(start > 0 ? start : 0, end > 0 ? end : undefined);
  const cutA = prose.indexOf('理论课程学分分配表');
  const cutB = prose.indexOf('总学分：');
  if (cutA > 0 && cutB > cutA) prose = prose.slice(0, cutA) + prose.slice(cutB);
  return prose
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t === '一、培养目标' || t === '二、详细说明') return `## ${t}`;
      if (H3_HEADINGS.includes(t)) return `### ${t}`;
      return line;
    })
    .join('\n');
}

export function buildPlanDocument(
  detailHtml: string,
  detail: { courses: DetailCourse[]; reqs: ReqRow[]; gradeYear: number | null },
): KbDocument {
  const { courses, reqs, gradeYear } = detail;
  const page = extractGradeMajor(detailHtml);
  const major = page.major;
  const year = gradeYear ?? page.gradeYear;
  const id = `plan-${year ?? '未知'}-${major}`;
  const title = `《培养方案》${year ? `${year}级` : ''}${major}`;

  const parts: string[] = [`# ${title}`];

  const prose = dedupeBlocks(proseOf(detailHtml));
  if (prose.trim()) parts.push(prose);

  // 学分分配表（官方毕业要求）——整表一个 chunk（合计行置于表格前，保证表格块以表格行结尾）
  if (reqs.length) {
    const total = reqs.reduce((s, r) => s + r.credit, 0);
    parts.push(
      [
        '## 学分分配表（毕业要求）',
        `各模块要求学分合计：${total} 学分。`,
        mdTable(['课程类别', '课程性质', '要求学分'], reqs.map((r) => [r.category, r.nature, String(r.credit)])),
      ].join('\n'),
    );
  }

  // 课程设置总表按体系拆子表：每张子表原子化，保证「某模块有哪些课」整表召回
  const systems = [...new Set(courses.map((c) => c.system))].filter(Boolean);
  if (systems.length) {
    parts.push('## 课程设置总表');
    for (const system of systems) {
      const items = courses.filter((c) => c.system === system);
      const credit = items.reduce((s, c) => s + c.credit, 0);
      parts.push(
        [
          `### 课程设置·${system}（${items.length}门 ${credit}学分）`,
          mdTable(
            ['课程编号', '课程名称', '类别', '学分', '开设学期'],
            items.map((c) => [c.code, c.name, c.category, String(c.credit), c.term || String(c.semester || '')]),
          ),
        ].join('\n'),
      );
    }
  }

  return { id, title, markdown: parts.join('\n\n'), meta: { gradeYear: year, major } };
}
