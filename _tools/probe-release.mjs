import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9687, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(1200);
  const anim = () => b.evaluate('window.__SS.snap.gojo.anim');

  // 1) 走 -> 松手
  await b.keyDown('KeyW'); await sleep(1000); await b.keyUp('KeyW');
  await sleep(600); log('松手后 0.6s anim=' + await anim());
  await sleep(1200); log('松手后 1.8s anim=' + await anim());
  // 2) 冲刺 -> 松手
  await b.keyDown('ShiftLeft'); await b.keyDown('KeyD'); await sleep(1200);
  await b.keyUp('KeyD'); await b.keyUp('ShiftLeft'); await sleep(700);
  log('冲刺松手后 anim=' + await anim());
  // 3) 出拳 -> 站着不动
  await b.pressKey('KeyJ', 60); await sleep(1500); log('出拳后 anim=' + await anim());
  // 4) 技能 -> 不动
  await b.pressKey('KeyU', 60); await sleep(3000); log('苍后 anim=' + await anim());
  // 5) 打斗中（AI 开）连招后
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(true); return true; })()`);
  for (const k of ['KeyJ','KeyJ','KeyK','KeyU']) { await b.pressKey(k, 55); await sleep(500); }
  await sleep(3000); log('AI 打斗后 anim=' + await anim());
  await b.screenshot('shots/REL-idle.png');
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
