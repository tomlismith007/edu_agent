import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, fetchMe, loginApi, logoutApi } from '@/api/client';
import type { UserInfo } from '@/types/dashboard';

export type AuthStatus = 'checking' | 'authed' | 'guest';

interface AuthState {
  user: UserInfo | null;
  status: AuthStatus;
  /** 登录成功后写入用户态；失败向上抛错由登录页展示 */
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 会话中途失效（任意数据请求返回 401）：置为 guest，守卫自动跳登录页 */
  expire: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');

  // 启动时探测登录态（刷新页面后靠 edu_sid Cookie 恢复）
  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((r) => {
        if (!alive) return;
        setUser(r.user ?? null);
        setStatus(r.user ? 'authed' : 'guest');
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
        setStatus('guest');
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await loginApi(username, password);
    setUser(r.user ?? null);
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    // 服务端会话清理失败不阻塞前端退出
    await logoutApi().catch(() => {});
    setUser(null);
    setStatus('guest');
  }, []);

  const expire = useCallback(() => {
    setUser(null);
    setStatus('guest');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, expire }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** 数据请求收到 401 时调用：统一走会话失效处理 */
export function isUnauthorizedError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.code === 'UNAUTHORIZED');
}
