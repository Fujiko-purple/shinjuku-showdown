/**
 * main.js —— 装配层：键盘/触屏 → 输入包 → 固定帧 sim → 表现层
 * ----------------------------------------------------------------------------
 * 这一层是唯一允许同时碰 DOM 与 sim 的地方，而且只能"单向"：UI → 输入包，状态 → UI。
 */
/** 页面异常收集：探针最后会读它（A0 断言"无 JS 异常"） */
window.__ERRS = [];
window.addEventListener("error", function (e) { window.__ERRS.push(String(e.message || e)); });
window.addEventListener("unhandledrejection", function (e) { window.__ERRS.push("rejection: " + String(e.reason)); });

var MAIN = (function () {
  var canvas = document.getElementById("stage");
  var view = createSceneView(canvas);
  var world = createWorld({ seed: 20260913 });
  var hud = HUDBuilder.build(document.getElementById("overlay"));
  var paused = false;              // 探针用：暂停 rAF 驱动，改为手动 step
  var human = 0;                   // 本机操控哪一边（单机模式下另一边交给 AI）
  var keys = {};
  var fixedAcc = 0;
  var lastT = 0;

  function readKeys() {
    var inp = emptyInput();
    inp.moveX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    inp.moveZ = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    inp.light = !!keys.KeyJ;
    inp.heavy = !!keys.KeyK;
    inp.parry = !!keys.Space;
    inp.dodge = !!(keys.ShiftLeft || keys.ShiftRight);
    return inp;
  }

  window.addEventListener("keydown", function (e) {
    if (e.code === "KeyR") { world.reset(); }
    if (e.code === "Digit1") { human = 0; applyControl(); }
    if (e.code === "Digit2") { human = 1; applyControl(); }
    keys[e.code] = true;
    if (e.code === "Space") e.preventDefault();
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });

  function applyControl() {
    world.setControl(0, human === 0 ? "human" : "ai");
    world.setControl(1, human === 1 ? "human" : "ai");
  }
  applyControl();

  function oneStep() {
    var inp = readKeys();
    // 本机操控的那一边吃真实输入，另一边交给 sim 内部的 AI（传 null）
    var in1 = human === 0 ? inp : null;
    var in2 = human === 1 ? inp : null;
    world.step(in1, in2);
    return world.events.drain();
  }

  function frame(now) {
    if (!lastT) lastT = now;
    var dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    var evs = [];
    if (!paused) {
      fixedAcc += dt;
      var n = 0;
      while (fixedAcc >= FIXED_DT && n < 6) {
        fixedAcc -= FIXED_DT;
        var e = oneStep();
        for (var i = 0; i < e.length; i++) evs.push(e[i]);
        n++;
      }
      if (n === 6) fixedAcc = 0;
    }
    var st = world.state();
    view.update(st, evs, dt);
    view.render();
    HUDBuilder.update(hud, st, evs);   // ⚠ update 挂在 HUDBuilder 上，build() 返回的是句柄（踩过：hud.update is not a function，整个 rAF 循环死掉）
    requestAnimationFrame(frame);
  }

  function resize() { view.resize(window.innerWidth, window.innerHeight); }
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);

  /** 探针接口：pauseLoop + 手动 step + 摆放 + hash（确定性断言用） */
  window.__SIM = {
    state: function () { return world.state(); },
    hash: function () { return world.hash(); },
    frame: function () { return world.frame(); },
    reset: function (seed) { world.reset(seed); fixedAcc = 0; },
    setCE: function (i, v) { var f = world.fighters()[i]; f.ce = Math.max(0, Math.min(f.ceMax, v)); return f.ce; },
    setHP: function (i, v) { var f = world.fighters()[i]; f.hp = Math.max(0, Math.min(f.hpMax, v)); return f.hp; },
    pause: function (on) { paused = !!on; },
    control: function (i, mode) { world.setControl(i, mode); },
    human: function (i) { human = i | 0; applyControl(); },
    place: function (i, x, z, facing) {
      var f = world.fighters()[i];
      f.x = x; f.z = z;
      if (facing !== undefined) f.facing = facing;
      f.action = null; f.hitstun = 0; f.iframes = 0;
      return { x: f.x, z: f.z, facing: f.facing };
    },
    step: function (in1, in2) {
      world.step(in1 === undefined ? null : in1, in2 === undefined ? null : in2);
      return world.events.drain();
    },
    hp: function (i) { return world.fighters()[i].hp; },
    ce: function (i) { return +world.fighters()[i].ce.toFixed(2); },
    move: function (i) { var f = world.fighters()[i]; return f.action ? f.action.move.id + ":" + f.action.phase + ":" + f.action.t : null; },
    press: function (code, on) { keys[code] = !!on; return true; },
    paused: function () { return paused; },
    three: function () { return view.renderer.info.render; }
  };
  /** 数据表的只读出口：探针用它枚举"每个伤害是否都有零伤害解"（规则 1） */
  window.__DATA = { MOVE: MOVE, CHARACTERS: CHARACTERS, FIXED_DT: FIXED_DT };
  return { world: world, view: view };
})();
