/**
 * play-mech.mjs —— Lead 的「站在玩家视角把四个新机制玩一遍」工具
 * ----------------------------------------------------------------------------
 * 与 fullplay.mjs 的分工：
 *   fullplay  —— 把一整局打完，看长局问题（卡死 / 结算 / 重开残留）
 *   play-mech —— 逐个机制按**玩家会做的操作**去用，并在每一步截图 + 记录数字，
 *                用来回答「这个机制好不好玩、看不看得懂、能不能做到」。
 *
 * 四个机制段：
 *   1 疾跑   —— 按住 Shift 与不按的位移曲线、FOV
 *   2 黑闪   —— 连点 V（必须 0 次）vs 卡命中帧按 V（至少 1 次）
 *   3 领域   —— 乱按必输 / 对齐必赢（读 __SS.mech().duel）
 *   4 魔虚罗 —— 半血召唤 → 悬空 → 技能 → 俯冲弱点窗口 → 击破
 *
 * 用法：node _tools/play-mech.mjs [--file dist/新宿决战.html] [--out shots/mech] [--port 9460]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const outDir = arg('out', 'shots/mech');
const port = parseInt(arg('port', '9460'), 10);
if (!existsSync(file)) { console.error('找不到 ' + file); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const b = new Browser({ port, width: 1600, height: 900 });
const R = { file, sections: {}, errors: [], shots: [] };
const shot = async (name) => { const p = outDir + '/' + name + '.png'; await b.screenshot(p); R.shots.push(p); return p; };
const ev = (expr) => b.evaluate(expr);
const snap = () => ev(`(() => { const s = window.__SS && window.__SS.snap; if (!s) return null;
  return { gHp: Math.round(s.gojo.hp), sHp: Math.round(s.sukuna.hp), sMax: s.sukuna.hpMax, mode: s.mode,
           ce: Math.round(s.gojo.ce), phase: s.phase, clash: !!s.clashActive, dead: s.gojo.dead || s.sukuna.dead }; })()`);
const mech = () => ev('(() => (window.__SS && window.__SS.mech) ? window.__SS.mech() : null)()');
const pos = () => ev('(() => { const g = window.__SS && window.__SS.gojo; return g ? [+g.getPos().x.toFixed(2), +g.getPos().z.toFixed(2)] : null; })()');
const fov = () => ev('(() => (window.__SS.cam && window.__SS.cam.fov) || 0)()');

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000);
  await b.pressKey('Space');
  await sleep(3000);
  R.boot = await ev("(() => ({ state: __SS.state, mech: Object.keys(__SS.mech()) }))()");

  /* ---------- 1 疾跑 ---------- */
  {
    const sec = { walk: [], sprint: [] };
    const run = async (dash, label) => {
      await b.keyDown('KeyW');
      if (dash) await b.keyDown('ShiftLeft');
      const t0 = Date.now(); const samples = [];
      while (Date.now() - t0 < 1400) {
        const p = await pos();
        samples.push({ t: +((Date.now() - t0) / 1000).toFixed(2), x: p && p[0], z: p && p[1], fov: +(await fov()).toFixed(1) });
        await sleep(100);
      }
      await b.keyUp('KeyW');
      if (dash) await b.keyUp('ShiftLeft');
      await sleep(600);
      sec[label] = samples;
    };
    await run(false, 'walk');
    await run(true, 'sprint');
    const dist = (s) => { if (s.length < 3) return 0; const a = s[0], z = s[s.length - 1]; return +Math.hypot(z.x - a.x, z.z - a.z).toFixed(2); };
    const speedAt = (s, i) => { if (i <= 0 || i >= s.length) return 0; const a = s[i-1], c = s[i]; return +(Math.hypot(c.x-a.x, c.z-a.z) / Math.max(0.001, c.t-a.t)).toFixed(2); };
    R.sections.sprint = {
      walkDist: dist(sec.walk), sprintDist: dist(sec.sprint),
      walkSpeeds: sec.walk.map((_, i) => speedAt(sec.walk, i)),
      sprintSpeeds: sec.sprint.map((_, i) => speedAt(sec.sprint, i)),
      fovWalk: sec.walk.map(s => s.fov), fovSprint: sec.sprint.map(s => s.fov),
      dbg: (await mech()).sprint || null
    };
    await shot('1-sprint');
  }

  /* ---------- 2 黑闪 ---------- */
  {
    const bf = () => ev('(() => { const s = __SS.stats; return s.blackFlash; })()');
    const before = await bf();
    // 2a 连点 V + J：必须 0 次
    for (let i = 0; i < 40; i++) { await ev('__INJECT.press("KeyV")'); await sleep(20); await ev('__INJECT.release("KeyV")'); await sleep(20); }
    for (let i = 0; i < 12; i++) {
      await b.pressKey('KeyJ', 40);
      for (let k = 0; k < 4; k++) { await ev('__INJECT.press("KeyV")'); await sleep(25); await ev('__INJECT.release("KeyV")'); }
      await sleep(80);
    }
    const mash = (await bf()) - before;
    // 2b 卡命中帧：J 后固定延迟按 V，扫一遍延迟找命中帧
    let best = 0, bestDelay = -1;
    for (let d = 60; d <= 260; d += 20) {
      const b0 = await bf();
      for (let i = 0; i < 8; i++) {
        await b.pressKey('KeyJ', 40);
        await sleep(Math.max(0, d - 40) + 60);
        await ev('__INJECT.press("KeyV")'); await sleep(16); await ev('__INJECT.release("KeyV")');
        await sleep(500);
      }
      const n = (await bf()) - b0;
      if (n > best) { best = n; bestDelay = d; }
      if (n > 0) break;
    }
    R.sections.blackflash = { mashCount: mash, preciseCount: best, delay: bestDelay, dbg: (await mech()).blackFlash || null };
    await shot('2-blackflash');
  }

  /* ---------- 3 领域对决 ---------- */
  {
    const duelDbg = async () => (await mech()).duel || null;
    await ev('__SS.combat.forceSkill("void","gojo"); __SS.combat.forceSkill("shrine","sukuna");');
    await sleep(2500);
    const st0 = await snap();
    const duel0 = await duelDbg();
    // 3a 先乱按（每 40ms 一次 J）看会不会崩
    let mashed = null;
    if (duel0 && duel0.active) {
      for (let i = 0; i < 60; i++) { await b.pressKey('KeyJ', 25); await sleep(35); }
      await sleep(1200);
      mashed = { duel: await duelDbg(), snap: await snap() };
    }
    await shot('3-duel-mash');
    R.sections.duel = { entered: !!(duel0 && duel0.active), before: duel0, afterMash: mashed, state: st0 };
  }

  /* ---------- 4 魔虚罗 ---------- */
  {
    // 先把玩家血量拉满，避免测试中途被打死；再把宿傩打到 50% 触发二阶段
    await ev('__SS.combat.applyDamage("gojo", 0); ');
    const s0 = await snap();
    if (s0 && !s0.dead) {
      await ev(`__SS.combat.applyDamage("sukuna", ${Math.max(0, Math.round(s0.sHp * 0.52))})`);
      await sleep(1200);
      await shot('4a-summon');
      await sleep(3200);
      const m1 = await mech();
      await shot('4b-mahoraga');
      // 站到魔虚罗正下方打近战，看它掉不掉血
      const hp0 = (m1.mahoraga || {}).hp;
      for (let i = 0; i < 14; i++) { await b.pressKey('KeyJ', 40); await sleep(140); }
      await sleep(600);
      const near = { hpBefore: hp0, mAfter: (await mech()).mahoraga || null };
      // 锁定 + 茈 打空中
      await b.pressKey('KeyQ');
      await sleep(200);
      await b.pressKey('KeyO', 1200);
      await sleep(2500);
      const ranged = { m: (await mech()).mahoraga || null };
      await shot('4c-airshot');
      await sleep(6000);
      await shot('4d-attacks');
      R.sections.mahoraga = { summon: m1.mahoraga || null, melee: near, ranged, final: (await mech()).mahoraga || null };
    } else {
      R.sections.mahoraga = { skipped: '玩家已倒下', state: s0 };
    }
  }

  R.snapFinal = await snap();
  R.errors.push(...b.errors.slice(0, 12).map(e => e.text || String(e)));
} catch (e) { R.fatal = String(e && e.stack || e); }
finally { await b.close(); }
console.log(JSON.stringify(R, null, 2));
