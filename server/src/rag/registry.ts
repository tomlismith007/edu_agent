import { getEmbeddingConfig, getRerankConfig } from '../core/llm-settings.js';
import { RAG } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 索引登记文件（rag-spec.md §2.4）：chunks 全文冗余存储，供 BM25 直算与离线评测。
 * embeddingModelId = 供应商|baseUrl|模型 的身份串，变更即视为 stale。
 */

export interface RegistryDoc {
  id: string;
  title: string;
  gradeYear: number | null;
  major: string;
  sections: number;
  chunks: number;
  indexedAt: string;
}

export interface RagRegistry {
  embeddingModelId: string;
  embeddingModel: string;
  dim: number;
  indexedAt: string;
  docs: RegistryDoc[];
  chunks: { id: string; text: string; metadata: Record<string, string> }[];
}

export function embeddingIdentity(cfg: { provider: string; baseUrl: string; model: string }): string {
  return `${cfg.provider}|${cfg.baseUrl}|${cfg.model}`;
}

export function loadRegistry(): RagRegistry | null {
  try {
    const raw = JSON.parse(fs.readFileSync(RAG.registryFile(), 'utf8')) as RagRegistry;
    if (!raw || !Array.isArray(raw.chunks)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveRegistry(reg: RagRegistry): void {
  fs.mkdirSync(path.dirname(RAG.registryFile()), { recursive: true });
  fs.writeFileSync(RAG.registryFile(), JSON.stringify(reg));
}

/** 当前索引是否过期：嵌入配置身份变化或维度不符 */
export function isStale(): { stale: boolean; reason?: string } {
  const reg = loadRegistry();
  const cfg = getEmbeddingConfig();
  if (!cfg) return { stale: true, reason: '未配置向量模型' };
  if (!reg) return { stale: true, reason: '尚未建立索引' };
  if (reg.dim !== RAG.dim) return { stale: true, reason: `索引维度 ${reg.dim} 与当前要求 ${RAG.dim} 不符` };
  if (reg.embeddingModelId !== embeddingIdentity(cfg)) {
    return { stale: true, reason: '向量模型已变更，请重建索引' };
  }
  return { stale: false };
}

/** rerank 供应商身份串（供 UI 展示），未配置返回 null */
export function rerankLabel(): string | null {
  const cfg = getRerankConfig();
  return cfg ? `${cfg.provider} · ${cfg.model}` : null;
}
