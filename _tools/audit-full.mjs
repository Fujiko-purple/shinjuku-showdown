import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9731, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const issues = [];
const ok = [];
function chk(cond, msg) { (cond ? ok : issues).push(msg); log((cond ? '  OK   ' : '  BUG  ') + msg); }
const st = () => b.evaluate('window.__SS && window.__SS.state');
const snap = () => b.evaluate('window.__SS && window.__SS.snap');
const crash = () => b.evaluate(`(() => { const e = document.getElementById('crash'); return e && !e.classList.contains('hidden') ? ((document.getElementById('crash-msg')||{}).textContent||'?') : null; })()`);
const ui = (id) => b.evaluate(`(() => { const e = document.getElementById('${id}'); if (!e) return 'missing'; const s = getComputedStyle(e); return { vis: s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05, txt: (e.textContent||'').trim().slice(0,40) }; })()`);
try {
  await b.launch(); await b.newPage();
  await b.evaluate(`(() => { window.__LT = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 200) window.__LT.push({ d: Math.round(e.duration), n: e.name, s: Math.round(e.startTime) }); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} return true; })()`).catch(()=>{});
  const t0 = Date.now();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  log('=== 1. 启动 ===');
  log('  页面错误 ' + JSON.stringify(b.errors.slice(0, 6)));
  chk(b.errors.length === 0, '启动无控制台错误 (' + b.errors.length + ')');
  chk(!(await crash()), '启动无崩溃面板');
  chk((await st()) === 'title', '启动后进入标题 state=' + (await st()));
  const lt = await b.evaluate('window.__LT || []');
  log('  长任务(>200ms): ' + JSON.stringify(lt));

  log('=== 2. 标题界面 ===');
  for (const id of ['btn-start','btn-skip-cine','vol-master','vol-music','vol-sfx']) {
    const u = await ui(id);
    chk(u !== 'missing', '标题界面存在 #' + id);
  }
  await b.screenshot('shots/AUD-01-title.png');

  log('=== 3. 完整片头（不跳过）===');
  await b.evaluate(`document.getElementById('btn-start').click(); true`);
  let cineBad = 0, lastProg = -1, stall = 0;
  for (let i = 0; i < 160; i++) {
    await sleep(500);
    const s = await st();
    if (s !== 'cutscene') break;
    const p = await b.evaluate(`(window.__SS.cutscene && window.__SS.cutscene.progress) || 0`);
    if (Math.abs(p - lastProg) < 0.001) { stall++; if (stall === 12) issues.push('片头进度停滞在 ' + (p*100).toFixed(0) + '%'); }
    else stall = 0;
    lastProg = p;
    if (i % 12 === 0) await b.screenshot('shots/AUD-02-cine-' + i + '.png');
    const c = await crash(); if (c) { cineBad = 1; issues.push('片头崩溃: ' + c); break; }
  }
  const afterCine = await st();
  chk(afterCine === 'fight' || afterCine === 'title', '片头正常结束，state=' + afterCine + '（进度 ' + (lastProg*100).toFixed(0) + '%）');
  log('  片头结束 state=' + afterCine + ' 进度=' + (lastProg*100).toFixed(1) + '%');
  if (afterCine === 'cutscene') {
    await b.evaluate(`(() => { const e = document.getElementById('btn-skip-cine'); if (e) e.click(); return true; })()`);
    for (let i = 0; i < 60; i++) { await sleep(500); if ((await st()) !== 'cutscene') break; }
  }
  log('  跳过片头后 state=' + (await st()));
  await sleep(2500);
  await b.screenshot('shots/AUD-03-fight-start.png');

  log('=== 4. 战斗核心 ===');
  const s0 = await snap();
  chk(!!s0, '战斗快照可用');
  log('  gojo hp=' + s0.gojo.hp.toFixed(0) + '/' + s0.gojo.hpMax + '  suku hp=' + s0.sukuna.hp.toFixed(0) + '/' + s0.sukuna.hpMax);
  // 每个键都按一遍，看有没有崩 + 动画能否回收
  const keys = [['KeyJ','轻击'],['KeyK','重击'],['KeyU','苍'],['KeyI','赫'],['KeyO','茈'],['KeyH','反转术式'],['Space','无下限'],['KeyG','领域'],['KeyQ','锁定'],['Escape','暂停']];
  for (const [k, name] of keys) {
    const before = await st();
    await b.pressKey(k, 60);
    await sleep(k === 'Escape' ? 500 : 2200);
    const c = await crash();
    if (c) { issues.push(name + '(' + k + ') 触发崩溃: ' + c); break; }
    if (k === 'Escape') {
      const s = await st();
      chk(s === 'paused', '暂停键生效 state=' + s);
      await b.pressKey('Escape', 60); await sleep(800);
      chk((await st()) === 'fight', '恢复后回到 fight state=' + (await st()));
    } else {
      const anim = await b.evaluate('window.__SS.snap.gojo.anim');
      const ph = await b.evaluate('window.__SS.snap.gojo.phase');
      chk(anim === 'idle' || anim === 'walk' || anim === 'run' || anim === 'guard_infinity', name + ' 后动画回收 anim=' + anim + ' phase=' + ph);
    }
  }
  await b.screenshot('shots/AUD-04-after-keys.png');

  log('=== 5. 长局压力（45s 随机输入）===');
  await b.evaluate(`(() => { window.__P = []; const tick = () => { const S = window.__SS; if (!S || !S.gojo) return requestAnimationFrame(tick); window.__P.push({ a:S.snap.gojo.anim, x:S.gojo.root.position.x, z:S.gojo.root.position.z, hp:+S.snap.gojo.hp.toFixed(0), shp:+S.snap.sukuna.hp.toFixed(0) }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`);
  const t5 = Date.now();
  const kk = ['KeyW','KeyA','KeyS','KeyD'];
  while (Date.now() - t5 < 45000) {
    const k = kk[Math.floor(Math.random()*4)];
    await b.keyDown(k);
    if (Math.random() < 0.6) await b.pressKey(['KeyJ','KeyJ','KeyK','KeyU'][Math.floor(Math.random()*4)], 50);
    await sleep(300 + Math.random()*700);
    await b.keyUp(k);
    if (Math.random() < 0.25) { await b.keyDown('ShiftLeft'); await sleep(400); await b.keyUp('ShiftLeft'); }
    if (await crash()) { issues.push('长局压力测试崩溃'); break; }
  }
  const P = await b.evaluate('window.__P.slice()');
  const sEnd = await snap();
  log('  45s 后 gojo hp=' + sEnd.gojo.hp.toFixed(0) + '  suku hp=' + sEnd.sukuna.hp.toFixed(0) + '  mode=' + sEnd.mode);
  // 卡死检测：连续 2.5s anim 不变 且 位置在变
  let stuck = 0, maxStuck = 0;
  for (let i = 20; i < P.length; i++) {
    const win = P.slice(i-20, i+1);
    const dist = Math.hypot(win[20].x-win[0].x, win[20].z-win[0].z);
    const an = [...new Set(win.map(w=>w.a))];
    if (an.length === 1 && dist > 0.4) { stuck++; maxStuck = Math.max(maxStuck, stuck); } else stuck = 0;
  }
  log('  最长"滑行但动画不变"帧数=' + maxStuck + ' (约 ' + (maxStuck/60).toFixed(2) + 's)');
  chk(maxStuck < 90, '没有超过 1.5s 的僵硬滑行 (实测 ' + (maxStuck/60).toFixed(2) + 's)');
  chk((await crash()) === null, '长局压力无崩溃');
  await b.screenshot('shots/AUD-05-longfight.png');

  log('=== 6. 结算路径 ===');
  await b.evaluate(`(() => { window.__SS.combat.setAiEnabled(false); return true; })()`);
  await sleep(500);
  // 玩家败北
  await b.evaluate(`(() => { const d = window.__SS.combat; for (let i=0;i<40;i++) d.applyDamage('gojo', 200); return true; })()`);
  await sleep(2500);
  let s = await st();
  log('  applyDamage 后 state=' + s);
  await b.screenshot('shots/AUD-06-defeat.png');
  const res1 = await ui('result') ;
  log('  结算界面: ' + JSON.stringify(res1));
  // 重开
  for (const id of ['btn-again','btn-back','btn-totitle','btn-restart']) {
    const u = await ui(id);
    log('  #' + id + ' = ' + JSON.stringify(u));
  }
  await b.pressKey('KeyR', 60); await sleep(3000);
  s = await st();
  log('  按 R 之后 state=' + s + ' gojo hp=' + (await snap()).gojo.hp.toFixed(0));
  chk(s === 'fight', 'R 键重开进入 fight');
  log('\n结论: 通过 ' + ok.length + ' 项，问题 ' + issues.length + ' 项');
  for (const i of issues) log('  ✗ ' + i);
  log('页面错误 ' + JSON.stringify(b.errors.slice(0, 8)));
} catch (e) { log('FATAL ' + String(e).slice(0, 400)); }
finally { await b.close(); }
