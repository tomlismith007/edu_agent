import type { UserInfo } from '@/types/dashboard';

export type ApiResult<T, E = {}> = {
  ok: boolean;
  data?: T;
  fromCache?: boolean;
  cachedAt?: string | null;
  error?: string;
  term?: string;
} & E;


/** 带状态码/错误码的请求异常：前端据此区分 401（跳登录页）等场景 */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// 前端访问令牌：构建期由 web/.env 的 VITE_API_TOKEN 注入。
// 注意：此令牌构建时硬编码在前端产物中，非机密密钥，仅作网关与简易鉴权标识。
// 生产环境中服务端应对该令牌实施速率限制（Rate Limiting）及接口白名单防护。
const API_TOKEN = (import.meta.env.VITE_API_TOKEN || '').trim();

function authHeaders(): Record<string, string> {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
}

/** 解析响应为 ApiResult；非 2xx 或 ok=false 时抛出携带 status/code 的 ApiError */
async function parseResult<T, E>(r: Response): Promise<ApiResult<T, E>> {
  const text = await r.text();
  if (!text || !text.trim()) {
    throw new ApiError(`服务未返回数据 (HTTP ${r.status})`, r.status);
  }
  let j: ApiResult<T, E> & { code?: string };
  try {
    j = JSON.parse(text) as ApiResult<T, E> & { code?: string };
  } catch {
    throw new ApiError(`响应解析失败 (HTTP ${r.status})`, r.status);
  }
  if (!r.ok || j.ok === false) {
    throw new ApiError(j.error || `HTTP ${r.status}`, r.status, j.code);
  }
  return j;
}

export async function getJson<T, E = unknown>(url: string, init?: RequestInit): Promise<ApiResult<T, E>> {
  try {
    const r = await fetch(url, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    });
    return await parseResult<T, E>(r);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError((e as Error).message || '网络连接失败', 0);
  }
}

async function jsonRequest<T, E = unknown>(method: string, url: string, body?: unknown): Promise<ApiResult<T, E>> {
  try {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await parseResult<T, E>(r);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError((e as Error).message || '网络连接失败', 0);
  }
}

async function postJson<T, E = unknown>(url: string, body: unknown): Promise<ApiResult<T, E>> {
  return jsonRequest('POST', url, body);
}

// ==================== 认证接口 ====================

/** 登录：成功后服务端下发 edu_sid 会话 Cookie */
export function loginApi(username: string, password: string): Promise<ApiResult<UserInfo, { user: UserInfo }>> {
  return postJson('/api/auth/login', { username, password });
}

/** 探测当前登录态：401 时抛出 code=UNAUTHORIZED 的 ApiError */
export function fetchMe(): Promise<ApiResult<UserInfo, { user: UserInfo }>> {
  return getJson('/api/auth/me');
}

/** 退出登录：清除服务端会话与 Cookie */
export function logoutApi(): Promise<ApiResult<null>> {
  return postJson('/api/auth/logout', {});
}

// ==================== 模型服务设置（多供应商，OpenAI 兼容） ====================

