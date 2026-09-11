import { Browser, sleep } from './cdp.mjs';
const URL = 'https://shinjuku-showdown.pages.dev/';
const b = new Browser({ port: 9641, width: 1280, height: 720 });
const reqs = [];
try {
  await b.launch(); await b.newPage();
  b.on('Network.responseReceived', (p) => { try { reqs.push({ u: p.response.url.replace(URL, ''), s: p.response.status, t: p.response.headers['content-type'] || p.response.headers['Content-Type'] || '' }); } catch {} });
  const t0 = Date.now();
  await b.send('Page.navigate', { url: URL });
  await sleep(22000);
  const st = await b.evaluate(`(() => {
    const c = document.getElementById('crash');
    const bgm = document.getElementById('bgm');
    // 样式是否真的生效（比 HTTP 200 更硬的证据）
    const btn = document.querySelector('.btn.primary') || document.getElementById('btn-start');
    const cs = btn ? getComputedStyle(btn) : null;
    return {
      title: document.title,
      crash: !!(c && !c.classList.contains('hidden')),
      crashMsg: (document.getElementById('crash-msg')||{}).textContent || '',
      bootOk: (window.__BOOT||{}).ok, bootStep: (window.__BOOT||{}).step,
      hasSS: !!window.__SS,
      stylesApplied: cs ? { display: cs.display, padding: cs.padding, bg: cs.backgroundColor, radius: cs.borderRadius } : null,
      canvas: (() => { const g = document.getElementById('gl'); return g ? [g.width, g.height] : null; })(),
      bgmSrcBefore: bgm ? (bgm.getAttribute('src')||'') : 'MISSING',
    };
  })()`);
  console.log('加载 ' + ((Date.now()-t0)/1000).toFixed(1) + 's');
  console.log(JSON.stringify(st, null, 1));
  // 交互 + 试玩
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(10000);
  for (const k of ['KeyJ','KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 50); await sleep(180); }
  await sleep(2500);
  const play = await b.evaluate(`(() => { const s = window.__SS && window.__SS.snap; return { mode: s?s.mode:null, gHp: s?+s.gojo.hp.toFixed(0):null, sHp: s?+s.sukuna.hp.toFixed(0):null, bgm: window.__BGM_STATE?window.__BGM_STATE():null }; })()`);
  console.log('试玩 ' + JSON.stringify(play));
  await b.screenshot('shots/PAGES-live.png');
  const sw = await b.evaluate(`(async () => { if (!navigator.serviceWorker) return {supported:false}; const r = await navigator.serviceWorker.getRegistrations(); return {count:r.length, active:r.map(x=>!!x.active)}; })()`);
  console.log('SW ' + JSON.stringify(sw));
  const bad = reqs.filter(x => x.s >= 400);
  console.log('失败请求: ' + JSON.stringify(bad));
  console.log('资源 MIME: ' + JSON.stringify(reqs.slice(0, 10)));
  console.log('页面错误: ' + JSON.stringify(b.errors.slice(0,3)));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
