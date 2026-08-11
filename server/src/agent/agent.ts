import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { getLlmSettings } from '../core/llm-settings.js';
import { agentMiddleware } from './middleware.js';
import { createCompatFetch } from './openai-compat-fetch.js';
import { allTools } from '../tools/index.js';

/** 工具清单首句简介：从 allTools 生成，避免与工具定义双份手工维护产生漂移 */
function toolGuideLine(name: string, description: string): string {
  const first = (description || '').split('。')[0];
  return `- ${name}: ${first}${first ? '。' : ''}`;
}

const toolGuide = allTools.map((t) => toolGuideLine(t.name, t.description)).join('\n');

export const SYSTEM_PROMPT = `你是湖南财政经济学院的教务助手"小教"，帮助用户查询教务数据。

你可以使用以下工具获取实时数据（均有缓存，时效见各工具说明，用户要求最新数据时可传 refresh=true）：
${toolGuide}

回答要求：
1. 需要用数据回答的问题必须先调用相应工具，不要编造数据。
2. 学年学期格式统一为 "2025-2026-2" 这样的形式。
3. 回答使用中文，数据用简洁的 Markdown 呈现：表格必须用标准管道语法（表头行 + |---|---| 分隔行，每条记录独占一行），不要用空格对齐模拟表格；简单数据用列表。
4. 若工具返回空或报错，如实说明。
5. 多个相关问题时可以一次调用多个工具。
6. 涉及培养方案、学分要求、毕业标准、学校规定等问题时，先调用 search_school_knowledge 检索知识库原文，回答时注明章节来源；学生个人数据（成绩/学分/进度）一律以数据工具的计算结果为准，禁止用知识库内容推断个人情况。`;

type EduAgent = ReturnType<typeof createAgent>;

let agentInstance: EduAgent | null = null;

export function getAgent(): EduAgent {
  if (!agentInstance) {
    const llm = getLlmSettings();
    const client = new ChatOpenAI({
      apiKey: llm.apiKey,
      model: llm.model,
      configuration: { baseURL: llm.baseUrl, fetch: createCompatFetch() },
      temperature: 0.1,
      maxRetries: 2,
    });
    agentInstance = createAgent({
      model: client,
      tools: allTools,
      systemPrompt: SYSTEM_PROMPT,
      middleware: agentMiddleware,
    });
  }
  return agentInstance;
}

/** 模型设置变更后丢弃缓存的 Agent 实例，下次请求按新配置重建 */
export function resetAgent(): void {
  agentInstance = null;
}

export function requireApiKey(): void {
  if (!getLlmSettings().apiKey) {
    throw new Error('尚未配置模型服务：请在「设置 → 模型服务」中添加并启用一个供应商');
  }
}
