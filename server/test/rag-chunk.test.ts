/**
 * 清洗 + 切分离线单测（用真实页面夹具，不依赖网络/Chroma）。
 * 直跑：npx tsx test/rag-chunk.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupeBlocks, htmlToCleanText } from '../src/rag/clean.js';
import { parseDetail } from '../src/services/graduation.js';
import { buildPlanDocument } from '../src/rag/serialize.js';
import { chunkDocument } from '../src/rag/chunk.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const detailHtml = fs.readFileSync(path.join(dir, 'fixtures', 'topyfamx.html'), 'utf8');

async function main(): Promise<void> {
  // ---- clean ----
  const longText = '本专业培养适应区域经济社会发展需要的德智体美劳全面发展的高级应用型专门人才，';
  const dirty = `<p>${longText}<b>第一段</b>内容，用于重复去重判定。</p><!-- 注释 --><p>${longText}第一段内容用于重复去重判定</p>`;
  const cleaned = htmlToCleanText(dirty);
  assert.ok(!cleaned.includes('<'), '应剥掉全部标签');
  assert.ok(!cleaned.includes('注释'), '应剔除 HTML 注释');
  const deduped = dedupeBlocks(cleaned);
  assert.equal(deduped.match(/第一段/g)?.length, 1, '近重复段落只保留一次');
  console.log('rag-chunk.test: 清洗/去重 ✓');

  // ---- serialize + chunk（真实培养方案夹具）----
  const detail = parseDetail(detailHtml);
  assert.ok(detail.courses.length > 0, '夹具应解析出课程');
  const doc = buildPlanDocument(detailHtml, detail);
  assert.ok(doc.markdown.includes('毕业合格标准'), '应包含毕业合格标准章节');
  assert.ok(doc.meta.gradeYear === 2022, '应从页面提取年级 2022');
  assert.ok(doc.markdown.includes('|'), '应包含结构化表格');

  const chunks = chunkDocument(doc);
  assert.ok(chunks.length >= 10, `切分块数应 ≥10，实际 ${chunks.length}`);

  // 表格原子化：每个 table 块的首尾都是表格行，且子表完整（首行表头 + 末行是最后一门课）
  const tableChunks = chunks.filter((c) => c.metadata.kind === 'table');
  assert.ok(tableChunks.length >= 5, `体系子表块数应 ≥5，实际 ${tableChunks.length}`);
  for (const t of tableChunks) {
    assert.ok(t.text.includes('| ---'), `表格块 ${t.id} 应含分隔行`);
    assert.ok(t.text.trimEnd().endsWith('|'), `表格块 ${t.id} 不应被切断（应以表格行结尾）`);
  }

  // 体系子表完整性：思想政治课子表应包含该体系全部课程行（13 门 → 至少 13 个数据行）
  const szd = chunks.find((c) => c.metadata.section_path.includes('思想政治课') && c.metadata.kind === 'table');
  assert.ok(szd, '应存在思想政治课子表块');
  const rows = szd!.text.split('\n').filter((l) => l.startsWith('|')).length - 2;
  assert.equal(rows, 13, `思想政治课子表应有 13 门课程行，实际 ${rows}`);

  // 元数据完整性
  for (const c of chunks) {
    assert.equal(c.metadata.doc_id, doc.id);
    assert.ok(c.metadata.section_path.length > 0, `块 ${c.id} 应有章节路径`);
    assert.equal(c.metadata.grade_year, '2022');
  }

  // 尺寸上界：超长 prose 节应被二切（表格块原子化不受尺寸约束）
  const oversizedProse = chunks.filter((c) => c.metadata.kind === 'prose' && c.text.length > 512 * 1.5);
  assert.equal(
    oversizedProse.length,
    0,
    `不应有严重超长的 prose 块: ${oversizedProse.map((c) => `${c.id}(${c.text.length})`).join(',')}`,
  );

  console.log(`rag-chunk.test: 真实夹具切分 ${chunks.length} 块 / ${tableChunks.length} 张表格 ✓`);
  console.log('rag-chunk.test: 全部断言通过 ✓');
}

main().catch((e) => {
  console.error('rag-chunk.test: 失败');
  console.error(e);
  process.exit(1);
});
