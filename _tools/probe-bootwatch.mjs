import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9513, width: 1280, height: 720 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Network.enable', {});
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 160 * 1024, uploadThroughput: 80 * 1024 });
  await b.send('Page.navigate', { url: 'http://127.0.0.1:8181/index.html?slow=' + Date.now() });
  const read = async (label) => {
    const s = await ev(`(() => { const d = document.getElementById('boot-diag');
      return { t: Math.round(performance.now()), hidden: !d || d.classList.contains('hidden'), title: d ? ((d.querySelector('.bd-title')||{}).textContent||'') : '',
               ok: !!(window.__BOOT && window.__BOOT.ok), step: (window.__BOOT||{}).step }; })()`);
    console.log(label, JSON.stringify(s)); return s;
  };
  await sleep(11000); const a = await read('T11');
  await sleep(9000); const c2 = await read('T20');
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(25000); const d = await read('T45');
  console.log('VERDICT', JSON.stringify({ hardAlarm: a.title.includes('主程序未能启动') || c2.title.includes('主程序未能启动'),
    gentle: a.title.includes('仍在加载') || c2.title.includes('仍在加载'), booted: d.ok, panelCleared: d.hidden || d.ok }));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
