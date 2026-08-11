# RAG 知识库 Spec 契约

> 本文档是 RAG 模块的实现契约：数据结构、API 形状、路由规则、切分参数、评测门槛。
> 改动任何一层先改这份文档。实现入口：`server/src/rag/*`。

## 1. 总体架构

```
用户消息
  ↓
[L1 规则层] 正则词表，毫秒级：命中知识词 → 检索；命中个人数据词 → 跳过；歧义 ↓
[L2 语义层] 小 LLM 调用（max_tokens≈60, 3.5s 超时）：{"rag":bool,"query":"改写检索词"}
[L3 兜底层] L2 失败/超时/RAG 未配置 → 不预注入，search_school_knowledge 工具常驻，
            由 Agent tool-calling 自决（最坏退化为现状，不阻塞对话）
  ↓ 命中 retrieve
[Retriever] 稠密(Chroma top10) + 稀疏(BM25-lite top10) → RRF 融合 → 可选 rerank API → top4
  ↓
SystemMessage 前插进 agent messages（个人数据以工具为准，防串指令）
```

## 2. 配置

### 2.1 环境变量（server/src/rag/config.ts）

| 键 | 默认 | 说明 |
|---|---|---|
| `CHROMA_URL` | `http://localhost:8000` | Chroma 服务地址 |
| `RAG_COLLECTION` | `edu_kb` | collection 名 |
| `RAG_DENSE_TOPK` | `10` | 稠密召回数 |
| `RAG_SPARSE_TOPK` | `10` | 稀疏召回数 |
| `RAG_MIN_SCORE` | `0.30` | 稠密相似度下限（滤噪） |
| `RAG_CHUNK_SIZE` | `512` | 切分块上限（token 估算，中文≈字符数） |
| `RAG_CHUNK_OVERLAP` | `64` | 超长节二切重叠 |
| `RAG_L2_TIMEOUT_MS` | `3500` | 语义层超时 |

嵌入维度固定 **1024**（`RAG.dim`），不可配——collection 与测试均按此校验。

### 2.2 嵌入模型设置（复用 llm-settings 加密存储）

`cache/llm-providers.json` 的 `StoredStore` 增加可选段 `embedding?: StoredProvider | null`
（AES-256-GCM 加密 apiKey，旧存档缺字段视为 null）。`rerank` 段同构，可留空。

| 字段 | 说明 |
|---|---|
| `name/baseUrl/model` | OpenAI 兼容 `/embeddings` 端点 |
| `apiKey` | 密文存储；PUT 时留空 = 沿用已存 Key |

### 2.3 Chroma collection schema

- name：`edu_kb`；向量 1024 维；距离 cosine（创建时依次尝试 `configuration.vector{size:1024,distance:cosine}` → `metadata["hnsw:space"]="cosine"` → 裸创建+警告）。
- metadata：`doc_id, title, section_path, grade_year, major, kind(prose|table), embedding_model_id`。

### 2.4 索引登记 `cache/rag-index.json`

```json
{
  "embeddingModelId": "uuid",
  "embeddingModel": "bge-large-zh",
  "dim": 1024,
  "indexedAt": "ISO 时间",
  "docs": [{ "id": "plan-2022-数据科学与大数据技术", "title": "...", "gradeYear": 2022, "major": "...", "sections": 12, "chunks": 34 }],
  "chunks": [{ "id": "plan:3", "text": "...", "metadata": { "section_path": ["毕业合格标准及学分要求"] } }]
}
```
chunks 全文冗余存储（语料 <100KB）：供 BM25 离线直算与 rag-eval，避免检索依赖 Chroma 取原文。
**stale 判定**：`embeddingModelId` ≠ 当前设置中的 id，或 model 变更 → stale（提示重建，不自动重建）。

## 3. API 契约

### 3.1 嵌入模型设置（挂 /api 下，受登录守卫）

- `GET /api/settings/embedding` → `{ok, configured, name, baseUrl, model, apiKeyMasked, dim:1024}`
- `PUT /api/settings/embedding` body `{name?, baseUrl, model, apiKey?}` → 同 GET 视图；apiKey 留空沿用旧值；保存后置索引 stale。
- `POST /api/settings/embedding/test` body `{baseUrl?, model?, apiKey?}`（缺省用已存值）→
  成功 `{ok:true, latencyMs, dimension}`（**dimension 必须 1024，否则报错**）；失败 `{ok:false, error}`。
  出站经 url-guard（SSRF 防护，同 LLM 测试；`LLM_ALLOW_PRIVATE_BASE_URL=1` 放行内网）。

### 3.2 知识库运维

