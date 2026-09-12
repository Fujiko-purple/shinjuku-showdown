/**
 * probe-sprint.mjs —— 疾跑手感验收探针（task-5 · 契约 §7）
 * 用法：node _tools/probe-sprint.mjs [--file tmp/sprint/dist.html] [--port 9504]
 *
 * 只读 __SS / __SS.mech.sprint / __CAMUI / __TOUCH / __MOBILE，不读实现代码。
 * 覆盖契约 §7 的每一条验收：
 *   A 位移曲线  走 1.2s vs 疾跑 1.2s（0.25/0.5/0.75/1.0/1.2s 累计位移 + 稳态速度）
 *   B 起步 0.35s  从 accelPhase 变 accel 那一刻起，每 0.05s 的曲线速度 vs 实测速度
 *   C 惯性 0.25s  只松 Shift：速度回落曲线 + 额外滑行距离（不瞬间归零）
 *   D 镜头       FOV 变化（≥6°）、后拉倍数、径向模糊、过弯压镜
 *   E 分档       phase/anim 序列出现 walk → run → sprint（并读一次 snap.gojo.phase）
 *   F 扬尘       fx.poolStats().debris / groundRing 峰值
 *   G 音效       run_wind 在 SFX 表里 + 风噪床音 level 随速度爬升 + 脚步 rate 变调
 *   H 转向惯性   同向 90° 转向：走 vs 跑的转向时间与弧线半径
 *   I 触屏       844x390：摇杆推到底 → __TOUCH.run=true / phase=sprint / 截图
 *   J 回归       移动方向（远离相机）/ 摇杆模拟量 / 出招不滑行 / 走路速度量级
 * 截图：shots/sprint/*.png
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync as exists } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'tmp/sprint/dist.html'));
if (!exists(file)) { console.error('找不到 ' + file); process.exit(1); }
const URL = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const PORT = parseInt(arg('port', '9504'), 10);

const b = new Browser({ port: PORT, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass });
  log('   ' + (pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '   ' + detail : ''));
}
const f2 = (v) => (v === undefined || v === null || !isFinite(v) ? '-' : v.toFixed(2));
const f3 = (v) => (v === undefined || v === null || !isFinite(v) ? '-' : v.toFixed(3));

/* ---------------- 采样器（页内 rAF） ---------------- */
async function installSampler() {
  await b.evaluate('(() => {' +
    ' window.__SP = [];' +
    ' const tick = () => {' +
    '  const S = window.__SS;' +
    '  if (S && S.gojo) {' +
    '   const g = S.gojo; const MA = (typeof S.mech === "function") ? S.mech() : S.mech; const M = (MA && MA.sprint) || {}; const C = window.__CAMUI || {};' +
    '   const P = (S.fx && S.fx.poolStats) ? S.fx.poolStats() : {};' +
    '   const A = S.audio;' +
    '   window.__SP.push({ t: performance.now(), x: g.root.position.x, z: g.root.position.z,' +
    '     yaw: g.getYaw(), anim: g.state.anim, phase: g.state.phase,' +
    '     speed: M.speed, fov: C.fov, sFov: C.sprintFov, sDist: C.sprintDist, sRoll: C.sprintRoll, sAmt: C.sprintAmt,' +
    '     dust: M.dust, spdNow: M.spdNow, wind: M.wind, blur: M.blur, ap: M.accelPhase, steps: M.steps,' +
    '     windLvl: (A && A.runWindState) ? A.runWindState.level : -1,' +
    '     deb: P.debris ? P.debris.active : -1, ring: P.groundRing ? P.groundRing.active : -1,' +
    '     coreX: g.bones.core.rotation.x, thighX: g.bones.thighL.rotation.x, foreX: g.bones.foreArmL.rotation.x });' +
    '  }' +
    '  requestAnimationFrame(tick);' +
    ' };' +
    ' requestAnimationFrame(tick);' +
    ' window.__MARK = () => { window.__SP.length = 0; };' +
    ' return true; })()');
}
const mark = () => b.evaluate('window.__MARK(); true');
const rows = () => b.evaluate('window.__SP.slice()');
/** 角色特写截图：算角色在屏幕上的位置再裁一块，不然 16:9 宽屏下角色只有几十像素 */
async function shotClip(name, cw, ch) {
  const w = cw || 380, h = ch || 320;
  const rc = await b.evaluate("(() => { const S = window.__SS; const g = S.gojo; const v = g.root.position.clone(); v.y += 1.05; v.project(S.activeCamera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, w: innerWidth, h: innerHeight }; })()");
  const x = Math.max(0, Math.min(rc.w - w, Math.round(rc.x - w / 2)));
  const y = Math.max(0, Math.min(rc.h - h, Math.round(rc.y - h / 2)));
  await b.screenshot(name, { clip: { x, y, width: w, height: h } });
}

