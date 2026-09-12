import { Browser, sleep } from './cdp.mjs';
const URL = 'https://shinjuku-showdown.pages.dev/';
const b = new Browser({ port: 9773, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  const t0 = Date.now();
  await b.send('Page.navigate', { url: URL });
  await sleep(16000);
  log('加载耗时 ' + ((Date.now()-t0)/1000).toFixed(1) + 's');
  const boot = await b.evaluate(`(() => ({ title: document.title, boot: window.__BOOT ? { ok: window.__BOOT.ok, step: window.__BOOT.step } : null, state: window.__SS ? window.__SS.state : null, crash: (() => { const e = document.getElementById('crash'); return e && !e.classList.contains('hidden') ? (document.getElementById('crash-msg')||{}).textContent : null; })(), lazy: window.__BGM_LAZY ? { loaded: __BGM_LAZY.loaded, pick: __BGM_LAZY.pick } : null, btns: [...document.querySelectorAll('.bgm-btn')].map(x => x.textContent), codes: [...document.querySelectorAll('audio')].map(a => ({ id: a.id, src: (a.getAttribute('src')||'(未加载)') })) }))()`);
  log('启动: ' + JSON.stringify(boot));
  // 部署新鲜度：拉 game.js 看有没有新曲目
  const g = await b.evaluate(`fetch('assets/game.js').then(r => r.text()).then(t => ({ len: t.length, hasShinjuku: t.indexOf('shinjuku') >= 0, hasTrackName: t.indexOf('最强之战') >= 0, hasBgmLoad: t.indexOf('__BGM_LOAD') >= 0 })).catch(e => 'ERR ' + e.message)`);
  log('线上 game.js: ' + JSON.stringify(g));
  // 开一局，验证能玩
  await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(3000);
  const play = await b.evaluate(`(() => ({ state: window.__SS.state, hp: window.__SS.snap.gojo.hp.toFixed(0) + '/' + window.__SS.snap.sukuna.hp.toFixed(0), bgm: window.__BGM_STATE(), audios: [...document.querySelectorAll('audio')].map(a => ({ id: a.id, src: (a.getAttribute('src')||'(未加载)'), paused: a.paused, t: +a.currentTime.toFixed(1) })) }))()`);
  log('战斗: ' + JSON.stringify(play));
  // 切歌
  await b.evaluate('document.getElementById("audio-toggle").click(); true');
  await sleep(300);
  await b.evaluate(`(() => { const t = [...document.querySelectorAll('.bgm-btn')].find(x => x.textContent.indexOf('最强') >= 0); if (t) t.click(); return true; })()`);
  await sleep(4000);
  const sw = await b.evaluate(`(() => ({ bgm: window.__BGM_STATE(), audios: [...document.querySelectorAll('audio')].map(a => ({ id: a.id, src: (a.getAttribute('src')||'(未加载)'), paused: a.paused, t: +a.currentTime.toFixed(1) })) }))()`);
  log('切歌后: ' + JSON.stringify(sw));
  await b.screenshot('shots/LIVE-check.png');
  log('控制台错误 ' + JSON.stringify(b.errors.slice(0,5)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
