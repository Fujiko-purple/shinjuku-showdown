import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9785, width: 844, height: 390 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Page.navigate', { url: URL + '?touch=1' });
  await sleep(16000);
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]'); if (e) e.click(); return true; })()`);
  await sleep(800);
  await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(2000);
  const info = await b.evaluate(`(() => {
    const p = document.querySelector('.audio-panel');
    const chain = [];
    let e = p;
    while (e && chain.length < 6) { chain.push((e.tagName || '?') + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ').join('.') : '')); e = e.parentElement; }
    const d = document.querySelector('.audio-dock');
    return { chain, isInsideDock: d.contains(p), parentOfDock: d.parentElement ? (d.parentElement.tagName + '#' + (d.parentElement.id||'') + '.' + (d.parentElement.className||'')) : null,
      panelChildren: [...p.children].map(c => c.tagName + (c.id ? '#' + c.id : '') + '.' + (c.className || '')),
      matchesSel: !!document.querySelector('.audio-dock .audio-panel') };
  })()`);
  log(JSON.stringify(info, null, 1));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
