/**
 * verify-r5b.mjs —— 独立复验探针（第二轮 / round 5b）
 * ----------------------------------------------------------------------------
 * 复跑上一轮报告 reviews/16-verification-r5.md 点名的反例，判断是否真修好：
 *   A. lunge 方向：宿傩在玩家 后 / 前 / 侧，魔虚罗落地在身前 3m（+ 两个对照组）
 *   B. 弱点窗口命中率表（站着 / 推摇杆 / 贴脸 1.3m），与旧表并排
 *   C. A9 / A11 / A12 三条反例复跑 + 提示条还原
 *   D. 844x390 @DPR2 触屏：#duel-result 与 .t-tip.t-show 重叠面积 + 还原实证
 *   E. lunge 改动的新毛病搜索
 *
 * 用法：node _tools/verify-r5b.mjs --file tmp/lead/dist.html --port 9530 --portm 9531 --phase all
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg('file', 'tmp/lead/dist.html'));
const PORT = Number(arg('port', '9530'));
const PORTM = Number(arg('portm', '9531'));
const PHASE = arg('phase', 'all');
const SHOTS = arg('shots', 'shots/verify-round5b');
if (!existsSync(FILE)) { console.error('找不到产物 ' + FILE); process.exit(2); }
mkdirSync(SHOTS, { recursive: true });
const URLX = 'file:///' + FILE.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

const R = [];
function check(name, ok, detail) {
  R.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? '  -> ' + detail : ''));
}
function head(t) { console.log('\n=== ' + t + ' ==='); }
function info(tag, v) { console.log('    . ' + tag + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))); }

/* ==========================================================================
 * 页面侧辅助：真函数，靠 toString() 注入
 * ========================================================================== */
