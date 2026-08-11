# edu_agent

对接高校教务系统的 AI 助手：提供成绩、课表、教学周历、学分统计、毕业进度查询，以及基于 RAG 的培养方案问答。

## 结构

- `server/` — Node.js + TypeScript 后端（LangChain/LangGraph Agent、教务系统 CAS 会话、成绩/课表等服务、ChromaDB RAG）
- `web/` — React + Vite 前端（成绩、课表、学分、毕业进度看板与 AI 助手面板）

## 快速开始

```bash
npm install

# 配置环境变量
cp .env.example .env   # 填入教务账号与 OpenAI 兼容接口信息

npm run dev             # 同时启动 server 与 web
```

## 测试

```bash
npm run test:encrypt -w server
npm run test:agent -w server
npm run test:guard -w server
npm run test:rag -w server
```

## 安全说明

- 所有凭据（教务账号、API Key）仅通过 `.env` 提供，`.env` 已被 gitignore，仓库中只有占位模板 `.env.example`
- `server/test/fixtures/` 下的教务页面快照已做匿名化处理
