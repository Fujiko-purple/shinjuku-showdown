import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9661, width: 900, height: 520 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  // 关掉 AI，排除被打断
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(600);
  await b.evaluate(`(() => {
    window.__LEG = [];
    const tick = () => {
      const f = window.__SS && window.__SS.gojo;
      if (f && f.bones && f.bones.thighL) {
        window.__LEG.push({
          thL: +f.bones.thighL.rotation.x.toFixed(4),
          thR: +f.bones.thighR.rotation.x.toFixed(4),
          shL: +f.bones.shinL.rotation.x.toFixed(4),
          z: +f.root.position.z.toFixed(3),
          x: +f.root.position.x.toFixed(3),
          sn: window.__SS.snap ? window.__SS.snap.gojo.anim : null,
          ph: window.__SS.snap ? window.__SS.snap.gojo.phase : null,
        });
      }
      if (window.__LEG.length < 260) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await b.evaluate(`window.__LEG.length = 0; true`);
  await b.keyDown('KeyW'); await sleep(700);
  await b.screenshot('shots/LEG-walk-1.png');
  await sleep(600);
  await b.screenshot('shots/LEG-walk-2.png');
  await b.keyUp('KeyW');
  const rows = await b.evaluate(`window.__LEG.slice()`);
  const thL = rows.map(r => r.thL);
  const range = a => a.length ? +(Math.max(...a) - Math.min(...a)).toFixed(4) : null;
  console.log('帧数 ' + rows.length);
  console.log('thighL 范围 ' + range(thL) + ' rad');
  console.log('位移 X ' + (Math.max(...rows.map(r=>r.x)) - Math.min(...rows.map(r=>r.x))).toFixed(3) + ' m   Z ' + (Math.max(...rows.map(r=>r.z)) - Math.min(...rows.map(r=>r.z))).toFixed(3) + ' m');
  console.log('anim 集合 ' + JSON.stringify([...new Set(rows.map(r=>r.sn))]));
  console.log('phase 集合 ' + JSON.stringify([...new Set(rows.map(r=>r.ph))]));
  // 采样 thighL 曲线（每 15 帧取一个点）
  const curve = []; for (let i = 0; i < thL.length; i += 15) curve.push(thL[i]);
  console.log('thighL 曲线(每15帧): ' + JSON.stringify(curve));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
