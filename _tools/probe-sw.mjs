import { Browser, sleep } from './cdp.mjs';
const URL = 'https://inline-concentrate-twin-fridge.trycloudflare.com/';
const b = new Browser({ port: 9472, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(22000);
  const sw = await b.evaluate(`(async () => {
    if (!navigator.serviceWorker) return { supported: false };
    const regs = await navigator.serviceWorker.getRegistrations();
    return { supported: true, count: regs.length, scopes: regs.map(r => r.scope), active: regs.map(r => !!(r.active)), installing: regs.map(r => !!(r.installing)) };
  })()`);
  console.log('SW 状态:', JSON.stringify(sw));
  // 二次访问应命中 SW 缓存（network-first 导航 + cache-first 静态）
  const cache = await b.evaluate(`(async () => { try { const keys = await caches.keys(); const c = await caches.open(keys[0]); const reqs = await c.keys(); return { caches: keys, cached: reqs.length, list: reqs.map(r => r.url.split('/').slice(-2).join('/')).slice(0, 10) }; } catch (e) { return { err: String(e).slice(0,80) }; } })()`);
  console.log('缓存:', JSON.stringify(cache));
  console.log('页面错误:', JSON.stringify(b.errors.slice(0,3)));
  await b.screenshot('shots/public-02.png');
} finally { await b.close(); }
