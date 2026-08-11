import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './core/config.js';
import { requireToken } from './core/auth.js';
import { getLlmSettings } from './core/llm-settings.js';
import { requireUserSession } from './core/user-session.js';
import { authRouter } from './routes/auth.js';
import { chatRouter } from './routes/chat.js';
import { dataRouter } from './routes/data.js';
import { ragRouter } from './routes/rag.js';
import { settingsRouter } from './routes/settings.js';

const app = express();
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// 统一可选 token 鉴权：覆盖所有 /api 路由（/health 与 /auth 探测接口在中间件内放行）
app.use('/api', requireToken);
// 应用级登录守卫：未登录（无 edu_sid 会话）的请求一律 401
app.use('/api', requireUserSession);
app.use('/api', authRouter);
app.use('/api', dataRouter);
app.use('/api', ragRouter);
app.use('/api', chatRouter);
app.use('/api', settingsRouter);

// 生产模式托管 web/dist（单端口部署）
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(serverDir, '../../web/dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  // HTML 入口不缓存：浏览器每次重验，重新构建后立即可见新版本；
  // /assets 文件名带内容哈希，可安全长缓存
  app.use(
    express.static(webDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
      return;
    }
    next();
  });
}

app.listen(config.port, () => {
  const llm = getLlmSettings();
  console.log(`[edu-agent] server 已启动: http://localhost:${config.port}`);
  console.log('  认证方式: 登录页 (POST /api/auth/login)，不再读取 .env 凭据');
  console.log(
    `  LLM: ${llm.apiKey ? `${llm.provider} · ${llm.model} ✓` : '未配置（请在设置页「模型服务」添加并启用供应商）'}`,
  );
  console.log(`  缓存目录: ${config.cacheDir}`);
});
