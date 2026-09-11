import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9462 });
const t0 = Date.now();
const mark = (m) => console.log('[' + ((Date.now()-t0)/1000).toFixed(1) + 's] ' + m);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(11000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  mark('进入战斗');

  const mem = () => b.evaluate(`(() => { const m = performance.memory; const r = window.__SS && window.__SS.render; const i = r && r.renderer ? r.renderer.info : null; return { heapMB: m ? +(m.usedJSHeapSize/1048576).toFixed(1) : null, geoms: i ? i.memory.geometries : null, texs: i ? i.memory.textures : null, progs: i && i.programs ? i.programs.length : null, draws: i ? i.render.calls : null }; })()`);

  mark('初始 ' + JSON.stringify(await mem()));

  for (let i = 1; i <= 24; i++) {
    const t = Date.now();
    const parts = {};
    try {
      let p = Date.now(); await b.keyDown('KeyW'); await sleep(150); await b.keyUp('KeyW'); parts.move = Date.now() - p;
      p = Date.now(); for (const k of ['KeyJ','KeyJ','KeyJ']) { await b.pressKey(k, 45); await sleep(140); } await b.pressKey('KeyK', 55); parts.melee = Date.now() - p;
      p = Date.now(); await b.pressKey('KeyG'); parts.domain = Date.now() - p;
      p = Date.now(); const s = await b.evaluate(`(() => { const x = window.__SS && window.__SS.snap; return x ? { domG: +x.gojo.domain.toFixed(0), mode: x.mode, gHp: +x.gojo.hp.toFixed(0) } : null; })()`); parts.read = Date.now() - p;
      if (i % 6 === 0) { p = Date.now(); await b.screenshot('shots/hangdiag-' + (i/6) + '.png'); parts.shot = Date.now() - p; }
      mark('#' + i + ' total ' + (Date.now()-t) + 'ms  ' + JSON.stringify(parts) + '  ' + JSON.stringify(s));
      if (i % 6 === 0) mark('   mem ' + JSON.stringify(await mem()));
    } catch (e) {
      mark('#' + i + ' ❌ ' + String(e).slice(0, 100) + '  parts=' + JSON.stringify(parts));
      break;
    }
  }
  mark('结束');
} catch (e) { mark('FATAL ' + String(e).slice(0, 200)); }
finally { await b.close(); }
