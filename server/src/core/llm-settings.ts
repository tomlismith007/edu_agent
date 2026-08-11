import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Agent 模型服务设置（系统级，全局生效）：多供应商管理，仅支持 OpenAI 兼容接口。
 * 用户可在设置页添加多个供应商（名称/Base URL/模型/API Key），其中一个处于「使用中」；
 * 不做 .env 兜底——未启用任何供应商即视为未配置。
 *
 * 持久化：cache/llm-providers.json（cache/ 已在 .gitignore 中，不会入库）。
 * API Key 不落明文：AES-256-GCM 加密，密钥为首次使用时随机生成、独立存放的
 * cache/llm-secret.key（仅本地运行时可用，拷贝缓存文件到别机无法解出 Key）。
 * 兼容：旧版单配置 cache/llm-settings.json 首次读取时自动迁移为一条供应商记录。
 */

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface LlmProviderView {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  /** 掩码展示，如 sk-****abcd；不回传明文 */
  apiKeyMasked: string;
  createdAt: number;
  updatedAt: number;
}

export interface LlmSettingsView {
  /** 当前生效的供应商 id；null = 未配置 */
  activeId: string | null;
  providers: LlmProviderView[];
}

export interface LlmProviderInput {
  name?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

interface StoredProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  /** base64url(iv).base64url(tag).base64url(ciphertext) */
  apiKeyEnc: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredStore {
  activeId: string | null;
  providers: StoredProvider[];
  /** 嵌入模型（RAG 用，单条，可空） */
  embedding?: StoredProvider | null;
  /** 重排模型（RAG 可选，单条，可空） */
  rerank?: StoredProvider | null;
}

const storeFile = (): string => path.join(config.cacheDir, 'llm-providers.json');
/** 旧版（单配置）存档文件，仅用于一次性迁移 */
const legacyFile = (): string => path.join(config.cacheDir, 'llm-settings.json');
const secretFile = (): string => path.join(config.cacheDir, 'llm-secret.key');

function ensureCacheDir(): void {
  fs.mkdirSync(config.cacheDir, { recursive: true });
}

/** 读取（必要时生成）本地加密密钥：32 字节 hex */
function loadSecret(): Buffer {
  ensureCacheDir();
  const file = secretFile();
  if (fs.existsSync(file)) {
    const hex = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  }
  const secret = crypto.randomBytes(32);
  fs.writeFileSync(file, secret.toString('hex'), { mode: 0o600 });
  return secret;
}

function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadSecret(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64u = (b: Buffer) => b.toString('base64url');
  return `${b64u(iv)}.${b64u(tag)}.${b64u(enc)}`;
}

function decryptApiKey(enc: string): string {
  const [ivB, tagB, dataB] = enc.split('.');
  if (!ivB || !tagB || !dataB) throw new Error('API Key 密文格式不合法');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadSecret(), Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function isStoredProvider(p: unknown): p is StoredProvider {
  const x = p as Partial<StoredProvider>;
  return Boolean(x && typeof x.id === 'string' && x.baseUrl && x.model && x.apiKeyEnc);
}

function writeStore(s: StoredStore): void {
  ensureCacheDir();
  fs.writeFileSync(storeFile(), JSON.stringify(s, null, 2), { mode: 0o600 });
}

/** 旧版单配置迁移：转为一条供应商记录并设为使用中；无旧档时返回空库 */
function migrateLegacy(): StoredStore {
  try {
    const raw = fs.readFileSync(legacyFile(), 'utf8');
    const j = JSON.parse(raw) as Partial<{ provider: string; baseUrl: string; model: string; apiKeyEnc: string }>;
    if (!j.baseUrl || !j.model || !j.apiKeyEnc) return { activeId: null, providers: [] };
    const now = Date.now();
    const p: StoredProvider = {
      id: crypto.randomUUID(),
      name: (j.provider || '').trim() || '自定义',
      baseUrl: j.baseUrl,
      model: j.model,
      apiKeyEnc: j.apiKeyEnc,
      createdAt: now,
      updatedAt: now,
    };
    const store: StoredStore = { activeId: p.id, providers: [p] };
    writeStore(store);
    return store;
  } catch {
    return { activeId: null, providers: [] };
  }
}

function readStore(): StoredStore {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8');
    const j = JSON.parse(raw) as Partial<StoredStore>;
    const providers = (Array.isArray(j.providers) ? j.providers : []).filter(isStoredProvider);
    const activeId =
      typeof j.activeId === 'string' && providers.some((p) => p.id === j.activeId) ? j.activeId : null;
    return {
      activeId,
      providers,
      embedding: isStoredProvider(j.embedding) ? j.embedding : null,
      rerank: isStoredProvider(j.rerank) ? j.rerank : null,
    };
  } catch {
    // 存档不存在或损坏：尝试迁移旧版单配置
    return migrateLegacy();
  }
}

/** 归一化 Base URL：去尾部斜杠 */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** 校验并归一化用户提交的表单；update 模式下 apiKey 留空视为「沿用已保存的 Key」 */
function validateInput(
  input: LlmProviderInput,
  mode: 'create' | 'update',
): { name: string; baseUrl: string; model: string; apiKey: string; keepKey: boolean } {
  const baseUrl = normalizeBaseUrl(input.baseUrl || '');
  if (!baseUrl) throw new Error('Base URL 不能为空');
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Base URL 格式不合法（需为 http(s) 完整地址，如 https://api.deepseek.com/v1）');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Base URL 必须以 http:// 或 https:// 开头');
  }
  const model = (input.model || '').trim();
  if (!model) throw new Error('模型名称不能为空');
  const name = (input.name || '').trim() || '自定义';
  const apiKey = (input.apiKey || '').trim();
  const keepKey = mode === 'update' && apiKey === '';
  if (!apiKey && !keepKey) throw new Error('API Key 不能为空');
  return { name, baseUrl, model, apiKey, keepKey };
}

