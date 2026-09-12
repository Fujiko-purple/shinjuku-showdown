import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9761, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  const buttons = await b.evaluate(`(() => { const h = document.getElementById('bgm-pick'); if (!h) return 'missing'; return { hidden: h.classList.contains('hidden'), label: (h.querySelector('.bgm-pick-label')||{}).textContent, btns: [...h.querySelectorAll('.bgm-btn')].map(b => b.textContent + (b.classList.contains('on') ? '(选中)' : '')) }; })()`);
  log('曲目选择器: ' + JSON.stringify(buttons));
  const els = await b.evaluate(`(() => { return ['bgm','bgm2'].map(id => { const e = document.getElementById(id); return e ? { id, dur: +e.duration.toFixed(1), srcLen: (e.getAttribute('src')||'').length, loop: e.loop } : { id, missing: true }; }); })()`);
  log('音轨元素: ' + JSON.stringify(els));
  // 点开音量面板
  await b.evaluate(`document.getElementById('audio-toggle').click(); true`);
  await sleep(400);
  // 点「最强之战」
  const clicked = await b.evaluate(`(() => { const btns = [...document.querySelectorAll('.bgm-btn')]; const t = btns.find(b => b.textContent.indexOf('最强') >= 0); if (!t) return null; t.click(); return t.textContent; })()`);
  log('点击: ' + clicked);
  await sleep(2500);
  const st = await b.evaluate(`(() => ({ state: window.__BGM_STATE(), b1: (() => { const e = document.getElementById('bgm'); return { paused: e.paused, t: +e.currentTime.toFixed(2), v: e.volume }; })(), b2: (() => { const e = document.getElementById('bgm2'); return { paused: e.paused, t: +e.currentTime.toFixed(2), v: e.volume }; })() }))()`);
  log('切到最强之战后: ' + JSON.stringify(st));
  const ui1 = await b.evaluate(`[...document.querySelectorAll('.bgm-btn')].map(b => b.textContent + (b.classList.contains('on') ? '(选中)' : ''))`);
  log('按钮状态: ' + JSON.stringify(ui1));
  await b.screenshot('shots/BGM-switch.png');
  await sleep(2500);
  const adv = await b.evaluate(`(() => { const e = document.getElementById('bgm2'); return { t: +e.currentTime.toFixed(2), paused: e.paused }; })()`);
  log('2.5 秒后 bgm2 进度: ' + JSON.stringify(adv));
  // 切回雨爱
  await b.evaluate(`(() => { const t = [...document.querySelectorAll('.bgm-btn')].find(b => b.textContent.indexOf('雨爱') >= 0); if (t) t.click(); return true; })()`);
  await sleep(2500);
  const st2 = await b.evaluate(`(() => ({ b1: (() => { const e = document.getElementById('bgm'); return { paused: e.paused, t: +e.currentTime.toFixed(2) }; })(), b2: (() => { const e = document.getElementById('bgm2'); return { paused: e.paused, t: +e.currentTime.toFixed(2) }; })() }))()`);
  log('切回雨爱后: ' + JSON.stringify(st2));
  const saved = await b.evaluate('localStorage.getItem("ss_bgm")');
  log('localStorage 记录: ' + saved);
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
