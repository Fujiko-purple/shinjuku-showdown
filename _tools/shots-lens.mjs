import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9631, width: 1600, height: 900 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(10000);
  await b.screenshot('shots/LENS-01-idle.png');
  await b.keyDown('KeyW'); await sleep(500); await b.keyUp('KeyW');
  await sleep(300);
  await b.screenshot('shots/LENS-02-walk.png');
  for (const k of ['KeyJ','KeyJ','KeyJ']) { await b.pressKey(k, 45); await sleep(140); }
  await sleep(200);
  await b.screenshot('shots/LENS-03-melee.png');
  await b.pressKey('KeyI'); await sleep(300);
  await b.screenshot('shots/LENS-04-red.png');
  await sleep(2500);
  await b.pressKey('KeyG'); await sleep(2600);
  await b.screenshot('shots/LENS-05-domain.png');
  const st = await b.evaluate(`(() => { const j = window.__SS && window.__SS.snap; return j ? { mode: j.mode, gHp:+j.gojo.hp.toFixed(0), sHp:+j.sukuna.hp.toFixed(0), dist:+j.distance.toFixed(1) } : null; })()`);
  console.log('状态 ' + JSON.stringify(st) + ' | 错误 ' + b.errors.length);
} catch (e) { console.log('ERR ' + String(e).slice(0,150)); }
finally { await b.close(); }
