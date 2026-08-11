/**
 * RAG 检索质量评测（rag-spec.md §7）。语料来自真实页面夹具，离线可跑：
 * - 稀疏模式（默认，无需任何配置）：BM25 + RRF，评切分与序列化质量；
 * - 双路模式（已配置向量模型时自动启用）：加入稠密召回，评端到端召回质量。
 * 门槛：hit@4 ≥ 0.85。直跑：npx tsx test/rag-eval.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAIEmbedding } from '@llamaindex/openai';
import { parseDetail } from '../src/services/graduation.js';
import { buildPlanDocument } from '../src/rag/serialize.js';
import { chunkDocument, type KbChunk } from '../src/rag/chunk.js';
import { BM25Index } from '../src/rag/bm25.js';
import { fuseHits } from '../src/rag/fusion.js';
import { getEmbeddingConfig } from '../src/core/llm-settings.js';
import { RAG } from '../src/rag/config.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const detailHtml = fs.readFileSync(path.join(dir, 'fixtures', 'topyfamx.html'), 'utf8');

interface Qa {
  q: string;
  /** 命中判定：top4 中任一块 section_path 包含该串 */
  section?: string;
  /** 命中判定：top4 全部块文本的并集包含以下所有子串 */
  includes?: string[];
}

const QA: Qa[] = [
  { q: '专业选修课要修满多少学分？', includes: ['专业课', '选修', '20'] },
  { q: '思想政治课要求多少学分？', includes: ['思想政治课', '17'] },
  { q: '毕业总学分是多少？', includes: ['161.5'] },
  { q: '通识教育选修课也就是公选课要修多少学分？', includes: ['通识教育课', '选修', '10'] },
  { q: '集中实践课要求多少学分？', includes: ['集中实践课', '24.5'] },
  { q: '学科基础课要修多少学分？', includes: ['学科（专业）基础课', '42'] },
  { q: '专业必修课的学分要求是多少？', includes: ['专业课', '必修', '21'] },
  { q: '通识教育必修课要修满多少学分？', includes: ['通识教育课', '必修', '11'] },
  { q: '公共基础课的学分要求？', includes: ['公共基础课', '16'] },
  { q: '毕业合格标准是什么？', section: '毕业合格标准及学分要求' },
  { q: '这个专业的培养目标是什么？', section: '培养目标' },
  { q: '介绍一下这个专业', section: '专业简介' },
  { q: '学制几年，授予什么学位？', section: '学制与学位' },
  { q: '专业核心课程有哪些？', section: '专业核心课程' },
  { q: '培养要求对知识能力素质有什么要求？', section: '培养要求' },
  { q: '思想政治课模块有哪些课程？', section: '课程设置·思想政治课' },
  { q: '专业选修课的池子里有哪些课？', section: '课程设置·专业选修课' },
  { q: '学科基础课的课程设置有哪些？', section: '课程设置·学科' },
  { q: '集中实践有哪些实践环节？', section: '课程设置·集中实践课' },
  { q: '限选和任选课分别是什么？', section: '课程设置·专业选修课' },
  { q: '数据科学与大数据技术专业怎么样？', section: '专业简介' },
  { q: '毕业审核的官方口径是什么？', section: '毕业合格标准及学分要求' },
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

function isHit(qa: Qa, top: KbChunk[]): boolean {
  if (qa.section && top.some((c) => c.metadata.section_path.includes(qa.section!))) return true;
  if (qa.includes?.length) {
    const union = top.map((c) => c.text).join('\n');
    return qa.includes.every((s) => union.includes(s));
  }
  return false;
}

async function main(): Promise<void> {
  const detail = parseDetail(detailHtml);
  const doc = buildPlanDocument(detailHtml, detail);
  const chunks = chunkDocument(doc);
  console.log(`语料：《${doc.title}》 ${chunks.length} 块 / ${new Set(chunks.map((c) => c.metadata.section_path)).size} 节`);

  const sparseIndex = new BM25Index(chunks.map((c) => ({ id: c.id, text: c.text })));
  const byId = new Map(chunks.map((c) => [c.id, c]));

  // 稠密路（可选）
  let denseChunks: { id: string; score: number }[] | null = null;
  let queryDense: ((q: string) => Promise<{ id: string; score: number }[]>) | null = null;
  const cfg = getEmbeddingConfig();
  if (cfg) {
    try {
      const embed = new OpenAIEmbedding({
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseURL: cfg.baseUrl,
        dimensions: RAG.dim,
      });
      const texts = chunks.map((c) => c.text);
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += 16) {
        vectors.push(...(await embed.getTextEmbeddings(texts.slice(i, i + 16))));
      }
      if (vectors.some((v) => v.length !== RAG.dim)) {
        throw new Error(`嵌入返回维度与 ${RAG.dim} 不符，请检查向量模型`);
      }
      const chunkVec = new Map(chunks.map((c, i) => [c.id, vectors[i]]));
      denseChunks = chunks.map((c, i) => ({ id: c.id, score: 0 })); // 占位：检索时即时算相似度
      queryDense = async (q: string) => {
        const qv = await embed.getTextEmbedding(q);
        return chunks
          .map((c, i) => ({ id: c.id, score: cosine(qv, chunkVec.get(c.id)!) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, RAG.denseTopK);
      };
      void denseChunks;
      console.log(`稠密路已启用：${cfg.provider} · ${cfg.model}`);
    } catch (e) {
      console.warn(`稠密路启用失败（退化为纯稀疏模式）: ${(e as Error).message}`);
    }
  } else {
    console.log('未配置向量模型：稀疏模式（仅评切分/序列化质量）');
  }

  let hits = 0;
  let mrrSum = 0;
  const misses: string[] = [];
  for (const qa of QA) {
    const sparse = sparseIndex.search(qa.q, RAG.sparseTopK);
    let ranked: { id: string; score: number }[] = sparse;
    if (queryDense) {
      const dense = await queryDense(qa.q);
      ranked = fuseHits({ dense, sparse, byId, query: qa.q, minScore: RAG.minScore });
    }
    const top = ranked.slice(0, RAG.finalTopK).map((h) => byId.get(h.id)!);
    const first = top.findIndex((c) => isHit(qa, [c]));
    const hitTop4 = isHit(qa, top);
    if (hitTop4) {
      hits += 1;
      mrrSum += first >= 0 ? 1 / (first + 1) : 0.5; // 命中但需跨块拼证据时记 0.5
    } else {
      misses.push(qa.q);
    }
    console.log(`${hitTop4 ? '✓' : '✗'} ${qa.q}`);
  }

  const hitAt4 = hits / QA.length;
  const mrr = mrrSum / QA.length;
  console.log('='.repeat(50));
  console.log(`hit@4 = ${(hitAt4 * 100).toFixed(1)}%（${hits}/${QA.length}）  MRR = ${mrr.toFixed(3)}  门槛 0.85`);
  if (misses.length) console.log(`未命中：${misses.join(' | ')}`);

  if (hitAt4 < 0.85) {
    console.error('rag-eval: 低于 0.85 门槛 ✗');
    process.exit(1);
  }
  console.log('rag-eval: 通过 ✓');
}

main().catch((e) => {
  console.error('rag-eval: 执行失败');
  console.error(e);
  process.exit(1);
});