/* ---------------- 时序分析（Node 侧） ---------------- */
function prep(list) {
  if (!list || !list.length) return [];
  const t0 = list[0].t;
  const out = list.map((r) => Object.assign({}, r, { rt: (r.t - t0) / 1000, acc: 0, v: 0, vs: 0 }));
  for (let i = 1; i < out.length; i++) {
    const d = Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
    out[i].acc = out[i - 1].acc + d;
    const dt = out[i].rt - out[i - 1].rt;
    out[i].v = dt > 1e-4 ? d / dt : out[i - 1].v;
  }
  // 50ms 窗的速度（去抖）：直接逐帧差分在 300fps 下抖动太大
  for (let i = 0; i < out.length; i++) {
    let j = i;
    while (j > 0 && out[i].rt - out[j].rt < 0.05) j--;
    const dt = out[i].rt - out[j].rt;
    out[i].vs = dt > 1e-4 ? (out[i].acc - out[j].acc) / dt : (i ? out[i - 1].vs : 0);
  }
  return out;
}
/** 某时刻的样本（就近） */
function at(list, t) {
  if (!list.length) return {};
  let best = list[0], bd = 1e9;
  for (const r of list) { const d = Math.abs(r.rt - t); if (d < bd) { bd = d; best = r; } }
  return best;
}
/** 区间平均速度 */
function avgV(list, a, b) {
  const s = list.filter((r) => r.rt >= a && r.rt <= b);
  return s.length ? s.reduce((p, c) => p + c.v, 0) / s.length : NaN;
}
/** 采样序列里某个字段的取值变化（去重连续相同值） */
function transitions(list, key) {
  const out = [];
  for (const r of list) if (!out.length || out[out.length - 1].v !== r[key]) out.push({ v: r[key], t: r.rt });
  return out;
}
function peak(list, key) {
  let m = -1e9;
  for (const r of list) if (typeof r[key] === 'number' && r[key] > m) m = r[key];
  return m;
}

let allRows = [];

/* ---------------- 启动 ---------------- */
async function bootToFight(touch, qs) {
  await b.send('Page.navigate', { url: URL + (touch ? '?touch=1' : qs ? '?' + qs : '') });
  await sleep(13000);
  await b.evaluate("(() => { const e = document.querySelector('[data-act=\"rotate-skip\"]'); if (e) e.click(); return true; })()");
  await sleep(700);
  await b.evaluate("(() => { const el = document.getElementById('btn-skip-cine'); if (el) el.click(); return true; })()");
  for (let i = 0; i < 80; i++) {
    await sleep(400);
    const st = await b.evaluate('window.__SS && window.__SS.state');
    if (st === 'fight') break;
  }
  await b.evaluate('(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()');
  await sleep(900);
}

/**
 * 把两名角色放回出生点 + 关掉 AI。
 * 前面几组测试跑完常常贴在墙上（实测出现"按住 W 800ms 只走 1.5m"），位移类数字会失真 ——
 * 每组测量前都复位，探针才是可复现的。
 */
async function resetArena() {
  await b.evaluate("(() => { const c = window.__SS.combat; if (!c) return false; c.reset(); if (c.setAiEnabled) c.setAiEnabled(false); return true; })()");
  await sleep(800);
}

async function unlockAudio() {
  return b.evaluate("(() => { document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return { ready: !!(window.__SS.audio && window.__SS.audio._debug && window.__SS.audio._debug.ready) }; })()");
}

/** 找一个能直线跑 > 13m 的方向：四个方向各试 0.7s，取位移最大的那个 */
async function pickOpenDir() {
  const cand = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  let best = { key: 'KeyW', d: -1 };
  for (const k of cand) {
    await mark();
    await b.keyDown('ShiftLeft');
    await b.keyDown(k);
    await sleep(700);
    await b.keyUp(k);
    await b.keyUp('ShiftLeft');
    await sleep(500);
    const list = prep(await rows());
    const d = list.length ? list[list.length - 1].acc : 0;
    log('   方向 ' + k + ' 0.7s 位移 ' + f2(d) + 'm');
    if (d > best.d) best = { key: k, d };
  }
  return best.key;
}

