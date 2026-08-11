import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { session, type UserInfo } from './session.js';

/**
 * 浏览器侧的应用会话（区别于 session.ts 中与教务系统之间的上游会话）。
 *
 * 模型：登录成功后签发随机 token，通过 HttpOnly Cookie（edu_sid）下发；
 * 服务端内存 Map 维护 token → 用户信息，滑动过期（默认 7 天）。
 * 教务密码只保留在 SessionManager 内存中，本模块不接触密码。
 */

const COOKIE_NAME = 'edu_sid';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 168) * 3600 * 1000; // 默认 7 天

interface AppSession {
  user: UserInfo;
  expiresAt: number;
}

const sessions = new Map<string, AppSession>();

/** 从 Cookie 头解析 edu_sid（避免为单个 cookie 引入 cookie-parser 依赖） */
function readToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === COOKIE_NAME) return part.slice(idx + 1).trim();
  }
  return null;
}

/** 创建会话并下发 Cookie；同一浏览器重复登录自动覆盖旧 token */
export function createSession(res: Response, user: UserInfo): string {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return token;
}

/** 读取当前请求的登录用户；命中则滑动续期，过期/不存在返回 null */
export function getSessionUser(req: Request): UserInfo | null {
  const token = readToken(req);
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() >= s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  s.expiresAt = Date.now() + SESSION_TTL_MS;
  return s.user;
}

/** 销毁当前请求的会话并清除 Cookie */
export function destroySession(req: Request, res: Response): void {
  const token = readToken(req);
  if (token) sessions.delete(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * 返回与上游教务会话一致的当前登录用户。
 * 无 app 会话、或上游已切换到其他学号（换账号登录）时返回 null——
 * 后者是数据安全不变量：app 会话用户 ≠ SessionManager 当前用户时，
 * 一切数据/聊天请求都不得放行，否则会读到别人的成绩课表。
 * 上游无用户（重启后无存档/已退出）时视为一致：此时无数据可串读。
 */
export function getConsistentUser(req: Request): UserInfo | null {
  const user = getSessionUser(req);
  if (!user) return null;
  const upstream = session.getUser();
  if (upstream && upstream.studentId !== user.studentId) return null;
  return user;
}

/**
 * 应用级登录守卫：挂在 /api 上，未登录一律 401。
 * 白名单：健康检查、学期枚举（纯配置）、认证接口自身。
 * code: 'UNAUTHORIZED' 供前端识别后跳转登录页。
 */
export function requireUserSession(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health' || req.path === '/terms' || req.path.startsWith('/auth/')) return next();
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: '未登录或会话已过期' });
    return;
  }
  const upstream = session.getUser();
  if (upstream && upstream.studentId !== user.studentId) {
    // 换账号登录使旧浏览器会话失效：读数据会串到新账号，必须整体拒绝
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: '登录态已切换，请重新登录' });
    return;
  }
  next();
}

/**
 * 登录接口限流（防爆破）：内存计数每 IP 每分钟最多 5 次失败。
 * 成功登录不清零计数意义不大（窗口只有 60s），保持实现最小。
 */
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 60_000;

export function isLoginThrottled(ip: string): boolean {
  const rec = loginFailures.get(ip);
  if (!rec || Date.now() >= rec.resetAt) return false;
  return rec.count >= FAIL_LIMIT;
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const rec = loginFailures.get(ip);
  if (!rec || now >= rec.resetAt) {
    loginFailures.set(ip, { count: 1, resetAt: now + FAIL_WINDOW_MS });
  } else {
    rec.count += 1;
  }
}
