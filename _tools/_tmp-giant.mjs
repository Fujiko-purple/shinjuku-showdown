import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const file = resolve('dist/新宿决战.html');
const b = new Browser({ port: 9493, width: 1280, height: 720 });
const ev = (x) => b.evaluate(x);
const FIND = `(() => {
  const S = window.__SS, V = S.scene.position.constructor;
  const hits = [];
  S.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingSphere) { try { g.computeBoundingSphere(); } catch (e) { return; } }
    if (!g.boundingSphere) return;
    const sc = new V(); o.getWorldScale(sc);
    const r = g.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z);
    if (r > 200 && (o.name || '') !== 'sky-dome' && (o.name || '') !== 'ground' && (o.name || '') !== 'sidewalk' && (o.name || '') !== 'road-markings') {
      const wp = new V(); o.getWorldPosition(wp);
      let pname = ''; let p = o.parent; let dep = 0;
      while (p && dep < 4) { pname += '/' + (p.name || p.type); p = p.parent; dep++; }
      hits.push({ geo: g.type, r: +r.toFixed(1), name: o.name || o.type, pos: [ +wp.x.toFixed(1), +wp.y.toFixed(1), +wp.z.toFixed(1) ],
        scale: [ +sc.x.toFixed(2), +sc.y.toFixed(2), +sc.z.toFixed(2) ],
        params: g.parameters ? Object.keys(g.parameters).reduce((m, k) => (typeof g.parameters[k] === 'number' ? (m[k] = +g.parameters[k].toFixed(2), m) : m), {}) : null,
        matColor: o.material && o.material.color ? '#' + o.material.color.getHexString() : null,
        transparent: !!(o.material && o.material.transparent), opacity: o.material ? o.material.opacity : 1,
        visible: o.visible, parent: pname });
    }
  });
  return hits.slice(0, 6);
})()`;
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  const s = await ev('(() => ({ sHp: Math.round(__SS.snap.sukuna.hp) }))()');
  await ev('__SS.combat.applyDamage("sukuna", ' + Math.max(0, Math.round(s.sHp * 0.52)) + ')');
  for (let i = 0; i < 16; i++) {
    await sleep(500);
    const hits = await ev(FIND);
    if (hits.length) { console.log('T' + i, JSON.stringify(hits, null, 1)); break; }
  }
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
