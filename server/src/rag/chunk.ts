import { RAG } from './config.js';
import type { KbDocument } from './serialize.js';

/**
 * 知识文档切块（rag-spec.md §4.3）：
 * 按 #/##/### 标题分节（section_path 进 metadata），
 * 超过 RAG.chunkSize 的节按段落/句子二切；表格子节天然原子（序列化层保证）。
 */

export type ChunkKind = 'prose' | 'table';

export interface KbChunk {
  id: string;
  text: string;
  metadata: {
    doc_id: string;
    title: string;
    section_path: string;
    grade_year: string;
    major: string;
    kind: ChunkKind;
  };
}

/** 中文以 1 字符 ≈ 1 token 保守估算，仅用于「是否需要二切」的判断 */
export function estimateTokens(text: string): number {
  return text.length;
}

export function chunkDocument(doc: KbDocument): KbChunk[] {
  const lines = doc.markdown.split('\n');
  interface SectionNode {
    headers: [string, string, string];
    lines: string[];
  }
  const nodes: SectionNode[] = [];
  let h1 = '';
  let h2 = '';
  let h3 = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentLines.length && (h1 || h2 || h3)) {
        nodes.push({ headers: [h1, h2, h3], lines: currentLines });
        currentLines = [];
      }
      h1 = line.slice(2).trim();
      h2 = '';
      h3 = '';
      currentLines.push(line);
    } else if (line.startsWith('## ')) {
      if (currentLines.length && (h1 || h2 || h3)) {
        nodes.push({ headers: [h1, h2, h3], lines: currentLines });
        currentLines = [];
      }
      h2 = line.slice(3).trim();
      h3 = '';
      currentLines.push(line);
    } else if (line.startsWith('### ')) {
      if (currentLines.length && (h1 || h2 || h3)) {
        nodes.push({ headers: [h1, h2, h3], lines: currentLines });
        currentLines = [];
      }
      h3 = line.slice(4).trim();
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length && (h1 || h2 || h3)) {
    nodes.push({ headers: [h1, h2, h3], lines: currentLines });
  }

  const out: KbChunk[] = [];
  for (const node of nodes) {
    const text = node.lines.join('\n').trim();
    if (!text) continue;
    const section = node.headers.filter(Boolean).join(' / ');
    const isTable = /(^|\n)\s*\|/.test(text);

    if (isTable || estimateTokens(text) <= RAG.chunkSize) {
      out.push({
        id: `${doc.id}:${out.length}`,
        text,
        metadata: {
          doc_id: doc.id,
          title: doc.title,
          section_path: section || '正文',
          grade_year: doc.meta.gradeYear == null ? '' : String(doc.meta.gradeYear),
          major: doc.meta.major || '',
          kind: isTable ? 'table' : 'prose',
        },
      });
    } else {
      // 超过 chunkSize 的非表格节按段落/句子分块
      const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      let buf = '';
      for (const p of paragraphs) {
        if (!buf) {
          buf = p;
        } else if (estimateTokens(buf) + estimateTokens(p) <= RAG.chunkSize) {
          buf += '\n\n' + p;
        } else {
          out.push({
            id: `${doc.id}:${out.length}`,
            text: buf,
            metadata: {
              doc_id: doc.id,
              title: doc.title,
              section_path: section || '正文',
              grade_year: doc.meta.gradeYear == null ? '' : String(doc.meta.gradeYear),
              major: doc.meta.major || '',
              kind: 'prose',
            },
          });
          buf = p;
        }
      }
      if (buf) {
        out.push({
          id: `${doc.id}:${out.length}`,
          text: buf,
          metadata: {
            doc_id: doc.id,
            title: doc.title,
            section_path: section || '正文',
            grade_year: doc.meta.gradeYear == null ? '' : String(doc.meta.gradeYear),
            major: doc.meta.major || '',
            kind: 'prose',
          },
        });
      }
    }
  }
  return out;
}
