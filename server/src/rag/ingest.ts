import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddings } from '@langchain/openai';
import { fetchDetailRaw } from '../services/graduation.js';
import { getEmbeddingConfig } from '../core/llm-settings.js';
import { RAG } from './config.js';
import { chunkDocument } from './chunk.js';
import { buildPlanDocument } from './serialize.js';
import { embeddingIdentity, loadRegistry, saveRegistry, type RagRegistry } from './registry.js';

/**
 * Chroma 连接、健康检查与索引重建（rag-spec.md §3.2）。
 * cosine 空间在本模块预创建 collection 时固定，getOrCreateCollection 幂等返回已建集合。
 */

export async function chromaHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new ChromaClient({ path: RAG.chromaUrl });
    const heartbeat = client.heartbeat();
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('超时')), 2500));
    await Promise.race([heartbeat, timeout]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function getCollection() {
  const client = new ChromaClient({ path: RAG.chromaUrl });
  return client.getOrCreateCollection({
    name: RAG.collection,
    configuration: { hnsw: { space: 'cosine' } },
  });
}

/** 拉取培养方案 → 清洗序列化 → 切分 → 嵌入 → 写入 Chroma + 登记文件 */
export async function reindexPlan(): Promise<{ chunks: number; sections: number; tookMs: number }> {
  const started = Date.now();
  const cfg = getEmbeddingConfig();
  if (!cfg) throw new Error('未配置向量模型：请先在「设置 → 向量模型」中配置');
  const health = await chromaHealth();
  if (!health.ok) throw new Error(`Chroma 服务不可达 (${RAG.chromaUrl})：${health.error}`);

  const raw = await fetchDetailRaw();
  const doc = buildPlanDocument(raw.html, { courses: raw.courses, reqs: raw.reqs, gradeYear: raw.gradeYear });
  const chunks = chunkDocument(doc);
  if (!chunks.length) throw new Error('培养方案切分结果为空，请检查页面结构');

  const collection = await getCollection();
  // 重建 = 同 doc 旧数据先删（chunks id 变化，靠 metadata.doc_id 定位）
  try {
    await collection.delete({ where: { doc_id: doc.id } });
  } catch {
    /* 首次建库无旧数据 */
  }

  const embedder = new OpenAIEmbeddings({
    model: cfg.model,
    apiKey: cfg.apiKey,
    configuration: { baseURL: cfg.baseUrl },
    dimensions: RAG.dim,
  });

  const vectors = await embedder.embedDocuments(chunks.map((c) => c.text));

  await collection.add({
    ids: chunks.map((c) => c.id),
    embeddings: vectors,
    documents: chunks.map((c) => c.text),
    metadatas: chunks.map((c) => ({
      doc_id: c.metadata.doc_id,
      title: c.metadata.title,
      section_path: c.metadata.section_path,
      grade_year: c.metadata.grade_year,
      major: c.metadata.major,
      kind: c.metadata.kind,
    })),
  });

  const indexedAt = new Date().toISOString();
  const sections = new Set(chunks.map((c) => c.metadata.section_path)).size;
  const reg: RagRegistry = {
    embeddingModelId: embeddingIdentity(cfg),
    embeddingModel: cfg.model,
    dim: RAG.dim,
    indexedAt,
    docs: [
      {
        id: doc.id,
        title: doc.title,
        gradeYear: doc.meta.gradeYear,
        major: doc.meta.major,
        sections,
        chunks: chunks.length,
        indexedAt,
      },
    ],
    chunks: chunks.map((c) => ({ id: c.id, text: c.text, metadata: { ...c.metadata } })),
  };
  saveRegistry(reg);
  return { chunks: chunks.length, sections, tookMs: Date.now() - started };
}

/** 状态页用：Chroma collection 实际条目数（不可达返回 null） */
export async function collectionCount(): Promise<number | null> {
  try {
    const collection = await getCollection();
    return await collection.count();
  } catch {
    return null;
  }
}

export { loadRegistry };
