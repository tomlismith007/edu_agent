import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, ApiResult } from '@/api/client';

// ponytail: 模块级 Map 缓存仍保留 any —— 与原实现等价，待引入 TanStack Query 时统一替换。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchMemoryCache = new Map<string, ApiResult<any, any>>();

// 首次加载失败的最大重试次数（dev 并行启动时 server 可能晚于 web 就绪）
const MAX_FETCH_RETRIES = 4;

/**
 * 数据请求 hook：内存缓存 + 竞态防护 + 强制刷新。
 *
 * 缓存策略：模块级 Map 永不清理，依赖 /api/meta 用户切换时由调用方手动 invalidate
 * （见 Settings 页清空缓存按钮）。替换为 TanStack Query 时可整体删除。
 */
export function useFetch<T, E = unknown>(path: string, params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams(params).toString();
  const url = `/api/${path}${queryStr ? `?${queryStr}` : ''}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<ApiResult<T, E> | null>(
    () => (fetchMemoryCache.get(url) as ApiResult<T, E>) ?? null,
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(() => !fetchMemoryCache.has(url));
  const [refreshing, setRefreshing] = useState(false);
  const reqIdRef = useRef(0);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const paramKey = JSON.stringify(params);

  useEffect(() => {
    const curReqId = ++reqIdRef.current;
    if (!fetchMemoryCache.has(url)) {
      setLoading(true);
    }

    getJson<T, E>(url)
      .then((r) => {
        if (curReqId === reqIdRef.current) {
          retriesRef.current = 0;
          fetchMemoryCache.set(url, r);
          setResult(r);
          setError('');
        }
      })
      .catch((e) => {
        if (curReqId === reqIdRef.current) {
          setError((e as Error).message);
          // 仅首次加载失败时自动重试（指数退避），refresh 失败直接展示错误
          if (!fetchMemoryCache.has(url) && retriesRef.current < MAX_FETCH_RETRIES) {
            retriesRef.current += 1;
            const delay = Math.min(1000 * 2 ** retriesRef.current, 8000);
            retryTimerRef.current = window.setTimeout(() => setRetryTick((t) => t + 1), delay);
          }
        }
      })
      .finally(() => {
        if (curReqId === reqIdRef.current) {
          setLoading(false);
        }
      });
  }, [path, paramKey, url, retryTick]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const refresh = useCallback(() => {
    const curReqId = ++reqIdRef.current;
    setRefreshing(true);
    const refreshUrl = `/api/${path}?${queryStr ? `${queryStr}&` : ''}refresh=1`;
    getJson<T, E>(refreshUrl)
      .then((r) => {
        if (curReqId === reqIdRef.current) {
          fetchMemoryCache.set(url, r);
          setResult(r);
          setError('');
        }
      })
      .catch((e) => {
        if (curReqId === reqIdRef.current) {
          setError((e as Error).message);
        }
      })
      .finally(() => {
        if (curReqId === reqIdRef.current) {
          setRefreshing(false);
        }
      });
  }, [path, paramKey, queryStr, url]);

  return { result, error, loading, refreshing, refresh };
}

/** 全局清空 useFetch 内存缓存（设置页「清空缓存」按钮调用）。 */
export function clearFetchCache(): void {
  fetchMemoryCache.clear();
}
