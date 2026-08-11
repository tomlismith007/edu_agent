/**
 * RAG 三层路由 L1 规则层离线单测（不依赖网络/Chroma）。
 * 直跑：npx tsx test/rag-router.test.ts
 */
import assert from 'node:assert/strict';
import { l1Classify } from '../src/rag/router.js';

const CASES: [string, 'retrieve' | 'skip' | 'ambiguous'][] = [
  ['培养方案里专业选修课要修满多少学分？', 'retrieve'],
  ['毕业要求是什么？', 'retrieve'],
  ['我们学校公共选修课有什么规定？', 'retrieve'],
  ['转专业需要什么条件？', 'retrieve'],
  ['学制几年，授什么学位？', 'retrieve'],
  ['课程设置总表里思想政治课有哪些课？', 'retrieve'],
  ['我的成绩怎么样？', 'skip'],
  ['我的课表这学期有什么课？', 'skip'],
  ['今天第几周了？', 'skip'],
  ['帮我看下我的学分进度', 'skip'],
  ['你好呀', 'ambiguous'],
  [' 数据结构学什么？ ', 'ambiguous'],
  ['我挂科了会影响毕业吗？', 'ambiguous'], // 个人+知识同时命中 → 语义层
  ['我这学期绩点多少？', 'skip'],
  ['专业培养目标是什么', 'retrieve'],
];

async function main(): Promise<void> {
  for (const [text, expected] of CASES) {
    assert.equal(l1Classify(text), expected, `「${text}」应为 ${expected}`);
  }
  console.log(`rag-router.test: L1 规则层 ${CASES.length} 条断言全部通过 ✓`);

  // L3 兜底：RAG 未配置（测试环境无嵌入配置）时，任何输入都返回 agent 且不抛错
  const { routeQuery } = await import('../src/rag/router.js');
  const r = await routeQuery('培养方案里专业选修课要修满多少学分？', { semantic: false });
  assert.equal(r.mode, 'agent', '未配置 RAG 时应走 L3 兜底（agent 自决）');
  assert.equal(r.via, 'l3');
  console.log('rag-router.test: L3 兜底（未配置 → agent 自决）通过 ✓');
}

main().catch((e) => {
  console.error('rag-router.test: 失败');
  console.error(e);
  process.exit(1);
});
