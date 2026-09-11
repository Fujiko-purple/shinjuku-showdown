import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9571, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  // 注入长任务观察器 + 音频打点
  await b.evaluate(`(() => {
    window.__LT = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LT.push({ t: Math.round(e.startTime), d: Math.round(e.duration), name: e.name }); }).observe({ entryTypes: ['longtask'] });
    } catch (err) { window.__LT.push({ err: String(err) }); }
    // 给 audio.loop / el.play 打点
    window.__AUDIO = [];
    const proto = HTMLMediaElement.prototype;
    const origPlay = proto.play;
    proto.play = function () {
      const t0 = performance.now();
      const r = origPlay.apply(this, arguments);
      const t1 = performance.now();
      window.__AUDIO.push({ at: Math.round(t1), kind: 'play', sync: +(t1 - t0).toFixed(1), src: (this.getAttribute('src')||'').slice(0,24), dur: this.duration });
      return r;
    };
    return true;
  })()`);
  await sleep(12000);
  const t0 = await b.evaluate(`Math.round(performance.now())`);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(8000);
  const out = await b.evaluate(`(() => ({ lt: (window.__LT||[]).slice(0,12), audio: (window.__AUDIO||[]).slice(0,8), now: Math.round(performance.now()) }))()`);
  console.log('点击时刻 t=' + t0);
  console.log('长任务(>50ms):');
  for (const x of out.lt) if (x.d > 40) console.log('  t=' + x.t + ' 持续 ' + x.d + 'ms');
  console.log('音频 play() 调用:');
  for (const a of out.audio) console.log('  t=' + a.at + ' ' + a.kind + ' 同步耗时 ' + a.sync + 'ms dur=' + a.dur);
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
