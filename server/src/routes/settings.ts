import { Router } from 'express';
import { resetAgent } from '../agent/agent.js';
import { config } from '../core/config.js';
import { assertSafeUrl } from '../core/url-guard.js';
import {
  createLlmProvider,
  deleteLlmProvider,
  getLlmConfigById,
  getLlmSettings,
  getLlmSettingsView,
  normalizeBaseUrl,
  setActiveLlmProvider,
  updateLlmProvider,
  type LlmProviderInput,
} from '../core/llm-settings.js';
import {
  getEmbeddingConfig,
  getEmbeddingView,
  getRerankConfig,
  getRerankView,
  updateEmbeddingConfig,
  updateRerankConfig,
} from '../core/llm-settings.js';
import { RAG } from '../rag/config.js';

export const settingsRouter = Router();

/** 模型服务全量视图：供应商列表 + 使用中 id + .env 内置参考（Key 掩码） */
settingsRouter.get('/settings/llm', (_req, res) => {
  res.json({ ok: true, ...getLlmSettingsView() });
});

const providerInput = (b: unknown): LlmProviderInput =>
  (b || {}) as { name?: string; baseUrl?: string; model?: string; apiKey?: string };

/** 新增供应商（OpenAI 兼容）；首个供应商自动设为使用中 */
settingsRouter.post('/settings/llm/providers', (req, res) => {
  try {
    const view = createLlmProvider(providerInput(req.body));
    resetAgent();
    res.json({ ok: true, ...view });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

/** 更新供应商；apiKey 留空表示沿用已保存的 Key */
settingsRouter.put('/settings/llm/providers/:id', (req, res) => {
  try {
    const view = updateLlmProvider(req.params.id, providerInput(req.body));
    resetAgent();
    res.json({ ok: true, ...view });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

/** 删除供应商；删除使用中的供应商后模型服务转为未配置 */
settingsRouter.delete('/settings/llm/providers/:id', (req, res) => {
  try {
    const view = deleteLlmProvider(req.params.id);
    resetAgent();
    res.json({ ok: true, ...view });
  } catch (e) {
    res.status(404).json({ ok: false, error: (e as Error).message });
  }
});

/** 切换使用中的供应商；id = null 表示停用全部 */
settingsRouter.put('/settings/llm/active', (req, res) => {
  const { id } = (req.body || {}) as { id?: string | null };
  try {
    const view = setActiveLlmProvider(id ?? null);
    resetAgent();
    res.json({ ok: true, ...view });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

/**
 * 连通性测试：向 baseUrl/chat/completions 发一次最小补全请求。
 * body 传 providerId 时以其已保存配置为基底；未传时用当前生效配置；
 * baseUrl/model/apiKey 可覆盖基底值先行验证。
 */
settingsRouter.post('/settings/llm/test', async (req, res) => {
  const body = (req.body || {}) as { providerId?: string; baseUrl?: string; model?: string; apiKey?: string };
  let effective: { baseUrl: string; model: string; apiKey: string };
  try {
    const base = body.providerId ? getLlmConfigById(body.providerId) : getLlmSettings();
    effective = { baseUrl: base.baseUrl, model: base.model, apiKey: base.apiKey };
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
    return;
  }
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(body.baseUrl || effective.baseUrl);
    if (!baseUrl) throw new Error();
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    res.status(400).json({ ok: false, error: 'Base URL 不能为空且必须是 http(s) 地址' });
    return;
  }
  const model = (body.model || '').trim() || effective.model;
  if (!model) {
    res.status(400).json({ ok: false, error: '模型名称不能为空' });
    return;
  }
  const apiKey = (body.apiKey || '').trim() || effective.apiKey;
  if (!apiKey) {
    res.status(400).json({ ok: false, error: '请先填写 API Key' });
    return;
  }

  const started = Date.now();
  // 出站前过 url-guard（防 SSRF 探测内网）；本机/内网模型服务可设 LLM_ALLOW_PRIVATE_BASE_URL=1 显式放行
  if (!config.llmAllowPrivateBaseUrl) {
    try {
      await assertSafeUrl(`${baseUrl}/chat/completions`);
    } catch (e) {
      res
        .status(400)
        .json({ ok: false, error: `${(e as Error).message}（如需使用本机/内网模型服务，请设置环境变量 LLM_ALLOW_PRIVATE_BASE_URL=1）` });
      return;
    }
  }
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const latencyMs = Date.now() - started;
    const text = await r.text();
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
        if (typeof j.error === 'string') msg = j.error;
        else if (j.error?.message) msg = j.error.message;
        else if (j.message) msg = j.message;
      } catch {
        /* 保留 HTTP 状态码信息 */
      }
      res.json({ ok: false, error: `${msg}（HTTP ${r.status}）` });
      return;
    }
    let reply = '';
    try {
      const j = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
      reply = j.choices?.[0]?.message?.content?.trim() || '';
    } catch {
      /* 非 JSON 响应也算成功 */
    }
    res.json({ ok: true, latencyMs, model, reply: reply.slice(0, 100) });
  } catch (e) {
    const err = e as Error;
    const msg =
      err.name === 'TimeoutError' || err.name === 'AbortError'
        ? '连接超时（20s），请检查 Base URL 与网络'
        : err.message || '连接失败';
    res.json({ ok: false, error: msg, latencyMs: Date.now() - started });
  }
});

// ==================== 嵌入 / 重排模型（RAG 知识库，契约见 server/docs/rag-spec.md §3.1） ====================

/** 嵌入模型视图（Key 掩码）；dim 为固定向量维度 */
settingsRouter.get('/settings/embedding', (_req, res) => {
  res.json({ ok: true, ...getEmbeddingView(), dim: RAG.dim });
});

/** 保存嵌入模型（apiKey 留空沿用已存 Key）；变更后 RAG 索引按 embeddingModel 判定 stale */
settingsRouter.put('/settings/embedding', (req, res) => {
  try {
    const view = updateEmbeddingConfig(providerInput(req.body));
    res.json({ ok: true, ...view, dim: RAG.dim });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

/** 重排模型视图（可选，未配置时检索退化为 RRF 融合序） */
settingsRouter.get('/settings/rerank', (_req, res) => {
  res.json({ ok: true, ...getRerankView() });
});

settingsRouter.put('/settings/rerank', (req, res) => {
  try {
    const view = updateRerankConfig(providerInput(req.body));
    res.json({ ok: true, ...view });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message });
  }
});

/** 嵌入连通性测试：发一次最小 embedding 请求，校验返回维度必须等于 RAG.dim(1024) */
settingsRouter.post('/settings/embedding/test', async (req, res) => {
  const body = (req.body || {}) as { baseUrl?: string; model?: string; apiKey?: string };
  const stored = getEmbeddingConfig();
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(body.baseUrl || stored?.baseUrl || '');
    if (!baseUrl) throw new Error();
    const u = new URL(baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    res.status(400).json({ ok: false, error: 'Base URL 不能为空且必须是 http(s) 地址' });
    return;
  }
  const model = (body.model || '').trim() || stored?.model || '';
  if (!model) {
    res.status(400).json({ ok: false, error: '模型名称不能为空' });
    return;
  }
  const apiKey = (body.apiKey || '').trim() || stored?.apiKey || '';
  if (!apiKey) {
    res.status(400).json({ ok: false, error: '请先填写 API Key' });
    return;
  }
  if (!config.llmAllowPrivateBaseUrl) {
    try {
      await assertSafeUrl(`${baseUrl}/embeddings`);
    } catch (e) {
      res.status(400).json({
        ok: false,
        error: `${(e as Error).message}（如需使用本机/内网模型服务，请设置环境变量 LLM_ALLOW_PRIVATE_BASE_URL=1）`,
      });
      return;
    }
  }
  const started = Date.now();
  try {
    const r = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: ['测试'], dimensions: RAG.dim }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
        if (typeof j.error === 'string') msg = j.error;
        else if (j.error?.message) msg = j.error.message;
        else if (j.message) msg = j.message;
      } catch {
        /* 保留 HTTP 状态码 */
      }
      res.json({ ok: false, error: `${msg}（HTTP ${r.status}）` });
      return;
    }
    let dimension = 0;
    try {
      const j = JSON.parse(text) as { data?: { embedding?: number[] }[] };
      dimension = j.data?.[0]?.embedding?.length ?? 0;
    } catch {
      /* 非 JSON 响应 */
    }
    if (dimension !== RAG.dim) {
      res.json({
        ok: false,
        error: dimension
          ? `该模型返回 ${dimension} 维向量，与知识库要求的 ${RAG.dim} 维不符，请更换模型`
          : '响应中未找到 embedding 向量',
      });
      return;
    }
    res.json({ ok: true, latencyMs: Date.now() - started, dimension, model });
  } catch (e) {
    const err = e as Error;
    const msg =
      err.name === 'TimeoutError' || err.name === 'AbortError'
        ? '连接超时（20s），请检查 Base URL 与网络'
        : err.message || '连接失败';
    res.json({ ok: false, error: msg, latencyMs: Date.now() - started });
  }
});
