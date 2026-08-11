import crypto from 'node:crypto';

/**
 * AES-ECB-PKCS7 加密（与湖南财政经济学院 CAS 登录系统一致）
 * 关键：密钥 croypto 是 Base64 编码的密钥字节，须先解码为原始字节；
 * 按 key 字节长度选择 aes-128/192/256-ecb（PKCS7 为 Node 默认填充），
 * 输出 base64 与原 crypto-js 实现 .toString() 逐字节一致（见 test/encrypt.test.ts 向量）。
 */
export function aesEncrypt(key: string, plaintext: string): string {
  const k = Buffer.from(key, 'base64');
  const cipher = crypto.createCipheriv(`aes-${k.length * 8}-ecb`, k, null);
  return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64');
}

export function aesDecrypt(ciphertext: string, key: string): string {
  const k = Buffer.from(key, 'base64');
  const decipher = crypto.createDecipheriv(`aes-${k.length * 8}-ecb`, k, null);
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
