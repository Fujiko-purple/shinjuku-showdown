import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9541, width: 390, height: 844 });
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1' });
  await sleep(13000);
  const before = await b.evaluate(`(() => ({ crash: !document.getElementById('crash').classList.contains('hidden'), state: window.__SS && window.__SS.state, full: !!document.fullscreenElement, bgm: window.__BGM_STATE ? window.__BGM_STATE() : null }))()`);
  console.log('初始: ' + JSON.stringify(before));
  // 点掉引导层
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]') || document.querySelector('[data-act="rotate-go"]'); if (e) e.click(); return !!e; })()`);
  await sleep(1200);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(6000);
  // 找全屏按钮并点击（模拟用户操作）
  const clicked = await b.evaluate(`(() => { const e = document.querySelector('[data-act="fullscreen"]') || document.querySelector('[data-act="full"]'); if (e) { e.click(); return e.getAttribute('data-act'); } return null; })()`);
  console.log('全屏按钮: ' + clicked);
  await sleep(3500);
  const after = await b.evaluate(`(() => ({ crash: !document.getElementById('crash').classList.contains('hidden'), crashMsg: (document.getElementById('crash-msg')||{}).textContent || '', state: window.__SS && window.__SS.state, full: !!document.fullscreenElement, bgm: window.__BGM_STATE ? window.__BGM_STATE() : null }))()`);
  console.log('点全屏后: ' + JSON.stringify(after));
  console.log('页面错误: ' + JSON.stringify(b.errors.slice(0,4)));
  await b.screenshot('shots/mobile-fullscreen-test.png');
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
