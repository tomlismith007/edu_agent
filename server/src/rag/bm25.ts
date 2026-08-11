/**
 * BM25-lite 稀疏检索（rag-spec.md §5）：语料规模小（<100 chunk），内存直算。
 * 分词：CJK 字符 2-gram（保留单字串），ASCII 按词。纯函数 + 可离线单测。
 */

export interface Bm25Doc {
  id: string;
  text: string;
}

export function tokenize(text: string): string[] {
  const t = text.toLowerCase();
  const tokens: string[] = [];
  for (const m of t.matchAll(/[a-z0-9][a-z0-9\-_.]*/g)) tokens.push(m[0]);
  const cjkRuns = t.replace(/[^\u4e00-\u9fff]+/g, ' ').trim();
  for (const run of cjkRuns.split(/\s+/)) {
    if (!run) continue;
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  return tokens;
}

const K1 = 1.5;
const B = 0.75;

export class BM25Index {
  private docs: Bm25Doc[];
  private tf: Map<string, number>[] = [];
  private docLen: number[] = [];
  private df = new Map<string, number>();
  private avgLen: number;

  constructor(docs: Bm25Doc[]) {
    this.docs = docs;
    let total = 0;
    for (const d of docs) {
      const terms = tokenize(d.text);
      const freq = new Map<string, number>();
      for (const t of terms) freq.set(t, (freq.get(t) ?? 0) + 1);
      this.tf.push(freq);
      this.docLen.push(terms.length);
      total += terms.length;
      for (const term of freq.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
    this.avgLen = docs.length ? total / docs.length : 0;
  }

  /** BM25 分数降序取前 topK（0 分不返回） */
  search(query: string, topK: number): { id: string; score: number }[] {
    const qTerms = [...new Set(tokenize(query))];
    const N = this.docs.length;
    const scored: { id: string; score: number }[] = [];
    for (let i = 0; i < N; i++) {
      let score = 0;
      for (const term of qTerms) {
        const f = this.tf[i].get(term);
        if (!f) continue;
        const n = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        const norm = (f * (K1 + 1)) / (f + K1 * (1 - B + (B * this.docLen[i]) / (this.avgLen || 1)));
        score += idf * norm;
      }
      if (score > 0) scored.push({ id: this.docs[i].id, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
