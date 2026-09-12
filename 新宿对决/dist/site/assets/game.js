(function () {
var THREE = window.THREE;
var WebGLRenderer = THREE.WebGLRenderer, Scene = THREE.Scene, Fog = THREE.Fog, PerspectiveCamera = THREE.PerspectiveCamera, HemisphereLight = THREE.HemisphereLight, DirectionalLight = THREE.DirectionalLight, Mesh = THREE.Mesh, PlaneGeometry = THREE.PlaneGeometry, MeshStandardMaterial = THREE.MeshStandardMaterial, GridHelper = THREE.GridHelper, RingGeometry = THREE.RingGeometry, MeshBasicMaterial = THREE.MeshBasicMaterial, Group = THREE.Group, CapsuleGeometry = THREE.CapsuleGeometry, SphereGeometry = THREE.SphereGeometry, ConeGeometry = THREE.ConeGeometry, CircleGeometry = THREE.CircleGeometry, Color = THREE.Color;
/**
 * core/rng.js —— 定种子随机
 * ----------------------------------------------------------------------------
 * 铁律 5：sim 层只许用这里的随机。表现层（VFX/音频）可以各自 Math.random。
 * mulberry32：32 位状态、极快、足够均匀，跨浏览器结果一致（只有整数运算与一次除法）。
 */
var RNG = {
  make: function (seed) {
    var s = (seed >>> 0) || 1;
    var api = {
      seed: s,
      next: function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range: function (a, b) { return a + (b - a) * api.next(); },
      int: function (a, b) { return a + Math.floor(api.next() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(api.next() * arr.length) % arr.length]; },
      /** 供确定性断言用的快照 */
      snapshot: function () { return s >>> 0; }
    };
    return api;
  }
};

/**
 * core/input.js —— 输入包
 * ----------------------------------------------------------------------------
 * 输入是**纯数据**：可以序列化、可以 replay、可以直接塞进网络包（联机要用，见 research/D-netcode.md §6.3）。
 * 相机相关的量（鼠标位移等）属于本地表现，不进这个结构。
 */
var INPUT_KEYS = ["light", "heavy", "parry", "dodge"];

function emptyInput() {
  return { moveX: 0, moveZ: 0, light: false, heavy: false, parry: false, dodge: false };
}

/** 从任意来源（键盘/触屏/AI/网络包）归一化成输入包 */
function normalizeInput(src) {
  var o = emptyInput();
  if (!src) return o;
  o.moveX = Number(src.moveX) || 0;
  o.moveZ = Number(src.moveZ) || 0;
  var m = Math.hypot(o.moveX, o.moveZ);
  if (m > 1) { o.moveX /= m; o.moveZ /= m; }
  for (var i = 0; i < INPUT_KEYS.length; i++) o[INPUT_KEYS[i]] = !!src[INPUT_KEYS[i]];
  return o;
}

/** 两个输入包是否逐字段相同（判定边沿用） */
function sameInput(a, b) {
  if (a.moveX !== b.moveX || a.moveZ !== b.moveZ) return false;
  for (var i = 0; i < INPUT_KEYS.length; i++) if (a[INPUT_KEYS[i]] !== b[INPUT_KEYS[i]]) return false;
  return true;
}

/**
 * 输入缓冲：任意来源每帧写一次，sim 每帧取一次。
 * 不用 KeyboardEvent 直接驱动 sim —— 事件是异步的，固定帧必须只认"这一帧的采样值"。
 */
function createInputBuffer() {
  var cur = emptyInput();
  var pending = emptyInput();
  var pressed = { light: false, heavy: false, parry: false, dodge: false };
  return {
    /** 外部（键盘/触屏/AI/网络）调用：设置这一帧的输入 */
    set: function (src) { pending = normalizeInput(src); },
    /** sim 在每帧开头调用：把 pending 固定成 cur，并算出按下边沿 */
    latch: function () {
      var prev = cur;
      cur = pending;
      for (var i = 0; i < INPUT_KEYS.length; i++) {
        var k = INPUT_KEYS[i];
        pressed[k] = !!cur[k] && !prev[k];
      }
      return cur;
    },
    cur: function () { return cur; },
    /** 按下边沿：只在按下的那一帧为 true */
    pressed: function (k) { return !!pressed[k]; },
    /** 直接看按住状态 */
    down: function (k) { return !!cur[k]; }
  };
}

/**
 * core/events.js —— 逻辑 → 表现的单向事件流
 * ----------------------------------------------------------------------------
 * sim 只负责"发生了什么"，view / HUD / 音频 / 探针都订阅事件。
 * 这样表现层随便改，逻辑层不用动；探针也能直接断言"第 N 帧发生了 hit"。
 */
function createEvents() {
  var list = [];
  return {
    push: function (type, data) {
      if (list.length < 128) list.push({ type: type, data: data || {}, frame: 0 });
      return list[list.length - 1];
    },
    /** 每帧末尾由 main 取走（sim 内部自己也用一遍做规则判定） */
    drain: function () {
      var out = list;
      list = [];
      return out;
    },
    /** ⚠ 必须"清空同一个对象"，不能靠外部重新赋值：否则持有旧引用的调用方会永远读到空数组 */
    clear: function () { list.length = 0; },
    peek: function () { return list; }
  };
}

/**
 * core/loop.js —— 固定步长循环
 * ----------------------------------------------------------------------------
 * 铁律 2：逻辑永远按 1/60 走。rAF 的 dt 只用来"攒帧"，不参与任何计算。
 * 顿帧 / 慢镜属于表现层，不许改这里的时间轴。
 */
var FIXED_DT = 1 / 60;
var FIXED_HZ = 60;

function createFixedLoop(opts) {
  var step = opts.step;                 // step(frameIndex, dt)
  var maxSteps = opts.maxSteps || 5;    // 一帧最多补几步（防止切后台回来炸掉）
  var acc = 0;
  var frame = 0;
  return {
    frame: function () { return frame; },
    /** dt 单位秒；返回这一帧实际跑了几步逻辑 */
    advance: function (dt) {
      if (!(dt > 0)) return 0;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      var n = 0;
      while (acc >= FIXED_DT && n < maxSteps) {
        acc -= FIXED_DT;
        step(frame, FIXED_DT);
        frame++;
        n++;
      }
      if (n === maxSteps) acc = 0;      // 攒太多就丢掉，宁可跳帧也不要雪崩
      return n;
    },
    reset: function () { acc = 0; frame = 0; }
  };
}

/**
 * data/characters.js —— 招式帧数据表（铁律 3：加招 = 加一行数据）
 * ----------------------------------------------------------------------------
 * 帧数都是 60Hz 的帧。字段含义：
 *   startup  起手帧（这段时间有预警，可被对手读到）
 *   active   判定帧
 *   recovery 后摇（规则 11：≥0.5s = 30 帧，玩家必须能在这段时间里塞进一整段反击）
 *   reach    判定线段长度（从身体中心沿朝向）
 *   hitR     判定半径（线段 vs 胶囊）
 *   dmg      伤害（规则 12 的标定：轻击 ≈ 1.2% 目标血量）
 *   kb       击退距离
 *   hitstop  命中顿帧帧数（表现层用它，逻辑层只用来冻结）
 *   ce       命中时给攻击者的咒力
 *   def      这一招**能被哪些选项解**（规则 1：至少一种能打出 0 伤害）
 *   chain    连段后继（在后摇前半段内再次按轻击）
 */
var MOVE = {
  light1: { id: "light1", name: "打击", key: "light", startup: 5, active: 3, recovery: 14, reach: 3.4, hitR: 0.6, dmg: 22, kb: 0.5, hitstop: 4, ce: 3, def: ["parry", "dodge", "walk"], chain: "light2", chainFrom: 4 },
  light2: { id: "light2", name: "打击二段", key: "light", startup: 4, active: 3, recovery: 16, reach: 3.6, hitR: 0.6, dmg: 26, kb: 0.9, hitstop: 4, ce: 3, def: ["parry", "dodge", "walk"], chain: "light3", chainFrom: 4 },
  light3: { id: "light3", name: "打击三段", key: "light", startup: 6, active: 4, recovery: 30, reach: 3.8, hitR: 0.7, dmg: 44, kb: 3.0, hitstop: 7, ce: 8, def: ["parry", "dodge", "walk"] },
  heavy: { id: "heavy", name: "踢击", key: "heavy", startup: 12, active: 4, recovery: 32, reach: 4.2, hitR: 0.8, dmg: 96, kb: 5.0, hitstop: 9, ce: 5, def: ["parry", "dodge", "walk"] },
  /** 防御动词 1：无下限·招架。窗口内被命中 = 零伤害 + 反打 */
  parry: { id: "parry", name: "无下限·招架", key: "parry", startup: 0, active: 11, recovery: 16, reach: 0, hitR: 0, dmg: 0, kb: 0, hitstop: 0, ce: 0, def: [], window: 11, failStun: 22, reward: { ce: 12, counter: 24, foeStun: 30 } },
  /** 防御动词 2：闪避（位移 + 无敌帧） */
  dodge: { id: "dodge", name: "闪避", key: "dodge", startup: 0, active: 0, recovery: 18, reach: 0, hitR: 0, dmg: 0, kb: 0, hitstop: 0, ce: 0, def: [], iframes: 12, dist: 4.2 }
};

var CHARACTERS = {
  gojo: {
    id: "gojo",
    name: "五条悟",
    title: "现代最强",
    color: 0x5ff0ff,
    hpMax: 1500,
    ceMax: 100,
    speed: 4.8,
    runSpeed: 7.2,
    dodgeSpeed: 12,
    moves: MOVE,
    combo: ["light1", "light2", "light3"]
  },
  sukuna: {
    id: "sukuna",
    name: "两面宿傩",
    title: "史上最强",
    color: 0xff1f3d,
    hpMax: 1800,
    ceMax: 100,
    speed: 4.6,
    runSpeed: 6.6,
    dodgeSpeed: 11,
    moves: MOVE,
    combo: ["light1", "light2", "light3"]
  }
};

/**
 * sim/hit.js —— 判定原语（纯函数，无状态）
 * ----------------------------------------------------------------------------
 * 只用两种形状：**垂直线段**（角色胶囊）与**水平线段**（攻击扫掠）。
 * 全部是解析解，没有物理引擎、没有 Math.random —— 这样两台机器/两次重放的结果一致。
 */
function segSegDistSq(ax, az, bx, bz, cx, cz, dx, dz) {
  // 2D 版本：A(x,z) -> B(x,z) 与 C -> D 的最近距离平方（角色都在地面上，高度差单独判）
  var ux = bx - ax, uz = bz - az;
  var vx = dx - cx, vz = dz - cz;
  var wx = ax - cx, wz = az - cz;
  var a = ux * ux + uz * uz;
  var e = vx * vx + vz * vz;
  var f = vx * wx + vz * wz;
  var s = 0, t = 0;
  var EPS = 1e-9;
  if (a <= EPS && e <= EPS) return wx * wx + wz * wz;
  if (a <= EPS) { t = clamp01(-f / e); }
  else {
    var c = ux * wx + uz * wz;
    if (e <= EPS) { s = clamp01(-c / a); }
    else {
      var b = ux * vx + uz * vz;
      var denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  var px = ax + ux * s - (cx + vx * t);
  var pz = az + uz * s - (cz + vz * t);
  return px * px + pz * pz;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function distXZ(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }

/** 角色胶囊半径（判定用，和外观解耦） */
var BODY_R = 0.45;

/** 攻击扫掠线：从攻击者中心沿朝向，前 0.55m 到 reach */
function attackSegment(attacker, move, out) {
  var fx = Math.sin(attacker.facing), fz = Math.cos(attacker.facing);
  out.ax = attacker.x + fx * 0.55; out.az = attacker.z + fz * 0.55;
  out.bx = attacker.x + fx * move.reach; out.bz = attacker.z + fz * move.reach;
  return out;
}

/** 攻击扫掠是否命中防守者的身体胶囊（垂直线段的水平投影是一个半径 BODY_R 的圆） */
function sweepHits(attacker, move, defender, tmp) {
  attackSegment(attacker, move, tmp);
  var d2 = segSegDistSq(tmp.ax, tmp.az, tmp.bx, tmp.bz, defender.x, defender.z, defender.x, defender.z);
  var r = move.hitR + BODY_R;
  return d2 <= r * r;
}

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

/**
 * view/scene.js —— 表现层（three.js）
 * ----------------------------------------------------------------------------
 * 铁律 1：这里只读 sim 的 state 与事件，绝不反过来改逻辑。
 * M0 的外观是"能读懂战斗"优先：胶囊人 + 朝向锥 + 命中火花 + 可读机位。
 */
function createSceneView(canvas) {
  var renderer = new WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setClearColor(0x070a12, 1);
  var scene = new Scene();
  scene.fog = new Fog(0x070a12, 22, 70);
  var camera = new PerspectiveCamera(46, 16 / 9, 0.1, 400);

  var hemi = new HemisphereLight(0x9fc6ff, 0x1a1f2e, 0.75);
  scene.add(hemi);
  var key = new DirectionalLight(0xffe6c8, 1.1);
  key.position.set(6, 12, 8);
  scene.add(key);
  var rim = new DirectionalLight(0x5ff0ff, 0.5);
  rim.position.set(-8, 6, -10);
  scene.add(rim);

  var ground = new Mesh(new PlaneGeometry(160, 160), new MeshStandardMaterial({ color: 0x161a24, roughness: 0.95, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  var grid = new GridHelper(160, 80, 0x2a3550, 0x1b2233);
  grid.position.y = 0.01;
  scene.add(grid);
  /** 12m 资源线：让"距离即资源"变成看得见的东西 */
  var ring = new Mesh(new RingGeometry(11.7, 12, 96), new MeshBasicMaterial({ color: 0x2b4a6b, transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  function makeFigure(color) {
    var g = new Group();
    var body = new Mesh(new CapsuleGeometry(0.42, 1.0, 6, 16), new MeshStandardMaterial({ color: color, roughness: 0.45, metalness: 0.1 }));
    body.position.y = 0.95;
    g.add(body);
    var head = new Mesh(new SphereGeometry(0.26, 18, 14), new MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.4 }));
    head.position.y = 1.78;
    g.add(head);
    var nose = new Mesh(new ConeGeometry(0.12, 0.4, 10), new MeshBasicMaterial({ color: color }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.35, 0.42);
    g.add(nose);
    var shadow = new Mesh(new CircleGeometry(0.6, 20), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    g.add(shadow);
    scene.add(g);
    return { group: g, body: body, nose: nose };
  }
  var figs = { gojo: makeFigure(CHARACTERS.gojo.color), sukuna: makeFigure(CHARACTERS.sukuna.color) };
  var facing = { gojo: Math.PI / 2, sukuna: -Math.PI / 2 };

  /** 命中火花 / 招架护盾：表现层自己池化，逻辑层不关心 */
  var sparks = [];
  var sparkGeo = new SphereGeometry(0.16, 10, 8);
  for (var i = 0; i < 24; i++) {
    var m = new Mesh(sparkGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, t: 0 });
  }
  var sparkAt = 0;
  function burst(x, y, z, color, count, power) {
    for (var i = 0; i < count; i++) {
      var s = sparks[sparkAt = (sparkAt + 1) % sparks.length];
      s.mesh.visible = true;
      s.mesh.position.set(x, y, z);
      s.mesh.material.color.setHex(color);
      s.mesh.material.opacity = 1;
      s.vx = (Math.random() - 0.5) * power;
      s.vy = Math.random() * power * 0.6;
      s.vz = (Math.random() - 0.5) * power;
      s.t = 0.45;
    }
  }
  function tickSparks(dt) {
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      if (s.t <= 0) { if (s.mesh.visible) s.mesh.visible = false; continue; }
      s.t -= dt;
      s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt; s.mesh.position.z += s.vz * dt;
      s.vy -= 9 * dt;
      s.mesh.material.opacity = Math.max(0, s.t / 0.45);
      if (s.t <= 0) s.mesh.visible = false;
    }
  }

  var shake = 0;
  function onEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], d = e.data;
      if (e.type === "hit") {
        var f = d.by === "gojo" ? figs.gojo : figs.sukuna;
        var p = (d.by === "gojo" ? stateRef[0].x + stateRef[1].x : stateRef[0].x + stateRef[1].x) / 2;
        burst((d.by === "gojo" ? stateRef[1].x : stateRef[0].x), 1.2, (d.by === "gojo" ? stateRef[1].z : stateRef[0].z), 0xffd873, d.heavy ? 10 : 5, d.heavy ? 6 : 4);
        shake = Math.min(0.5, shake + (d.heavy ? 0.3 : 0.12));
      } else if (e.type === "parry") {
        burst((d.by === "gojo" ? stateRef[0].x : stateRef[1].x), 1.2, 0, 0x5ff0ff, 12, 5);
        shake = Math.min(0.6, shake + 0.25);
      } else if (e.type === "dodged") {
        burst(d.by === "gojo" ? stateRef[0].x : stateRef[1].x, 0.7, 0, 0x9aa8c0, 4, 3);
      }
    }
  }

  var stateRef = [null, null];
  function update(st, evs, dt) {
    stateRef = st.fighters;
    onEvents(evs);
    var f0 = st.fighters[0], f1 = st.fighters[1];
    figs[f0.id].group.position.set(f0.x, 0, f0.z);
    figs[f1.id].group.position.set(f1.x, 0, f1.z);
    // 朝向：逻辑给的是弧度（0 = +z），three 的 rotation.y 需要 +PI 补偿
    figs[f0.id].group.rotation.y = f0.facing + Math.PI;
    figs[f1.id].group.rotation.y = f1.facing + Math.PI;
    // 出招的可读提示：起手阶段鼻锥变长（这是"预警"最便宜的实现）
    [[figs[f0.id], f0], [figs[f1.id], f1]].forEach(function (pair) {
      var fig = pair[0], fs = pair[1];
      var s = fs.phase === "startup" ? 1 + fs.t * 0.06 : fs.phase === "active" ? 1.6 : 1;
      fig.nose.scale.set(s, s, s);
      fig.body.material.emissive = fig.body.material.emissive || new Color(0x000000);
      fig.body.material.emissive.setHex(fs.hitstun > 0 ? 0x552222 : 0x000000);
    });
    tickSparks(dt);
    // 机位：从斜侧方看两人中点（可读机位，M0 不做演出机位）
    var mx = (f0.x + f1.x) / 2, mz = (f0.z + f1.z) / 2;
    var dist = Math.max(11, Math.abs(f0.x - f1.x) * 0.9 + 9);
    var sx = mx + (Math.random() - 0.5) * shake, sz = mz + dist;
    camera.position.set(sx, 5.4 + dist * 0.14, sz);
    camera.lookAt(mx, 1.1, mz);
    shake = Math.max(0, shake - dt * 2.2);
  }
  function resize(w, h) {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function render() { renderer.render(scene, camera); }
  return { update: update, resize: resize, render: render, renderer: renderer };
}

/**
 * view/hud.js —— HUD（预算内：只有三块信息）
 * ----------------------------------------------------------------------------
 * 画面可读性预算（research/B-visual-language.md §3.2）：
 *   · 常驻高饱和色族 ≤2（五条冷蓝 / 宿傩赤黑）
 *   · 金色只用于"事件提示"，且同一时刻最多一处
 *   · 文字提示同一时刻最多两处
 * M0 只画：双方血条 / 双方咒力 / 一条事件行。
 */
var HUDBuilder = {
  build: function (root) {
    var el = document.createElement("div");
    el.id = "hud2";
    el.innerHTML = [
      '<div class="bar-row top">',
      '  <div class="side p1"><div class="nm">五条悟</div><div class="bar hp"><i></i></div><div class="bar ce"><i></i></div></div>',
      '  <div class="mid"><span class="num" id="hud2-frame">f0</span><span class="vs">VS</span><span class="num" id="hud2-dist">0.0m</span></div>',
      '  <div class="side p2"><div class="nm">两面宿傩</div><div class="bar hp"><i></i></div><div class="bar ce"><i></i></div></div>',
      "</div>",
      '<div class="msg" id="hud2-msg"></div>',
      '<div class="tip" id="hud2-tip">J 轻击 · K 重击 · 空格 无下限招架 · Shift 闪避 · 1/2 换操控角色 · R 重开</div>'
    ].join("");
    root.appendChild(el);
    return {
      el: el,
      p1: { hp: el.querySelector(".p1 .hp i"), ce: el.querySelector(".p1 .ce i"), nm: el.querySelector(".p1 .nm") },
      p2: { hp: el.querySelector(".p2 .hp i"), ce: el.querySelector(".p2 .ce i"), nm: el.querySelector(".p2 .nm") },
      frame: el.querySelector("#hud2-frame"),
      dist: el.querySelector("#hud2-dist"),
      msg: el.querySelector("#hud2-msg")
    };
  },
  update: function (h, st, events) {
    var a = st.fighters[0], b = st.fighters[1];
    h.p1.hp.style.transform = "scaleX(" + Math.max(0, a.hp / a.hpMax).toFixed(3) + ")";
    h.p2.hp.style.transform = "scaleX(" + Math.max(0, b.hp / b.hpMax).toFixed(3) + ")";
    h.p1.ce.style.transform = "scaleX(" + Math.max(0, a.ce / a.ceMax).toFixed(3) + ")";
    h.p2.ce.style.transform = "scaleX(" + Math.max(0, b.ce / b.ceMax).toFixed(3) + ")";
    h.frame.textContent = "f" + st.frame;
    h.dist.textContent = st.dist.toFixed(1) + "m";
    h.dist.style.color = st.dist > 12 ? "#7b8aa8" : "#5ff0ff";
    var msg = "";
    for (var i = events.length - 1; i >= 0; i--) {
      var e = events[i];
      if (e.type === "parry") { msg = "无下限 · 招架成功　咒力 +" + e.data.ce; break; }
      if (e.type === "dodged") { msg = "闪避成功"; break; }
      if (e.type === "hit") { msg = (e.data.by === "gojo" ? "五条" : "宿傩") + " 命中 " + e.data.dmg + (e.data.combo > 1 ? "　连段 x" + e.data.combo : ""); break; }
      if (e.type === "ko") { msg = (e.data.loser === "gojo" ? "五条悟 败北" : "两面宿傩 讨伐"); break; }
    }
    if (msg) h.msg.textContent = msg;
  }
};

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

})();