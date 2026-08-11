/** 通用 HTML 表格/文本解析工具（强智教务系统服务端渲染页面） */

export function cleanCell(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 解析页面中所有行，返回二维数组；seqCheck=true 时要求首列为纯数字序号 */
export function parseRows(html: string, minCols: number, seqCheck?: boolean): string[][] {
  const rows: string[][] = [];
  // 大小写不敏感：Word 导出的富文本页面（如培养方案明细）原始响应使用大写标签 <TD>/<TR>
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const cells: string[] = [];
    const cRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cRe.exec(m[1]))) cells.push(cleanCell(cm[1]));
    if (cells.length >= minCols && (!seqCheck || /^\d+$/.test(cells[0]))) rows.push(cells);
  }
  return rows;
}

/** 提取 HTML 中所有表格，返回 [table][row][cell] 三维数组 */
export function parseTablesIn(html: string): string[][][] {
  const tables: string[][][] = [];
  const tRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tRe.exec(html))) {
    const rows: string[][] = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tm[1]))) {
      const cells: string[] = [];
      const cRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = cRe.exec(rm[1]))) cells.push(cleanCell(cm[1]));
      if (cells.length && cells.some((c) => c)) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}
