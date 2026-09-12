/**
 * main.js —— 装配层：输入 → 固定帧 sim → 表现层；模式机（标题/选人/对战/暂停/结算）
 * ----------------------------------------------------------------------------
 * 唯一允许同时碰 DOM 与 sim 的地方，且只能单向：UI → 输入包；state → UI。
 */
window.__ERRS = [];
window.addEventListener("error", function (e) { window.__ERRS.push(String(e.message || e)); });
window.addEventListener("unhandledrejection", function (e) { window.__ERRS.push("rejection: " + String(e.reason)); });

var MAIN = (function () {
  var canvas = document.getElementById("stage");
  var view = createSceneView(canvas);
  var world = createWorld({ seed: 20260913 });
  var hud = HUD.build(document.getElementById("overlay"));
  var sc = Screens.build(document.getElementById("overlay"));

  var mode = "title";           // title | fight | pause | result
  var pausedSim = false;        // 探针用：暂停 rAF 驱动，改手动 step
  var fixedAcc = 0, lastT = 0;
  var keys = {};
  var tstart = 0;               // 用于触屏与鼠标
  var stats = { dealt: 0, taken: 0, bf: 0, exec: 0, domain: 0, maxCombo: 0, parry: 0, time: 0 };
  var pick = { char: "gojo", diff: 1 };
  var touch = { x: 0, y: 0, active: false };

  function isTouch() { return ("ontouchstart" in window) || navigator.maxTouchPoints > 0; }

  /* ---------------- 输入采样 ---------------- */
  function readKeys() {
    var inp = emptyInput();
    inp.moveX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    inp.moveZ = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    inp.light = !!keys.KeyJ;
    inp.heavy = !!keys.KeyK;
    inp.blue = !!keys.KeyU;
    inp.red = !!keys.KeyI;
    inp.purple = !!keys.KeyO;
    inp.heal = !!keys.KeyH;
    inp.domain = !!keys.KeyG;
    inp.parry = !!keys.Space;
    inp.dodge = !!(keys.ShiftLeft || keys.ShiftRight);
    inp.v = !!keys.KeyV;
    if (touch.active) { inp.moveX += touch.x; inp.moveZ += touch.y; }
    var m = Math.hypot(inp.moveX, inp.moveZ);
    if (m > 1) { inp.moveX /= m; inp.moveZ /= m; }
    return inp;
  }
  function onKey(e, down) {
    var c = e.code;
    if (down && mode === "title") {
      if (c === "Digit1") { pick.char = "gojo"; Screens.setPick(sc, "gojo"); }
      if (c === "Digit2") { pick.char = "sukuna"; Screens.setPick(sc, "sukuna"); }
      if (c === "Enter" || c === "NumpadEnter") startMatch();
      if (c === "ArrowLeft" || c === "ArrowRight") { pick.diff = Math.max(0, Math.min(2, pick.diff + (c === "ArrowLeft" ? -1 : 1))); Screens.setDiff(sc, pick.diff); }
    }
    if (down && c === "KeyR") { if (mode === "fight" || mode === "pause" || mode === "result") startMatch(); }
    if (down && (c === "Escape" || c === "KeyP")) {
      if (mode === "fight") { mode = "pause"; Screens.setMode(sc, "pause"); }
      else if (mode === "pause") { mode = "fight"; Screens.setMode(sc, "fight"); }
    }
    keys[c] = down;
    if (c === "Space") e.preventDefault();
  }
  window.addEventListener("keydown", function (e) { SFX.unlock(); onKey(e, true); });
  window.addEventListener("keyup", function (e) { onKey(e, false); });

  /* ---------------- 触屏 ---------------- */
  function bindTouch() {
    if (!isTouch()) return;
    document.documentElement.classList.add("is-touch");
    var zone = document.getElementById("stick");
    var knob = document.getElementById("stick-knob");
    if (zone) {
      var rect = null, cx = 0, cy = 0;
      zone.addEventListener("touchstart", function (e) {
        SFX.unlock(); rect = zone.getBoundingClientRect(); cx = rect.left + rect.width / 2; cy = rect.top + rect.height / 2;
        touch.active = true; moveTouch(e);
      }, { passive: true });
      zone.addEventListener("touchmove", function (e) { moveTouch(e); }, { passive: true });
      zone.addEventListener("touchend", function () { touch.active = false; touch.x = 0; touch.y = 0; if (knob) knob.style.transform = "translate(0,0)"; });
      function moveTouch(e) {
        var t = e.touches[0]; if (!t) return;
        var dx = t.clientX - cx, dy = t.clientY - cy, r = 58;
        var l = Math.hypot(dx, dy) || 1;
        var k = Math.min(1, l / r);
        touch.x = dx / l * k; touch.y = -dy / l * k;
        if (knob) knob.style.transform = "translate(" + (dx / l * k * r) + "px," + (dy / l * k * r) + "px)";
      }
    }
    function holdBtn(id, code) {
      var el = document.getElementById(id);
      if (!el) return;
      var set = function (v) { return function (e) { e.preventDefault(); SFX.unlock(); keys[code] = v; }; };
      el.addEventListener("touchstart", set(true), { passive: false });
      el.addEventListener("touchend", set(false), { passive: false });
      el.addEventListener("mousedown", set(true));
      el.addEventListener("mouseup", set(false));
    }
    holdBtn("btn-light", "KeyJ"); holdBtn("btn-heavy", "KeyK");
    holdBtn("btn-parry", "Space"); holdBtn("btn-dodge", "ShiftLeft");
    holdBtn("btn-bf", "KeyV");
    // 技能槽：点一下 = 按一次对应键
    hud.slots.forEach(function (slot) {
      var mv = slot.getAttribute("data-move");
      var code = { blue: "KeyU", red: "KeyI", purple: "KeyO", heal: "KeyH", domain: "KeyG" }[mv];
      if (!code) return;
      slot.style.pointerEvents = "auto";
      var tap = function (e) { e.preventDefault(); SFX.unlock(); keys[code] = true; setTimeout(function () { keys[code] = false; }, 90); };
      slot.addEventListener("touchstart", tap, { passive: false });
      slot.addEventListener("click", tap);
    });
  }

  /* ---------------- 模式 ---------------- */
  function startMatch() {
    resetStats();
    world.reset(20260913 + (pick.diff * 7), pick.char, pick.char === "gojo" ? "sukuna" : "gojo");
    world.setDifficulty(pick.diff);
    world.setControl(0, "human");
    world.setControl(1, "ai");
    mode = "fight";
    Screens.setMode(sc, "fight");
  }
  function resetStats() { stats = { dealt: 0, taken: 0, bf: 0, exec: 0, domain: 0, maxCombo: 0, parry: 0, time: 0 }; }
  function finishMatch(winnerId) {
    if (mode === "result") return;
    mode = "result";
    var win = winnerId === pick.char;
    var me = world.fighters()[0], foe = world.fighters()[1];
    Screens.showResult(sc, win, {
      sub: win ? (foe.id === "sukuna" ? "讨伐 两面宿傩" : "击败 五条悟") : (me.id === "gojo" ? "五条悟 败北" : "两面宿傩 败北"),
      rows: [
        ["用时", stats.time.toFixed(1) + "s"],
        ["造成伤害", String(stats.dealt)],
        ["承受伤害", String(stats.taken)],
        ["黑闪", String(stats.bf)],
        ["招架成功", String(stats.parry)],
        ["处决", String(stats.exec)],
        ["领域展开", String(stats.domain)],
        ["最高连击", String(stats.maxCombo)],
        ["剩余血量", Math.round(me.hp) + " / " + me.hpMax]
      ]
    });
    Screens.setMode(sc, "result");
    SFX.play(win ? "domain" : "ko");
  }

  /* ---------------- 主循环 ---------------- */
  function oneStep() {
    var inp = readKeys();
    if (mode !== "fight" && mode !== "result") inp = emptyInput();
    world.step(inp, null);
    return world.events.drain();
  }
  function frame(now) {
    if (!lastT) lastT = now;
    var dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    var evs = [];
    if (!pausedSim && (mode === "fight" || mode === "result")) {
      fixedAcc += dt;
      var n = 0;
      while (fixedAcc >= FIXED_DT && n < 6) {
        fixedAcc -= FIXED_DT;
        var e = oneStep();
        for (var i = 0; i < e.length; i++) { evs.push(e[i]); applyEvent(e[i]); }
        n++;
      }
      if (n === 6) fixedAcc = 0;
      if (mode === "fight") stats.time += dt;
    }
    var st = world.state();
    view.update(st, evs, dt);
    view.render();
    HUD.update(hud, st, evs, dt, { time: stats.time });
    requestAnimationFrame(frame);
  }
  /** 事件 → 音效 + 统计 + 模式切换（表现层的事，逻辑层不管） */
  function applyEvent(e) {
    var d = e.data || {};
    if (e.type === "hit") {
      SFX.play(d.heavy ? "hit_heavy" : "hit_light");
      if (d.by === pick.char) { stats.dealt += d.dmg; stats.maxCombo = Math.max(stats.maxCombo, d.combo || 1); }
      if (d.on === pick.char) stats.taken += d.dmg;
    } else if (e.type === "parry") { SFX.play("parry"); if (d.by === pick.char) stats.parry++; }
    else if (e.type === "blocked" || e.type === "absorb") SFX.play("blocked");
    else if (e.type === "dodged") SFX.play("dodge");
    else if (e.type === "cast") SFX.play("cast");
    else if (e.type === "blackflash") { SFX.play("blackflash"); stats.bf++; }
    else if (e.type === "execute") { SFX.play("execute"); stats.exec++; }
    else if (e.type === "domain" || e.type === "domainclash") { SFX.play("domain"); stats.domain++; }
    else if (e.type === "ko") { finishMatch(d.winner); }
  }

  function resize() { view.resize(window.innerWidth, window.innerHeight); }
  window.addEventListener("resize", resize);
  resize();
  Screens.setMode(sc, "title");
  Screens.setPick(sc, pick.char);
  Screens.setDiff(sc, pick.diff);
  bindTouch();
  document.getElementById("sc-go").addEventListener("click", function () { SFX.unlock(); startMatch(); });
  sc.pick.querySelectorAll(".card").forEach(function (c) {
    c.addEventListener("click", function () { pick.char = c.getAttribute("data-char"); Screens.setPick(sc, pick.char); SFX.play("ui"); });
  });
  sc.diff.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () { pick.diff = Number(b.getAttribute("data-d")); Screens.setDiff(sc, pick.diff); SFX.play("ui"); });
  });
  sc.again.addEventListener("click", function () { SFX.unlock(); startMatch(); });
  sc.back.addEventListener("click", function () { mode = "title"; Screens.setMode(sc, "title"); Screens.setPick(sc, pick.char); });
  requestAnimationFrame(frame);

  /* ---------------- 探针接口 ---------------- */
  window.__DATA = { MOVES: MOVES, CHARACTERS: CHARACTERS, INPUT_KEYS: INPUT_KEYS, FIXED_DT: FIXED_DT };
  window.__SIM = {
    state: function () { return world.state(); },
    hash: function () { return world.hash(); },
    frame: function () { return world.frame(); },
    mode: function () { return mode; },
    start: function (charId, diff) { if (charId) pick.char = charId; if (diff !== undefined) pick.diff = diff; startMatch(); return { char: pick.char, diff: pick.diff }; },
    reset: function (seed, c1, c2) { world.reset(seed, c1, c2); world.setDifficulty(pick.diff); world.setControl(0, "human"); world.setControl(1, "ai"); fixedAcc = 0; },
    pause: function (on) { pausedSim = !!on; },
    paused: function () { return pausedSim; },
    control: function (i, mode2) { world.setControl(i, mode2); },
    difficulty: function (d) { pick.diff = d; world.setDifficulty(d); },
    place: function (i, x, z, facing) {
      var f = world.fighters()[i];
      f.x = x; f.z = z; if (facing !== undefined) f.facing = facing;
      f.action = null; f.hitstun = 0; f.iframes = 0; f.broken = 0; f.frozen = 0;
      return { x: f.x, z: f.z, facing: f.facing };
    },
    step: function (in1, in2) {
      world.step(in1 === undefined ? null : in1, in2 === undefined ? null : in2);
      var evs = world.events.drain();
      for (var i = 0; i < evs.length; i++) applyEvent(evs[i]);   // 让 KO / 结算在不跑 rAF 时也能触发
      return evs;
    },
    hp: function (i) { return world.fighters()[i].hp; },
    ce: function (i) { return +world.fighters()[i].ce.toFixed(2); },
    setHP: function (i, v) { var f = world.fighters()[i]; f.hp = Math.max(0, Math.min(f.hpMax, v)); return f.hp; },
    setCE: function (i, v) { var f = world.fighters()[i]; f.ce = Math.max(0, Math.min(f.ceMax, v)); return f.ce; },
    setGauge: function (i, v) { var f = world.fighters()[i]; f.gauge = Math.max(0, Math.min(100, v)); return f.gauge; },
    move: function (i) { var f = world.fighters()[i]; return f.action ? f.action.move.id + ":" + f.action.phase + ":" + f.action.t : null; },
    maho: function () { return world.state().maho; },
    damageMaho: function (mvId, kind) { var att = world.fighters()[0]; return world.damageMahoraga(att, MOVES[mvId] || { id: mvId }, kind || "melee"); },
    summon: function () { world.fighters()[1].hp = Math.round(world.fighters()[1].hpMax * 0.45); return true; },
    press: function (code, on) { keys[code] = !!on; return true; },
    three: function () { return view.renderer.info.render; },
    stats: function () { return stats; },
    pick: function () { return pick; }
  };
  return { world: world, view: view, startMatch: startMatch };
})();
