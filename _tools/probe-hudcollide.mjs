import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9689, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const AUDIT = `(() => {
  const ids = ['timer','banner','combo','phase-tag','focus-dist','hud-gojo','hud-sukuna','ability-bar','clash','hp-gojo','hp-sukuna'];
  const out = [];
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e) { out.push({ id, missing: true }); continue; }
    const st = getComputedStyle(e);
    if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.05) { out.push({ id, hidden: true }); continue; }
    const r = e.getBoundingClientRect();
    out.push({ id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), op: st.opacity });
  }
  return out;
})()`;
function overlaps(a, b2) {
  if (a.missing || a.hidden || b2.missing || b2.hidden) return null;
  const ox = Math.min(a.x+a.w, b2.x+b2.w) - Math.max(a.x, b2.x);
  const oy = Math.min(a.y+a.h, b2.y+b2.h) - Math.max(a.y, b2.y);
  if (ox <= 0 || oy <= 0) return null;
  return { pair: a.id + ' × ' + b2.id, area: ox * oy, ox, oy };
}
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(2500);
  let rows = await b.evaluate(AUDIT);
  log('HUD 元素: ' + JSON.stringify(rows));
  // 制造黑闪/连击，让 banner/combo 出现
  for (const k of ['KeyJ','KeyJ','KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 55); await sleep(400); }
  await sleep(200);
  rows = await b.evaluate(AUDIT);
  log('连击时: ' + JSON.stringify(rows));
  const vis = rows.filter(r => !r.missing && !r.hidden);
  const bad = [];
  for (let i = 0; i < vis.length; i++) for (let j = i+1; j < vis.length; j++) { const o = overlaps(vis[i], vis[j]); if (o && o.area > 200) bad.push(o); }
  log('重叠: ' + JSON.stringify(bad));
  await b.screenshot('shots/HUD-collide.png');
  // 再抓黑闪 banner
  for (let i = 0; i < 30; i++) {
    const t = await b.evaluate(`(() => { const e = document.getElementById('banner'); return e && e.classList.contains('show') ? e.textContent : null; })()`);
    if (t) { log('banner 文本: ' + JSON.stringify(t)); break; }
    await b.pressKey('KeyJ', 50); await sleep(300);
  }
  rows = await b.evaluate(AUDIT);
  log('banner 出现时: ' + JSON.stringify(rows.filter(r=>['timer','banner','combo','phase-tag','focus-dist'].includes(r.id))));
  const v2 = rows.filter(r => !r.missing && !r.hidden);
  const bad2 = [];
  for (let i = 0; i < v2.length; i++) for (let j = i+1; j < v2.length; j++) { const o = overlaps(v2[i], v2[j]); if (o && o.area > 100) bad2.push(o); }
  log('重叠2: ' + JSON.stringify(bad2));
  await b.screenshot('shots/HUD-collide2.png');
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
