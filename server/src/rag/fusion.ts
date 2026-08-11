/**
 * 双路召回融合（rag-spec.md §5）：RRF + 关键词命中加权。纯函数，可离线单测。
 */

export interface RankedHit {
  id: string;
  score: number;
}

export interface FusedHit {
  id: string;
  score: number;
  from: ('dense' | 'sparse')[];
}

/** Reciprocal Rank Fusion：score = Σ 1/(k + rank) */
export function rrfFuse(rankings: { id: string }[][], k = 60): Map<string, FusedHit> {
  const fused = new Map<string, FusedHit>();
  for (const ranking of rankings) {
    ranking.forEach((hit, idx) => {
      const weight = 1 / (k + idx + 1);
      const prev = fused.get(hit.id);
      const src = rankings.indexOf(ranking) === 0 ? 'dense' : 'sparse';
      if (prev) {
        prev.score += weight;
        if (!prev.from.includes(src)) prev.from.push(src);
      } else {
        fused.set(hit.id, { id: hit.id, score: weight, from: [src] });
      }
    });
  }
  return fused;
}

export function fuseHits(params: {
  dense: RankedHit[];
  sparse: RankedHit[];
  byId: Map<string, { text: string }>;
  query: string;
  minScore: number;
}): FusedHit[] {
  const { dense, sparse, byId, query, minScore } = params;

  // 稠密路相似度下限滤噪；全部低于下限时保留前 3（避免零召回）
  const denseFiltered = dense.filter((d) => d.score >= minScore);
  const denseRanking = denseFiltered.length ? denseFiltered : dense.slice(0, 3);

  const fused = rrfFuse([denseRanking, sparse]);

  // 关键词命中加权：chunk 原文含查询分词（去重后）每命中一项 +0.01
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2))];
  for (const hit of fused.values()) {
    const chunk = byId.get(hit.id);
    if (!chunk || !terms.length) continue;
    const lower = chunk.text.toLowerCase();
    hit.score += terms.filter((t) => lower.includes(t)).length * 0.01;
  }

  return [...fused.values()].sort((a, b) => b.score - a.score);
}
