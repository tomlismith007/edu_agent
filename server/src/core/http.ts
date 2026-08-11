import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { JXSD_BASE } from './config.js';
import { httpClient } from './http-client.js';
import { session } from './session.js';

/** 检查 HTML 是否属于强智教务会话失效/登录页面特征 */
function isSessionExpired(html: unknown): boolean {
  if (typeof html !== 'string') return false;
  return (
    html.includes('login-croypto') ||
    html.includes('login-page-flowkey') ||
    html.includes('LoginToXk') ||
    html.includes('/cas/login') ||
    html.includes('用户没有登录') ||
    html.includes('请重新登录') ||
    html.includes('未登录') ||
    (html.includes('<title>') && html.includes('教务管理系统') && html.includes('form'))
  );
}

interface RequestOptions {
  /** 检查响应正文是否包含"会话失效"特征，命中则自动重登并重试一次 */
  checkExpiry?: boolean;
  retry?: boolean;
}

async function execute<T>(cfg: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  await session.ensureLoggedIn();
  const res = await httpClient.request<T>({
    maxRedirects: 0,
    validateStatus: () => true,
    ...cfg,
    headers: { 'User-Agent': 'Mozilla/5.0', ...cfg.headers, Cookie: cfg.headers?.Cookie ?? session.cookies },
  });
  session.mergeCookies(res.headers['set-cookie']);
  return res;
}

/**
 * 统一请求入口：自动携带会话 Cookie、合并 Set-Cookie、
 * 捕获网络挂起 (socket hang up / 掉线) 自动重置 Session 重试、检测会话失效后自动重新登录
 */
export async function request<T = unknown>(cfg: AxiosRequestConfig, opts: RequestOptions = {}): Promise<AxiosResponse<T>> {
  const { checkExpiry = true, retry = true } = opts;
  let res: AxiosResponse<T>;

  try {
    res = await execute<T>(cfg);
  } catch (err) {
    if (retry) {
      console.warn(`[http] 网络请求异常 (${(err as Error).message})，重新登录并重试...`);
      session.invalidate();
      res = await execute<T>(cfg);
    } else {
      throw err;
    }
  }

  if (
    retry &&
    checkExpiry &&
    res.status === 200 &&
    isSessionExpired(res.data) &&
    String(cfg.url ?? '').startsWith(JXSD_BASE)
  ) {
    console.warn('[http] 检测到教务会话已失效 (返回登录页)，触发重新登录...');
    session.invalidate();
    res = await execute<T>(cfg);
  }
  return res;
}

export function getJ<T = string>(url: string, cfg: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
  return request<T>({ ...cfg, method: 'GET', url }, { checkExpiry: true });
}

export function postForm<T = string>(
  url: string,
  body: Record<string, unknown>,
  referer: string,
  cfg: AxiosRequestConfig = {},
): Promise<AxiosResponse<T>> {
  return request<T>(
    {
      ...cfg,
      method: 'POST',
      url,
      data: new URLSearchParams(
        Object.entries(body).map(([k, v]): [string, string] => [k, v == null ? '' : String(v)]),
      ).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: referer, ...cfg.headers },
    },
    { checkExpiry: true },
  );
}
