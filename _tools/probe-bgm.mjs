import { Browser, sleep } from './cdp.mjs';
const TARGET = process.argv[2] || 'http://127.0.0.1:8173/';
const tag = process.argv[3] || 'site';
const b = new Browser({ port: parseInt(process.argv[4] || '9511', 10), width: 1024, height: 640 });
const rows = [];
const snap = async (label) => {
  const s = await b.evaluate(`(() => {
    const el = document.getElementById('bgm');
    if (!el) return { missing: true };
    return {
      src: (el.getAttribute('src') || '').slice(0, 40),
      dataSrc: (el.getAttribute('data-src') || '').slice(0, 40),
      paused: el.paused, volume: +el.volume.toFixed(2),
      readyState: el.readyState, networkState: el.networkState,
      currentTime: +el.currentTime.toFixed(2), duration: isFinite(el.duration) ? +el.duration.toFixed(1) : String(el.duration),
      error: el.error ? { code: el.error.code, msg: el.error.message } : null,
      lazy: window.__BGM_LAZY ? { loaded: window.__BGM_LAZY.loaded, playing: window.__BGM_LAZY.playing } : null,
      audioCtx: window.__SS && window.__SS.audio && window.__SS.audio.state ? window.__SS.audio.state : null,
    };
  })()`);
  rows.push(label + ' :: ' + JSON.stringify(s));
  return s;
};
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: TARGET });
  await sleep(20000);
  await snap('加载完成(未交互)');
  // 模拟真实用户交互：点一下标题
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(4000);
  await snap('点击后 4s');
  await sleep(6000);
  await snap('点击后 10s');
  // 再点一次（有些浏览器需要第二次手势）
  await b.evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`);
  await sleep(5000);
  await snap('再交互后 15s');
  console.log(rows.join('\n'));
  console.log('网络失败: ' + JSON.stringify(b.failedRequests.slice(0,5)));
  console.log('页面错误: ' + JSON.stringify(b.errors.slice(0,3)));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
