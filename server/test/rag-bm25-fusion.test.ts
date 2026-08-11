/**
 * BM25-lite 与 RRF 融合离线单测。直跑：npx tsx test/rag-bm25-fusion.test.ts
 */
import assert from 'node:assert/strict';
import { BM25Index, tokenize } from '../src/rag/bm25.js';
import { fuseHits, rrfFuse } from '../src/rag/fusion.js';
import type { KbChunk } from '../src/rag/chunk.js';

function chunk(id: string, text: string): KbChunk & { id: string; text: string } {
  return {
    id,
    text,
    metadata: { doc_id: 'd', title: 'T', section_path: id, grade_year: '', major: '', kind: 'prose' },
  };
}

async function main(): Promise<void> {
  // ---- tokenize ----
  const tk = tokenize('专业选修课 Data Mining 学分');
  assert.ok(tk.includes('专业'), 'CJK 应产出 2-gram');
  assert.ok(tk.includes('业选'), 'CJK 2-gram 覆盖跨字组合');
  assert.ok(tk.includes('data'), 'ASCII 应小写化');
  assert.equal(tk.filter((t) => t === '学分').length > 0, true);
  console.log('rag-bm25-fusion.test: tokenize ✓');

  // ---- BM25 排序 ----
  const docs = [
    chunk('a', '思想政治课要求 17 学分，包括思想道德与法治等课程。'),
    chunk('b', '专业选修课为限选加任选，修满 20 学分即可，总池 52 学分。'),
    chunk('c', '今天是第几周，学期还剩几周。'),
  ];
  const index = new BM25Index(docs);
  const hits = index.search('专业选修课 学分', 2);
  assert.equal(hits[0].id, 'b', 'BM25 应把含全部查询词的块排第一');
  const empty = index.search('完全不相关词组xyzq', 2);
  assert.equal(empty.length, 0, '零分块不应返回');
  console.log('rag-bm25-fusion.test: BM25 排序 ✓');

  // ---- RRF 融合 ----
  const fused = rrfFuse([
    [{ id: 'x' }, { id: 'y' }],
    [{ id: 'y' }, { id: 'x' }],
  ]);
  // x: 1/61 + 1/62; y: 1/62 + 1/61 → 并列，都应存在
  assert.equal(fused.size, 2);
  assert.deepEqual([...fused.values()][0].from.includes('dense'), true);
  console.log('rag-bm25-fusion.test: RRF ✓');

  // ---- fuseHits：稠密滤噪 + 关键词加权 ----
  const byId = new Map(docs.map((d) => [d.id, d]));
  const out = fuseHits({
    dense: [
      { id: 'b', score: 0.82 },
      { id: 'noise', score: 0.1 }, // 低于 minScore 滤噪
      { id: 'c', score: 0.75 },
    ],
    sparse: [{ id: 'b', score: 9.1 }],
    byId,
    query: '专业选修课 学分',
    minScore: 0.3,
  });
  assert.equal(out[0].id, 'b', '双路都命中且有关键词加权的块应排第一');
  assert.deepEqual(out[0].from.sort(), ['dense', 'sparse']);
  assert.ok(!out.some((h) => h.id === 'noise'), '低分噪声不应进入融合结果');
  console.log('rag-bm25-fusion.test: fuseHits ✓');

  console.log('rag-bm25-fusion.test: 全部断言通过 ✓');
}

main().catch((e) => {
  console.error('rag-bm25-fusion.test: 失败');
  console.error(e);
  process.exit(1);
});
