import { getRerankConfig } from '../core/llm-settings.js';

/**
 * 可选 rerank 重排（rag-spec.md §5）：兼容 Jina/SiliconFlow/DashScope 风格
 * POST {baseUrl}/rerank body {model, query, documents, top_n} → {results:[{index, relevance_score}]}。
 * 未配置或任何失败都返回 null（调用方退化为 RRF 融合序），绝不阻塞检索主路径。
 */
export async function rerank(query: string, documents: string[], topN: number): Promise<number[] | null> {
  const cfg = getRerankConfig();
  if (!cfg || !documents.length) return null;
  try {
    const res = await fetch(`${cfg.baseUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, query, documents, top_n: topN }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { index?: number }[] };
    const indices = (j.results ?? [])
      .map((r) => r.index)
      .filter((i): i is number => typeof i === 'number' && i >= 0 && i < documents.length);
    // 去重并补齐被 top_n 截断之外的原始序号，保证返回完整排列
    const rest = documents.map((_, i) => i).filter((i) => !indices.includes(i));
    return [...indices, ...rest];
  } catch {
    return null;
  }
}