export interface LlmProviderView {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
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

export interface LlmTestResult {
  latencyMs?: number;
  model?: string;
  reply?: string;
}

/** 模型服务全量视图（Key 掩码，不回传明文） */
export function getLlmSettings(): Promise<ApiResult<null, LlmSettingsView>> {
  return getJson<null, LlmSettingsView>('/api/settings/llm');
}

/** 新增供应商；首个供应商自动设为使用中 */
export function createLlmProvider(input: LlmProviderInput): Promise<ApiResult<null, LlmSettingsView>> {
  return postJson<null, LlmSettingsView>('/api/settings/llm/providers', input);
}

/** 更新供应商；apiKey 留空 = 沿用已保存的 Key */
export function updateLlmProvider(id: string, input: LlmProviderInput): Promise<ApiResult<null, LlmSettingsView>> {
  return jsonRequest<null, LlmSettingsView>('PUT', `/api/settings/llm/providers/${id}`, input);
}

/** 删除供应商；删除使用中的供应商后转为未配置 */
export function deleteLlmProvider(id: string): Promise<ApiResult<null, LlmSettingsView>> {
  return jsonRequest<null, LlmSettingsView>('DELETE', `/api/settings/llm/providers/${id}`);
}

/** 切换使用中的供应商；id = null 表示停用全部 */
export function setActiveLlmProvider(id: string | null): Promise<ApiResult<null, LlmSettingsView>> {
  return jsonRequest<null, LlmSettingsView>('PUT', '/api/settings/llm/active', { id });
}

/** 连通性测试：providerId 以其存档为基底，表单值可覆盖 */
export function testLlmSettings(
  input: LlmProviderInput & { providerId?: string },
): Promise<ApiResult<null, LlmTestResult>> {
  return postJson<null, LlmTestResult>('/api/settings/llm/test', input);
}

export interface TermsResult {
  ok: boolean;
  currentTerm: string;
  terms: string[];
  error?: string;
}

// ==================== RAG 知识库（向量模型 / 重排 / 索引运维） ====================

export interface EmbeddingView {
  configured: boolean;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  dim: number;
}

/** 嵌入模型视图（Key 掩码）；未配置时 configured=false */
export function getEmbeddingConfig(): Promise<ApiResult<null, EmbeddingView>> {
  return getJson<null, EmbeddingView>('/api/settings/embedding');
}

/** 保存嵌入模型（apiKey 留空 = 沿用已存 Key）；保存后知识库索引需重建 */
export function updateEmbeddingConfig(input: { name?: string; baseUrl: string; model: string; apiKey?: string }): Promise<ApiResult<null, EmbeddingView>> {
  return jsonRequest<null, EmbeddingView>('PUT', '/api/settings/embedding', input);
}

/** 嵌入连通性测试：返回实际向量维度，必须等于 1024 */
export function testEmbeddingConfig(input: { baseUrl?: string; model?: string; apiKey?: string }): Promise<ApiResult<null, { latencyMs: number; dimension: number; model: string }>> {
  return postJson<null, { latencyMs: number; dimension: number; model: string }>('/api/settings/embedding/test', input);
}

export interface RerankView {
  configured: boolean;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
}

export function getRerankConfig(): Promise<ApiResult<null, RerankView>> {
  return getJson<null, RerankView>('/api/settings/rerank');
}

/** 保存重排模型（可选；未配置时检索退化为融合序） */
export function updateRerankConfig(input: { name?: string; baseUrl: string; model: string; apiKey?: string }): Promise<ApiResult<null, RerankView>> {
  return jsonRequest<null, RerankView>('PUT', '/api/settings/rerank', input);
}

export interface RagDocInfo {
  id: string;
  title: string;
  gradeYear: number | null;
  major: string;
  sections: number;
  chunks: number;
  indexedAt: string;
}

export interface RagStatus {
  chromaUrl: string;
  chroma: 'ok' | 'unreachable';
  chromaError?: string;
  embeddingConfigured: boolean;
  collection: string | null;
  chunks: number;
  collectionCount: number | null;
  indexedAt: string | null;
  embeddingModel: string | null;
  docs: RagDocInfo[];
  stale: boolean;
  staleReason?: string;
}

export function getRagStatus(): Promise<ApiResult<null, RagStatus>> {
  return getJson<null, RagStatus>('/api/rag/status');
}

/** 同步重建索引（约 10-30s）：拉培养方案 → 清洗 → 切分 → 嵌入 → 入库 */
export function reindexRag(): Promise<ApiResult<null, { chunks: number; sections: number; tookMs: number }>> {
  return postJson<null, { chunks: number; sections: number; tookMs: number }>('/api/rag/reindex', {});
}

/** 获取当前学期与可选的历史学期列表 */
export async function getTerms(): Promise<TermsResult> {
  const r = await getJson<null, TermsResult>('/api/terms');
  return r as unknown as TermsResult;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; id: number; name: string; input: unknown }
  | { type: 'tool_end'; id: number; name: string; status?: 'success' | 'error'; output: unknown }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string };

export interface ChatHandlers {
  onToken: (t: string) => void;
  onToolStart: (id: number, name: string, input: unknown) => void;
  onToolEnd: (id: number, name: string, output: unknown, status?: 'success' | 'error') => void;
  onDone: (full: string) => void;
  onError: (msg: string) => void;
}

/** 聊天流式请求：POST /api/chat，解析 SSE data 行。
 *  支持传入 AbortSignal 在组件卸载或切换对话时取消流，避免后端继续消耗 LLM token。 */
export async function chatStream(
  messages: ChatMsg[],
  handlers: ChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let err = `HTTP ${res.status}`;
    if (text) {
      try {
        const j = JSON.parse(text);
        if (j && j.error) err = j.error;
      } catch {
        /* ignore */
      }
    }
    handlers.onError(err);
    return;
  }
  if (!res.body) {
    handlers.onError(`响应无 body (HTTP ${res.status})`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      buf = buf.replace(/\r\n/g, '\n');
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          let ev: ChatEvent;
          try {
            ev = JSON.parse(line.slice(5).trim()) as ChatEvent;
          } catch {
            continue;
          }
          switch (ev.type) {
            case 'token':
              handlers.onToken(ev.content);
              break;
            case 'tool_start':
              handlers.onToolStart(ev.id, ev.name, ev.input);
              break;
            case 'tool_end':
              handlers.onToolEnd(ev.id, ev.name, ev.output, ev.status);
              break;
            case 'done':
              handlers.onDone(ev.content);
              break;
            case 'error':
              handlers.onError(ev.message);
              break;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    if (signal?.aborted) await reader.cancel().catch(() => {});
  }
}
