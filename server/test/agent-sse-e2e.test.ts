/**
 * 端到端冒烟（不依赖外网与真实供应商）：本地起一个「商汤风格」不规范的
 * OpenAI 兼容 SSE stub（delta 无 role、tool_calls 拆分且后续分片 id/name 为空），
 * 经 createCompatFetch 归一化后驱动真实 ChatOpenAI + createAgent 完整跑通
 * 「发起工具调用 → 执行工具 → 流式回答」两轮循环。
 *
 * 验证升级后最脆弱的链路：SSE 补丁 → openai SDK 解析 → AIMessageChunk 合并 →
 * LangGraph 工具路由 → 中间件 → token 流（model_request 过滤）。
 *
 * 直跑脚本：npm run test:agent
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { z } from 'zod';
import { agentMiddleware } from '../src/agent/middleware.js';
import { createCompatFetch } from '../src/agent/openai-compat-fetch.js';

let echoCalls = 0;
const echoTool = tool(
  async ({ q }) => {
    echoCalls += 1;
    return `结果:${q}`;
  },
  { name: 'echo', description: '回显查询', schema: z.object({ q: z.string() }) },
);

function startStubServer(): Promise<{ server: http.Server; baseUrl: string }> {
  let round = 0;
  const server = http.createServer((req, res) => {
    round += 1;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    // 所有 delta 均缺失 role（商汤风格）
    if (round === 1) {
      send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'echo', arguments: '' } }] } }] });
      send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: '', function: { name: '', arguments: '{"q":"h' } }] } }] });
      send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'i"}' } }] } }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
    } else {
      send({ choices: [{ index: 0, delta: { content: '查询' } }] });
      send({ choices: [{ index: 0, delta: { content: '完成' } }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1` });
    });
  });
}

async function main(): Promise<void> {
  const { server, baseUrl } = await startStubServer();
  try {
    const client = new ChatOpenAI({
      apiKey: 'stub-key',
      model: 'stub-model',
      configuration: { baseURL: baseUrl, fetch: createCompatFetch() },
      temperature: 0,
    });
    const agent = createAgent({
      model: client,
      tools: [echoTool],
      systemPrompt: 'test',
      middleware: agentMiddleware,
    });

    // 复刻 chat.ts 的事件消费逻辑
    let full = '';
    const toolStarts: string[] = [];
    const toolEnds: { name?: string; status: string; output: string }[] = [];
    for await (const ev of await agent.streamEvents(
      { messages: [new HumanMessage('查一下')] },
      { version: 'v2', recursionLimit: 25 },
    )) {
      const e = ev as {
        event: string;
        name?: string;
        data: { chunk?: { content?: unknown }; output?: { status?: string; content?: unknown }; error?: unknown };
        metadata?: { langgraph_node?: string };
      };
      if (e.event === 'on_chat_model_stream') {
        const text = typeof e.data.chunk?.content === 'string' ? e.data.chunk.content : '';
        if (text && e.metadata?.langgraph_node === 'model_request') full += text;
      } else if (e.event === 'on_tool_start') {
        toolStarts.push(e.name ?? '');
      } else if (e.event === 'on_tool_end' || e.event === 'on_tool_error') {
        const out = e.data.output as { status?: string; content?: unknown } | undefined;
        const content = typeof out?.content === 'string' ? out.content : String(e.data.error ?? '');
        toolEnds.push({
          name: e.name,
          status: e.event === 'on_tool_error' || out?.status === 'error' ? 'error' : 'success',
          output: content.split('\n')[0],
        });
      }
    }

    assert.equal(full, '查询完成', '归一化后 token 必须经 model_request 节点完整流出');
    assert.deepEqual(toolStarts, ['echo'], '商汤风格拆分 tool_calls 补全后必须成功路由到工具');
    assert.equal(echoCalls, 1);
    assert.equal(toolEnds.length, 1);
    assert.equal(toolEnds[0].status, 'success');
    assert.equal(toolEnds[0].output, '结果:hi');

    console.log('agent-sse-e2e.test: 全部断言通过 ✓');
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error('agent-sse-e2e.test: 失败');
  console.error(e);
  process.exit(1);
});
