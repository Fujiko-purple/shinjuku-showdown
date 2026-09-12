import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9747, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const issues = [], ok = [];
function chk(c, m) { (c ? ok : issues).push(m); log((c ? '  OK   ' : '  BUG  ') + m); }
const st = () => b.evaluate('window.__SS && window.__SS.state');
const crash = () => b.evaluate(`(() => { const e = document.getElementById('crash'); return e && !e.classList.contains('hidden') ? (document.getElementById('crash-msg')||{}).textContent : null; })()`);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await st()) === 'fight') break; }
  await sleep(1500);

  log('=== A. 窗口尺寸变化 ===');
  for (const [w, h, tag] of [[960,540,'960x540'],[1920,1080,'1920x1080'],[844,390,'844x390'],[390,844,'390x844'],[1280,720,'1280x720']]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(900);
    const c = await crash();
    const camOk = await b.evaluate(`(() => { const S = window.__SS; const c = S.activeCamera; return { ar: +c.aspect.toFixed(3), fov: +c.fov.toFixed(1), canvasW: S.render ? S.render.renderer.domElement.width : -1, canvasH: S.render ? S.render.renderer.domElement.height : -1 }; })()`);
    log('  ' + tag + ' -> ' + JSON.stringify(camOk) + (c ? ' 崩溃:' + c : ''));
    if (c) issues.push(tag + ' resize 崩溃');
    const overflow = await b.evaluate(`(() => { const bad = []; for (const e of document.querySelectorAll('#hud *, #touch-ui *')) { const r = e.getBoundingClientRect(); if (r.width > 2 && (r.right > innerWidth + 4 || r.left < -4 || r.bottom > innerHeight + 4 || r.top < -4)) bad.push((e.id || e.className || e.tagName).toString().slice(0, 28)); } return [...new Set(bad)].slice(0, 8); })()`);
    if (overflow.length) log('    溢出屏幕的元素: ' + JSON.stringify(overflow));
    chk(overflow.length === 0, tag + ' 无 HUD 元素溢出屏幕' + JSON.stringify(overflow));
  }
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  await b.screenshot('shots/AUD6-01-resize.png');

  log('=== B. 全部按键 ===');
  const keyMap = [['KeyR','重开'],['KeyQ','锁定'],['KeyF','全屏'],['KeyH','反转术式'],['KeyO','茈'],['KeyG','领域'],['Escape','暂停'],['Space','闪避']];
  for (const [k, n] of keyMap) {
    await b.pressKey(k, 60); await sleep(k === 'KeyR' ? 3500 : 1200);
    const c = await crash();
    if (c) { issues.push(n + ' 崩溃: ' + c); break; }
    if (k === 'Escape') { await b.pressKey('Escape', 60); await sleep(900); }
    if (k === 'KeyR') { for (let i = 0; i < 30; i++) { await sleep(300); if ((await st()) === 'fight') break; } }
    log('  ' + n + '(' + k + ') 后 state=' + (await st()));
  }
  chk(!(await crash()), '全部按键无崩溃');

  log('=== C. 燃尽 / 适应 / 领域展延 ===');
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setAiEnabled(false); d.setInvincible("gojo", true); return true; })()`);
  const beforeBurn = await b.evaluate('({ g: window.__SS.snap.burnout.gojo, s: window.__SS.snap.burnout.sukuna, adapt: window.__SS.snap.adapt.total })');
  log('  ' + JSON.stringify(beforeBurn));
  // 连续放技能把咒力打空 → 燃尽
  for (let i = 0; i < 8; i++) { await b.evaluate('window.__SS.combat.forceSkill("blue","gojo")'); await sleep(700); }
  await sleep(1500);
  const afterBurn = await b.evaluate('({ g: window.__SS.snap.burnout.gojo, ce: window.__SS.snap.gojo.ce })');
  log('  连放苍之后: ' + JSON.stringify(afterBurn));
  await b.screenshot('shots/AUD6-02-burnout.png');

  log('=== D. 3 分钟耐力 + 内存 ===');
  await b.evaluate(`(() => { window.__MEM = []; const d = window.__SS.combat; d.setAiEnabled(true); d.setInvincible("gojo", false); return true; })()`);
  const t0 = Date.now();
  let frames = 0;
  await b.evaluate(`(() => { window.__FC = 0; const t = () => { window.__FC++; requestAnimationFrame(t); }; requestAnimationFrame(t); return true; })()`);
  while (Date.now() - t0 < 120000) {
    const k = ['KeyW','KeyA','KeyS','KeyD'][Math.floor(Math.random()*4)];
    await b.keyDown(k);
    if (Math.random() < 0.7) await b.pressKey(['KeyJ','KeyJ','KeyK','KeyU','KeyI'][Math.floor(Math.random()*5)], 45);
    await sleep(300 + Math.random()*500);
    await b.keyUp(k);
    if (Math.random() < 0.2) { await b.keyDown('ShiftLeft'); await sleep(400); await b.keyUp('ShiftLeft'); }
    if (await crash()) { issues.push('3 分钟耐力测试崩溃'); break; }
    // 每 15 秒采样一次
    if ((Date.now() - t0) % 15000 < 600) {
      const m = await b.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1');
      await b.evaluate('window.__MEM.push(' + m + '); true');
    }
  }
  const memSeries = await b.evaluate('window.__MEM.slice()');
  const fc = await b.evaluate('window.__FC');
  log('  2 分钟帧数 ' + fc + '（约 ' + (fc/120).toFixed(0) + ' fps）  堆内存序列 MB: ' + JSON.stringify(memSeries));
  chk(memSeries.length < 2 || memSeries[memSeries.length-1] < memSeries[0] * 1.6 + 20, '2 分钟内存无明显泄漏 ' + JSON.stringify(memSeries));
  chk(!(await crash()), '2 分钟耐力无崩溃');
  await b.screenshot('shots/AUD6-03-endurance.png');
  const snap = await b.evaluate('({ g: window.__SS.snap.gojo.hp.toFixed(0), s: window.__SS.snap.sukuna.hp.toFixed(0), mode: window.__SS.snap.mode })');
  log('  结束时: ' + JSON.stringify(snap));
  log('页面错误 ' + JSON.stringify(b.errors.slice(0, 6)));
  log('\n通过 ' + ok.length + ' 项，问题 ' + issues.length + ' 项');
  for (const i of issues) log('  ✗ ' + i);
} catch (e) { log('FATAL ' + String(e).slice(0, 400)); }
finally { await b.close(); }
