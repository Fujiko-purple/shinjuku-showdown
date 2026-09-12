/**
 * probe-fix-ux.mjs —— 本轮用户报的两件事的复现/回归探针
 * ① 普攻能不能打到落地（弱点窗口）魔虚罗
 * ② 领域对拼结算到底说的是赢还是输
 * 用法：node _tools/probe-fix-ux.mjs --file tmp/lead/dist.html --port 9509
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg('file', 'tmp/lead/dist.html'));
const PORT = Number(arg('port', '9509'));
const SHOTS = arg('shots', 'shots/fixux');
if (!existsSync(FILE)) { console.error('找不到产物 ' + FILE); process.exit(2); }
mkdirSync(SHOTS, { recursive: true });
const URL = 'file:///' + FILE.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

const R = [];
function check(name, ok, detail) {
  R.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? '  -> ' + detail : ''));
}
function info(tag, v) { console.log('    . ' + tag + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))); }
function head(t) { console.log('\n=== ' + t + ' ==='); }
const b = new Browser({ port: PORT, width: 1280, height: 720 });
const nap = sleep;

const PAGE = String.raw`window.__X = (function () {
  var S = window.__SS;
  function A() { return S.combat; }
  function CB() { return S.mahoraga.cb(); }
  function F(w) { return CB().fighters[w]; }
  var BTN = ["light","heavy","blue","red","purple","heal","dodge","dash","domain","lockOn","charge","v"];
  var T = 0;
  function mkInput(o) {
    var r = { moveX: 0, moveZ: 0, mouse: { pressed: false } };
    for (var i = 0; i < BTN.length; i++) r[BTN[i]] = false;
    if (o) for (var k in o) r[k] = o[k];
    return r;
  }
  function step(o, n) {
    var c = A(); n = n || 1;
    for (var i = 0; i < n; i++) { T += 1 / 60; c.update(mkInput(o), 1 / 60, T); }
    return c.frame;
  }
  function put(w, x, z) {
    var c = F(w);
    if (c.ctrl && c.ctrl.setPos) c.ctrl.setPos(x, 0, z);
    c.p.set(x, 0, z);
    if (c.vel && c.vel.set) c.vel.set(0, 0, 0);
    return [+c.p.x.toFixed(2), +c.p.z.toFixed(2)];
  }
  function m() { return S.mahoraga.debug(); }
  function mAim() { var d = m(); return d.aim; }
  /** 俯冲会打到玩家：硬直/无敌/击退会把前两拳吞掉，测量前必须清干净 */
  function calm() {
    var pl = F('gojo');
    pl.hp = pl.hpMax; pl.ce = pl.ceMax;
    pl.stunT = 0; pl.invT = 0; pl.drvT = 0; pl.forcedInv = false;
    if (pl.vel && pl.vel.set) pl.vel.set(0, 0, 0);
    CB().hitstop = 0;
    return true;
  }
  function dist2(a, c) { return Math.hypot(a.x - c.x, a.z - c.z); }
  function gap(w, toMaho) {
    var p = F(w).p, q = toMaho ? m().pos : F('sukuna').p;
    return +Math.hypot(p.x - q.x, p.z - q.z).toFixed(2);
  }
  function prep(o) {
    var c = A();
    c.reset();
    c.setAiEnabled(false);
    put('gojo', o.px, o.pz);
    put('sukuna', o.sx, o.sz);
    F('sukuna').hp = F('sukuna').hpMax * 0.5;
    F('gojo').hp = F('gojo').hpMax;
    F('gojo').ce = F('gojo').ceMax;
    var i;
    for (i = 0; i < 500 && m().state !== 'air'; i++) step(null, 1);
    if (m().state !== 'air') return { err: 'summon', state: m().state };
    S.mahoraga.freeze(true);
    if (o.airborne) {
      /**
       * ⚠ pin=true 会把魔虚罗钉在**不在绕宿傩航线上**的位置，而 mahoAim → mahoPredict
       * 是按「绕宿傩的弧线」外推的（ORBIT_LOCAL）—— 钉住之后瞄点会飞到反方向
       * （实测 aimPoint z=-9.4，本体在 z=+14），弹道自然全空。
       * 要测对空弹道就必须让它在自己的航线上（pin=false）。
       */
      S.mahoraga.setPos(o.mx, 5.0, o.mz, o.pin !== false);
      return { ok: 'air', pin: o.pin !== false };
    }
    S.mahoraga.setPos(o.px, 5.0, o.pz, false);
    S.mahoraga.force('dive');
    for (i = 0; i < 300 && m().state !== 'down'; i++) step(null, 1);
    if (m().state !== 'down') return { err: 'dive', state: m().state };
    S.mahoraga.setPos(o.mx, 0, o.mz, true);
    put('gojo', o.px, o.pz);
    put('sukuna', o.sx, o.sz);
    calm();
    return { ok: 'down', weakT: +m().weakT.toFixed(2) };
  }
  function onePunch() {
    var hp0 = m().hp, sk0 = F('sukuna').hp;
    step({ light: true }, 2);
    step({ light: false }, 26);
    return { maho: +(hp0 - m().hp).toFixed(2), sukuna: +(sk0 - F('sukuna').hp).toFixed(2) };
  }
  function punch(n) {
    n = n || 1;
    var per = [], skPer = [];
    var f0 = +F('gojo').ctrl.root.rotation.y.toFixed(3), f1 = f0;
    var action = null, forward = null, targetSide = null;
    for (var k = 0; k < n; k++) {
      var d = onePunch();
      per.push(d.maho); skPer.push(d.sukuna);
      f1 = +F('gojo').ctrl.root.rotation.y.toFixed(3);
      var a2 = CB().runner.current('gojo');
      if (a2) { action = a2.skill; forward = [+a2.forward.x.toFixed(2), +a2.forward.z.toFixed(2)]; targetSide = a2.target ? a2.target.side : null; }
    }
    return { mahoPer: per, mahoTotal: +per.reduce(function (a, c) { return a + c; }, 0).toFixed(2),
      sukunaTotal: +skPer.reduce(function (a, c) { return a + c; }, 0).toFixed(2),
      mahoHp: +m().hp.toFixed(2), mahoHpMax: m().hpMax, facing: [f0, f1],
      action: action, forward: forward, targetSide: targetSide, state: m().state, aim: mAim() };
  }
  function burst() {
    var per = [], win0 = +m().weakT.toFixed(2), guard = 0;
    while (m().state === 'down' && guard++ < 12) {
      var d = onePunch();
      per.push(d.maho);
    }
    return { win: win0, hits: per.length, per: per, total: +per.reduce(function (a, c) { return a + c; }, 0).toFixed(2),
      hp: +m().hp.toFixed(2), hpMax: m().hpMax };
  }
  function faceYaw() { return +F('gojo').ctrl.root.rotation.y.toFixed(3); }
  /**
   * A5：出招小步前冲（lunge）到底朝哪边冲。
   * 独立验证的 P0：lunge 原来只认 a.target（宿傩），玩家朝落地魔虚罗出拳时
   * 人被朝宿傩的方向拉走 2.6m，拳头全空（用户报的「自动吸附」的真身）。
   */
  function lungeProbe(o) {
    var p = prep(o);
    if (p.err) return p;
    calm();
    var pl = F('gojo'), sk = F('sukuna'), mh = m().pos;
    var p0 = { x: pl.p.x, z: pl.p.z };
    var dS = Math.hypot(sk.p.x - p0.x, sk.p.z - p0.z) || 1;
    var dM = Math.hypot(mh.x - p0.x, mh.z - p0.z) || 1;
    var hp0 = m().hp;
    step({ light: true }, 2);
    step({ light: false }, 26);
    var p1 = { x: pl.p.x, z: pl.p.z };
    var mv = { x: p1.x - p0.x, z: p1.z - p0.z };
    return {
      gapS: +dS.toFixed(2), gapM: +dM.toFixed(2),
      moved: +Math.hypot(mv.x, mv.z).toFixed(2),
      projSukuna: +((mv.x * (sk.p.x - p0.x) + mv.z * (sk.p.z - p0.z)) / dS).toFixed(2),
      projMaho: +((mv.x * (mh.x - p0.x) + mv.z * (mh.z - p0.z)) / dM).toFixed(2),
      mahoDmg: +(hp0 - m().hp).toFixed(2)
    };
  }
  /** A7：术式（赫）打空中魔虚罗 —— 锁定 (Q) 状态下连发 n 次的伤害 */
  function castAt(skill, n, lock) {
    var pl = F('gojo'), out = [];
    S.cam.lockOn = !!lock;
    var aim0 = m().hookCalls.aim || 0;
    var d0 = m().pos;
    for (var k = 0; k < n; k++) {
      pl.ce = pl.ceMax; pl.cds.clear(); pl.burnoutT = 0; pl.stunT = 0;
      var hp0 = m().hp;
      CB().runner.start('gojo', skill);
      step(null, 110);
      out.push(+(hp0 - m().hp).toFixed(2));
    }
    var d = m();
    S.cam.lockOn = false;
    return { per: out, total: +out.reduce(function (a, c) { return a + c; }, 0).toFixed(2), adapt: d.adapt,
      aimAir: d.aimAir, aimCallsDelta: (d.hookCalls.aim || 0) - aim0, mahoPos: d0, gap: +Math.hypot(d0.x - 0, d0.z - 0).toFixed(2) };
  }
  /** 把魔虚罗投影到屏幕坐标，返回一个截取框（截图放大看细节用） */
  function clipMaho(w) {
    var camObj = S.activeCamera, d = m();
    var v = S.cam.target.clone().set(d.pos.x, d.pos.y + 2.0, d.pos.z).project(camObj);
    var cx = (v.x * 0.5 + 0.5) * window.innerWidth;
    var cy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    var W = w || 420, H = Math.round(W * 0.62);
    return { x: Math.max(0, Math.round(cx - W / 2)), y: Math.max(0, Math.round(cy - H / 2)), width: W, height: H };
  }
  function clipCenter(w, h) {
    var W = w || 900, H = h || 340;
    return { x: Math.round((window.innerWidth - W) / 2), y: Math.round((window.innerHeight - H) / 2), width: W, height: H };
  }
  return { A: A, CB: CB, F: F, m: m, mAim: mAim, calm: calm, gap: gap, clipMaho: clipMaho, clipCenter: clipCenter, lungeProbe: lungeProbe, castAt: castAt, step: step, put: put, prep: prep, punch: punch, burst: burst, dist2: dist2,
    faceYaw: faceYaw, sys: function () { return { state: S.state, frame: A().frame, mech: Object.keys(S.mech()) }; } };
})();`;

/** B 段用：开一场真领域对拼，然后按 sync 赢 / miss 输，读结算横幅 */
async function clashCase(winGojo) {
  await b.evaluate('window.__CW = ' + (winGojo ? 'true' : 'false'));
  return await b.evaluate(async function () {
    var S = window.__SS, c = S.combat, cb = S.mahoraga.cb();
    c.setAiEnabled(false);
    c.reset();
    await new Promise(function (r) { setTimeout(r, 150); });
    cb.fighters.gojo.domain = 100;
    cb.fighters.sukuna.domain = 100;
    c.domains.open('gojo');
    c.domains.open('sukuna');
    var t0 = Date.now();
    while (Date.now() - t0 < 4000 && !c.domains.clash.active) await new Promise(function (r) { setTimeout(r, 30); });
    var d = c.domains.clash;
    var started = { active: d.active, tug: +d.tug.toFixed(2) };
    if (!d.active) return { err: 'clash 没开起来', started: started };
    /**
     * ⚠ 必须等主循环真的把 state 切进 "clash" 再判胜负。
     * 否则 update 里 active 已经变回 false，afterUpdate 的
     * 「!inClash && state === "clash"」结算分支一个字都不会跑（第一版探针就踩了这个坑）。
     */
    var tA = Date.now();
    while (Date.now() - tA < 1500 && S.state !== 'clash') await new Promise(function (r) { setTimeout(r, 16); });
    var enteredState = S.state;
    if (window.__CW) d.sync = 5; else d.miss = 3;
    var t1 = Date.now();
    while (Date.now() - t1 < 2500 && d.active) await new Promise(function (r) { setTimeout(r, 16); });
    await new Promise(function (r) { setTimeout(r, 420); });
    var el = document.getElementById('banner');
    var hud = document.querySelector('#duel-hud');
    var res = document.getElementById('duel-result');
    return { started: started, enteredState: enteredState, winner: d.winner, tug: +d.tug.toFixed(2),
      state: S.state, snapWinner: S.snap.clashWinner,
      snapBanner: S.snap.banner, domBanner: el ? (el.textContent || '').trim() : null,
      domBannerShown: el ? el.classList.contains('show') : null,
      resultPanel: res ? { cls: res.className, display: res.style.display,
        title: (res.querySelector('.dr-title') || {}).textContent,
        vs: (res.querySelector('.dr-vs') || {}).textContent,
        line: (res.querySelector('.dr-line') || {}).textContent } : null,
      hudText: hud ? (hud.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : 'no-hud' };
  });
}


/* A7 单独诊断模式：只测「锁定 + 赫 打空中魔虚罗」，不吃全套的时间 */
if (process.argv.includes('--air')) {
  const A2 = arg('maho-z', '-9');
  try {
    await b.launch();
    await b.newPage();
    await b.send('Page.navigate', { url: URL });
    await nap(13000);
    await b.evaluate('(() => { const el = document.getElementById("btn-skip-cine"); if (el) el.click(); return true; })()');
    for (let i = 0; i < 80; i++) { await nap(400); if (await b.evaluate('window.__SS && window.__SS.state') === 'fight') break; }
    await b.evaluate(PAGE);
    // pin:false —— 必须让它留在绕宿傩的航线上，否则 mahoPredict 的瞄点会飞到反方向
    const run = '(() => { var p = window.__X.prep({ px: 0, pz: 0, sx: 0, sz: ' + A2 + ', mx: 0, mz: ' + A2 + ', airborne: true, pin: false }); if (p.err) return p; window.__X.calm(); return window.__X.castAt("red", 4, true); })()';
    const r = await b.evaluate(run);
    info('A7 赫×3 锁定打空中魔虚罗（z=' + A2 + '）', r);
    const info2 = await b.evaluate('(() => { const d = window.__SS.mahoraga.debug(); return { pos: d.pos, hp: d.hp, aimAir: d.aimAir, state: d.state, lockOn: !!window.__SS.cam.lockOn }; })()');
    info('之后状态', info2);
    // 对照组：不锁定
    const r2 = await b.evaluate('(() => { window.__SS.mahoraga.heal(900); return window.__X.castAt("red", 3, false); })()');
    info('A7 对照：不锁定', r2);
  } catch (e) {
    console.error('air 诊断异常：', (e && e.stack) || e);
  } finally {
    await b.close();
  }
  process.exit(0);
}

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await nap(13000);
  await b.evaluate('(() => { const el = document.getElementById("btn-skip-cine"); if (el) el.click(); return true; })()');
  for (let i = 0; i < 80; i++) { await nap(400); if (await b.evaluate('window.__SS && window.__SS.state') === 'fight') break; }
  await b.evaluate(PAGE);
  info('boot', await b.evaluate('window.__X.sys()'));

  head('A · 普攻 vs 落地魔虚罗');
  /**
   * A1 是对照组：魔虚罗**悬空**时它不该参与近战，普攻必须照常打在宿傩身上。
   * （落地窗口的抢占行为由 A2/A4/A5/A6 覆盖 —— 那时"全打魔虚罗"是有意设计。）
   */
  const A1 = '(() => { var p = window.__X.prep({ px: 0, pz: 0, sx: 0, sz: 3, mx: 0, mz: -3, airborne: true }); if (p.err) return p; window.__X.calm(); var q = window.__X.punch(2); return { prep: p, q: q, gapS: window.__X.gap("gojo"), gapM: window.__X.gap("gojo", true) }; })()';
  const A2 = '(() => { var p = window.__X.prep({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: 3 }); if (p.err) return p; window.__X.calm(); var q = window.__X.punch(2); return { prep: p, q: q, gapS: window.__X.gap("gojo"), gapM: window.__X.gap("gojo", true) }; })()';
  const A3 = '(() => { var p = window.__X.prep({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: 3, airborne: true }); if (p.err) return p; window.__X.calm(); var q = window.__X.punch(1); return { prep: p, q: q, banner: window.__SS.snap.banner }; })()';
  const A4 = '(() => { var p = window.__X.prep({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: 3 }); if (p.err) return p; window.__X.calm(); return window.__X.burst(); })()';

  const r1 = await b.evaluate(A1);
  info('A1 宿傩3m正前 / 魔虚罗悬空在身后', r1);
  check('A1 悬空时普攻照常打宿傩（原目标路径没被搅坏）', r1 && r1.q && r1.q.sukunaTotal > 0 && r1.q.mahoTotal === 0, JSON.stringify(r1 && r1.q));

  const r2 = await b.evaluate(A2);
  info('A2 宿傩25m / 魔虚罗身前3m', r2);
  check('A2 魔虚罗吃到伤害（改前=0，用户报的 BUG）', r2 && r2.q && r2.q.mahoTotal > 0, JSON.stringify(r2 && r2.q));
  check('A2 宿傩不该挨这一下', r2 && r2.q && r2.q.sukunaTotal === 0, JSON.stringify(r2 && r2.q));
  await b.screenshot(SHOTS + '/a-weak-window.png');
  await b.screenshot(SHOTS + '/a-weak-close.png', { clip: await b.evaluate('window.__X.clipMaho(440)') });

  const r3 = await b.evaluate(A3);
  info('A3 魔虚罗悬空', r3);
  check('A3 悬空时近战打不到（契约）', r3 && r3.q && r3.q.mahoTotal === 0, JSON.stringify(r3 && r3.q));
  check('A3 悬空给出够不到的解释', !!(r3 && /悬空|近战/.test(String(r3.banner || ''))), String(r3 && r3.banner));

  const r4 = await b.evaluate(A4);
  info('A4 弱窗口 1.6s 内连击', r4);
  check('A4 弱窗口内至少能打出 2 下', r4 && r4.hits >= 2, JSON.stringify(r4 && { hits: r4.hits, per: r4.per }));

  // A5：宿傩在**身后**、魔虚罗在身前 —— lunge 必须朝魔虚罗冲
  const A5 = '(() => { var r = window.__X.lungeProbe({ px: 0, pz: 0, sx: 0, sz: -20, mx: 0, mz: 3 }); if (r.err) return r; return r; })()';
  const r5 = await b.evaluate(A5);
  info('A5 lunge 方向（宿傩在身后 / 魔虚罗在身前3m）', r5);
  check('A5 前冲位移朝魔虚罗而不是宿傩', r5 && r5.projMaho > 0 && r5.projSukuna <= 0.01, JSON.stringify(r5));
  check('A5 这一拳打到了', r5 && r5.mahoDmg > 0, JSON.stringify(r5));

  // A6：同一几何下一个弱点窗口能打几下（真实几何：宿傩在背后）
  const A6 = '(() => { var p = window.__X.prep({ px: 0, pz: 0, sx: 0, sz: -20, mx: 0, mz: 3 }); if (p.err) return p; window.__X.calm(); return window.__X.burst(); })()';
  const r6 = await b.evaluate(A6);
  info('A6 弱点窗口内连击（宿傩在身后 20m）', r6);
  check('A6 一个窗口至少打出 2 下', r6 && r6.hits >= 2, JSON.stringify(r6));

  // A7：赫 打空中魔虚罗（Q 锁定）—— 这是 HUD 提示里给玩家的对策，必须真的有效
  // 魔虚罗不 pin（留在绕宿傩的航线上），宿傩在 -9m，玩家在原点
  const A7 = '(() => { var p = window.__X.prep({ px: 0, pz: 0, sx: 0, sz: -9, mx: 0, mz: -9, airborne: true, pin: false }); if (p.err) return p; window.__X.calm(); return window.__X.castAt("red", 4, true); })()';
  const r7 = await b.evaluate(A7);
  info('A7 赫 ×3 打空中魔虚罗（锁定）', r7);
  check('A7 赫 能打到空中魔虚罗（HUD 承诺的对策）', r7 && r7.total > 0, JSON.stringify(r7 && { per: r7.per, total: r7.total, adapt: r7.adapt, aimAir: r7.aimAir }));

  head('B · 领域对拼结算说真话');
  const cw = await clashCase(true);
  info('B1 玩家 5/5 同步取胜（tug=0）', cw);
  check('B1 主循环进入了领域状态', !!cw && cw.enteredState === 'clash', JSON.stringify(cw && cw.enteredState));
  check('B1 duel.winner === gojo', !!cw && cw.winner === 'gojo', JSON.stringify(cw && cw.winner));
  check('B1 snap.clashWinner === gojo（权威胜负进了快照）', !!cw && cw.snapWinner === 'gojo', JSON.stringify(cw && cw.snapWinner));
  check('B1 横幅说的是赢而不是被击破', !!(cw && cw.domBanner) && String(cw.domBanner).indexOf('领域胜利') >= 0 && !/被击破|崩坏|碎裂/.test(String(cw.domBanner)), String(cw && cw.domBanner));
  check('B1 整屏结算面板写着「领域胜利」', !!(cw && cw.resultPanel) && cw.resultPanel.cls.indexOf('win') === 0 && cw.resultPanel.title === '领域胜利', JSON.stringify(cw && cw.resultPanel && { cls: cw.resultPanel.cls, title: cw.resultPanel.title, vs: cw.resultPanel.vs, line: cw.resultPanel.line }));
  await b.screenshot(SHOTS + '/b-clash-win.png');
  await b.screenshot(SHOTS + '/b-win-close.png', { clip: await b.evaluate('window.__X.clipCenter(900, 330)') });

  const cl = await clashCase(false);
  info('B2 玩家 3 次失误落败', cl);
  check('B2 duel.winner === sukuna', !!cl && cl.winner === 'sukuna', JSON.stringify(cl && cl.winner));
  check('B2 横幅说的是输', !!(cl && String(cl.domBanner || '').indexOf('领域败北') >= 0), String(cl && cl.domBanner));
  check('B2 整屏结算面板写着「领域败北」', !!(cl && cl.resultPanel) && cl.resultPanel.cls.indexOf('lose') === 0 && cl.resultPanel.title === '领域败北', JSON.stringify(cl && cl.resultPanel && { cls: cl.resultPanel.cls, title: cl.resultPanel.title, vs: cl.resultPanel.vs, line: cl.resultPanel.line }));
  await b.screenshot(SHOTS + '/b-lose-close.png', { clip: await b.evaluate('window.__X.clipCenter(900, 330)') });

  head('C · 结算面板的收尾（独立验证 A9/A11/A12 抓到的）');
  const C1 = await b.evaluate(async function () {
    var S = window.__SS, c = S.combat, cb = S.mahoraga.cb();
    c.setAiEnabled(false); c.reset();
    await new Promise(function (r) { setTimeout(r, 150); });
    cb.fighters.gojo.domain = 100; cb.fighters.sukuna.domain = 100;
    c.domains.open('gojo'); c.domains.open('sukuna');
    var t0 = Date.now();
    while (Date.now() - t0 < 4000 && !c.domains.clash.active) await new Promise(function (r) { setTimeout(r, 30); });
    var tA = Date.now();
    while (Date.now() - tA < 1500 && S.state !== 'clash') await new Promise(function (r) { setTimeout(r, 16); });
    c.domains.clash.sync = 5;
    var t1 = Date.now();
    while (Date.now() - t1 < 2500 && c.domains.clash.active) await new Promise(function (r) { setTimeout(r, 16); });
    await new Promise(function (r) { setTimeout(r, 260); });
    var el = document.getElementById('duel-result');
    var shown = el ? { cls: el.className, display: el.style.display } : null;
    c.reset();                                   // ← 上一轮 A9：这一步清不掉面板
    await new Promise(function (r) { setTimeout(r, 120); });
    var el2 = document.getElementById('duel-result');
    var afterReset = el2 ? { cls: el2.className, display: el2.style.display } : null;
    await new Promise(function (r) { setTimeout(r, 900); });
    var el3 = document.getElementById('duel-result');
    var after900 = el3 ? { cls: el3.className, display: el3.style.display } : null;
    return { shown: shown, afterReset: afterReset, after900: after900 };
  });
  info('C1 结算面板 → combat.reset()', C1);
  check('C1 结算时面板确实出现', !!(C1 && C1.shown && C1.shown.cls.indexOf('on') >= 0), JSON.stringify(C1 && C1.shown));
  check('C1 reset 后 120ms 面板已清掉', !!(C1 && C1.afterReset && C1.afterReset.cls === '' && C1.afterReset.display === 'none'), JSON.stringify(C1 && C1.afterReset));
  check('C1 reset 后 1s 仍然清着（不残留）', !!(C1 && C1.after900 && C1.after900.cls === '' && C1.after900.display === 'none'), JSON.stringify(C1 && C1.after900));

  const bad = R.filter(function (x) { return !x.ok; });
  console.log('\n==== 汇总 ' + (R.length - bad.length) + '/' + R.length + ' PASS ====');
  for (const x of bad) console.log('  FAIL ' + x.name);
} catch (e) {
  console.error('探针异常：', (e && e.stack) || e);
  process.exitCode = 1;
} finally {
  await b.close();
}

/* ============================================================================
 * --shot2：实时取景（不是帧步进）—— 让召唤 callout 自然消散后再截弱点窗口
 * ========================================================================== */
if (process.argv.includes('--shot2')) {
  try {
    await b.launch();
    await b.newPage();
    await b.send('Page.navigate', { url: URL });
    await nap(13000);
    await b.evaluate('(() => { const el = document.getElementById("btn-skip-cine"); if (el) el.click(); return true; })()');
    for (let i = 0; i < 80; i++) { await nap(400); if (await b.evaluate('window.__SS && window.__SS.state') === 'fight') break; }
    await b.evaluate(PAGE);
    const setup = await b.evaluate(async function () {
      var S = window.__SS, cb = S.mahoraga.cb(), X = window.__X;
      var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      var until = async function (st, ms) {
        var t = Date.now();
        while (Date.now() - t < ms) { if (S.mahoraga.debug().state === st) return true; await wait(60); }
        return false;
      };
      S.combat.setAiEnabled(false);
      S.combat.reset();
      await wait(200);
      X.put('gojo', 0, 0); X.put('sukuna', 0, 40);
      cb.fighters.sukuna.hp = cb.fighters.sukuna.hpMax * 0.5;
      var okAir = await until('air', 9000);
      await wait(4200);                                     // 召唤横幅 / 大字 callout 自然消散
      S.mahoraga.freeze(true);
      var okIdle = await until('air', 6000);                 // 等它把手上那一招放完（放招中 force 会被拒）
      // pin=true 才不会在 0.8s 前摇里漂走（mahoUpdateAir 遇到 pin 就不动）
      S.mahoraga.setPos(0, 5.0, 0, true);
      var forced = S.mahoraga.force('dive');
      var okDown = await until('down', 6000);
      S.mahoraga.setPos(0, 0, 0, true);                      // 钉住落点
      X.put('gojo', 0, 3); X.put('sukuna', 0, 40);           // 玩家退到 3m 外（贴近战射程上限）
      X.calm();
      var st = S.mahoraga.debug();
      return { okAir: okAir, okIdle: okIdle, forced: forced, okDown: okDown, state: st.state,
        aim: st.aim, pos: st.pos, weakT: st.weakT, gap: X.gap('gojo', true) };
    });
    info('shot2 setup', setup);
    await b.screenshot(SHOTS + '/c-weak-window-live.png');
    await b.screenshot(SHOTS + '/c-weak-close.png', { clip: await b.evaluate('window.__X.clipMaho(460)') });
    // 真按键：CDP 发 J，看普攻是不是打在魔虚罗身上
    await b.pressKey('KeyJ', 60);
    await nap(280);
    const after = await b.evaluate('(() => { const d = window.__SS.mahoraga.debug(); return { hp: d.hp, aim: d.aim, weakT: d.weakT, state: d.state, banner: window.__SS.snap.banner }; })()');
    info('真按键 J 之后', after);
    await b.screenshot(SHOTS + '/c-weak-hit.png', { clip: await b.evaluate('window.__X.clipMaho(460)') });
    await b.screenshot(SHOTS + '/c-weak-hit-full.png');
    console.log('\n=== shot2 完成：看 ' + SHOTS + '/c-*.png ===');
  } catch (e) {
    console.error('shot2 异常：', (e && e.stack) || e);
    process.exitCode = 1;
  } finally {
    await b.close();
  }
}
