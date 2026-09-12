import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9779, width: 844, height: 390 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: URL + '?touch=1' });
  await sleep(16000);
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]'); if (e) e.click(); return true; })()`);
  await sleep(900);
  await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(2500);
  const info = await b.evaluate(`(() => {
    const h = document.getElementById('bgm-pick');
    const p = document.querySelector('.audio-panel');
    const d = document.querySelector('.audio-dock');
    const cs = h ? getComputedStyle(h) : null;
    return {
      pickClass: h ? h.className : 'missing',
      pickDisplay: cs ? cs.display : '-',
      pickRect: h ? (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)])(h.getBoundingClientRect()) : null,
      panelDisplay: getComputedStyle(p).display,
      panelRect: (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)])(p.getBoundingClientRect()),
      panelChildren: [...p.children].map(c => ({ tag: c.tagName, id: c.id, cls: c.className, w: Math.round(c.getBoundingClientRect().width) })),
      tracks: window.__SS_BGM_TRACKS || 'n/a',
      dockOpen: d.classList.contains('open')
    };
  })()`);
  log(JSON.stringify(info, null, 1));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