const UNCONFIGURED: LlmConfig = { provider: '', baseUrl: '', model: '', apiKey: '' };

/** 生效中的完整配置（含明文 Key），供 Agent 构建使用；未启用供应商时返回空配置 */
export function getLlmSettings(): LlmConfig {
  const store = readStore();
  const p = store.providers.find((x) => x.id === store.activeId);
  if (!p) return { ...UNCONFIGURED };
  try {
    return { provider: p.name, baseUrl: p.baseUrl, model: p.model, apiKey: decryptApiKey(p.apiKeyEnc) };
  } catch {
    // 密钥文件丢失/密文损坏时视为未配置
    return { ...UNCONFIGURED };
  }
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

function toProviderView(p: StoredProvider): LlmProviderView {
  let key = '';
  try {
    key = decryptApiKey(p.apiKeyEnc);
  } catch {
    key = '';
  }
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    model: p.model,
    apiKeyMasked: maskKey(key),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** 给前端的全量只读视图：供应商列表 + 使用中 id；永不包含明文 Key */
export function getLlmSettingsView(): LlmSettingsView {
  const store = readStore();
  return {
    activeId: store.activeId,
    providers: store.providers.map(toProviderView),
  };
}

/** 新增供应商；首个供应商自动设为使用中 */
export function createLlmProvider(input: LlmProviderInput): LlmSettingsView {
  const v = validateInput(input, 'create');
  const store = readStore();
  const now = Date.now();
  const p: StoredProvider = {
    id: crypto.randomUUID(),
    name: v.name,
    baseUrl: v.baseUrl,
    model: v.model,
    apiKeyEnc: encryptApiKey(v.apiKey),
    createdAt: now,
    updatedAt: now,
  };
  store.providers.push(p);
  if (!store.activeId) store.activeId = p.id;
  writeStore(store);
  return getLlmSettingsView();
}

/** 更新供应商（apiKey 留空 = 沿用已保存的 Key） */
export function updateLlmProvider(id: string, input: LlmProviderInput): LlmSettingsView {
  const store = readStore();
  const p = store.providers.find((x) => x.id === id);
  if (!p) throw new Error('供应商不存在或已被删除');
  const v = validateInput(input, 'update');
  let plainKey = v.apiKey;
  if (v.keepKey) {
    try {
      plainKey = decryptApiKey(p.apiKeyEnc);
    } catch {
      throw new Error('已保存的 API Key 解密失败，请重新填写后保存');
    }
  }
  p.name = v.name;
  p.baseUrl = v.baseUrl;
  p.model = v.model;
  p.apiKeyEnc = encryptApiKey(plainKey);
  p.updatedAt = Date.now();
  writeStore(store);
  return getLlmSettingsView();
}

/** 删除供应商；删除使用中的供应商后转为未配置（不回退 .env） */
export function deleteLlmProvider(id: string): LlmSettingsView {
  const store = readStore();
  const idx = store.providers.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error('供应商不存在或已被删除');
  store.providers.splice(idx, 1);
  if (store.activeId === id) store.activeId = null;
  writeStore(store);
  return getLlmSettingsView();
}

/** 切换使用中的供应商；id = null 表示停用全部（未配置） */
export function setActiveLlmProvider(id: string | null): LlmSettingsView {
  const store = readStore();
  if (id !== null && !store.providers.some((x) => x.id === id)) {
    throw new Error('供应商不存在或已被删除');
  }
  store.activeId = id;
  writeStore(store);
  return getLlmSettingsView();
}

/** 按 id 取某供应商完整配置（含明文 Key），供连通性测试 */
export function getLlmConfigById(id: string): LlmConfig {
  const store = readStore();
  const p = store.providers.find((x) => x.id === id);
  if (!p) throw new Error('供应商不存在或已被删除');
  try {
    return { provider: p.name, baseUrl: p.baseUrl, model: p.model, apiKey: decryptApiKey(p.apiKeyEnc) };
  } catch {
    throw new Error('该供应商已保存的 API Key 解密失败，请重新填写后保存');
  }
}

// ==================== 单槽位扩展配置（嵌入 / 重排，RAG 用） ====================

export interface SingleProviderView {
  configured: boolean;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
}

type SlotKey = 'embedding' | 'rerank';

const UNCONFIGURED_VIEW: SingleProviderView = { configured: false, name: '', baseUrl: '', model: '', apiKeyMasked: '' };

function slotConfig(store: StoredStore, key: SlotKey): LlmConfig | null {
  const p = store[key];
  if (!p) return null;
  try {
    return { provider: p.name, baseUrl: p.baseUrl, model: p.model, apiKey: decryptApiKey(p.apiKeyEnc) };
  } catch {
    return null;
  }
}

function slotView(store: StoredStore, key: SlotKey): SingleProviderView {
  const p = store[key];
  if (!p) return { ...UNCONFIGURED_VIEW };
  let key_mask = '';
  try {
    key_mask = maskKey(decryptApiKey(p.apiKeyEnc));
  } catch {
    key_mask = '****';
  }
  return { configured: true, name: p.name, baseUrl: p.baseUrl, model: p.model, apiKeyMasked: key_mask };
}

/** 校验并归一化单槽位表单；apiKey 留空 = 沿用已存 Key */
function validateSlot(input: LlmProviderInput, existing: StoredProvider | null) {
  const baseUrl = normalizeBaseUrl(input.baseUrl || '');
  if (!baseUrl) throw new Error('Base URL 不能为空');
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('Base URL 必须是 http(s) 完整地址');
  }
  const model = (input.model || '').trim();
  if (!model) throw new Error('模型名称不能为空');
  const apiKey = (input.apiKey || '').trim();
  if (!apiKey && !existing) throw new Error('API Key 不能为空');
  return { baseUrl, model, apiKey, name: (input.name || '').trim() };
}

function updateSlot(key: SlotKey, defaultName: string, input: LlmProviderInput): SingleProviderView {
  const store = readStore();
  const existing = store[key] ?? null;
  const v = validateSlot(input, existing);
  let plainKey = v.apiKey;
  if (!plainKey) {
    try {
      plainKey = decryptApiKey(existing!.apiKeyEnc);
    } catch {
      throw new Error('已保存的 API Key 解密失败，请重新填写后保存');
    }
  }
  const p: StoredProvider = {
    id: existing?.id ?? crypto.randomUUID(),
    name: v.name || defaultName,
    baseUrl: v.baseUrl,
    model: v.model,
    apiKeyEnc: encryptApiKey(plainKey),
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  store[key] = p;
  writeStore(store);
  return slotView(store, key);
}

/** 嵌入模型只读掩码视图 */
export function getEmbeddingView(): SingleProviderView {
  return slotView(readStore(), 'embedding');
}

/** 保存嵌入模型；返回后调用方应将 RAG 索引标记为 stale */
export function updateEmbeddingConfig(input: LlmProviderInput): SingleProviderView {
  return updateSlot('embedding', '嵌入模型', input);
}

/** 嵌入模型完整配置（含明文 Key），供 RAG 入库/检索；未配置返回 null */
export function getEmbeddingConfig(): LlmConfig | null {
  return slotConfig(readStore(), 'embedding');
}

/** 重排模型只读掩码视图（可选组件） */
export function getRerankView(): SingleProviderView {
  return slotView(readStore(), 'rerank');
}

export function updateRerankConfig(input: LlmProviderInput): SingleProviderView {
  return updateSlot('rerank', '重排模型', input);
}

/** 重排模型完整配置（含明文 Key）；未配置返回 null（检索退化为 RRF 融合序） */
export function getRerankConfig(): LlmConfig | null {
  return slotConfig(readStore(), 'rerank');
}
