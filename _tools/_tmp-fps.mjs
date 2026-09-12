import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const file = resolve('dist/新宿决战.html');
const b = new Browser({ port: 9496, width: 1280, height: 720 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  const f0 = await ev('__SS.combat.frame');
  const t0 = Date.now();
  await sleep(3000);
  const f1 = await ev('__SS.combat.frame');
  const dt = (Date.now() - t0) / 1000;
  console.log('FRAME_RATE', JSON.stringify({ frames: f1 - f0, sec: dt, fps: +((f1 - f0) / dt).toFixed(1) }));
  // 真实 rAF 下，J 到命中的帧距
  await ev(`(() => { window.__H = { press: -1, hitF: -1, t: [] };
    (function l(){ const S = window.__SS; const m = S.mech ? S.mech() : {};
      if (m.blackFlash && typeof m.blackFlash.F === 'number' && m.blackFlash.F > 0 && window.__H.hitF < 0) { window.__H.hitF = m.blackFlash.F; window.__H.P = m.blackFlash.P; window.__H.delta = m.blackFlash.delta; }
      requestAnimationFrame(l); })();
    return true; })()`);
  for (let k = 0; k < 6; k++) {
    await b.pressKey('KeyJ', 40);
    await sleep(500);
  }
  await sleep(600);
  console.log('BF_DEBUG', JSON.stringify(await ev('window.__H')));
  console.log('BF_LAST', JSON.stringify(await ev('(() => { const x = __SS.mech().blackFlash; return { F: x.F, P: x.P, delta: x.delta, ok: x.ok, hits: x.hits, win: x.win, why: x.why }; })()')));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
