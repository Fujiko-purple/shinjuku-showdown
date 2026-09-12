import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9751, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  // 页内缩略图取亮度（不复用 readPixels，走 CDP 截屏解码）
  const lum = async () => {
    const data = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 40 });
    return b.evaluate(`(async () => { const img = new Image(); img.src = 'data:image/jpeg;base64,${data.data}'; await img.decode();
      const c = document.createElement('canvas'); c.width = 160; c.height = 90; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 160, 90);
      const d = x.getImageData(0, 0, 160, 90).data; let s = 0, n = 0, mx = 0;
      for (let i = 0; i < d.length; i += 4) { const v = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; s += v; n++; if (v > mx) mx = v; }
      return { avg: +(s/n).toFixed(1), max: +mx.toFixed(0) }; })()`);
  };
  await b.evaluate(`document.getElementById('btn-start').click(); true`);
  const shots = [];
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const s = await b.evaluate('window.__SS.state');
    const prog = await b.evaluate('(window.__SS.cutscene && window.__SS.cutscene.progress) || 0');
    const L = await lum();
    const sub = await b.evaluate(`(() => { const e = document.querySelector('.cine-sub, #cine-sub, .subtitle'); return e ? (e.textContent||'').trim().slice(0, 30) : null; })()`);
    shots.push({ i, state: s, prog: +prog.toFixed(3), avg: L.avg, max: L.max, sub });
    if (s !== 'cutscene') break;
  }
  for (const s of shots) log('  t=' + (s.i*1.5).toFixed(1) + 's state=' + s.state + ' prog=' + (s.prog*100).toFixed(0) + '% 亮度 avg=' + s.avg + ' max=' + s.max + (s.sub ? ' 字幕=' + s.sub : ''));
  const dark = shots.filter(s => s.state === 'cutscene' && s.avg < 4);
  log('全黑帧(avg<4): ' + dark.length);
  const flat = shots.filter(s => s.state === 'cutscene' && s.max < 60);
  log('几乎无内容帧(max<60): ' + flat.length);
} catch (e) { log('FATAL ' + String(e).slice(0, 300)); }
finally { await b.close(); }
