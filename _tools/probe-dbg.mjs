import { Browser, sleep } from './cdp.mjs';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9725, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: NEW });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(900);
  await b.pressKey('KeyJ', 40); await sleep(250);
  await b.keyDown('KeyW');
  for (let i = 0; i < 10; i++) {
    await sleep(200);
    const d = await b.evaluate('window.__SS.gojo.dbg');
    log((0.25 + i*0.2).toFixed(2) + 's anim=' + await b.evaluate('window.__SS.snap.gojo.anim') + '  ' + JSON.stringify(d));
  }
  await b.keyUp('KeyW');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
