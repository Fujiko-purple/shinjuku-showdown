import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const file = resolve('tmp/lead/dist.html');
const out = 'shots/lead-maho'; mkdirSync(out, { recursive: true });
const b = new Browser({ port: 9483, width: 1600, height: 900 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  console.log('METRICS0', JSON.stringify(await ev('(() => { try { return __SS.mahoraga.metrics(); } catch(e) { return String(e); } })()')).slice(0, 500));
  const s = await ev('(() => ({ sHp: Math.round(__SS.snap.sukuna.hp) }))()');
  await ev('__SS.combat.applyDamage("sukuna", ' + Math.max(0, Math.round(s.sHp * 0.52)) + ')');
  for (let i = 0; i < 11; i++) {
    await sleep(1000);
    const info = await ev(`(() => {
      const cam = __SS.activeCamera;
      let m = null; try { m = __SS.mech().mahoraga; } catch(e) { m = String(e); }
      let dump = null; try { dump = __SS.mahoraga.dump ? __SS.mahoraga.dump() : null; } catch(e) { dump = String(e); }
      return { hp: m && m.hp, alive: m && m.alive, mode: m && m.mode, skill: m && m.skill,
               cam: cam ? [ +cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1) ] : null,
               dump: dump && JSON.stringify(dump).slice(0, 320), mode2: __SS.combat.mode }; })()`);
    console.log('T' + i, JSON.stringify(info));
    if (i >= 1 && i <= 9) await b.screenshot(out + '/m' + i + '.png');
  }
  console.log('ERR', JSON.stringify(b.errors.slice(0, 4).map(e => e.text || String(e))));
} catch (e) { console.log('FATAL', String(e).slice(0, 400)); } finally { await b.close(); }
