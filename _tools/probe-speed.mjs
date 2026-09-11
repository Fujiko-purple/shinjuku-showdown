import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9671, width: 900, height: 520 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.evaluate(`(() => {
    const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false);
    window.__TR = [];
    let t0 = 0;
    const tick = () => {
      const g = window.__SS.gojo;
      if (!t0) t0 = performance.now();
      window.__TR.push({ t: +(performance.now() - t0).toFixed(0), x: +g.root.position.x.toFixed(3), z: +g.root.position.z.toFixed(3), a: window.__SS.snap.gojo.anim });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`);
  await sleep(900);
  await b.evaluate('window.__TR.length = 0; true');
  await b.keyDown('KeyW');
  await sleep(2500);
  await b.keyUp('KeyW');
  const tr = await b.evaluate('window.__TR.slice()');
  console.log('rAF 帧数 ' + tr.length + '  时长 ' + (tr.length ? tr[tr.length-1].t : 0) + 'ms');
  let prev = null;
  const marks = [250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250];
  for (const m of marks) {
    const idx = tr.findIndex(r => r.t >= m);
    if (idx > 0) {
      const a = tr[0], c = tr[idx];
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      console.log(m + 'ms  累计 ' + d.toFixed(2) + 'm  平均 ' + (d / (c.t / 1000)).toFixed(2) + ' m/s');
    }
  }
  // 瞬时速度（相邻采样，取中段）
  const inst = [];
  for (let i = 1; i < tr.length; i++) { const dt = (tr[i].t - tr[i-1].t) / 1000; if (dt > 0.0005) inst.push(Math.hypot(tr[i].x-tr[i-1].x, tr[i].z-tr[i-1].z)/dt); }
  const seg = (a, b2) => { const s = inst.slice(Math.floor(inst.length*a), Math.floor(inst.length*b2)); return s.length ? (s.reduce((p,c)=>p+c,0)/s.length).toFixed(2) : '-'; };
  console.log('瞬时速度分段 m/s: 0-20%=' + seg(0,0.2) + ' 20-40%=' + seg(0.2,0.4) + ' 40-60%=' + seg(0.4,0.6) + ' 60-80%=' + seg(0.6,0.8) + ' 80-100%=' + seg(0.8,1));
  console.log('anim 集合 ' + JSON.stringify([...new Set(tr.map(r=>r.a))]));
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