function pageFactory() {
  var S = window.__SS;
  var T = 0;
  var BTN = ["light", "heavy", "blue", "red", "purple", "heal", "dodge", "dash", "domain", "lockOn", "charge", "v"];
  function C() { return S.combat; }
  function CL() { return S.combat.domains.clash; }
  function CB() { return S.mahoraga.cb(); }
  function F(w) { return CB().fighters[w]; }
  function m() { return S.mahoraga.debug(); }
  function nap(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function r2(v) { return +(+v).toFixed(2); }
  function r3(v) { return +(+v).toFixed(3); }
  function mkInput(o) {
    var r = { moveX: 0, moveZ: 0, mouse: { pressed: false } };
    for (var i = 0; i < BTN.length; i++) r[BTN[i]] = false;
    if (o) { for (var k in o) r[k] = o[k]; }
    return r;
  }
  function step(o, n) {
    var c = C(); n = n || 1;
    for (var i = 0; i < n; i++) { T += 1 / 60; c.update(mkInput(o), 1 / 60, T); }
    return c.frame;
  }
  function put(w, x, z, y) {
    var c = F(w);
    if (c.ctrl && c.ctrl.setPos) c.ctrl.setPos(x, y || 0, z);
    c.p.set(x, y || 0, z);
    if (c.vel && c.vel.set) c.vel.set(0, 0, 0);
    return [r2(c.p.x), r2(c.p.z)];
  }
  function calm() {
    var pl = F('gojo');
    pl.hp = pl.hpMax; pl.ce = pl.ceMax;
    pl.stunT = 0; pl.invT = 0; pl.drvT = 0; pl.forcedInv = false; pl.burnoutT = 0;
    if (pl.vel && pl.vel.set) pl.vel.set(0, 0, 0);
    CB().hitstop = 0;
    return true;
  }
  function gp() { var p = F('gojo').p; return [r2(p.x), r2(p.z)]; }
  function gapM() { var p = F('gojo').p, q = m().pos; return r2(Math.hypot(p.x - q.x, p.z - q.z)); }
  function gapS() { var p = F('gojo').p, q = F('sukuna').p; return r2(Math.hypot(p.x - q.x, p.z - q.z)); }

  /* ---- 布场：与上一轮逐字一致，只在落定后再钉一次位置 ---- */
  function prepB(o) {
    var c = C();
    c.reset();
    c.setAiEnabled(false);
    put('gojo', o.px, o.pz);
    put('sukuna', o.sx, o.sz);
    F('sukuna').hp = F('sukuna').hpMax * 0.5;
    F('gojo').hp = F('gojo').hpMax;
    F('gojo').ce = F('gojo').ceMax;
    var i;
    for (i = 0; i < 1200 && m().state !== 'air'; i++) step(null, 1);
    if (m().state !== 'air') return { err: 'summon', state: m().state, alive: m().alive };
    S.mahoraga.freeze(true);
    S.mahoraga.setEvade(0);
    if (o.airborne) {
      S.mahoraga.setPos(o.mx, 5.0, o.mz, true);
      put('gojo', o.px, o.pz); put('sukuna', o.sx, o.sz); calm();
      return { ok: 'air', state: m().state, weakT: r2(m().weakT) };
    }
    S.mahoraga.setPos(o.px, 5.0, o.pz, false);
    S.mahoraga.force('dive');
    for (i = 0; i < 900 && m().state !== 'down'; i++) step(null, 1);
    if (m().state !== 'down') return { err: 'dive', state: m().state };
    S.mahoraga.setPos(o.mx, 0, o.mz, true);
    put('gojo', o.px, o.pz);
    put('sukuna', o.sx, o.sz);
    calm();
    return { ok: 'down', state: m().state, weakT: r2(m().weakT), attackable: m().attackable, mahoPos: [r2(m().pos.x), r2(m().pos.z)] };
  }
  /** 窗口结束后（down → ascend/air）把双方位置钉回去，用于对照组 */
  function prepAfterWindow(o) {
    var g = 0;
    while (m().state === 'down' && g++ < 400) step(null, 1);
    var stAfter = m().state;
    var g2 = 0;
    while (m().state === 'ascend' && g2++ < 400) step(null, 1);
    S.mahoraga.freeze(true);
    S.mahoraga.setPos(o.mx, 5.0, o.mz, true);
    put('gojo', o.px, o.pz);
    put('sukuna', o.sx, o.sz);
    C().reset();            // 清干净上一拳的连段/CD，保证对照组是「一记全新的普攻」
    C().setAiEnabled(false);
    put('gojo', o.px, o.pz); put('sukuna', o.sx, o.sz);
    put('gojo', o.px, o.pz); put('sukuna', o.sx, o.sz);
    calm();
    var p = F('gojo');
    p.chain = 0; p.chainT = 0; p.buf = null; p.bufT = 0;
    if (p.cds && p.cds.clear) p.cds.clear();
    return { state: stAfter, state2: m().state, weakT: r2(m().weakT), gapM: gapM(), gapS: gapS() };
  }

  /* ---- A 段：lunge 方向逐帧 ---- */
  function proj(dx, dz, x0, z0, tgt) {
    var ex = tgt.x - x0, ez = tgt.z - z0;
    var L = Math.hypot(ex, ez) || 1;
    return r3((dx * ex + dz * ez) / L);
  }
  function lungeTrace(o) {
    var mv = o.mv || { moveX: 0, moveZ: 0 };
    var p0 = F('gojo').p, x0 = p0.x, z0 = p0.z;
    var suk = { x: F('sukuna').p.x, z: F('sukuna').p.z };
    var mah = { x: m().pos.x, z: m().pos.z };
    var hp0 = m().hp, sk0 = F('sukuna').hp;
    var calls0 = m().hookCalls.meleeAim, off0 = m().aim.offered;
    var st0 = m().state, w0 = m().weakT;
    var lunge = null, trace = [], hitFrame = -1, px = x0, pz = z0;
    var n = o.n || 30;
    for (var k = 0; k < n; k++) {
      var inp = { light: k < 2, heavy: !!o.heavy && k < 2, moveX: mv.moveX, moveZ: mv.moveZ };
      if (o.startAt === k) inp = { light: true, moveX: mv.moveX, moveZ: mv.moveZ };
      var bx = F('gojo').p.x, bz = F('gojo').p.z;
      var fr = step(inp, 1);
      var ax = F('gojo').p.x, az = F('gojo').p.z;
      var dd = Math.hypot(ax - bx, az - bz);
      if (dd > 1e-4 && !lunge) {
        lunge = { frame: k, dt: r2(dd), stepGameFrame: fr, state: m().state, weakT: r2(m().weakT),
          distBefore: r2(Math.hypot(bx - mah.x, bz - mah.z)), distToSuk: r2(Math.hypot(bx - suk.x, bz - suk.z)),
          gapAfter: r2(Math.hypot(ax - mah.x, az - mah.z)) };
      }
      if (m().hp < hp0 && hitFrame < 0) hitFrame = k;
      trace.push([k, r2(Math.hypot(F('gojo').p.x - mah.x, F('gojo').p.z - mah.z)),
        r2(Math.hypot(F('gojo').p.x - suk.x, F('gojo').p.z - suk.z)), r2(hp0 - m().hp), r2(m().weakT), m().state,
        r2(Math.hypot(F('gojo').p.x - px, F('gojo').p.z - pz))]);
      px = F('gojo').p.x; pz = F('gojo').p.z;
    }
    var x1 = F('gojo').p.x, z1 = F('gojo').p.z;
    var dx = x1 - x0, dz = z1 - z0;
    var a2 = CB().runner.current('gojo');
    return {
      state: st0, weakT0: r2(w0), gapM0: r2(Math.hypot(x0 - mah.x, z0 - mah.z)), gapS0: r2(Math.hypot(x0 - suk.x, z0 - suk.z)),
      moved: r2(Math.hypot(dx, dz)), projSukuna: proj(dx, dz, x0, z0, suk), projMaho: proj(dx, dz, x0, z0, mah),
      lunge: lunge, hitFrame: hitFrame, gapAtHit: hitFrame >= 0 ? trace[hitFrame][1] : null,
      gapEnd: trace.length ? trace[trace.length - 1][1] : null,
      maho: r2(hp0 - m().hp), suk: r2(sk0 - F('sukuna').hp),
      hookDelta: { calls: m().hookCalls.meleeAim - calls0, offered: m().aim.offered - off0 },
      aim: m().aim, fwd: a2 ? [r2(a2.forward.x), r2(a2.forward.z)] : null,
      actRange: a2 ? r2(a2.flow.range) : null,
      face: (function () {
        var f = F('gojo').ctrl.root.rotation.y;
        var ym = Math.atan2(mah.x - F('gojo').p.x, mah.z - F('gojo').p.z);
        function ad(a, b) { var d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }
        return { yaw: r3(f), toMaho: r3(ym), toSuk: r3(Math.atan2(suk.x - F('gojo').p.x, suk.z - F('gojo').p.z)), errMaho: r3(ad(f, ym)) };
      })(),
      trace: trace
    };
  }
  function scenario2(o) {
    var r = prepB(o);
    if (r.err) return r;
    var base = { prep: r, gapS: gapS(), gapM: gapM() };
    var t = lungeTrace(o);
    return { prep: r, gapS: base.gapS, gapM: base.gapM, lunge: t };
  }
  function afterWindow(o) {
    var r = prepB(o);
    if (r.err) return r;
    var pw = prepAfterWindow(o);
    var t = lungeTrace({ n: o.n || 30, mv: o.mv });
    return { prep: r, afterWin: pw, lunge: t };
  }

  /* ---- B 段：1.6s 弱点窗口命中率 ---- */
  function windowRun(o) {
    o = o || {};
    var per = [], gaps = [], frames = [], guard = 0, f0 = null;
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var w0 = m().weakT, st0 = m().state;
    var hp0 = m().hp, sk0 = F('sukuna').hp;
    while (m().state === 'down' && guard++ < 14) {
      var mv = o.auto === 'toward' ? towardInput() : (o.mv || { moveX: 0, moveZ: 0 });
      var g0 = gapM(), h0 = m().hp, s0 = F('sukuna').hp;
      var c0 = m().hookCalls.meleeAim, a0 = m().aim.offered;
      var p0 = [F('gojo').p.x, F('gojo').p.z];
      var hitAt = -1;
      for (var k = 0; k < 30; k++) {
        step({ light: k < 2, heavy: !!o.heavy && k < 2, moveX: mv.moveX, moveZ: mv.moveZ }, 1);
        if (hitAt < 0 && m().hp < h0) hitAt = k;
      }
      var p1 = [F('gojo').p.x, F('gojo').p.z];
      var dx = p1[0] - p0[0], dz = p1[1] - p0[1];
      per.push(r2(h0 - m().hp));
      frames.push(hitAt);
      gaps.push([g0, gapM()]);
    }
    var dmg = per.filter(function (x) { return x > 0; });
    return {
      attempts: per.length, per: per, hits: dmg.length,
      total: r2(dmg.reduce(function (a, c) { return a + c; }, 0)),
      hitFrames: frames, gaps: gaps, sukTotal: r2(sk0 - F('sukuna').hp),
      wallMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
      weakT0: r2(w0), st0: st0, ended: m().state, hp: r2(m().hp), hpMax: m().hpMax,
      windowsFor900: null
    };
  }
  function windowRun2(o) {
    var r = prepB(o);
    if (r.err) return r;
    calm();
    var q = windowRun(o);
    q.windowsFor900 = q.total > 0 ? Math.ceil(900 / q.total) : null;
    q.prep = r;
    return q;
  }
  function towardInput() {
    var p = F('gojo').p, q = m().pos;
    var dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    return { moveX: +(dx / L).toFixed(3), moveZ: +(dz / L).toFixed(3) };
  }
  function awayInput() { var a = towardInput(); return { moveX: -a.moveX, moveZ: -a.moveZ }; }

  /* ---- C 段：结算面板生命周期 ---- */
  async function duelArm() {
    var c = C();
    c.setAiEnabled(false);
    c.reset();
    await nap(150);
    var cb = CB();
    if (cb.ai) { cb.ai.difficulty = 0; }
    F('gojo').burnoutT = 0; F('sukuna').burnoutT = 0;
    F('gojo').domain = 100; F('sukuna').domain = 100;
    F('gojo').hp = F('gojo').hpMax; F('sukuna').hp = F('sukuna').hpMax;
    c.domains.open('gojo');
    c.domains.open('sukuna');
    var t0 = Date.now();
    while (Date.now() - t0 < 4000 && !CL().active) await nap(20);
    var t1 = Date.now();
    while (Date.now() - t1 < 2500 && S.state !== 'clash') await nap(16);
    return { clashActive: CL().active, state: S.state };
  }
  function readDuel() {
    var res = document.getElementById('duel-result');
    var el = document.getElementById('banner');
    var cs = res ? getComputedStyle(res) : null;
    var q = function (sel) { var n = res ? res.querySelector(sel) : null; return n ? (n.textContent || '').trim() : null; };
    return {
      winner: CL().winner, tug: r3(CL().tug), active: CL().active, state: S.state,
      snapWinner: S.snap.clashWinner, snapBanner: S.snap.banner,
      bannerDom: el ? (el.textContent || '').trim() : null,
      panel: res ? { cls: res.className, display: res.style.display, opacity: cs.opacity,
        title: q('.dr-title'), vs: q('.dr-vs'), line: q('.dr-line'), hint: q('.dr-hint') } : null
    };
  }
  async function duelFire(o) {
    var d = CL();
    d.freezeT = 5;
    if (o.life != null) d.life = o.life;
    d.tug = o.tug;
    if (o.force === 'sync') d.sync = 5;
    else if (o.force === 'miss') d.miss = 3;
    var first = null, t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      await nap(6);
      var s = S.snap;
      if (s && s.clashActive === false) {
        first = { snapWinner: s.clashWinner, tugAtResolve: r3(d.tug), life: r3(d.life), ms: Date.now() - t0 };
        break;
      }
    }
    await nap(450);
    var out = readDuel();
    out.atResolve = first;
    return out;
  }
  function tipState() {
    var el = document.getElementById('t-tip');
    if (!el) return { exists: false };
    var cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { exists: true, cls: el.className, show: el.classList.contains('t-show'), opacity: +(+cs.opacity).toFixed(2),
      display: cs.display, visibility: cs.visibility, text: (el.textContent || '').slice(0, 40),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), rt: Math.round(r.right) } };
  }
  /** 面板与提示条的重叠 + 双方状态（还原实证用） */
  function panelGeom() {
    function R(e) { if (!e) return null; var r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), rt: Math.round(r.right) }; }
    var res = document.getElementById('duel-result');
    var box = res ? res.querySelector('.dr-box') : null;
    var tip = document.getElementById('t-tip');
    var br = R(box), tr = R(tip);
    function ov(a, c) { if (!a || !c) return 0; var ox = Math.max(0, Math.min(a.rt, c.rt) - Math.max(a.x, c.x)); var oy = Math.max(0, Math.min(a.b, c.b) - Math.max(a.y, c.y)); return Math.round(ox * oy); }
    var tcs = tip ? getComputedStyle(tip) : null;
    var rcs = res ? getComputedStyle(res) : null;
    return {
      state: S.state, panelCls: res ? res.className : null, panelOpacity: rcs ? +(+rcs.opacity).toFixed(2) : null,
      panelDisplay: res ? res.style.display : null, panelZ: rcs ? rcs.zIndex : null,
      tipCls: tip ? tip.className : null, tipOpacity: tcs ? +(+tcs.opacity).toFixed(2) : null,
      tipShow: tip ? tip.classList.contains('t-show') : null,
      box: br, tip: tr, ovBox: ov(br, tr), ovAny: (rcs && rcs.display !== 'none' && +rcs.opacity > 0.01 ? ov(R(res), tr) : 0),
      tipText: tip ? (tip.textContent || '').slice(0, 40) : null,
      domCount: document.querySelectorAll('#duel-result').length
    };
  }
  /** 给提示条人为上 t-show（重现「教学提示正在显示」这一状态），不碰别的 */
  /** 装一个钩子，记录 .t-tip 的 class 每一次被谁改（含调用栈首行） */
  function tipWatchStart() {
    var el = document.getElementById('t-tip');
    if (!el) return { exists: false };
    if (el.__v5bObs) return { exists: true, already: true };
    var log = [];
    var obs = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        log.push({ t: Date.now(), oldV: ms[i].oldValue, newV: el.className });
      }
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    el.__v5bObs = obs; el.__v5bLog = log;
    return { exists: true, watching: true };
  }
  function tipWatchRead() {
    var el = document.getElementById('t-tip');
    if (!el || !el.__v5bLog) return null;
    return el.__v5bLog.slice();
  }
  function tipForce() {
    var el = document.getElementById('t-tip');
    if (!el) return { exists: false };
    el.classList.add('t-show');
    return { exists: true, cls: el.className, opacity: +(+getComputedStyle(el).opacity).toFixed(2) };
  }
  async function resetResidue() {
    var res = document.getElementById('duel-result');
    var before = { cls: res.className, disp: res.style.display, tip: tipState() };
    C().reset();
    await nap(60);
    var at60 = { cls: res.className, disp: res.style.display, op: +(+getComputedStyle(res).opacity).toFixed(2), state: S.state, tip: tipState() };
    await nap(900);
    var at960 = { cls: res.className, disp: res.style.display, op: +(+getComputedStyle(res).opacity).toFixed(2), state: S.state, tip: tipState() };
    return { before: before, at60: at60, at960: at960 };
  }
  function resState() {
    var res = document.getElementById('duel-result');
    var cs = getComputedStyle(res);
    var rr = res.getBoundingClientRect();
    return { state: S.state, cls: res.className, disp: res.style.display, op: +(+cs.opacity).toFixed(2), z: cs.zIndex,
      rect: { x: Math.round(rr.left), y: Math.round(rr.top), w: Math.round(rr.width), h: Math.round(rr.height) }, tip: tipState() };
  }
  /** 结算面板的内部计时器（DomainDuelHud.resT）与元素状态一起读，用来定位"面板不收"的根因 */
  function panelProbe() {
    var res = document.getElementById('duel-result');
    var cs = res ? getComputedStyle(res) : null;
    // DomainDuelHud 是 bundle 作用域里的局部变量（src/domainduel.js:107 var），window 上没有，
    // 所以 resT 探针在页面里拿不到 —— 这里如实报 null，别假装读到了。
    var H = (typeof DomainDuelHud !== 'undefined') ? DomainDuelHud : null;
    return { state: S.state, resT: H ? +(+H.resT).toFixed(3) : null, tipHeld: H ? !!H._tipHeld : null,
      cls: res ? res.className : null, disp: res ? res.style.display : null, op: cs ? +(+cs.opacity).toFixed(2) : null,
      duelActive: CL() ? !!CL().active : null, hudHold: CL() ? +(+CL()._hudHold || 0).toFixed(2) : null,
      frame: C().frame };
  }
  /**
   * 直接用生产 API 打开结算面板（window.__DUEL 是 domainduel.js 自己挂的探针句柄），
   * 再看它会不会自己收。这样能把"面板 3s 生命周期"和主循环 tick 分开测。
   */
  async function panelApiTest(ms) {
    var d = window.__DUEL;
    if (!d || typeof d.result !== 'function') return { err: 'no __DUEL.result', has: !!d };
    var before = panelProbe();
    var err = null;
    try { d.result({ kind: 'win', sync: 5, miss: 0, elapsed: 1.2, dmg: 100, burnout: 6.0, byTime: false }); }
    catch (e) { err = String((e && e.message) || e); }
    var at0 = Object.assign({ t: 0 }, panelProbe());
    var rows = [], t0 = Date.now(), clearedAt = null;
    while (Date.now() - t0 < (ms || 4000)) {
      var p = Object.assign({ t: Date.now() - t0 }, panelProbe());
      rows.push(p);
      if (clearedAt === null && p.cls === '' && p.disp === 'none') clearedAt = p.t;
      await nap(120);
    }
    return { before: before, at0: at0, err: err, clearedAt: clearedAt, rows: rows };
  }
  async function sampleStates(ms, every) {
    var t0 = Date.now(), out = [];
    while (Date.now() - t0 < ms) { out.push(Object.assign({ t: Date.now() - t0 }, resState())); await nap(every || 150); }
    return out;
  }
  /**
   * 只记录**变化**的时间线：面板 class / 游戏 state / 拉锯是否 active。
   * 用来看"面板到底有没有在某个瞬间被清掉又回来"，比每 200ms 盲采可靠。
   */
  async function traceChanges(ms) {
    var t0 = Date.now(), out = [], last = null;
    while (Date.now() - t0 < ms) {
      var res = document.getElementById('duel-result');
      var cur = [res ? res.className : '?', res ? res.style.display : '?', S.state, CL() ? (CL().active ? 1 : 0) : '?', CL() ? CL().winner : '?', C().frame].join('|');
      if (cur !== last) { out.push({ t: Date.now() - t0, cls: res ? res.className : '?', disp: res ? res.style.display : '?', state: S.state, active: CL() ? !!CL().active : null, winner: CL() ? CL().winner : null, frame: C().frame }); last = cur; }
      await nap(25);
    }
    return out;
  }
  async function clickThen(sel, ms) {
    var el = document.querySelector(sel);
    if (!el) return { err: 'no-btn ' + sel };
    el.click();
    await nap(ms || 500);
    return { clicked: sel, after: resState() };
  }
  /**
   * 高分辨率盯提示条：面板消失的瞬间它的 t-show / opacity 到底怎么变。
   * 200ms 一次太粗，会在 CSS 0.35s 过渡里正好采到中间值，看不出"到底有没有被还原"。
   */
  async function tipTrace(ms) {
    var el = document.getElementById('t-tip');
    if (!el) return { exists: false };
    var t0 = Date.now(), rows = [];
    while (Date.now() - t0 < ms) {
      var cs = getComputedStyle(el);
      rows.push({ t: Date.now() - t0, show: el.classList.contains('t-show'), op: +(+cs.opacity).toFixed(2),
        cls: el.className, resCls: (document.getElementById('duel-result') || {}).className });
      await nap(40);
    }
    return { exists: true, rows: rows };
  }
  /** 点「直接进入战斗」并等回 fight（C 段夹具需要，避免停在 cutscene 上误判） */
  async function skipToFight(maxMs) {
    var t0 = Date.now();
    while (Date.now() - t0 < (maxMs || 15000)) {
      if (S.state === 'fight') return { state: S.state, ms: Date.now() - t0, skipped: false };
      var el = document.getElementById('btn-skip-cine');
      if (el) el.click();
      await nap(250);
    }
    return { state: S.state, ms: Date.now() - t0, skipped: true, timeout: true };
  }
  function sys() { return { state: S.state, frame: C().frame, hpMax: m().hpMax, mech: Object.keys(S.mech()) }; }
  function mdev() { return m(); }

  /* ---- E 段：新毛病搜索 ---- */
  /** 连续出招时的「卡住」检测：每招后量与魔虚罗的水平距离，看是否被顶在 1.7m 之外 */
  /**
   * 独立测量：不挥拳，只朝魔虚罗走 —— 看「贴脸」到底能贴多近。
   * 用来判断 E1 里 <1.2m 的间距是 lunge 造成的，还是走位本身就能压进去的（与本次改动无关）。
   */
  function walkInto(o) {
    var r = prepB(o);
    if (r.err) return r;
    calm();
    var mins = [], rows = [], g = 0;
    var p = F('gojo');
    p.hp = p.hpMax; p.ce = p.ceMax;
    var hp0 = m().hp;
    for (var k = 0; k < 90; k++) {
      var mv = towardInput();
      step({ moveX: mv.moveX, moveZ: mv.moveZ }, 1);
      var d = gapM();
      rows.push([k, d]);
      if (mins.length === 0 || d < mins[0]) mins = [d, k];
    }
    return { startGap: r.weakT != null ? null : null, minGap: mins[0], minAtFrame: mins[1], endGap: gapM(),
      mahoDmg: r2(hp0 - m().hp), state: m().state, weakT: r2(m().weakT), trace: rows, prep: r };
  }
  function stickRun(o) {
    o = o || {};
    var rows = [], p = F('gojo'), guard = 0;
    var hp0 = m().hp;
    var mv = o.auto === 'toward' ? towardInput() : (o.mv || { moveX: 0, moveZ: 0 });
    while (m().state === 'down' && guard++ < 10) {
      var g0 = gapM(), p0 = [F('gojo').p.x, F('gojo').p.z], h0 = m().hp;
      for (var k = 0; k < 30; k++) step({ light: k < 2, moveX: mv.moveX, moveZ: mv.moveZ }, 1);
      var p1 = [F('gojo').p.x, F('gojo').p.z];
      rows.push({ g0: g0, g1: gapM(), dmg: r2(h0 - m().hp), moved: r2(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])),
        inside: gapM() < 0.6, state: m().state, w: r2(m().weakT) });
    }
    var mins = rows.map(function (x) { return x.g1; });
    return { rows: rows, minGap: mins.length ? Math.min.apply(null, mins) : null, endGap: gapM(),
      totalDmg: r2(hp0 - m().hp), mahoHp: r2(m().hp), mahoHpMax: m().hpMax, state: m().state, attempts: rows.length };
  }
  /** AI 侧（宿傩）普攻是否也吃这个钩子：看 hookDelta 与 sukuna 动作朝向 */
  function aiPunchTrace(o) {
    o = o || {};
    var calls0 = m().hookCalls.meleeAim, off0 = m().aim.offered;
    var p0 = [F('sukuna').p.x, F('sukuna').p.z];
    var g0 = gapM();
    var sk = null;
    try { sk = CB().runner.current('gojo'); } catch (e) { /* 忽略 */ }
    var started = CB().runner.start('sukuna', 'punch', { force: true });
    var nf = CB().runner.current('sukuna') ? CB().runner.current('sukuna').flow.skill : null;
    var playerAct = CB().runner.current('gojo');
    for (var k = 0; k < 30; k++) step(null, 1);
    return { started: !!started, sukSkill: nf, playerActDuring: playerAct ? playerAct.flow.skill : null,
      sukMoved: r2(Math.hypot(F('sukuna').p.x - p0[0], F('sukuna').p.z - p0[1])),
      hookCalls: m().hookCalls.meleeAim - calls0, offered: m().aim.offered - off0,
      gapM0: g0, gapM1: gapM(), mahoHp: r2(m().hp) };
  }
  /** 真按键（CDP）在真实主循环下的窗口输出：探针只负责读数 */
  function armWindow(o) {
    var r = prepB(o);
    if (r.err) return r;
    calm();
    window.__V5B_SNAP = { hp0: m().hp, t0: Date.now(), frames: C().frame, gaps: [] };
    return { ok: true, state: m().state, weakT: r2(m().weakT), gapM: gapM(), gapS: gapS(), hp: r2(m().hp) };
  }
  /** 真按键窗口：布场后立刻清 CD/连段，返回地板快照（不冻结主循环，用于真实输入） */
  function armWindow2(o) {
    var r = prepB(o);
    if (r.err) return r;
    calm();
    var p = F('gojo');
    p.chain = 0; p.chainT = 0; p.buf = null; p.bufT = 0;
    if (p.cds && p.cds.clear) p.cds.clear();
    window.__V5B_SNAP = { hp0: m().hp, frames: C().frame, weak0: m().weakT, t0: Date.now(), snaps: [] };
    return { ok: true, state: m().state, weakT: r2(m().weakT), gapM: gapM(), gapS: gapS(), hp: r2(m().hp),
      frame0: C().frame, chain: p.chain, cd: null };
  }
  function snapWindow(tag) {
    var s = window.__V5B_SNAP;
    if (!s) return null;
    var o = { tag: tag, t: Date.now() - s.t0, frames: C().frame - s.frames, hp: r2(m().hp), dmg: r2(s.hp0 - m().hp),
      weakT: r2(m().weakT), state: m().state, gapM: gapM(), aim: m().aim };
    s.snaps.push(o);
    return o;
  }
  function readWindow() {
    var s = window.__V5B_SNAP || {};
    return { hp0: s.hp0, hp: r2(m().hp), dmg: r2(s.hp0 - m().hp), ms: Date.now() - s.t0, frames: C().frame - s.frames,
      state: m().state, weakT: r2(m().weakT), gapM: gapM(), aim: m().aim, hookCalls: m().hookCalls.meleeAim };
  }
  /**
   * 主循环活着时的「每帧动作轨迹」：真正回答「一个窗口能出几招」。
   * 用动作 id（runner.seq 递增）去重数出招次数，比按 28 帧周期推算可靠。
   */
  async function traceLoop(ms) {
    var s = window.__V5B_SNAP || (window.__V5B_SNAP = { hp0: m().hp, frames: C().frame, t0: Date.now(), snaps: [] });
    var rows = [], t0 = Date.now(), seq0 = CB().runner.seq, hpPrev = m().hp;
    var uniq = {}, n = 0;
    while (Date.now() - t0 < ms) {
      var a = CB().runner.current('gojo');
      var id = a ? a.id : 0;
      var skill = a ? a.flow.skill : null;
      var hp = m().hp;
      rows.push({ t: Date.now() - t0, f: C().frame, id: id, skill: skill, hp: r2(hp),
        dmg: r2(hpPrev - hp), st: m().state, w: r2(m().weakT), gap: gapM() });
      hpPrev = hp;
      if (id) { var k = String(id); if (!uniq[k]) { uniq[k] = 1; n++; } }
      // 必须让出事件循环，否则 rAF 主循环被这个采样循环饿死，量到的就不是真实帧率下的行为
      await nap(4);
    }
    return { rows: rows, distinctActions: n, seq0: seq0, seq1: CB().runner.seq, ms: Date.now() - t0 };
  }

  /* ---- 主循环 rAF 冻结/恢复：让「合成 1/60 步进」不被真实 rAF 帧污染 ---- */
  /**
   * ⚠ 第一版这里把 window.requestAnimationFrame 直接换成空函数，结果**主循环永久死掉**：
   * loop2 只在被回调时才重新 requestAnimationFrame(loop2)，没有外部心跳就再也醒不过来
   * （实测还原后 combat.frame 增量恒为 0，B5/B6 真按键全空）。改成"照常排下一帧、但不执行回调"。
   */
  function freeze() {
    window.__V5B_NAT = window.__V5B_NAT || window.requestAnimationFrame;
    var nat = window.__V5B_NAT;
    window.__V5B_FREEZE = true;
    if (!window.__V5B_WRAP) {
      window.__V5B_WRAP = function (cb) {
        return nat.call(window, function (ts) {
          if (window.__V5B_FREEZE) {
            // 冻结：不执行这一帧的活，但把**调度**照原样传下去 —— 主循环的心跳因此不会断
            return window.__V5B_WRAP(cb);
          }
          cb(ts);
        });
      };
      window.requestAnimationFrame = window.__V5B_WRAP;
    }
    return { frozen: window.requestAnimationFrame === window.__V5B_WRAP, flag: window.__V5B_FREEZE };
  }
  /**
   * ⚠ 千万不要在这里把 window.requestAnimationFrame 换回别的函数：
   * 主循环 loop2 在**进入函数体之前**就拿着上一次的引用去 requestAnimationFrame(loop2)，
   * 换引用会让"新排进来的那个回调"进旧闭包、而旧闭包已经被判定失效 —— 主循环直接断掉
   * （实测 combat.frame 增量恒为 0）。只翻标志位，包装函数永久留着，透传行为与原生一致。
   */
  function restore() {
    window.__V5B_FREEZE = false;
    return { restored: !window.__V5B_FREEZE, flag: window.__V5B_FREEZE, wrapped: window.requestAnimationFrame === window.__V5B_WRAP };
  }
  function rAFState() {
    return { overridden: window.requestAnimationFrame === window.__V5B_WRAP, flag: !!window.__V5B_FREEZE,
      own: Object.prototype.hasOwnProperty.call(window, 'requestAnimationFrame'), calls: window.__V5B_CALLS || 0,
      lastCb: typeof window.__V5B_LAST, hasOrig: !!window.__V5B_ORIG };
  }
  /** 装一个原生 rAF 探针：每帧记一次（同时暴露给页面自己看，方便定位主循环是否还在被调度） */
  function installProbe() {
    if (window.__V5B_PROBED) return { already: true };
    window.__V5B_PROBED = true;
    window.__V5B_CALLS = 0;
    var nat = window.requestAnimationFrame;
    window.__V5B_NAT = nat;
    window.requestAnimationFrame = function (cb) {
      window.__V5B_CALLS++;
      return nat.call(window, function (ts) { window.__V5B_LASTTS = ts; cb(ts); });
    };
    return { installed: true, own: Object.prototype.hasOwnProperty.call(window, 'requestAnimationFrame') };
  }
  function probeRead() {
    return { calls: window.__V5B_CALLS || 0, lastTs: window.__V5B_LASTTS || 0, frozen: !!window.__V5B_FREEZE,
      same: window.requestAnimationFrame === window.__V5B_WRAP, hasW: !!window.__V5B_WRAP };
  }
  /** 帧心跳检测：等 ms 毫秒看 combat.frame 有没有推进 */
  function heartbeat(ms) {
    var f0 = C().frame, t0 = Date.now();
    return new Promise(function (r) {
      setTimeout(function () { r({ f0: f0, f1: C().frame, delta: C().frame - f0, ms: Date.now() - t0 }); }, ms || 400);
    });
  }

  return {
    C: C, CL: CL, CB: CB, F: F, m: m, mdev: mdev, step: step, put: put, calm: calm,
    freeze: freeze, restore: restore, rAFState: rAFState, heartbeat: heartbeat,
    installProbe: installProbe, probeRead: probeRead,
    gapM: gapM, gapS: gapS, gp: gp, towardInput: towardInput, awayInput: awayInput,
    prepB: prepB, prepAfterWindow: prepAfterWindow, lungeTrace: lungeTrace, scenario2: scenario2, afterWindow: afterWindow,
    windowRun: windowRun, windowRun2: windowRun2,
    duelArm: duelArm, duelFire: duelFire, readDuel: readDuel, resetResidue: resetResidue,
    resState: resState, sampleStates: sampleStates, panelProbe: panelProbe, panelApiTest: panelApiTest, traceChanges: traceChanges, clickThen: clickThen, tipState: tipState, tipForce: tipForce,
    tipWatchStart: tipWatchStart, tipWatchRead: tipWatchRead, hasTip: function () { return !!document.getElementById('t-tip'); },
    panelGeom: panelGeom, stickRun: stickRun, walkInto: walkInto, aiPunchTrace: aiPunchTrace, armWindow: armWindow, readWindow: readWindow,
    armWindow2: armWindow2, snapWindow: snapWindow, traceLoop: traceLoop,
    tipTrace: tipTrace, sys: sys, nap: nap, skipToFight: skipToFight,
    duelHandle: function () { return { has: !!window.__DUEL, type: typeof window.__DUEL, keys: window.__DUEL ? Object.keys(window.__DUEL).slice(0, 24) : null }; }
  };
}
const PAGE = 'window.__V5B = (' + pageFactory.toString() + ')();';

