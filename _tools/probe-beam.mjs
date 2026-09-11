import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9482, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(11000);
  await b.evaluate(`document.getElementById('btn-start').click(); true`);
  // 先快进到 t≈19.5（用 fast 模式会失真，所以老实等）
  for (;;) {
    const t = await b.evaluate(`window.__SS && window.__SS.cutscene ? window.__SS.cutscene.time : -1`);
    if (t < 0 || t >= 19.2) break;
    await sleep(400);
  }
  const shots = [];
  for (let i = 0; i < 11; i++) {
    const st = await b.evaluate(`(() => { const c = window.__SS && window.__SS.cutscene; if (!c) return null; const cam = c.camera; return { t: +c.time.toFixed(1), shot: c.shotId, camX: +cam.position.x.toFixed(1), camZ: +cam.position.z.toFixed(1) }; })()`);
    if (!st) break;
    const p = 'shots/beam-' + String(st.t).replace('.', '_') + '-' + st.shot + '.png';
    await b.screenshot(p);
    shots.push(p + '  ' + JSON.stringify(st));
    if (st.t > 28) break;
  }
  console.log(shots.join('\n'));
  console.log('错误:', JSON.stringify(b.errors.slice(0,3)));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
