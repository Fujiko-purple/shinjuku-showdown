import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1';
const b = new Browser({ port: 9699, width: 844, height: 390 });
const log = (...a) => console.log(...a);
const active = new Map();
const pts = () => [...active.entries()].map(([id, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), id }));
async function touchStart(id, x, y) { active.set(id, { x, y }); await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts() }); }
async function touchMove(id, x, y) { active.set(id, { x, y }); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts() }); }
async function touchEnd(id) { active.delete(id); await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts() }); }
const rect = (sel) => b.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
async function tapPoint(p, id) { await touchStart(id, p.x, p.y); await sleep(70); await touchEnd(id); await sleep(150); }
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
  await b.evaluate(`(() => { window.__S = []; const tick = () => { const S = window.__SS, g = S.gojo; window.__S.push({ t:+performance.now().toFixed(0), a:S.snap.gojo.anim, th:+g.bones.thighL.rotation.x.toFixed(3), x:+g.root.position.x.toFixed(2), z:+g.root.position.z.toFixed(2) }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__MARK = () => { window.__S.length = 0; }; return true; })()`);
  const joy = await rect('#t-joy');
  const dashP = await rect('[data-act="dash"]');
  const dodgeP = await rect('[data-act="dodge"]');
  const lightP = await rect('[data-act="light"]');
  const heavyP = await rect('[data-act="heavy"]');
  const dirs = [[0,-1],[0,1],[-1,0],[1,0],[0.7,-0.7],[-0.7,0.7]];
  let dashOn = false, fails = [], moveChecks = 0, moveOk = 0;
  for (let r = 0; r < 12; r++) {
    await b.evaluate('window.__MARK(); true');
    const useDash = Math.random() < 0.55;
    if (useDash && !dashOn) { await tapPoint(dashP, 21); dashOn = true; }
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    await touchStart(22, joy.x, joy.y); await sleep(80);
    await touchMove(22, joy.x + d[0] * 42, joy.y + d[1] * 42);
    const act = r % 4;
    if (act === 0) await tapPoint(dodgeP, 23);
    else if (act === 1) await tapPoint(lightP, 23);
    else if (act === 2) await tapPoint(heavyP, 23);
    await sleep(1000);
    const rows = await b.evaluate('window.__S.slice()');
    if (rows.length > 20) {
      const th = rows.map(x => x.th);
      const range = Math.max(...th) - Math.min(...th);
      const moved = rows.filter(x => x.a === 'walk' || x.a === 'run').length / rows.length;
      const dist = Math.hypot(rows[rows.length-1].x - rows[0].x, rows[rows.length-1].z - rows[0].z);
      moveChecks++;
      if (range > 0.3 || dist < 0.5) moveOk++;
      else fails.push('R' + r + ' 动了 ' + dist.toFixed(1) + 'm 但腿没摆 range=' + range.toFixed(3) + ' walk/run=' + moved.toFixed(2) + ' anim=' + JSON.stringify([...new Set(rows.map(x=>x.a))]));
    }
    await touchEnd(22); await sleep(250);
    if (dashOn) { await tapPoint(dashP, 24); dashOn = false; }
    await sleep(1800);
    const a = await b.evaluate('window.__SS.snap.gojo.anim');
    const ph = await b.evaluate('window.__SS.snap.gojo.phase');
    if (a !== 'idle' && !['down','defeat','victory','getup'].includes(a)) fails.push('R' + r + ' 松手 2s 后 anim=' + a + ' phase=' + ph);
  }
  log('回合 12；移动期间腿摆动 ' + moveOk + '/' + moveChecks);
  log(fails.length ? ('❌ 失败 ' + fails.length + ':  ' + fails.join(' | ')) : '✅ 12 个回合松手后全部回到 idle；移动时腿都在摆');
  // 闪避 -> 立刻前进
  await tapPoint(dodgeP, 31); await sleep(2600);
  log('闪避 2.6s 后 anim=' + await b.evaluate('window.__SS.snap.gojo.anim'));
  await b.evaluate('window.__MARK(); true');
  await touchStart(32, joy.x, joy.y); await sleep(80); await touchMove(32, joy.x, joy.y - 42); await sleep(1600);
  const rows2 = await b.evaluate('window.__S.slice()');
  const th2 = rows2.map(x => x.th);
  log('闪避后立刻前进: anim=' + JSON.stringify([...new Set(rows2.map(x=>x.a))]) + ' 腿摆幅=' + (Math.max(...th2)-Math.min(...th2)).toFixed(3));
  await touchEnd(32);
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
