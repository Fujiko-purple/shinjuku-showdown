import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1';
const b = new Browser({ port: 9709, width: 844, height: 390 });
const log = (...a) => console.log(...a);
const active = new Map();
const pts = () => [...active.entries()].map(([id, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), id }));
const ts = async (id,x,y) => { active.set(id,{x,y}); await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts()}); };
const tm = async (id,x,y) => { active.set(id,{x,y}); await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pts()}); };
const te = async (id) => { active.delete(id); await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:pts()}); };
const rect = (sel) => b.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
async function tapPoint(p, id) { await ts(id,p.x,p.y); await sleep(70); await te(id); await sleep(150); }
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: URL });
  await sleep(14000);
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]'); if (e) e.click(); return true; })()`);
  await sleep(900);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(900);
  log('combat keys: ' + await b.evaluate(`Object.keys(window.__SS.combat).join(',')`));
  const joy = await rect('#t-joy'); const dodgeP = await rect('[data-act="dodge"]');
  await tapPoint(dodgeP, 71);
  await ts(72, joy.x, joy.y); await sleep(80); await tm(72, joy.x, joy.y - 42);
  const sample = `(() => { const S = window.__SS; const C = S.combat; const f = C && C.fighters ? C.fighters.gojo : null;
     const a = f && f.action; const g = S.gojo;
     return { a: S.snap.gojo.anim, act: a ? (a.flow && a.flow.skill ? a.flow.skill : 'act') : null, ph: a ? a.phase : null, done: a ? !!a.done : null,
       stun: f ? +f.stunT.toFixed(2) : null, inf: f ? +f.infinityT.toFixed(2) : null, guard: f ? !!f.guarding : null,
       x:+g.root.position.x.toFixed(2), z:+g.root.position.z.toFixed(2) }; })()`;
  for (let i = 0; i < 14; i++) { await sleep(180); log('  ' + (i*0.18).toFixed(2) + 's ' + JSON.stringify(await b.evaluate(sample))); }
  await te(72);
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
