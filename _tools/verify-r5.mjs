/**
 * verify-r5.mjs —— 独立验证探针（第五轮，verifier 自写，不复用被验证方的探针）
 * ----------------------------------------------------------------------------
 * 验证两件事：
 *   A. 领域对拼结算的“赢/输”口径（clashWinner + #duel-result 整屏面板）
 *   B. 普攻对落地弱点窗口魔虚罗的近战副目标（HOOKS.meleeAim）
 * 外加 C. 844x390 触屏布局体检 + 截图。
 *
 * 用法：node _tools/verify-r5.mjs --file tmp/lead/dist.html --port 9531
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg('file', 'tmp/lead/dist.html'));
const PORT = Number(arg('port', '9531'));
const PORTM = Number(arg('portm', '9532'));
const PHASE = arg('phase', 'all');
const SHOTS = arg('shots', 'shots/verify-round5');
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
 * 页面侧辅助：写成一个真函数，靠 toString() 注入（避免嵌套模板串）
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
  function gapM() { var p = F('gojo').p, q = m().pos; return r2(Math.hypot(p.x - q.x, p.z - q.z)); }
  function gapS() { var p = F('gojo').p, q = F('sukuna').p; return r2(Math.hypot(p.x - q.x, p.z - q.z)); }
  function angDiff(a, b) { var d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }
  function facePick() {
    var g = F('gojo');
    var f = g.ctrl.root.rotation.y;
    var ym = Math.atan2(m().pos.x - g.p.x, m().pos.z - g.p.z);
    var ys = Math.atan2(F('sukuna').p.x - g.p.x, F('sukuna').p.z - g.p.z);
    var cand = [
      { who: 'maho', off: 0, d: angDiff(f, ym) },
      { who: 'sukuna', off: 0, d: angDiff(f, ys) },
      { who: 'maho', off: Math.PI, d: angDiff(f + Math.PI, ym) },
      { who: 'sukuna', off: Math.PI, d: angDiff(f + Math.PI, ys) }
    ];
    cand.sort(function (a, b) { return a.d - b.d; });
    return { yaw: r3(f), toMaho: r3(ym), toSuk: r3(ys), pick: cand[0].who, off: cand[0].off, err: r3(cand[0].d), runnerUp: cand[1].who, err2: r3(cand[1].d) };
  }

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
    return { ok: 'down', state: m().state, weakT: r2(m().weakT), attackable: m().attackable };
  }
  function punchOnce(o) {
    o = o || {};
    var mv = o.mv || { moveX: 0, moveZ: 0 };
    if (o.pre) step({ moveX: mv.moveX, moveZ: mv.moveZ }, o.pre);
    var hp0 = m().hp, sk0 = F('sukuna').hp;
    var intent = F('gojo').moveIntent ? [r2(F('gojo').moveIntent.x), r2(F('gojo').moveIntent.z)] : null;
    var calls0 = m().hookCalls.meleeAim, off0 = m().aim.offered;
    var nan0 = !isFinite(m().aim.offered) || !isFinite(m().aim.calls);
    step({ light: true, moveX: mv.moveX, moveZ: mv.moveZ }, 2);
    step({ light: false, moveX: mv.moveX, moveZ: mv.moveZ }, 26);
    var a2 = CB().runner.current('gojo');
    return {
      maho: r2(hp0 - m().hp), suk: r2(sk0 - F('sukuna').hp),
      intent: intent,
      act: a2 ? { skill: a2.skill, tgt: a2.target ? a2.target.side : null, range: r2(a2.flow.range), fwd: [r2(a2.forward.x), r2(a2.forward.z)] } : null,
      hookDelta: { calls: m().hookCalls.meleeAim - calls0, offered: m().aim.offered - off0 },
      aim: m().aim, nanBefore: nan0, state: m().state, weakT: r2(m().weakT), hp: m().hp
    };
  }
  function awayInput() {
    var p = F('gojo').p, q = m().pos;
    var dx = p.x - q.x, dz = p.z - q.z, L = Math.hypot(dx, dz) || 1;
    return { moveX: +(dx / L).toFixed(3), moveZ: +(dz / L).toFixed(3) };
  }
  function towardInput() {
    var a = awayInput(); return { moveX: -a.moveX, moveZ: -a.moveZ };
  }
  function burst(o) {
    var per = [], perS = [], win0 = r2(m().weakT), guard = 0;
    var st0 = m().state;
    while (m().state === 'down' && guard++ < 20) { var d = punchOnce(o); per.push(d.maho); perS.push(d.suk); }
    return { st0: st0, weakT0: win0, hits: per.length, per: per, perSuk: perS,
      total: r2(per.reduce(function (a, c) { return a + c; }, 0)),
      endedState: m().state, weakTEnd: r2(m().weakT), hp: m().hp, hpMax: m().hpMax };
  }
  function sys() { return { state: S.state, frame: C().frame, mech: Object.keys(S.mech()), hpMax: m().hpMax }; }

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
    return { clashActive: CL().active, state: S.state, aiZeroed: !!(cb.ai && cb.ai.difficulty === 0) };
  }
  function readDuel() {
    var res = document.getElementById('duel-result');
    var el = document.getElementById('banner');
    var cnt = document.querySelectorAll('#duel-result').length;
    var cs = res ? getComputedStyle(res) : null;
    var box = res ? res.querySelector('.dr-box') : null;
    var q = function (sel) { var n = res ? res.querySelector(sel) : null; return n ? (n.textContent || '').trim() : null; };
    return {
      winner: CL().winner, tug: r3(CL().tug), sync: CL().sync, miss: CL().miss, active: CL().active,
      snapWinner: S.snap.clashWinner, snapTug: r3(S.snap.tug),
      state: S.state, domCount: cnt,
      bannerDom: el ? (el.textContent || '').trim() : null,
      bannerShown: el ? el.classList.contains('show') : null,
      snapBanner: S.snap.banner,
      panel: res ? { cls: res.className, display: res.style.display, opacity: cs.opacity,
        title: q('.dr-title'), vs: q('.dr-vs'), line: q('.dr-line'), hint: q('.dr-hint'),
        box: box ? (function (r) { return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; })(box.getBoundingClientRect()) : null } : null,
      clashWins: S.stats ? S.stats.clashWins : null
    };
  }
  async function duelFire(o) {
    var d = CL();
    var wins0 = S.stats ? S.stats.clashWins : null;
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
        first = { snapWinner: s.clashWinner, tugAtResolve: r3(d.tug), life: r3(d.life), ms: Date.now() - t0, state: S.state };
        break;
      }
    }
    await nap(450);
    var out = readDuel();
    out.atResolve = first;
    out.clashWinsDelta = (wins0 != null && out.clashWins != null) ? out.clashWins - wins0 : null;
    return out;
  }
  async function panelLife(maxMs) {
    var res = document.getElementById('duel-result');
    var t0 = Date.now(), n = 0, goneAt = null;
    while (Date.now() - t0 < (maxMs || 5200)) {
      if (res.className === '' && goneAt === null) goneAt = Date.now() - t0;
      n++;
      await nap(150);
    }
    if (goneAt === null) goneAt = -1;
    return { goneAt: goneAt, samples: n, clsNow: res.className };
  }
  async function resetResidue() {
    var res = document.getElementById('duel-result');
    var before = { cls: res.className, disp: res.style.display, op: +getComputedStyle(res).opacity };
    C().reset();
    await nap(60);
    var at60 = { cls: res.className, disp: res.style.display, op: +getComputedStyle(res).opacity, state: S.state };
    await nap(900);
    var at960 = { cls: res.className, disp: res.style.display, op: +getComputedStyle(res).opacity, state: S.state };
    return { before: before, at60: at60, at960: at960 };
  }
  async function secondDuel(force) {
    var c = C();
    F('gojo').burnoutT = 0; F('sukuna').burnoutT = 0;
    F('gojo').domain = 100; F('sukuna').domain = 100;
    var res = document.getElementById('duel-result');
    var beforeArm = { cls: res.className, disp: res.style.display };
    c.domains.open('gojo'); c.domains.open('sukuna');
    var t0 = Date.now();
    while (Date.now() - t0 < 4000 && !CL().active) await nap(20);
    var afterArm = { cls: res.className, disp: res.style.display, domCount: document.querySelectorAll('#duel-result').length, active: CL().active };
    await nap(200);
    var r = await duelFire({ force: force, tug: 0.7, life: 12 });
    return { beforeArm: beforeArm, afterArm: afterArm, fire: r };
  }
  function tracePunch(o) {
    o = o || {};
    var mv = o.mv || { moveX: 0, moveZ: 0 };
    var gp0 = [r2(F('gojo').p.x), r2(F('gojo').p.z)];
    var hp0 = m().hp, sk0 = F('sukuna').hp;
    var range0 = null, samples = [];
    for (var k = 0; k < (o.n || 30); k++) {
      step({ light: k < 2, moveX: mv.moveX, moveZ: mv.moveZ }, 1);
      var a = CB().runner.current('gojo');
      if (a && !range0) range0 = r2(a.flow.range);
      samples.push({ k: k, gap: gapM(), hp: m().hp, st: m().state, w: r2(m().weakT) });
    }
    var gp1 = [r2(F('gojo').p.x), r2(F('gojo').p.z)];
    var dx = gp1[0] - gp0[0], dz = gp1[1] - gp0[1];
    var dS = Math.hypot(F('sukuna').p.x - gp0[0], F('sukuna').p.z - gp0[1]) || 1;
    var dM = Math.hypot(m().pos.x - gp0[0], m().pos.z - gp0[1]) || 1;
    return { range: range0, gp0: gp0, gp1: gp1, moved: r2(Math.hypot(dx, dz)),
      projSukuna: r2((dx * (F('sukuna').p.x - gp0[0]) + dz * (F('sukuna').p.z - gp0[1])) / dS),
      projMaho: r2((dx * (m().pos.x - gp0[0]) + dz * (m().pos.z - gp0[1])) / dM),
      mahoDmg: r2(hp0 - m().hp), sukDmg: r2(sk0 - F('sukuna').hp), samples: samples };
  }
  function burstQuant(o) {
    o = o || {};
    var rows = [], guard = 0;
    while (m().state === 'down' && guard++ < 12) {
      var g0 = gapM(), p0 = [F('gojo').p.x, F('gojo').p.z], h0 = m().hp, s0 = F('sukuna').hp;
      var c0 = m().hookCalls.meleeAim, o0 = m().aim.offered;
      var mv = o.auto === 'toward' ? towardInput() : (o.mv || { moveX: 0, moveZ: 0 });
      var tr = tracePunch({ mv: mv, n: 30 });
      var p1 = [F('gojo').p.x, F('gojo').p.z];
      rows.push({ hook: { calls: m().hookCalls.meleeAim - c0, offered: m().aim.offered - o0 }, gapBefore: g0, gapAfter: gapM(), mv: [mv.moveX, mv.moveZ], moved: tr.moved,
        projSukuna: tr.projSukuna, projMaho: tr.projMaho, maho: r2(h0 - m().hp), suk: r2(s0 - F('sukuna').hp),
        range: tr.range, st: m().state, w: r2(m().weakT) });
    }
    var per = rows.map(function (x) { return x.maho; });
    var dmg = per.filter(function (x) { return x > 0; });
    return { attempts: per.length, damaging: dmg.length, per: per, total: r2(dmg.reduce(function (a, c) { return a + c; }, 0)),
      rows: rows, hp: m().hp, hpMax: m().hpMax, endedState: m().state };
  }
  function scenario(o) {
    var r = prepB(o);
    if (r.err) return r;
    calm();
    var s0 = F('sukuna').hp, h0 = m().hp, gS = gapS(), gM = gapM();
    var tr = tracePunch({ n: o.n || 30 });
    return { prep: r, gapS: gS, gapM: gM, suk: r2(s0 - F('sukuna').hp), maho: r2(h0 - m().hp),
      range: tr.range, moved: tr.moved, projSukuna: tr.projSukuna, projMaho: tr.projMaho, trace: tr.samples };
  }
  async function overlapSeries(ms) {
    var res = document.getElementById('duel-result');
    var box = res.querySelector('.dr-box');
    var hud = document.getElementById('duel-hud');
    var t0 = Date.now(), out = [];
    function ov(a, c) { var ox = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)); var oy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)); return Math.round(ox * oy); }
    while (Date.now() - t0 < (ms || 3200)) {
      var br = box.getBoundingClientRect(), hr = hud.getBoundingClientRect();
      out.push({ t: Date.now() - t0, cls: res.className, hudDisp: getComputedStyle(hud).display, hudOpacity: +getComputedStyle(hud).opacity,
        ov: ov(br, hr), box: [Math.round(br.left), Math.round(br.top), Math.round(br.right), Math.round(br.bottom)],
        hud: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.right), Math.round(hr.bottom)] });
      await nap(200);
    }
    return out;
  }
  return { C: C, CL: CL, CB: CB, F: F, m: m, step: step, put: put, calm: calm, prepB: prepB,
    tracePunch: tracePunch, burstQuant: burstQuant, scenario: scenario, overlapSeries: overlapSeries,
    punchOnce: punchOnce, burst: burst, gapM: gapM, gapS: gapS, facePick: facePick, sys: sys,
    awayInput: awayInput, towardInput: towardInput, readDuel: readDuel, duelArm: duelArm,
    duelFire: duelFire, panelLife: panelLife, resetResidue: resetResidue, secondDuel: secondDuel };
}
const PAGE = 'window.__V5 = (' + pageFactory.toString() + ')();';

const EV = {};   // 供报告引用的原始证据
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
  info('boot', await b.evaluate('window.__V5.sys()'));
  info('viewport', await b.evaluate('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })'));
  info('pageErrors', b.errors.slice(0, 5).length ? b.errors.slice(0, 5) : 'none');

  /* ======================= B：近战副目标 ======================= */
  head('B · 普攻 vs 落地弱点窗口的魔虚罗');
