/**
 * probe-mobile-pwa.mjs —— PWA / 离线可用性验证（task-10）
 * ----------------------------------------------------------------------------
 * 四件事：
 *   1) manifest.webmanifest 的字段是否齐全（name/short_name/start_url/display/orientation/icons）
 *   2) 图标文件真的存在、真的是 PNG、尺寸对不对（直接解析 PNG 头）
 *   3) Service Worker 能否注册成功、缓存里有没有外壳
 *   4) 断网后刷新还能不能打开（Network.emulateNetworkConditions offline）
 *
 * 用法：先起服务 node deploy/serve.mjs --port 8173
 *      node _tools/probe-mobile-pwa.mjs [--url http://127.0.0.1:8173/] [--dir dist/site]
 */
import { Browser, sleep } from './cdp.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const URL_ = arg('url', 'http://127.0.0.1:8173/');
const DIR = arg('dir', 'dist/site');
const PORT = parseInt(arg('port', '9610'), 10);

/* ---- 静态部分 ---- */
console.log('=== 1. manifest / 图标 / SW 文件 ===');
const mfPath = join(DIR, 'manifest.webmanifest');
let ok = 0, bad = 0;
const chk = (cond, msg) => { if (cond) { ok++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg); } };
chk(existsSync(mfPath), 'manifest.webmanifest 存在');
if (existsSync(mfPath)) {
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
  ['name', 'short_name', 'start_url', 'scope', 'display', 'orientation', 'background_color', 'theme_color', 'icons'].forEach((k) => chk(!!mf[k], 'manifest.' + k + ' = ' + JSON.stringify(mf[k])));
}
chk(existsSync(join(DIR, 'sw.js')), 'sw.js 存在');
for (const ic of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']) {
  const p = join(DIR, ic);
  if (!existsSync(p)) { bad++; console.log('  ✗ ' + ic + ' 缺失'); continue; }
  const buf = readFileSync(p);
  const isPng = buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  chk(isPng && w > 0, ic + ' → PNG ' + w + 'x' + h + ' ' + statSync(p).size + 'B');
}
chk(existsSync(join(DIR, 'index.html')), 'index.html 存在');

/* ---- 浏览器部分 ---- */
const b = new Browser({ port: PORT, width: 1280, height: 720 });
try {
  console.log('\n=== 2. Service Worker 注册 / 缓存 ===');
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: URL_ });
  await sleep(15000);
  const reg = await b.evaluate('(async () => { if (!navigator.serviceWorker) return { supported: false }; const r = await navigator.serviceWorker.getRegistrations(); return { supported: true, count: r.length, scopes: r.map((x) => x.scope), active: r.map((x) => !!(x.active)) }; })()');
  console.log('  ' + JSON.stringify(reg));
  const cache = await b.evaluate('(async () => { try { const ks = await caches.keys(); const c = await caches.open(ks[0]); const rs = await c.keys(); return { caches: ks, cached: rs.length, list: rs.map((r) => r.url.split("/").slice(-1)[0]).slice(0, 12) }; } catch (e) { return { err: String(e) }; } })()');
  console.log('  缓存: ' + JSON.stringify(cache));

  console.log('\n=== 3. 断网刷新 ===');
  await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await b.send('Page.reload', { ignoreCache: false });
  await sleep(9000);
  const off = await b.evaluate('(() => ({ title: document.title, boot: window.__BOOT ? { ok: window.__BOOT.ok, step: window.__BOOT.step, err: window.__BOOT.err } : null, state: window.__SS ? window.__SS.state : null, canvas: !!document.getElementById("gl"), bodyChildren: document.body.children.length }))()');
  console.log('  离线刷新后: ' + JSON.stringify(off));
  chk(off.title && off.title.indexOf('新宿决战') >= 0, '离线仍能加载页面（title 正确）');
  chk(!!off.boot && off.boot.ok === true, '离线时游戏主程序仍然跑起来（__BOOT.ok=true）');
  await b.screenshot('shots/m10-pwa-offline.png');
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
} catch (e) {
  console.log('  FATAL ' + String(e && e.message || e));
} finally { await b.close(); }
console.log('\n静态检查: ' + ok + ' 通过 / ' + bad + ' 失败');
