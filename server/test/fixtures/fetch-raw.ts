/**
 * 用服务器生产同款代码路径（http.ts + session.json Cookie 池）抓取培养方案明细原始响应，
 * 用于验证解析器对真实服务器字节（而非浏览器 outerHTML）的兼容性。
 * 运行：npx tsx test/fixtures/fetch-raw.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJ } from '../../src/core/http.js';
import { parseDetail } from '../../src/services/graduation.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const r = await getJ('http://jiaowu2.hufe.edu.cn/jsxsd/pyfa/topyfamx?Ves632DSdyV=NEW_XSD_PYGL');
const html = String(r.data);
const target = path.join(dir, 'topyfamx_raw.html');
fs.writeFileSync(target, html, 'utf8');
console.log('HTTP', r.status, '长度', html.length);

const detail = parseDetail(html);
console.log('解析课程数:', detail.courses.length, '分配表行数:', detail.reqs.length, '年级:', detail.gradeYear);
const upper = /<TD[^>]*>/.test(html);
console.log('原始响应含大写 <TD> 标签:', upper);
if (!detail.courses.length) {
  console.error('解析失败：前 300 字符 =', html.slice(0, 300));
  process.exit(1);
}
console.log('示例:', JSON.stringify(detail.courses.find((c) => c.code === '02033535')));
