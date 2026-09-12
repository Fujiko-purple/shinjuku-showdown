/**
 * verify-sprint.mjs —— 契约 §7「疾跑」独立验证（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 验收条款 → 可执行断言（全部只看 __SS / __SS.mech().sprint / DOM / 位移数值）：
 *   §7-1 按住 Shift 后 0.35s 内由 4.8 升到 10.5（ease-out）；松开 0.25s 回落（惯性，不瞬间归零）
 *   §7-2 相位能区分 walk/run/sprint（mech.sprint.phase）
 *   §7-3 FOV 60 -> 68（变化 >= 6 度）
 *   §7-4 脚下扬尘 > 0（mech.sprint.dust）
 *   §7-5 触屏摇杆 |v| > 0.92 即疾跑，__TOUCH 补 run 标志
 * 反例：连点 Shift / 每帧按下抬起 / 交替乱按 / 一动不动 / 反向折返
 * 边界：0.35s 前后各一帧、松手后 0.25s、摇杆 0.90 vs 0.95
 * 用法：node _tools/verify-sprint.mjs [--file tmp/sprint/dist.html] [--port 9512] [--mobile]
 */
import { Rig, arg, flag, sleep, stats, DEFAULT_FILE } from './verify-lib.mjs';

const file = arg('file', DEFAULT_FILE);
const port = parseInt(arg('port', '9512'), 10);
const mobile = flag('mobile');
const rig = new Rig({ port, file, name: 'sprint' + (mobile ? '-mobile' : ''), mobile });

/** 页面侧小代码片段 */
const CODE_SP = [
  'window.__SP = function () { try { var m = window.__V.mech(); return m.sprint || {}; } catch (e) { return { err: String(e) }; } }; true',
].join('\n');
const WATCH = '({now: performance.now(), f: S.combat.frame, x: S.gojo.root.position.x, z: S.gojo.root.position.z,' +
  ' fov: S.activeCamera.fov, camFov: S.cam.fov, sp: window.__SP().speed, tgt: window.__SP().target,' +
  ' ph: window.__SP().phase, dust: window.__SP().dust, ap: window.__SP().accelPhase, run: (window.__TOUCH||{}).run})';

/** 从采样里算每帧水平速度和位移 */
function motion(samples) {
  const out = { speed: [], dist: 0, t0: null, t1: null };
  if (!samples.length) return out;
  out.t0 = samples[0].now; out.t1 = samples[samples.length - 1].now;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const dt = (b.now - a.now) / 1000;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    out.dist += d;
    out.speed.push({ ms: b.now - out.t0, v: dt > 0 ? d / dt : 0 });
  }
  return out;
}
/** 时间窗内的平均速度（ms 为相对起始的毫秒） */
function avgSpeed(m, a, b) {
  const seg = m.speed.filter(s => s.ms >= a && s.ms <= b).map(s => s.v);
  return seg.length ? stats(seg).avg : null;
}

