import { Router } from 'express';
import { getEmbeddingConfig } from '../core/llm-settings.js';
import { RAG } from '../rag/config.js';
import { chromaHealth, collectionCount, reindexPlan } from '../rag/ingest.js';
import { isStale, loadRegistry } from '../rag/registry.js';

export const ragRouter = Router();

/** 知识库状态（rag-spec.md §3.2）：Chroma 不可达也正常返回状态而非 500 */
ragRouter.get('/rag/status', async (_req, res) => {
  const health = await chromaHealth();
  const reg = loadRegistry();
  const staleInfo = isStale();
  const count = health.ok ? await collectionCount() : null;
  res.json({
    ok: true,
    chromaUrl: RAG.chromaUrl,
    chroma: health.ok ? 'ok' : 'unreachable',
    chromaError: health.error,
    embeddingConfigured: Boolean(getEmbeddingConfig()),
    collection: health.ok ? RAG.collection : null,
    chunks: reg?.chunks.length ?? 0,
    collectionCount: count,
    indexedAt: reg?.indexedAt ?? null,
    embeddingModel: reg?.embeddingModel ?? null,
    docs: reg?.docs ?? [],
    stale: staleInfo.stale,
    staleReason: staleInfo.reason,
  });
});

/** 同步重建索引：拉培养方案 → 清洗 → 切分 → 嵌入 → 入库（约 10-30s） */
ragRouter.post('/rag/reindex', async (_req, res) => {
  try {
    const r = await reindexPlan();
    res.json({ ok: true, ...r });
  } catch (e) {
    const msg = (e as Error).message || '重建失败';
    res.status(400).json({ ok: false, error: msg });
  }
});
