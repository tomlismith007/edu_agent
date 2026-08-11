import { aesDecrypt, aesEncrypt } from '../src/core/encrypt.js';

console.log('='.repeat(60));
console.log('AES-ECB-PKCS7 加密逻辑验证 (TS 移植)');
console.log('='.repeat(60));

const TEST_CASES = [
  { name: '密码加密验证', key: 'YnHmFS0kCcjy4oAtEtyxvg==', plaintext: 'testpassword', expected: '7oBnwMipFavNCcOtBIeKjw==' },
  { name: '空字符串验证', key: 'YnHmFS0kCcjy4oAtEtyxvg==', plaintext: '', expected: '6VkJDGybUcxQdHYJQUUTyw==' },
  { name: '验证码加密验证', key: 'YnHmFS0kCcjy4oAtEtyxvg==', plaintext: '1234', expected: '5nWwlVbzaibx/j928nW13w==' },
];

let allPassed = true;
for (const tc of TEST_CASES) {
  const enc = aesEncrypt(tc.key, tc.plaintext);
  const encOk = enc === tc.expected;
  const dec = aesDecrypt(enc, tc.key);
  const decOk = dec === tc.plaintext;
  console.log(`\n[${tc.name}]`);
  console.log(`  加密: ${enc} ${encOk ? '✓' : `✗ (预期 ${tc.expected})`}`);
  console.log(`  解密: "${dec}" ${decOk ? '✓' : '✗'}`);
  if (!encOk || !decOk) allPassed = false;
}

console.log('\n' + '='.repeat(60));
console.log(allPassed ? '所有测试通过 ✓' : '存在测试失败 ✗');
console.log('='.repeat(60));
process.exit(allPassed ? 0 : 1);
