import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9481, width: 1280, height: 720 });
const rows = [];
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(11000);
  await b.evaluate(`document.getElementById('btn-start').click(); true`);
  for (let i = 0; i < 26; i++) {
    await sleep(1500);
    const st = await b.evaluate(`(() => {
      const c = window.__SS && window.__SS.cutscene;
      if (!c) return null;
      const cam = c.camera;
      return { t: +c.time.toFixed(2), dur: +c.duration.toFixed(1), shot: c.shotId, cap: c.caption,
               camX: +cam.position.x.toFixed(1), camY: +cam.position.y.toFixed(1), camZ: +cam.position.z.toFixed(1), fov: +cam.fov.toFixed(0) };
    })()`);
    if (!st) { rows.push({ i, note: 'cutscene 已结束' }); break; }
    rows.push(st);
    if (st.t > 13 && st.t < 22 && Math.abs(st.t % 1.5) < 0.9) await b.screenshot('shots/tl-' + String(st.t.toFixed(1)).replace('.', '_') + '.png');
  }
  for (const r of rows) console.log(JSON.stringify(r));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
