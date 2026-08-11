/**
 * OpenAI 兼容供应商的 SSE 归一化 fetch 层。
 *
 * 背景：部分 OpenAI 兼容供应商（如商汤 sensenova）的流式响应不规范：
 * 1. SSE chunk 的 delta 缺失 role 字段 → LangChain 生成通用 ChatMessageChunk 而非
 *    AIMessageChunk，LangGraph 节点路由将其误判；
 * 2. 一次工具调用被拆成多个相同 index 的 chunk：首块带 id/name（args 为空），
 *    后续块只带 args 片段（id/name 为空字符串）→ LangChain 合并 tool_call 分片时
 *    空值覆盖首块的真实 id/name，工具调用被判定 malformed 而丢弃。
 *
 * 方案：在 openai SDK 标准的 fetch 覆盖点（ChatOpenAI configuration.fetch）修补
 * SSE 数据帧，不触碰 @langchain/openai 内部实现（旧版通过子类重写
 * _convertOpenAIDeltaToBaseMessageChunk 的方式在 1.x 中该方法已移除，且共享
 * 可变状态存在并发污染）。补全表以单次响应流为作用域（闭包捕获），
 * 并发请求天然隔离。
 */

interface CompatState {
  /** 同一响应流内按 index 记录最近一次带完整 id/name 的工具调用分片 */
  lastToolCall: Map<number, { id: string; name: string }>;
}

/** 修补单个 chat.completion.chunk 对象；非 chunk 结构原样返回 */
function patchChunkObject(obj: unknown, state: CompatState): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.choices)) return obj;

  for (const choice of o.choices) {
    if (typeof choice !== 'object' || choice === null) continue;
    const delta = (choice as Record<string, unknown>).delta;
    if (typeof delta !== 'object' || delta === null) continue;
    const d = delta as Record<string, unknown>;

    if (typeof d.role !== 'string') {
      d.role = 'assistant';
    }

    if (Array.isArray(d.tool_calls)) {
      d.tool_calls = d.tool_calls.map((tc) => {
        if (typeof tc !== 'object' || tc === null) return tc;
        const t = tc as { index?: number; id?: string; function?: { name?: string } };
        const idx = t.index ?? 0;
        if (t.id && t.function?.name) {
          state.lastToolCall.set(idx, { id: t.id, name: t.function.name });
          return t;
        }
        const prev = state.lastToolCall.get(idx);
        if (!prev) return t;
        return {
          ...t,
          id: t.id || prev.id,
          function: { ...t.function, name: t.function?.name || prev.name },
        };
      });
    }
  }
  return o;
}

/** 处理一行完整的 SSE 文本（不含换行符）：data 帧修补后重发，其余原样透传 */
function processLine(line: string, state: CompatState, encoder: InstanceType<typeof TextEncoder>): Uint8Array {
  const m = /^data:(.*)$/.exec(line);
  if (!m) return encoder.encode(`${line}\n`);
  const payload = m[1].trim();
  if (!payload || payload === '[DONE]') return encoder.encode(`${line}\n`);
  try {
    const patched = patchChunkObject(JSON.parse(payload), state);
    return encoder.encode(`data: ${JSON.stringify(patched)}\n`);
  } catch {
    // 非 JSON 载荷原样透传，交给上层解析器处理
    return encoder.encode(`${line}\n`);
  }
}

/** 将 SSE 字节流逐行修补后重新输出（行缓冲跨网络分片的半行数据） */
function normalizeSseBody(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state: CompatState = { lastToolCall: new Map() };
  let buf = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl = buf.indexOf('\n');
          while (nl >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            controller.enqueue(processLine(line.replace(/\r$/, ''), state, encoder));
            nl = buf.indexOf('\n');
          }
        }
        buf += decoder.decode();
        if (buf.trim()) controller.enqueue(processLine(buf.trimEnd(), state, encoder));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
    cancel(reason) {
      return body.cancel(reason);
    },
  });
}

/**
 * 构造带 SSE 归一化的 fetch：非 event-stream 响应（普通 JSON、错误页等）原样透传。
 * 每次调用共享同一个归一化 fetch 实例是安全的——状态按响应流隔离。
 * innerFetch 仅供测试注入，生产用默认的 globalThis.fetch。
 */
export function createCompatFetch(
  innerFetch: (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => ReturnType<typeof globalThis.fetch> = (input, init) => globalThis.fetch(input, init),
): typeof globalThis.fetch {
  return async (input, init) => {
    const res = await innerFetch(input, init);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream') || !res.body) return res;
    const headers = new Headers(res.headers);
    // 传入的 body 已是解压后的字节流，避免误导性描述头
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(normalizeSseBody(res.body), {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
