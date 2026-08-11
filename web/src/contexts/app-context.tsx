import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getJson } from '@/api/client';
import { isUnauthorizedError, useAuth } from '@/contexts/auth-context';
import type { UserInfo } from '@/types/dashboard';

interface AppState {
  user: UserInfo | null;
  deptMap: [string, string][];
  metaError: string;
  metaLoading: boolean;
  refreshMeta: () => void;
}

// 启动竞态兜底：concurrently 并行启动时 web 可能先于 server 就绪，
// /api/meta 首次失败后指数退避重试（1s/2s/4s/8s…），server 就绪后自动恢复，无需手动刷新。
const META_RETRY_LIMIT = 6;

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { status, expire } = useAuth();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [deptMap, setDeptMap] = useState<[string, string][]>([]);
  const [metaError, setMetaError] = useState('');
  const [metaLoading, setMetaLoading] = useState(true);
  const retryRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const loadMeta = useCallback(() => {
    setMetaLoading(true);
    // 服务端 deptMap 是 [代码, 名称] 元组数组（见 routes/data.ts /api/meta），
    // 不能用 Object.entries()——那会把外层数组按索引展开，学院代码变成 "0"/"1"/…，
    // 教师课表查询就会带上非法 skyx 被教务系统 404 拒绝。
    getJson<UserInfo, { user?: UserInfo | null; deptMap?: [string, string][] }>('/api/meta')
      .then((r) => {
        retryRef.current = 0;
        setUser(r.user ?? null);
        if (Array.isArray(r.deptMap)) setDeptMap(r.deptMap);
        setMetaError('');
      })
      .catch((e) => {
        // 会话过期：交由 auth context 处理，守卫会跳回登录页，不再计入重试
        if (isUnauthorizedError(e)) {
          expire();
          return;
        }
        setMetaError((e as Error).message);
        if (retryRef.current < META_RETRY_LIMIT) {
          retryRef.current += 1;
          timerRef.current = window.setTimeout(loadMeta, Math.min(1000 * 2 ** retryRef.current, 8000));
        }
      })
      .finally(() => setMetaLoading(false));
  }, [expire]);

  // 仅在登录态就绪后拉取（未登录时 /api/meta 只会得到 401）
  useEffect(() => {
    if (status !== 'authed') return;
    loadMeta();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, loadMeta]);

  return (
    <AppContext.Provider
      value={{ user, deptMap, metaError, metaLoading, refreshMeta: loadMeta }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
