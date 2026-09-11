import { Browser, sleep } from './cdp.mjs';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9719, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: NEW });
  await sleep(14000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(800);
  await b.evaluate(`(() => {
    window.__EV = [];
    const g = window.__SS.gojo;
    const op = g.play, og = g.setGuard, om = g.moveTowards;
    g.play = function (n, o) { window.__EV.push({ t: performance.now(), k:'P', n, l:(o&&o.loop) }); return op.call(g, n, o); };
    g.setGuard = function (on) { window.__EV.push({ t: performance.now(), k:'G', on:!!on }); return og.call(g, on); };
    g.moveTowards = function (x,z,s,dt) { window.__EV.push({ t: performance.now(), k:'M', s:+s.toFixed(2) }); return om.call(g, x, z, s, dt); };
    window.__A = []; window.__T0 = 0;
    const tick = () => { const S = window.__SS; if (!window.__T0) window.__T0 = performance.now();
      window.__A.push({ t:+(performance.now()-window.__T0).toFixed(0), a:S.snap.gojo.anim, th:+S.gojo.bones.thighL.rotation.x.toFixed(3), x:+S.gojo.root.position.x.toFixed(2), z:+S.gojo.root.position.z.toFixed(2) });
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window.__CLR=()=>{window.__A.length=0;window.__EV.length=0;window.__T0=performance.now();}; return true;
  })()`);
  await b.evaluate('window.__CLR(); true');
  await b.pressKey('KeyJ', 40); await sleep(250);
  await b.keyDown('KeyW'); await sleep(1600); await b.keyUp('KeyW');
  const rows = await b.evaluate('window.__A.slice()');
  const evs = await b.evaluate('window.__EV.slice()');
  const t0 = rows.length ? rows[0].t : 0;
  const evT0 = evs.length ? evs[0].t : 0;
  // 汇总：每秒 M 调用次数
  const mv = evs.filter(e=>e.k==='M');
  if (mv.length) log('moveTowards 调用 ' + mv.length + ' 次，speed 值集合 ' + JSON.stringify([...new Set(mv.map(e=>e.s))]));
  else log('moveTowards 调用 0 次！');
  const plays = evs.filter(e=>e.k==='P');
  log('play 事件: ' + plays.map(e => e.n + (e.l===undefined?'(def)':'(loop='+e.l+')')).join(' | '));
  log('setGuard 事件: ' + JSON.stringify(evs.filter(e=>e.k==='G').map(e=>e.on)));
  const buckets = {};
  for (const e of evs) { if (e.k !== 'M') continue; const b2 = Math.floor((e.t - evT0) / 200); buckets[b2] = (buckets[b2]||0)+1; }
  log('moveTowards 每 200ms 调用次数: ' + JSON.stringify(buckets));
  log('anim 切换: ' + (() => { const s=[]; let prev=null; for (const r of rows) { if (r.a!==prev) { s.push(r.a+'@'+(r.t/1000).toFixed(2)); prev=r.a; } } return s.join(' → '); })());
  log('位移 ' + (rows.length?Math.hypot(rows[rows.length-1].x-rows[0].x, rows[rows.length-1].z-rows[0].z).toFixed(2):'-') + 'm');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }