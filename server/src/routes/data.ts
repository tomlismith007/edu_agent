import { Router } from 'express';
import { config, deriveTerms } from '../core/config.js';
import { cache } from '../cache/cache.js';
import {
  DEPT_MAP,
  getCalendarEnriched,
  getCredits,
  getGraduation,
  getScores,
  getTeacherTimetable,
  getTimetable,
  getUserInfo,
} from '../services/index.js';

export const dataRouter = Router();

function sendError(res: import('express').Response, e: unknown): void {
  res.status(500).json({ ok: false, error: (e as Error).message });
}

const refreshFlag = (v: unknown): boolean => v === '1' || v === 'true';

dataRouter.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

dataRouter.get('/meta', async (_req, res) => {
  try {
    const user = await getUserInfo();
    res.json({ ok: true, user, deptMap: DEPT_MAP, currentTerm: config.currentTerm, terms: deriveTerms(config.currentTerm) });
  } catch (e) {
    sendError(res, e);
  }
});

/** 轻量学期枚举（无需登录）：返回当前学期 + 可回溯的历史学期列表，供前端选择器使用 */
dataRouter.get('/terms', (_req, res) => {
  res.json({ ok: true, currentTerm: config.currentTerm, terms: deriveTerms(config.currentTerm) });
});

dataRouter.get('/scores', async (req, res) => {
  try {
    const r = await getScores(String(req.query.term || ''), String(req.query.xsfs || 'all'), refreshFlag(req.query.refresh));
    res.json({ ok: true, ...r });
  } catch (e) {
    sendError(res, e);
  }
});

dataRouter.get('/timetable', async (req, res) => {
  try {
    const term = String(req.query.term || config.currentTerm);
    const r = await getTimetable(term, refreshFlag(req.query.refresh));
    res.json({ ok: true, term, ...r });
  } catch (e) {
    sendError(res, e);
  }
});

dataRouter.get('/teacher', async (req, res) => {
  try {
    const r = await getTeacherTimetable(
      {
        term: String(req.query.term || config.currentTerm),
        skyx: req.query.dept ? String(req.query.dept) : undefined,
        name: req.query.name ? String(req.query.name) : undefined,
        jszc: req.query.jszc ? String(req.query.jszc) : undefined,
      },
      refreshFlag(req.query.refresh),
    );
    res.json({ ok: true, ...r });
  } catch (e) {
    sendError(res, e);
  }
});

dataRouter.get('/calendar', async (req, res) => {
  try {
    const term = String(req.query.term || config.currentTerm);
    const r = await getCalendarEnriched(term, refreshFlag(req.query.refresh));
    res.json({ ok: true, ...r });
  } catch (e) {
    sendError(res, e);
  }
});

dataRouter.get('/graduation', async (req, res) => {
  try {
    const r = await getGraduation(refreshFlag(req.query.refresh));
    res.json({ ok: true, ...r });
  } catch (e) {
    sendError(res, e);
  }
});

dataRouter.get('/credits', async (req, res) => {
  try {
    const r = await getCredits(refreshFlag(req.query.refresh));
    res.json({ ok: true, ...r });
  } catch (e) {
    sendError(res, e);
  }
});

dataRouter.get('/cache', (_req, res) => {
  res.json({ ok: true, stats: cache.stats() });
});

// 缓存清除受全局 requireToken 中间件保护（配置 API_TOKEN 后须 Bearer 携带）
dataRouter.post('/cache/clear', (_req, res) => {
  cache.invalidateAll();
  res.json({ ok: true });
});