try {
  await rig.start();
  console.log('产物 ' + file + '  启动 ' + JSON.stringify(rig.bootInfo));
  rig.check('产物可启动并进入 fight', rig.bootInfo.state === 'fight' || rig.bootInfo.state === 'clash', 'state=' + rig.bootInfo.state);
  rig.check('无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
  await rig.ev(CODE_SP);
  const sp0 = await rig.ev('window.__SP()');
  console.log('mech.sprint 初始 = ' + JSON.stringify(sp0));
  rig.check('契约 §1.3 MECH_DEBUG.sprint 已注册', !!(sp0 && Object.keys(sp0).length), JSON.stringify(sp0));
  const keys = sp0 ? Object.keys(sp0) : [];
  const need = ['speed', 'target', 'phase', 'fov', 'accelPhase', 'dust'];
  const missing = need.filter(k => !keys.includes(k));
  rig.check('sprint 自报字段齐全（契约 §1.3）', missing.length === 0, '缺 ' + JSON.stringify(missing));

  const idle = await rig.sample(WATCH, 700);
  const idleFov = idle.samples.length ? idle.samples[idle.samples.length - 1].fov : null;
  console.log('静止基准 fov=' + idleFov);

  if (!mobile) {
    /* ---------- A. 起步加速曲线：Shift+W 按住 1s ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    const t0 = await rig.tick();
    await rig.hold('ShiftLeft'); await rig.hold('KeyW');
    await sleep(1100);
    const A = await rig.take();
    await rig.release('KeyW'); await rig.release('ShiftLeft');
    const mA = motion(A.samples);
    const s035 = avgSpeed(mA, 320, 400);
    const s100 = avgSpeed(mA, 850, 1050);
    const s010 = avgSpeed(mA, 80, 160);
    console.log('A 起步: 0.1s v=' + s010 + ' 0.35s v=' + s035 + ' 0.85~1.05s v=' + s100 + ' 1s 位移=' + mA.dist.toFixed(2) + 'm 帧数=' + A.samples.length);
    console.log('   fov 采样 min=' + Math.min(...A.samples.map(s => s.fov)).toFixed(2) + ' max=' + Math.max(...A.samples.map(s => s.fov)).toFixed(2) +
      ' phases=' + JSON.stringify([...new Set(A.samples.map(s => s.ph))]) + ' dust max=' + Math.max(...A.samples.map(s => s.dust === null ? 0 : s.dust)));
    rig.check('§7 0.35s 内升到 10.5 量级（实测 0.35~0.4s 均速 >= 9.5）', s035 !== null && s035 >= 9.5, 'v(0.35s)=' + s035);
    rig.check('§7 稳态速度落在 10.5±1', s100 !== null && s100 >= 9.5 && s100 <= 11.5, 'v(稳态)=' + s100);
    rig.check('§7 起步有加速过程（0.1s 速度明显低于稳态）', s010 !== null && s100 !== null && s010 < s100 - 1.0, 'v(0.1s)=' + s010 + ' vs 稳态 ' + s100);
    rig.check('§7 1s 位移明显大于旧版 4.8m/s', mA.dist >= 6.5, '1s 位移=' + mA.dist.toFixed(2) + 'm');
    const fovDelta = Math.max(...A.samples.map(s => s.fov)) - idleFov;
    rig.check('§7 FOV 变化 >= 6 度', fovDelta >= 6, 'idle=' + idleFov + ' -> max=' + Math.max(...A.samples.map(s => s.fov)).toFixed(2) + ' Δ=' + fovDelta.toFixed(2));
    rig.check('§7 相位读到 sprint', A.samples.some(s => s.ph === 'sprint'), 'phases=' + JSON.stringify([...new Set(A.samples.map(s => s.ph))]));
    rig.check('§7 扬尘 > 0', A.samples.some(s => typeof s.dust === 'number' && s.dust > 0), 'dust max=' + Math.max(...A.samples.map(s => s.dust === null ? -1 : s.dust)));
    rig.check('A 段无 NaN/异常样本', A.samples.every(s => isFinite(s.x) && isFinite(s.z) && isFinite(s.fov)), 'errs=' + JSON.stringify(A.errs));

    /* ---------- B. 松手惯性（只松 Shift，W 继续按） ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    await rig.hold('KeyW');
    await sleep(1200);
    await rig.hold('ShiftLeft');
    await sleep(900);
    // 松手：记下时刻，再采样 500ms
    const tRel = await rig.tick();
    await rig.release('ShiftLeft');
    await sleep(600);
    const B = await rig.take();
    await rig.release('KeyW');
    const mB = motion(B.samples);
    const relAt = B.samples.find(s => s.t >= tRel);
    const vRel = relAt ? relAt : null;
    // 相对松手时刻的窗口
    const rel = relAt ? relAt.now : (B.samples[0] && B.samples[0].now);
    const win = (a, b) => { const seg = mB.speed.filter(s => s.ms + mB.t0 - rel >= a && s.ms + mB.t0 - rel <= b).map(s => s.v); return seg.length ? stats(seg).avg : null; };
    const vJust = win(-16, 40), v025 = win(200, 320), v050 = win(420, 600);
    console.log('B 松手: +0ms v=' + vJust + ' +0.25s v=' + v025 + ' +0.5s v=' + v050 + ' (松手时 mech.speed=' + (vRel && vRel.sp) + ')');
    rig.check('§7 松手不瞬间归零（+0.05s 仍 >= 6）', vJust !== null && vJust >= 6, 'v(+0)=' + vJust);
    rig.check('§7 松手 0.25s 内回落到走路量级（<= 6.5）', v025 !== null && v025 <= 6.5, 'v(+0.25s)=' + v025);

    /* ---------- C. 只按 W 走路对照（不该被改成疾跑） ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    await rig.hold('KeyW');
    await sleep(1600);
    const C = await rig.take();
    await rig.release('KeyW');
    const mC = motion(C.samples);
    const vWalk = avgSpeed(mC, 1000, 1600);
    console.log('C 走路: v(1.0~1.6s)=' + vWalk + ' phases=' + JSON.stringify([...new Set(C.samples.map(s => s.ph))]));
    rig.check('走路速度仍是 4.8 量级（0.1 不误触发疾跑）', vWalk !== null && vWalk > 3.6 && vWalk < 6.0, 'v(走路)=' + vWalk);

    /* ---------- D. 反例：每帧按下+抬起 Shift（120 帧） ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    const td = await rig.tick();
    await rig.hold('KeyW');
    await rig.mash('ShiftLeft', td + 5, td + 125);
    await sleep(2400);
    const D = await rig.take();
    await rig.release('KeyW');
    const mD = motion(D.samples);
    const vD = avgSpeed(mD, 200, 2000);
    console.log('D 每帧连点 Shift: v=' + vD + ' 位移=' + mD.dist.toFixed(2) + 'm phases=' + JSON.stringify([...new Set(D.samples.map(s => s.ph))]));
    rig.check('D 乱按不产生 NaN/异常', D.samples.every(s => isFinite(s.x) && isFinite(s.fov)) && D.errs.length === 0, 'errs=' + JSON.stringify(D.errs));
    rig.check('D 速度不超上限（<= 12）', mD.speed.length ? Math.max(...mD.speed.map(s => s.v)) <= 12 : true, 'max v=' + (mD.speed.length ? Math.max(...mD.speed.map(s => s.v)).toFixed(2) : '-'));

    /* ---------- E. 反例：人类式连点 Shift（每 6 帧一个循环） ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    const te = await rig.tick();
    await rig.hold('KeyW');
    for (let i = 0; i < 20; i++) { await rig.sched(te + 5 + i * 6, 'ShiftLeft', 'down'); await rig.sched(te + 8 + i * 6, 'ShiftLeft', 'up'); }
    await sleep(2200);
    const E = await rig.take();
    await rig.release('KeyW');
    const mE = motion(E.samples);
    console.log('E 每 6 帧 toggle Shift: v max=' + (mE.speed.length ? Math.max(...mE.speed.map(s => s.v)).toFixed(2) : '-') + ' phases=' + JSON.stringify([...new Set(E.samples.map(s => s.ph))]));
    const eS = mE.speed.length ? stats(mE.speed.map(s => s.v)) : null;
    rig.check('E 高频 toggle 不超上限（p95 <= 12）', !eS || eS.p95 <= 12, 'p95=' + (eS && eS.p95) + ' max=' + (eS && eS.max));
    rig.check('E 无 NaN/异常', E.samples.every(s => isFinite(s.x) && isFinite(s.z)) && E.errs.length === 0, 'errs=' + JSON.stringify(E.errs));

    /* ---------- F. 反例：一动不动挂机 3s ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    await sleep(3000);
    const F = await rig.take();
    const mF = motion(F.samples);
    const lastFov = F.samples.length ? F.samples[F.samples.length - 1].fov : null;
    console.log('F 挂机: 位移=' + mF.dist.toFixed(3) + 'm 末 fov=' + lastFov + ' 末 phase=' + (F.samples.length ? F.samples[F.samples.length - 1].ph : '-'));
    rig.check('F 挂机不位移', mF.dist < 0.5, '位移=' + mF.dist.toFixed(3) + 'm');
    rig.check('F 挂机后不是 sprint 相位', !F.samples.slice(-30).some(s => s.ph === 'sprint'), '末 30 帧 phases=' + JSON.stringify([...new Set(F.samples.slice(-30).map(s => s.ph))]));
    rig.check('F 挂机后 FOV 回落（<= idle+2）', lastFov !== null && lastFov <= idleFov + 2, 'fov=' + lastFov + ' idle=' + idleFov);

    /* ---------- G. 反例：Shift+W 与 Shift+S 折返 ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    await rig.hold('ShiftLeft'); await rig.hold('KeyW');
    await sleep(700);
    await rig.release('KeyW'); await rig.hold('KeyS');
    await sleep(700);
    await rig.release('KeyS'); await rig.release('ShiftLeft');
    await sleep(300);
    const G = await rig.take();
    const mG = motion(G.samples);
    console.log('G 折返: 总位移=' + mG.dist.toFixed(2) + 'm max v=' + (mG.speed.length ? Math.max(...mG.speed.map(s => s.v)).toFixed(2) : '-'));
    const gS = mG.speed.length ? stats(mG.speed.map(s => s.v)) : null;
    rig.check('G 折返无异常/不超上限（p95 <= 12）', G.samples.every(s => isFinite(s.x) && isFinite(s.z)) && (!gS || gS.p95 <= 12) && G.errs.length === 0, 'p95=' + (gS && gS.p95) + ' max=' + (gS && gS.max) + ' errs=' + JSON.stringify(G.errs));

    /* ---------- H. 边界：0.35s 前后各取一帧 ---------- */
    await rig.reset(true);
    await rig.watch(WATCH);
    await rig.hold('ShiftLeft'); await rig.hold('KeyW');
    await sleep(1200);
    const H = await rig.take();
    await rig.release('KeyW'); await rig.release('ShiftLeft');
    const mH = motion(H.samples);
    const sBefore = avgSpeed(mH, 280, 340);
    const sAfter = avgSpeed(mH, 360, 420);
    console.log('H 边界: 0.28~0.34s v=' + sBefore + ' 0.36~0.42s v=' + sAfter);
    rig.check('H 0.35s 前后速度单调抬升（后 >= 前 - 0.5）', sBefore !== null && sAfter !== null && sAfter >= sBefore - 0.5, '前=' + sBefore + ' 后=' + sAfter);
    rig.check('H 0.35s 已接近满速（>= 9.0）', sAfter !== null && sAfter >= 9.0, 'v(0.36~0.42s)=' + sAfter);
    await rig.shot('01-sprint');
  } else {
    /* ================= 手机端 ================= */
    const setStick = async (x, z) => rig.ev('(() => { window.__TOUCH.on = true; window.__TOUCH.mx = ' + x + '; window.__TOUCH.mz = ' + z + '; return true; })()');
    await rig.ev('(() => { if (!window.__TOUCH) window.__TOUCH = { on: true, mx: 0, mz: 0, camX: 0, camY: 0 }; window.__TOUCH.on = true; return typeof window.__TOUCH.run; })()');
    await rig.reset(true);
    await rig.watch(WATCH);
    await setStick(0, -1);
    await sleep(1400);
    const M = await rig.take();
    const mM = motion(M.samples);
    const vM = avgSpeed(mM, 900, 1400);
    const last = M.samples.length ? M.samples[M.samples.length - 1] : null;
    console.log('手机 摇杆到底(0,-1): v(0.9~1.4s)=' + vM + ' phase=' + (last && last.ph) + ' run标志=' + (last && last.run));
    rig.check('§7 手机摇杆推到底触发疾跑（v >= 9.5）', vM !== null && vM >= 9.5, 'v=' + vM);
    rig.check('§7 手机 phase=sprint', M.samples.some(s => s.ph === 'sprint'), 'phases=' + JSON.stringify([...new Set(M.samples.map(s => s.ph))]));
    rig.check('§7 __TOUCH.run 标志被补上', M.samples.some(s => s.run === true || s.run === 1), 'run 采样值=' + JSON.stringify([...new Set(M.samples.map(s => s.run))]));
    await rig.shot('02-mobile-sprint');
    /* 边界：|摇杆| = 0.90 不该疾跑 */
    await rig.reset(true);
    await rig.watch(WATCH);
    await setStick(0, -0.90);
    await sleep(1400);
    const M2 = await rig.take();
    const s2 = M2.samples.some(s => s.ph === 'sprint');
    const m2 = motion(M2.samples);
    const v2 = avgSpeed(m2, 900, 1400);
    console.log('手机 摇杆 0.90: v=' + v2 + ' sprint=' + s2 + ' phases=' + JSON.stringify([...new Set(M2.samples.map(s => s.ph))]));
    rig.check('§7 边界 0.90（未过 0.92）不疾跑', !s2, 'phase 集合=' + JSON.stringify([...new Set(M2.samples.map(s => s.ph))]));
    /* 边界：|摇杆| = 0.95 该疾跑 */
    await rig.reset(true);
    await rig.watch(WATCH);
    await setStick(0, -0.95);
    await sleep(1400);
    const M3 = await rig.take();
    const m3 = motion(M3.samples);
    const v3 = avgSpeed(m3, 900, 1400);
    console.log('手机 摇杆 0.95: v=' + v3 + ' sprint=' + M3.samples.some(s => s.ph === 'sprint'));
    rig.check('§7 边界 0.95（过了 0.92）触发疾跑', M3.samples.some(s => s.ph === 'sprint'), 'v=' + v3);
    /* 反例：摇杆回中 + 挂机 */
    await rig.reset(true);
    await rig.watch(WATCH);
    await setStick(0, 0);
    await sleep(1500);
    const M4 = await rig.take();
    const m4 = motion(M4.samples);
    rig.check('手机 摇杆回中不位移', m4.dist < 0.5, '位移=' + m4.dist.toFixed(3) + 'm');
  }
  rig.check('全流程无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
} catch (e) {
  console.log('FATAL ' + (e && e.stack || e));
  rig.check('脚本未抛错', false, String((e && e.message) || e));
} finally {
  await rig.finish();
}