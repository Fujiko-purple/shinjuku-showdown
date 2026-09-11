import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9669, width: 900, height: 520 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.evaluate(`(() => {
    const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false);
    const g = window.__SS.gojo;
    window.__MV = [];
    const orig = g.moveTowards;
    g.moveTowards = function (x, z, speed, dt) {
      if (window.__MV.length < 400) window.__MV.push({
        tx: +x.toFixed(2), tz: +z.toFixed(2), sp: +speed.toFixed(2), dt: +dt.toFixed(4),
        rx: +g.root.position.x.toFixed(2), rz: +g.root.position.z.toFixed(2), t: +performance.now().toFixed(0)
      });
      return orig.call(g, x, z, speed, dt);
    };
    return true;
  })()`);
  await sleep(500);
  await b.evaluate('window.__MV.length = 0; window.__MVT0 = performance.now(); true');
  await b.keyDown('KeyW');
  await sleep(2200);
  await b.keyUp('KeyW');
  const mv = await b.evaluate('window.__MV.slice()');
  const t0 = mv.length ? mv[0].t : 0;
  console.log('调用次数 ' + mv.length + ' (约 2.2s)');
  for (let i = 0; i < mv.length; i += Math.max(1, Math.floor(mv.length / 22))) {
    const m = mv[i];
    const dist = Math.hypot(m.tx - m.rx, m.tz - m.rz);
    const dx = m.tx - m.rx, dz = m.tz - m.rz, l = dist || 1;
    console.log((m.t - t0) + 'ms  sp=' + m.sp + ' dt=' + m.dt + ' root=(' + m.rx + ',' + m.rz + ') target=(' + m.tx + ',' + m.tz + ') dist=' + dist.toFixed(2) + ' dir=(' + (dx/l).toFixed(2) + ',' + (dz/l).toFixed(2) + ')');
  }
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
