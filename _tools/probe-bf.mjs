/**
 * probe-bf.mjs —— 黑闪「0.000001 秒」机制探针（blackflash 写域）
 * ----------------------------------------------------------------------------
 * 用法：node _tools/probe-bf.mjs [--file tmp/blackflash/dist.html] [--port 9503]
 *
 * 为什么不用"真人按键盘"测判定：判定是**帧**级（命中帧 ±1 帧），CDP 发键盘事件
 * 只能控到毫秒级（±1 帧抖动），测不出 ±3 帧必败这种边界。所以探针用
 * api.update(input, dt, t) 做**帧步进**：一次调用推进一帧、输入完全可控，
 * 走的是 combat 的真实主循环（updatePlayer -> SkillRunner -> tryMelee ->
 * resolver.apply -> HOOKS.blackFlash）。所有试验在同一个同步块里跑完，
 * 主线 rAF 插不进来，所以可复现。
 * 另外还有一组"真实时间 + __INJECT 注入"的测试，验证输入链路本身。
 *
 * 页面侧只用 window.__SS / window.__INJECT / __SS.mech() 三个公开接口，
 * 不读任何模块内部变量（契约 §1.3 的独立验证要求）。
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync as exists, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'tmp/blackflash/dist.html'));
if (!exists(file)) { console.error('找不到 ' + file); process.exit(1); }
const PORT = parseInt(arg('port', '9503'), 10);
const URL = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const SHOTS = 'shots/blackflash';
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(...a);
const J = (o) => JSON.stringify(o);
const b = new Browser({ port: PORT, width: 1280, height: 720 });
const results = { file, pass: [], fail: [], data: {} };
function ok(name, cond, detail) {
  var line = name + (detail === undefined ? '' : ' | ' + detail);
  if (cond) results.pass.push(line); else results.fail.push(line);
  log((cond ? '  [PASS] ' : '  [FAIL] ') + line);
  return !!cond;
}
async function shot(name) {
  await b.evaluate("(() => { const p = document.getElementById('pause'); if (p) p.classList.add('hidden'); return true; })()");
  await sleep(250);
  await b.screenshot(SHOTS + '/' + name + '.png');
  await b.evaluate("(() => { const p = document.getElementById('pause'); if (p && window.__SS && window.__SS.state === 'paused') p.classList.remove('hidden'); return true; })()");
  log('  截图 ' + SHOTS + '/' + name + '.png（截图前临时隐藏暂停面板）');
}

const PAGE = String.raw`window.__BF = (function () {
  var BTN = ["light", "heavy", "blue", "red", "purple", "heal", "dodge", "dash", "domain", "lockOn", "charge", "v"];
  var R = {};
  function A() { return window.__SS.combat; }
  function mech() { return window.__SS.mech().blackFlash; }
  function snap() { return A().getSnapshot(); }
  function mkInput(o) {
    var r = { moveX: 0, moveZ: 0, mouse: { pressed: false } };
    for (var i = 0; i < BTN.length; i++) r[BTN[i]] = false;
    if (o) for (var k in o) r[k] = o[k];
    return r;
  }
  function place() {
    var g = window.__SS.gojo, sk = window.__SS.sukuna;
    var sp = sk.root.position;
    g.root.position.set(sp.x, 0, sp.z + 1.4);
    g.faceTo(sp.x, sp.z, true);
    return { g: [g.root.position.x, g.root.position.z], s: [sp.x, sp.z] };
  }
  function step(o, n) {
    var a = A(); n = n || 1;
    for (var i = 0; i < n; i++) a.update(mkInput(o), 1 / 60, 0);
    return a.frame;
  }
  function hp() { return snap().sukuna.hp; }
  function ce() { return snap().gojo.ce; }
  function sample(tag) {
    var m = mech();
    return { tag: tag, frame: A().frame, hp: Math.round(hp() * 100) / 100, ce: Math.round(ce() * 10) / 10,
      bf: m.bf, hits: m.hits, fails: m.fails, mashes: m.mashes, presses: m.presses, legit: m.legit,
      streak: m.streak, mul: m.mul, mulNext: m.mulNext, win: m.win, chaos: m.chaos, cd: m.cd, judge: m.lastJudge };
  }
  function punch(spec) {
    spec = spec || {};
    var a = A();
    a.reset(); a.setAiEnabled(false); place();
    a.pressFrame.v = -999;
    var hp0 = hp(), ce0 = ce();
    var m0 = mech();
    var f0 = a.frame;
    // lead = 起手到命中的帧数（由基准试验实测）；delta = 目标 |F - P|
    // update() 内部先 cb.frame++ 再读输入，所以一次按下被记录的帧号 = cur + 1
    var pressAt = (spec.lead === null || spec.lead === undefined) ? -1
      : (f0 + spec.lead - 1 - (spec.delta || 0));
    var hit = -1;
    var maxIter = spec.maxIter || 60;
    for (var i = 0; i < maxIter; i++) {
      var cur = a.frame;
      a.update(mkInput({ light: i === 0, v: cur === pressAt }), 1 / 60, 0);
      if (mech().hits > m0.hits) { hit = cur + 1; if (!spec.afterHit) break; }
      if (hit > 0 && spec.afterHit && (cur + 1 - hit) >= spec.afterHit) break;
    }
    var m1 = mech();
    var judge = { F: m1.F, P: m1.P, delta: m1.delta, ok: m1.ok, why: m1.why, win: m1.win, mul: m1.mul };
    return {
      f0: f0, hit: hit, hitRel: hit < 0 ? -1 : hit - f0, pressAt: pressAt,
      dmg: Math.round((hp0 - hp()) * 1000) / 1000,
      ceSpent: Math.round((ce0 - ce()) * 100) / 100,
      judge: judge, ceAtJudge: m1.ceAtJudge, bf: m1.bf - m0.bf, mashes: m1.mashes - m0.mashes,
      bfEvents: (function () { var ev = snap().events || []; var n = 0; for (var q = 0; q < ev.length; q++) if (ev[q].type === "blackflash") n++; return n; })(),
      legit: m1.legit - m0.legit, presses: m1.presses - m0.presses,
      streak: m1.streak, mul: m1.mul, win: m1.win, chaos: m1.chaos, cd: m1.cd,
      ringsSpawned: m1.ringsSpawned - m0.ringsSpawned, ringsSnapped: m1.ringsSnapped - m0.ringsSnapped,
      dotsSpawned: m1.dotsSpawned - m0.dotsSpawned, ringErrMax: m1.ringErrMax
    };
  }
  function mash(spec) {
    spec = spec || {};
    var a = A();
    a.reset(); a.setAiEnabled(false); place();
    var m0 = mech();
    var rnd = spec.seed || 987654321;
    var calls = 0;
    for (var i = 0; i < spec.frames; i++) {
      var press = false;
      if (spec.mode === "every") press = (i % 2 === 0);   // 连点：隔帧一条新边沿（键盘必须先松开）
      else if (spec.mode === "everyN") press = (i % spec.n === 0);
      else { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; press = (rnd / 0x7fffffff) < (spec.p || 0.2); }
      if (press) calls++;
      if (spec.forceEvery && i % spec.forceEvery === 0) a.forceSkill("punch", "gojo");
      var atk = spec.attackEvery ? (i % spec.attackEvery === 0) : false;
      a.update(mkInput({ v: press, light: atk }), 1 / 60, 0);
    }
    var m1 = mech();
    return { mode: spec.mode, frames: spec.frames, pressCalls: calls,
      presses: m1.presses - m0.presses, mashes: m1.mashes - m0.mashes, legit: m1.legit - m0.legit,
      bf: m1.bf - m0.bf, hits: m1.hits - m0.hits, fails: m1.fails - m0.fails,
      chaos: m1.chaos, ce: Math.round(m1.ce * 10) / 10, streak: m1.streak };
  }
  function ceGate(lead) {
    var a = A();
    a.reset(); a.setAiEnabled(false); place(); a.pressFrame.v = -999;
    for (var i = 0; i < 60; i++) a.update(mkInput({ v: (i % 2 === 0) }), 1 / 60, 0);
    var ceLow = Math.round(ce() * 10) / 10, chaosLow = Math.round(mech().chaos * 1000) / 1000;
    step({}, 40);
    var ceAtStart = Math.round(ce() * 10) / 10, chaosMid = Math.round(mech().chaos * 1000) / 1000;
    var hp0 = hp(), m1 = mech();
    var f0 = a.frame, hit = -1, pressAt = f0 + lead - 1;
    for (var j = 0; j < 40; j++) {
      var cur = a.frame;
      a.update(mkInput({ light: j === 0, v: cur === pressAt }), 1 / 60, 0);
      if (mech().hits > m1.hits) { hit = cur + 1; break; }
    }
    var m2 = mech();
    return { ceAfterDrain: ceLow, chaosAfterDrain: chaosLow, ceAtSync: ceAtStart, chaosAtSync: chaosMid,
      hit: hit, hitRel: hit - f0, bf: m2.bf - m1.bf, dmg: Math.round((hp0 - hp()) * 1000) / 1000,
      judge: { F: m2.F, P: m2.P, delta: m2.delta, ok: m2.ok, why: m2.why } };
  }
  function chain(n, lead) {
    var a = A();
    a.reset(); a.setAiEnabled(false); place(); a.pressFrame.v = -999;
    var seq = [];
    var m0 = mech(), hp0 = hp();
    var f0 = a.frame, hit = -1;
    for (var i = 0; i < 60; i++) {
      var cur = a.frame;
      a.update(mkInput({ light: i === 0, v: cur === f0 + lead - 1 }), 1 / 60, 0);
      if (mech().hits > m0.hits) { hit = cur + 1; break; }
    }
    seq.push({ i: 1, hitRel: hit - f0, dmg: Math.round((hp0 - hp()) * 1000) / 1000, mul: mech().mul, streak: mech().streak,
      win: mech().win, cd: mech().cd, judge: { F: mech().F, P: mech().P, delta: mech().delta, ok: mech().ok, why: mech().why } });
    for (var k = 2; k <= n; k++) {
      step({}, 200);
      var hpB = hp(), hitsB = mech().hits;
      a.forceSkill("punch", "gojo");
      var start = a.frame, hit2 = -1, dmg = 0, jr = null;
      for (var j = 0; j < 40; j++) {
        var c2 = a.frame;
        a.update(mkInput({ v: c2 === start + lead - 1 }), 1 / 60, 0);
        if (mech().hits > hitsB) { hit2 = c2 + 1; dmg = hpB - hp(); jr = { F: mech().F, P: mech().P, delta: mech().delta, ok: mech().ok, why: mech().why }; break; }
      }
      seq.push({ i: k, hitRel: hit2 < 0 ? -1 : hit2 - start, dmg: Math.round(dmg * 1000) / 1000, mul: mech().mul, streak: mech().streak,
        win: mech().win, cd: mech().cd, judge: jr });
    }
    return seq;
  }
  function visuals() {
    var sc = window.__SS.scene;
    var rings = [], dots = [];
    if (sc && sc.children) {
      for (var i = 0; i < sc.children.length; i++) {
        var o = sc.children[i];
        if (o.renderOrder === 6) rings.push({ vis: !!o.visible, s: Math.round(o.scale.x * 10000) / 10000 });
        if (o.renderOrder === 7) dots.push({ vis: !!o.visible, s: Math.round(o.scale.x * 10000) / 10000, op: Math.round((o.material ? o.material.opacity : 0) * 100) / 100 });
      }
    }
    return { rings: rings, dots: dots };
  }
  function rtMash(spec) {
    return new Promise(function (res) {
      var a = A();
      var m0 = mech(), f0 = a.frame;
      var t0 = performance.now(), n = 0, atk = 0;
      function loop() {
        if (performance.now() - t0 >= spec.ms) {
          var m1 = mech();
          res({ ms: Math.round(performance.now() - t0), frames: a.frame - f0, injected: n, attacks: atk,
            presses: m1.presses - m0.presses, mashes: m1.mashes - m0.mashes, legit: m1.legit - m0.legit,
            bf: m1.bf - m0.bf, hits: m1.hits - m0.hits, chaos: m1.chaos, ce: Math.round(m1.ce * 10) / 10 });
          return;
        }
        if (n % 2 === 0) { window.__INJECT.press("KeyV"); } else { window.__INJECT.release("KeyV"); }
        n++;
        if (spec.attackEvery && n % spec.attackEvery === 0) { window.__INJECT.press("KeyJ"); window.__INJECT.release("KeyJ"); atk++; }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
  }
  function cdGate(lead) {
    var a = A();
    a.reset(); a.setAiEnabled(false); place(); a.pressFrame.v = -999;
    var m0 = mech();
    var f0 = a.frame, hit1 = -1;
    for (var i = 0; i < 40; i++) {
      var cur = a.frame;
      a.update(mkInput({ light: i === 0, v: cur === f0 + lead - 1 }), 1 / 60, 0);
      if (mech().hits > m0.hits) { hit1 = cur + 1; break; }
    }
    var first = { hitRel: hit1 - f0, cd: mech().cd, bf: mech().bf,
      judge: { F: mech().F, P: mech().P, delta: mech().delta, ok: mech().ok, why: mech().why } };
    step({}, 20);
    var hitsB = mech().hits, hpB = hp(), bfB = mech().bf;
    a.forceSkill("punch", "gojo");
    var start = a.frame, hit2 = -1;
    for (var j = 0; j < 40; j++) {
      var c2 = a.frame;
      a.update(mkInput({ v: c2 === start + lead - 1 }), 1 / 60, 0);
      if (mech().hits > hitsB) { hit2 = c2 + 1; break; }
    }
    return { first: first, second: { hitRel: hit2 - start, bfDelta: mech().bf - bfB, cdAtSecond: mech().cd,
      dmg: Math.round((hpB - hp()) * 1000) / 1000, win: mech().win,
      judge: { F: mech().F, P: mech().P, delta: mech().delta, ok: mech().ok, why: mech().why } } };
  }
  R.cdGate = cdGate;
  function syncStreak(n, lead) {
    var a = A();
    a.reset(); a.setAiEnabled(false); place(); a.pressFrame.v = -999;
    var out = [];
    for (var k = 1; k <= n; k++) {
      if (k > 1) step({}, 205);          // 等满 3.2s 黑闪冷却（205 帧 = 3.42s）
      var f0 = a.frame, hp0 = hp(), hit = -1;
      var h0 = mech().hits;
      for (var i = 0; i < 45; i++) {
        var cur = a.frame;
        a.update(mkInput({ light: i === 0, v: cur === f0 + lead - 1 }), 1 / 60, 0);
        if (mech().hits > h0) { hit = cur + 1; break; }
      }
      var m = mech();
      out.push({ k: k, hitRel: hit - f0, delta: m.delta, ok: m.ok, why: m.why, mul: m.mul, streak: m.streak,
        dmg: Math.round((hp0 - hp()) * 1000) / 1000, ce: m.ce });
    }
    return out;
  }
  function btnInfo() {
    var el = document.getElementById("ss-bf-key");
    if (!el) return { exists: false };
    var r = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var top = document.elementFromPoint(cx, cy);
    var overlaps = [];
    var vw = window.innerWidth, vh = window.innerHeight;
    var all = document.querySelectorAll("body *");
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === el || el.contains(o) || o.contains(el)) continue;
      var s2 = window.getComputedStyle(o);
      if (s2.position !== "fixed" && s2.position !== "absolute") continue;
      if (s2.display === "none" || s2.visibility === "hidden" || Number(s2.opacity || 1) < 0.05) continue;
      var rr = o.getBoundingClientRect();
      if (rr.width < 2 || rr.height < 2) continue;
      if (rr.width * rr.height > vw * vh * 0.5) continue;   // 整屏容器（#gl / #hud / #touch-ui）不算重叠
      var ox = Math.max(0, Math.min(r.right, rr.right) - Math.max(r.left, rr.left));
      var oy = Math.max(0, Math.min(r.bottom, rr.bottom) - Math.max(r.top, rr.top));
      if (ox * oy < 4) continue;
      overlaps.push({ who: String(o.id || o.className || o.tagName).slice(0, 40), area: Math.round(ox * oy) });
    }
    // 五个采样点都必须落在按钮自己身上（比矩形相交更严格）
    var pts = [[r.left + 5, r.top + 5], [r.right - 5, r.top + 5], [r.left + 5, r.bottom - 5], [r.right - 5, r.bottom - 5], [cx, cy]];
    var hitAll = true;
    for (var k = 0; k < pts.length; k++) {
      var t2 = document.elementFromPoint(pts[k][0], pts[k][1]);
      if (!(t2 === el || el.contains(t2))) hitAll = false;
    }
    return { exists: true, hitAll: hitAll, display: cs.display, w: Math.round(r.width), h: Math.round(r.height),
      left: Math.round(r.left), top: Math.round(r.top), cx: Math.round(cx), cy: Math.round(cy),
      hitSelf: top === el || el.contains(top),
      hitWho: top ? String(top.id || top.className || top.tagName).slice(0, 40) : null,
      z: cs.zIndex, overlaps: overlaps };
  }
  function calibrateLead() {
    return new Promise(function (res) {
      var a = A(), h0 = mech().hits;
      a.reset(); a.setAiEnabled(false); place(); a.pressFrame.v = -999;
      window.__INJECT.press("KeyJ"); window.__INJECT.release("KeyJ");
      var start = a.frame;
      function loop() {
        if (mech().hits > h0) { res({ start: start, hit: mech().F, lead: mech().F - start }); return; }
        if (a.frame - start > 60) { res({ start: start, hit: -1, lead: -1 }); return; }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
  }
  function touchSync(spec) {
    return new Promise(function (res) {
      var a = A();
      a.reset(); a.setAiEnabled(false); place(); a.pressFrame.v = -999;
      var m0 = mech();
      var h0 = m0.hits;
      var btn = document.getElementById("ss-bf-key");
      if (!btn) { res({ error: "no-button" }); return; }
      var r = btn.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var el = document.elementFromPoint(cx, cy) || btn;      // 命中测试：真正点到的是谁
      window.__INJECT.press("KeyJ"); window.__INJECT.release("KeyJ");
      var start = a.frame, downAt = -1, upAt = -1;
      function loop() {
        var cur = a.frame;
        if (downAt < 0 && cur >= start + spec.lead - 1) {
          el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true }));
          downAt = cur;
        } else if (downAt > 0 && upAt < 0 && cur >= downAt + 1) {
          el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true }));
          upAt = cur;
        }
        if (cur >= start + spec.lead + 16) {
          var m1 = mech();
          res({ lead: spec.lead, startFrame: start, downAt: downAt, upAt: upAt, hitFrame: m1.F,
            delta: m1.delta, ok: m1.ok, bf: m1.bf - m0.bf, presses: m1.presses - m0.presses,
            mashes: m1.mashes - m0.mashes, legit: m1.legit - m0.legit, win: m1.win, ce: m1.ce,
            statsBF: window.__SS.stats.blackFlash, hitViaButton: el === btn });
          return;
        }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
  }
  R.syncStreak = syncStreak;
  R.btnInfo = btnInfo;
  R.calibrateLead = calibrateLead;
  R.touchSync = touchSync;
  R.ready = function () { return !!(window.__SS && window.__SS.combat && window.__SS.mech().blackFlash); };
  R.place = place;
  R.punch = punch;
  R.mash = mash;
  R.ceGate = ceGate;
  R.chain = chain;
  R.visuals = visuals;
  R.rtMash = rtMash;
  R.sample = sample;
  R.step = step;
  R.frame = function () { return A().frame; };
  R.pressFrame = function () { return A().pressFrame; };
  R.mech = mech;
  R.hp = hp;
  R.ce = ce;
  R.resetLocal = function () { A().reset(); A().setAiEnabled(false); place(); return A().frame; };
  return R;

})();
true`;
async function boot() {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate("(() => { const e = document.getElementById('btn-skip-cine'); if (e) e.click(); return true; })()");
  for (let i = 0; i < 100; i++) {
    await sleep(400);
    const st = await b.evaluate('window.__SS && window.__SS.state');
    if (st === 'fight') break;
  }
  await b.evaluate(PAGE);
  await b.evaluate('(() => { window.__SS.combat.setAiEnabled(false); return true; })()');
  await sleep(600);
  const info = await b.evaluate('({ state: window.__SS.state, frame: window.__SS.combat.frame, mech: Object.keys(window.__SS.mech()).join(",") })');
  log('boot: ' + J(info));
  return info;
}

async function run() {
  const info = await boot();
  const dbg0 = await b.evaluate('window.__SS.mech().blackFlash');
  results.data.mech0 = dbg0;
  ok('MECH_DEBUG.blackFlash 已注册且字段齐全',
    dbg0 && typeof dbg0.F === 'number' && typeof dbg0.P === 'number' && typeof dbg0.delta === 'number'
    && typeof dbg0.ok === 'boolean' && typeof dbg0.ce === 'number' && typeof dbg0.chaos === 'number'
    && typeof dbg0.streak === 'number' && typeof dbg0.mul === 'number' && typeof dbg0.hits === 'number'
    && typeof dbg0.fails === 'number', J(dbg0).slice(0, 320));

  log('');
  log('== 1. 真实输入链路：KeyV -> cb.pressFrame.v（__INJECT 注入）==');
  const iv0 = await b.evaluate('({ pv: window.__SS.combat.pressFrame.v, frame: window.__SS.combat.frame, presses: window.__SS.mech().blackFlash.presses, mashes: window.__SS.mech().blackFlash.mashes })');
  await b.evaluate('(() => { window.__INJECT.press("KeyV"); window.__INJECT.release("KeyV"); return true; })()');
  await sleep(150);
  const iv1 = await b.evaluate('({ pv: window.__SS.combat.pressFrame.v, frame: window.__SS.combat.frame, presses: window.__SS.mech().blackFlash.presses, mashes: window.__SS.mech().blackFlash.mashes, chaos: window.__SS.mech().blackFlash.chaos })');
  results.data.inject = { before: iv0, after: iv1 };
  log('  inject 前 ' + J(iv0) + ' -> 后 ' + J(iv1));
  ok('KeyV 能写进 pressFrame.v（真实输入链路）', iv1.pv > iv0.pv && iv1.presses > iv0.presses, 'pv ' + iv0.pv + '->' + iv1.pv);
  ok('非命中帧的乱按 -> 咒力紊乱 + 扣咒力', iv1.mashes > iv0.mashes && iv1.chaos > 0, 'mashes=' + iv1.mashes + ' chaos=' + iv1.chaos);

  log('');
  log('== 2. 判定矩阵（帧步进，命中帧 F 由 mech().F 实测）==');
  const base = await b.evaluate('window.__BF.punch(' + J({ lead: null }) + ')');
  results.data.base = base;
  log('  基准（不按 V）: ' + J(base));
  ok('不按 V：近战命中但不触发黑闪', base.hitRel > 0 && base.bf === 0 && base.judge && base.judge.ok === false, 'hitRel=' + base.hitRel + ' dmg=' + base.dmg);
  ok('命中帧无论成败都有 1 帧闪点', base.dotsSpawned >= 1, 'dots=' + base.dotsSpawned);
  ok('每次挥击有收缩环，且在命中帧收缩到 0', base.ringsSpawned >= 1 && base.ringsSnapped >= 1, 'spawned=' + base.ringsSpawned + ' snapped=' + base.ringsSnapped + ' 预测误差=' + base.ringErrMax + ' 帧');
  const hitRel = base.hitRel;
  const rows = [];
  const wantOk = { 0: true, 1: true, 2: false, 3: false, 4: false };
  for (const k of [0, 1, 2, 3, 4]) {
    const r = await b.evaluate('window.__BF.punch(' + J({ lead: hitRel, delta: k }) + ')');
    rows.push({ k: k, delta: r.judge ? r.judge.delta : null, ok: r.judge ? r.judge.ok : null, why: r.judge ? r.judge.why : null, bf: r.bf, dmg: r.dmg, mul: r.mul, ceSpent: r.ceSpent, ceAtJudge: r.ceAtJudge, bfEvents: r.bfEvents });
    log('  P=F-' + k + ' (delta=' + (r.judge ? r.judge.delta : '?') + '): ok=' + (r.judge ? r.judge.ok : '?') + ' why=' + (r.judge ? r.judge.why : '?') + ' bf=' + r.bf + ' dmg=' + r.dmg + ' mul=' + r.mul + ' ceSpent=' + r.ceSpent);
    ok('delta=' + k + ' ' + (wantOk[k] ? '同步成功' : '不算黑闪'), !!(r.judge && r.judge.ok === wantOk[k] && r.judge.delta === k), '实测delta=' + (r.judge ? r.judge.delta : '?') + ' why=' + (r.judge ? r.judge.why : '?'));
  }
  results.data.matrix = rows;
  const bfRow = rows[0], normalRow = base;
  const ratio = bfRow.dmg / normalRow.dmg;
  results.data.damageRatio = Math.round(ratio * 1000) / 1000;
  log('  伤害对比: 黑闪 ' + bfRow.dmg + ' / 普通 ' + normalRow.dmg + ' = ' + (Math.round(ratio * 1000) / 1000));
  ok('黑闪伤害 >= 同招普通命中 2.4 倍', ratio >= 2.4, 'ratio=' + (Math.round(ratio * 1000) / 1000));
  ok('黑闪命中扣 8 咒力', Math.abs((100 - bfRow.ceAtJudge) - 8) < 0.25, 'ceAtJudge=' + bfRow.ceAtJudge + '（满咒力 100 扣到 ' + bfRow.ceAtJudge + '）；ceSpent 净额 ' + bfRow.ceSpent + ' 还含 combat.js 命中回 1.5');
  ok('沿用既有黑闪事件链路（callout/音效/镜头/stats.blackFlash 都由 combat.js 的 blackflash 事件驱动）', rows[0].bfEvents >= 1, '命中帧同帧 pushEvent(blackflash) x' + rows[0].bfEvents);
  const late = await b.evaluate('window.__BF.punch(' + J({ lead: hitRel, delta: -1, afterHit: 2 }) + ')');
  results.data.latePress = { bf: late.bf, mashes: late.mashes, legit: late.legit, ok: late.judge && late.judge.ok };
  log('  命中后 1 帧的按下: ' + J(results.data.latePress));
  ok('命中后 1 帧的 V 不算乱按（不罚紊乱）', late.mashes === 0 && late.legit >= 1, 'mashes=' + late.mashes + ' legit=' + late.legit);

  log('');
  log('== 2b. 正面证据：连续 10 次帧级精确同步（真实轻击起手 + 走完整主循环 + 等满冷却）==');
  const streak = await b.evaluate('window.__BF.syncStreak(10, ' + hitRel + ')');
  results.data.syncStreak = streak;
  const okN = streak.filter((x) => x.ok === true).length;
  log('  10 次结果: ' + J(streak.map((x) => ({ k: x.k, hitRel: x.hitRel, delta: x.delta, ok: x.ok, why: x.why, mul: x.mul, dmg: x.dmg }))));
  ok('连续 10 次帧级精确同步 -> 10/10 成功', okN === 10, okN + '/10');
  ok('10 次都靠真实轻击起手（命中帧间隔稳定）', streak.every((x) => x.hitRel === hitRel), J(streak.map((x) => x.hitRel)));
  ok('10 次倍率单调升到 3.5 封顶', streak[0].mul === 2.5 && streak[9].mul === 3.5, J(streak.map((x) => x.mul)));

  log('');
  log('== 3. 反乱按（本模块核心难点）==');
  const r1 = await b.evaluate('window.__BF.mash(' + J({ mode: 'random', p: 0.25, frames: 2000, seed: 20260912 }) + ')');
  log('  R1 随机时刻按 V（无攻击）: ' + J(r1));
  ok('随机按 V 500 次 -> 黑闪 0 次', r1.bf === 0 && r1.pressCalls >= 400, 'pressCalls=' + r1.pressCalls + ' bf=' + r1.bf + ' mashes=' + r1.mashes);
  const r1b = await b.evaluate('window.__BF.mash(' + J({ mode: 'random', p: 0.25, frames: 2000, seed: 777, forceEvery: 25 }) + ')');
  log('  R1b 随机按 V + 每 25 帧一次近战命中: ' + J(r1b));
  ok('随机按 V 的同时持续命中 -> 黑闪 0 次', r1b.bf === 0 && r1b.pressCalls >= 400 && r1b.hits > 40, 'hits=' + r1b.hits + ' bf=' + r1b.bf);
  const r2 = await b.evaluate('window.__BF.mash(' + J({ mode: 'every', frames: 600, attackEvery: 20 }) + ')');
  log('  R2 每帧连点 V + 每 20 帧真实轻击: ' + J(r2));
  ok('每帧连点 V（真实攻击）-> 黑闪 0 次', r2.bf === 0 && r2.hits > 5, 'hits=' + r2.hits + ' bf=' + r2.bf + ' mashes=' + r2.mashes);
  const r3 = await b.evaluate('window.__BF.mash(' + J({ mode: 'every', frames: 600, forceEvery: 8 }) + ')');
  log('  R3 每帧连点 V + 每 8 帧一次近战命中（远超真实攻速）: ' + J(r3));
  ok('每帧连点 V（命中密度 7.5/s）-> 黑闪 0 次', r3.bf === 0 && r3.hits > 30, 'hits=' + r3.hits + ' bf=' + r3.bf);
  const r4 = await b.evaluate('window.__BF.mash(' + J({ mode: 'everyN', n: 5, frames: 900, forceEvery: 25 }) + ')');
  log('  R4 每 5 帧按一次 V + 近战命中: ' + J(r4));
  ok('稀疏连点（5 帧一次）-> 黑闪 0 次', r4.bf === 0 && r4.hits > 20, 'hits=' + r4.hits + ' bf=' + r4.bf);
  await b.evaluate('window.__BF.resetLocal()');
  const r5 = await b.evaluate('window.__BF.rtMash(' + J({ ms: 3000, attackEvery: 4 }) + ')');
  log('  R5 真实时间 3s：每帧 __INJECT 注 V + 同时按 J 攻击: ' + J(r5));
  ok('真实时间连点 V -> 黑闪 0 次', r5.bf === 0 && r5.presses > 30, 'injected=' + r5.injected + ' presses=' + r5.presses + ' bf=' + r5.bf + ' hits=' + r5.hits);
  results.data.antimash = { r1: r1, r1b: r1b, r2: r2, r3: r3, r4: r4, r5: r5 };

  log('');
  log('== 4. 硬性前提与连闪（CD / CE / 倍率升级）==');
  const cdg = await b.evaluate('window.__BF.cdGate(' + hitRel + ')');
  results.data.cdGate = cdg;
  log('  CD 门槛: 第一发 ' + J(cdg.first) + ' -> 冷却内第二发 ' + J(cdg.second));
  ok('3.2s 冷却内再同步 -> 不算黑闪（why=cooldown）', cdg.first.judge && cdg.first.judge.ok === true && cdg.second.judge && cdg.second.judge.ok === false && cdg.second.judge.why === 'cooldown', 'why=' + (cdg.second.judge ? cdg.second.judge.why : '?') + ' cd=' + cdg.second.cdAtSecond);
  const cg = await b.evaluate('window.__BF.ceGate(' + hitRel + ')');
  results.data.ceGate = cg;
  log('  CE 门槛: ' + J(cg));
  ok('连点抽干咒力后 ce < 8 -> 完美同步也不算黑闪（why=ce）', cg.ceAtSync < 8 && cg.chaosAtSync === 0 && cg.judge && cg.judge.ok === false && cg.judge.why === 'ce', 'ce=' + cg.ceAtSync + ' chaos=' + cg.chaosAtSync + ' why=' + (cg.judge ? cg.judge.why : '?'));
  const ch = await b.evaluate('window.__BF.chain(6, ' + hitRel + ')');
  results.data.chain = ch;
  log('  连闪链: ' + J(ch.map(function (x) { return { i: x.i, dmg: x.dmg, mul: x.mul, streak: x.streak, win: x.win, ok: x.judge && x.judge.ok, delta: x.judge && x.judge.delta }; })));
  const muls = ch.map((x) => x.mul);
  ok('连闪倍率链 2.5/2.75/3/3.25/3.5/3.5（第 6 次封顶）', J(muls) === J([2.5, 2.75, 3, 3.25, 3.5, 3.5]), J(muls));
  const chRatio = ch[5].dmg / base.dmg;
  ok('第 5 次黑闪伤害 = 普通命中 x3.5', Math.abs(chRatio - 3.5) < 0.03, 'dmg=' + ch[5].dmg + ' ratio=' + (Math.round(chRatio * 1000) / 1000));
  ok('连闪链每一发都真的打出黑闪', ch.every((x) => x.judge && x.judge.ok === true), J(ch.map((x) => x.judge && x.judge.delta)));
  const touch = await b.evaluate('(function () { document.documentElement.classList.add("is-touch"); var r = window.__BF.punch(' + J({ lead: hitRel, delta: 2 }) + '); document.documentElement.classList.remove("is-touch"); return { win: r.win, ok: r.judge && r.judge.ok, delta: r.judge && r.judge.delta, bf: r.bf }; })()');
  results.data.touch = touch;
  log('  触屏窗口: delta=-2 时 ' + J(touch) + '（桌面基准 win=' + base.win + '）');
  ok('触屏 html.is-touch -> 窗口放宽到 ±2 帧', touch.win === 2 && touch.ok === true, 'win=' + touch.win + ' delta=' + touch.delta);
  ok('桌面窗口 baseline = ±1 帧', base.win === 1, 'win=' + base.win);

  log('');
  log('== 5. 可读性（收缩环 / 1 帧闪点 / 截图）==');
  const vis = await b.evaluate('(function () { window.__BF.resetLocal(); window.__BF.step({ light: true }, 1); window.__BF.step({}, 2); var v = window.__BF.visuals(); window.__INJECT.press("Escape"); window.__INJECT.release("Escape"); return v; })()');
  results.data.ringVisual = vis;
  log('  起手后 3 帧场景里的收缩环: ' + J(vis.rings));
  ok('收缩环在挥击中出现且半径 > 0', vis.rings.length > 0 && vis.rings.some((r) => r.vis && r.s > 0.1), J(vis.rings));
  await sleep(600);
  await shot('01-ring-midswing');
  const st1 = await b.evaluate('(() => { window.__INJECT.press("Escape"); window.__INJECT.release("Escape"); return window.__SS.state; })()');
  await sleep(500);
  log('  恢复: state=' + st1);
  const shWin = await b.evaluate('(function () { var r = window.__BF.punch(' + J({ lead: hitRel, delta: 0 }) + '); var v = window.__BF.visuals(); window.__INJECT.press("Escape"); window.__INJECT.release("Escape"); return { ok: r.judge && r.judge.ok, dmg: r.dmg, dot: v.dots, ring: v.rings }; })()');
  results.data.shotWin = shWin;
  log('  黑闪命中帧: ' + J(shWin));
  await sleep(600);
  await shot('02-bf-hit');
  await b.evaluate('(() => { window.__INJECT.press("Escape"); window.__INJECT.release("Escape"); return window.__SS.state; })()');
  await sleep(400);
  const shFail = await b.evaluate('(function () { var r = window.__BF.punch(' + J({ lead: hitRel, delta: 3 }) + '); var v = window.__BF.visuals(); window.__INJECT.press("Escape"); window.__INJECT.release("Escape"); return { ok: r.judge && r.judge.ok, why: r.judge && r.judge.why, dot: v.dots }; })()');
  results.data.shotFail = shFail;
  log('  未同步命中帧: ' + J(shFail));
  ok('未同步命中帧给出灰色闪点', shFail.ok === false && shFail.dot.some((d) => d.vis), J(shFail.dot));
  await sleep(600);
  await shot('03-bf-fail');
  await b.evaluate('(() => { window.__INJECT.press("Escape"); window.__INJECT.release("Escape"); return window.__SS.state; })()');
  await sleep(400);

  log('');
  log('== 6. 低画质降级（?q=low）==');
  results.data.qualityHigh = await b.evaluate('window.__SS.quality');
  await b.send('Page.navigate', { url: URL + '?q=low' });
  await sleep(13000);
  await b.evaluate("(() => { const e = document.getElementById('btn-skip-cine'); if (e) e.click(); return true; })()");
  for (let i = 0; i < 100; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(PAGE);
  await b.evaluate('(() => { window.__SS.combat.setAiEnabled(false); return true; })()');
  await sleep(600);
  const q2 = await b.evaluate('window.__SS.quality');
  const lowBase = await b.evaluate('window.__BF.punch(' + J({ lead: null }) + ')');
  const lowBF = await b.evaluate('(function () { var r = window.__BF.punch(' + J({ lead: lowBase.hitRel, delta: 0 }) + '); var v = window.__BF.visuals(); window.__INJECT.press("Escape"); window.__INJECT.release("Escape"); return { judge: r.judge, dmg: r.dmg, rings: r.ringsSpawned, dots: r.dotsSpawned, vis: v }; })()');
  results.data.low = { quality: q2, baseRings: lowBase.ringsSpawned, baseDots: lowBase.dotsSpawned, baseDmg: lowBase.dmg, hitRel: lowBase.hitRel, bfOk: lowBF.judge && lowBF.judge.ok, bfDmg: lowBF.dmg };
  log('  低画质 ' + q2 + ': ' + J(results.data.low));
  ok('低画质下机制完整（环 / 闪点 / 2.5 倍）', q2 === 'low' && lowBase.ringsSpawned >= 1 && lowBase.dotsSpawned >= 1 && lowBF.judge && lowBF.judge.ok === true, J(results.data.low));
  await sleep(500);
  await shot('04-low-quality-bf');

  log('');
  log('== 7. 触屏「咒」按钮（844x390 + is-touch + CDP 真实 touch 事件）==');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate("(() => { const e = document.getElementById('btn-skip-cine'); if (e) e.click(); return true; })()");
  for (let i = 0; i < 100; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(PAGE);
  await b.evaluate('(() => { window.__SS.combat.setAiEnabled(false); return true; })()');
  await sleep(800);
  const mob = await b.evaluate('({ touch: document.documentElement.classList.contains("is-touch"), mechTouch: window.__SS.mech().blackFlash.touch, win: window.__SS.mech().blackFlash.win, quality: window.__SS.quality, mtp: navigator.maxTouchPoints })');
  results.data.mobile = mob;
  log('  移动视图: ' + J(mob));
  ok('html.is-touch 生效且窗口放宽到 ±2', mob.touch === true && mob.mechTouch === true && mob.win === 2, J(mob));
  const bi = await b.evaluate('window.__BF.btnInfo()');
  results.data.btnInfo = bi;
  log('  「咒」按钮: ' + J(bi));
  ok('按钮存在、可见、命中区 >= 48x48 CSS px', bi.exists && bi.display !== 'none' && bi.w >= 48 && bi.h >= 48, 'display=' + bi.display + ' ' + bi.w + 'x' + bi.h);
  ok('按钮中心 elementFromPoint 命中自身', bi.hitSelf === true, 'who=' + bi.hitWho);
  ok('按钮四角+中心 5 个采样点全部命中自身（无控件压在上面）', bi.hitAll === true, 'hitAll=' + bi.hitAll);
  ok('按钮不与任何 HUD/摇杆/技能键/工具键重叠', bi.overlaps.length === 0, J(bi.overlaps));
  const pv0 = await b.evaluate('({ pv: window.__SS.combat.pressFrame.v, presses: window.__SS.mech().blackFlash.presses, mashes: window.__SS.mech().blackFlash.mashes })');
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bi.cx, y: bi.cy, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
  await sleep(160);
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
  const pv1 = await b.evaluate('({ pv: window.__SS.combat.pressFrame.v, presses: window.__SS.mech().blackFlash.presses, mashes: window.__SS.mech().blackFlash.mashes })');
  results.data.touchPress = { before: pv0, after: pv1 };
  log('  CDP touchStart/touchEnd: ' + J(pv0) + ' -> ' + J(pv1));
  ok('CDP 真实 touch 按下「咒」-> pressFrame.v 前进且计入一次按下', pv1.pv > pv0.pv && pv1.presses > pv0.presses, 'pv ' + pv0.pv + '->' + pv1.pv);
  const cal = await b.evaluate('window.__BF.calibrateLead()');
  log('  实时标定（真实按 J 起手到命中）: ' + J(cal));
  const tries = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(3600);                 // 等满 3.2s 黑闪冷却
    const tr = await b.evaluate('window.__BF.touchSync(' + J({ lead: cal.lead }) + ')');
    tries.push(tr);
    log('  第 ' + (i + 1) + ' 次触屏同步: ' + J(tr));
  }
  const touchOk = tries.filter((t) => t.ok === true).length;
  results.data.touchSync = { cal: cal, tries: tries, success: touchOk };
  ok('「咒」按钮（真实 TouchEvent + elementFromPoint）能打出黑闪', touchOk >= 1, touchOk + '/3');
  ok('触屏黑闪计入 stats.blackFlash（沿用既有统计）', tries.some((t) => t.statsBF > 0), 'stats.blackFlash=' + tries.map((t) => t.statsBF).join('/'));
  await shot('05-touch-844x390');

  log('');
  log('===== 汇总 =====');
  log('PASS ' + results.pass.length + ' / FAIL ' + results.fail.length);
  if (results.fail.length) log('失败项: ' + J(results.fail));
  log('data: ' + J(results.data));
  log('页面错误: ' + J(b.errors.slice(0, 5)));
  await b.close();
  process.exit(results.fail.length ? 1 : 0);
}

run().catch(async (e) => {
  log('FATAL ' + String(e && e.stack || e).slice(0, 900));
  results.fatal = String(e && e.message || e);
  log('已完成的断言: PASS ' + results.pass.length + ' / FAIL ' + results.fail.length);
  try { await b.close(); } catch (e2) { /* 忽略 */ }
  process.exit(1);
});

