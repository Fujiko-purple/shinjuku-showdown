import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const file = resolve('dist/新宿决战.html');
const b = new Browser({ port: 9499, width: 1280, height: 720 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  await ev(`(() => {
    const wait = (ms) => new Promise((r) => { const t0 = performance.now();
      const f = () => (performance.now() - t0 >= ms) ? r() : requestAnimationFrame(f); requestAnimationFrame(f); });
    const tap = (c, ms) => { __INJECT.press(c); setTimeout(() => __INJECT.release(c), ms); };
    window.__SCAN = async () => {
      const res = [];
      let best = null;
      for (const d of [60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 280, 320]) {
        const b0 = __SS.stats.blackFlash;
        for (let k = 0; k < 5; k++) { tap('KeyJ', 30); await wait(d); tap('KeyV', 16); await wait(650); }
        const n = __SS.stats.blackFlash - b0;
        const dbg = __SS.mech().blackFlash;
        res.push({ d, n, hits: dbg.hits, dtMs: dbg.dtMs, winMs: dbg.winMs });
        if (n > 0) { best = d; break; }
      }
      return { res, best, stats: __SS.stats.blackFlash };
    };
    return true; })()`);
  const out = await ev('window.__SCAN()');
  console.log(JSON.stringify(out, null, 1).slice(0, 2000));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