try {
  await b.launch();
  await b.newPage();
  await bootToFight(false);
  await installSampler();
  // __SS.mech 已从"getter 返回对象"改成"方法"（Lead 广播）——两种形态都兼容
  await b.evaluate("(() => { window.__MECH = () => { const S = window.__SS; const m = typeof S.mech === 'function' ? S.mech() : S.mech; return (m && m.sprint) || {}; }; return true; })()");
  const au = await unlockAudio();
  log('音频解锁: ' + JSON.stringify(au));

  await resetArena();
  const FWD = await pickOpenDir();
  log('选用前进方向: ' + FWD);

  /* ================= A/B/E：走路 vs 疾跑 ================= */
  log('');
  log('===== A/B/E 走路 vs 疾跑（同一方向 ' + FWD + '）=====');
  await resetArena();
  await mark();
  await b.keyDown(FWD);
  await sleep(1200);
  const walkSnap = await b.evaluate("(() => { const s = window.__SS.snap; return { phase: s.gojo.phase, anim: s.gojo.anim }; })()");
  await b.keyUp(FWD);
  await sleep(500);
  const walk = prep(await rows());
  log('  走: 0.25s=' + f2(at(walk, 0.25).acc) + 'm  0.5s=' + f2(at(walk, 0.5).acc) + 'm  0.75s=' + f2(at(walk, 0.75).acc) +
      'm  1.0s=' + f2(at(walk, 1.0).acc) + 'm  稳态速度(0.8~1.2s)=' + f2(avgV(walk, 0.8, 1.2)) + ' m/s');
  log('  走: 曲线速度=' + f2(at(walk, 0.6).speed) + ' m/s  实测=' + f2(at(walk, 0.6).vs) + ' m/s  fov=' + f2(at(walk, 0.6).fov) +
      '  anim=' + at(walk, 0.6).anim + '  phase=' + at(walk, 0.6).phase);
  log('  走: snap={phase:' + walkSnap.phase + ', anim:' + walkSnap.anim + '}  扬尘计数=' + peak(walk, 'dust') + '  debris峰值=' + peak(walk, 'deb'));

  await resetArena();
  await mark();
  await b.keyDown('ShiftLeft');
  await b.keyDown(FWD);
  await sleep(240);
  const midSnap = await b.evaluate("(() => { const s = window.__SS.snap; return { phase: s.gojo.phase, anim: s.gojo.anim, mech: window.__MECH() }; })()");
  await sleep(240);
  const midSnap2 = await b.evaluate("(() => { const s = window.__SS.snap; const m = window.__MECH(); return { phase: s.gojo.phase, anim: s.gojo.anim, speed: m.speed, fov: m.fov, fovAbs: m.fovAbs, accelPhase: m.accelPhase }; })()");
  await sleep(900);
  const runSnap = await b.evaluate("(() => { const s = window.__SS.snap; const m = window.__MECH(); const C = window.__CAMUI; const A = window.__SS.audio; return { phase: s.gojo.phase, anim: s.gojo.anim, speed: m.speed, fov: m.fov, fovAbs: m.fovAbs, dust: m.dust, wind: m.wind, blur: m.blur, camui: { fov: C.fov, sprintFov: C.sprintFov, sprintDist: C.sprintDist, sprintAmt: C.sprintAmt }, rw: A && A.runWindState ? A.runWindState : null }; })()");
  await b.screenshot('shots/sprint/pc-run.png');
  await shotClip('shots/sprint/pc-run-close.png');
  await b.keyUp(FWD);
  await b.keyUp('ShiftLeft');
  await sleep(600);
  const run = prep(await rows());

  log('  跑: 0.25s=' + f2(at(run, 0.25).acc) + 'm  0.5s=' + f2(at(run, 0.5).acc) + 'm  0.75s=' + f2(at(run, 0.75).acc) +
      'm  1.0s=' + f2(at(run, 1.0).acc) + 'm  稳态速度(0.8~1.2s)=' + f2(avgV(run, 0.8, 1.2)) + ' m/s');
  log('  跑: 0.40s 曲线速度=' + f2(at(run, 0.4).speed) + ' m/s  实测=' + f2(at(run, 0.4).vs) +
      '  1.0s 曲线=' + f2(at(run, 1.0).speed) + ' 实测=' + f2(at(run, 1.0).vs));
  log('  跑: fov=' + f2(at(run, 1.0).fov) + ' (附加 ' + f2(at(run, 1.0).sFov) + '°)  后拉倍数=' + f3(at(run, 1.0).sDist) +
      '  径向模糊=' + f3(at(run, 1.0).blur) + '  风噪=' + f2(at(run, 1.0).wind));
  log('  跑: 扬尘计数=' + peak(run, 'dust') + '  debris峰值=' + peak(run, 'deb') + '  groundRing峰值=' + peak(run, 'ring'));
  log('  跑: 音效 steps=' + peak(run, 'steps') + '  windLevel峰值=' + f2(peak(run, 'windLvl')));
  log('  phase 序列: ' + transitions(run, 'phase').map((x) => x.v + '@' + f2(x.t) + 's').join(' → '));
  log('  anim  序列: ' + transitions(run, 'anim').map((x) => x.v + '@' + f2(x.t) + 's').join(' → '));
  log('  0.24s snap=' + JSON.stringify(midSnap) + '  0.48s snap=' + JSON.stringify(midSnap2));
  log('  1.4s snap=' + JSON.stringify(runSnap));

  /* ================= B 起步 0.35s 曲线 ================= */
  log('');
  log('===== B 起步 0.35s 曲线（相对 accelPhase→accel 的那一刻）=====');
  const tAcc = (run.find((r) => r.ap === 'accel') || { rt: NaN }).rt;
  if (isFinite(tAcc)) {
    const line = [];
    for (const tt of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]) {
      const r = at(run, tAcc + tt);
      line.push('+' + tt.toFixed(2) + 's 曲线=' + f2(r.speed) + ' 实测=' + f2(r.vs));
    }
    log('  ' + line.join(' | '));
    const s35 = at(run, tAcc + 0.35).speed;
    const s40 = at(run, tAcc + 0.4).speed;
    check('起步 0.35s 到 10.5 m/s', s35 >= 10.2 && s35 <= 10.6, 'measured mech.speed@+0.35s=' + f2(s35) + ' (+0.40s=' + f2(s40) + ')');
    const idle = at(run, Math.max(0, tAcc - 0.02)).speed;
    check('起步前速度 = 4.8（走路基准）', idle <= 4.85, 'mech.speed@-0.02s=' + f2(idle));
    check('实测速度跟随曲线（不靠 return 空转）', Math.abs(at(run, tAcc + 0.3).vs - at(run, tAcc + 0.3).speed) < 1.6,
      'Δ=' + f2(Math.abs(at(run, tAcc + 0.3).vs - at(run, tAcc + 0.3).speed)));
  } else {
    check('起步 0.35s 到 10.5 m/s', false, '没采到 accelPhase=accel');
  }
  check('疾跑稳态速度 ≥ 10.0', avgV(run, 0.8, 1.2) >= 10.0, '稳态=' + f2(avgV(run, 0.8, 1.2)) + ' m/s');
  const gain = at(run, 1.0).acc - at(walk, 1.0).acc;
  check('疾跑 1.0s 位移比走多 ≥ 4m', gain >= 4, 'Δ=' + f2(gain) + 'm（走 ' + f2(at(walk, 1.0).acc) + ' / 跑 ' + f2(at(run, 1.0).acc) + '）');

  /* ================= E 分档 ================= */
  const ph = transitions(run, 'phase').map((x) => x.v);
  check('phase 序列含 walk→run→sprint', ph.join(',').includes('walk') && ph.join(',').includes('run') && ph.join(',').includes('sprint'), '序=' + ph.join(','));
  check('snap.gojo.phase 读到 sprint', runSnap.phase === 'sprint' || midSnap.phase === 'sprint', '1.4s上=' + runSnap.phase + ' 0.24s上=' + midSnap.phase);
  const animSeq = transitions(run, 'anim').map((x) => x.v);
  check('anim 三档 walk→run→sprint 都播到（不是跳档）',
    animSeq.indexOf('walk') >= 0 && animSeq.indexOf('run') >= 0 && animSeq.indexOf('sprint') > animSeq.indexOf('run') && animSeq.indexOf('run') > animSeq.indexOf('walk'),
    'seq=' + transitions(run, 'anim').map((x) => x.v + '@' + f2(x.t) + 's').join(' → '));

  /* ================= 姿态层数值（走 vs 跑）================= */
  const mean = (l, k) => (l.length ? l.reduce((p, c) => p + c[k], 0) / l.length : NaN);
  const amp = (l, k) => { const a = l.map((r) => r[k]); return a.length ? Math.max(...a) - Math.min(...a) : NaN; };
  const wLean = mean(walk.filter((r) => r.rt > 0.4), 'coreX');
  const rLean = mean(run.filter((r) => r.rt > 0.4), 'coreX');
  log('  姿态均值 core.rotation.x: 走=' + f3(wLean) + ' 跑=' + f3(rLean) + '  Δ=' + f3(rLean - wLean) + ' rad');
  log('  大腿摆幅 thighL: 走=' + f3(amp(walk, 'thighX')) + ' 跑=' + f3(amp(run, 'thighX')) + ' rad');
  log('  弯肘 foreArmL 均值: 走=' + f3(mean(walk, 'foreX')) + ' 跑=' + f3(mean(run, 'foreX')) + ' rad');
  check('疾跑前倾显著大于走路（Δ≥0.15 rad ≈ 8.6°）', (rLean - wLean) >= 0.15, 'Δ=' + f3(rLean - wLean) + ' rad（' + ((rLean - wLean) * 57.3).toFixed(1) + '°）');
  check('疾跑大腿摆幅 ≥ 走路', amp(run, 'thighX') >= amp(walk, 'thighX'), '走=' + f3(amp(walk, 'thighX')) + ' 跑=' + f3(amp(run, 'thighX')));
  check('疾跑弯肘比走路更收（Δ≤-0.2 rad）', (mean(run, 'foreX') - mean(walk, 'foreX')) <= -0.2, 'Δ=' + f3(mean(run, 'foreX') - mean(walk, 'foreX')));

  /* ================= D 镜头 ================= */
  const fovWalk = at(walk, 1.0).fov;
  const fovRun = at(run, 1.0).fov;
  check('FOV 变化 ≥ 6°', (fovRun - fovWalk) >= 6, 'walk=' + f2(fovWalk) + '° → run=' + f2(fovRun) + '°  Δ=' + f2(fovRun - fovWalk) + '° (附加 ' + f2(at(run, 1.0).sFov) + '°)');
  check('相机后拉 > 1.02', at(run, 1.0).sDist > 1.02, 'distMul=' + f3(at(run, 1.0).sDist));
  check('高速径向模糊 > 0.08', peak(run, 'blur') > 0.08, 'blur峰值=' + f3(peak(run, 'blur')));

  /* ================= F 扬尘 ================= */
  // dust 是**累计**计数器（契约字段名为 dust），所以这里比窗口内的增量
  const d0 = (l, k) => (l.length ? l[l.length - 1][k] - l[0][k] : 0);
  const dustWalk = d0(walk, 'dust');
  const dustRun = d0(run, 'dust');
  check('疾跑扬尘 > 0 且走路不扬尘', dustRun > 0 && dustWalk === 0,
    '窗口增量 走路=' + dustWalk + ' 疾跑=' + dustRun + ' 粒子；debris 峰值 走=' + peak(walk, 'deb') + ' 跑=' + peak(run, 'deb'));

  /* ================= G 音效 ================= */
  const sfxNames = await b.evaluate("(() => window.__SS.audio._debug.sfxNames)()");
  check('audio.js 里存在 run_wind', Array.isArray(sfxNames) && sfxNames.indexOf('run_wind') >= 0, 'SFX 数=' + (sfxNames ? sfxNames.length : 0));
  check('风噪床音随速度爬升', peak(run, 'windLvl') > 0.5 && peak(walk, 'windLvl') < peak(run, 'windLvl'),
    'walk峰值=' + f2(peak(walk, 'windLvl')) + ' run峰值=' + f2(peak(run, 'windLvl')) + ' (audio ready=' + au.ready + ')');
  check('脚步节奏随速度触发', peak(run, 'steps') >= 3, '疾跑 1.2s 脚步数=' + peak(run, 'steps'));

  /* ================= C 惯性（只松 Shift）================= */
  log('');
  log('===== C 惯性：只松 Shift、保持前进 =====');
  await resetArena();
  await mark();
  await b.keyDown('ShiftLeft');
  await b.keyDown(FWD);
  await sleep(1000);
  const beforeRel = await b.evaluate('window.__MECH().speed');
  await b.keyUp('ShiftLeft');
  await sleep(450);
  const rel = prep(await rows());
  const distAfter = rel.length ? rel[rel.length - 1].acc : 0;
  const line = [];
  for (const tt of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
    const r = at(rel, (at(rel, 0).rt) + tt);
    line.push('+' + tt.toFixed(2) + 's ' + f2(r.speed) + '/' + f2(r.vs) + 'm/s');
  }
  log('  松手前 mech.speed=' + f2(beforeRel) + ' 然后（曲线/实测）: ' + line.join(' | '));
  await b.keyUp(FWD);
  await sleep(400);
  const relRows = prep(await rows());
  // 找到松手时刻：速度曲线首次开始下降的那一帧
  let tRel = NaN;
  for (let i = 1; i < relRows.length; i++) if (relRows[i].speed < relRows[i - 1].speed - 1e-6) { tRel = relRows[i].rt; break; }
  if (isFinite(tRel)) {
    const d025 = (at(relRows, tRel + 0.25).acc || 0) - (at(relRows, tRel).acc || 0);
    const idle = 4.8;
    const extra = d025 - idle * 0.25;
    log('  0.25s 窗口滑行 ' + f2(d025) + 'm，走路同窗口应为 ' + f2(idle * 0.25) + 'm → 惯性额外 ' + f2(extra) + 'm');
    const s10 = at(relRows, tRel + 0.10).speed;
    const s25 = at(relRows, tRel + 0.25).speed;
    check('回落 0.25s 到 4.8 且中途不归零', s25 <= 4.9 && s25 >= 4.6 && s10 > 4.9 && s10 < beforeRel,
      '+0.10s=' + f2(s10) + ' +0.25s=' + f2(s25) + '（松手前 ' + f2(beforeRel) + '）');
    check('惯性滑行 > 走路同窗口', extra > 0.15, '额外 ' + f2(extra) + 'm');
  } else {
    check('回落 0.25s 到 4.8 且中途不归零', false, '没采到下降沿');
  }

  /* ================= H 转向惯性 ================= */
  log('');
  log('===== H 转向惯性：直行 0.8s 后同向 90° 转向 =====');
  const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  async function turnTest(shift, rightKey) {
    await mark();
    if (shift) await b.keyDown('ShiftLeft');
    await b.keyDown(FWD);
    await sleep(800);
    const tSwitch = (await rows()).slice(-1)[0];
    await b.keyUp(FWD);
    await b.keyDown(rightKey);
    await sleep(900);
    await b.keyUp(rightKey);
    if (shift) await b.keyUp('ShiftLeft');
    await sleep(300);
    const list = prep(await rows());
    return { list, tSwitch: (list.find((r) => r.t === tSwitch.t) || { rt: 0 }).rt };
  }
  const rt = ['KeyD', 'KeyA'].indexOf(FWD) >= 0 ? 'KeyW' : 'KeyD';
  await resetArena();
  const tw = await turnTest(false, rt);
  await resetArena();
  const tsp = await turnTest(true, rt);
  /**
   * 转向度量：
   *   early —— 切换后 **100ms 内**转过的角度。这一段相机还没跟着转多少，
   *            几乎只反映"速度矢量方向滤波"本身（疾跑 tauDir 更大 → 明显更迟）。
   *   r     —— 弧半径 = 弧长 / 总转角（用 60ms 窗算朝向，逐帧差分太抖）。
   */
  function turnMetrics(o) {
    const L = o.list;
    const i0 = L.findIndex((r) => r.rt >= o.tSwitch);
    if (i0 < 1 || i0 + 4 >= L.length) return null;
    const j0 = Math.max(0, L.findIndex((r) => r.rt >= o.tSwitch - 0.25));
    const h0 = Math.atan2(L[i0].z - L[j0].z, L[i0].x - L[j0].x);
    const kEnd = L.length - 1;
    let k1 = kEnd;
    while (k1 > 0 && L[kEnd].rt - L[k1].rt < 0.2) k1--;
    const h1 = Math.atan2(L[kEnd].z - L[k1].z, L[kEnd].x - L[k1].x);
    const total = Math.abs(wrapA(h1 - h0));
    const ang = (i) => { let j = i; while (j > 1 && L[i].rt - L[j].rt < 0.06) j--; return Math.atan2(L[i].z - L[j].z, L[i].x - L[j].x); };
    const turned = (i) => Math.abs(wrapA(ang(i) - h0));
    const i10 = L.findIndex((r) => r.rt >= o.tSwitch + 0.1);
    const early = i10 > 0 ? turned(i10) * 180 / Math.PI : NaN;
    let t90 = NaN, d90 = NaN;
    for (let i = i0 + 2; i < L.length; i++) {
      if (turned(i) >= total * 0.9) { t90 = L[i].rt - o.tSwitch; d90 = L[i].acc - L[i0].acc; break; }
    }
    return { early, t90, d90, r: isFinite(d90) && total > 0.1 ? d90 / total : NaN, total: total * 180 / Math.PI };
  }
  const mw = turnMetrics(tw), ms = turnMetrics(tsp);
  log('  走:  总转角 ' + f2(mw && mw.total) + '°  前 100ms 转过 ' + f2(mw && mw.early) + '°  用时 ' + f2(mw && mw.t90) + 's  弧长 ' + f2(mw && mw.d90) + 'm  弧半径 ≈ ' + f2(mw && mw.r) + 'm');
  log('  跑:  总转角 ' + f2(ms && ms.total) + '°  前 100ms 转过 ' + f2(ms && ms.early) + '°  用时 ' + f2(ms && ms.t90) + 's  弧长 ' + f2(ms && ms.d90) + 'm  弧半径 ≈ ' + f2(ms && ms.r) + 'm');
  check('疾跑转向更迟（前 100ms 转角比走动少 10°以上）', ms && mw && ms.early < mw.early - 10,
    '走 ' + f2(mw && mw.early) + '° → 跑 ' + f2(ms && ms.early) + '°（+100ms 内）');
  check('疾跑弧半径 > 走路 ×1.2', ms && mw && ms.r > mw.r * 1.2, '走 ' + f2(mw && mw.r) + 'm → 跑 ' + f2(ms && ms.r) + 'm');

  /* ================= J 回归 ================= */
  log('');
  log('===== J 回归（移动方向 / 出招滑行 / 走路速度量级）=====');
  await resetArena();
  // 移动方向：W 必须"远离相机"、S 必须"靠近相机"（probe-movedir 的同款判据，双向都查）
  async function dirDot(key) {
    const reg = await b.evaluate('(() => { const S = window.__SS; const g = S.gojo; const c = S.activeCamera; return { gx: g.root.position.x, gz: g.root.position.z, cx: c.position.x, cz: c.position.z }; })()');
    await mark();
    await b.keyDown(key);
    await sleep(800);
    await b.keyUp(key);
    await sleep(400);
    const list = prep(await rows());
    const after = await b.evaluate('(() => { const g = window.__SS.gojo; return { x: g.root.position.x, z: g.root.position.z }; })()');
    const awayX = reg.gx - reg.cx, awayZ = reg.gz - reg.cz;
    const awayLen = Math.hypot(awayX, awayZ) || 1;
    const mvX = after.x - reg.gx, mvZ = after.z - reg.gz;
    const mvLen = Math.hypot(mvX, mvZ) || 1e-6;
    return { dot: (mvX * (awayX / awayLen) + mvZ * (awayZ / awayLen)) / mvLen, len: mvLen, v: avgV(list, 0.5, 0.8), list };
  }
  const dW = await dirDot('KeyW');
  const dS = await dirDot('KeyS');
  log('  KeyW: 位移 ' + f2(dW.len) + 'm  与"远离相机"点积 ' + f3(dW.dot) + '  稳态 ' + f2(dW.v) + ' m/s');
  log('  KeyS: 位移 ' + f2(dS.len) + 'm  与"远离相机"点积 ' + f3(dS.dot) + '  稳态 ' + f2(dS.v) + ' m/s');
  check('移动方向随镜头正确（W 远离相机 dot>0.5，S 靠近相机 dot<-0.5）', dW.dot > 0.5 && dS.dot < -0.5,
    'W dot=' + f3(dW.dot) + '（' + f2(dW.len) + 'm） / S dot=' + f3(dS.dot) + '（' + f2(dS.len) + 'm）');
  check('走路 1s 量级仍在 4.2~5.2 区间', dW.v > 4.2 && dW.v < 5.2, '稳态=' + f2(dW.v) + ' m/s');

  /**
   * 出招不滑行（历史坑：按住方向键连打时会以走/跑全速"滑行"，腿上却停在招式姿势里）。
   * ⚠ 不能用总位移判断 —— 命中时 combat 有一个**设计内**的"出招小步前冲"
   *   （HitResolver.lunge，每次命中把攻击者向目标推近到 1.7m），单次就有 ~3m。
   *   所以这里直接钳住 moveTowards 的**请求速度**（probe-stick 同款做法）：
   *   出招帧里请求速度必须被 moveMul 压到 4.8×0.18/0.32/0.45，绝不能是走/跑全速。
   */
  await b.evaluate('(() => {' +
    ' const g = window.__SS.gojo; const orig = g.moveTowards;' +
    ' window.__MVS = [];' +
    ' g.moveTowards = function (x, z, sp, dt) { window.__MVS.push({ t: performance.now(), sp: +sp.toFixed(2), anim: g.state.anim }); return orig.apply(g, arguments); };' +
    ' return true; })()');
  await b.keyDown(FWD);
  await sleep(300);
  for (let i = 0; i < 5; i++) { await b.pressKey('KeyJ', 40); await sleep(140); }
  await b.keyUp(FWD);
  await sleep(500);
  const mvs = await b.evaluate('window.__MVS.slice()');
  const atkMv = mvs.filter((m) => m.anim !== 'walk' && m.anim !== 'run' && m.anim !== 'sprint' && m.anim !== 'idle');
  const freeMv = mvs.filter((m) => m.anim === 'walk' || m.anim === 'run' || m.anim === 'sprint');
  const mx = (l) => (l.length ? Math.max(...l.map((x) => x.sp)) : 0);
  const dist = {};
  for (const m of atkMv) dist[m.sp] = (dist[m.sp] || 0) + 1;
  log('  moveTowards 调用 ' + mvs.length + ' 次（出招帧 ' + atkMv.length + ' / 步态帧 ' + freeMv.length + '）');
  log('  出招帧请求速度分布: ' + (Object.keys(dist).length ? Object.entries(dist).sort((a, c) => c[1] - a[1]).map(([k, v]) => k + '×' + v).join('  ') : '-') +
    '  （4.8×0.18=0.86 / ×0.32=1.54 / ×0.45=2.16）');
  log('  步态帧请求速度峰值: ' + f2(mx(freeMv)) + ' m/s（基准走速 4.8，出招期间不该出现）');
  const slowed = atkMv.filter((m) => m.sp <= 2.2).length;
  const ratio = atkMv.length ? slowed / atkMv.length : 0;
  check('出招帧请求速度被压低（≥85% 的帧 ≤2.2 m/s）', atkMv.length > 0 && ratio >= 0.85,
    slowed + '/' + atkMv.length + ' = ' + (ratio * 100).toFixed(1) + '% ≤2.2 m/s（其余是招式已 done、剪辑还在收尾的帧）');
  check('出招帧绝无疾跑级速度（峰值 ≤ 4.85 = 基准走速）', atkMv.length > 0 && mx(atkMv) <= 4.85, '出招帧峰值=' + f2(mx(atkMv)) + ' m/s');
  check('步态帧仍按基准 4.8 走（无 Shift 时不被疾跑污染）', mx(freeMv) > 4.7 && mx(freeMv) <= 4.85, '步态帧峰值=' + f2(mx(freeMv)) + ' m/s');

  /* ================= I 触屏 ================= */
  log('');
  log('===== I 触屏 844x390：摇杆推到底 = 疾跑 =====');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await bootToFight(true);
  await installSampler();
  await b.evaluate("(() => { window.__MECH = () => { const S = window.__SS; const m = typeof S.mech === 'function' ? S.mech() : S.mech; return (m && m.sprint) || {}; }; return true; })()");
  const joy = await b.evaluate("(() => { const e = document.querySelector('#t-joy'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width) }; })()");
  log('  摇杆 ' + JSON.stringify(joy));
  const active = new Map();
  const pts = () => [...active.entries()].map(([id, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), id }));
  const ts = async (id, x, y) => { active.set(id, { x, y }); await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts() }); };
  const tm = async (id, x, y) => { active.set(id, { x, y }); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts() }); };
  const te = async (id) => { active.delete(id); await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts() }); };

  // 半推（模拟量 0.55）→ 走；推到底 → 跑
  // 特写对比"走 vs 跑"：镜头拉到最近的构图档（zoomBias 0.75）+ 临时藏 HUD，否则角色只占几十像素
  await b.evaluate("(() => { window.__SS.cam.zoomBias = 0.75; const h = document.querySelectorAll('#hud, #touch-ui'); for (const e of h) e.style.visibility = 'hidden'; return true; })()");
  await b.evaluate("(() => { window.__MOBILE.drive(0, -0.55); return true; })()");
  await sleep(900);
  const half = await b.evaluate('(() => { const T = window.__TOUCH; const m = window.__MECH(); return { run: T.run, mx: T.mx, mz: T.mz, phase: m.phase, speed: m.speed, anim: window.__SS.gojo.state.anim }; })()');
  await b.screenshot('shots/sprint/phone-walk.png');
  await shotClip('shots/sprint/phone-walk-close.png', 560, 460);
  log('  半推 drive(0,-0.55): ' + JSON.stringify(half));
  check('半推不触发疾跑', half.run === false && half.phase !== 'sprint', 'run=' + half.run + ' phase=' + half.phase + ' speed=' + f2(half.speed));
  check('摇杆仍是模拟量（不是 0/1 二值）', Math.abs(half.mz + 0.55) < 0.02, 'mz=' + half.mz);

  await b.evaluate("(() => { window.__MOBILE.drive(0, 0); return true; })()");
  await sleep(400);
  await mark();
  await b.evaluate("(() => { window.__MOBILE.drive(0, -1); return true; })()");
  await sleep(1200);
  const full = await b.evaluate('(() => { const T = window.__TOUCH; const m = window.__MECH(); const s = window.__SS.snap; return { run: T.run, mx: T.mx, mz: T.mz, phase: m.phase, speed: m.speed, fov: m.fov, dust: m.dust, wind: m.wind, snapPhase: s.gojo.phase, anim: s.gojo.anim }; })()');
  const touchRun = prep(await rows());
  await b.screenshot('shots/sprint/phone-run.png');
  await shotClip('shots/sprint/phone-run-close.png', 560, 460);
  // 恢复 HUD / 触屏 UI 的可见性：真手指拖摇杆的用例需要摇杆真的可点（hidden 元素收不到 pointer）
  await b.evaluate("(() => { const h = document.querySelectorAll('#hud, #touch-ui'); for (const e of h) e.style.visibility = ''; return true; })()");
  log('  推到底 drive(0,-1): ' + JSON.stringify(full));
  check('摇杆推到底 → __TOUCH.run=true', full.run === true, 'run=' + full.run + ' mz=' + full.mz);
  check('触屏疾跑 phase=sprint', full.phase === 'sprint' && full.snapPhase === 'sprint', 'mech=' + full.phase + ' snap=' + full.snapPhase);
  check('触屏疾跑速度 ≥ 10.0', full.speed >= 10.0, 'speed=' + f2(full.speed));
  check('触屏疾跑有扬尘', full.dust > 0, 'dust=' + full.dust);
  check('触屏疾跑 1.2s 位移 > 8m', (touchRun.length ? touchRun[touchRun.length - 1].acc : 0) > 8, '位移=' + f2(touchRun.length ? touchRun[touchRun.length - 1].acc : 0) + 'm');

  // 真手指拖动路径（不是 drive）
  await b.evaluate("(() => { window.__MOBILE.drive(0, 0); return true; })()");
  await sleep(500);
  await mark();
  await ts(41, joy.x, joy.y);
  await sleep(80);
  await tm(41, joy.x, joy.y - Math.round(joy.w * 0.5));
  await sleep(900);
  const drag = await b.evaluate('(() => { const T = window.__TOUCH; const m = window.__MECH(); return { run: T.run, mz: T.mz, phase: m.phase, speed: m.speed }; })()');
  await te(41);
  await sleep(600);
  const released = await b.evaluate('(() => { const T = window.__TOUCH; const m = window.__MECH(); return { run: T.run, on: T.on, speed: m.speed, phase: m.phase }; })()');
  log('  真手指拖到底: ' + JSON.stringify(drag));
  log('  松手后:       ' + JSON.stringify(released));
  check('真手指推到底也触发疾跑', drag.run === true && drag.phase === 'sprint', 'run=' + drag.run + ' speed=' + f2(drag.speed));
  check('松手后疾跑标志清零、速度回落', released.run === false && released.speed <= 4.9, 'run=' + released.run + ' speed=' + f2(released.speed) + ' phase=' + released.phase);

  /* ================= L 直接写桥（verifier 的注入风格）================= */
  // verifier 的 verify-sprint.mjs --mobile 是**直接写** window.__TOUCH.mx/mz 的（不经过 moveStick/syncBridge）。
  // 这条用例把这个路径固定下来：任何写桥的人，下一帧都要派生出 run 标志 + 疾跑。
  log('');
  log('===== L 直接写 window.__TOUCH 桥（绕过 mobile.js 的指针路径）=====');
  await b.evaluate("(() => { window.__TOUCH.on = true; window.__TOUCH.mx = 0; window.__TOUCH.mz = -1; return true; })()");
  await sleep(1200);
  const direct = await b.evaluate('(() => { const T = window.__TOUCH; const m = window.__MECH(); const s = window.__SS.snap; return { run: T.run, mz: T.mz, phase: m.phase, speed: m.speed, snapPhase: s.gojo.phase, anim: s.gojo.anim }; })()');
  log('  直接写桥(0,-1): ' + JSON.stringify(direct));
  check('直接写 __TOUCH 桥也能派生疾跑（run=true / phase=sprint / speed≥10）',
    direct.run === true && direct.phase === 'sprint' && direct.speed >= 10 && direct.snapPhase === 'sprint',
    'run=' + direct.run + ' phase=' + direct.phase + ' speed=' + f2(direct.speed));
  await b.evaluate("(() => { window.__TOUCH.mx = 0; window.__TOUCH.mz = 0; window.__TOUCH.on = false; return true; })()");
  await sleep(700);
  const back = await b.evaluate('(() => { const T = window.__TOUCH; const m = window.__MECH(); return { run: T.run, speed: m.speed, phase: m.phase }; })()');
  log('  桥回中: ' + JSON.stringify(back));
  check('桥回中后 run 标志清零、速度回落', back.run === false && back.speed <= 4.9, 'run=' + back.run + ' speed=' + f2(back.speed));

  /* ================= K 低画质降级 ================= */
  log('');
  log('===== K 低画质（?q=low）降级：速度/分档/镜头/扬尘/前倾 都要成立 =====');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  // ⚠ maxTouchPoints 必须 ≥1：传 0 会被 CDP 拒绝（"Touch points must be between 1 and 16"）
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
  await bootToFight(false, 'q=low');
  await installSampler();
  await b.evaluate("(() => { window.__MECH = () => { const S = window.__SS; const m = typeof S.mech === 'function' ? S.mech() : S.mech; return (m && m.sprint) || {}; }; return true; })()");
  const q = await b.evaluate('window.__SS.quality');
  const dust0 = await b.evaluate('window.__MECH().dust');
  await b.keyDown('ShiftLeft');
  await b.keyDown('KeyW');
  await sleep(1200);
  const lqs = await b.evaluate('(() => { const m = window.__MECH(); const g = window.__SS.gojo; return { speed: +m.speed.toFixed(2), phase: m.phase, fov: +m.fov.toFixed(2), core: +g.bones.core.rotation.x.toFixed(3), anim: g.state.anim }; })()');
  await b.keyUp('KeyW');
  await b.keyUp('ShiftLeft');
  await sleep(600);
  const dust1 = await b.evaluate('window.__MECH().dust');
  log('  quality=' + q + '  疾跑 1.2s: ' + JSON.stringify(lqs) + '  扬尘增量=' + (dust1 - dust0) + '（高画质同窗口实测 10~16）');
  check('低画质（?q=low）确实生效', q === 'low', 'quality=' + q);
  check('低画质疾跑曲线/分档不变（10.5 / sprint）', lqs.speed >= 10.4 && lqs.phase === 'sprint', 'speed=' + f2(lqs.speed) + ' phase=' + lqs.phase);
  check('低画质 FOV 推近仍在（≥6°）', lqs.fov >= 6, 'fov 附加=' + f2(lqs.fov) + '°');
  check('低画质扬尘降级（增量 1~8 颗粒）', (dust1 - dust0) > 0 && (dust1 - dust0) <= 8, '增量=' + (dust1 - dust0) + ' 颗');
  check('低画质前倾姿态仍在（core.x ≥ 0.3 rad ≈17°）', lqs.core >= 0.3, 'core.rotation.x=' + f3(lqs.core) + ' rad（sprint 采样点）');

  /* ================= 汇总 ================= */
  log('');
  log('=== 页面错误 ' + JSON.stringify(b.errors.slice(0, 4)) + ' ===');
  const fail = results.filter((r) => !r.pass);
  log('=== 结果 ' + (results.length - fail.length) + '/' + results.length + ' 通过 ===');
  if (fail.length) log('失败项: ' + fail.map((r) => r.name).join(' | '));
  process.exitCode = fail.length ? 1 : 0;
} catch (e) {
  log('FATAL ' + String((e && e.stack) || e).slice(0, 600));
  process.exitCode = 2;
} finally {
  await b.close();
}
