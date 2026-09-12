import { Browser, sleep } from './cdp.mjs';
const URL = 'http://127.0.0.1:8899/';
const b = new Browser({ port: 9763, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  const reqs = [];
  b.send('Network.enable').catch(()=>{});
  await b.send('Page.navigate', { url: URL });
  await sleep(14000);
  const before = await b.evaluate(`(() => ({ lazy: window.__BGM_LAZY ? { loaded: __BGM_LAZY.loaded, pick: __BGM_LAZY.pick } : null, b1src: !!document.getElementById('bgm').getAttribute('src'), b2src: !!document.getElementById('bgm2').getAttribute('src'), hasLoad: typeof window.__BGM_LOAD }))()`);
  log('首次交互前: ' + JSON.stringify(before));
  const png = await b.evaluate(`[...document.querySelectorAll('.bgm-btn')].map(b => b.textContent)`);
  log('按钮: ' + JSON.stringify(png));
  await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(2000);
  const after = await b.evaluate(`(() => ({ b1src: (document.getElementById('bgm').getAttribute('src')||''), b2src: (document.getElementById('bgm2').getAttribute('src')||''), lazy: window.__BGM_LAZY ? { loaded: __BGM_LAZY.loaded, pick: __BGM_LAZY.pick } : null, st: window.__BGM_STATE() }))()`);
  log('交互后: ' + JSON.stringify(after));
  await b.evaluate(`document.getElementById('audio-toggle').click(); true`);
  await sleep(300);
  await b.evaluate(`(() => { const t = [...document.querySelectorAll('.bgm-btn')].find(b => b.textContent.indexOf('最强') >= 0); if (t) t.click(); return true; })()`);
  await sleep(3500);
  const sw = await b.evaluate(`(() => ({ b1: { paused: document.getElementById('bgm').paused, t: +document.getElementById('bgm').currentTime.toFixed(1) }, b2: { paused: document.getElementById('bgm2').paused, t: +document.getElementById('bgm2').currentTime.toFixed(1), src: (document.getElementById('bgm2').getAttribute('src')||'') }, st: window.__BGM_STATE() }))()`);
  log('切到最强之战: ' + JSON.stringify(sw));
  await b.screenshot('shots/BGM-site.png');
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
