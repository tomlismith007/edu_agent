import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '..');

// npm workspaces 下 cwd 是 server/，必须显式加载项目根目录的 .env
dotenv.config({ path: path.join(repoRoot, '.env') });

/** 强智教务系统接口基地址（全项目单一来源：core/http.ts 与各 services） */
export const JXSD_BASE = 'http://jiaowu2.hufe.edu.cn/jsxsd';

export const config = {
  port: Number(process.env.PORT || 3000),
  cacheDir: process.env.CACHE_DIR ? path.resolve(process.env.CACHE_DIR) : path.join(repoRoot, 'cache'),
  /** 当前学期单一来源（避免学期 rollover 时散落多处硬编码） */
  currentTerm: (process.env.CURRENT_TERM || '2025-2026-2').trim(),
  /** 允许跨域的来源（CORS）。生产环境通过 ALLOWED_ORIGINS 显式指定 */
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** 可选 API 访问令牌：配置后，敏感/破坏性接口需携带 Authorization: Bearer <token> */
  apiToken: (process.env.API_TOKEN || '').trim(),
  /**
   * 允许 LLM 供应商使用本机/内网 Base URL（默认 false）。
   * 模型连通性测试默认经 url-guard 拦截内网/环回地址（防 SSRF）；
   * 使用本机 Ollama/LM Studio 等本地模型时需显式设为 1 放行。
   */
  llmAllowPrivateBaseUrl: process.env.LLM_ALLOW_PRIVATE_BASE_URL === '1',
  ttl: {
    scores: Number(process.env.CACHE_TTL_SCORES || 86400),
    timetable: Number(process.env.CACHE_TTL_TIMETABLE || 21600),
    teacher: Number(process.env.CACHE_TTL_TEACHER || 21600),
    calendar: Number(process.env.CACHE_TTL_CALENDAR || 3600),
    graduation: Number(process.env.CACHE_TTL_GRADUATION || 86400),
    credits: Number(process.env.CACHE_TTL_CREDITS || 86400),
  },
};

/**
 * 由当前学期推导可选的既往学期列表（含当前，由近及远）。
 * 教务系统（强智）不提供学期枚举接口，这里按"学年-学年-学期(1/2)"的规则生成，
 * 供前端学期选择器使用，避免硬编码。
 * 例：当前 2025-2026-2 → [2025-2026-2, 2025-2026-1, 2024-2025-2, 2024-2025-1, ...]
 */
export function deriveTerms(current: string, count = 12): string[] {
  const m = /^(\d{4})-(\d{4})-([12])$/.exec(current.trim());
  if (!m) return [current];
  let startYear = parseInt(m[1], 10);
  let sem = parseInt(m[3], 10); // 1 或 2
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${startYear}-${startYear + 1}-${sem}`);
    // 回退一个学期：上半年(1)→上一学年下半年(2)；下半年(2)→同学年上半年(1)
    if (sem === 1) {
      sem = 2;
      startYear -= 1;
    } else {
      sem = 1;
    }
  }
  return out;
}
