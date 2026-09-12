import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9753, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(2000);
  const wrapped = await b.evaluate(`(() => {
    window.__AT = [];
    const S = window.__SS;
    const push = (ns, name, ms) => { if (ms > 4) window.__AT.push({ ns, name, ms: +ms.toFixed(1) }); };
    const wrap = (obj, ns) => { if (!obj) return 0; let n = 0;
      for (const k of Object.keys(obj)) { if (typeof obj[k] !== 'function' || k === 'then') continue;
        try { const o = obj[k].bind(obj); obj[k] = function (...a) { const t = performance.now(); const r = o(...a); const d = performance.now() - t; push(ns, k, d); return r; }; n++; } catch (e) {} }
      return n; };
    const n1 = wrap(S.audio, 'audio');
    const n2 = wrap(S.fx, 'fx');
    const n3 = wrap(S.weapons, 'weapons');
    const n4 = wrap(S.city, 'city');
    const n5 = wrap(S.combat, 'combat');
    return { audio: n1, fx: n2, weapons: n3, city: n4, combat: n5 };
  })()`);
  log('已包装: ' + JSON.stringify(wrapped));
  // 长帧采样（记录该帧内所有 >4ms 的调用）
  await b.evaluate(`(() => { window.__HK2 = []; let last = performance.now();
    const t = () => { const n = performance.now(); const d = n - last; last = n;
      if (d > 45) { window.__HK2.push({ ms: +d.toFixed(0), at: n, calls: window.__AT.slice() }); }
      window.__AT.length = 0; requestAnimationFrame(t); };
    requestAnimationFrame(t); return true; })()`);
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible("gojo", true); d.setAiEnabled(false); return true; })()`);
  const FS = (sk, side) => b.evaluate('window.__SS.combat.forceSkill("' + sk + '","' + side + '")');
  await b.evaluate('window.__HK2.length = 0; true');
  await FS('void', 'gojo'); await sleep(3000);
  await FS('shrine', 'sukuna'); await sleep(6000);
  const HK = await b.evaluate('window.__HK2.slice()');
  log('长帧 ' + HK.length + ' 处');
  for (const h of HK.slice(0, 10)) {
    const agg = {};
    for (const c of h.calls) { const k = c.ns + '.' + c.name; agg[k] = (agg[k] || 0) + c.ms; }
    const top = Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0, 6).map(([k,v]) => k + '=' + v.toFixed(0) + 'ms');
    log('  ' + h.ms + 'ms  ' + top.join('  '));
  }
} catch (e) { log('FATAL ' + String(e).slice(0, 300)); }
finally { await b.close(); }
