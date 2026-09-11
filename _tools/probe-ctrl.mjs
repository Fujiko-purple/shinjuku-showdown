import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9667, width: 900, height: 520 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); const g = window.__SS.gojo; console.log('keys ' + Object.keys(g).join(',')); return Object.keys(g).join(','); })()`);
  const keys = await b.evaluate(`Object.keys(window.__SS.gojo).join(',')`);
  console.log('gojo keys: ' + keys);
  console.log('snap keys: ' + await b.evaluate(`Object.keys(window.__SS.snap.gojo).join(',')`));
  await b.keyDown('KeyW');
  const rows = [];
  for (let i = 0; i < 10; i++) {
    await sleep(200);
    rows.push(await b.evaluate(`(() => { const g = window.__SS.gojo; return {t:performance.now().toFixed(0), rx:+g.root.position.x.toFixed(2), rz:+g.root.position.z.toFixed(2), px:(g.p?+g.p.x.toFixed(2):null), pz:(g.p?+g.p.z.toFixed(2):null), anim:window.__SS.snap.gojo.anim}; })()`));
  }
  await b.keyUp('KeyW');
  console.log(JSON.stringify(rows, null, 0));
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
