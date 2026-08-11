import { toolErrorMiddleware, toolRetryMiddleware } from 'langchain';

/**
 * Agent 中间件栈。数组顺序 = 包裹层次（langchain 约定：第一个中间件在最外层）：
 *
 * 1. toolErrorMiddleware（最外层）：工具最终失败时把异常转换为 status:'error'
 *    的错误 ToolMessage（内容 "Error: ..."），模型可据此向用户如实说明失败原因
 *    ——等价旧版 ToolNode.handleToolErrors 的吞错语义；"/chat" 的 on_tool_end
 *    也据 ToolMessage.status 判定失败态传给前端。
 * 2. toolRetryMiddleware（内层）：仅对疑似瞬时故障（网络/超时/网关类）重试一次，
 *    重试耗尽后原样抛出（onFailure: 'error'），由外层错误中间件兜底；
 *    业务性失败（如"未找到该教师"）不匹配重试条件，不会被无谓重放。
 *
 * 有意不引入：
 * - humanInTheLoopMiddleware：全部工具均为只读查询，无高危操作需要人工确认；
 * - summarizationMiddleware：对话历史由客户端携带并截断，服务端保持无状态。
 */

const TRANSIENT_ERROR =
  /timeout|timed\s*out|econnaborted|econnreset|enotfound|etimedout|socket|hang\s*up|network|bad\s*gateway|service\s*unavailable|50[234]/i;

export const agentMiddleware = [
  toolErrorMiddleware({
    onError: (error, request) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[agent] 工具 ${request.toolCall.name} 执行失败: ${msg}`);
      return `Error: ${msg}`;
    },
  }),
  toolRetryMiddleware({
    maxRetries: 1,
    initialDelayMs: 800,
    retryOn: (e) => {
      const code = (e as { code?: string }).code ?? '';
      return TRANSIENT_ERROR.test(`${e instanceof Error ? e.message : String(e)} ${code}`);
    },
    onFailure: 'error',
  }),
];
