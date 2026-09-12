import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9733, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(14000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(1500);
  await b.evaluate(`(() => {
    window.__L = [];
    const tick = () => { const S = window.__SS; const g = S.gojo; const d = g.dbg || {};
      window.__L.push({ t:+(performance.now()).toFixed(0), a:S.snap.gojo.anim, ph:S.snap.gojo.phase, x:+g.root.position.x.toFixed(3), z:+g.root.position.z.toFixed(3), thigh:+g.bones.thighL.rotation.x.toFixed(4), shin:+g.bones.shinL.rotation.x.toFixed(4), armR:+g.bones.upperArmR.rotation.x.toFixed(4), hy:+g.bones.hips.position.y.toFixed(4),
        n:d.name, loop:d.loop, ended:d.ended, blend:d.blend, sp:d.sp, cd:d.cd, blocked:d.blocked, wantAnim:d.wantAnim, mv:d.mv, w:d.want });
      if (window.__L.length > 40000) window.__L.shift();
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window.__CLR4 = () => { window.__L.length = 0; }; return true;
  })()`);
  const keys = ['KeyW','KeyA','KeyS','KeyD'];
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const k = keys[Math.floor(Math.random()*4)];
    await b.keyDown(k);
    if (Math.random() < 0.75) await b.pressKey(['KeyJ','KeyJ','KeyJ','KeyK','KeyU','Space'][Math.floor(Math.random()*6)], 50);
    await sleep(250 + Math.random()*600);
    await b.keyUp(k);
    if (Math.random() < 0.3) { await b.keyDown('ShiftLeft'); await sleep(300 + Math.random()*400); await b.keyUp('ShiftLeft'); }
  }
  const L = await b.evaluate('window.__L.slice()');
  log('采样 ' + L.length + ' 帧 / ' + ((L[L.length-1].t - L[0].t)/1000).toFixed(1) + 's');
  // 找 anim 不变但位置在动的窗口
  const bad = [];
  let start = 0;
  for (let i = 1; i <= L.length; i++) {
    const poseDelta = (p, q) => Math.abs(p.thigh - q.thigh) + Math.abs(p.shin - q.shin) + Math.abs(p.armR - q.armR) + Math.abs(p.hy - q.hy);
    const sameAnim = i < L.length && poseDelta(L[i], L[start]) < 0.02 && poseDelta(L[i-1], L[start]) < 0.02;
    if (sameAnim) continue;
    const dur = (L[i-1].t - L[start].t) / 1000;
    const dist = Math.hypot(L[i-1].x - L[start].x, L[i-1].z - L[start].z);
    if (dur > 0.5 && dist > 0.5) bad.push({ dur: +dur.toFixed(2), dist: +dist.toFixed(2), anim: L[start].a, idx: start });
    start = i;
  }
  bad.sort((a,b) => b.dur - a.dur);
  log('姿势冻结但仍在滑行的窗口(姿势变化<0.02rad 且位移>0.5m): ' + bad.length);
  for (const w of bad.slice(0, 8)) {
    log('  ' + w.dur + 's  位移 ' + w.dist + 'm  anim=' + w.anim);
    const s = L[w.idx + Math.floor(w.dur * 30)];
    if (s) log('    采样: name=' + s.n + ' loop=' + s.loop + ' ended=' + s.ended + ' blend=' + s.blend + ' sp=' + s.sp + ' cd=' + s.cd + ' blocked=' + s.blocked + ' wantAnim=' + s.wantAnim + ' want=' + s.w + ' mv=' + s.mv + ' phase=' + s.ph);
    const win = L.slice(w.idx, w.idx + Math.round(w.dur * 60));
    const step = Math.max(1, Math.floor(win.length / 10));
    for (let q = 0; q < win.length; q += step) {
      const r2 = win[q];
      log('      ' + ((r2.t - win[0].t)/1000).toFixed(2) + 's anim=' + r2.a + ' name=' + r2.n + ' blend=' + r2.blend + ' sp=' + r2.sp + ' cd=' + r2.cd + ' blocked=' + r2.blocked + ' mv=' + r2.mv + ' wantAnim=' + r2.wantAnim + ' loop=' + r2.loop + ' hold=' + r2.hold);
    }
  }
  log('错误 ' + JSON.stringify(b.errors.slice(0, 5)));
} catch (e) { log('FATAL ' + String(e).slice(0, 400)); }
finally { await b.close(); }