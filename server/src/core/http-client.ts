import axios from 'axios';
import { assertSafeUrl } from './url-guard.js';

/**
 * 统一 HTTP 客户端（单例）
 *
 * 集中处理：
 * 1. 出站 URL 安全校验：仅 http/https，拒绝内网/环回/保留地址（防 SSRF）。
 * 2. 全局请求超时：教务系统偶发卡死统一兜底。
 * 3. 日志脱敏：绝不将含敏感 Token / TGC 的 Header 写入 server.log。
 */

const SENSITIVE_HEADER = /^cookie$|^set-cookie$|^authorization$/i;

function redactHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    out[k] = SENSITIVE_HEADER.test(k) ? '<redacted>' : v;
  }
  return out;
}

const TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 20000);

export const httpClient = axios.create({
  timeout: TIMEOUT_MS,
});

httpClient.interceptors.request.use(async (cfg) => {
  await assertSafeUrl(axios.getUri(cfg));
  const url = axios.getUri(cfg);
  console.error(`[http] ${cfg.method?.toUpperCase()} ${url}`);
  if (process.env.HTTP_DEBUG === '1') {
    console.error(`[http] headers: ${JSON.stringify(redactHeaders(cfg.headers as Record<string, unknown>))}`);
    const body = cfg.data !== undefined ? String(cfg.data).slice(0, 400) : '';
    if (body) console.error(`[http] body: ${body}`);
  }
  return cfg;
});
