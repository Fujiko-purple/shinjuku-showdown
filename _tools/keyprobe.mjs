import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9442 });
const snap = async (tag) => {
  const s = await b.evaluate(`(() => ({
    state: window.__SS ? window.__SS.state : null,
    snapMode: (window.__SS && window.__SS.snap) ? window.__SS.snap.mode : null,
    cine: (() => { const e = document.getElementById('cine-ui'); return e ? e.className : 'MISSING'; })(),
    pause: (() => { const e = document.getElementById('pause'); return e ? e.className : 'MISSING'; })(),
    hud: (() => { const e = document.getElementById('hud'); return e ? e.className : 'MISSING'; })(),
    keysLen: window.__KEYS ? window.__KEYS.length : -1,
  }))()`);
  console.log(tag, JSON.stringify(s));
  return s;
};
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(11000);
  await b.evaluate(`window.__KEYS = []; window.addEventListener('keydown', (e) => window.__KEYS.push({ code: e.code, key: e.key, repeat: e.repeat }), true); true`);
  await snap('标题后:');
  await b.evaluate(`document.getElementById('btn-start').click(); true`);
  await sleep(4500);
  await snap('点开战后:');
  await b.pressKey('Space');
  await sleep(1200); await snap('Space+1.2s:');
  await sleep(2500); await snap('Space+3.7s:');
  await b.pressKey('KeyP');
  await sleep(1200); await snap('按P后:');
  const keys = await b.evaluate(`window.__KEYS`);
  console.log('捕获到的 keydown:', JSON.stringify(keys));
} finally { await b.close(); }
