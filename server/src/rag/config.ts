import path from 'node:path';
import { config } from '../core/config.js';

/**
 * RAG 知识库运行参数（契约见 server/docs/rag-spec.md §2.1）。
 * 嵌入维度固定 1024：collection 创建、连通性测试、入库均按此校验。
 */
export const RAG = {
  chromaUrl: (process.env.CHROMA_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  collection: process.env.RAG_COLLECTION || 'edu_kb',
  dim: 1024,
  denseTopK: Number(process.env.RAG_DENSE_TOPK || 10),
  sparseTopK: Number(process.env.RAG_SPARSE_TOPK || 10),
  minScore: Number(process.env.RAG_MIN_SCORE || 0.3),
  rrfK: 60,
  finalTopK: Number(process.env.RAG_FINAL_TOPK || 4),
  chunkSize: Number(process.env.RAG_CHUNK_SIZE || 512),
  chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP || 64),
  l2TimeoutMs: Number(process.env.RAG_L2_TIMEOUT_MS || 3500),
  /** 索引登记文件（chunks 全文冗余：供 BM25 与离线评测直算） */
  registryFile: (): string => path.join(config.cacheDir, 'rag-index.json'),
} as const;
