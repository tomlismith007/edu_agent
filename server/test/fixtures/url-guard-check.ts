import { assertSafeUrl } from '../../src/core/url-guard.js';

const cases: Array<[string, boolean]> = [
  ['http://127.0.0.1:10086/x', false],
  ['http://localhost:3000/x', false],
  ['http://192.168.1.1/jsxsd', false],
  ['http://10.0.0.5/x', false],
  ['http://[::1]/x', false],
  ['http://172.20.10.2/x', false],
  ['http://169.254.169.254/latest/meta-data', false],
  ['file:///etc/passwd', false],
  ['ftp://example.com/x', false],
  ['http://jiaowu2.hufe.edu.cn/jsxsd/pyfa/topyfamx', true],
  ['https://uia.hufe.edu.cn/cas/login', true],
];

let failed = 0;
for (const [url, expectPass] of cases) {
  let pass = true;
  let msg = '';
  try {
    await assertSafeUrl(url);
  } catch (e) {
    pass = false;
    msg = (e as Error).message;
  }
  if (pass !== expectPass) {
    failed++;
    console.error(`✗ ${url}: 期望${expectPass ? '放行' : '拦截'}，实际${pass ? '放行' : `拦截(${msg})`}`);
  } else {
    console.log(`✓ ${url} -> ${pass ? '放行' : '拦截'}`);
  }
}
if (failed) process.exit(1);
console.log('URL 守卫断言全部通过');
