import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const log = (...a) => console.log(...a);
const active = new Map();
const pts = () => [...active.entries()].map(([id, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), id }));
const ts = async (id,x,y) => { active.set(id,{x,y}); await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts()}); };
const te = async (id) => { active.delete(id); await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:pts()}); };
const b = new Browser({ port: 9781, width: 844, height: 390 });
const PROBE = `(() => {
  const out = []; for (const a of document.querySelectorAll('audio')) out.push({ id: a.id, paused: a.paused, t: +a.currentTime.toFixed(2) });
  return { 同时在播: out.filter(x => !x.paused).map(x => x.id), audios: out,
    dockOpen: document.querySelector('.audio-dock').classList.contains('open'),
    music: window.__SS && window.__SS.audio ? (window.__SS.audio.musicState || null) : null,
    pick: window.__BGM_LAZY ? __BGM_LAZY.pick : null };
})()`;
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: URL + '?touch=1' });
  await sleep(16000);
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]'); if (e) e.click(); return true; })()`);
  await sleep(900);
  await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(3000);
  log('战斗开始: ' + JSON.stringify(await b.evaluate(PROBE)));
  const dock = await b.evaluate(`(() => { const r = document.querySelector('.audio-toggle').getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
  await ts(11, dock.x, dock.y); await sleep(90); await te(11); await sleep(600);
  log('点 ♪ 之后: ' + JSON.stringify(await b.evaluate(PROBE)));
  const btns = await b.evaluate(`[...document.querySelectorAll('.bgm-btn')].map(x => { const r = x.getBoundingClientRect(); return { t: x.textContent, x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), w: Math.round(r.width), h: Math.round(r.height) }; })`);
  log('按钮: ' + JSON.stringify(btns));
  const t = btns.find(v => v.t.indexOf('最强') >= 0);
  if (!t || t.w <= 0) { log('❌ 按钮仍不可点'); }
  else {
    await ts(12, t.x, t.y); await sleep(90); await te(12);
    for (let i = 0; i < 5; i++) { await sleep(1200); log('  +' + ((i+1)*1.2).toFixed(1) + 's ' + JSON.stringify(await b.evaluate(PROBE))); }
  }
  const sfx = await b.evaluate(`(() => { const e = document.getElementById('vol-sfx'); return e ? { exists: true, w: Math.round(e.getBoundingClientRect().width) } : { exists: false }; })()`);
  log('音效滑块: ' + JSON.stringify(sfx));
  log('错误 ' + JSON.stringify(b.errors.slice(0,5)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
