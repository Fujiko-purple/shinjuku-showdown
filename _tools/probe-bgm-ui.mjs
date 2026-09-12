import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9765, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const vis = (sel) => b.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return 'missing'; let el = e, hidden = false; while (el) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity <= 0.05) { hidden = true; break; } el = el.parentElement; } const r = e.getBoundingClientRect(); return { vis: !hidden, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; })()`);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  log('标题界面 .audio-dock: ' + JSON.stringify(await vis('.audio-dock')));
  log('标题界面 #bgm-pick(展开前): ' + JSON.stringify(await vis('#bgm-pick')));
  await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(2500);
  log('战斗中 .audio-dock: ' + JSON.stringify(await vis('.audio-dock')));
  await b.evaluate('document.getElementById("audio-toggle").click(); true');
  await sleep(500);
  log('展开后 #bgm-pick: ' + JSON.stringify(await vis('#bgm-pick')));
  const r = await b.evaluate(`(() => { const out = []; for (const b of document.querySelectorAll('.bgm-btn')) { const q = b.getBoundingClientRect(); out.push({ t: b.textContent, w: Math.round(q.width), h: Math.round(q.height) }); } return out; })()`);
  log('按钮尺寸: ' + JSON.stringify(r));
  await b.screenshot('shots/BGM-panel.png');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
