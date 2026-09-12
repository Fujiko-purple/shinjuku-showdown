/**
 * fullplay2.mjs —— 带「会玩的机器人」的整局对局（Lead 的最终实机验收工具）
 * ----------------------------------------------------------------------------
 * 与 fullplay.mjs 的区别：那个是无脑连点机器人（在新机制下必输，只能验证"没崩"）；
 * 这个会**按新机制的规则去打**：
 *   · 领域对决：页内 rAF 监听 __SS.mech().duel，指针进窗口才按 J（= 会对齐的玩家）
 *   · 黑闪    ：J 出拳后在命中帧附近按 V，并按 __SS.mech().blackFlash 的 F/P/delta 自适应校准偏移
 *   · 疾跑    ：周期性按住 Shift 突进
 *   · 魔虚罗  ：半血后优先对空（锁定 + 茈/赫），俯冲落地时切近战
 * 目的：证明「四个机制一起上是能打的、能赢的、也是看得懂的」，并留下里程碑截图。
 *
 * 用法：node _tools/fullplay2.mjs [--file dist/新宿决战.html] [--max 300] [--out shots/full2] [--port 9485]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const maxSec = parseInt(arg('max', '300'), 10);
const outDir = arg('out', 'shots/full2');
const port = parseInt(arg('port', '9485'), 10);
if (!existsSync(file)) { console.error('找不到 ' + file); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const b = new Browser({ port, width: 1600, height: 900 });
const ev = (x) => b.evaluate(x);
const R = { file, milestones: [], errors: [], shots: [], mech: null, result: null };
const shot = async (n) => { const p = outDir + '/' + n + '.png'; await b.screenshot(p); R.shots.push(p); return p; };
const snap = () => ev(`(() => { const s = __SS.snap; if (!s) return null;
  return { gHp: Math.round(s.gojo.hp), gMax: s.gojo.hpMax, sHp: Math.round(s.sukuna.hp), sMax: s.sukuna.hpMax,
    ce: Math.round(s.gojo.ce), domG: Math.round(s.gojo.domain), clash: !!s.clashActive, mode: s.mode,
    dead: s.gojo.dead || s.sukuna.dead, dist: +s.distance.toFixed(1),
    ready: s.skills.filter(k => k.ready).map(k => k.skill) }; })()`);

// 页内「会玩的玩家」：领域对齐 + 黑闪卡帧，全部在 rAF 里做，帧级精度
const AUTO = `(() => {
  // bfOffset = J 之后第几帧按 V。blackflash 作者实测命中帧在起手后 hitRel=8 帧（同一 rAF→下一帧的通道，偏移可直接用）
  window.__AUTO = { duel: true, bf: true, bfOffset: 8, hits: 0, bfHits: 0, lastF: -1, deltas: [], presses: 0, lastJ: -99 };
  const press = (c, ms) => { window.__INJECT.press(c); setTimeout(() => window.__INJECT.release(c), ms || 16); };
  window.__AUTO.reset = () => { window.__AUTO.hits = 0; window.__AUTO.bfHits = 0; window.__AUTO.deltas = []; window.__AUTO.presses = 0; };
  (function loop() {
    const A = window.__AUTO, S = window.__SS;
    try {
      const frame = S.combat.frame;
      const m = S.mech ? S.mech() : {};
      // 1) 领域对决：指针进窗口才按
      const d = m.duel;
      if (A.duel && d && d.active && typeof d.needle === 'number') {
        if (d.needle >= d.lo && d.needle <= d.hi) { press('KeyJ'); A.presses++; }
      }
      // 2) 黑闪：J 之后固定偏移按 V；再按 MECh 报的 delta 自适应校准
      const bf = m.blackFlash;
      if (bf && typeof bf.F === 'number' && bf.F !== A.lastF) {
        A.lastF = bf.F;
        if (typeof bf.delta === 'number' && bf.delta !== null) A.deltas.push(bf.delta);
        if (bf.ok) A.bfHits++;
        A.hits++;
        // delta = F - P：>0 表示按早了，<0 表示按晚了
        // 只在「真的判过同步」的样本上校准（未同步时 delta 可能是相对陈旧 P 的巨大值，会把偏移带飞）
        if (!bf.ok && typeof bf.delta === 'number' && Math.abs(bf.delta) < 30) A.bfOffset += Math.max(-2, Math.min(2, bf.delta));
        A.bfOffset = Math.max(3, Math.min(16, A.bfOffset));
      }
      if (A.bf && frame - A.lastJ > 32) { A.lastJ = frame; press('KeyJ'); A.pendingV = frame + A.bfOffset; }
      if (A.bf && A.pendingV && frame >= A.pendingV) { A.pendingV = 0; press('KeyV'); }
    } catch (e) {}
    requestAnimationFrame(loop);
  })();
  return true;
})()`;

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000);
  await b.pressKey('Space');
  await sleep(3000);
  await ev(AUTO);
  R.auto = await ev('(() => ({ ok: !!window.__AUTO, offset: window.__AUTO && window.__AUTO.bfOffset }))()');

  const t0 = Date.now();
  let lastClash = false, lastMaho = false, lastPhase = 0, i = 0;
  while (Date.now() - t0 < maxSec * 1000) {
    i++;
    const st = await snap();
    if (!st) { R.errors.push('快照为 null'); break; }
    if (st.dead) break;
    const m = await ev('(() => { try { return __SS.mech(); } catch (e) { return null; } })()');
    R.mech = m;
    const mahoAlive = !!(m && m.mahoraga && m.mahoraga.alive);
    const T = ((Date.now() - t0) / 1000).toFixed(1);

    if (mahoAlive && !lastMaho) { lastMaho = true; R.milestones.push({ t: T, ev: 'mahoraga-summoned', hp: st.sHp }); await shot('m-summon'); }
    if (st.clash && !lastClash) { lastClash = true; R.milestones.push({ t: T, ev: 'clash-start' }); await shot('m-clash'); }
    if (!st.clash && lastClash) { lastClash = false; R.milestones.push({ t: T, ev: 'clash-end', duel: m && m.duel ? { sync: m.duel.sync, miss: m.duel.miss, winner: m.duel.winner } : null }); await shot('m-clash-end'); }
    if (m && m.blackFlash && m.blackFlash.bf > 0 && !R.milestones.some(x => x.ev === 'first-blackflash')) {
      R.milestones.push({ t: T, ev: 'first-blackflash', mul: m.blackFlash.mul }); await shot('m-blackflash');
    }

    // 玩家行为：靠近 → 连击；魔虚罗在空中时优先术式；周期性疾跑
    if (st.clash) { await sleep(120); continue; }
    if (mahoAlive) {
      await b.pressKey('KeyQ', 30);            // 锁定（对空）
      if (i % 6 === 0) await b.pressKey('KeyI', 50);   // 赫
      if (i % 9 === 0) await b.pressKey('KeyO', 900);  // 茈
      if (i % 3 === 0) await b.pressKey('KeyU', 50);   // 苍
    }
    await b.keyDown('KeyW');
    if (i % 5 === 0) await b.keyDown('ShiftLeft');
    await sleep(180);
    if (i % 5 === 0) await b.keyUp('ShiftLeft');
    await b.keyUp('KeyW');
    if (i % 4 !== 0) await b.pressKey('KeyK', 45);
    if (st.domG >= 100 && i % 43 === 0) await b.pressKey('KeyG', 40);
    if (st.gHp < st.gMax * 0.45 && st.ce > 50) await b.pressKey('KeyH', 40);
    await sleep(90);
    if (i % 25 === 0) await shot('t' + String(i).padStart(3, '0'));
  }

  R.elapsedSec = +((Date.now() - t0) / 1000).toFixed(1);
  R.autoStats = await ev('(() => ({ ...window.__AUTO, pendingV: 0, reset: 0 }))()');
  await sleep(6000);
  R.result = await ev(`(() => { const r = document.getElementById('result');
    return { visible: r && !r.classList.contains('hidden'), title: (document.getElementById('result-title')||{}).textContent,
             stats: (document.getElementById('result-stats')||{}).textContent,
             sub: (document.getElementById('result-sub')||{}).textContent }; })()`);
  await shot('m-result');
  R.final = await snap();
  R.errors.push(...b.errors.slice(0, 12).map(e => e.text || String(e)));
} catch (e) { R.fatal = String(e && e.stack || e); }
finally { await b.close(); }
console.log(JSON.stringify(R, null, 1));
