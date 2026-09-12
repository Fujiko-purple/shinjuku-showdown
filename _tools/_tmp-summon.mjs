import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const file = resolve('dist/新宿决战.html');
const out = 'shots/lead-summon'; mkdirSync(out, { recursive: true });
const b = new Browser({ port: 9492, width: 1600, height: 900 });
const ev = (x) => b.evaluate(x);
const BIG = `(() => {
  const S = window.__SS, cam = S.activeCamera;
  const V = S.scene.position.constructor;
  const out = [];
  S.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.visible) return;
    const g = o.geometry;
    if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch (e) { return; } }
    if (!g.boundingSphere) return;
    const wp = new V(); o.getWorldPosition(wp);
    const sc = new V(); o.getWorldScale(sc);
    const r = g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
    const d = wp.distanceTo(cam.position);
    out.push({ n: o.name || o.type, r: +r.toFixed(2), d: +d.toFixed(1), app: +(r / Math.max(0.1, d)).toFixed(2), y: +wp.y.toFixed(1), vis: o.visible, mat: o.material && o.material.transparent ? 'T' : 'O', op: o.material ? +o.material.opacity : 1 });
  });
  out.sort((a, b) => b.app - a.app);
  return out.slice(0, 8);
})()`;
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  const s = await ev('(() => ({ sHp: Math.round(__SS.snap.sukuna.hp) }))()');
  await ev('__SS.combat.applyDamage("sukuna", ' + Math.max(0, Math.round(s.sHp * 0.52)) + ')');
  for (let i = 0; i < 14; i++) {
    await sleep(400);
    const m = await ev('(() => { try { const d = __SS.mech().mahoraga; return { alive: d.alive, mode: d.mode, lock: Math.round((__SS.combat.phaseLock||0)*100)/100 }; } catch (e) { return null; } })()');
    const big = await ev(BIG);
    console.log('T' + i, JSON.stringify(m), '| top:', JSON.stringify(big.slice(0, 4)));
    if (i >= 1 && i <= 8) await b.screenshot(out + '/s' + i + '.png');
  }
  console.log('ERR', JSON.stringify(b.errors.slice(0, 3).map(e => e.text || String(e))));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
