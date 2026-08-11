/**
 * SSE 归一化层回归测试（模拟商汤等 OpenAI 兼容供应商的不规范流式响应）。
 *
 * 覆盖场景：
 * 1. delta 缺失 role → 统一补为 assistant；
 * 2. 工具调用拆成多个同 index chunk，后续块 id/name 为空/缺失 → 用首块值补全；
 * 3. [DONE] 哨兵与注释行原样保留；
 * 4. SSE 帧跨网络分片切断时行缓冲正确重组；
 * 5. 非 event-stream 响应（JSON）不经过归一化原样透传。
 *
 * 直跑脚本：npm run test:agent
 */
import assert from 'node:assert/strict';
import { createCompatFetch } from '../src/agent/openai-compat-fetch.js';

interface Chunk {
  choices: { index: number; delta: Record<string, unknown> }[];
}

function chunk(delta: Record<string, unknown>): Chunk {
  return { choices: [{ index: 0, delta }] };
}

/** 商汤风格：delta 无 role；tool_calls 后续分片 id/name 为空字符串或缺失 */
const INPUT_FRAMES: unknown[] = [
  chunk({ content: '正在' }),
  chunk({ content: '查询' }),
  chunk({
    tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_scores', arguments: '' } }],
  }),
  chunk({
    tool_calls: [{ index: 0, id: '', function: { name: '', arguments: '{"term":"2025-2026-2",' } }],
  }),
  chunk({
    tool_calls: [{ index: 0, function: { arguments: '"xsfs":"all"}' } }],
  }),
  { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  chunk({ content: '好了' }),
];

const SSE_TEXT =
  INPUT_FRAMES.map((f) => `data: ${JSON.stringify(f)}`).join('\n\n') +
  '\n\n: keep-alive\n\ndata: [DONE]\n\n';

/** 按给定字节位点把 SSE 文本切成不规则分片，模拟网络传输 */
function fragment(text: string, cuts: number[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const parts: Uint8Array[] = [];
  let prev = 0;
  for (const c of cuts) {
    if (c > prev && c < bytes.length) {
      parts.push(bytes.slice(prev, c));
      prev = c;
    }
  }
  parts.push(bytes.slice(prev));
  let i = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });
}

function jsonResponse(): Response {
  return new Response('{"ok":true}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function runCase(cuts: number[]): Promise<string> {
  const fetchFn = createCompatFetch(async () =>
    new Response(fragment(SSE_TEXT, cuts), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
  const res = await fetchFn('https://fake.local/v1/chat/completions', { method: 'POST' });
  assert.equal(res.status, 200);
  const buf = await res.arrayBuffer();
  return new TextDecoder().decode(buf);
}

function parseDataFrames(output: string): unknown[] {
  return output
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim());
}

async function main(): Promise<void> {
  // 同一组输入跑三种分片方式：整块 / 每帧中间切断 / 每 7 字节碎片化
  const outputs = await Promise.all([
    runCase([]),
    runCase([103, 211, 333, 470]),
    runCase(Array.from({ length: Math.floor(SSE_TEXT.length / 7) }, (_, i) => (i + 1) * 7)),
  ]);

  for (const out of outputs) {
    const frames = parseDataFrames(out);
    assert.equal(frames.at(-1), '[DONE]', '[DONE] 哨兵必须保留在结尾');
    assert.ok(out.includes(': keep-alive'), '注释行必须原样保留');

    const jsonFrames = frames.filter((f) => f !== '[DONE]').map((f) => JSON.parse(f)) as Record<string, unknown>[];
    assert.equal(jsonFrames.length, INPUT_FRAMES.length, 'data 帧数量不可变');

    for (const f of jsonFrames) {
      for (const c of f.choices as { delta: Record<string, unknown> }[]) {
        assert.equal(c.delta.role, 'assistant', '所有 delta 必须补上 assistant role');
      }
    }

    // 工具调用分片补全：后续块必须带回首块的 id/name
    const tcFrames = jsonFrames
      .flatMap((f) => f.choices as { delta: { tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[])
      .map((c) => c.delta.tool_calls)
      .filter(Boolean)
      .flat();
    assert.equal(tcFrames.length, 3);
    for (const tc of tcFrames) {
      assert.equal(tc.id, 'call_1', '工具调用分片 id 必须补全');
      assert.equal(tc.function?.name, 'get_scores', '工具调用分片 name 必须补全');
    }
    const args = tcFrames.map((tc) => tc.function?.arguments ?? '').join('');
    assert.equal(args, '{"term":"2025-2026-2","xsfs":"all"}', '参数分片不得丢失或重复');
  }

  // 非 SSE 响应透传
  const plain = createCompatFetch(async () => jsonResponse());
  const res = await plain('https://fake.local/v1/models', { method: 'GET' });
  assert.equal(await res.text(), '{"ok":true}');
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);

  console.log('sse-normalize.test: 全部断言通过 ✓');
}

main().catch((e) => {
  console.error('sse-normalize.test: 失败');
  console.error(e);
  process.exit(1);
});