- `GET /api/rag/status` → `{ok, chroma:"ok"|"unreachable", chromaError?, embeddingConfigured, collection, chunks, indexedAt, stale, staleReason?, docs:[{id,title,gradeYear,major,chunks,indexedAt}]}`（Chroma 不可达不报 500，正常返回状态）
- `POST /api/rag/reindex` → 同步重建（拉培养方案→清洗→序列化→切分→嵌入→写入 Chroma + 登记文件）→
  `{ok, chunks, sections, tookMs}`；未配嵌入/Chroma 不可达 → 400 带原因。

### 3.3 检索工具（Agent 可调用）

工具名 `search_school_knowledge`，schema `{query: string}`，返回 JSON：
`{"hits":[{"section":"毕业合格标准及学分要求","text":"...","source":"《培养方案》2022级...","score":0.61}]}`；
零命中返回 `{"hits":[],"note":"知识库未命中，请如实告知用户"}`。

## 4. 切分策略（参数见 2.1）

1. **清洗**（`clean.ts`）：去 script/style/HTML 注释；`<p>`→段落、`<br>`→换行、`</td>`→tab；去标签后空白/全半角归一；**近重复段落去重**（规范化文本 hash，如「培养目标」全文出现两次只留一次）；剔除分配表的文字形态（保留结构化表格形态）。
2. **序列化**（`serialize.ts`）：结构化数据 → 分节 markdown，`##` 大节 / `###` 子节。课程设置总表按「体系」拆为 8-9 张子表（**表格原子化**：每张子表整体一个 chunk，绝不切断）；学分分配表整表一个 chunk。
3. **切分**（`chunk.ts`）：`MarkdownNodeParser` 按标题切节（metadata 带 section_path）→ 估算 token > `RAG_CHUNK_SIZE` 的节用 `SentenceSplitter(chunk_size=512, chunk_overlap=64)` 二切。
4. chunk id：`{doc_id}:{序号}`；kind 判定：正文含 markdown 表格行（`\n|`）→ `table`。

## 5. 检索与重排

- 稠密：LlamaIndex `VectorStoreIndex.fromVectorStore(ChromaVectorStore)` → `asRetriever(topK=10)`，score < `RAG_MIN_SCORE` 丢弃。
- 稀疏：`bm25.ts`（中文按字符 2-gram、ASCII 按词，k1=1.5 b=0.75）在登记文件 chunks 上直算 top10。
- 融合：RRF `score=Σ 1/(60+rank)`；chunk 原文含查询关键词（规范化后）额外 +0.01/词 加权。
- 重排（`rerank.ts`，可选）：已配置 rerank 供应商时 `POST {baseUrl}/rerank` body `{model, query, documents:[原文...], top_n:4}`，兼容 Jina/SiliconFlow/DashScope 返回 `{results:[{index, relevance_score}]}`；失败/未配置 → 直接用融合序。**不使用 LLM 重排**（延迟不可控）。
- 最终返回 top4 `{section, text, source, score}`。

## 6. 注入格式（chat.ts）

命中时在 messages 数组最前插入 SystemMessage：

```
【校内知识库检索结果】（来源：《培养方案》…；回答规定类问题时引用下列原文并注明章节）
[1] 章节：… 
原文：…
——
学生个人数据（成绩/学分/课表/进度）一律以工具计算结果为准，禁止用上述检索内容推断个人情况。
```

## 7. 评测契约（`server/test/rag-eval.ts`）

- 语料：fixture `topyfamx.html` 生成的培养方案文档（离线可跑 chunk 部分）。
- 22 条 QA 对：每条 `{query, expectSection}` 或 `{query, expectTextIncludes}`，覆盖学分数字（17/11/16/42/21/20/24.5/10/161.5）、模块规则（限选+任选合并 20）、课程归属、培养目标、学制学位、核心课程。
- 指标：**hit@4 ≥ 0.85**（期望章节出现在 top4）、MRR 报告。
- Chroma / 嵌入未配置 → 打印 SKIPPED 退出 0；配置后 `npm run test:rag` 回归。

## 8. 数据充分性与扩展

现有语料（培养方案全文+分配表+毕业标准+课程总表）足够启动与验证管线。扩展路径：`server/docs/` 放入额外 md（学籍管理规定、选课办法、学位授予细则、奖助学金、转专业），reindex 时一并入库（R2，接口预留 `docs` 目录扫描）。

## 9. 验收清单

- [ ] 双端 build 通过；既有 test:encrypt/graduation/agent/guard 回归通过
- [ ] 离线单测全绿：L1 词表、BM25 排序、RRF 融合、清洗去重、切分表格原子化
- [ ] 设置页可配置嵌入模型，测试按钮返回 dimension=1024
- [ ] 知识库面板显示 Chroma 状态/chunk 数/stale 标记，重建按钮可用
- [ ] Chroma+嵌入就绪后：rag-eval hit@4 ≥ 0.85；对话中「专业选修课要修多少学分」类问题命中检索且引用章节；「我的成绩」不触发检索
