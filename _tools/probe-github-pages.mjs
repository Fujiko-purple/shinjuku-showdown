import { Browser, sleep } from './cdp.mjs';
const URL = 'https://fujiko-purple.github.io/shinjuku-showdown/';
const b = new Browser({ port: 9621, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  const t0 = Date.now();
  await b.send('Page.navigate', { url: URL });
  await sleep(20000);
  const st = await b.evaluate(`(() => {
    const c = document.getElementById('crash');
    const load = document.getElementById('loading');
    const bgm = document.getElementById('bgm');
    return {
      title: document.title,
      crash: !!(c && !c.classList.contains('hidden')),
      crashMsg: (document.getElementById('crash-msg')||{}).textContent || '',
      bootOk: (window.__BOOT||{}).ok, bootStep: (window.__BOOT||{}).step,
      hasSS: !!window.__SS,
      bgmSrcBefore: bgm ? (bgm.getAttribute('src')||'') : 'MISSING',
      bgmLazy: window.__BGM_LAZY ? window.__BGM_LAZY.loaded : null,
      canvas: (() => { const g = document.getElementById('gl'); return g ? [g.width, g.height] : null; })(),
    };
  })()`);
  console.log('加载 ' + ((Date.now()-t0)/1000).toFixed(1) + 's  ' + JSON.stringify(st, null, 1));
  // 交互 + 试玩
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(10000);
  for (const k of ['KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 50); await sleep(200); }
  await sleep(2500);
  const play = await b.evaluate(`(() => {
    const s = window.__SS && window.__SS.snap;
    return { mode: s ? s.mode : null, gHp: s ? +s.gojo.hp.toFixed(0) : null, sHp: s ? +s.sukuna.hp.toFixed(0) : null,
             bgm: window.__BGM_STATE ? window.__BGM_STATE() : null };
  })()`);
  console.log('试玩 ' + JSON.stringify(play));
  await b.screenshot('shots/GITHUB-live.png');
  const sw = await b.evaluate(`(async () => { if (!navigator.serviceWorker) return { supported:false }; const r = await navigator.serviceWorker.getRegistrations(); return { count: r.length, active: r.map(x=>!!x.active) }; })()`);
  console.log('SW ' + JSON.stringify(sw));
  console.log('页面错误 ' + JSON.stringify(b.errors.slice(0,3)));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
