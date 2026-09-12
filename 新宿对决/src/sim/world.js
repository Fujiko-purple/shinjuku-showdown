/**
 * sim/world.js —— 固定帧战斗世界（纯逻辑）
 * ----------------------------------------------------------------------------
 * 铁律 1+2+5：这里不碰 three.js / DOM / 音频，只认 (输入包, 1/60 秒)。
 * 同一个输入序列必须得到同一个 hash（探针 A2 会验）。
 *
 * M0 实现的范围：移动 / 三连段 / 重击 / 招架 / 闪避 / 命中判定 / 顿帧 / 击退 / 咒力 / 空招惩罚。
 * 削韧、处决、术式（苍赫茈）、黑闪、领域都在 M1+ 往 tables 与这里继续长。
 */
function createWorld(opts) {
  opts = opts || {};
  var rng = RNG.make(opts.seed || 20260913);
  var events = createEvents();
  var tmp = { ax: 0, az: 0, bx: 0, bz: 0 };
  var frame = 0;
  var freeze = 0;
  var control = ["human", "human"];
  var fighters = [];
  var comboOwner = null;

  function mk(charId, x, facing) {
    var c = CHARACTERS[charId];
    return {
      id: c.id, char: c, x: x, z: 0, facing: facing,
      hp: c.hpMax, hpMax: c.hpMax, ce: c.ceMax * 0.5, ceMax: c.ceMax,
      action: null, hitstun: 0, iframes: 0, counter: 0, lastHurtFrame: -9999,
      combo: 0, comboWindow: 0, ai: { t: 0, want: "approach", cd: 0 }
    };
  }
  /** reset 必须连随机种子一起重置，否则"同样输入两遍"不可能一致（探针 A2） */
  function reset(seed) {
    rng = RNG.make(seed === undefined ? (opts.seed || 20260913) : seed);
    fighters = [mk(opts.p1 || "gojo", -5, Math.PI / 2), mk(opts.p2 || "sukuna", 5, -Math.PI / 2)];
    frame = 0; freeze = 0; comboOwner = null;
    events.clear();   // 清空而不是重新赋值：world.events 的引用必须一直有效（踩过一次）
  }
  reset();

  function foeOf(f) { return f === fighters[0] ? fighters[1] : fighters[0]; }

  /* ---------------- 出招 ---------------- */
  function canAct(f) {
    if (f.hitstun > 0) return false;
    if (!f.action) return true;
    // 连段取消：后摇前半段内允许接下一段（这一条是"打击感"的关键，也是空招惩罚的对立面）
    var mv = f.action.move;
    if (mv.chain && f.action.phase === "recovery" && f.action.t <= mv.chainFrom) return true;
    return false;
  }
  function startMove(f, move) {
    f.action = { move: move, t: 0, phase: move.startup > 0 ? "startup" : (move.active > 0 ? "active" : "recovery"), hitLanded: false };
    events.push("start", { id: f.id, move: move.id, startup: move.startup });
  }
  function pickMove(f, inp, pressed) {
    if (pressed.parry && f.hitstun <= 0) return f.char.moves.parry;
    if (pressed.dodge && f.hitstun <= 0) return f.char.moves.dodge;
    if (pressed.heavy && f.hitstun <= 0) return f.char.moves.heavy;
    if (pressed.light && f.hitstun <= 0) {
      // 三连段：正在后摇的前半段 → 接下一段
      if (f.action && f.action.phase === "recovery" && f.action.move.chain) {
        return f.char.moves[f.action.move.chain];
      }
      if (!f.action) return f.char.moves.light1;
    }
    return null;
  }

  /* ---------------- 一帧 ---------------- */
  function step(in1, in2) {
    frame++;
    if (freeze > 0) { freeze--; events.push("hitstop", { left: freeze }); return; }

    var inputs = [in1, in2];
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      var raw = inputs[i];
      if (raw === null || raw === undefined || control[i] === "ai") raw = aiInput(f);
      var inp = normalizeInput(raw);
      tickFighter(f, inp);
    }
    /**
     * ⚠ 判定必须**两遍**：先让双方都把动作推进完，再同时结算命中。
     * 一行里先 tick 的一方若在 tick 内部就结算命中，会拿到"同帧优先权"——
     * 表现就是"我明明同帧按了招架却照吃伤害"（探针 A3 第一版就是这么挂的）。
     */
    resolveOverlap();
    for (var k = 0; k < 2; k++) resolveActive(fighters[k]);
    tickResource();
  }

  function pressedOf(f, inp, key) {
    var prev = f._prev || emptyInput();
    return !!inp[key] && !prev[key];
  }

  function tickFighter(f, inp) {
    var pressed = {};
    var prev = f._prev || emptyInput();
    pressed.light = !!inp.light && !prev.light;
    pressed.heavy = !!inp.heavy && !prev.heavy;
    pressed.parry = !!inp.parry && !prev.parry;
    pressed.dodge = !!inp.dodge && !prev.dodge;
    f._prev = inp;

    if (f.hitstun > 0) f.hitstun--;
    if (f.iframes > 0) f.iframes--;
    if (f.counter > 0) f.counter--;
    if (f.comboWindow > 0) { f.comboWindow--; if (f.comboWindow === 0) f.combo = 0; }

    /* --- 出招 --- */
    var mv = pickMove(f, inp, pressed);
    if (mv) {
      // 闪避有位移，直接在这里结算（M0 简化：位移在 recovery 的每帧前进）
      startMove(f, mv);
      if (mv.id === "dodge") {
        f.iframes = mv.iframes;
        var fx = Math.sin(f.facing), fz = Math.cos(f.facing);
        var back = inp.moveZ < 0 ? -1 : 1;   // 有后输入则向后退
        f.x += fx * mv.dist * 0.5 * back;
        f.z += fz * mv.dist * 0.5 * back;
        f.x = clampPos(f.x); f.z = clampPos(f.z);
      }
    }

    /* --- 招式推进 + 判定 --- */
    if (f.action) {
      var a = f.action, m = a.move;
      a.t++;
      if (a.phase === "startup" && a.t >= m.startup) { a.phase = m.active > 0 ? "active" : "recovery"; a.t = 0; }
      else if (a.phase === "active" && a.t >= m.active) { a.phase = "recovery"; a.t = 0; }
      else if (a.phase === "recovery" && a.t >= m.recovery) { f.action = null; }

    }

    /* --- 移动（出招与受击时大幅降速，规则来自旧版实测教训） --- */
    var acting = !!f.action;
    var stunned = f.hitstun > 0;
    var mag = Math.hypot(inp.moveX, inp.moveZ);
    if (!stunned && mag > 0.08) {
      var mul = acting ? (f.action.phase === "active" ? 0.18 : 0.35) : 1;
      var sp = f.char.speed * mul;
      f.x += inp.moveX * sp * FIXED_DT;
      f.z += inp.moveZ * sp * FIXED_DT;
      f.x = clampPos(f.x); f.z = clampPos(f.z);
      if (!acting) f.facing = Math.atan2(inp.moveX, inp.moveZ);
    }
    if (!acting && !stunned && mag <= 0.08) {
      // 不移动时看着对手（M0 不做软锁定，只有朝向）
      var foe2 = foeOf(f);
      f.facing = Math.atan2(foe2.x - f.x, foe2.z - f.z);
    }
    if (stunned && !acting) {
      var foe3 = foeOf(f);
      f.facing = Math.atan2(foe3.x - f.x, foe3.z - f.z);
    }
  }
  function clampPos(v) { return v < -40 ? -40 : v > 40 ? 40 : v; }

  /** 第二遍：判定（双方状态都已推进完，没有帧序偏袒） */
  function resolveActive(f) {
    var a = f.action;
    if (!a || a.phase !== "active" || a.hitLanded) return;
    var m = a.move;
    if (!(m.dmg > 0)) return;
    var foe = foeOf(f);
    if (!sweepHits(f, m, foe, tmp)) return;
    // 招架判定用的是"对方这一帧是否处于招架窗口"，与被 tick 的顺序无关
    a.hitLanded = true;
    landHit(f, foe, m);
  }

  /* ---------------- 命中结算 ---------------- */
  function landHit(att, def, m) {
    /* 三种结果：招架 > 无敌帧 > 命中。招架必须**零伤害且有收益**（规则 4） */
    if (def.action && def.action.move.id === "parry" && def.action.phase === "active") {
      var rw = def.action.move.reward;
      def.ce = Math.min(def.ceMax, def.ce + rw.ce);
      def.counter = rw.counter;
      att.hitstun = rw.foeStun;
      att.action = null;
      freeze = Math.max(freeze, 6);
      events.push("parry", { by: def.id, attacker: att.id, ce: def.ce, counter: def.counter, foeStun: att.hitstun });
      return;
    }
    if (def.iframes > 0) {
      events.push("dodged", { by: def.id, attacker: att.id });
      return;
    }
    var dmg = Math.round(m.dmg);            // 规则 12 的标定在 tables 里（按目标血量百分比选的值）
    def.hp = Math.max(0, def.hp - dmg);
    def.hitstun = m.dmg >= 60 ? 28 : 14;
    def.action = null;
    def.lastHurtFrame = frame;
    att.ce = Math.min(att.ceMax, att.ce + m.ce);
    var fx = Math.sin(att.facing), fz = Math.cos(att.facing);
    def.x = clampPos(def.x + fx * m.kb);
    def.z = clampPos(def.z + fz * m.kb);
    freeze = Math.max(freeze, m.hitstop);
    // 连段计数（给 HUD 与规则 12 的"一局 15~30 次交互"用）
    if (comboOwner === att.id && att.comboWindow > 0) att.combo++; else { if (comboOwner) { var other = comboOwner === fighters[0].id ? fighters[0] : fighters[1]; other.combo = 0; } att.combo = 1; comboOwner = att.id; }
    att.comboWindow = 45;
    events.push("hit", { by: att.id, on: def.id, move: m.id, dmg: dmg, hp: def.hp, combo: att.combo, heavy: m.dmg >= 60 });
    if (def.hp <= 0) events.push("ko", { loser: def.id });
  }

  /* ---------------- 资源：规则 5（距离即资源） ---------------- */
  function tickResource() {
    var d = distXZ(fighters[0], fighters[1]);
    var near = d <= 12;
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      if (near) f.ce = Math.min(f.ceMax, f.ce + 6 * FIXED_DT);
      else f.ce = Math.max(0, f.ce - 3 * FIXED_DT);
    }
  }

  function resolveOverlap() {
    var a = fighters[0], b = fighters[1];
    var dx = b.x - a.x, dz = b.z - a.z;
    var d = Math.hypot(dx, dz);
    var min = BODY_R * 2;
    if (d < min && d > 1e-6) {
      var push = (min - d) / 2;
      a.x -= dx / d * push; a.z -= dz / d * push;
      b.x += dx / d * push; b.z += dz / d * push;
    }
  }

  /* ---------------- M0 的 AI：只会靠近 + 出手 + 偶尔招架（M3 才做真 AI） ---------------- */
  function aiInput(f) {
    var foe = foeOf(f);
    var d = distXZ(f, foe);
    var inp = emptyInput();
    f.ai.t++;
    if (d > 3.2) { inp.moveX = (foe.x - f.x) / d; inp.moveZ = (foe.z - f.z) / d; }
    else if (f.ai.cd <= 0) {
      var r = rng.next();
      if (r < 0.12) inp.parry = true;
      else if (r < 0.2) inp.dodge = true;
      else if (r < 0.45) inp.heavy = true;
      else inp.light = true;
      f.ai.cd = 30 + Math.floor(rng.next() * 30);
    }
    if (f.ai.cd > 0) f.ai.cd--;
    return inp;
  }

  /* ---------------- 对外接口 ---------------- */
  function state() {
    return {
      frame: frame, freeze: freeze,
      fighters: fighters.map(function (f) {
        return {
          id: f.id, x: +f.x.toFixed(3), z: +f.z.toFixed(3), facing: +f.facing.toFixed(3),
          hp: f.hp, hpMax: f.hpMax, ce: +f.ce.toFixed(2), ceMax: f.ceMax,
          hitstun: f.hitstun, iframes: f.iframes, counter: f.counter, combo: f.combo,
          move: f.action ? f.action.move.id : null, phase: f.action ? f.action.phase : null,
          t: f.action ? f.action.t : 0
        };
      }),
      dist: +distXZ(fighters[0], fighters[1]).toFixed(3)
    };
  }
  function hash() {
    var s = frame + "|" + freeze + "|";
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      s += [f.id, f.x.toFixed(4), f.z.toFixed(4), f.facing.toFixed(4), f.hp, f.ce.toFixed(3), f.hitstun, f.iframes, f.counter,
        f.action ? f.action.move.id + ":" + f.action.phase + ":" + f.action.t : "-"].join(",") + "|";
    }
    s += distXZ(fighters[0], fighters[1]).toFixed(4);
    // FNV-1a 32 位
    var h = 0x811c9dc5;
    for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }

  return {
    step: step, state: state, hash: hash, reset: reset,
    events: events,
    fighters: function () { return fighters; },
    setControl: function (i, mode) { control[i] = mode; },
    frame: function () { return frame; }
  };
}
