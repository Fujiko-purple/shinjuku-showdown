/**
 * serve.mjs —— 零依赖静态服务器（本机预览 dist/site/）
 * ----------------------------------------------------------------------------
 * 用途：
 *   1) 本地验证站点版（必须走 http://，否则 Service Worker 不会注册）
 *   2) 手机上用同一局域网访问：手机浏览器打开 http://<你的内网IP>:8173/
 *      （打印出的地址里已经带了内网 IP，扫码/手输都行）
 *   3) 顺便按 gzip 输出，方便看「真实首屏传输体积」
 *
 * 用法：node deploy/serve.mjs [--dir dist/site] [--port 8173] [--no-gzip]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { networkInterfaces } from 'node:os';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const DIR = resolve(arg('dir', 'dist/site'));
const PORT = parseInt(arg('port', '8173'), 10);
const GZIP = !argv.includes('--no-gzip');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const GZIPPABLE = /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg)/;

if (!existsSync(DIR)) {
  console.error('目录不存在: ' + DIR + '\n先跑 node build/build.mjs');
  process.exit(1);
}

const stats = { hits: 0, bytes: 0, gzBytes: 0, gzipHits: 0 };

const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  const file = join(DIR, p.replace(/^\/+/, ''));
  if (!file.startsWith(DIR) || !existsSync(file) || statSync(file).isDirectory()) {
    const nf = join(DIR, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(existsSync(nf) ? readFileSync(nf) : 'Not Found');
    return;
  }
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const size = statSync(file).size;
  const headers = { 'content-type': type, 'cache-control': 'no-cache' };
  const raw = readFileSync(file);
  const accept = String(req.headers['accept-encoding'] || '');
  if (GZIP && GZIPPABLE.test(type) && accept.includes('gzip')) {
    const z = gzipSync(raw, { level: 9 });
    headers['content-encoding'] = 'gzip';
    if (z.length < raw.length) {
      res.writeHead(200, headers);
      res.end(z);
      stats.hits++; stats.bytes += raw.length; stats.gzBytes += z.length; stats.gzipHits++;
      return;
    }
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  res.end(raw);
  stats.hits++; stats.bytes += size;
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  const ifs = networkInterfaces();
  for (const k of Object.keys(ifs)) for (const a of ifs[k] || []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  console.log('新宿决战 → http://127.0.0.1:' + PORT + '/');
  ips.forEach((ip) => console.log('   手机同网段 → http://' + ip + ':' + PORT + '/'));
  console.log('   目录: ' + DIR + '   (gzip: ' + (GZIP ? 'on' : 'off') + ')');
  process.on('SIGINT', () => {
    console.log('\n传输统计: ' + stats.hits + ' 个请求, 原始 ' + (stats.bytes / 1048576).toFixed(2) + ' MB, gzip 后 ' + (stats.gzBytes / 1048576).toFixed(2) + ' MB (' + stats.gzipHits + ' 个压缩)');
    process.exit(0);
  });
});
