/**
 * HTML → 清洗后纯文本（强智教务页面 → RAG 语料的预处理，契约见 rag-spec.md §4.1）。
 * 纯函数，可离线单测。
 */

/** HTML 转带段落结构的纯文本：script/style/注释剔除，<p> 视为段落、<br> 视为换行、表格单元格用 tab 分隔 */
export function htmlToCleanText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** 段落规范化键：去所有空白与全半角差异，用于近重复判定 */
function normKey(block: string): string {
  return block
    .replace(/\s+/g, '')
    .replace(/[（(]/g, '')
    .replace(/[）)]/g, '')
    .replace(/[，,]/g, '')
    .replace(/[。\.]/g, '');
}

/**
 * 近重复段落去重：教务页面常把同一内容渲染两遍（如「培养目标」正文 + 明细区重复）。
 * 以规范化键去重，保留首次出现；短行（< 30 字符，多为标题/数字行）不去重以免误伤表格行。
 */
export function dedupeBlocks(text: string): string {
  const blocks = text.split(/\n{2,}/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    const trimmed = b.trim();
    if (!trimmed) continue;
    if (trimmed.length >= 30) {
      const key = normKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(trimmed);
  }
  return out.join('\n\n');
}

/** 按行切出包含给定标记的行号（调试用） */
export function findLine(text: string, marker: string): number {
  return text.split('\n').findIndex((l) => l.includes(marker));
}
