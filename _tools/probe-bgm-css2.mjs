import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9783, width: 844, height: 390 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: URL + '?touch=1' });
  await sleep(16000);
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]'); if (e) e.click(); return true; })()`);
  await sleep(800);
  await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(2500);
  await b.evaluate('document.getElementById("audio-toggle").click(); true');
  await sleep(700);
  const info = await b.evaluate(`(() => {
    const d = document.querySelector('.audio-dock');
    const p = document.querySelector('.audio-panel');
    const h = document.getElementById('bgm-pick');
    const cs = getComputedStyle(p);
    const r = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; };
    return {
      dockCls: d.className, dockRect: r(d), dockPos: getComputedStyle(d).position, dockZ: getComputedStyle(d).zIndex,
      panelDisplay: cs.display, panelPos: cs.position, panelRect: r(p), panelFlex: cs.flexDirection, panelMinW: cs.minWidth, panelW: cs.width,
      pickDisplay: getComputedStyle(h).display, pickRect: r(h),
      label0: (e => [getComputedStyle(e).display, r(e)])(p.children[0]),
      inTouch: document.documentElement.className,
      sheets: document.styleSheets.length
    };
  })()`);
  log(JSON.stringify(info, null, 1));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
