import { httpClient } from './http-client.js';
import fs from 'node:fs';
import path from 'node:path';
import qs from 'qs';
import { config, JXSD_BASE } from './config.js';
import { cache } from '../cache/cache.js';
import { aesEncrypt } from './encrypt.js';

const CAS_BASE = 'https://uia.hufe.edu.cn';
const LOGIN_URL = `${CAS_BASE}/cas/login`;
const SERVICE_URL = 'http://jiaowu2.hufe.edu.cn/sso.jsp';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface UserInfo {
  name: string;
  studentId: string;
}

/**
 * 会话管理器：Cookie 池持久化到 cache/session.json，
 * JSESSIONID 失效时自动重新登录，并发调用互斥（同一时间只登录一次）。
 *
 * 凭据来源：登录页面提交（运行时 set），只保留在内存中，绝不落盘。
 * 全局单活跃用户：换学号登录会清空数据缓存，避免上个用户的课表/成绩串读。
 */
class SessionManager {
  private cookiePool: string[] = [];
  private user: UserInfo | null = null;
  private sessionFile: string;
  private loginLock: Promise<void> | null = null;
  private username = '';
  private password = '';

  constructor() {
    this.sessionFile = path.join(config.cacheDir, 'session.json');
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8')) as { cookies?: string[]; user?: UserInfo | null };
      this.cookiePool = Array.isArray(raw.cookies) ? raw.cookies : [];
      this.user = raw.user || null;
    } catch {
      /* 首次运行无文件 */
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(config.cacheDir, { recursive: true });
      fs.writeFileSync(this.sessionFile, JSON.stringify({ cookies: this.cookiePool, user: this.user }, null, 2));
    } catch (e) {
      console.warn('[session] 保存会话失败:', (e as Error).message);
    }
  }

  get cookies(): string {
    return this.cookiePool.join('; ');
  }

  getUser(): UserInfo | null {
    return this.user;
  }

  mergeCookies(setCookie?: string[]): void {
    const newCookies = (setCookie || []).map((c) => c.split(';')[0]).filter(Boolean);
    let changed = false;
    for (const c of newCookies) {
      const name = c.split('=')[0];
      const idx = this.cookiePool.findIndex((old) => old.split('=')[0] === name);
      if (idx >= 0) {
        if (this.cookiePool[idx] !== c) {
          this.cookiePool[idx] = c;
          changed = true;
        }
      } else {
        this.cookiePool.push(c);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /** 会话失效：彻底清空 Cookie 池和用户信息，下次请求重新登录 */
  invalidate(): void {
    this.cookiePool = [];
    this.user = null;
    try {
      if (fs.existsSync(this.sessionFile)) {
        fs.unlinkSync(this.sessionFile);
      }
    } catch {
      /* ignore */
    }
  }

  /** 确保已登录；多路并发时只执行一次完整登录 */
  ensureLoggedIn(): Promise<void> {
    if (this.user && this.cookiePool.some((c) => c.startsWith('JSESSIONID='))) {
      return Promise.resolve();
    }
    if (!this.username || !this.password) {
      return Promise.reject(new Error('登录态缺失，请重新登录'));
    }
    if (!this.loginLock) {
      this.loginLock = this.doLogin().finally(() => {
        this.loginLock = null;
      });
    }
    return this.loginLock;
  }

  /**
   * 用登录页提交的凭据执行一次完整 CAS 登录（换账号时先清旧会话）。
   * 成功返回用户信息；失败清空凭据并向上抛出 CAS 的具体错误。
   */
  async login(username: string, password: string): Promise<UserInfo> {
    const prevStudentId = this.user?.studentId;
    this.invalidate();
    this.username = username.trim();
    this.password = password;
    try {
      await this.doLogin();
    } catch (e) {
      this.username = '';
      this.password = '';
      throw e;
    }
    const user = this.user!;
    // 缓存键不含用户维度：换学号必须整体失效，防止串到上一个用户的数据
    if (prevStudentId && prevStudentId !== user.studentId) {
      cache.invalidateAll();
    }
    return user;
  }

  /** 退出登录：丢弃凭据与上游会话（数据缓存保留，下次同账号登录仍可命中） */
  logout(): void {
    this.username = '';
    this.password = '';
    this.invalidate();
  }

  private async doLogin(): Promise<void> {
    // Step 1: 获取登录页，提取 execution + croypto
    const pageRes = await httpClient.get(`${LOGIN_URL}?service=${encodeURIComponent(SERVICE_URL)}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' },
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
    });
    this.mergeCookies(pageRes.headers['set-cookie']);
    const html = String(pageRes.data);
    const execution = (html.match(/id="login-page-flowkey"[^>]*>([^<]+)</) || [])[1]?.trim();
    const croypto = (html.match(/id="login-croypto"[^>]*>([^<]+)</) || [])[1]?.trim();
    if (!execution || !croypto) throw new Error('无法从登录页提取 execution/croypto，页面结构可能已变更');

    // Step 2: 提交登录（AES-ECB 加密密码；无验证码时 captcha_payload 加密 '{}'）
    const loginRes = await httpClient.post(
      LOGIN_URL,
      qs.stringify({
        username: this.username,
        password: aesEncrypt(croypto, this.password),
        croypto,
        type: 'UsernamePassword',
        _eventId: 'submit',
        geolocation: '',
        execution,
        captcha_code: '',
        captcha_payload: aesEncrypt(croypto, '{}'),
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: CAS_BASE,
          Referer: `${LOGIN_URL}?service=${encodeURIComponent(SERVICE_URL)}`,
          'User-Agent': UA,
          Cookie: this.cookies,
        },
        maxRedirects: 0,
        validateStatus: () => true,
      },
    );
    this.mergeCookies(loginRes.headers['set-cookie']);
    if (loginRes.status !== 302) {
      const raw = String(loginRes.data);
      const msg = raw.match(/login-error-msg[^>]*>([^<]+)/)?.[1]?.trim();
      const hints = raw.match(/[\u4e00-\u9fa5]{2,20}?(验证码|频繁|锁定|错误|失败|超时|过期|不存在|停用)[\u4e00-\u9fa5]{0,30}/g)?.slice(0, 10);
      console.error(`[session] CAS 登录失败 status=${loginRes.status} msg=${msg ?? '(无)'}`);
      if (hints) console.error(`[session] 错误关键字: ${JSON.stringify(hints)}`);
      throw new Error(`CAS 登录失败 (HTTP ${loginRes.status})${msg ? `: ${msg}` : ''}`);
    }
    const ticket = new URL(loginRes.headers.location).searchParams.get('ticket');
    if (!ticket) throw new Error('CAS 登录返回 302 但未携带 ticket');

    // Step 3: 票据验证，跟随跳转进入教务系统（剥离 ;jsessionid= URL 重写后缀）
    let url = `${SERVICE_URL}?ticket=${ticket}`;
    let user: UserInfo | null = null;
    for (let hop = 0; hop < 6; hop++) {
      const r = await httpClient.get(url, {
        headers: { 'User-Agent': UA, Cookie: this.cookies },
        maxRedirects: 0,
        validateStatus: () => true,
      });
      this.mergeCookies(r.headers['set-cookie']);
      if (r.status === 302 && r.headers.location) {
        let loc: string = r.headers.location;
        if (!loc.startsWith('http')) loc = JXSD_BASE + loc;
        url = loc.replace(/;jsessionid=[A-F0-9]+/i, '');
        continue;
      }
      const m = String(r.data).match(/>(.+)\((\d{10,})\)/);
      if (m) user = { name: m[1].trim(), studentId: m[2] };
      break;
    }
    if (!user) throw new Error('进入教务系统失败，未获得用户信息');
    this.user = user;
    this.save();
  }
}

export const session = new SessionManager();
