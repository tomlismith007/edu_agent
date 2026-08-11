import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Router } from 'express';
import { getAgent, requireApiKey } from '../agent/agent.js';
import { routeQuery } from '../rag/router.js';
import { retrieve, type KbHit } from '../rag/retrieve.js';

export const chatRouter = Router();

interface ChatMessage {
  role: string;
  content: string;
}

/** 知识库检索结果 → 预注入 SystemMessage（rag-spec.md §6） */
function kbContextMessage(hits: KbHit[]): SystemMessage {
  const body = hits
    .map((h, i) => `[${i + 1}] 章节：${h.section}\n原文：${h.text}`)
    .join('\n\n');
  return new SystemMessage(
    `【校内知识库检索结果】（来源：${hits[0].source}；回答规定类问题时引用下列原文并注明章节）\n\n${body}\n\n——\n学生个人数据（成绩/学分/课表/毕业进度）一律以数据工具的计算结果为准，禁止用上述检索内容推断个人情况。`,
  );
}

chatRouter.post('/chat', async (req, res) => {
  const { messages } = (req.body || {}) as { messages?: ChatMessage[] };
  if (!Array.isArray(messages)) {
    res.status(400).json({ ok: false, error: 'messages 必须为数组' });
    return;
  }

  try {
    requireApiKey();
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
    return;
  }

  const history = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)))
    .slice(-20);

  // RAG 三层路由：命中知识类问题则检索并预注入；任何失败静默降级（L3：工具仍在工具箱，模型自决）
  let agentMessages: (HumanMessage | AIMessage | SystemMessage)[] = history;
  try {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim();
    if (lastUser) {
      const routed = await routeQuery(lastUser);
      if (routed.mode === 'retrieve' && routed.query) {
        const hits = await retrieve(routed.query);
        if (hits.length) {
          agentMessages = [kbContextMessage(hits), ...history];
          console.log(`[rag] 命中注入 (${routed.via}) query="${routed.query}" hits=${hits.length}`);
        }
      }
    }
  } catch (e) {
    console.warn('[rag] 路由/检索失败，走兜底:', (e as Error).message);
  }

  const agent = getAgent();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (obj: unknown) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  // 客户端断开（关闭页面/取消请求）时中止 Agent 流，避免服务端继续空跑烧 LLM token。
  // 注意不能用 req.on('close')：Node 的 IncomingMessage 'close' 在请求体读完即触发，
  // 与连接断开无关，会误杀刚开始的流。用 res.on('close') + writableEnded 区分
  // 「正常完成」（writableEnded=true，res.end 已调用）与「客户端提前断开」。
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded && !ac.signal.aborted) {
      ac.abort();
    }
  });

  let full = '';
  let toolIdCounter = 0;
  const toolRunMap = new Map<string, number>();

  try {
    const stream = await agent.streamEvents({ messages: agentMessages }, { version: 'v2', signal: ac.signal, recursionLimit: 25 });
    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data.chunk as { content?: unknown } | undefined;
        const text = typeof chunk?.content === 'string' ? chunk.content : '';
        // langchain 1.x 中模型节点名为 model_request（旧版 0.2 为 agent），
        // 只透传模型节点的 token，排除工具节点等其他来源的模型事件
        if (text && (event.metadata as { langgraph_node?: string } | undefined)?.langgraph_node === 'model_request') {
          full += text;
          send({ type: 'token', content: text });
        }
      } else if (event.event === 'on_tool_start') {
        const id = ++toolIdCounter;
        if (event.run_id) {
          toolRunMap.set(event.run_id, id);
        }
        send({ type: 'tool_start', id, name: event.name, input: event.data.input });
      } else if (event.event === 'on_tool_end' || event.event === 'on_tool_error') {
        const id = (event.run_id && toolRunMap.get(event.run_id)) || ++toolIdCounter;
        if (event.run_id) {
          toolRunMap.delete(event.run_id);
        }
        // langchain 1.x：工具 runnable 抛错发 on_tool_error（无 on_tool_end），
        // toolErrorMiddleware 随后把异常转成 "Error: ..." 的工具结果给模型自愈。
        // on_tool_end 的 output 是 ToolMessage 实例（content/status 为直接属性），
        // 中间件转换的错误结果恒带 status:'error'（见 langchain toolError.js）；
        // on_tool_error 的 error 为「消息+堆栈」字符串，取首行作为失败原因。
        const out = event.data.output as { status?: string; content?: unknown } | undefined;
        const contentStr = typeof out?.content === 'string' ? out.content : undefined;
        const errorRaw = event.data.error;
        const isError = event.event === 'on_tool_error' || out?.status === 'error';
        send({
          type: 'tool_end',
          id,
          name: event.name,
          status: isError ? 'error' : 'success',
          output: isError
            ? typeof errorRaw === 'string'
              ? errorRaw.split('\n')[0]
              : (contentStr ?? String(errorRaw ?? out))
            : contentStr?.slice(0, 2000) ?? out,
        });
      }
    }
    send({ type: 'done', content: full });
  } catch (e) {
    // 客户端断开时 AbortError 属预期，连接已关闭无需再写错误事件
    if (ac.signal.aborted || (e as Error)?.name === 'AbortError') {
      console.log('[chat] 客户端断开，已中止 Agent 流');
    } else {
      send({ type: 'error', message: (e as Error).message });
    }
  } finally {
    res.end();
  }
});
