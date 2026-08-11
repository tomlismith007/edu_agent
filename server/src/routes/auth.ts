import { Router } from 'express';
import { session } from '../core/session.js';
import {
  createSession,
  destroySession,
  getConsistentUser,
  isLoginThrottled,
  recordLoginFailure,
} from '../core/user-session.js';

export const authRouter = Router();

/** 登录：用提交的学号/密码到学校统一认证做一次真实 CAS 登录 */
authRouter.post('/auth/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (isLoginThrottled(ip)) {
    res.status(429).json({ ok: false, error: '尝试过于频繁，请 1 分钟后再试' });
    return;
  }

  const { username, password } = (req.body || {}) as { username?: string; password?: string };
  if (!username?.trim() || !password) {
    res.status(400).json({ ok: false, error: '请输入学号和密码' });
    return;
  }

  try {
    const user = await session.login(username, password);
    createSession(res, user);
    res.json({ ok: true, user });
  } catch (e) {
    recordLoginFailure(ip);
    // CAS 失败信息（密码错误/验证码/锁定等）已由 session.ts 提取，直接透传给前端展示
    res.status(401).json({ ok: false, error: (e as Error).message || '登录失败' });
  }
});

/** 当前登录用户：前端启动时探测登录态；上游已切换账号时同样视为未登录，避免探测出"假登录态" */
authRouter.get('/auth/me', (req, res) => {
  const user = getConsistentUser(req);
  if (!user) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: '未登录或会话已过期' });
    return;
  }
  res.json({ ok: true, user });
});

/** 退出：销毁浏览器会话与教务凭据 */
authRouter.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  session.logout();
  res.json({ ok: true });
});
