import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const log = (...a) => console.log(...a);
const b = new Browser({ port: 9685, width: 1280, height: 720 });
async function snapAt(tag) {
  const s = await b.evaluate(`(() => {
    const S = window.__SS; if (!S) return {};
    const c = window.__CAMUI || {};
    return { state: S.state, frac: c.frac, dist: c.dist, pitch: c.pitch, usePitch: c.usePitch,
             gojo: S.snap ? S.snap.gojo.anim + '/' + S.snap.gojo.phase + ' hp' + S.snap.gojo.hp.toFixed(0) : '-',
             suku: S.snap ? S.snap.sukuna.anim + ' hp' + S.snap.sukuna.hp.toFixed(0) : '-',
             mode: S.snap ? S.snap.mode : '-', fps: window.__FPS ? window.__FPS() : null };
  })()`);
  log(tag + ' ' + JSON.stringify(s));
}
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(14000);
  await b.screenshot('shots/FIN-00-title.png'); await snapAt('标题');
  // 进片头，抓茈那一发
  await b.evaluate(`document.getElementById('btn-start').click(); true`);
  for (const t of [8000, 6000, 6000, 6000]) { await sleep(t); }
  await b.screenshot('shots/FIN-01-cine.png');
  await b.evaluate(`(() => { const e = document.getElementById('btn-skip-cine'); return true; })()`);
  await sleep(2000); await b.screenshot('shots/FIN-02-cine-late.png');
  await snapAt('片头后');
  // 跳过播片入场
  const el = await b.evaluate(`(() => { const e = document.getElementById('btn-skip-cine'); if (e && e.offsetParent) { e.click(); return true; } return false; })()`);
  log('跳过播片 ' + el);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(2500);
  await b.screenshot('shots/FIN-03-fight.png'); await snapAt('开局');
  // 连击
  await b.keyDown('KeyW'); await sleep(900);
  for (const k of ['KeyJ','KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 55); await sleep(260); }
  await sleep(120); await b.screenshot('shots/FIN-04-combo.png'); await snapAt('连击');
  await b.keyUp('KeyW');
  await b.pressKey('KeyU', 60); await sleep(700); await b.screenshot('shots/FIN-05-skill.png'); await snapAt('术式');
  await sleep(4000);
  await b.pressKey('KeyI', 60); await sleep(900); await b.screenshot('shots/FIN-06-red.png'); await snapAt('赤');
  await sleep(3500);
  await b.pressKey('KeyG', 60); await sleep(2600); await b.screenshot('shots/FIN-07-domain.png'); await snapAt('领域');
  await sleep(4000); await b.screenshot('shots/FIN-08-domain2.png'); await snapAt('领域2');
  // 冲刺
  await b.keyDown('ShiftLeft'); await b.keyDown('KeyW'); await sleep(700); await b.screenshot('shots/FIN-09-dash.png'); await snapAt('冲刺');
  await b.keyUp('KeyW'); await b.keyUp('ShiftLeft');
  await sleep(3000); await b.screenshot('shots/FIN-10-idle.png'); await snapAt('收招');
  // 空格闪避
  await b.keyDown('Space'); await sleep(60); await b.keyUp('Space'); await sleep(200);
  await b.screenshot('shots/FIN-11-dodge.png'); await snapAt('闪避');
  log('错误 ' + JSON.stringify(b.errors.slice(0,6)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
