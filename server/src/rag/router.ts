import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { getLlmSettings } from '../core/llm-settings.js';
import { RAG } from './config.js';
import { ragReady } from './retrieve.js';

/**
 * 三层路由（rag-spec.md §1）：
 * L1 规则层：词表毫秒级判定 retrieve / skip / ambiguous；
 * L2 语义层：仅歧义时一次小 LLM 调用，判是否检索并改写检索词；
 * L3 兜底层：L2 失败/超时/未配置 RAG → 不预注入，交由 Agent 的
 *    search_school_knowledge 工具自决（最坏退化为现状，不阻塞对话）。
 */

/** 学校规定/知识类词表（命中 → 直接检索） */
const RAG_HINTS =
  /(培养方案|培养目标|培养要求|毕业要求|毕业标准|合格标准|毕业结论|学分要求|课程体系|课程设置|专业核心课程|核心课程|选修课|必修课|限选|任选|公选课|通识教育|公共基础|学科基础|集中实践|总学分|毕业学分|学制|学位|辅修|转专业|重修|补考|缓考|修读|选课制度|学分构成)/;

/** 个人数据词表（命中且无知识词 → 跳过检索，走个人数据工具） */
const PERSONAL_HINTS = /(我的|本人|查我|我这学期|我这门|第几周|还剩几周|学期进度)/;

export type L1Verdict = 'retrieve' | 'skip' | 'ambiguous';

/** L1 规则层：纯函数，可离线单测 */
export function l1Classify(text: string): L1Verdict {
  const t = (text || '').trim();
  if (!t) return 'skip';
  const ragHit = RAG_HINTS.test(t);
  const personalHit = PERSONAL_HINTS.test(t);
  if (ragHit && !personalHit) return 'retrieve';
  if (personalHit && !ragHit) return 'skip';
  if (!ragHit && !personalHit) return 'ambiguous';
  // 两者同时命中（如"我挂科了会不会影响毕业"）→ 语义层裁决
  return 'ambiguous';
}

const L2_PROMPT = (text: string) =>
  [
    '你是校园助手的检索路由器。判断下面的用户消息是否需要查询「校内知识库」（内容：培养方案、毕业要求、学分规定、课程体系、学籍制度等静态规章）。',
    '问自己个人成绩/课表/进度等动态数据 → rag=false；闲聊/工具操作 → rag=false；询问学校规定/专业方案 → rag=true。',
    `用户消息：${text}`,
    '只输出一行 JSON：{"rag": true|false, "query": "适合检索的中文关键词短语"}',
  ].join('\n');

function parseL2(content: string): { rag: boolean; query: string } | null {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { rag?: unknown; query?: unknown };
    if (typeof j.rag !== 'boolean') return null;
    return { rag: j.rag, query: typeof j.query === 'string' ? j.query : '' };
  } catch {
    return null;
  }
}

export interface RouteResult {
  mode: 'retrieve' | 'skip' | 'agent';
  /** L1/L2 命中检索时使用的检索词（可能被 L2 改写） */
  query?: string;
  /** 命中来源，调试/日志用 */
  via: 'l1' | 'l2' | 'l3';
}

export async function routeQuery(text: string, opts: { semantic?: boolean } = {}): Promise<RouteResult> {
  const semantic = opts.semantic !== false;
  const ready = await ragReady().catch(() => ({ ok: false } as const));
  if (!ready.ok) return { mode: 'agent', via: 'l3' };

  const l1 = l1Classify(text);
  if (l1 === 'retrieve') return { mode: 'retrieve', query: text, via: 'l1' };
  if (l1 === 'skip') return { mode: 'skip', via: 'l1' };
  if (!semantic) return { mode: 'agent', via: 'l3' };

  // L2 语义层
  const llm = getLlmSettings();
  if (!llm.apiKey) return { mode: 'agent', via: 'l3' };
  try {
    const client = new ChatOpenAI({
      apiKey: llm.apiKey,
      model: llm.model,
      configuration: { baseURL: llm.baseUrl },
      temperature: 0,
      maxTokens: 80,
      timeout: RAG.l2TimeoutMs,
    });
    const res = await client.invoke([new HumanMessage(L2_PROMPT(text))]);
    const verdict = parseL2(String(res.content ?? ''));
    if (!verdict) return { mode: 'agent', via: 'l3' };
    if (verdict.rag) return { mode: 'retrieve', query: verdict.query || text, via: 'l2' };
    return { mode: 'skip', via: 'l2' };
  } catch {
    return { mode: 'agent', via: 'l3' };
  }
}
