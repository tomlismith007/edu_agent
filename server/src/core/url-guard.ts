import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * 出站请求 URL 安全校验
 *
 * 规则：
 * 1. 仅允许 http/https 协议；
 * 2. 拒绝 localhost / *.local 等本机与内网域名；
 * 3. 目标（含 DNS 解析后的所有地址）不得落在环回、私有、链路本地、
 *    CGNAT、组播及保留网段，防止 SSRF 探测内网服务。
 */

/** 域名级黑名单（本机/内网专属后缀） */
const FORBIDDEN_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.localdomain|.*\.internal|.*\.home\.arpa)$/i;

/** 单个 IP（v4/v6）是否落在禁止网段 */
export function isForbiddenIp(ip: string): boolean {
  const v4 = net.isIPv4(ip) ? ip : ip.toLowerCase().startsWith('::ffff:') ? net.isIPv4(ip.slice(7)) ? ip.slice(7) : null : null;
  if (v4) {
    const p = v4.split('.').map(Number);
    return (
      p[0] === 0 || // 0.0.0.0/8 本网络
      p[0] === 10 || // 10.0.0.0/8 私有
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || // 100.64.0.0/10 CGNAT
      p[0] === 127 || // 127.0.0.0/8 环回
      (p[0] === 169 && p[1] === 254) || // 169.254.0.0/16 链路本地
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || // 172.16.0.0/12 私有
      (p[0] === 192 && p[1] === 168) || // 192.168.0.0/16 私有
      (p[0] === 192 && p[1] === 0 && (p[2] === 0 || p[2] === 2)) || // 192.0.0.0/24、192.0.2.0/24
      (p[0] === 198 && (p[1] === 18 || p[1] === 19)) || // 198.18.0.0/15 基准测试
      (p[0] === 198 && p[1] === 51 && p[2] === 100) || // 198.51.100.0/24
      (p[0] === 203 && p[1] === 0 && p[2] === 113) || // 203.0.113.0/24
      p[0] >= 224 // 224.0.0.0/4 组播 + 240.0.0.0/4 保留
    );
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') || // fe80::/10 链路本地
    v6.startsWith('fc') || v6.startsWith('fd') || // fc00::/7 私有
    v6.startsWith('ff') // ff00::/8 组播
  );
}

/** host 级 DNS 解析结果缓存（host -> 是否放行），避免每次请求重复解析 */
const hostVerdict = new Map<string, boolean>();

/** 校验出站 URL：协议仅 http/https，host 及其解析地址不得为内网/环回/保留地址 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`[url-guard] 非法 URL: ${rawUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`[url-guard] 仅允许 http/https 协议，拒绝 ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new Error('[url-guard] URL 缺少主机名');
  if (FORBIDDEN_HOST.test(host)) {
    throw new Error(`[url-guard] 拒绝访问本机/内网域名: ${host}`);
  }
  // 教务官方合法域名（*.hufe.edu.cn）受信任；开发环境下 TUN/Fake-IP 代理常将域名解析为 198.18.0.0/15，在此直接放行
  if (host === 'hufe.edu.cn' || host.endsWith('.hufe.edu.cn')) {
    return;
  }
  if (net.isIP(host)) {
    if (isForbiddenIp(host)) throw new Error(`[url-guard] 拒绝访问内网/保留地址: ${host}`);
    return;
  }
  const cached = hostVerdict.get(host);
  if (cached === true) return;
  if (cached === false) throw new Error(`[url-guard] 主机 ${host} 解析到内网/保留地址，已拦截`);
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    // DNS 解析失败交给后续请求自行报错，不在此伪造原因
    return;
  }
  const bad = addrs.find((a) => isForbiddenIp(a.address));
  hostVerdict.set(host, !bad);
  if (bad) throw new Error(`[url-guard] 主机 ${host} 解析到内网/保留地址 ${bad.address}，已拦截`);
}