if (PHASE === 'all' || PHASE === 'B') {

  const B1 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); var q = window.__V5.punchOnce(); return { prep: r, q: q, gapS: window.__V5.gapS(), gapM: window.__V5.gapM() }; })()');
  info('B1 宿傩25m / 魔虚罗身前3m / 落地窗口', B1);
  check('B1 普攻打到魔虚罗（HP 下降）', B1 && B1.q && B1.q.maho > 0, JSON.stringify(B1 && { maho: B1.q.maho, suk: B1.q.suk, state: B1.q.state, aim: B1.q.aim }));
  check('B1 宿傩 25m 外不该挨打', B1 && B1.q && B1.q.suk === 0, JSON.stringify(B1 && { suk: B1.q.suk }));
  ev('B1', B1);

  const B2 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); var q = window.__V5.punchOnce(); return { prep: r, q: q, gapS: window.__V5.gapS(), gapM: window.__V5.gapM(), face: window.__V5.facePick() }; })()');
  info('B2 朝向检查（同位置）', B2 && { gapM: B2.gapM, face: B2.face, act: B2.q && B2.q.act });
  check('B2 出招朝向指向魔虚罗而不是宿傩', !!(B2 && B2.face && B2.face.pick === 'maho'), JSON.stringify(B2 && B2.face));
  ev('B2', B2);

  const B3 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: 3, airborne: true }); if (r.err) return r; window.__V5.calm(); var q = window.__V5.punchOnce(); return { prep: r, q: q, gapM: window.__V5.gapM(), banner: window.__SS.snap.banner, bannerT: window.__SS.snap.bannerT, hint: window.__V5.m().hint }; })()');
  info('B3 魔虚罗悬空 y=5', B3 && { prep: B3.prep, maho: B3.q.maho, state: B3.q.state, banner: B3.banner });
  check('B3 悬空时近战打不到魔虚罗（0 伤害）', !!(B3 && B3.q && B3.q.maho === 0), JSON.stringify(B3 && { maho: B3.q.maho, state: B3.q.state, weakT: B3.q.weakT }));
  check('B3 给出「悬空 —— 近战够不到」横幅', !!(B3 && /悬在?空/.test(String(B3.banner)) && /近战够不到/.test(String(B3.banner))), String(B3 && B3.banner));
  ev('B3', B3);

  const B4 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: -2.6, mx: 0, mz: 3.2 }); if (r.err) return r; window.__V5.calm(); var q = window.__V5.punchOnce(); return { prep: r, q: q, gapS: window.__V5.gapS(), gapM: window.__V5.gapM() }; })()');
  info('B4 宿傩身前2.6m / 魔虚罗背后3.2m', B4 && { gapS: B4.gapS, gapM: B4.gapM, maho: B4.q.maho, suk: B4.q.suk, act: B4.q.act, hook: B4.q.hookDelta });
  check('B4 宿傩吃到伤害（不被副目标抢走）', !!(B4 && B4.q && B4.q.suk > 0), JSON.stringify(B4 && { suk: B4.q.suk, maho: B4.q.maho }));
  ev('B4', B4);

  const B5 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); var mv = window.__V5.awayInput(); var q = window.__V5.punchOnce({ mv: mv, pre: 12 }); return { prep: r, q: q, gapM: window.__V5.gapM(), mv: mv }; })()');
  info('B5 朝远离魔虚罗方向走 + 普攻', B5 && { mv: B5.mv, gapM: B5.gapM, maho: B5.q.maho, suk: B5.q.suk, intent: B5.q.intent, hook: B5.q.hookDelta });
  check('B5 反向走位时让位（不抢目标）', !!(B5 && B5.q && B5.q.maho === 0), JSON.stringify(B5 && { maho: B5.q.maho, hook: B5.q.hookDelta, intent: B5.q.intent }));
  ev('B5', B5);

  const B5b = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); var mv = window.__V5.towardInput(); var q = window.__V5.punchOnce({ mv: mv, pre: 12 }); return { prep: r, q: q, gapM: window.__V5.gapM(), mv: mv }; })()');
  info('B5b 对照组：同距离朝魔虚罗走 + 普攻', B5b && { mv: B5b.mv, gapM: B5b.gapM, maho: B5b.q.maho, intent: B5b.q.intent, hook: B5b.q.hookDelta });
  check('B5b 对照组：朝魔虚罗走就能打到（证明 B5 的让位来自方向而不是距离）', !!(B5b && B5b.q && B5b.q.maho > 0), JSON.stringify(B5b && { maho: B5b.q.maho, gapM: B5b.gapM, hook: B5b.q.hookDelta }));
  ev('B5b', B5b);

  const B6 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); var bu = window.__V5.burst(); var st = window.__V5.m().state; var g2 = 0; while (window.__V5.m().state !== \'air\' && g2++ < 400) window.__V5.step(null, 1); var st2 = window.__V5.m().state; var after = window.__V5.punchOnce(); return { prep: r, burst: bu, stateAfterBurst: st, stateBeforeAfterPunch: st2, afterPunch: { maho: after.maho, state: after.state, weakT: after.weakT } }; })()');
  info('B6 一个弱点窗口的完整量化', B6);
  check('B6 窗口结束后不能再白嫖伤害', !!(B6 && B6.afterPunch && B6.afterPunch.maho === 0), JSON.stringify(B6 && { after: B6.afterPunch, ended: B6.burst.endedState }));
  check('B6 单窗口至少 2 下', !!(B6 && B6.burst && B6.burst.hits >= 2), JSON.stringify(B6 && { hits: B6.burst.hits, per: B6.burst.per }));
  ev('B6', B6);
  await b.screenshot(SHOTS + '/b-weakwindow-punch.png');

  const B7 = await b.evaluate('window.__V5.m().aim');
  info('B7 aim 自洽口径', B7);
  check('B7 meleeAim 口径无 NaN 且 offered<=calls', !!(B7 && isFinite(B7.calls) && isFinite(B7.offered) && B7.offered <= B7.calls && B7.calls > 0), JSON.stringify(B7));
  ev('B7', B7);

  const b8prep = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); return { prep: r, hp0: window.__V5.m().hp, gapM: window.__V5.gapM(), weakT: window.__V5.m().weakT }; })()');
  await b.pressKey('KeyJ', 50);
  await sleep(600);
  const b8after = await b.evaluate('({ hp: window.__V5.m().hp, state: window.__V5.m().state, weakT: window.__V5.m().weakT, aim: window.__V5.m().aim, hook: window.__V5.m().hookCalls.meleeAim })');
  ev('B8', { prep: b8prep, after: b8after });
  info('B8 CDP 真按键 J', { prep: b8prep, after: b8after, dmg: (b8prep && b8after) ? +(b8prep.hp0 - b8after.hp).toFixed(2) : null });
  check('B8 真实按键 J 也能打到落地魔虚罗', !!(b8prep && b8after && (b8prep.hp0 - b8after.hp) > 0), JSON.stringify({ hp0: b8prep && b8prep.hp0, hp1: b8after && b8after.hp }));

}

  /* -------- B9：lunge（出招前冲）指向谁 -------- */
  head('B9 · 出招前冲（combat.js HitResolver.lunge）指向谁');
  const B9 = await b.evaluate('window.__V5.scenario({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3, n: 30 })');
  const b9s = (B9 && B9.trace) ? B9.trace : [];
  const hitIdx = b9s.findIndex(function (s) { return s.hp < (b9s[0] ? b9s[0].hp : 0); });
  info('B9 宿傩25m / 魔虚罗身前3m / 单次普攻逐帧', B9 && { gapM0: B9.gapM, gapS0: B9.gapS, range: B9.range, maho: B9.maho, suk: B9.suk,
    moved: B9.moved, projSukuna: B9.projSukuna, projMaho: B9.projMaho, hitFrame: hitIdx,
    gapAtHit: hitIdx >= 0 ? b9s[hitIdx].gap : null, gapEnd: b9s.length ? b9s[b9s.length - 1].gap : null,
    trace: b9s.map(function (s) { return [s.k, s.gap, s.hp]; }) });
  check('B9a 打魔虚罗时玩家却被推向宿傩（吸附仍在）', !!(B9 && B9.projSukuna > 1 && B9.projMaho < 0.2), JSON.stringify({ moved: B9 && B9.moved, projSukuna: B9 && B9.projSukuna, projMaho: B9 && B9.projMaho }));
  check('B9b 一拳后玩家已超出副目标射程（gap > 5m）', !!(b9s.length && b9s[b9s.length - 1].gap > 5), JSON.stringify({ gap0: B9 && B9.gapM, gapEnd: b9s.length ? b9s[b9s.length - 1].gap : null, range: B9 && B9.range }));
  ev('B9', B9);

  /* -------- B10：一个弱点窗口能打几下 -------- */
  head('B10 · 一个 1.6s 弱点窗口的伤害量化');
  const P1 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); return window.__V5.burstQuant({}); })()');
  info('B10 站着连打（不推摇杆）', P1 && { attempts: P1.attempts, damaging: P1.damaging, per: P1.per, total: P1.total, rows: P1.rows, hp: P1.hp, ended: P1.endedState });
  check('B10a 原地连打只有 1 下有效伤害', !!(P1 && P1.damaging === 1), JSON.stringify({ attempts: P1 && P1.attempts, per: P1 && P1.per, gaps: P1 && P1.rows.map(function (x) { return [x.gapBefore, x.gapAfter]; }) }));
  ev('B10_still', P1);

  const P2 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -3 }); if (r.err) return r; window.__V5.calm(); return window.__V5.burstQuant({ auto: "toward" }); })()');
  info('B10 按住朝魔虚罗方向连打', P2 && { attempts: P2.attempts, damaging: P2.damaging, per: P2.per, total: P2.total, rows: P2.rows, hp: P2.hp, ended: P2.endedState });
  ev('B10_toward', P2);
  const perHit = (P1 && P1.damaging) ? +(P1.total / P1.damaging).toFixed(2) : null;
  info('B10 推算', { dmgPerHit: perHit, dmgPerWindowStill: P1 && P1.total, dmgPerWindowWalking: P2 && P2.total,
    windowsFor900_still: (P1 && P1.total) ? Math.ceil(900 / P1.total) : null, windowsFor900_walking: (P2 && P2.total) ? Math.ceil(900 / P2.total) : null });
  check('B10b 边推摇杆边打能打出 >=2 下', !!(P2 && P2.damaging >= 2), JSON.stringify({ damaging: P2 && P2.damaging, per: P2 && P2.per }));

  const P3 = await b.evaluate('(function () { var r = window.__V5.prepB({ px: 0, pz: 0, sx: 0, sz: 25, mx: 0, mz: -1.3 }); if (r.err) return r; window.__V5.calm(); return window.__V5.burstQuant({ auto: "toward" }); })()');
  info('B10c 贴脸（1.3m）按住朝魔虚罗连打 —— 最好情况', P3);
  ev('B10_hug', P3);
  check('B10c 贴脸时单窗口有效命中仍 <= 2', !!(P3 && P3.damaging <= 2), JSON.stringify({ damaging: P3 && P3.damaging, per: P3 && P3.per }));

  /* -------- B12：宿傩在射程内、魔虚罗背后（含对照组） -------- */
  head('B12 · 宿傩在射程内时普攻归属（含对照组）');
  const S1 = await b.evaluate('window.__V5.scenario({ px: 0, pz: 0, sx: 0, sz: 2.6, mx: 0, mz: -14, n: 30 })');
  info('S1 对照组：宿傩2.6m / 魔虚罗14m（不在副目标射程）', S1 && { gapS: S1.gapS, gapM: S1.gapM, range: S1.range, suk: S1.suk, maho: S1.maho, moved: S1.moved });
  const S2 = await b.evaluate('window.__V5.scenario({ px: 0, pz: 0, sx: 0, sz: -2.6, mx: 0, mz: 3.2, n: 30 })');
  info('S2 实验组：宿傩2.6m / 魔虚罗背后3.2m（窗口内）', S2 && { gapS: S2.gapS, gapM: S2.gapM, range: S2.range, suk: S2.suk, maho: S2.maho, moved: S2.moved, projSukuna: S2.projSukuna, projMaho: S2.projMaho });
  ev('S1_baseline', S1); ev('S2_mahoBehind', S2);
  check('B12a 对照组：宿傩吃到正常伤害', !!(S1 && S1.suk > 0), JSON.stringify({ suk: S1 && S1.suk, maho: S1 && S1.maho }));
  check('B12b 实验组：宿傩仍吃到伤害（未被副目标彻底抢走）', !!(S2 && S2.suk > 0), JSON.stringify({ suk: S2 && S2.suk, maho: S2 && S2.maho }));
  check('B12c 实验组宿傩伤害 >= 对照组的 50%', !!(S1 && S2 && S2.suk >= S1.suk * 0.5), JSON.stringify({ baseline: S1 && S1.suk, withMahoBehind: S2 && S2.suk }));

  /* ======================= A：领域对拼结算 ======================= */
  head('A · 领域对拼结算的赢/输口径');
