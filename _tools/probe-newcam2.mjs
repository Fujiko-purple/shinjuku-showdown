import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9681, width: 1280, height: 720 });
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: NEW });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 60; i++) { await sleep(500); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(4000);
  console.log('t+4s  ' + JSON.stringify(await b.evaluate('window.__CAMUI')));
  await b.screenshot('shots/CAM2-a.png');
  await sleep(4000);
  console.log('t+8s  ' + JSON.stringify(await b.evaluate('window.__CAMUI')));
  await b.screenshot('shots/CAM2-b.png');
  await b.keyDown('KeyW'); await sleep(1400); await b.screenshot('shots/CAM2-walk.png'); await b.keyUp('KeyW');
  await sleep(2500);
  await b.pressKey('KeyJ', 60); await sleep(200);
  await b.screenshot('shots/CAM2-atk.png');
  await sleep(3000);
  console.log('t+atk ' + JSON.stringify(await b.evaluate('window.__CAMUI')));
  await b.screenshot('shots/CAM2-idle3.png');
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
