import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9745, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(1500);
  await b.evaluate(`(() => {
    window.__HK = []; let last = performance.now();
    const t = () => { const n = performance.now(); const d = n - last; last = n;
      if (d > 45) { const S = window.__SS; window.__HK.push({ t:+n.toFixed(0), ms:+d.toFixed(0), state:S.state, mode:S.snap?S.snap.mode:'-', dom:S.snap?S.snap.gojoDomain:'-', clash:S.snap?S.snap.clashActive:false, anim:S.snap?S.snap.gojo.anim:'-', calls:S.render?S.render.renderer.info.render.calls:0, tris:S.render?Math.round(S.render.renderer.info.render.triangles/1000):0 }); }
      requestAnimationFrame(t); };
    requestAnimationFrame(t); window.__HKC = () => { window.__HK.length = 0; window.__MEM = (performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1); }; return true;
  })()`);
  await b.evaluate('window.__HKC(); true');
  const FS = (sk, side) => b.evaluate('window.__SS.combat.forceSkill("' + sk + '","' + side + '")');
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible("gojo", true); d.setAiEnabled(false); return true; })()`);
  // 依次触发重特效
  const events = [];
  async function mark(tag, fn) { const t0 = Date.now(); await fn(); events.push({ tag, at: Date.now() - t0 }); await sleep(2600); }
  await mark('void', () => FS('void','gojo'));
  await mark('shrine', () => FS('shrine','sukuna'));
  await sleep(4000);
  await mark('purple200', () => FS('purple200','gojo'));
  await mark('worldslash', () => FS('worldslash','gojo'));
  await mark('furnace', () => FS('furnace','sukuna'));
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible("gojo", false); return true; })()`);
  await sleep(1500);
  const HK = await b.evaluate('window.__HK.slice()');
  const mem = await b.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1');
  log('长帧(>45ms): ' + HK.length + ' 处   堆内存 ' + mem + ' MB');
  for (const h of HK.slice(0, 18)) log('  ' + h.ms + 'ms  state=' + h.state + ' mode=' + h.mode + ' dom=' + h.dom + ' clash=' + h.clash + ' anim=' + h.anim + ' draws=' + h.calls + ' tris=' + h.tris + 'k');
} catch (e) { log('FATAL ' + String(e).slice(0, 300)); }
finally { await b.close(); }