const EV = {};
function ev(k, v) { EV[k] = v; }

const b = new Browser({ port: PORT, width: 1280, height: 720 });
try {
  await b.launch();
  await b.newPage();
  const t0 = Date.now();
  await b.send('Page.navigate', { url: URLX });
  await sleep(6000);
  for (let i = 0; i < 60; i++) {
    const ok = await b.evaluate('(() => { const el = document.getElementById("btn-skip-cine"); if (el) { el.click(); return true; } return false; })()');
    if (ok && await b.evaluate('window.__SS && window.__SS.state') === 'fight') break;
    await sleep(500);
  }
  info('bootMs', Date.now() - t0);
  await b.evaluate(PAGE);
  info('boot', await b.evaluate('window.__V5B.sys()'));
  info('viewport', await b.evaluate('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: document.documentElement.classList.contains("is-touch") })'));
  info('pageErrors', b.errors.slice(0, 5).length ? b.errors.slice(0, 5) : 'none');
  /**
   * A/B/E 三段的量化必须在「没有真实 rAF 帧插进来」的条件下做：
   * 主循环 loop2 每帧都用**真实 dt** 再调一次 combat.update，两套时钟叠加会把
   * 合成 1/60 步进的数字污染掉（实测同一用例两次跑出 126 / 124 两种总伤害）。
   * 冻结只是把 window.requestAnimationFrame 换成空函数，随时可以还原；
   * 还原后 loop2 的下一帧仍会自己续上（它在函数开头就 requestAnimationFrame(loop2)）。
   * C/D 两段必须在主循环活着的时候测，所以那边先还原。
   */
  info('installProbe', await b.evaluate('window.__V5B.installProbe()'));
  const fr1 = await b.evaluate('window.__V5B.freeze()');
  info('freeze(rAF)', fr1);
  info('rAFState', await b.evaluate('window.__V5B.rAFState()'));
  info('冻结期间心跳（400ms，允许 0，说明冻结生效且主循环还活着）', await b.evaluate('window.__V5B.heartbeat(400)'));
  info('冻结期间 probe', await b.evaluate('window.__V5B.probeRead()'));
  info('解冻一次试试（马上冻回去）+ 心跳', await b.evaluate('(async function () { var V = window.__V5B; V.restore(); var hb = await V.heartbeat(400); var pr = V.probeRead(); V.freeze(); return { hb: hb, pr: pr }; })()'));
  info('再冻回去之后 probe', await b.evaluate('window.__V5B.probeRead()'));

  /* ================= A8-fresh：全新页面上单独验结算面板的 3s 生命周期 ================= */
  head('A8-fresh · 全新页面（不依赖前面二十多局的残留状态）用生产 API 打开结算面板');
  info('A8-fresh __DUEL 句柄', await b.evaluate('window.__V5B.duelHandle()'));
  const un0 = await b.evaluate('window.__V5B.restore()');
  const hb0 = await b.evaluate('window.__V5B.heartbeat(300)');
  info('解冻 + 心跳', { un0: un0, hb: hb0 });
  const a8f = await b.evaluate('window.__V5B.panelApiTest(4200)');
  info('A8-fresh 结果', a8f && { before: a8f.before, at0: a8f.at0, err: a8f.err, clearedAt: a8f.clearedAt, hasRows: !!a8f.rows });
  info('A8-fresh 状态变化点', a8f && a8f.rows ? a8f.rows.filter(function (r, i, a) { return i === 0 || r.cls !== a[i - 1].cls || r.state !== a[i - 1].state || r.disp !== a[i - 1].disp; }) : null);
  ev('A8_fresh', a8f);
  info('A8-fresh：window.__DUEL 上没有 result()（HUD 是 domainduel.js 的局部 var，没挂 window）——改用真对拼路径验证，见 A8-real', a8f && a8f.err);
  /** 真·一场对拼的完整生命周期（3s 保留期在真实路径上到底成不成立） */
  const a8real = await b.evaluate('(async function () { var V = window.__V5B; var arm = await V.duelArm(); var f = await V.duelFire({ force: "sync", tug: 0.4, life: 12 }); var at0 = V.panelProbe(); var chg = await V.traceChanges(5200); return { arm: arm, fire: { title: f.panel && f.panel.title, cls: f.panel && f.panel.cls, state: f.state }, at0: at0, chg: chg }; })()');
  info('A8-real 布场/结算', a8real && { arm: a8real.arm, fire: a8real.fire, at0: a8real.at0 });
  info('A8-real 变化时间线', a8real && a8real.chg);
  ev('A8_real', a8real);
  const a8gone = a8real && a8real.chg ? a8real.chg.filter(function (r) { return r.cls === '' && r.disp === 'none'; })[0] : null;
  check('A8-real 真实对拼路径上面板在 ~3s 内自己收掉（RESULT_HOLD）', !!(a8gone && a8gone.t > 1500 && a8gone.t < 5200),
    JSON.stringify({ goneAt: a8gone ? a8gone.t : -1, first: a8real && a8real.chg && a8real.chg[0], count: a8real && a8real.chg && a8real.chg.length }));

  const fr0 = await b.evaluate('window.__V5B.freeze()');
  info('重新冻结给 A 段', fr0);

  /* ================= A：lunge 方向 ================= */
  if (PHASE === 'all' || PHASE === 'A') {
    head('A · lunge 方向：宿傩在 后 / 前 / 侧（魔虚罗落地玩家身前 3m）');
    const cases = [
      { tag: 'A1 宿傩在玩家身后', prep: { px: 0, pz: 0, sx: 0, sz: 2.5, mx: 0, mz: -3 } },
      { tag: 'A2 宿傩在玩家身前', prep: { px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 } },
      { tag: 'A3 宿傩在玩家侧面', prep: { px: 0, pz: 0, sx: 12, sz: 0, mx: 0, mz: -3 } }
    ];
    for (const c of cases) {
      const r = await b.evaluate('window.__V5B.scenario2(' + JSON.stringify(Object.assign({ n: 30 }, c.prep)) + ')');
      info(c.tag, r && r.lunge ? { gapS0: r.lunge.gapS0, gapM0: r.lunge.gapM0, moved: r.lunge.moved,
        projSukuna: r.lunge.projSukuna, projMaho: r.lunge.projMaho, lunge: r.lunge.lunge,
        hitFrame: r.lunge.hitFrame, gapAtHit: r.lunge.gapAtHit, gapEnd: r.lunge.gapEnd,
        maho: r.lunge.maho, suk: r.lunge.suk, face: r.lunge.face, hook: r.lunge.hookDelta } : r);
      ev('A_' + c.tag, r);
      const L = r && r.lunge;
      check(c.tag + '：lunge 朝魔虚罗（projMaho>1 且 projSukuna<=0.2）', !!(L && L.projMaho > 1 && L.projSukuna <= 0.2),
        JSON.stringify({ moved: L && L.moved, projSukuna: L && L.projSukuna, projMaho: L && L.projMaho }));
      check(c.tag + '：拳头打到了魔虚罗', !!(L && L.maho > 0), JSON.stringify({ maho: L && L.maho, hitFrame: L && L.hitFrame }));
      if (c.tag.indexOf('A1') === 0) {
        info('A1 逐帧', L && L.trace.map(function (s) { return [s[0], s[1], s[6]]; }));
      }
      await b.screenshot(SHOTS + '/a-lunge-' + c.tag.split(' ')[0].toLowerCase() + '.png');
    }

    head('A4/A5 · 对照组：没有落地弱点窗口时，lunge 必须回到朝宿傩');
    const A4 = await b.evaluate('window.__V5B.scenario2({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: 3, airborne: true, n: 30 })');
    info('A4 魔虚罗悬空 y=5（无窗口）', A4 && A4.lunge ? { state: A4.lunge.state, weakT0: A4.lunge.weakT0, gapS0: A4.lunge.gapS0,
      moved: A4.lunge.moved, projSukuna: A4.lunge.projSukuna, projMaho: A4.lunge.projMaho, lunge: A4.lunge.lunge,
      maho: A4.lunge.maho, suk: A4.lunge.suk, face: A4.lunge.face } : A4);
    ev('A4_airborne', A4);
    check('A4 悬空（窗口不在）时 lunge 回到朝宿傩', !!(A4 && A4.lunge && A4.lunge.projSukuna > 1 && A4.lunge.projMaho >= -0.2),
      JSON.stringify({ moved: A4 && A4.lunge && A4.lunge.moved, projSukuna: A4 && A4.lunge && A4.lunge.projSukuna, projMaho: A4 && A4.lunge && A4.lunge.projMaho }));
    check('A4 悬空时打不到魔虚罗（0 伤害）', !!(A4 && A4.lunge && A4.lunge.maho === 0), JSON.stringify({ maho: A4 && A4.lunge && A4.lunge.maho }));

    const A5 = await b.evaluate('window.__V5B.afterWindow({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3, n: 30 })');
    info('A5 等 1.6s 窗口自然结束（down→ascend/air）后再打', A5 && A5.lunge ? { afterWin: A5.afterWin,
      state: A5.lunge.state, weakT0: A5.lunge.weakT0, gapM0: A5.lunge.gapM0, moved: A5.lunge.moved,
      projSukuna: A5.lunge.projSukuna, projMaho: A5.lunge.projMaho, lunge: A5.lunge.lunge,
      maho: A5.lunge.maho, suk: A5.lunge.suk, face: A5.lunge.face } : A5);
    ev('A5_afterwindow', A5);
    check('A5 窗口结束后 lunge 回到朝宿傩', !!(A5 && A5.lunge && A5.lunge.projSukuna > 1 && A5.lunge.projMaho <= 0.2),
      JSON.stringify({ moved: A5 && A5.lunge && A5.lunge.moved, projSukuna: A5 && A5.lunge && A5.lunge.projSukuna, projMaho: A5 && A5.lunge && A5.lunge.projMaho, lunge: A5 && A5.lunge && A5.lunge.lunge }));
    check('A5 窗口结束后打不到魔虚罗（0 伤害）', !!(A5 && A5.lunge && A5.lunge.maho === 0), JSON.stringify({ maho: A5 && A5.lunge && A5.lunge.maho, state: A5 && A5.lunge && A5.lunge.state }));

    head('A6 · 只会朝宿傩那种几何：把魔虚罗挪出副目标射程（14m），必须与改前一致');
    const A6 = await b.evaluate('window.__V5B.scenario2({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -14, n: 30 })');
    info('A6 魔虚罗 14m（射程外）', A6 && A6.lunge ? { gapM0: A6.lunge.gapM0, moved: A6.lunge.moved, projSukuna: A6.lunge.projSukuna,
      projMaho: A6.lunge.projMaho, lunge: A6.lunge.lunge, maho: A6.lunge.maho, suk: A6.lunge.suk } : A6);
    ev('A6_farMaho', A6);
    check('A6 副目标射程外 → lunge 仍朝宿傩且步长 2.6（与改前逐字一致）',
      !!(A6 && A6.lunge && A6.lunge.projSukuna > 2.5 && Math.abs(A6.lunge.lunge.dt - 2.6) < 0.05),
      JSON.stringify({ projSukuna: A6 && A6.lunge && A6.lunge.projSukuna, dt: A6 && A6.lunge && A6.lunge.lunge && A6.lunge.lunge.dt }));
  }

  /* ================= B：弱点窗口命中率表 ================= */
  if (PHASE === 'all' || PHASE === 'B') {
    head('B · 1.6s 弱点窗口命中率（1/60 步进、真实输入结构）');
    const B0 = await b.evaluate('window.__V5B.windowRun2({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 })');
    info('B1 站在 3m 外连打（不推摇杆）', B0 && { prep: B0.prep && { state: B0.prep.state, weakT: B0.prep.weakT }, attempts: B0.attempts, per: B0.per, hits: B0.hits, total: B0.total, hitFrames: B0.hitFrames, gaps: B0.gaps, wallMs: B0.wallMs, ended: B0.ended, windowsFor900: B0.windowsFor900 });
    ev('B1_still', B0);
    const B2 = await b.evaluate('window.__V5B.windowRun2({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3, auto: "toward" })');
    info('B2 一路推摇杆朝它走 + 连打', B2 && { attempts: B2.attempts, per: B2.per, hits: B2.hits, total: B2.total, hitFrames: B2.hitFrames, gaps: B2.gaps, wallMs: B2.wallMs, ended: B2.ended, windowsFor900: B2.windowsFor900 });
    ev('B2_toward', B2);
    const B3 = await b.evaluate('window.__V5B.windowRun2({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -1.3, auto: "toward" })');
    info('B3 贴脸 1.3m + 推摇杆（最好情况）', B3 && { attempts: B3.attempts, per: B3.per, hits: B3.hits, total: B3.total, hitFrames: B3.hitFrames, gaps: B3.gaps, wallMs: B3.wallMs, ended: B3.ended, windowsFor900: B3.windowsFor900 });
    ev('B3_hug', B3);
    const B4 = await b.evaluate('window.__V5B.windowRun2({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3, heavy: true })');
    info('B4 重击（K，lunge 3.4）在窗口里', B4 && { attempts: B4.attempts, per: B4.per, hits: B4.hits, total: B4.total, wallMs: B4.wallMs, ended: B4.ended, windowsFor900: B4.windowsFor900 });
    ev('B4_heavy', B4);
    await b.screenshot(SHOTS + '/b-window-punch.png');

    head('B5 · 真按键（CDP 连点 J）在真实主循环里的实际输出');
    const un1 = await b.evaluate('window.__V5B.restore()');
    info('restore(rAF) 为了跑真按键', un1);
    info('restore 后主循环心跳（400ms 内 combat.frame 的增量，必须 > 0）', await b.evaluate('window.__V5B.heartbeat(400)'));
    const bw = await b.evaluate('window.__V5B.armWindow({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 })');
    info('B5 布场', bw);
    for (let i = 0; i < 9; i++) { await b.pressKey('KeyJ', 40); await sleep(90); }
    const bwr = await b.evaluate('window.__V5B.readWindow()');
    info('B5 真按键结果', bwr);
    ev('B5_realkey', { prep: bw, after: bwr });
    check('B5 真按键连点也能在窗口里造成伤害', !!(bwr && bwr.dmg > 0), JSON.stringify(bwr));

    head('B6 · 真按键 1.6s 窗口（独立布场，按固定节奏连点 + 每帧动作轨迹）');
    const bw2 = await b.evaluate('window.__V5B.armWindow2({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 })');
    info('B6 布场', bw2);
    const traceP = b.evaluate('window.__V5B.traceLoop(1650)');
    for (let i = 0; i < 16; i++) { await sleep(30); await b.pressKey('KeyJ', 30); }
    const tr = await traceP;
    const bw2end = await b.evaluate('window.__V5B.readWindow()');
    info('B6 真按键 1.6s 窗口结果', bw2end);
    info('B6 出招统计', { distinctActions: tr && tr.distinctActions, seq0: tr && tr.seq0, seq1: tr && tr.seq1, rows: tr && tr.rows.length });
    info('B6 轨迹（只打有伤害/换招的行）', tr && tr.rows.filter(function (r, i, arr) { return r.dmg > 0 || i === 0 || (arr[i - 1] && r.id !== arr[i - 1].id); }).map(function (r) { return [r.t, r.f, r.id, r.skill, r.hp, r.dmg, r.st, r.w, r.gap]; }));
    ev('B6_realkey_window', { prep: bw2, distinct: tr && tr.distinctActions, end: bw2end, rows: tr && tr.rows });
    check('B6 真按键在 1.6s 窗口里能造成伤害', !!(bw2end && bw2end.dmg > 0), JSON.stringify(bw2end && { dmg: bw2end.dmg, ms: bw2end.ms, frames: bw2end.frames, hp: bw2end.hp, state: bw2end.state }));
    check('B6 真按键一个窗口打出的伤害 >= 合成步进模型的 126', !!(bw2end && bw2end.dmg >= 126), JSON.stringify({ realKey: bw2end && bw2end.dmg, synthetic: 126, distinctActions: tr && tr.distinctActions }));
  }

  /* ================= E：新毛病搜索 ================= */
  if (PHASE === 'all' || PHASE === 'E') {
    const fr2 = await b.evaluate('window.__V5B.freeze()');
    info('freeze(rAF) 给 E 段', fr2);
    head('E · lunge 改动的新毛病搜索');
    const E1 = await b.evaluate('window.__V5B.stickRun({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3, auto: "toward" })');
    info('E1 连续出招（窗口内一直推摇杆朝它走）', E1);
    ev('E1_stick', E1);
    check('E1 玩家不会被顶在魔虚罗身上（最小间距 >= 1.2m）', !!(E1 && E1.minGap !== null && E1.minGap >= 1.2), JSON.stringify({ minGap: E1 && E1.minGap, rows: E1 && E1.rows }));
    check('E1 连续出招仍能持续造成伤害', !!(E1 && E1.totalDmg > 0), JSON.stringify({ totalDmg: E1 && E1.totalDmg, mahoHp: E1 && E1.mahoHp }));

    const E1b = await b.evaluate('window.__V5B.walkInto({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 })');
    info('E1b 对照组：不出拳、只朝魔虚罗走 90 帧能贴多近', E1b && { minGap: E1b.minGap, minAtFrame: E1b.minAtFrame, endGap: E1b.endGap, mahoDmg: E1b.mahoDmg, state: E1b.state,
      sample: E1b.trace ? [E1b.trace[0], E1b.trace[10], E1b.trace[30], E1b.trace[60], E1b.trace[89]] : null });
    ev('E1b_walkonly', E1b);
    check('E1b 只走位不出拳时也能贴到 <1.2m（说明 E1 的近距离不是 lunge 引入的）', !!(E1b && E1b.minGap < 1.2), JSON.stringify({ minGap: E1b && E1b.minGap }));
    check('E1b 只走位不会造成任何伤害', !!(E1b && E1b.mahoDmg === 0), JSON.stringify({ mahoDmg: E1b && E1b.mahoDmg }));

    const E2 = await b.evaluate('window.__V5B.scenario2({ px: 0, pz: 0, sx: 0, sz: -3.6, mx: 0, mz: 3.0, n: 30 })');
    info('E2 第一拳最容易打空的几何：宿傩在背后 3.6m（正向），魔虚罗落地在身前 3.0m', E2 && E2.lunge ? {
      gapS0: E2.lunge.gapS0, gapM0: E2.lunge.gapM0, lunge: E2.lunge.lunge, moved: E2.lunge.moved,
      projSukuna: E2.lunge.projSukuna, projMaho: E2.lunge.projMaho, hitFrame: E2.lunge.hitFrame, maho: E2.lunge.maho, suk: E2.lunge.suk, face: E2.lunge.face } : E2);
    ev('E2_behind', E2);
    check('E2 第一拳仍打到魔虚罗（改动没有把第一拳弄丢）', !!(E2 && E2.lunge && E2.lunge.maho > 0), JSON.stringify({ maho: E2 && E2.lunge && E2.lunge.maho, hitFrame: E2 && E2.lunge && E2.lunge.hitFrame }));

    const E3 = await b.evaluate('(function () { var V = window.__V5B; var r = V.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; V.calm(); var a0 = V.m().aim, c0 = V.m().hookCalls.meleeAim; var tr = V.lungeTrace({ n: 30 }); var a1 = V.m().aim; return { a0: a0, a1: a1, call0: c0, call1: V.m().hookCalls.meleeAim, trace: tr }; })()');
    info('E3 aim 计数的自洽性', E3 && { a0: E3.a0, a1: E3.a1, call0: E3.call0, call1: E3.call1, hookDelta: E3.trace && E3.trace.hookDelta });
    ev('E3_aim', E3);
    check('E3 aim.offered <= aim.calls 且都是有限数', !!(E3 && E3.a1 && isFinite(E3.a1.calls) && isFinite(E3.a1.offered) && E3.a1.offered <= E3.a1.calls),
      JSON.stringify({ a1: E3 && E3.a1 }));
    check('E3 meleeAim 钩子确实被调用了（calls 增长 > 0）', !!(E3 && E3.a1 && E3.a1.calls - E3.a0.calls > 0), JSON.stringify({ from: E3 && E3.a0 && E3.a0.calls, to: E3 && E3.a1 && E3.a1.calls }));
    check('E3 单次普攻内 offered 的增量 <= calls 的增量', !!(E3 && E3.trace && E3.trace.hookDelta.offered <= E3.trace.hookDelta.calls), JSON.stringify(E3 && E3.trace && E3.trace.hookDelta));

    const E4 = await b.evaluate('(function () { var V = window.__V5B; var r = V.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; V.calm(); return V.aiPunchTrace({}); })()');
    info('E4 宿傩（AI）出普攻时是否也被副目标钩子影响', E4);
    ev('E4_ai', E4);
    check('E4 AI 普攻不被玩家的副目标钩子带偏（sukuna 侧 offered 增量为 0）', !!(E4 && E4.offered === 0), JSON.stringify(E4));
  }

  /* ================= C：A9 / A11 / A12 复跑 ================= */
  if (PHASE === 'all' || PHASE === 'C') {
    const un2 = await b.evaluate('window.__V5B.restore()');
    info('restore(rAF) 给 C 段（结算面板要靠主循环 tick 才会自己收）', un2);
    await sleep(400);
    info('C 段前复核主循环是否活着', await b.evaluate('(function () { var f0 = window.__SS.combat.frame; return new Promise(function (r) { setTimeout(function () { r({ f0: f0, f1: window.__SS.combat.frame, alive: window.__SS.combat.frame > f0 }); }, 400); }); })()'));
    head('C · 结算面板收尾三条反例复跑');
    await b.evaluate('window.__V5B.duelArm()');
    const f9 = await b.evaluate('window.__V5B.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
    info('C-A9 起手', { state: f9.state, title: f9.panel && f9.panel.title, cls: f9.panel && f9.panel.cls, banner: f9.bannerDom });
    const tipF9 = await b.evaluate('(function () { var V = window.__V5B; var t = V.tipState(); var forced = V.tipForce(); return { before: t, forced: forced, after: V.tipState() }; })()');
    info('C-A9 提示条（先人为 t-show，模拟教学提示正在显示）', tipF9);
    const res9 = await b.evaluate('window.__V5B.resetResidue()');
    info('C-A9 combat.reset() 之后', res9);
    ev('C_A9', { fire: f9, tip: tipF9, after: res9 });
    check('C-A9a reset() 之后 60ms 面板已清（cls=="" 且 display:none）', res9.at60.cls === '' && res9.at60.disp === 'none', JSON.stringify(res9.at60));
    check('C-A9b reset() 之后 960ms 面板仍是清的', res9.at960.cls === '' && res9.at960.disp === 'none', JSON.stringify(res9.at960));
    const hasTip9 = await b.evaluate('window.__V5B.hasTip()');
    if (hasTip9) check('C-A9c reset() 之后提示条被还原（t-show 回来了）', !!(res9.at60.tip && res9.at60.tip.show), JSON.stringify(res9.at60.tip));
    else info('C-A9c 跳过：桌面视口没有 .t-tip 元素（该控件只由 src/mobile.js 生成，html.is-touch 才建）', { hasTip: false });
    await b.screenshot(SHOTS + '/c-a9-after-reset.png');

    head('C-A11 · 保留期内点「返回标题」');
    await b.evaluate('window.__V5B.duelArm()');
    const f11 = await b.evaluate('window.__V5B.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
    info('C-A11 起手', { state: f11.state, title: f11.panel && f11.panel.title, cls: f11.panel && f11.panel.cls });
    await b.evaluate('window.__V5B.tipForce()');
    const click11 = await b.evaluate('window.__V5B.clickThen("#btn-totitle", 500)');
    info('C-A11 点「返回标题」之后', click11);
    ev('C_A11', { fire: f11, after: click11 });
    await b.screenshot(SHOTS + '/c-a11-title.png');
    check('C-A11a 回标题后结算大字已收掉（cls=="" 且 display:none）', !!(click11 && click11.after && click11.after.cls === '' && click11.after.disp === 'none'), JSON.stringify(click11 && click11.after));
    const hasTip11 = await b.evaluate('window.__V5B.hasTip()');
    if (hasTip11) check('C-A11b 回标题后提示条已还原', !!(click11 && click11.after && click11.after.tip && click11.after.tip.show), JSON.stringify(click11 && click11.after && click11.after.tip));
    else info('C-A11b 跳过：桌面视口没有 .t-tip 元素（提示条只存在于触屏 UI）', { hasTip: false });
    const titleZ = await b.evaluate('(function () { var t = document.getElementById("title"); var r = document.getElementById("duel-result"); return { state: window.__SS.state, titleZ: t ? getComputedStyle(t).zIndex : null, titleVisible: t ? (getComputedStyle(t).display !== "none" && !t.classList.contains("hidden")) : null, panelZ: getComputedStyle(r).zIndex, panelOpacity: getComputedStyle(r).opacity }; })()');
    info('C-A11 z 序对比', titleZ);
    ev('C_A11_z', titleZ);

    head('C-A12 · 保留期内点「重新开始」');
    const restart = await b.evaluate('(async function () { var V = window.__V5B; await V.duelArm(); var f = await V.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + '); var before = V.resState(); var tip = V.tipForce(); var r = await V.clickThen("#btn-restart", 500); var seq = await V.sampleStates(1500, 150); return { fire: { title: f.panel && f.panel.title, cls: f.panel && f.panel.cls }, before: before, tipForced: tip, after: r, seq: seq }; })()');
    info('C-A12 点「重新开始」之后', { fire: restart.fire, beforeCls: restart.before.cls, tipForced: restart.tipForced,
      afterCls: restart.after && restart.after.after && restart.after.after.cls, afterDisp: restart.after && restart.after.after && restart.after.after.disp,
      afterState: restart.after && restart.after.after && restart.after.after.state,
      afterTip: restart.after && restart.after.after && restart.after.after.tip,
      seq: restart.seq.map(function (s) { return [s.t, s.state, s.cls, s.disp, s.tip && s.tip.show]; }) });
    ev('C_A12', restart);
    await b.screenshot(SHOTS + '/c-a12-restart.png');
    check('C-A12a 重开后结算大字立刻收掉', !!(restart.after && restart.after.after && restart.after.after.cls === '' && restart.after.after.disp === 'none'),
      JSON.stringify(restart.after && restart.after.after && { cls: restart.after.after.cls, disp: restart.after.after.disp }));
    check('C-A12b 重开后 1.5s 内面板没有回魂', !!(restart.seq && restart.seq.every(function (s) { return s.cls === '' && s.disp === 'none'; })),
      JSON.stringify(restart.seq && restart.seq.map(function (s) { return [s.t, s.cls, s.disp]; })));
    const hasTip12 = await b.evaluate('window.__V5B.hasTip()');
    if (hasTip12) check('C-A12c 重开后提示条已还原', !!(restart.after && restart.after.after && restart.after.after.tip && restart.after.after.tip.show),
      JSON.stringify(restart.after && restart.after.after && restart.after.after.tip));
    else info('C-A12c 跳过：桌面视口没有 .t-tip 元素（提示条只存在于触屏 UI）', { hasTip: false });

    head('C-A8 复核 · 自然 3s 生命周期 + 提示条还原');
    info('C-A8 段起手前的面板内部状态', await b.evaluate('window.__V5B.panelProbe()'));
    /**
     * ⚠ 这一节的夹具注意点：C-A12 点了「重新开始」之后游戏进了 cutscene 并且**一直停在那里**
     * （探针不再点「直接进入战斗」）。这个状态下 tick 停摆，面板当然不会自己收 ——
     * 这是夹具造成的，不是产品行为。所以这里先把播片跳过、回到 fight，再测 A8。
     */
    info('C-A8 跳过播片回到 fight', await b.evaluate('window.__V5B.skipToFight()'));
    await b.evaluate('window.__V5B.duelArm()');
    const f8 = await b.evaluate('window.__V5B.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
    await b.evaluate('window.__V5B.tipForce()');
    const seq8 = await b.evaluate('window.__V5B.sampleStates(4400, 200)');
    const chg8 = await b.evaluate('window.__V5B.traceChanges(200)');
    info('C-A8 变化时间线（class/disp/state/active/winner/frame）', chg8);
    const gone8 = seq8.find(function (s) { return s.cls === ''; });
    info('C-A8 起手', { title: f8.panel && f8.panel.title, cls: f8.panel && f8.panel.cls });
    info('C-A8 时间线', seq8.map(function (s) { return [s.t, s.state, s.cls, s.tip && s.tip.show]; }));
    ev('C_A8', { fire: { title: f8.panel && f8.panel.title, cls: f8.panel && f8.panel.cls }, seq: seq8 });
    check('C-A8a 面板在 ~3s 内自然消失', !!(gone8 && gone8.t > 1200 && gone8.t < 4400), 'goneAt=' + (gone8 ? gone8.t : -1) + ' 面板起手 title=' + JSON.stringify(f8.panel && f8.panel.title));
    /** 若 A8a 失败，做一次受控实验：人为把 resT 压到 1.2，看 2s 内是否会走 clearResult */
    if (!(gone8 && gone8.t > 1200 && gone8.t < 4400)) {
      const pt = await b.evaluate('window.__V5B.panelApiTest(3200)');
      info('C-A8 受控补偿实验（生产 API 重开面板，看 3.2s 内会不会自己收）', pt && { before: pt.before, at0: pt.at0, err: pt.err, clearedAt: pt.clearedAt, hasRows: !!pt.rows, rows: pt.rows ? pt.rows.filter(function (r, i, a) { return i === 0 || r.cls !== a[i - 1].cls || r.state !== a[i - 1].state; }) : null });
      ev('C_A8_timerTest', pt);
      check('C-A8c resT 递减到 0 时 clearResult 确实会执行（人工压表验证）',
        !!(pt && pt.rows && pt.rows.some(function (r) { return r.cls === '' && r.disp === 'none'; })),
        JSON.stringify(pt && pt.rows && pt.rows.map(function (r) { return [r.t, r.resT, r.cls]; })));
    }
    check('C-A8pre 起手时结算面板确实亮着（否则 A8a 无意义）', !!(f8.panel && f8.panel.cls === 'win on' && f8.panel.display !== 'none'), JSON.stringify({ cls: f8.panel && f8.panel.cls, disp: f8.panel && f8.panel.display, title: f8.panel && f8.panel.title }));
    const hasTip8 = await b.evaluate('window.__V5B.hasTip()');
    if (hasTip8) check('C-A8b 面板消失后提示条被还原', !!(seq8.length && seq8[seq8.length - 1].tip && seq8[seq8.length - 1].tip.show),
      JSON.stringify(seq8[seq8.length - 1] && seq8[seq8.length - 1].tip));
    else info('C-A8b 跳过：桌面视口没有 .t-tip 元素（提示条只存在于触屏 UI）', { hasTip: false });
  }

  info('pageErrors(final)', b.errors.slice(0, 6).length ? b.errors.slice(0, 6) : 'none');
  const bad = R.filter((x) => !x.ok);
  console.log('\n==== 桌面视口汇总 ' + (R.length - bad.length) + '/' + R.length + ' PASS ====');
  for (const x of bad) console.log('  FAIL ' + x.name + '  -> ' + x.detail);

  /* ================= D：844x390 触屏 ================= */
  if (PHASE === 'all' || PHASE === 'D') {
    head('D · 844x390 @DPR2 触屏：#duel-result vs .t-tip');
    const bm = new Browser({ port: PORTM, width: 844, height: 390 });
    await bm.launch();
    await bm.newPage();
    await bm.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await bm.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await bm.send('Page.navigate', { url: URLX });
    await sleep(6000);
    for (let i = 0; i < 60; i++) {
      const ok = await bm.evaluate('(() => { const el = document.getElementById("btn-skip-cine"); if (el) { el.click(); return true; } return false; })()');
      if (ok && await bm.evaluate('window.__SS && window.__SS.state') === 'fight') break;
      await sleep(500);
    }
    await bm.evaluate(PAGE);
    info('D boot', await bm.evaluate('({ state: window.__SS.state, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: document.documentElement.classList.contains("is-touch"), maxTouch: navigator.maxTouchPoints })'));
    info('D 提示条观察器', await bm.evaluate('window.__V5B.tipWatchStart()'));
    const dTip0 = await bm.evaluate('window.__V5B.tipState()');
    info('D 自然提示条状态（刚进战斗）', dTip0);
    await bm.screenshot(SHOTS + '/d0-mobile-fight.png');
    /** ---- 触屏侧再验一次面板生命周期（触屏 DPR/布局不同，且这一页从没跑过别的对局） ---- */
    info('D 侧 A8：__DUEL 句柄', await bm.evaluate('window.__V5B.duelHandle()'));
    const a8m = await bm.evaluate('window.__V5B.panelApiTest(4200)');
    info('D 侧 A8 结果', a8m && { before: a8m.before, at0: a8m.at0, err: a8m.err, clearedAt: a8m.clearedAt, hasRows: !!a8m.rows });
    info('D 侧 A8 变化点', a8m && a8m.rows ? a8m.rows.filter(function (r, i, a) { return i === 0 || r.cls !== a[i - 1].cls || r.state !== a[i - 1].state; }) : null);
    ev('A8_mobile_fresh', a8m);
    info('D 侧 A8：同样没有 window.__DUEL.result，触屏生命周期见下面 D 时间线', a8m && a8m.err);

    await bm.evaluate('window.__V5B.duelArm()');
    await bm.evaluate('window.__V5B.tipForce()');
    const dTipF = await bm.evaluate('window.__V5B.tipState()');
    info('D 面板出现前（提示条已人为 t-show）', dTipF);
    const dWin = await bm.evaluate('window.__V5B.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.5, life: 12 }) + ')');
    info('D 结算', { title: dWin.panel && dWin.panel.title, cls: dWin.panel && dWin.panel.cls, banner: dWin.bannerDom });
    const dGeo = await bm.evaluate('window.__V5B.panelGeom()');
    const dSeriesP = bm.evaluate('window.__V5B.sampleStates(3400, 200)');
    const dTipTrace = await bm.evaluate('window.__V5B.tipTrace(3400)');
    const dGeoSeries = await dSeriesP;
    info('D 提示条高分辨率轨迹（变化点）', dTipTrace && dTipTrace.rows ? dTipTrace.rows.filter(function (r, i, a) { return i === 0 || r.show !== a[i - 1].show || Math.abs(r.op - a[i - 1].op) > 0.15 || r.resCls !== a[i - 1].resCls; }) : dTipTrace);
    ev('D_tiptrace', dTipTrace);
    const dTipLog = await bm.evaluate('window.__V5B.tipWatchRead()');
    info('D .t-tip class 变更日志（t 是绝对时间戳，单位 ms）', dTipLog);
    const dTip2 = await bm.evaluate('window.__V5B.tipState()');
    info('D 面板消失后立刻的提示条状态', dTip2);
    ev('D_tip_restored', dTip2);
    check('D3b 面板消失后提示条确实被还原（t-show 回来且 opacity>0.5）', !!(dTip2 && dTip2.show && dTip2.opacity > 0.5), JSON.stringify(dTip2));
    info('D 几何（面板出现期间）', dGeo);
    ev('D_tipLog_mid', dTipLog === undefined ? null : dTipLog);
    info('D 时间线', dGeoSeries.map(function (s) { return [s.t, s.state, s.cls, s.tip && s.tip.show, s.tip && s.tip.opacity]; }));
    ev('D_geom', dGeo);
    ev('D_series', dGeoSeries);
    await bm.screenshot(SHOTS + '/d1-mobile-panel.png');
    check('D1 触屏下提示条已经不在显示（面板出现时被临时收起）', !!(dGeo && dGeo.tipShow === false), JSON.stringify({ tipShow: dGeo && dGeo.tipShow, tipOpacity: dGeo && dGeo.tipOpacity, tipCls: dGeo && dGeo.tipCls }));
    check('D2 #duel-result 与 .t-tip 的重叠面积 = 0', !!(dGeo && dGeo.ovBox === 0), JSON.stringify({ ovBox: dGeo && dGeo.ovBox, box: dGeo && dGeo.box, tip: dGeo && dGeo.tip }));
    const dTip1 = await bm.evaluate('window.__V5B.tipState()');
    info('D 面板消失 3.4s 之后的提示条（可能已被 mobile.js 的 toastTimer 重新收走）', dTip1);
    ev('D_tip_late', dTip1);
    await bm.screenshot(SHOTS + '/d2-mobile-tip-restored.png');
    check('D3 面板消失期间提示条出现过 t-show（还原动作确实发生，不是被永久吞掉）',
      !!(dTip2 && dTip2.show) || !!(dGeoSeries.some(function (s) { return s.tip && s.tip.show; })),
      JSON.stringify({ immediate: dTip2 && { show: dTip2.show, op: dTip2.opacity }, seriesShows: dGeoSeries.filter(function (s) { return s.tip && s.tip.show; }).map(function (s) { return [s.t, s.tip.opacity]; }) }));
    check('D4 还原动作之后 40ms 一档的高分辨率轨迹里能看到 opacity 由 0 升起来（真被还原，而不是只改了个 class）',
      !!(dTipTrace && dTipTrace.exists && dTipTrace.rows.some(function (r) { return r.show && r.op > 0.3; })),
      JSON.stringify(dTipTrace && dTipTrace.rows ? dTipTrace.rows.filter(function (r, i, a) { return i === 0 || r.show !== a[i - 1].show || Math.abs(r.op - a[i - 1].op) > 0.2; }) : dTipTrace));

    head('D5 · 对照：提示条不可见（opacity 0）时，几何重叠是否还该算问题');
    const dCtrl = await bm.evaluate('(async function () { var V = window.__V5B; await V.duelArm(); var t = document.getElementById("t-tip"); t.classList.remove("t-show"); var g1 = V.panelGeom(); var f = await V.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.5, life: 12 }) + '); var g2 = V.panelGeom(); return { tipClsBefore: g1.tipCls, tipOpacityBefore: g1.tipOpacity, geom: g2 }; })()');
    info('D5 对照组（面板出现前提示条 opacity=0）', dCtrl);
    ev('D5_control', dCtrl);
    await bm.screenshot(SHOTS + '/d3-mobile-control.png');

    head('D6 · 触屏第二局（败北）同样检查');
    const dSecond = await bm.evaluate('(async function () { var V = window.__V5B; var r = await V.duelArm(); var t = document.getElementById("t-tip"); t.classList.add("t-show"); var f = await V.duelFire(' + JSON.stringify({ force: 'miss', tug: 0.5, life: 12 }) + '); var g = V.panelGeom(); return { title: f.panel && f.panel.title, cls: f.panel && f.panel.cls, geom: g }; })()');
    info('D6 第二局（败北）', dSecond);
    ev('D6', dSecond);
    check('D6 败北面板同样不压提示条（ov=0）且提示条被收起', !!(dSecond && dSecond.geom && dSecond.geom.ovBox === 0 && dSecond.geom.tipShow === false), JSON.stringify(dSecond && dSecond.geom));
    await bm.screenshot(SHOTS + '/d4-mobile-lose.png');
    info('D errors', bm.errors.slice(0, 5).length ? bm.errors.slice(0, 5) : 'none');
    await bm.close();
  }

  const bad2 = R.filter((x) => !x.ok);
  console.log('\n==== 全部汇总 ' + (R.length - bad2.length) + '/' + R.length + ' PASS ====');
  for (const x of bad2) console.log('  FAIL ' + x.name + '  -> ' + x.detail);
} catch (e) {
  console.error('探针异常：', (e && e.stack) || e);
  process.exitCode = 1;
} finally {
  await b.close();
}
