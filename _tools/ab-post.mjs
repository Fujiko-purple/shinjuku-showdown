import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9531, width: 1024, height: 640 });
const run = async (tag, query) => {
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' + query });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  const out = [];
  const snap = async (name) => {
    const r = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1024, height: 640, scale: 0.1 }, captureBeyondViewport: false });
    const lum = await b.evaluate(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(r.data)};
      await img.decode();
      const c = document.createElement('canvas'); c.width = 128; c.height = 80;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 128, 80);
      const d = x.getImageData(0, 0, 128, 80).data;
      let sum = 0, blown = 0, dark = 0, peak = 0; const n = 128 * 80;
      for (let i = 0; i < d.length; i += 4) { const l = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; sum += l; if (l > 245) blown++; if (l < 12) dark++; if (l > peak) peak = l; }
      return { avg: +(sum/n).toFixed(1), blownPct: +(blown/n*100).toFixed(1), darkPct: +(dark/n*100).toFixed(1), peak: Math.round(peak) };
    })()`);
    out.push(tag + ' ' + name + ' :: ' + JSON.stringify(lum));
  };
  await snap('静止');
  await b.pressKey('KeyI');          // 赫
  await sleep(300); await snap('赫+0.3s');
  await sleep(250); await snap('赫+0.55s');
  await sleep(400); await snap('赫+0.95s');
  await sleep(2500);
  await b.pressKey('KeyO', 900);     // 茈
  await sleep(900); await snap('茈+0.9s');
  return out;
};
try {
  await b.launch(); await b.newPage();
  const a = await run('POST=1(当前)', '');
  const c = await run('POST=0(原版路径)', '?post=0');
  console.log([...a, '', ...c].join('\n'));
  console.log('错误 ' + b.errors.length);
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
