import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9581, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  // 尽早注入：在 document_start 记录 __BOOT.step 的变化时刻
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__STEPS = [];
    (function poll() {
      var last = null;
      var iv = setInterval(function () {
        var s = window.__BOOT && window.__BOOT.step;
        if (s && s !== last) { last = s; window.__STEPS.push({ step: s, t: Math.round(performance.now()) }); }
        if (window.__STEPS.length > 40) clearInterval(iv);
      }, 8);
      setTimeout(function(){ clearInterval(iv); }, 60000);
    })();
  ` });
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(14000);
  const steps = await b.evaluate(`window.__STEPS || []`);
  console.log('boot 各阶段时刻（间隔即该阶段耗时）:');
  let prev = 0;
  for (const s of steps) {
    const gap = s.t - prev;
    const flag = gap > 120 ? '  ⬅ ' + gap + 'ms' : '';
    console.log('  t=' + String(s.t).padStart(5) + '  ' + s.step.padEnd(14) + (prev ? '+' + gap + 'ms' : '') + flag);
    prev = s.t;
  }
  // 再看一次长任务分布
  const lt = await b.evaluate(`(() => { const a = []; try { new PerformanceObserver(()=>{}).observe({entryTypes:['longtask']}); } catch(e){} return a; })()`);
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
