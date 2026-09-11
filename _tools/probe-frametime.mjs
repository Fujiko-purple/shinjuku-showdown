import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9591, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__FRAMES = []; window.__LT2 = [];
    (function () {
      var last = performance.now();
      function loop() {
        var n = performance.now(); var d = n - last; last = n;
        window.__FRAMES.push(Math.round(d));
        if (window.__FRAMES.length > 6000) window.__FRAMES.shift();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      try { new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ window.__LT2.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    })();
  ` });
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(12000);
  await b.evaluate(`window.__FRAMES.length = 0; window.__LT2.length = 0; true`);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(8000);
  // 战斗操作：连段 + 技能
  const ops = ['KeyJ','KeyJ','KeyJ','KeyK','KeyU','KeyI','KeyO','KeyG','Space','KeyL'];
  for (const k of ops) { await b.pressKey(k, k === 'KeyO' ? 800 : k === 'KeyL' ? 600 : 50); await sleep(700); }
  await sleep(3000);
  const r = await b.evaluate(`(() => {
    const f = window.__FRAMES.slice();
    const s = f.slice().sort((a,b)=>a-b);
    const over = f.map((d,i)=>({i,d})).filter(x=>x.d>33);
    return { n: f.length, avg: +(f.reduce((a,b)=>a+b,0)/f.length).toFixed(2),
             p50: s[Math.floor(s.length*0.5)], p95: s[Math.floor(s.length*0.95)], p99: s[Math.floor(s.length*0.99)], max: s[s.length-1],
             over33: over.length, worst: over.slice(0,10),
             lt: window.__LT2.slice(0,8) };
  })()`);
  console.log('战斗中帧时间统计（n=' + r.n + '）:');
  console.log('  avg ' + r.avg + 'ms | p50 ' + r.p50 + ' | p95 ' + r.p95 + ' | p99 ' + r.p99 + ' | max ' + r.max);
  console.log('  >33ms 的帧: ' + r.over33 + ' 个');
  console.log('  最差几帧: ' + JSON.stringify(r.worst));
  console.log('  长任务: ' + JSON.stringify(r.lt));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
