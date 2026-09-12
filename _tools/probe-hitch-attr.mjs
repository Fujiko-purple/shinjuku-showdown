/**
 * probe-hitch-attr.mjs —— 长帧归因探针（task-6 追加项）
 *
 * 在**不修改别人源码**的前提下，运行时给 window.__SS.weapons 的重特效方法套一层计时，
 * 就能把"第一次领域/对撞的长帧"拆成：
 *   weapons 侧（几何/材质/贴图，我的写域）  vs  其它（音频/战斗逻辑/城市破坏）
 *
 * 用法：node _tools/probe-hitch-attr.mjs
 */
import { Browser, sleep } from './cdp.mjs';

const b = new Browser({ port: 9747, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(15000);
  await b.evaluate("document.getElementById('btn-skip-cine').click(); true");
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(1500);
  await b.evaluate(`(() => {
    const S = window.__SS;
    window.__CALLS = [];
    for (const k of ['voidDomain', 'shrineDomain', 'domainClash', 'worldSlash', 'furnace', 'purple', 'red', 'blue']) {
      if (typeof S.weapons[k] !== 'function') continue;
      const orig = S.weapons[k].bind(S.weapons);
      S.weapons[k] = (o) => {
        const t0 = performance.now();
        const h = orig(o);
        window.__CALLS.push({ k, ms: +(performance.now() - t0).toFixed(1), t: +performance.now().toFixed(0) });
        return h;
      };
    }
    window.__HK = []; let last = performance.now();
    const t = () => { const n = performance.now(); const d = n - last; last = n;
      if (d > 45) { const SS = window.__SS; window.__HK.push({ ms: +d.toFixed(0), state: SS.state, mode: SS.snap ? SS.snap.mode : '-', clash: SS.snap ? SS.snap.clashActive : false, anim: SS.snap ? SS.snap.gojo.anim : '-' }); }
      requestAnimationFrame(t); };
    requestAnimationFrame(t);
    return true;
  })()`);
  await b.evaluate('window.__CALLS.length = 0; window.__HK.length = 0; true');
  await b.evaluate('window.__SS.combat.setInvincible("gojo", true); window.__SS.combat.setAiEnabled(false); true');
  const FS = (sk, side) => b.evaluate('window.__SS.combat.forceSkill("' + sk + '","' + side + '")');
  await FS('void', 'gojo'); await sleep(2600);
  await FS('shrine', 'sukuna'); await sleep(3000);
  await FS('purple200', 'gojo'); await sleep(2600);
  await FS('worldslash', 'gojo'); await sleep(2600);
  await FS('furnace', 'sukuna'); await sleep(2600);
  const HK = await b.evaluate('window.__HK.slice()');
  const CALLS = await b.evaluate('window.__CALLS.slice()');
  const warm = await b.evaluate('window.__SS.weapons.warmReport');
  console.log('长帧(>45ms): ' + HK.length);
  for (const h of HK) console.log('  ' + h.ms + 'ms  state=' + h.state + ' mode=' + h.mode + ' clash=' + h.clash + ' anim=' + h.anim);
  console.log('weapons 侧调用耗时:');
  for (const c of CALLS) console.log('  ' + c.k + ' = ' + c.ms + 'ms');
  console.log('预热报告: ' + JSON.stringify(warm));
} catch (e) { console.log('FATAL ' + String(e).slice(0, 300)); }
finally { await b.close(); }
