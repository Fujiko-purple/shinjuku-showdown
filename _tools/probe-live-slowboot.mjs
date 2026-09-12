import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9512, width: 1280, height: 720 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Network.enable', {});
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 200, downloadThroughput: 180 * 1024, uploadThroughput: 80 * 1024 });
  await b.send('Page.navigate', { url: 'https://shinjuku-showdown.pages.dev/?slow=' + Date.now() });
  const read = async (label) => {
    const s = await ev(`(() => { const d = document.getElementById('boot-diag');
      return { t: Math.round(performance.now()), hidden: !d || d.classList.contains('hidden'), text: d ? (d.textContent || '').slice(0, 70) : '',
               ok: !!(window.__BOOT && window.__BOOT.ok), hasSS: !!window.__SS, loadingHidden: !!(document.getElementById('loading') && document.getElementById('loading').classList.contains('hidden')) }; })()`);
    console.log(label, JSON.stringify(s)); return s;
  };
  await sleep(11000); const a = await read('T11');
  await sleep(9000); const b2 = await read('T20');
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(35000); const c = await read('T55');
  console.log('VERDICT', JSON.stringify({ falseAlarm: a.text.includes('主程序未能启动') || b2.text.includes('主程序未能启动'),
    gentle: a.text.includes('仍在加载') || b2.text.includes('仍在加载'), finalOk: c.ok || c.hasSS, finalPanelHidden: c.hidden || c.loadingHidden }));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
