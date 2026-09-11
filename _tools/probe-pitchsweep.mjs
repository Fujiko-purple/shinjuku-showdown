import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9677, width: 1280, height: 720 });
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: NEW });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 60; i++) { await sleep(500); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(1500);
  // 持续强制 pitch，避免 camUserHold 回弹
  await b.evaluate(`(() => {
    window.__FORCE = null;
    if (!window.__FT) window.__FT = setInterval(() => { const c = window.__SS.cam; if (window.__FORCE != null) c.pitch = window.__FORCE; }, 16);
    return true;
  })()`);
  for (const p of [0.54, 0.46, 0.40, 0.34, 0.28]) {
    await b.evaluate('window.__FORCE = ' + p + '; true');
    await sleep(1600);
    await b.screenshot('shots/CAM-p' + String(p).replace('.', '') + '.png');
    const m = await b.evaluate(`(() => { const S=window.__SS,g=S.gojo,c=S.activeCamera; const v=g.root.position.clone(); v.y+=1.72; const f=g.root.position.clone();
      const h=v.project(c), ft=f.project(c); return { f:+(Math.abs(h.y-ft.y)/2).toFixed(3), d:+Math.hypot(c.position.x-g.root.position.x,c.position.z-g.root.position.z).toFixed(2), y:+c.position.y.toFixed(2), ny:+h.y.toFixed(2) }; })()`);
    console.log('pitch ' + p + ' -> ' + JSON.stringify(m));
  }
  await b.evaluate('window.__FORCE = null; true');
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
