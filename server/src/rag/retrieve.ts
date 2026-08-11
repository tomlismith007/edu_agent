import { OpenAIEmbeddings } from '@langchain/openai';
import { ChromaClient } from 'chromadb';
import { getEmbeddingConfig } from '../core/llm-settings.js';
import { RAG } from './config.js';
import { BM25Index } from './bm25.js';
import { fuseHits, type FusedHit } from './fusion.js';
import { loadRegistry } from './registry.js';
import { rerank } from './rerank.js';

/**
 * 混合检索（rag-spec.md §5）：稠密（Chroma cosine）+ 稀疏（BM25-lite）→ RRF 融合
 * → 可选 rerank → top4。任何一层失败都降级继续，绝不让聊天主链路报错。
 */

export interface KbHit {
  section: string;
  text: string;
  source: string;
  score: number;
}

let readyCache: { ok: boolean; reason?: string; at: number } | null = null;

/** RAG 可用性（嵌入已配置 + Chroma 可达），30s 缓存，供路由层毫秒级短路 */
export async function ragReady(force = false): Promise<{ ok: boolean; reason?: string }> {
  if (!force && readyCache && Date.now() - readyCache.at < 30_000) return readyCache;
  let result: { ok: boolean; reason?: string };
  if (!getEmbeddingConfig()) {
    result = { ok: false, reason: '未配置向量模型' };
  } else {
    try {
      const client = new ChromaClient({ path: RAG.chromaUrl });
      await Promise.race([
        client.heartbeat(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('超时')), 2000)),
      ]);
      result = { ok: true };
    } catch (e) {
      result = { ok: false, reason: `Chroma 不可达: ${(e as Error).message}` };
    }
  }
  readyCache = { ...result, at: Date.now() };
  return result;
}

async function denseSearch(query: string, cfg: NonNullable<ReturnType<typeof getEmbeddingConfig>>) {
  const embedder = new OpenAIEmbeddings({
    model: cfg.model,
    apiKey: cfg.apiKey,
    configuration: { baseURL: cfg.baseUrl },
    dimensions: RAG.dim,
  });
  const vector = await embedder.embedQuery(query);
  const client = new ChromaClient({ path: RAG.chromaUrl });
  const collection = await client.getCollection({ name: RAG.collection });
  const results = await collection.query({
    queryEmbeddings: [vector],
    nResults: RAG.denseTopK,
  });
  const ids = results.ids?.[0] || [];
  const distances = results.distances?.[0] || [];
  return ids.map((id, i) => {
    const dist = distances[i] ?? 1;
    const score = typeof dist === 'number' ? Math.max(0, 1 - dist) : 0;
    return { id, score };
  });
}

export async function retrieve(query: string): Promise<KbHit[]> {
  const reg = loadRegistry();
  if (!reg || !reg.chunks.length) return [];

  const byId = new Map(reg.chunks.map((c) => [c.id, { id: c.id, text: c.text, metadata: c.metadata }]));

  // 稠密路：失败降级为纯稀疏
  let dense: { id: string; score: number }[] = [];
  const cfg = getEmbeddingConfig();
  if (cfg) {
    try {
      dense = await denseSearch(query, cfg);
    } catch (e) {
      console.warn('[rag] 稠密检索失败，退化为稀疏:', (e as Error).message);
    }
  }

  const sparse = new BM25Index(
    reg.chunks.map((c) => ({ id: c.id, text: c.text })),
  ).search(query, RAG.sparseTopK);

  const fused: FusedHit[] = fuseHits({
    dense,
    sparse,
    byId,
    query,
    minScore: RAG.minScore,
  });
  if (!fused.length) return [];

  const top = fused.slice(0, Math.max(RAG.finalTopK, RAG.denseTopK));
  const texts = top.map((h) => byId.get(h.id)!.text);
  const order = (await rerank(query, texts, RAG.finalTopK)) ?? top.map((_, i) => i).slice(0, RAG.finalTopK);

  return order.slice(0, RAG.finalTopK).map((idx) => {
    const hit = top[idx];
    const chunk = byId.get(hit.id)!;
    return {
      section: chunk.metadata.section_path || '正文',
      text: chunk.text,
      source: chunk.metadata.title || '校内知识库',
      score: Number(hit.score.toFixed(4)),
    };
  });
}
