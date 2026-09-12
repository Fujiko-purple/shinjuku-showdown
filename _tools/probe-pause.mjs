import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9749, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(1500);
  const st = () => b.evaluate('window.__SS.state');
  const pauseUI = () => b.evaluate(`(() => { const e = document.getElementById('screen-pause') || document.querySelector('.screen.paused'); const btn = document.getElementById('btn-resume'); const r = btn ? btn.getBoundingClientRect() : null; return { hasScreen: !!e, resumeBtn: r ? { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) } : null }; })()`);
  log('初始 state=' + await st());
  for (let i = 0; i < 4; i++) {
    await b.pressKey('Escape', 60); await sleep(1000);
    log('第 ' + (2*i+1) + ' 次 Escape -> state=' + (await st()) + ' UI=' + JSON.stringify(await pauseUI()));
    await b.pressKey('Escape', 60); await sleep(1000);
    log('第 ' + (2*i+2) + ' 次 Escape -> state=' + (await st()));
  }
  // 用暂停菜单的按钮恢复
  await b.pressKey('Escape', 60); await sleep(900);
  log('暂停后点击按钮恢复: before=' + (await st()));
  await b.evaluate(`(() => { const e = document.getElementById('btn-resume'); if (e) e.click(); return !!e; })()`);
  await sleep(1000);
  log('  点击后 state=' + (await st()));
  // 暂停时按 R / 空格
  await b.pressKey('Escape', 60); await sleep(900);
  await b.pressKey('KeyR', 60); await sleep(2500);
  log('暂停中按 R -> state=' + (await st()));
  await b.pressKey('Escape', 60); await sleep(900);
  await b.pressKey('Space', 60); await sleep(1200);
  log('暂停中按空格 -> state=' + (await st()));
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
