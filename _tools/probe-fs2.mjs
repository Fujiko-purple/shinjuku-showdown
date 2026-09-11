import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9683, width: 390, height: 844 });
const log = (...a) => console.log(...a);
async function tapSelector(sel) {
  const rect = await b.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height }; })()`);
  if (!rect) { log('未找到 ' + sel); return false; }
  const p = { x: Math.round(rect.x), y: Math.round(rect.y) };
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await sleep(60);
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(120);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(50);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  log('已点击 ' + sel + ' @' + p.x + ',' + p.y);
  return true;
}
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1' });
  await sleep(13000);
  log('初始 ' + JSON.stringify(await b.evaluate(`({ crash: !document.getElementById('crash').classList.contains('hidden'), fsl: window.__FSL || null, full: !!document.fullscreenElement, orient: screen.orientation ? screen.orientation.type : null, lockFn: !!(screen.orientation && screen.orientation.lock) })`)));
  await b.screenshot('shots/FS-0-portrait.png');
  await tapSelector('[data-act="rotate-go"]');
  await sleep(2500);
  log('点「全屏并横屏」后 ' + JSON.stringify(await b.evaluate(`({ crash: !document.getElementById('crash').classList.contains('hidden'), crashMsg: (document.getElementById('crash-msg')||{}).textContent||'', fsl: window.__FSL || null, full: !!document.fullscreenElement, orient: screen.orientation ? screen.orientation.type : null, vw: innerWidth, vh: innerHeight })`)));
  await b.screenshot('shots/FS-1-after.png');
  log('页面错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
