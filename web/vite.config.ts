import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    // 关闭自动清空输出目录：当前沙箱环境的安全删除（trash）机制在清空 dist/ 时会中断，
    // 导致 vite build 失败。关闭后旧哈希资源不会被引用，不影响产物正确性。
    emptyOutDir: false,
  },
});
