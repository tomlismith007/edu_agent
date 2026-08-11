/**
 * Agent 流式链路集成测试（不依赖真实 LLM / 教务系统）。
 *
 * 用 FakeToolCallingModel 驱动 createAgent（含本项目中间件栈）跑完整
 * 「模型 → 工具 → 模型」循环，验证 /chat 依赖的 streamEvents v2 约定：
 * 1. 模型事件的 metadata.langgraph_node 为 model_request（chat.ts 的 token 过滤值）；
 * 2. on_tool_start / on_tool_end / on_tool_error 事件可配对并取到 name/input/output；
 * 3. 工具失败走 on_tool_error（无 on_tool_end），toolErrorMiddleware 把异常转成
 *    "Error: ..." 的 ToolMessage 供模型自愈（最终 state 可见），而不是让图崩溃；
 * 4. toolRetryMiddleware 不重放业务性失败（无瞬时故障特征只执行一次）。
 *
 * 直跑脚本：npm run test:agent
 */
import assert from 'node:assert/strict';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { FakeToolCallingModel, createAgent } from 'langchain';
import { z } from 'zod';
import { agentMiddleware } from '../src/agent/middleware.js';

let echoCalls = 0;
let boomCalls = 0;

const echoTool = tool(
  async ({ q }) => {
    echoCalls += 1;
    return `结果:${q}`;
  },
  { name: 'echo', description: '回显查询', schema: z.object({ q: z.string() }) },
);

const boomTool = tool(
  async () => {
    boomCalls += 1;
    throw new Error('模拟业务失败');
  },
  { name: 'boom', description: '必定失败', schema: z.object({}) },
);

interface StreamEventShape {
  event: string;
  name?: string;
  data: { input?: unknown; output?: unknown; error?: Error };
  metadata?: { langgraph_node?: string };
}

async function main(): Promise<void> {
  const model = new FakeToolCallingModel({
    toolCalls: [
      [
        { name: 'echo', args: { q: 'hi' }, id: 'c1', type: 'tool_call' },
        { name: 'boom', args: {}, id: 'c2', type: 'tool_call' },
      ],
      [], // 第二轮无工具调用 → 循环结束
    ],
  });

  const agent = createAgent({
    model,
    tools: [echoTool, boomTool],
    systemPrompt: 'test',
    middleware: agentMiddleware,
  });

  const events: StreamEventShape[] = [];
  for await (const ev of await agent.streamEvents(
    { messages: [new HumanMessage('查一下')] },
    { version: 'v2', recursionLimit: 25 },
  )) {
    events.push(ev as unknown as StreamEventShape);
  }

  // 1) 模型事件节点名：chat.ts 依此过滤 token 来源
  const modelEvents = events.filter((e) => e.event.startsWith('on_chat_model_'));
  assert.ok(modelEvents.length >= 2, '至少两轮模型调用（发起工具调用 + 收尾）');
  for (const e of modelEvents) {
    assert.equal(e.metadata?.langgraph_node, 'model_request', '模型事件必须来自 model_request 节点');
  }

  // 2) 工具事件：成功 → start+end；失败 → start+error（langchain 1.x 语义）
  const starts = events.filter((e) => e.event === 'on_tool_start');
  const ends = events.filter((e) => e.event === 'on_tool_end');
  const errors = events.filter((e) => e.event === 'on_tool_error');
  assert.equal(starts.length, 2, '两个工具各触发一次 on_tool_start');
  assert.deepEqual(
    starts.map((e) => e.name).sort(),
    ['boom', 'echo'],
  );
  assert.equal(ends.length, 1, '只有成功的 echo 有 on_tool_end');
  assert.equal(errors.length, 1, '失败的 boom 走 on_tool_error');

  const echoEnd = ends.find((e) => e.name === 'echo')!;
  const boomErr = errors.find((e) => e.name === 'boom')!;
  // 1.x 载荷：on_tool_end.output 是 ToolMessage 实例（content/status 为直接属性，
  // JSON.stringify 时的 lc 信封是 toJSON 产物，直接属性访问不可见）；
  // on_tool_error.error 为「消息+堆栈」字符串
  const endContent = (out: unknown): string => {
    const c = (out as { content?: unknown })?.content;
    return c == null ? '' : String(c);
  };
  assert.equal(
    endContent(echoEnd.data.output),
    '结果:hi',
    `实际 output: ${JSON.stringify(echoEnd.data.output)?.slice(0, 400)}`,
  );
  assert.ok(String(boomErr.data.error).startsWith('模拟业务失败'));

  // 3) 中间件兜底：模型收到 "Error: ..." 的 ToolMessage，图未崩溃
  const result = await agent.invoke({ messages: [new HumanMessage('再查一次')] });
  const toolMsgs = result.messages.filter((m) => ToolMessage.isInstance(m));
  assert.ok(
    toolMsgs.some((m) => m.content === 'Error: 模拟业务失败'),
    '最终 state 应包含 toolErrorMiddleware 生成的错误 ToolMessage',
  );

  // 4) 业务性失败不重放
  assert.equal(boomCalls, 2, '两轮各失败一次，均无重试');
  assert.equal(echoCalls, 2);

  console.log('agent-stream.test: 全部断言通过 ✓');
}

main().catch((e) => {
  console.error('agent-stream.test: 失败');
  console.error(e);
  process.exit(1);
});
