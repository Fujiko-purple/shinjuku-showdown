import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1';
const b = new Browser({ port: 9701, width: 844, height: 390 });
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
    window.__MV = 0;
    const g = window.__SS.gojo;
    const orig = g.moveTowards;
    g.moveTowards = function (x, z, sp, dt) { window.__MV++; try { window.__LAST = { x, z, sp, dt }; } catch(e){} return orig.call(g, x, z, sp, dt); };
    window.__S = [];
    const tick = () => { const S = window.__SS, gg = S.gojo; const T = window.__TOUCH || {};
      window.__S.push({ t:+performance.now().toFixed(0), a:S.snap.gojo.anim, th:+gg.bones.thighL.rotation.x.toFixed(3),
        mv: window.__MV, mz: T.mz, on: T.on,
        x:+gg.root.position.x.toFixed(2), z:+gg.root.position.z.toFixed(2) });
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window.__MARK = () => { window.__S.length = 0; window.__MV = 0; }; return true;
  })()`);
  const joy = await rect('#t-joy');
  const dodgeP = await rect('[data-act="dodge"]');
  // 基线：直接推摇杆前进
  await b.evaluate('window.__MARK(); true');
  await ts(41, joy.x, joy.y); await sleep(90); await tm(41, joy.x, joy.y - 42); await sleep(1600);
  let rows = await b.evaluate('window.__S.slice()');
  log('A 基线摇杆前进: frames=' + rows.length + ' moveTowards调用=' + (rows.length?rows[rows.length-1].mv - rows[0].mv:0) + ' anim=' + JSON.stringify([...new Set(rows.map(r=>r.a))]) +
      ' mz=' + (rows.length?rows[0].mz:'-') + ' on=' + (rows.length?rows[0].on:'-') +
      ' 位移=' + (rows.length?Math.hypot(rows[rows.length-1].x-rows[0].x, rows[rows.length-1].z-rows[0].z).toFixed(2):'-'));
  await te(41); await sleep(1500);
  log('   松手后 anim=' + await b.evaluate('window.__SS.snap.gojo.anim'));
  // 闪避后推摇杆
  await tapPoint(dodgeP, 42); await sleep(2600);
  log('B 闪避 2.6s 后 anim=' + await b.evaluate('window.__SS.snap.gojo.anim'));
  await b.evaluate('window.__MARK(); true');
  await ts(43, joy.x, joy.y); await sleep(90); await tm(43, joy.x, joy.y - 42); await sleep(1600);
  rows = await b.evaluate('window.__S.slice()');
  log('B 闪避后摇杆前进: frames=' + rows.length + ' moveTowards调用=' + (rows.length?rows[rows.length-1].mv - rows[0].mv:0) + ' anim=' + JSON.stringify([...new Set(rows.map(r=>r.a))]) +
      ' mz=' + (rows.length?rows[0].mz:'-') + ' on=' + (rows.length?rows[0].on:'-') +
      ' 位移=' + (rows.length?Math.hypot(rows[rows.length-1].x-rows[0].x, rows[rows.length-1].z-rows[0].z).toFixed(2):'-'));
  log('   前 25 帧: ' + rows.slice(0,25).map(r=>r.a).join(','));
  await te(43);
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
