import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1';
const b = new Browser({ port: 9707, width: 844, height: 390 });
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
  await b.evaluate(`(() => {
    window.__EV = [];
    const g = window.__SS.gojo;
    const op = g.play, og = g.setGuard;
    g.play = function (n, o) { window.__EV.push({ t:+performance.now().toFixed(0), k:'play', n, loop:(o&&o.loop) }); return op.call(g, n, o); };
    g.setGuard = function (on) { window.__EV.push({ t:+performance.now().toFixed(0), k:'guard', on:!!on }); return og.call(g, on); };
    window.__S=[]; const tick=()=>{const S=window.__SS,gg=S.gojo,T=window.__TOUCH||{}; window.__S.push({t:+performance.now().toFixed(0),a:S.snap.gojo.anim,th:+gg.bones.thighL.rotation.x.toFixed(3),on:T.on,mz:T.mz,x:+gg.root.position.x.toFixed(2),z:+gg.root.position.z.toFixed(2)}); requestAnimationFrame(tick);}; requestAnimationFrame(tick);
    window.__CLR=()=>{window.__S.length=0;window.__EV.length=0;}; return true;
  })()`);
  const joy = await rect('#t-joy'); const dodgeP = await rect('[data-act="dodge"]');
  await b.evaluate('window.__CLR(); true');
  const mark = await b.evaluate('performance.now().toFixed(0)');
  await tapPoint(dodgeP, 61);
  await ts(62, joy.x, joy.y); await sleep(80); await tm(62, joy.x, joy.y - 42);
  await sleep(1800);
  await te(62);
  const rows = await b.evaluate('window.__S.slice()');
  const evs = await b.evaluate('window.__EV.slice()');
  const t0 = +mark;
  log('anim 序列: ' + (() => { const s=[]; for (const r of rows) { if (!s.length || s[s.length-1].a!==r.a) s.push(r.a+'@'+((r.t-t0)/1000).toFixed(2)); } return s.join(' → '); })());
  log('play/setGuard 事件: ' + evs.map(e => ((e.t-t0)/1000).toFixed(2)+'s '+e.k+' '+(e.k==='play'?e.n+' loop='+e.loop:'on='+e.on)).join(' | '));
  log('TOUCH 样本: ' + rows.filter((_,i)=>i%40===0).map(r=>r.on+'/'+r.mz).join(' '));
  log('位移 ' + Math.hypot(rows[rows.length-1].x-rows[0].x, rows[rows.length-1].z-rows[0].z).toFixed(2) + 'm');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
