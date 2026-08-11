/**
 * 会话一致性守卫与 Token 鉴权回归测试（M1/M3 修复的锁定用例）。
 *
 * 覆盖场景：
 * 1. requireUserSession：白名单放行 / 无会话 401 / app 会话与上游教务会话
 *    学号一致放行、不一致 401（换账号登录后旧浏览器会话必须整体失效）/
 *    上游无用户时放行（无数据可串读，设置页仍可用）；
 * 2. getConsistentUser（/auth/me 依赖）：不一致返回 null，避免探测出"假登录态"；
 * 3. requireToken：未配置放行 / 正确 Bearer 通过 / 错误 Token 401（常数时间比较）。
 *
 * 上游会话用户通过替换 SessionManager.getUser 的自有属性注入（测完恢复），
 * 不触发真实 CAS 登录。直跑脚本：npm run test:guard
 */
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { session, type UserInfo } from '../src/core/session.js';
import { config } from '../src/core/config.js';
import { requireToken } from '../src/core/auth.js';
import { createSession, getConsistentUser, requireUserSession } from '../src/core/user-session.js';

interface ResState {
  statusCode: number;
  body: unknown;
}

function mockRes(): { res: Response; state: ResState } {
  const state: ResState = { statusCode: 0, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
    cookie() {
      return this;
    },
    clearCookie() {
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

/** 构造带 edu_sid Cookie 的请求；path 为 /api 挂载点后的相对路径 */
function reqWithCookie(token: string, path: string): Request {
  return { headers: { cookie: `edu_sid=${token}` }, path } as unknown as Request;
}

/** 注入上游教务会话用户；返回恢复函数 */
function stubUpstreamUser(user: UserInfo | null): () => void {
  const holder = session as unknown as { getUser?: unknown };
  const hadOwn = Object.prototype.hasOwnProperty.call(session, 'getUser');
  const original = session.getUser();
  session.getUser = () => user;
  return () => {
    if (hadOwn) {
      session.getUser = () => original;
    } else {
      delete holder.getUser;
    }
  };
}

const USER_A: UserInfo = { name: '学生甲', studentId: '20220001' };
const USER_B: UserInfo = { name: '学生乙', studentId: '20220002' };

async function main(): Promise<void> {
  // ---- requireUserSession ----

  // 1a. 白名单路径无会话也放行
  {
    const { res, state } = mockRes();
    let nexted = false;
    const next: NextFunction = () => {
      nexted = true;
    };
    requireUserSession({ headers: {}, path: '/health' } as unknown as Request, res, next);
    assert.equal(nexted, true, '白名单 /health 应放行');
    assert.equal(state.statusCode, 0);
  }

  // 1b. 无 app 会话 → 401 UNAUTHORIZED
  {
    const { res, state } = mockRes();
    let nexted = false;
    requireUserSession({ headers: {}, path: '/scores' } as unknown as Request, res, () => {
      nexted = true;
    });
    assert.equal(nexted, false);
    assert.equal(state.statusCode, 401);
    assert.equal((state.body as { code?: string }).code, 'UNAUTHORIZED');
  }

  // 为 USER_A 签发一个 app 会话（cookie 回执捕获 token）
  const cookieRes = mockRes();
  let tokenValue = '';
  (cookieRes.res as unknown as { cookie: (n: string, v: string) => void }).cookie = (_n, v) => {
    tokenValue = v;
  };
  createSession(cookieRes.res, USER_A);
  assert.ok(tokenValue, 'createSession 应下发会话 token');

  // 1c. app 会话 A + 上游已切到 B → 401「登录态已切换」（M1 核心：防跨用户串读）
  {
    const restore = stubUpstreamUser(USER_B);
    try {
      const { res, state } = mockRes();
      let nexted = false;
      requireUserSession(reqWithCookie(tokenValue, '/scores'), res, () => {
        nexted = true;
      });
      assert.equal(nexted, false, '上游切换账号后旧会话不得放行');
      assert.equal(state.statusCode, 401);
      assert.equal((state.body as { code?: string }).code, 'UNAUTHORIZED');
      assert.match((state.body as { error?: string }).error ?? '', /登录态已切换/);
    } finally {
      restore();
    }
  }

  // 1d. app 会话 A + 上游同为 A → 放行
  {
    const restore = stubUpstreamUser(USER_A);
    try {
      const { res } = mockRes();
      let nexted = false;
      requireUserSession(reqWithCookie(tokenValue, '/chat'), res, () => {
        nexted = true;
      });
      assert.equal(nexted, true, '同一用户会话应放行');
    } finally {
      restore();
    }
  }

  // 1e. app 会话 A + 上游无用户 → 放行（无数据可串读）
  {
    const restore = stubUpstreamUser(null);
    try {
      const { res } = mockRes();
      let nexted = false;
      requireUserSession(reqWithCookie(tokenValue, '/settings/llm'), res, () => {
        nexted = true;
      });
      assert.equal(nexted, true, '上游无用户时应放行（设置页等仍可用）');
    } finally {
      restore();
    }
  }

  // ---- getConsistentUser（/auth/me 依赖）----
  {
    const restoreB = stubUpstreamUser(USER_B);
    assert.equal(getConsistentUser(reqWithCookie(tokenValue, '/auth/me')), null, '不一致时应返回 null');
    restoreB();

    const restoreA = stubUpstreamUser(USER_A);
    assert.deepEqual(getConsistentUser(reqWithCookie(tokenValue, '/auth/me')), USER_A);
    restoreA();

    const restoreNull = stubUpstreamUser(null);
    assert.deepEqual(getConsistentUser(reqWithCookie(tokenValue, '/auth/me')), USER_A, '上游无用户时返回会话用户');
    restoreNull();
  }

  // ---- requireToken（常数时间比较）----
  const originalToken = config.apiToken;
  try {
    config.apiToken = '';
    {
      const { res } = mockRes();
      let nexted = false;
      requireToken({ headers: {}, path: '/scores' } as unknown as Request, res, () => {
        nexted = true;
      });
      assert.equal(nexted, true, '未配置 apiToken 时应放行');
    }

    config.apiToken = 'secret-token-0123456789';
    {
      const { res } = mockRes();
      let nexted = false;
      requireToken(
        { headers: { authorization: 'Bearer secret-token-0123456789' }, path: '/scores' } as unknown as Request,
        res,
        () => {
          nexted = true;
        },
      );
      assert.equal(nexted, true, '正确 Token 应放行');
    }
    {
      const { res, state } = mockRes();
      let nexted = false;
      requireToken(
        { headers: { authorization: 'Bearer wrong-token' }, path: '/scores' } as unknown as Request,
        res,
        () => {
          nexted = true;
        },
      );
      assert.equal(nexted, false, '错误 Token 不得放行');
      assert.equal(state.statusCode, 401);
    }
    {
      const { res, state } = mockRes();
      requireToken({ headers: {}, path: '/scores' } as unknown as Request, res, () => undefined);
      assert.equal(state.statusCode, 401, '缺少 Authorization 头应 401');
    }
  } finally {
    config.apiToken = originalToken;
  }

  console.log('session-guard.test: 全部断言通过 ✓');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
