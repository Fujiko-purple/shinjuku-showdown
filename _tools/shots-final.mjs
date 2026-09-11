import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9602, width: 1024, height: 640 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.keyDown('KeyW'); await sleep(400); await b.keyUp('KeyW');
  for (const k of ['KeyJ','KeyJ','KeyJ']) { await b.pressKey(k, 45); await sleep(120); }
  await b.screenshot('shots/FINAL-hit.png');
  await b.pressKey('KeyI');
  await sleep(260);
  await b.screenshot('shots/FINAL-red-peak.png');
  await sleep(1000);
  await b.pressKey('KeyG');
  await sleep(2400);
  await b.screenshot('shots/FINAL-domain.png');
  await b.pressKey('KeyO', 900);
  await sleep(1100);
  await b.screenshot('shots/FINAL-purple.png');
  console.log('取证完成，错误 ' + b.errors.length);
} catch (e) { console.log('ERR ' + String(e).slice(0,150)); }
finally { await b.close(); }
