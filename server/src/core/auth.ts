import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

/**
 * 常数时间字符串比较：先各自取 sha256 摘要（等长），再 timingSafeEqual，
 * 避免逐字符比较的时序侧信道与长度泄露。
 */
function constantTimeEquals(a: string, b: string): boolean {
  const da = crypto.createHash('sha256').update(a, 'utf8').digest();
  const db = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(da, db);
}

/**
 * 可选访问令牌中间件：挂载在 /api 上，对所有数据/聊天路由统一生效。
 *
 * 行为：
 * - /health 健康检查、/auth/login、/auth/me 认证接口免鉴权
 *   （登录前拿不到任何会话，探针/登录流程不应被拦截）。
 * - 未配置 API_TOKEN 时全部放行（默认 localhost 开发场景，零摩擦）。
 * - 配置 API_TOKEN 后，其余 /api 路由必须携带 `Authorization: Bearer <token>`，
 *   否则返回 401。这样敏感接口（缓存清除、聊天、数据查询）在生产暴露时都有保护。
 */
export function requireToken(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/me') return next();
  if (!config.apiToken) return next();
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ') && constantTimeEquals(auth.slice(7), config.apiToken)) return next();
  res.status(401).json({ ok: false, error: '未授权：缺少有效的 API Token' });
}