if (PHASE === 'all' || PHASE === 'A') {

  async function duelCase(tag, opts) {
    const arm = await b.evaluate('window.__V5.duelArm()');
    const fire = await b.evaluate('window.__V5.duelFire(' + JSON.stringify(opts) + ')');
    info(tag + ' 布场', arm);
    info(tag + ' 结算', fire);
    return { arm, fire };
  }

  const A1 = await duelCase('A1 sync胜 tug=+0.6', { force: 'sync', tug: 0.6, life: 12 });
  ev('A1', A1);
  check('A1 面板标题=领域胜利', !!(A1.fire.panel && A1.fire.panel.title === '领域胜利'), JSON.stringify(A1.fire.panel && A1.fire.panel.title));
  check('A1 面板 class=win on', !!(A1.fire.panel && A1.fire.panel.cls === 'win on'), JSON.stringify(A1.fire.panel && A1.fire.panel.cls));
  check('A1 横幅说的是赢', !!(A1.fire.bannerDom && A1.fire.bannerDom.indexOf('领域胜利') >= 0), String(A1.fire.bannerDom));
  check('A1 snapWinner=gojo 与 duel.winner 一致', A1.fire.snapWinner === 'gojo' && A1.fire.winner === 'gojo', JSON.stringify({ snap: A1.fire.snapWinner, duel: A1.fire.winner, tugAtResolve: A1.fire.atResolve && A1.fire.atResolve.tugAtResolve }));
  await b.screenshot(SHOTS + '/a1-win-tug-pos.png');

  const A2 = await duelCase('A2 sync胜 tug=-0.6', { force: 'sync', tug: -0.6, life: 12 });
  ev('A2', A2);
  check('A2（tug 为负）面板标题=领域胜利', !!(A2.fire.panel && A2.fire.panel.title === '领域胜利'), JSON.stringify(A2.fire.panel && A2.fire.panel.title));
  check('A2（tug 为负）横幅说的是赢而不是被击破', !!(A2.fire.bannerDom && A2.fire.bannerDom.indexOf('领域胜利') >= 0), String(A2.fire.bannerDom));
  check('A2 snapWinner=gojo', A2.fire.snapWinner === 'gojo', JSON.stringify({ snap: A2.fire.snapWinner, tug: A2.fire.atResolve && A2.fire.atResolve.tugAtResolve }));
  await b.screenshot(SHOTS + '/a2-win-tug-neg.png');

  const A3 = await duelCase('A3 sync胜 tug=0', { force: 'sync', tug: 0, life: 12 });
  ev('A3', A3);
  check('A3（tug=0）面板标题=领域胜利', !!(A3.fire.panel && A3.fire.panel.title === '领域胜利'), JSON.stringify({ title: A3.fire.panel && A3.fire.panel.title, tugAtResolve: A3.fire.atResolve && A3.fire.atResolve.tugAtResolve }));
  check('A3（tug=0）横幅说的是赢', !!(A3.fire.bannerDom && A3.fire.bannerDom.indexOf('领域胜利') >= 0), String(A3.fire.bannerDom));
  check('A3 snapWinner=gojo', A3.fire.snapWinner === 'gojo', JSON.stringify(A3.fire.snapWinner));
  await b.screenshot(SHOTS + '/a3-win-tug-zero.png');

  const A4 = await duelCase('A4 miss败 tug=+0.6', { force: 'miss', tug: 0.6, life: 12 });
  ev('A4', A4);
  check('A4（tug 为正却输）面板标题=领域败北', !!(A4.fire.panel && A4.fire.panel.title === '领域败北'), JSON.stringify({ title: A4.fire.panel && A4.fire.panel.title, tugAtResolve: A4.fire.atResolve && A4.fire.atResolve.tugAtResolve }));
  check('A4 面板 class=lose on', !!(A4.fire.panel && A4.fire.panel.cls === 'lose on'), JSON.stringify(A4.fire.panel && A4.fire.panel.cls));
  check('A4 横幅说的是输', !!(A4.fire.bannerDom && A4.fire.bannerDom.indexOf('领域败北') >= 0), String(A4.fire.bannerDom));
  check('A4 snapWinner=sukuna', A4.fire.snapWinner === 'sukuna', JSON.stringify(A4.fire.snapWinner));
  await b.screenshot(SHOTS + '/a4-lose-tug-pos.png');

  const A5 = await duelCase('A5 miss败 tug=-0.6', { force: 'miss', tug: -0.6, life: 12 });
  ev('A5', A5);
  check('A5 面板标题=领域败北', !!(A5.fire.panel && A5.fire.panel.title === '领域败北'), JSON.stringify(A5.fire.panel && A5.fire.panel.title));
  check('A5 横幅说的是输', !!(A5.fire.bannerDom && A5.fire.bannerDom.indexOf('领域败北') >= 0), String(A5.fire.bannerDom));

  const A6 = await duelCase('A6 超时判负 tug=-0.5 life=0.9', { force: null, tug: -0.5, life: 0.9 });
  ev('A6', A6);
  check('A6 超时判负：面板标题=领域败北', !!(A6.fire.panel && A6.fire.panel.title === '领域败北'), JSON.stringify(A6.fire.panel && { title: A6.fire.panel.title, cls: A6.fire.panel.cls }));
  check('A6 超时判负：面板标注「12s 判定」', !!(A6.fire.panel && /12s 判定/.test(String(A6.fire.panel.vs))), String(A6.fire.panel && A6.fire.panel.vs));
  check('A6 snapWinner=sukuna', A6.fire.snapWinner === 'sukuna', JSON.stringify({ snap: A6.fire.snapWinner, life: A6.fire.atResolve && A6.fire.atResolve.life, tug: A6.fire.atResolve && A6.fire.atResolve.tugAtResolve }));
  await b.screenshot(SHOTS + '/a6-timeout-lose.png');

  const A7 = await duelCase('A7 超时双崩 tug=0 life=0.9', { force: null, tug: 0, life: 0.9 });
  ev('A7', A7);
  check('A7 双崩：面板标题=两败俱伤', !!(A7.fire.panel && A7.fire.panel.title === '两败俱伤'), JSON.stringify(A7.fire.panel && { title: A7.fire.panel.title, cls: A7.fire.panel.cls }));
  check('A7 双崩：面板 class=draw on', !!(A7.fire.panel && A7.fire.panel.cls === 'draw on'), JSON.stringify(A7.fire.panel && A7.fire.panel.cls));
  check('A7 双崩：横幅=领域同时崩坏', !!(A7.fire.bannerDom && A7.fire.bannerDom.indexOf('同时崩坏') >= 0), String(A7.fire.bannerDom));
  check('A7 snapWinner=draw', A7.fire.snapWinner === 'draw', JSON.stringify(A7.fire.snapWinner));
  await b.screenshot(SHOTS + '/a7-draw.png');

  head('A8 · 结算面板 3 秒生命周期');
  await b.evaluate('window.__V5.duelArm()');
  const a8fire = await b.evaluate('window.__V5.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
  info('A8 起手', { title: a8fire.panel && a8fire.panel.title, cls: a8fire.panel && a8fire.panel.cls });
  const life = await b.evaluate('window.__V5.panelLife(5200)');
  info('A8 存续', life);
  ev('A8', life);
  check('A8 面板在 ~3s 后消失（实测）', life.goneAt > 2000 && life.goneAt < 4200, 'goneAt=' + life.goneAt + 'ms');

  head('A9 · combat.reset() 之后的残留');
  await b.evaluate('window.__V5.duelArm()');
  const a9fire = await b.evaluate('window.__V5.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
  info('A9 起手', { title: a9fire.panel && a9fire.panel.title, cls: a9fire.panel && a9fire.panel.cls });
  const res9 = await b.evaluate('window.__V5.resetResidue()');
  info('A9 reset 前后', res9);
  ev('A9', res9);
  check('A9 reset() 立即清掉结算面板', res9.at60.cls === '' && res9.at60.disp === 'none', JSON.stringify(res9.at60));
  await b.screenshot(SHOTS + '/a9-after-reset.png');

  head('A10 · 连续两局不叠加');
  await b.evaluate('window.__V5.duelArm()');
  const a10a = await b.evaluate('window.__V5.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
  const a10b = await b.evaluate('window.__V5.secondDuel("miss")');
  info('A10 第一局', { title: a10a.panel && a10a.panel.title, cls: a10a.panel && a10a.panel.cls, domCount: a10a.domCount });
  info('A10 第二局', a10b);
  ev('A10', { first: { title: a10a.panel && a10a.panel.title, cls: a10a.panel && a10a.panel.cls }, second: a10b });
  check('A10 第二局开局时旧面板已收', a10b.afterArm.cls === '' && a10b.afterArm.disp === 'none', JSON.stringify(a10b.afterArm));
  check('A10 第二局结算显示败北（不是第一局残留）', !!(a10b.fire.panel && a10b.fire.panel.title === '领域败北'), JSON.stringify({ title: a10b.fire.panel && a10b.fire.panel.title, cls: a10b.fire.panel && a10b.fire.panel.cls }));
  check('A10 DOM 里只有一个 #duel-result', a10b.fire.domCount === 1 && a10b.afterArm.domCount === 1, JSON.stringify({ afterArm: a10b.afterArm.domCount, afterFire: a10b.fire.domCount }));
  await b.screenshot(SHOTS + '/a10-second-duel.png');


}
  /* ======================= C：844x390 触屏 ======================= */
  head('C · 844x390 触屏下的整屏结算面板');
if (PHASE === 'all' || PHASE === 'C') {
  function geomFactory() {
    function R(e) { var r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), rt: Math.round(r.right) }; }
    var res = document.getElementById('duel-result');
    var box = res.querySelector('.dr-box'), title = res.querySelector('.dr-title'), vs = res.querySelector('.dr-vs'), line = res.querySelector('.dr-line'), hint = res.querySelector('.dr-hint');
    var vw = innerWidth, vh = innerHeight;
    function z(sel) { var e = document.querySelector(sel); return e ? getComputedStyle(e).zIndex : null; }
    var ctrls = [], nodes = document.querySelectorAll('#touch-ui *');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], r = n.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      ctrls.push({ act: n.getAttribute('data-act'), cls: String(n.className).slice(0, 28), r: R(n) });
    }
    var bx = R(box);
    function ov(a, c) { var ox = Math.max(0, Math.min(a.rt, c.rt) - Math.max(a.x, c.x)); var oy = Math.max(0, Math.min(a.b, c.b) - Math.max(a.y, c.y)); return ox * oy; }
    var hits = [];
    for (var j = 0; j < ctrls.length; j++) { var o = ov(bx, ctrls[j].r); if (o > 40) hits.push({ act: ctrls[j].act, cls: ctrls[j].cls, r: ctrls[j].r, ov: Math.round(o) }); }
    var dh = document.getElementById('duel-hud');
    var dhR = (dh && getComputedStyle(dh).display !== 'none') ? R(dh) : null;
    var dhOv = dhR ? Math.round(ov(bx, dhR)) : 0;
    var hudNodes = [];
    ['#hud .top', '#hud .clash', '#duel-hud'].forEach(function (sel) { var e = document.querySelector(sel); if (e) hudNodes.push({ sel: sel, r: R(e), z: getComputedStyle(e).zIndex, disp: getComputedStyle(e).display }); });
    return { vw: vw, vh: vh, dpr: devicePixelRatio, isTouch: document.documentElement.classList.contains('is-touch'),
      box: bx, title: R(title), vs: R(vs), line: R(line), hint: R(hint),
      titleFont: getComputedStyle(title).fontSize, vsFont: getComputedStyle(vs).fontSize, lineFont: getComputedStyle(line).fontSize,
      z: { duelResult: z('#duel-result'), touch: z('#touch-ui'), hud: z('#hud'), duelHud: z('#duel-hud'), banner: z('#banner') },
      inViewport: bx.x >= 0 && bx.y >= 0 && bx.rt <= vw && bx.b <= vh,
      ctrlCount: ctrls.length, overlaps: hits, overlapCount: hits.length, hudNodes: hudNodes,
      duelHudRect: dhR, duelHudOverlap: dhOv,
      panelCls: res.className, panelOpacity: getComputedStyle(res).opacity };
  }
  const GEOM = '(' + geomFactory.toString() + ')()';
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
  info('C boot', await bm.evaluate('({ state: window.__SS.state, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: document.documentElement.classList.contains("is-touch"), maxTouch: navigator.maxTouchPoints })'));
  await bm.screenshot(SHOTS + '/c0-mobile-fight.png');
  await bm.evaluate('window.__V5.duelArm()');
  const cArm = await bm.evaluate('({ state: window.__SS.state, active: window.__V5.CL().active })');
  info('C 领域对拼布场', cArm);
  const cWin = await bm.evaluate('window.__V5.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.5, life: 12 }) + ')');
  info('C 结算', { title: cWin.panel && cWin.panel.title, cls: cWin.panel && cWin.panel.cls, banner: cWin.bannerDom });
  const cg = await bm.evaluate(GEOM);
  info('C 几何', cg);
  ev('C_win', cWin);
  ev('C_geom', cg);
  await bm.screenshot(SHOTS + '/c1-mobile-duel-win.png');
  check('C1 触屏下到达了 fight 且 is-touch 生效', !!(cg && cg.isTouch), JSON.stringify({ isTouch: cg && cg.isTouch, vw: cg && cg.vw, vh: cg && cg.vh }));
  check('C2 结算面板完全在视口内（不被裁）', !!(cg && cg.inViewport), JSON.stringify(cg && { box: cg.box, vw: cg.vw, vh: cg.vh }));
  check('C3 结算面板不压住触屏控件', !!(cg && cg.overlapCount === 0), JSON.stringify(cg && { overlapCount: cg.overlapCount, overlaps: cg.overlaps, ctrlCount: cg.ctrlCount }));
  check('C4 大字可读（标题字号 >= 28px）', !!(cg && parseFloat(cg.titleFont) >= 28), JSON.stringify({ titleFont: cg && cg.titleFont, vsFont: cg && cg.vsFont, lineFont: cg && cg.lineFont }));

  const cFail = await (async () => {
    const arm2 = await bm.evaluate('window.__V5.secondDuel("miss")');
    return arm2;
  })();
  info('C5 触屏第二局（败北）', { title: cFail.fire.panel && cFail.fire.panel.title, cls: cFail.fire.panel && cFail.fire.panel.cls });
  const cg2 = await bm.evaluate(GEOM);
  ev('C_lose', cFail);
  ev('C_geom_lose', cg2);
  await bm.screenshot(SHOTS + '/c2-mobile-duel-lose.png');
  check('C5 触屏下败北面板同样在视口内且不压控件', !!(cg2 && cg2.inViewport && cg2.overlapCount === 0), JSON.stringify({ inViewport: cg2.inViewport, overlapCount: cg2.overlapCount }));
  info('C errors', bm.errors.slice(0, 5).length ? bm.errors.slice(0, 5) : 'none');
  await bm.close();

}

  if (PHASE === 'all' || PHASE === 'A') {
    head('A13 · 结算面板与同步轴 HUD 的重叠时间线');
    await b.evaluate('window.__V5.duelArm()');
    const a13f = await b.evaluate('window.__V5.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
    const a13 = await b.evaluate('window.__V5.overlapSeries(3400)');
    info('A13 起手', { title: a13f.panel && a13f.panel.title });
    info('A13 时间线', a13);
    ev('A13', a13);
    const ovRows = a13.filter(function (x) { return x.ov > 0; });
    check('A13 结算面板与同步轴 HUD 实际重叠（>1000px²）', ovRows.length >= 1 && Math.max.apply(null, a13.map(function (x) { return x.ov; })) > 1000, JSON.stringify({ overlapSamples: ovRows.length, maxOv: Math.max.apply(null, a13.map(function (x) { return x.ov; })), first: ovRows[0] }));
    await b.screenshot(SHOTS + '/a13-overlap-timeline.png');

    head('A11 · 结算保留期内切标题 / 重开');
    function geomFactory() {
      var res = document.getElementById('duel-result');
      var title = document.getElementById('title');
      var cs = getComputedStyle(res), ct = title ? getComputedStyle(title) : null;
      var rr = res.getBoundingClientRect();
      return { state: window.__SS.state, panelCls: res.className, panelOpacity: cs.opacity, panelZ: cs.zIndex,
        titleZ: ct ? ct.zIndex : null, titleVisible: title ? (ct.display !== 'none' && !title.classList.contains('hidden')) : null,
        panelRect: { x: Math.round(rr.left), y: Math.round(rr.top), w: Math.round(rr.width), h: Math.round(rr.height) } };
    }
    const OV = '(' + geomFactory.toString() + ')()';
    await b.evaluate('window.__V5.duelArm()');
    const a11f = await b.evaluate('window.__V5.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')');
    info('A11 起手', { title: a11f.panel && a11f.panel.title, cls: a11f.panel && a11f.panel.cls });
    const clicked = await b.evaluate('(function () { var el = document.getElementById("btn-totitle"); if (!el) return "no-btn"; el.click(); return "clicked"; })()');
    await sleep(400);
    const a11 = await b.evaluate(OV);
    info('A11 点「返回标题」之后', { clicked: clicked, geom: a11 });
    ev('A11_title', { clicked: clicked, geom: a11 });
    await b.screenshot(SHOTS + '/a11-title-residue.png');
    check('A11 回到标题页后结算大字仍挂在最上层', !!(a11 && a11.state === 'title' && a11.panelCls.indexOf('on') >= 0 && Number(a11.panelZ) > Number(a11.titleZ)), JSON.stringify(a11));

    const a12f = await (async () => { await b.evaluate('window.__V5.duelArm()'); return await b.evaluate('window.__V5.duelFire(' + JSON.stringify({ force: 'sync', tug: 0.4, life: 12 }) + ')'); })();
    const clicked2 = await b.evaluate('(function () { var el = document.getElementById("btn-restart"); if (!el) return "no-btn"; el.click(); return "clicked"; })()');
    await sleep(500);
    const a12 = await b.evaluate(OV);
    info('A12 点「重新开始」之后', { clicked: clicked2, geom: a12 });
    ev('A12_restart', { clicked: clicked2, geom: a12 });
    await b.screenshot(SHOTS + '/a12-restart-residue.png');
    check('A12 重开后结算大字仍留在新一局画面上', !!(a12 && a12.panelCls.indexOf('on') >= 0), JSON.stringify(a12));
  }

  info('pageErrors(final)', b.errors.slice(0, 6).length ? b.errors.slice(0, 6) : 'none');

  const bad = R.filter((x) => !x.ok);
  console.log('\n==== 主视口汇总 ' + (R.length - bad.length) + '/' + R.length + ' PASS ====');
  for (const x of bad) console.log('  FAIL ' + x.name + '  -> ' + x.detail);
} catch (e) {
  console.error('探针异常：', (e && e.stack) || e);
  process.exitCode = 1;
} finally {
  await b.close();
}
