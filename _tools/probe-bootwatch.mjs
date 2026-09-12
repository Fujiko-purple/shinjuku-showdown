import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9511, width: 1280, height: 720 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Network.enable', {});
  // 限速到 ~200KB/s：2.5MB 的 game.js 要 12 秒以上，模拟"慢网络首次访问"
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
  await b.send('Page.navigate', { url: 'http://127.0.0.1:8180/index.html?slow=' + Date.now() });
  const read = async (label) => {
    const s = await ev(`(() => { const d = document.getElementById('boot-diag'); const lt = document.querySelector('#loading .loading-text');
      return { t: Math.round(performance.now()), diagHidden: !d || d.classList.contains('hidden'), diagText: d ? (d.textContent || '').slice(0, 60) : '',
               loadingText: lt ? lt.textContent : '', ok: !!(window.__BOOT && window.__BOOT.ok), hasSS: !!window.__SS }; })()`);
    console.log(label, JSON.stringify(s));
    return s;
  };
  await sleep(10000); await read('T10');
  await sleep(6000); await read('T16');
  // 放开限速，等它真正启动
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(30000);
  const fin = await read('T52');
  console.log('CLEARED', JSON.stringify({ diagHidden: fin.diagHidden, ok: fin.ok, hasSS: fin.hasSS, loadingText: fin.loadingText }));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
