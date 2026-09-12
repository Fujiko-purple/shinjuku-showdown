(function () {
var THREE = window.THREE;
var WebGLRenderer = THREE.WebGLRenderer, Scene = THREE.Scene, Fog = THREE.Fog, PerspectiveCamera = THREE.PerspectiveCamera, HemisphereLight = THREE.HemisphereLight, DirectionalLight = THREE.DirectionalLight, Mesh = THREE.Mesh, PlaneGeometry = THREE.PlaneGeometry, MeshStandardMaterial = THREE.MeshStandardMaterial, GridHelper = THREE.GridHelper, RingGeometry = THREE.RingGeometry, MeshBasicMaterial = THREE.MeshBasicMaterial, Group = THREE.Group, CapsuleGeometry = THREE.CapsuleGeometry, SphereGeometry = THREE.SphereGeometry, ConeGeometry = THREE.ConeGeometry, CircleGeometry = THREE.CircleGeometry, Color = THREE.Color, BoxGeometry = THREE.BoxGeometry, CylinderGeometry = THREE.CylinderGeometry, TorusGeometry = THREE.TorusGeometry, Vector3 = THREE.Vector3;
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
 * core/input.js —— 输入包（纯数据：可序列化 / 可 replay / 可进网络包）
 * ----------------------------------------------------------------------------
 * 相机相关的量属于本地表现，不进这个结构。
 * 每个字段只表示"这一帧是否按住"，按下边沿由 sim 自己算（固定帧里算才可复现）。
 */
var INPUT_KEYS = ["light", "heavy", "blue", "red", "purple", "heal", "domain", "parry", "dodge", "v"];

function emptyInput() {
  return {
    moveX: 0, moveZ: 0,
    light: false, heavy: false, blue: false, red: false, purple: false,
    heal: false, domain: false, parry: false, dodge: false, v: false
  };
}
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
function sameInput(a, b) {
  if (a.moveX !== b.moveX || a.moveZ !== b.moveZ) return false;
  for (var i = 0; i < INPUT_KEYS.length; i++) if (a[INPUT_KEYS[i]] !== b[INPUT_KEYS[i]]) return false;
  return true;
}
/** 输入快照（给网络包 / 探针用）：短字符串，只含非零字段 */
function packInput(inp) {
  var s = (inp.moveX || 0).toFixed(2) + "," + (inp.moveZ || 0).toFixed(2);
  for (var i = 0; i < INPUT_KEYS.length; i++) s += inp[INPUT_KEYS[i]] ? "1" : "0";
  return s;
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
 * data/moves.js —— 全招式帧数据表
 * ----------------------------------------------------------------------------
 * 铁律 3：加招 = 加一行数据。sim 里不许出现 "if (move === 'red')" 这种分支，
 * 所有差异都靠这里的字段表达，sim 只负责解释字段。
 *
 * 帧数 = 60Hz 帧。字段：
 *   kind      melee | projectile | defense | buff | domain
 *   startup   起手帧（有预警，对手可读）
 *   active    判定帧
 *   recovery  后摇（规则 11：进攻招 >=30 帧，玩家必须能塞进一整段反击）
 *   dmg       伤害（规则 12 标定：轻击 = 目标最大血 1~1.5%）
 *   ce        咒力消耗 / ceGain 命中时给攻击者的咒力
 *   def       对手**可以怎么解**这一招（规则 1：至少一种零伤害解）
 *   armor     霸体（规则 7：霸体招占比 <=30%）
 *   unblockable 不可格挡（规则 2：必须 >=0.8s 起手）
 */
var MOVES = {
  /* ---------------- 双方共用的体术 ---------------- */
  light1: { id: "light1", name: "打击", key: "light", kind: "melee", startup: 5, active: 3, recovery: 14, reach: 3.4, hitR: 0.6, dmg: 22, kb: 0.5, hitstop: 4, ce: 0, ceGain: 3, poise: 16, def: ["parry", "dodge", "walk"], chain: "light2", chainFrom: 4 },
  light2: { id: "light2", name: "打击二段", key: "light", kind: "melee", startup: 4, active: 3, recovery: 16, reach: 3.6, hitR: 0.6, dmg: 26, kb: 0.9, hitstop: 4, ce: 0, ceGain: 3, poise: 18, def: ["parry", "dodge", "walk"], chain: "light3", chainFrom: 4 },
  light3: { id: "light3", name: "打击三段", key: "light", kind: "melee", startup: 6, active: 4, recovery: 30, reach: 3.8, hitR: 0.7, dmg: 44, kb: 1.8, hitstop: 7, ce: 0, ceGain: 8, poise: 34, def: ["parry", "dodge", "walk"] },
  heavy: { id: "heavy", name: "踢击", key: "heavy", kind: "melee", startup: 12, active: 4, recovery: 32, reach: 4.2, hitR: 0.8, dmg: 96, kb: 5.0, hitstop: 9, ce: 0, ceGain: 5, poise: 55, def: ["parry", "dodge", "walk"] },

  /* ---------------- 防御动作（三个动词，代价互不相同 —— 规则 3） ---------------- */
  /** 招架：窗口极短、失败要挨打，但成功零伤害 + 返资源 + 开反击窗口（规则 4） */
  parry: { id: "parry", name: "无下限·招架", key: "parry", kind: "defense", startup: 0, active: 11, recovery: 16, window: 11, failStun: 20, reward: { ce: 12, counter: 24, foeStun: 30, poise: 18 }, def: [], dmg: 0 },
  /** 闪避：位移 + 无敌帧，但后摇要还回来 */
  dodge: { id: "dodge", name: "闪避", key: "dodge", kind: "defense", startup: 0, active: 0, recovery: 18, iframes: 12, dist: 4.2, def: [], dmg: 0 },
  /** 无下限展开：长按空格；减速并吞掉飞来的术式，持续烧咒力 */
  infinity: { id: "infinity", name: "无下限", key: "parry", kind: "defense", startup: 3, active: 1, recovery: 14, fieldR: 6.2, drain: 14, blockProj: true, slow: 0.35, def: [], dmg: 0 },

  /* ---------------- 五条悟 ---------------- */
  blue: { id: "blue", name: "术式顺转·蒼", key: "blue", kind: "projectile", startup: 12, active: 1, recovery: 22, ce: 22, cd: 300, dmg: 0, pull: 9, proj: { speed: 26, life: 1.4, radius: 2.6, dmg: 0, pull: 9, homing: 0.05, color: 0x2b86ff }, def: ["dodge", "walk"], tags: ["術式"] },
  red: { id: "red", name: "术式反转·赫", key: "red", kind: "projectile", startup: 26, active: 1, recovery: 30, ce: 34, cd: 420, dmg: 165, kb: 8, hitstop: 8, ceGain: 4, poise: 45, guardBreak: true, proj: { speed: 24, life: 1.5, radius: 2.2, dmg: 165, kb: 8, color: 0xff1f3d }, def: ["parry", "dodge"], tags: ["術式"] },
  purple: { id: "purple", name: "虚式·茈", key: "purple", kind: "projectile", startup: 48, active: 1, recovery: 46, ce: 60, cd: 720, charge: true, chargeMax: 60, dmg: 300, unblockable: true, poise: 90, proj: { speed: 34, life: 1.6, radius: 3.0, dmg: 300, pierce: true, color: 0xb04cff }, def: ["dodge", "walk"], tags: ["術式"] },
  reverse: { id: "reverse", name: "反转术式", key: "heal", kind: "buff", startup: 54, active: 1, recovery: 24, ce: 45, cd: 900, heal: 180, def: [], tags: ["治療"] },
  void: { id: "void", name: "领域展开·无量空处", key: "domain", kind: "domain", startup: 54, active: 1, recovery: 30, ce: 0, domain: "void", def: [], tags: ["領域"] },

  /* ---------------- 两面宿傩 ---------------- */
  dismantle: { id: "dismantle", name: "解", key: "blue", kind: "projectile", startup: 24, active: 1, recovery: 26, ce: 12, cd: 300, dmg: 58, kb: 3, hitstop: 5, ceGain: 3, poise: 18, proj: { speed: 40, life: 0.9, radius: 1.5, dmg: 58, kb: 3, color: 0xff6a52 }, def: ["dodge", "walk", "parry"], tags: ["斬撃"] },
  cleave: { id: "cleave", name: "捌", key: "red", kind: "melee", startup: 22, active: 5, recovery: 30, reach: 4.4, hitR: 1.0, dmg: 96, kb: 4, hitstop: 8, ce: 16, cd: 300, ceGain: 3, poise: 40, armor: true, def: ["parry", "dodge"], tags: ["斬撃"] },
  furnace: { id: "furnace", name: "開·竈", key: "purple", kind: "projectile", startup: 48, active: 1, recovery: 40, ce: 30, cd: 660, dmg: 150, kb: 6, unblockable: true, poise: 60, proj: { speed: 30, life: 1.8, radius: 3.2, dmg: 150, kb: 6, aoe: 6.5, color: 0xff8a3d }, def: ["dodge", "walk"], tags: ["火焰"] },
  rush: { id: "rush", name: "突进", key: "heal", kind: "buff", startup: 18, active: 1, recovery: 20, ce: 10, cd: 360, dash: 9.5, dmg: 0, def: ["dodge"], tags: ["体術"] },
  shrine: { id: "shrine", name: "领域展开·伏魔御厨子", key: "domain", kind: "domain", startup: 54, active: 1, recovery: 30, ce: 0, domain: "shrine", def: [], tags: ["領域"] }
};

/** 三连段的顺序（双方一样） */
var COMBO = ["light1", "light2", "light3"];

/**
 * data/characters.js —— 两个角色的数值与招式集
 * ----------------------------------------------------------------------------
 * 规则 12 的伤害标定基准：
 *   轻击 22 / 26 / 44 → 对 1800 血 = 1.2% / 1.4% / 2.4%（符合"轻击 1~1.5%"）
 *   大招（茈 300 / 開 150）对 1500 血 = 20% / 10%；处决 = 12% 最大血
 */
var CHARACTERS = {
  gojo: {
    id: "gojo",
    name: "五条悟",
    title: "现代最强",
    color: 0x5ff0ff,
    accent: 0x2b86ff,
    hpMax: 1500,
    ceMax: 100,
    ceRegen: 6,
    poiseMax: 95,
    speed: 4.9,
    runSpeed: 7.4,
    dodgeSpeed: 13,
    combo: COMBO,
    /** HUD 技能栏 */
    bar: [
      { move: "blue", label: "蒼", sub: "U" },
      { move: "red", label: "赫", sub: "I" },
      { move: "purple", label: "茈", sub: "O" },
      { move: "reverse", label: "反转", sub: "H" },
      { move: "void", label: "领域", sub: "G" }
    ]
  },
  sukuna: {
    id: "sukuna",
    name: "两面宿傩",
    title: "史上最强",
    color: 0xff1f3d,
    accent: 0xffc36a,
    hpMax: 1800,
    ceMax: 100,
    ceRegen: 6,
    poiseMax: 120,
    speed: 4.7,
    runSpeed: 6.9,
    dodgeSpeed: 12,
    combo: COMBO,
    bar: [
      { move: "dismantle", label: "解", sub: "U" },
      { move: "cleave", label: "捌", sub: "I" },
      { move: "furnace", label: "開", sub: "O" },
      { move: "rush", label: "突进", sub: "H" },
      { move: "shrine", label: "领域", sub: "G" }
    ]
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
 * sim/world.js —— 固定帧战斗世界（纯逻辑，不碰 three.js / DOM / 音频）
 * ----------------------------------------------------------------------------
 * 铁律 1+2+5。所有机制都在这一层，view 只订阅事件。
 * 帧序（顺序很重要，改之前先想清楚"谁先动"）：
 *   ① 输入/AI → ② 双方推进（计时器/动作/移动） → ③ 近战判定（同时结算，无帧序偏袒）
 *   → ④ 弹道 → ⑤ 领域 → ⑥ 魔虚罗 → ⑦ 架势崩坏 → ⑧ 资源 → ⑨ 胜负
 */
function createWorld(opts) {
  opts = opts || {};
  var rng = RNG.make(opts.seed || 20260913);
  var events = createEvents();
  var control = ["human", "human"];
  var frame = 0, freeze = 0, matchOver = null;
  var fighters = [], projectiles = [], domains = [], maho = null;
  var tmp = { ax: 0, az: 0, bx: 0, bz: 0 };
  var nextProjId = 1;

  function mkFighter(charId, side, x, facing) {
    var c = CHARACTERS[charId];
    return {
      id: c.id, side: side, char: c,
      x: x, z: 0, facing: facing,
      hp: c.hpMax, hpMax: c.hpMax, ce: Math.round(c.ceMax * 0.5), ceMax: c.ceMax,
      poise: c.poiseMax, poiseMax: c.poiseMax, poiseTimer: 0, broken: 0,
      action: null, hitstun: 0, iframes: 0, counter: 0, frozen: 0,
      zoneT: 0, bfReady: 0, bfPressAt: -999, bfCount: 0,
      gauge: 0, domainT: 0, domainKind: null, domainCd: 0,
      cds: {}, combo: 0, comboWindow: 0, lastHurtFrame: -9999, dealt: 0,
      ai: { t: 0, cd: 60, last: null, hist: [], panic: 0 },
      _prev: null, _aiEdge: null
    };
  }
  function foeOf(f) { return f.side === 0 ? fighters[1] : fighters[0]; }

  /** reset 必须连随机种子一起重置，否则"同样输入两遍"不可能一致（探针 A2） */
  function reset(seed, c1, c2) {
    rng = RNG.make(seed === undefined ? (opts.seed || 20260913) : seed);
    fighters = [
      mkFighter(c1 || opts.p1 || "gojo", 0, -5, Math.PI / 2),
      mkFighter(c2 || opts.p2 || "sukuna", 1, 5, -Math.PI / 2)
    ];
    projectiles = []; domains = []; maho = null;
    frame = 0; freeze = 0; matchOver = null; nextProjId = 1;
    events.clear();
  }
  reset();

  /* ============================ 出招 ============================ */
  function canAct(f, mv) {
    /** 领域展开无视"行动不能"：伏魔御厨子是开放领域，从外面起（原作的结构性优势） */
    if (mv && mv.kind === "domain") {
      if (matchOver || f.hitstun > 0 || f.broken > 0) return false;
      return !f.action || f.action.phase === "recovery";
    }
    if (matchOver || f.frozen > 0) return false;
    if (f.hitstun > 0 || f.broken > 0) return false;
    if (!f.action) return true;
    var mv = f.action.move;
    return !!(mv.chain && f.action.phase === "recovery" && f.action.t <= mv.chainFrom);
  }
  function ready(f, mv) {
    if ((f.cds[mv.id] || 0) > 0) return false;
    if ((mv.ce || 0) > f.ce) return false;
    if (mv.kind === "domain" && (f.gauge < 100 || f.domainCd > 0 || f.domainT > 0)) return false;
    if (mv.charge && f.action && f.action.move === mv) return true;   // 蓄力中
    return true;
  }
  function startAction(f, mv, opt) {
    var zoneCost = f.zoneT > 0 ? 0.7 : 1;
    if ((mv.ce || 0) > 0) f.ce = Math.max(0, f.ce - mv.ce * zoneCost);
    if (mv.cd) f.cds[mv.id] = mv.cd;
    f.action = {
      move: mv, t: 0, hitLanded: false, charge: 0,
      phase: mv.startup > 0 ? "startup" : (mv.active > 0 ? "active" : "recovery")
    };
    events.push("start", { id: f.id, move: mv.id, startup: mv.startup, name: mv.name });
    /** 位移类起手：突进 / 闪避 立刻给位移 */
    if (mv.dash) { var fx = Math.sin(f.facing), fz = Math.cos(f.facing); f.x += fx * mv.dash; f.z += fz * mv.dash; f.iframes = Math.max(f.iframes, 10); }
    if (mv.id === "dodge") {
      f.iframes = mv.iframes;
      var bx = -Math.sin(f.facing), bz = -Math.cos(f.facing);
      var wantBack = opt && opt.back;
      f.x += (wantBack ? bx : -bx) * mv.dist * 0.55;
      f.z += (wantBack ? bz : -bz) * mv.dist * 0.55;
    }
    return f.action;
  }
  function pickMove(f, inp, pressed) {
    // 领域 / 术式 优先级最高，其次是防御，最后是体术
    if (pressed.domain && ready(f, MOVES[f.char.bar[4].move])) return MOVES[f.char.bar[4].move];
    var bar = f.char.bar;
    if (pressed.heal && ready(f, MOVES[bar[3].move])) return MOVES[bar[3].move];
    if (pressed.purple && ready(f, MOVES[bar[2].move])) {
      var pm = MOVES[bar[2].move];
      // 蓄力招：按住不放 → 进蓄力；松手才发射（由 tickAction 处理）
      if (!(f.action && f.action.move === pm)) return pm;
    }
    if (pressed.red && ready(f, MOVES[bar[1].move])) return MOVES[bar[1].move];
    if (pressed.blue && ready(f, MOVES[bar[0].move])) return MOVES[bar[0].move];
    if (pressed.parry) return MOVES.parry;
    if (pressed.dodge) return MOVES.dodge;
    if (pressed.heavy) return MOVES.heavy;
    if (pressed.light) {
      if (f.action && f.action.phase === "recovery" && f.action.move.chain) return MOVES[f.action.move.chain];
      if (!f.action) return MOVES.light1;
    }
    return null;
  }

  /* ============================ 命中结算 ============================ */
  function isParryActive(f) {
    return !!(f.action && f.action.move.kind === "defense" && f.action.move.id === "parry" && f.action.phase === "active");
  }
  function hasInfinity(f) {
    return !!(f.action && f.action.move.id === "infinity" && f.action.phase === "active");
  }
  /** 伤害入口：所有伤害都必须走这里，规则 1/2/4/12 都在这一处生效 */
  function landHit(att, def, mv, hitX, hitZ) {
    if (matchOver) return false;
    var px = hitX === undefined ? def.x : hitX;
    var pz = hitZ === undefined ? def.z : hitZ;
    /** ① 招架：零伤害 + 返资源 + 开反击窗口（规则 4） */
    if (!mv.unblockable && isParryActive(def)) {
      var rw = MOVES.parry.reward;
      def.ce = Math.min(def.ceMax, def.ce + rw.ce);
      def.counter = rw.counter;
      def.zoneT = Math.max(def.zoneT, 60);
      att.hitstun = rw.foeStun;
      att.action = null;
      att.poise = Math.max(0, att.poise - rw.poise);
      freeze = Math.max(freeze, 7);
      events.push("parry", { by: def.id, attacker: att.id, ce: def.ce, counter: def.counter, foeStun: att.hitstun, x: px, z: pz });
      return true;
    }
    /** ② 无下限展开：近战被挡下（零伤害），但烧防御方咒力 */
    if (mv.kind === "melee" && hasInfinity(def)) {
      def.ce = Math.max(0, def.ce - 8);
      att.hitstun = 10;
      events.push("blocked", { by: def.id, attacker: att.id, x: px, z: pz });
      freeze = Math.max(freeze, 4);
      return true;
    }
    /** ③ 无敌帧 */
    if (def.iframes > 0) {
      events.push("dodged", { by: def.id, attacker: att.id, x: px, z: pz });
      return false;
    }
    /** ④ 真伤害 */
    var mul = 1;
    if (att.zoneT > 0) mul *= 1.15;
    var bf = false;
    if (mv.kind === "melee" && att.side === 0 && Math.abs(frame - att.bfPressAt) <= 3 && att.bfReady <= 0) {
      bf = true; mul *= 2.5; att.bfReady = 300; att.zoneT = 600; att.bfCount++;
      events.push("blackflash", { by: att.id, x: px, z: pz });
      freeze = Math.max(freeze, 12);
    }
    var raw2 = mv.dmg * mul;
    if (att.side === 1) raw2 *= (opts.aiDmg || 1);      // 难度档只影响 AI 打出的伤害
    var dmg = Math.round(raw2);
    /**
     * 领域展开是"结印"动作：起手之后不吃硬直、不被打断（原作的领域展开也是霸体演出）。
     * 没有这一条，无量空处一开对手就永远开不出自己的领域 → 领域对拼机制直接死掉。
     */
    var steadfast = !!(def.action && def.action.move.kind === "domain");
    /** 记下"最近一次命中"：命中之后再按 V 也能补判黑闪（±3 帧是双向的） */
    att.lastHit = { frame: frame, dmg: dmg, victim: def, move: mv.id };
    if (steadfast) {
      events.push("hit", { by: att.id, on: def.id, move: mv.id, name: mv.name, dmg: dmg, hp: def.hp, combo: att.combo || 1, heavy: false, x: px, z: pz });
      return true;
    }
    def.hp = Math.max(0, def.hp - dmg);
    def.lastHurtFrame = frame;
    def.poise = Math.max(0, def.poise - (mv.poise || 6) * (bf ? 1.6 : 1));
    def.poiseTimer = 150;
    def.hitstun = Math.max(def.hitstun, mv.dmg >= 90 ? 30 : 15);
    def.action = null;
    att.ce = Math.min(att.ceMax, att.ce + (mv.ceGain || 0));
    att.gauge = Math.min(100, att.gauge + 2);
    def.gauge = Math.min(100, def.gauge + 3);
    att.dealt += dmg;
    if (mv.kb) { var kx = def.x - att.x, kz = def.z - att.z, kl = Math.hypot(kx, kz) || 1; def.x += kx / kl * mv.kb; def.z += kz / kl * mv.kb; }
    freeze = Math.max(freeze, mv.hitstop || 4);
    if (att.comboWindow > 0) att.combo++; else att.combo = 1;
    att.comboWindow = 54;
    events.push("hit", { by: att.id, on: def.id, move: mv.id, name: mv.name, dmg: dmg, hp: def.hp, combo: att.combo, heavy: mv.dmg >= 90, bf: bf, x: px, z: pz });
    if (def.hp <= 0) { matchOver = att.id; events.push("ko", { loser: def.id, winner: att.id }); }
    return true;
  }

  /** 处决：对手"架势崩坏"时按重击 → 12% 最大血 */
  function tryExecute(f) {
    var foe = foeOf(f);
    if (foe.broken <= 0) return false;
    if (dist(f, foe) > 4.6) return false;
    var dmg = Math.round(foe.hpMax * 0.12);
    foe.hp = Math.max(0, foe.hp - dmg);
    foe.broken = 0; foe.poise = foe.poiseMax * 0.7; foe.hitstun = 30;
    f.gauge = Math.min(100, f.gauge + 10);
    freeze = Math.max(freeze, 16);
    events.push("execute", { by: f.id, on: foe.id, dmg: dmg, hp: foe.hp, x: foe.x, z: foe.z });
    if (foe.hp <= 0) { matchOver = f.id; events.push("ko", { loser: foe.id, winner: f.id }); }
    return true;
  }

  /* ============================ 近战判定 ============================ */
  function resolveMelee(f) {
    var a = f.action;
    if (!a || a.phase !== "active" || a.hitLanded) return;
    var mv = a.move;
    if (mv.kind !== "melee") return;
    var foe = foeOf(f);
    if (sweepHits(f, mv, foe, tmp)) {
      a.hitLanded = true;
      landHit(f, foe, mv, (f.x + foe.x) / 2, (f.z + foe.z) / 2);
    }
  }

  /* ============================ 动作推进 ============================ */
  function tickAction(f, inp, pressed) {
    var a = f.action;
    if (!a) return;
    var mv = a.move;
    a.t++;
    if (mv.charge && a.phase === "startup") {
      // 蓄力：按住不放就继续攒（上限 chargeMax），松手或攒满 → 发射
      var held = !!inp[mv.key];
      a.charge = Math.min(mv.chargeMax, a.charge + (held ? 1 : 0));
      var power = 0.6 + 0.4 * (a.charge / mv.chargeMax);
      a.power = power;
      if (!held || a.charge >= mv.chargeMax) { a.phase = "active"; a.t = 0; }
      return;
    }
    if (a.phase === "startup" && a.t >= mv.startup) { a.phase = mv.active > 0 ? "active" : "recovery"; a.t = 0; }
    else if (a.phase === "active" && a.t >= mv.active) { a.phase = "recovery"; a.t = 0; }
    else if (a.phase === "recovery" && a.t >= mv.recovery) { f.action = null; return; }

    if (!f.action) return;
    a = f.action; mv = a.move;
    /** 判定帧：远程/领域/治疗在进入 active 的那一帧结算 */
    if (a.phase === "active" && !a.hitLanded) {
      if (mv.kind === "projectile") { a.hitLanded = true; spawnProjectile(f, mv, a.power || 1); }
      else if (mv.kind === "buff") {
        a.hitLanded = true;
        if (mv.heal) { f.hp = Math.min(f.hpMax, f.hp + mv.heal); events.push("heal", { id: f.id, amount: mv.heal, hp: f.hp }); }
        if (mv.dash) { events.push("rush", { id: f.id }); }
      } else if (mv.kind === "domain") { a.hitLanded = true; openDomain(f, mv.domain); }
    }
  }

  /* ============================ 弹道 ============================ */
  function spawnProjectile(f, mv, power) {
    var pr = mv.proj || {};
    var fx = Math.sin(f.facing), fz = Math.cos(f.facing);
    var dmg = Math.round((pr.dmg || mv.dmg || 0) * power);
    projectiles.push({
      id: nextProjId++, owner: f.id, side: f.side, move: mv.id, name: mv.name,
      x: f.x + fx * 0.7, z: f.z + fz * 0.7, y: 1.15,
      vx: fx * pr.speed, vz: fz * pr.speed,
      life: pr.life, radius: pr.radius || 1.2, dmg: dmg,
      kb: pr.kb || 0, poise: mv.poise || 10, color: pr.color || 0xffffff,
      pierce: !!pr.pierce, aoe: pr.aoe || 0, pull: pr.pull || 0, homing: pr.homing || 0,
      unblockable: !!mv.unblockable, kind: mv.kind, chargePower: power
    });
    events.push("cast", { id: f.id, move: mv.id, name: mv.name, x: f.x, z: f.z, color: pr.color });
  }
  function tickProjectiles() {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      var owner = p.side === 0 ? fighters[0] : fighters[1];
      var foe = p.side === 0 ? fighters[1] : fighters[0];
      if (p.homing) {
        var dx = foe.x - p.x, dz = foe.z - p.z, dl = Math.hypot(dx, dz) || 1;
        p.vx += (dx / dl * 20 - p.vx) * p.homing; p.vz += (dz / dl * 20 - p.vz) * p.homing;
      }
      p.x += p.vx * FIXED_DT; p.z += p.vz * FIXED_DT; p.life -= FIXED_DT;
      // 无下限展开：吞掉飞进来的术式
      if (hasInfinity(foe)) {
        var fd = Math.hypot(p.x - foe.x, p.z - foe.z);
        if (fd < MOVES.infinity.fieldR) {
          foe.ce = Math.max(0, foe.ce - 6);
          events.push("absorb", { by: foe.id, move: p.move, x: p.x, z: p.z });
          projectiles.splice(i, 1); continue;
        }
      }
      // 命中
      var d = Math.hypot(p.x - foe.x, p.z - foe.z);
      if (d < p.radius + 0.5) {
        landHit(owner, foe, { dmg: p.dmg, kb: p.kb, poise: p.poise, kind: "projectile", unblockable: p.unblockable, ceGain: 3, hitstop: 6, id: p.move, name: p.name }, p.x, p.z);
        if (p.aoe) events.push("explode", { x: p.x, z: p.z, radius: p.aoe, color: p.color });
        if (!p.pierce) { projectiles.splice(i, 1); continue; }
      }
      if (p.life <= 0 || Math.abs(p.x) > 44 || Math.abs(p.z) > 44) { projectiles.splice(i, 1); continue; }
    }
  }

  /* ============================ 领域 ============================ */
  function openDomain(f, kind) {
    var other = domains.filter(function (d) { return d.owner !== f.id; })[0];
    var d = { owner: f.id, side: f.side, kind: kind, t: 0, life: 8 * 60, radius: kind === "void" ? 9 : 22, anchors: [], broken: false };
    if (kind === "shrine") {
      for (var k = 0; k < 3; k++) {
        var ang = Math.PI * 2 * k / 3 + 0.5;
        d.anchors.push({ x: f.x + Math.cos(ang) * 18, z: f.z + Math.sin(ang) * 18, hp: 120, alive: true });
      }
    }
    f.gauge = 0; f.domainT = d.life; f.domainKind = kind;
    if (other) {
      /**
       * 领域对拼的胜负规则（按原作的结构性优势）：
       *   开放领域（伏魔御厨子）> 封闭领域（无量空处）—— 封闭领域的外壳会被从外面啃碎；
       *   两次都是同类型时，后开的占优（抢时机）。
       * 五条的应对不是硬拼，而是**跑到外沿打掉 3 个锚点**（见下面 shrine 的分支）。
       */
      var voidIsOther = other.kind === "void";
      var voidIsNew = kind === "void";
      /** 两个都不是封闭领域 → 后开者赢；只要有一方是封闭领域 → 封闭的那一方被压碎 */
      var breakOther = !(voidIsNew && !voidIsOther);
      if (breakOther) other.broken = true; else d.broken = true;
      var losingDom = breakOther ? other : d;
      var openWins = (voidIsOther && !voidIsNew);
      var loser = losingDom.side === 0 ? fighters[0] : fighters[1];
      loser.domainT = 0; loser.domainKind = null; loser.domainCd = 6 * 60;
      loser.hp = Math.max(0, loser.hp - 60);
      events.push("domainclash", { winner: f.id, loser: loser.id, openWins: openWins, winnerKind: kind });
      events.push("domainbroken", { id: loser.id, hp: loser.hp });
      if (loser.hp <= 0) { matchOver = f.id; events.push("ko", { loser: loser.id, winner: f.id }); }
    }
    domains.push(d);
    events.push("domain", { id: f.id, kind: kind, x: f.x, z: f.z, radius: d.radius, anchors: d.anchors.length });
  }
  function tickDomains() {
    for (var i = domains.length - 1; i >= 0; i--) {
      var d = domains[i];
      d.t++;
      var owner = d.side === 0 ? fighters[0] : fighters[1];
      var foe = d.side === 0 ? fighters[1] : fighters[0];
      if (d.kind === "void") {
        var inside = Math.hypot(foe.x - owner.x, foe.z - owner.z) < d.radius;
        if (inside && !foe.hitstun) { foe.frozen = 2; if (d.t % 60 === 0) landHit(owner, foe, { dmg: 18, poise: 4, ceGain: 0, hitstop: 2, id: "void", name: "无量空处", kind: "domain" }, foe.x, foe.z); }
      } else {
        // 伏魔御厨子：开放领域，每 1s 落一刀，从外部打破 3 个锚点即可提前解除
        if (d.t % 60 === 0) landHit(owner, foe, { dmg: 55, poise: 8, ceGain: 0, hitstop: 3, id: "shrine", name: "伏魔御厨子", kind: "domain" }, foe.x, foe.z);
        for (var k = 0; k < d.anchors.length; k++) {
          var an = d.anchors[k];
          if (!an.alive) continue;
          for (var pi = projectiles.length - 1; pi >= 0; pi--) {
            var p = projectiles[pi];
            if (p.side === d.side) continue;
            if (Math.hypot(p.x - an.x, p.z - an.z) < 3.2) { an.hp -= p.dmg; projectiles.splice(pi, 1); events.push("anchor", { x: an.x, z: an.z, hp: an.hp }); }
          }
          if (an.hp <= 0) { an.alive = false; events.push("anchordown", { x: an.x, z: an.z }); }
        }
        if (d.anchors.every(function (a) { return !a.alive; })) {
          d.broken = true;
          owner.domainT = 0; owner.domainKind = null; owner.domainCd = 6 * 60;
          owner.hp = Math.max(0, owner.hp - 120);
          owner.ce = 0;
          events.push("domainbroken", { id: owner.id, hp: owner.hp, byAnchors: true });
          if (owner.hp <= 0) { matchOver = foe.id; events.push("ko", { loser: owner.id, winner: foe.id }); }
        }
      }
      owner.domainT = Math.max(0, owner.domainT - 1);
      if (d.t >= d.life || d.broken || owner.domainT <= 0) {
        owner.domainT = 0; owner.domainKind = null; owner.domainCd = 6 * 60;
        domains.splice(i, 1);
        events.push("domainend", { id: owner.id, broken: !!d.broken });
      }
    }
  }

  /* ============================ 魔虚罗（无血条：适应进度） ============================ */
  function summonMahoraga() {
    var sk = fighters[1];
    maho = {
      alive: true, x: sk.x + 6, z: sk.z - 4, y: 4.5, t: 0,
      state: "air", cd: 180, adapt: { melee: 0, skill: 0 }, interrupts: 0,
      weakT: 0, adaptT: 0, dead: false, hp: 999
    };
    events.push("summon", { x: maho.x, z: maho.z });
  }
  function tickMahoraga() {
    if (!maho) {
      if (fighters[1].hp / fighters[1].hpMax <= 0.5 && !fighters[1].deadFlag) { fighters[1].deadFlag = true; summonMahoraga(); }
      return;
    }
    if (!maho.alive) return;
    maho.t++;
    var pl = fighters[0];
    if (maho.state === "summon") {
      maho.y -= 3.2 * FIXED_DT;
      if (maho.y <= 4.5) { maho.y = 4.5; maho.state = "air"; maho.cd = 120; }
      return;
    }
    if (maho.state === "adapting") {
      maho.adaptT++;
      if (maho.adaptT >= 90) { maho.state = "air"; maho.adapt.melee = Math.min(1, maho.adapt.melee + 0.34); maho.adapt.skill = Math.min(1, maho.adapt.skill + 0.34); events.push("adaptdone", { melee: maho.adapt.melee }); }
      return;
    }
    if (maho.state === "dive") {
      maho.t2 = (maho.t2 || 0) + 1;
      maho.y = Math.max(0.4, maho.y - 14 * FIXED_DT);
      if (maho.y <= 0.45) { maho.state = "down"; maho.weakT = 96; maho.t2 = 0; events.push("mahodive", { x: maho.x, z: maho.z }); }
      return;
    }
    if (maho.state === "down") {
      maho.weakT--;
      if (maho.weakT <= 0) { maho.state = "air"; maho.y = 4.5; maho.cd = 150; }
      return;
    }
    // 空中：慢慢挪向玩家，定期出手（出手前有 0.8s 预警）
    var dx = pl.x - maho.x, dz = pl.z - maho.z, dl = Math.hypot(dx, dz) || 1;
    maho.x += dx / dl * 2.4 * FIXED_DT; maho.z += dz / dl * 2.4 * FIXED_DT;
    maho.cd--;
    if (maho.cd <= 0) {
      var r = rng.next();
      if (r < 0.45) { maho.state = "dive"; maho.t2 = 0; events.push("mahowindup", { kind: "dive", x: maho.x, z: maho.z, w: 48 }); maho.cd = 240; }
      else if (r < 0.75) { maho.state = "adapting"; maho.adaptT = 0; events.push("mahowindup", { kind: "adapt", x: maho.x, z: maho.z, w: 90 }); maho.cd = 300; }
      else { events.push("mahobolt", { x: maho.x, z: maho.z }); maho.cd = 180;
        if (Math.hypot(pl.x - maho.x, pl.z - maho.z) < 5) landHit(fighters[1], pl, { dmg: 60, poise: 20, kb: 3, hitstop: 6, id: "maho_bolt", name: "落雷", kind: "projectile", unblockable: false, ceGain: 0 }, pl.x, pl.z);
      }
    }
  }
  /** 玩家打魔虚罗：按"类型"积累适应，满了就免疫那一类 */
  function damageMahoraga(att, mv, kind) {
    if (!maho || !maho.alive) return false;
    var cat = kind === "melee" ? "melee" : "skill";
    if (maho.adapt[cat] >= 1) { events.push("mahoimmune", { cat: cat, x: maho.x, z: maho.z }); return true; }
    if (mv.id === "purple") {   // 原作：它就是被最大出力的茈一击拆掉的
      maho.alive = false;
      events.push("mahodead", { x: maho.x, z: maho.z });
      att.gauge = Math.min(100, att.gauge + 30);
      freeze = Math.max(freeze, 20);
      return true;
    }
    maho.adapt[cat] = Math.min(1, maho.adapt[cat] + (cat === "melee" ? 0.14 : 0.24));
    if (maho.state === "adapting") {
      maho.interrupts++;
      maho.state = "air"; maho.y = 4.5; maho.cd = 200;
      maho.adapt.melee = Math.max(0, maho.adapt.melee - 0.3);
      maho.adapt.skill = Math.max(0, maho.adapt.skill - 0.3);
      att.ce = Math.min(att.ceMax, att.ce + 30);
      events.push("mahoint", { x: maho.x, z: maho.z, interrupts: maho.interrupts });
      freeze = Math.max(freeze, 10);
      if (maho.interrupts >= 2) { maho.alive = false; events.push("mahodead", { x: maho.x, z: maho.z }); att.gauge = Math.min(100, att.gauge + 30); }
    }
    return true;
  }

  /* ============================ 一帧 ============================ */
  /** 黑闪的按下处理（提前按 / 命中后补按都走这里） */
  function onVPress(f) {
    f.bfPressAt = frame;
    if (f.bfReady > 0 || !f.lastHit) return;
    var dt2 = frame - f.lastHit.frame;
    if (dt2 <= 0 || dt2 > 3) return;
    if (!f.lastHit.victim || f.lastHit.victim.hp <= 0) return;
    var bonus = Math.round(f.lastHit.dmg * 1.5);
    f.lastHit.victim.hp = Math.max(0, f.lastHit.victim.hp - bonus);
    f.bfReady = 300; f.zoneT = 600; f.bfCount++;
    freeze = Math.max(freeze, 12);
    events.push("blackflash", { by: f.id, x: f.lastHit.victim.x, z: f.lastHit.victim.z, bonus: bonus, late: true });
    if (f.lastHit.victim.hp <= 0) { matchOver = f.id; events.push("ko", { loser: f.lastHit.victim.id, winner: f.id }); }
  }

  function step(in1, in2) {
    frame++;
    /**
     * ⚠ 顿帧期间必须继续采样输入。
     * 命中会冻结 4~12 帧，而黑闪窗口是"命中帧 ±3"——不采样的话玩家在顿帧里按的 V
     * 会被整段丢掉（探针 A8 第一次就是这么挂的，而且是真实可玩的 bug）。
     */
    var rawIn = [in1, in2];
    for (var fi = 0; fi < 2; fi++) {
      var fr = fighters[fi];
      var r2 = rawIn[fi];
      if (r2 === null || r2 === undefined || control[fi] === "ai") continue;
      var ni = normalizeInput(r2);
      /**
       * ⚠ 这里**不能**写 fr._prev：tickFighter 靠 _prev 算"按下边沿"，
       * 提前覆盖会把边沿吃掉 —— 结果就是所有攻击都发不出来（踩过一次，全套探针挂了 10 条）。
       * 黑闪只用一个独立的 _latchPrev 记"上一帧采样值"。
       */
      var lp = fr._latchPrev || emptyInput();
      if (ni.v && !lp.v) onVPress(fr);
      fr._latchPrev = ni;
    }
    if (freeze > 0) { freeze--; events.push("hitstop", { left: freeze }); return; }
    if (matchOver) return;

    var inputs = [in1, in2];
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      var raw = inputs[i];
      if (raw === null || raw === undefined || control[i] === "ai") raw = aiInput(f);
      tickFighter(f, normalizeInput(raw));
    }
    resolveMelee(fighters[0]);
    resolveMelee(fighters[1]);
    tickProjectiles();
    tickDomains();
    tickMahoraga();
    tickPoise();
    tickResource();
  }

  function tickFighter(f, inp) {
    var prev = f._prev || emptyInput();
    var pressed = {};
    for (var k = 0; k < INPUT_KEYS.length; k++) { var kk = INPUT_KEYS[k]; pressed[kk] = !!inp[kk] && !prev[kk]; }
    f._prev = inp;

    if (f.hitstun > 0) f.hitstun--;
    if (f.iframes > 0) f.iframes--;
    if (f.counter > 0) f.counter--;
    if (f.frozen > 0) f.frozen--;
    if (f.broken > 0) f.broken--;
    if (f.zoneT > 0) f.zoneT--;
    if (f.bfReady > 0) f.bfReady--;
    if (f.domainCd > 0) f.domainCd--;
    for (var id in f.cds) if (f.cds[id] > 0) f.cds[id]--;
    if (f.comboWindow > 0) { f.comboWindow--; if (f.comboWindow === 0) f.combo = 0; }

    // 无下限展开：长按招架键超过窗口 → 从招架切成展开
    if (f.action && f.action.move.id === "parry" && inp.parry && f.action.phase !== "startup" && f.action.t > 2) {
      var held = (f.parryHold || 0) + 1; f.parryHold = held;
      if (held > 8 && f.ce > 4) { f.action = null; startAction(f, MOVES.infinity); f.parryHold = 0; }
    } else f.parryHold = 0;
    if (f.action && f.action.move.id === "infinity") {
      f.ce = Math.max(0, f.ce - MOVES.infinity.drain * FIXED_DT);
      if (f.ce <= 0 || !inp.parry) { f.action = { move: MOVES.infinity, t: 0, phase: "recovery", hitLanded: true }; }
    }

    // 黑闪：按下边沿（正常帧里也算一次，AI 与探针直接喂输入时走这条路）
    if (pressed.v) onVPress(f);

    // 处决：架势崩坏时按重击
    if (pressed.heavy && foeOf(f).broken > 0) {
      if (tryExecute(f)) { f.action = null; return; }   // 处决是终结技：不受"正在出招"限制
    }

    var mv = pickMove(f, inp, pressed);
    if (mv && (canAct(f, mv) || (mv.charge && f.action && f.action.move === mv))) {
      if (!(f.action && f.action.move === mv && mv.charge)) startAction(f, mv, { back: inp.moveZ < -0.4 });
    }
    // 蓄力中松手 → 发射由 tickAction 处理（见上）
    tickAction(f, inp, pressed);

    // 移动（出招与受击时降速；跑图不再有收益，见 tickResource）
    var acting = !!f.action && f.action.move.kind !== "defense";
    var stunned = f.hitstun > 0 || f.broken > 0 || f.frozen > 0;
    var mag = Math.hypot(inp.moveX, inp.moveZ);
    if (!stunned && mag > 0.08) {
      var mul = acting ? (f.action.phase === "active" ? 0.18 : 0.36) : 1;
      var sp = f.char.speed * mul * (f.zoneT > 0 ? 1.12 : 1);
      f.x = clampPos(f.x + inp.moveX * sp * FIXED_DT);
      f.z = clampPos(f.z + inp.moveZ * sp * FIXED_DT);
      if (!acting) f.facing = Math.atan2(inp.moveX, inp.moveZ);
    }
    if (!acting) {
      var foe = foeOf(f);
      if (!stunned || true) f.facing = Math.atan2(foe.x - f.x, foe.z - f.z);
    }
    // 贴身时把对手推开
    var fo = foeOf(f);
    var ddx = fo.x - f.x, ddz = fo.z - f.z, dd = Math.hypot(ddx, ddz);
    if (dd < 0.9 && dd > 1e-4) { var push = (0.9 - dd) / 2; f.x -= ddx / dd * push; f.z -= ddz / dd * push; }
  }
  function clampPos(v) { return v < -40 ? -40 : v > 40 ? 40 : v; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  function tickPoise() {
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      if (f.poiseTimer > 0) f.poiseTimer--;
      else if (f.poise < f.poiseMax) f.poise = Math.min(f.poiseMax, f.poise + 14 * FIXED_DT);
      if (f.poise <= 0 && f.broken <= 0) {
        f.broken = 66;   // 1.1s 架势崩坏 → 对手可以处决
        f.action = null;
        events.push("broken", { id: f.id, x: f.x, z: f.z });
        freeze = Math.max(freeze, 10);
      }
    }
  }
  function tickResource() {
    var d = dist(fighters[0], fighters[1]);
    var near = d <= 12;
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      if (near) f.ce = Math.min(f.ceMax, f.ce + f.char.ceRegen * FIXED_DT);
      else f.ce = Math.max(0, f.ce - 3 * FIXED_DT);          // 规则 5：跑图没收益
      f.gauge = Math.min(100, f.gauge + (near ? 1.6 : 0.6) * FIXED_DT);
    }
  }

  /* ============================ AI（规则 8/9/10） ============================ */
  function aiInterval(f) {
    var ratio = f.hp / f.hpMax;
    var base = ratio > 0.66 ? 132 : ratio > 0.33 ? 96 : 66;   // 2.2s / 1.6s / 1.1s（规则 8 的下限）
    return Math.max(40, Math.round(base * (opts.diffMul || 1)));
  }
  function aiInput(f) {
    var foe = foeOf(f);
    var inp = emptyInput();
    f.ai.t++;
    var d = dist(f, foe);
    /** 反应延迟（规则 10）：AI 只看 12 帧前的对手状态，且绝不读按键 */
    f.ai.hist.push({ x: foe.x, z: foe.z, move: foe.action ? foe.action.move.id : null, phase: foe.action ? foe.action.phase : null });
    var react = opts.react || 12;          // 规则 10：反应延迟 >=0.2s（12 帧）
    if (f.ai.hist.length > react) f.ai.hist.shift();
    var seen = f.ai.hist[0];

    if (f.ai.cd > 0) f.ai.cd--;
    var bar = f.char.bar;
    // 位移类：远距离拉近或拉远
    if (d > 7 && f.ai.cd <= 0 && ready(f, MOVES[bar[3].move]) && MOVES[bar[3].move].dash) { f.ai.cd = aiInterval(f); f.ai.last = bar[3].move; return withMove(inp, "heal"); }
    if (d > 4.4) { inp.moveX = (foe.x - f.x) / d; inp.moveZ = (foe.z - f.z) / d; }
    else if (d < 2.2) { inp.moveX = -(foe.x - f.x) / d; inp.moveZ = -(foe.z - f.z) / d; }
    // 反击窗口：对手后摇/架势崩坏 → 立刻打
    var punish = foe.broken > 0 || (seen && seen.phase === "recovery");
    if (punish && f.ai.cd <= 0 && d < 4.4) {
      f.ai.cd = Math.floor(aiInterval(f) * 0.5);
      var pk = f.ai.last === "heavy" ? "cleave" : "heavy";     // 规则 9：不连续复用同一招
      f.ai.last = pk;
      return withMove(inp, pk);
    }
    // 见招拆招（规则 1 的另一面：AI 也要用防御动词）
    if (seen && seen.phase === "startup" && d < 5.5 && rng.next() < (opts.parryP || 0.28)) { f.ai.cd = Math.max(f.ai.cd, 24); return withMove(inp, "parry"); }
    if (f.ai.cd <= 0) {
      var pool = [];
      if (d < 4.6) pool.push("light", "light", "heavy", "cleave", "cleave");
      if (d > 3.0) pool.push("dismantle", "dismantle");
      if (d > 5.0) pool.push("furnace");
      if (d > 7.0 && MOVES[f.char.bar[3].move].dash) pool.push("heal");
      if (f.gauge >= 100 && f.domainCd <= 0 && f.domainT <= 0) pool.push("domain");
      f.ai.recent = f.ai.recent || {};
      /**
       * 规则 9 的落实：同一招 4 秒内不再选（不是"只防相邻重复"，
       * 那样会把 dismantle 刷成常态 —— 实测第一版 40 秒里刷了 5 次）。
       */
      var fresh = pool.filter(function (c) { return (frame - (f.ai.recent[c] || -99999)) > 240; });
      if (!fresh.length) fresh = pool.filter(function (c) { return c !== f.ai.last; });
      if (!fresh.length) fresh = ["light"];
      var pick = fresh[Math.floor(rng.next() * fresh.length) % fresh.length];
      f.ai.recent[pick] = frame;
      f.ai.last = pick;
      f.ai.cd = aiInterval(f);
      return withMove(inp, pick);
    }
    return inp;
  }
  function withMove(inp, pick) {
    if (pick === "light" || pick === "heavy" || pick === "cleave") { inp[pick === "cleave" ? "red" : pick] = true; return inp; }
    if (pick === "parry") { inp.parry = true; return inp; }
    if (pick === "dodge") { inp.dodge = true; return inp; }
    if (pick === "dismantle") { inp.blue = true; return inp; }
    if (pick === "furnace") { inp.purple = true; inp.holdPurple = false; return inp; }
    if (pick === "domain") { inp.domain = true; return inp; }
    if (pick === "heal") { inp.heal = true; return inp; }
    inp.light = true; return inp;
  }

  /* ============================ 对外接口 ============================ */
  function state() {
    return {
      frame: frame, freeze: freeze, over: matchOver, projectiles: projectiles.length,
      domains: domains.map(function (d) { return { owner: d.side, kind: d.kind, t: d.t, anchors: d.anchors.filter(function (a) { return a.alive; }).length, radius: d.radius }; }),
      maho: maho ? { alive: maho.alive, x: +maho.x.toFixed(2), z: +maho.z.toFixed(2), y: +maho.y.toFixed(2), state: maho.state, adapt: { melee: +maho.adapt.melee.toFixed(2), skill: +maho.adapt.skill.toFixed(2) }, interrupts: maho.interrupts } : null,
      dist: +dist(fighters[0], fighters[1]).toFixed(3),
      fighters: fighters.map(function (f) {
        return {
          id: f.id, side: f.side, x: +f.x.toFixed(3), z: +f.z.toFixed(3), facing: +f.facing.toFixed(3),
          hp: f.hp, hpMax: f.hpMax, ce: +f.ce.toFixed(2), ceMax: f.ceMax,
          poise: +f.poise.toFixed(1), poiseMax: f.poiseMax,
          gauge: +f.gauge.toFixed(1), zoneT: f.zoneT, broken: f.broken, hitstun: f.hitstun, frozen: f.frozen,
          counter: f.counter, iframes: f.iframes, combo: f.combo, domainT: f.domainT, domainKind: f.domainKind,
          move: f.action ? f.action.move.id : null, phase: f.action ? f.action.phase : null, t: f.action ? f.action.t : 0,
          charge: f.action && f.action.charge ? +f.action.charge.toFixed(1) : 0
        };
      })
    };
  }
  function hash() {
    var s = frame + "|" + freeze + "|" + (matchOver || "-") + "|";
    for (var i = 0; i < 2; i++) {
      var f = fighters[i];
      s += [f.id, f.x.toFixed(4), f.z.toFixed(4), f.facing.toFixed(3), f.hp, f.ce.toFixed(2), f.poise.toFixed(2),
        f.hitstun, f.broken, f.iframes, f.zoneT, f.gauge.toFixed(2), f.action ? f.action.move.id + ":" + f.action.phase + ":" + f.action.t : "-"].join(",") + "|";
    }
    s += projectiles.length + "|" + domains.length + "|" + (maho ? (maho.state + maho.x.toFixed(2) + maho.adapt.melee.toFixed(2)) : "-");
    var h = 0x811c9dc5;
    for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }

  return {
    step: step, state: state, hash: hash, reset: reset, events: events,
    fighters: function () { return fighters; },
    projectiles: function () { return projectiles; },
    domains: function () { return domains; },
    mahoraga: function () { return maho; },
    damageMahoraga: damageMahoraga,
    landHit: landHit,
    setControl: function (i, mode) { control[i] = mode; },
    /** 难度只调"决策节奏 + 反应延迟"，不调伤害（规则 8 的精神） */
    /**
     * 难度旋钮。注意规则 8 的原意是"BOSS 的阶段推进不能靠加伤害"，
     * 而玩家自己选的难度档是可以调伤害的 —— 这是两种不同的东西。
     *   简单：出手更慢 + 反应更慢 + AI 伤害 ×0.75（新手能活下来）
     *   困难：出手更密 + 反应更快 + AI 伤害 ×1.15
     */
    setDifficulty: function (d) {
      opts.diffMul = [1.55, 1, 0.72][d] || 1;
      opts.react = [18, 12, 8][d] || 12;
      opts.parryP = [0.12, 0.28, 0.42][d] || 0.28;
      opts.aiDmg = [0.75, 1, 1.15][d] || 1;
    },
    difficultyParry: function () { return opts.parryP || 0.28; },
    frame: function () { return frame; }
  };
}

/**
 * view/audio.js —— 极简程序化音效（WebAudio，无音频资源）
 * ----------------------------------------------------------------------------
 * 为什么要有：没有声音的打击游戏"手感"直接砍半（旧版 demo 的教训）。
 * 全部现场合成：一个振荡器 + 一段噪声 + 包络，没有文件、没有加载、没有体积。
 * 首次用户交互后才创建 AudioContext（浏览器策略）。
 */
var SFX = (function () {
  var ctx = null, master = null, noiseBuf = null, muted = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }
  function now() { return ctx.currentTime; }
  function env(node, t0, a, d, peak) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g); g.connect(master);
    return g;
  }
  function tone(freq, type, a, d, peak, slide) {
    if (!ensure() || muted) return;
    var t0 = now();
    var o = ctx.createOscillator();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + a + d);
    env(o, t0, a, d, peak);
    o.start(t0); o.stop(t0 + a + d + 0.02);
  }
  function noise(a, d, peak, lp) {
    if (!ensure() || muted) return;
    var t0 = now();
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = lp || 1200;
    s.connect(f);
    env(f, t0, a, d, peak);
    s.start(t0); s.stop(t0 + a + d + 0.02);
  }
  var LIB = {
    hit_light: function () { noise(0.004, 0.07, 0.5, 2600); tone(180, "square", 0.004, 0.05, 0.18, 90); },
    hit_heavy: function () { noise(0.006, 0.16, 0.7, 1400); tone(90, "sawtooth", 0.006, 0.14, 0.3, 40); },
    parry: function () { tone(1200, "triangle", 0.002, 0.18, 0.35, 2400); noise(0.002, 0.12, 0.4, 5000); },
    blocked: function () { tone(420, "sine", 0.004, 0.14, 0.25, 260); },
    dodge: function () { noise(0.01, 0.12, 0.16, 900); },
    cast: function () { tone(320, "sine", 0.01, 0.22, 0.22, 620); },
    domain: function () { tone(70, "sawtooth", 0.05, 0.9, 0.4, 45); noise(0.05, 0.8, 0.3, 500); },
    blackflash: function () { noise(0.002, 0.28, 0.85, 900); tone(1500, "square", 0.002, 0.2, 0.3, 120); },
    ko: function () { tone(180, "triangle", 0.02, 0.7, 0.42, 60); noise(0.02, 0.6, 0.35, 700); },
    ui: function () { tone(760, "square", 0.004, 0.06, 0.2, 900); },
    execute: function () { tone(60, "sawtooth", 0.01, 0.5, 0.5, 30); noise(0.01, 0.4, 0.5, 1100); }
  };
  return {
    play: function (name) { var f = LIB[name]; if (f) { try { f(); } catch (e) { /* 忽略 */ } } },
    unlock: function () { var c = ensure(); if (c && c.state === "suspended") c.resume(); },
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted: function () { return muted; }
  };
})();

/**
 * view/scene.js —— 表现层（three.js）：角色外观 / 术式 / 领域 / 特效 / 机位
 * ----------------------------------------------------------------------------
 * 铁律 1：只读 sim 的 state 与事件，绝不反过来改逻辑。
 * 外观按 research/E-manga-art-refs.md 的"剪影特征"拼：
 *   五条：尖刺外翘白发 + 眼部黑横带 + 黑色高立领 + 超长腿
 *   宿傩：短刺发 + 脸上交叉黑纹 + 眼下第二对眼 + 黑指甲 + 深色和服
 *   魔虚罗：头顶金色法轮(8 辐条 + 8 圆珠) + 无眼 + 四枚长角 + 宽肩窄腰 + 黑下装 + 长尾
 */
function createSceneView(canvas) {
  var renderer = new WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setClearColor(0x05070d, 1);
  var scene = new Scene();
  scene.fog = new Fog(0x05070d, 26, 90);
  var camera = new PerspectiveCamera(44, 16 / 9, 0.1, 400);

  scene.add(new HemisphereLight(0x9fc6ff, 0x141a26, 0.7));
  var key = new DirectionalLight(0xfff0dd, 1.15); key.position.set(7, 14, 9); scene.add(key);
  var rimL = new DirectionalLight(0x5ff0ff, 0.95); rimL.position.set(-9, 6, -8); scene.add(rimL);
  var rimR = new DirectionalLight(0xff3b52, 0.8); rimR.position.set(9, 5, -8); scene.add(rimR);
  var fill = new DirectionalLight(0xbcd2ff, 0.4); fill.position.set(0, 3, 12); scene.add(fill);

  var ground = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: 0x12161f, roughness: 0.96, metalness: 0.04 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  var grid = new GridHelper(200, 100, 0x243049, 0x161d2b); grid.position.y = 0.01; scene.add(grid);
  var ring = new Mesh(new RingGeometry(11.6, 12, 128), new MeshBasicMaterial({ color: 0x2b4a6b, transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
  /** 场地道具：给距离感与纵深（没有参照物的空地对动作游戏是灾难） */
  for (var pi = 0; pi < 10; pi++) {
    var ang0 = (pi / 10) * Math.PI * 2 + 0.3;
    var rr = 15 + (pi % 3) * 3.5;
    var hh = 5 + (pi % 4) * 2.4;
    var pil = new Mesh(new BoxGeometry(1.4 + (pi % 3) * 0.6, hh, 1.4 + (pi % 2) * 0.8), new MeshStandardMaterial({ color: 0x1b2130, roughness: 0.9, metalness: 0.06 }));
    pil.position.set(Math.cos(ang0) * rr, hh / 2, Math.sin(ang0) * rr);
    scene.add(pil);
    var cap = new Mesh(new BoxGeometry(2.0, 0.22, 2.0), new MeshBasicMaterial({ color: pi % 2 ? 0x2b86ff : 0xff2b3a, transparent: true, opacity: 0.5 }));
    cap.position.y = hh / 2 + 0.2; pil.add(cap);
  }

  /* ---------------- 材质工具 ---------------- */
  function mat(color, emissive, emiIntensity) {
    var m = new MeshStandardMaterial({ color: color, roughness: 0.52, metalness: 0.12 });
    if (emissive !== undefined) { m.emissive = new Color(emissive); m.emissiveIntensity = emiIntensity === undefined ? 0.6 : emiIntensity; }
    return m;
  }
  function boxMesh(w, h, d, m) { var x = new Mesh(new BoxGeometry(w, h, d), m); return x; }
  function sphere(r, m, seg) { return new Mesh(new SphereGeometry(r, seg || 16, seg ? seg - 2 : 14), m); }
  function capsule(r, len, m) { return new Mesh(new CapsuleGeometry(r, len, 6, 14), m); }

  /* ---------------- 五条悟 ---------------- */
  function buildGojo() {
    var g = new Group();
    var skin = mat(0xe6c9b4), cloth = mat(0x232a36), accent = mat(0x11141a);
    var torso = capsule(0.3, 0.5, cloth); torso.position.y = 1.25; g.add(torso);
    var collar = boxMesh(0.56, 0.34, 0.4, cloth); collar.position.y = 1.66; g.add(collar);   // 又高又厚的立领
    var hips = boxMesh(0.46, 0.3, 0.34, cloth); hips.position.y = 0.98; g.add(hips);
    var legs = new Group();
    var lL = capsule(0.11, 0.72, cloth); lL.position.set(-0.15, 0.52, 0); legs.add(lL);
    var lR = capsule(0.11, 0.72, cloth); lR.position.set(0.15, 0.52, 0); legs.add(lR);
    g.add(legs);
    var arms = new Group();
    function gojoArm(side) {
      var pivot = new Group(); pivot.position.set(side * 0.42, 1.52, 0);
      var upper = capsule(0.085, 0.5, cloth); upper.position.y = -0.26; pivot.add(upper);
      var hand = sphere(0.09, skin); hand.position.y = -0.55; pivot.add(hand);
      arms.add(pivot); return pivot;
    }
    var armL = gojoArm(-1), armR = gojoArm(1);
    g.add(arms);
    var head = sphere(0.19, skin); head.position.y = 1.98; g.add(head);
    var hair = new Group();
    for (var i = 0; i < 9; i++) {
      var spike = new Mesh(new ConeGeometry(0.07, 0.34, 6), mat(0xf4f7ff));
      var ang = (i / 9) * Math.PI * 2;
      spike.position.set(Math.cos(ang) * 0.13, 2.16 + (i % 2) * 0.03, Math.sin(ang) * 0.13);
      spike.rotation.set(Math.cos(ang) * 0.55, 0, -Math.sin(ang) * 0.55);
      hair.add(spike);
    }
    var cap = sphere(0.17, mat(0xeef3ff)); cap.position.y = 2.06; hair.add(cap);
    g.add(hair);
    var blind = boxMesh(0.42, 0.1, 0.06, mat(0x0a0b10)); blind.position.set(0, 2.0, 0.17); g.add(blind);   // 眼罩横带
    var aura = new Mesh(new SphereGeometry(0.62, 16, 12), new MeshBasicMaterial({ color: 0x5ff0ff, transparent: true, opacity: 0.07 }));
    aura.position.y = 1.3; g.add(aura);
    return { group: g, torso: torso, arms: arms, armL: armL, armR: armR, legs: legs, head: head, blind: blind, aura: aura, hair: hair };
  }
  /* ---------------- 两面宿傩 ---------------- */
  function buildSukuna() {
    var g = new Group();
    var skin = mat(0xc99a7c), cloth = mat(0x2a1420), accent = mat(0x0a0a0f);
    var torso = capsule(0.32, 0.5, cloth); torso.position.y = 1.24; g.add(torso);
    var kimono = boxMesh(0.74, 0.88, 0.44, cloth); kimono.position.y = 1.14; g.add(kimono);
    var sash = boxMesh(0.76, 0.16, 0.46, mat(0x7a1220)); sash.position.y = 1.0; g.add(sash);   // 腰带
    var hips = boxMesh(0.5, 0.3, 0.36, cloth); hips.position.y = 0.96; g.add(hips);
    var legs = new Group();
    var lL = capsule(0.115, 0.72, cloth); lL.position.set(-0.16, 0.5, 0); legs.add(lL);
    var lR = capsule(0.115, 0.72, cloth); lR.position.set(0.16, 0.5, 0); legs.add(lR);
    g.add(legs);
    var arms = new Group();
    function sukunaArm(side) {
      var pivot = new Group(); pivot.position.set(side * 0.44, 1.5, 0);
      var upper = capsule(0.095, 0.5, skin); upper.position.y = -0.26; pivot.add(upper);
      var hand = sphere(0.1, accent); hand.position.y = -0.56; pivot.add(hand);   // 黑指甲
      arms.add(pivot); return pivot;
    }
    var armL = sukunaArm(-1), armR = sukunaArm(1);
    g.add(arms);
    var head = sphere(0.2, skin); head.position.y = 1.97; g.add(head);
    var hair2 = new Group();
    for (var i = 0; i < 8; i++) {
      var sp = new Mesh(new ConeGeometry(0.07, 0.24, 6), mat(0xd97b86));
      var a2 = (i / 8) * Math.PI * 2;
      sp.position.set(Math.cos(a2) * 0.14, 2.12, Math.sin(a2) * 0.14);
      sp.rotation.set(Math.cos(a2) * 0.7, 0, -Math.sin(a2) * 0.7);
      hair2.add(sp);
    }
    g.add(hair2);
    // 脸上交叉黑纹 + 眼下第二对眼
    var t1 = boxMesh(0.035, 0.26, 0.03, accent); t1.position.set(-0.08, 1.99, 0.17); t1.rotation.z = 0.4; g.add(t1);
    var t2 = boxMesh(0.035, 0.26, 0.03, accent); t2.position.set(0.08, 1.99, 0.17); t2.rotation.z = -0.4; g.add(t2);
    var e1 = boxMesh(0.09, 0.045, 0.03, mat(0xff2b3a, 0xff2b3a, 1.1)); e1.position.set(-0.07, 2.03, 0.18); g.add(e1);
    var e2 = boxMesh(0.09, 0.045, 0.03, mat(0xff2b3a, 0xff2b3a, 1.1)); e2.position.set(0.07, 2.03, 0.18); g.add(e2);
    var e3 = boxMesh(0.07, 0.035, 0.03, mat(0xff6a52, 0xff6a52, 1.0)); e3.position.set(-0.1, 1.96, 0.19); g.add(e3);
    var e4 = boxMesh(0.07, 0.035, 0.03, mat(0xff6a52, 0xff6a52, 1.0)); e4.position.set(0.1, 1.96, 0.19); g.add(e4);
    var aura = new Mesh(new SphereGeometry(0.66, 16, 12), new MeshBasicMaterial({ color: 0xff1f3d, transparent: true, opacity: 0.06 }));
    aura.position.y = 1.3; g.add(aura);
    return { group: g, torso: torso, arms: arms, armL: armL, armR: armR, legs: legs, head: head, aura: aura, hair: hair2 };
  }

  var figures = { gojo: buildGojo(), sukuna: buildSukuna() };
  /** 脚下彩色圆盘：同屏两个角色的第一识别手段 */
  function footDisc(color) {
    var d = new Mesh(new RingGeometry(0.52, 0.8, 32), new MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6, side: 2 }));
    d.rotation.x = -Math.PI / 2; d.position.y = 0.03; scene.add(d); return d;
  }
  figures.gojo.disc = footDisc(0x5ff0ff);
  figures.sukuna.disc = footDisc(0xff1f3d);
  figures.gojo.group.scale.setScalar(1.12);
  figures.sukuna.group.scale.setScalar(1.12);
  scene.add(figures.gojo.group); scene.add(figures.sukuna.group);

  /* ---------------- 魔虚罗（无血条怪：法轮 / 四角 / 马步 / 长尾） ---------------- */
  var maho = null;
  function buildMahoraga() {
    var g = new Group();
    var bone = mat(0xe9eae2), dark = mat(0x101014), gold = mat(0xd9a441, 0xd9a441, 0.35);
    var torso = capsule(0.46, 0.72, bone); torso.position.y = 2.25; g.add(torso);
    var shoulder = boxMesh(1.5, 0.34, 0.6, bone); shoulder.position.y = 2.78; g.add(shoulder);
    var hips = boxMesh(0.72, 0.44, 0.5, bone); hips.position.y = 1.72; g.add(hips);
    var skirt = new Mesh(new CylinderGeometry(0.62, 0.9, 0.8, 8, 1, true), dark); skirt.position.y = 1.25; g.add(skirt);
    var legs = new Group();
    var lL = capsule(0.16, 0.72, bone); lL.position.set(-0.34, 0.62, 0); legs.add(lL);
    var lR = capsule(0.16, 0.72, bone); lR.position.set(0.34, 0.62, 0); legs.add(lR);
    g.add(legs);
    var head = sphere(0.3, bone); head.position.y = 3.28; g.add(head);
    var jaw = boxMesh(0.42, 0.12, 0.3, bone); jaw.position.set(0, 3.13, 0.12); g.add(jaw);
    for (var t = 0; t < 4; t++) {
      var horn = new Mesh(new ConeGeometry(0.075, t < 2 ? 2.1 : 1.0, 6), bone);
      var side = t % 2 === 0 ? -1 : 1;
      horn.position.set(side * 0.24, 3.5 + (t < 2 ? 0.9 : 0.35), (t < 2 ? -0.05 : 0.12));
      horn.rotation.z = side * (t < 2 ? 0.42 : 0.9);
      g.add(horn);
    }
    var wheel = new Group();
    var rim = new Mesh(new TorusGeometry(0.62, 0.06, 8, 28), gold); rim.rotation.x = Math.PI / 2; wheel.add(rim);
    for (var s = 0; s < 8; s++) {
      var ang2 = (s / 8) * Math.PI * 2;
      var spoke = boxMesh(0.06, 0.06, 1.2, gold); spoke.rotation.y = ang2; wheel.add(spoke);
      var orb = sphere(0.11, gold, 10); orb.position.set(Math.cos(ang2) * 0.72, 0, Math.sin(ang2) * 0.72); wheel.add(orb);
    }
    wheel.position.y = 4.34; g.add(wheel);
    var tail = capsule(0.08, 1.1, bone); tail.position.set(0, 1.2, -0.7); tail.rotation.x = 1.1; g.add(tail);
    var sword = boxMesh(0.06, 0.06, 2.5, mat(0xd8dde6, 0xd8dde6, 0.25)); sword.position.set(0.72, 1.4, 0.5); sword.rotation.x = 1.35; g.add(sword);
    g.visible = false;
    scene.add(g);
    return { group: g, wheel: wheel, legs: legs };
  }

  /* ---------------- 弹道 / 领域 / 火花 ---------------- */
  var projPool = [];
  function getProj(i) {
    if (projPool[i]) return projPool[i];
    var m = sphere(0.5, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), 14);
    var halo = sphere(0.85, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }), 12);
    var g = new Group(); g.add(m); g.add(halo); g.visible = false; scene.add(g);
    projPool[i] = { group: g, core: m, halo: halo };
    return projPool[i];
  }
  var domainMesh = { sphere: null, shrine: null, anchors: [] };
  function ensureDomain() {
    if (!domainMesh.sphere) {
      domainMesh.sphere = new Mesh(new SphereGeometry(1, 24, 18), new MeshBasicMaterial({ color: 0x0b1030, transparent: true, opacity: 0.55, side: 1 }));
      domainMesh.sphere.visible = false; scene.add(domainMesh.sphere);
      /** 边界：没有这层线框，黑球在夜景里根本看不见（截图实测） */
      domainMesh.rim = new Mesh(new SphereGeometry(1.005, 18, 12), new MeshBasicMaterial({ color: 0x7fb0ff, wireframe: true, transparent: true, opacity: 0.28 }));
      domainMesh.rim.visible = false; scene.add(domainMesh.rim);
      var shrine = new Group();
      for (var i = 0; i < 3; i++) {
        /** 锚点必须"隔着半个场地也能一眼看到"：亮红柱 + 白骨山 + 底部光环 + 数字提示 */
        var pillar = new Group();
        var shaft = boxMesh(0.9, 9, 0.9, new MeshStandardMaterial({ color: 0x8c1220, roughness: 0.6, emissive: new Color(0x5a0710), emissiveIntensity: 0.9 }));
        shaft.position.y = 4.5; pillar.add(shaft);
        var cowl = boxMesh(2.4, 1.0, 2.4, new MeshStandardMaterial({ color: 0x2a0a0e, roughness: 0.8 }));
        cowl.position.y = 9.2; pillar.add(cowl);
        var bone = sphere(1.15, new MeshBasicMaterial({ color: 0xe8e2d4, transparent: true, opacity: 0.92 }), 10);
        bone.position.y = 10.2; pillar.add(bone);
        var halo = new Mesh(new RingGeometry(1.8, 2.6, 28), new MeshBasicMaterial({ color: 0xff3b52, transparent: true, opacity: 0.75, side: 2 }));
        halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; pillar.add(halo);
        shrine.add(pillar);
        domainMesh.anchors.push(pillar);
      }
      /** 开放领域的作用范围：地面染红 + 外沿红环（没有这个，玩家不知道"外沿"在哪） */
      var floor = new Mesh(new CircleGeometry(1, 48), new MeshBasicMaterial({ color: 0x5a0710, transparent: true, opacity: 0.5 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.04; shrine.add(floor);
      var edge = new Mesh(new RingGeometry(0.975, 1, 64), new MeshBasicMaterial({ color: 0xff3b52, transparent: true, opacity: 0.9, side: 2 }));
      edge.rotation.x = -Math.PI / 2; edge.position.y = 0.05; shrine.add(edge);
      shrine.visible = false; scene.add(shrine);
      domainMesh.shrine = shrine; domainMesh.shrineFloor = floor; domainMesh.shrineEdge = edge;
    }
  }
  var sparks = [], sparkGeo = new SphereGeometry(0.13, 8, 6);
  for (var si = 0; si < 64; si++) {
    var sm = new Mesh(sparkGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    sm.visible = false; scene.add(sm); sparks.push({ mesh: sm, t: 0, vx: 0, vy: 0, vz: 0 });
  }
  var sparkAt = 0;
  function burst(x, y, z, color, count, power, up) {
    for (var i = 0; i < count; i++) {
      var s = sparks[(sparkAt = (sparkAt + 1) % sparks.length)];
      s.mesh.visible = true; s.mesh.position.set(x, y, z);
      s.mesh.material.color.setHex(color); s.mesh.material.opacity = 1;
      s.vx = (Math.random() - 0.5) * power; s.vy = (up || 0.4) * power * Math.random(); s.vz = (Math.random() - 0.5) * power;
      s.t = 0.5; s.max = 0.5;
    }
  }
  var shake = 0, shakeMax = 0;
  function onEvents(evs, st) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], d = e.data || {};
      if (e.type === "hit") {
        burst(d.x, d.heavy ? 1.35 : 1.15, d.z, d.bf ? 0x1a1a1a : 0xffd873, d.heavy ? 14 : 7, d.heavy ? 7 : 4.5);
        if (d.bf) burst(d.x, 1.2, d.z, 0xff2b3a, 18, 9);
        shake = Math.min(0.8, shake + (d.heavy ? 0.4 : 0.16)); shakeMax = 0.8;
      } else if (e.type === "parry") { burst(d.x, 1.25, d.z, 0x5ff0ff, 18, 6); shake = Math.min(0.9, shake + 0.35); }
      else if (e.type === "broken") { burst(d.x, 1.3, d.z, 0xffd873, 22, 7); shake = Math.min(1, shake + 0.5); }
      else if (e.type === "execute") { burst(d.x, 1.3, d.z, 0xff1f3d, 30, 10); shake = 1; }
      else if (e.type === "blackflash") { shake = 1; }
      else if (e.type === "domain") { shake = 0.9; }
      else if (e.type === "mahodead") { burst(d.x, 2.5, d.z, 0xffd873, 40, 12); shake = 1; }
      else if (e.type === "mahoint") { burst(d.x, 3, d.z, 0x5ff0ff, 20, 8); shake = 0.6; }
      else if (e.type === "dodged") { burst(d.x, 0.8, d.z, 0x9aa8c0, 5, 3); }
      else if (e.type === "explode") { burst(d.x, 1, d.z, 0xff8a3d, 24, 9); shake = 0.7; }
    }
  }

  /* ---------------- 每帧 ---------------- */
  var t0 = 0;
  function update(st, evs, dt) {
    t0 += dt;
    onEvents(evs, st);
    var f0 = st.fighters[0], f1 = st.fighters[1];
    [f0, f1].forEach(function (f) {
      var fig = figures[f.id];
      if (!fig) return;
      fig.group.position.set(f.x, 0, f.z);
      fig.group.rotation.y = f.facing + Math.PI;
      // 受击/架势崩坏/冻结的姿态
      var lean = f.hitstun > 0 ? -0.28 : f.broken > 0 ? 0.5 : 0;
      fig.torso.rotation.x = fig.torso.rotation.x * 0.7 + lean * 0.3;
      fig.head.rotation.x = fig.head.rotation.x * 0.7 + lean * 0.4;
      if (f.broken > 0) fig.group.position.y = -0.35;
      // 出招动画：起手抬臂 / 判定挥出 / 后摇回收
      /** 挥击：绕"肩关节"转（绕身体中心转会把手臂甩出去 —— 截图里手脚飞出体外的那个 bug） */
      var punch = 0;
      var melee = f.move === "light1" || f.move === "light2" || f.move === "light3" || f.move === "heavy" || f.move === "cleave";
      if (melee) punch = f.phase === "startup" ? -0.9 * Math.min(1, f.t / 9) : f.phase === "active" ? 1.25 : Math.max(0, 1.05 - f.t / 18);
      else if (f.move) punch = f.phase === "startup" ? -0.55 : 0.6;
      if (fig.armR) {
        fig.armR.rotation.x = fig.armR.rotation.x * 0.55 + punch * 0.45;
        fig.armL.rotation.x = fig.armL.rotation.x * 0.55 - punch * 0.16;
        fig.arms.position.z = fig.arms.position.z * 0.6 + Math.max(0, punch) * 0.2;
      }
      var bob = Math.sin(t0 * 3 + (f.side ? 1.5 : 0)) * 0.02;
      fig.group.scale.setScalar(1);
      fig.group.position.y += bob + (f.broken > 0 ? 0 : 0);
      fig.aura.material.opacity = (f.zoneT > 0 ? 0.2 : 0.07) + (f.iframes > 0 ? 0.12 : 0);
      fig.aura.material.color.setHex(f.zoneT > 0 ? 0xffd873 : 0x5ff0ff);
    });
    // 弹道
    for (var i = 0; i < projPool.length; i++) if (projPool[i]) projPool[i].group.visible = false;
    for (var j = 0; j < st.projectiles; j++) { /* 数量由 sim 给，位置由下面的详细状态补 */ }
    var simProj = (MAIN && MAIN.world && MAIN.world.projectiles) ? MAIN.world.projectiles() : [];
    for (var k = 0; k < simProj.length; k++) {
      var p = simProj[k], pv = getProj(k);
      pv.group.visible = true;
      pv.group.position.set(p.x, p.y, p.z);
      pv.core.material.color.setHex(p.color);
      pv.halo.material.color.setHex(p.color);
      var sc = p.radius / 0.5;
      pv.group.scale.setScalar(sc);
    }
    // 领域
    ensureDomain();
    var doms = st.domains || [];
    domainMesh.sphere.visible = false;
    if (domainMesh.rim) domainMesh.rim.visible = false;
    var shrineDom = null;
    for (var di = 0; di < doms.length; di++) {
      var d = doms[di];
      if (d.kind === "void") {
        var owner = d.owner === 0 ? f0 : f1;
        domainMesh.sphere.visible = true;
        domainMesh.sphere.position.set(owner.x, 3.2, owner.z);
        domainMesh.sphere.scale.setScalar(d.radius);
        domainMesh.rim.visible = true;
        domainMesh.rim.position.copy(domainMesh.sphere.position);
        domainMesh.rim.scale.setScalar(d.radius * (1 + Math.sin(t0 * 2) * 0.004));
      } else shrineDom = d;
    }
    if (shrineDom) {
      var owner2 = shrineDom.owner === 0 ? f0 : f1;
      domainMesh.shrine.visible = true;
      domainMesh.shrine.position.set(owner2.x, 0, owner2.z);
      domainMesh.shrineFloor.scale.setScalar(shrineDom.radius);
      domainMesh.shrineEdge.scale.setScalar(shrineDom.radius);
      var pulse = 1 + Math.sin(t0 * 3) * 0.01;
      domainMesh.shrineEdge.scale.setScalar(shrineDom.radius * pulse);
      for (var ai = 0; ai < domainMesh.anchors.length; ai++) {
        var an = domainMesh.anchors[ai];
        var alive = ai < shrineDom.anchors;
        an.visible = true;                       // 打掉的锚点保留"残骸"（变暗），玩家才知道打掉了一个
        var a3 = (ai / domainMesh.anchors.length) * Math.PI * 2 + 0.5;
        an.position.set(Math.cos(a3) * shrineDom.radius * 0.82, 0, Math.sin(a3) * shrineDom.radius * 0.82);
        an.scale.setScalar(alive ? 1 : 0.55);
        an.traverse(function (o) { if (o.isMesh && o.material && o.material.opacity !== undefined) { if (!alive && o.material.transparent) o.material.opacity = 0.12; } });
      }
    } else if (domainMesh.shrine) domainMesh.shrine.visible = false;
    // 魔虚罗
    if (st.maho && st.maho.alive) {
      if (!maho) maho = buildMahoraga();
      maho.group.visible = true;
      maho.group.position.set(st.maho.x, 0, st.maho.z);
      maho.wheel.rotation.y += dt * (1.2 + st.maho.adapt.melee * 4);
      var hover = st.maho.state === "down" ? 0 : st.maho.y;
      maho.group.position.y = st.maho.state === "down" ? 0 : (st.maho.y - 4.5) * 0.0 + (st.maho.state === "air" || st.maho.state === "adapting" ? Math.sin(t0 * 1.5) * 0.15 : 0);
      maho.group.rotation.y = Math.atan2(f0.x - st.maho.x, f0.z - st.maho.z) + Math.PI;
      maho.group.scale.setScalar(st.maho.state === "down" ? 0.86 : 1);
    } else if (maho) maho.group.visible = false;

    for (var s2 = 0; s2 < sparks.length; s2++) {
      var sp2 = sparks[s2];
      if (sp2.t <= 0) { if (sp2.mesh.visible) sp2.mesh.visible = false; continue; }
      sp2.t -= dt;
      sp2.mesh.position.x += sp2.vx * dt; sp2.mesh.position.y += sp2.vy * dt; sp2.mesh.position.z += sp2.vz * dt;
      sp2.vy -= 11 * dt;
      sp2.mesh.material.opacity = Math.max(0, sp2.t / (sp2.max || 0.5));
      if (sp2.t <= 0) sp2.mesh.visible = false;
    }
    // 机位：从斜侧看两人中点，按距离拉远（可读优先）
    var mx = (f0.x + f1.x) / 2, mz = (f0.z + f1.z) / 2;
    var dd = Math.hypot(f0.x - f1.x, f0.z - f1.z);
    /** 机位：下限收紧到 6.8 —— 角色必须占住画面足够高度才看得清动作 */
    var camDist = 6.8 + dd * 0.5;
    var sx = mx + camDist * 0.42 + (Math.random() - 0.5) * shake * 0.4, sz = mz + camDist * 0.9;
    camera.position.lerp(new Vector3(sx, 2.6 + camDist * 0.2, sz), 0.12);
    camera.lookAt(mx, 1.15, mz);
    shake = Math.max(0, shake - dt * 2.6);
    ring.position.set(f0.x, 0.02, f0.z);
    figures.gojo.disc.position.set(f0.x, 0.03, f0.z);
    figures.sukuna.disc.position.set(f1.x, 0.03, f1.z);
    figures.gojo.disc.material.opacity = 0.42 + (f0.zoneT > 0 ? 0.4 : 0);
    figures.sukuna.disc.material.opacity = 0.42 + (f1.zoneT > 0 ? 0.4 : 0);
  }
  function resize(w, h) {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function render() { renderer.render(scene, camera); }
  return { update: update, resize: resize, render: render, renderer: renderer };
}

/**
 * view/hud.js —— HUD（按画面可读性预算：常驻色族 <=2，金色只留给事件提示）
 * ----------------------------------------------------------------------------
 * 信息优先级：血 > 咒力 > 架势(削韧) > 领域槽 > 技能冷却 > 事件提示
 * 魔虚罗**不显示血条**：显示"适应进度"（原作里它没有血条，只有适应）。
 */
var HUD = {
  build: function (root) {
    var el = document.createElement("div");
    el.id = "hud3";
    el.innerHTML = [
      '<div class="top">',
      '  <div class="side p1">',
      '    <div class="nm"><b></b><span></span></div>',
      '    <div class="bar hp"><i></i></div>',
      '    <div class="bar ce"><i></i></div>',
      '    <div class="bar poise"><i></i></div>',
      "  </div>",
      '  <div class="mid"><div class="clock">60</div><div class="dist">0.0m</div></div>',
      '  <div class="side p2">',
      '    <div class="nm"><span></span><b></b></div>',
      '    <div class="bar hp"><i></i></div>',
      '    <div class="bar ce"><i></i></div>',
      '    <div class="bar poise"><i></i></div>',
      "  </div>",
      "</div>",
      '<div class="maho" id="hud3-maho"><span class="t">魔虚罗</span><div class="adapt"><i></i></div><span class="v">适应 0%</span></div>',
      '<div class="msg" id="hud3-msg"></div>',
      '<div class="combo" id="hud3-combo"></div>',
      '<div class="bars">',
      '  <div class="slot" data-move="blue"><em>U</em><b>蒼</b><i class="cd"></i></div>',
      '  <div class="slot" data-move="red"><em>I</em><b>赫</b><i class="cd"></i></div>',
      '  <div class="slot" data-move="purple"><em>O</em><b>茈</b><i class="cd"></i></div>',
      '  <div class="slot" data-move="heal"><em>H</em><b>反转</b><i class="cd"></i></div>',
      '  <div class="slot dom" data-move="domain"><em>G</em><b>领域</b><i class="cd"></i><i class="fill"></i></div>',
      "</div>",
      '<div class="keys">J 轻击 · K 重击 · 空格 招架（长按展开无下限） · Shift 闪避 · V 黑闪 · R 重开 · Esc 暂停</div>'
    ].join("");
    root.appendChild(el);
    var $ = function (s) { return el.querySelector(s); };
    return {
      el: el, msg: $("#hud3-msg"), combo: $("#hud3-combo"),
      p1: { nm: $(".p1 .nm b"), sub: $(".p1 .nm span"), hp: $(".p1 .hp i"), ce: $(".p1 .ce i"), poise: $(".p1 .poise i") },
      p2: { nm: $(".p2 .nm b"), sub: $(".p2 .nm span"), hp: $(".p2 .hp i"), ce: $(".p2 .ce i"), poise: $(".p2 .poise i") },
      clock: $(".clock"), dist: $(".dist"),
      maho: $("#hud3-maho"), mahoBar: $("#hud3-maho .adapt i"), mahoV: $("#hud3-maho .v"),
      slots: Array.prototype.slice.call(el.querySelectorAll(".slot")),
      msgT: 0
    };
  },
  update: function (h, st, evs, dt, extra) {
    var a = st.fighters[0], b = st.fighters[1];
    function setSide(s, f) {
      s.hp.style.transform = "scaleX(" + Math.max(0, f.hp / f.hpMax).toFixed(3) + ")";
      s.ce.style.transform = "scaleX(" + Math.max(0, f.ce / f.ceMax).toFixed(3) + ")";
      s.poise.style.transform = "scaleX(" + Math.max(0, f.poise / f.poiseMax).toFixed(3) + ")";
      s.poise.style.background = f.broken > 0 ? "#ffd873" : f.poise / f.poiseMax < 0.35 ? "#ff6a52" : "#8fa3bd";
      s.nm.textContent = CHARACTERS[f.id].name;
      s.sub.textContent = f.zoneT > 0 ? "黑闪 ZONE" : f.domainT > 0 ? "领域展开中" : "";
    }
    setSide(h.p1, a); setSide(h.p2, b);
    var sec = extra && extra.time !== undefined ? extra.time : st.frame / 60;
    h.clock.textContent = Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
    h.dist.textContent = st.dist.toFixed(1) + "m";
    h.dist.style.color = st.dist > 12 ? "#7b8aa8" : "#5ff0ff";
    // 魔虚罗：只有适应进度，没有血条
    if (st.maho && st.maho.alive) {
      h.maho.classList.add("on");
      var ad = Math.max(st.maho.adapt.melee, st.maho.adapt.skill);
      h.mahoBar.style.transform = "scaleX(" + ad.toFixed(3) + ")";
      h.mahoBar.style.background = ad >= 1 ? "#ff2b1e" : "#ffd873";
      h.mahoV.textContent = "适应 " + Math.round(ad * 100) + "%" + (st.maho.state === "adapting" ? " · 可打断！" : st.maho.state === "down" ? " · 落地" : "");
      h.maho.classList.toggle("danger", st.maho.state === "adapting");
    } else h.maho.classList.remove("on", "danger");
    // 连段
    h.combo.textContent = a.combo > 1 ? a.combo + " 连击" : "";
    // 事件提示（同一时刻只留一条 —— 画面可读性预算）
    for (var i = evs.length - 1; i >= 0; i--) {
      var e = evs[i], d = e.data || {}, t = null;
      if (e.type === "parry") t = ["无下限 · 招架成功", "咒力 +" + d.ce + " · 反击窗口 " + Math.round(d.counter / 60 * 1000) + "ms"];
      else if (e.type === "blackflash") { t = ["黑闪", "伤害 ×2.5 · 进入 ZONE 10s"]; }
      else if (e.type === "broken") t = ["架势崩坏", "按 K 处决"];
      else if (e.type === "execute") t = ["处决", "−" + d.dmg];
      else if (e.type === "domain") t = [d.kind === "void" ? "领域展开 · 无量空处" : "领域展开 · 伏魔御厨子", d.anchors ? "开放领域：打破 " + d.anchors + " 个锚点" : "内部敌人行动不能"];
      else if (e.type === "domainclash") t = ["领域对拼", "后开的一方被压制"];
      else if (e.type === "domainbroken") t = ["领域破碎", "−" + Math.round(120) + " 反击机会"];
      else if (e.type === "mahoint") t = ["打断适应", "咒力 +30"];
      else if (e.type === "mahodead") t = ["魔虚罗 · 击破", ""];
      else if (e.type === "mahoimmune") t = ["免疫", "该类型已被适应 —— 换招"];
      else if (e.type === "absorb") t = ["无下限", "术式被吞掉"];
      else if (e.type === "blocked") t = ["无下限", "近战被挡下"];
      if (t) { h.msg.innerHTML = "<b>" + t[0] + "</b>" + (t[1] ? "<span>" + t[1] + "</span>" : ""); h.msgT = 1.6; break; }
    }
    if (h.msgT > 0) { h.msgT -= dt; if (h.msgT <= 0) h.msg.innerHTML = ""; }
    // 技能栏
    var bar = CHARACTERS[a.id].bar;
    for (var s = 0; s < h.slots.length && s < bar.length; s++) {
      var slot = h.slots[s], mv = MOVES[bar[s].move];
      slot.querySelector("b").textContent = bar[s].label;
      var cd = mv.id === "void" || mv.id === "shrine" ? 0 : 0;
      var left = a.cds ? a.cds[mv.id] || 0 : 0;
      var cdEl = slot.querySelector(".cd");
      cdEl.style.transform = "scaleY(" + (left > 0 ? 1 : 0) + ")";
      cdEl.style.opacity = left > 0 ? 0.55 : 0;
      var ok = (mv.ce || 0) <= a.ce && left <= 0 && !(mv.kind === "domain" && (a.gauge < 100 || a.domainT > 0));
      slot.classList.toggle("ready", ok);
      if (mv.kind === "domain") {
        var fill = slot.querySelector(".fill");
        fill.style.transform = "scaleX(" + (a.gauge / 100).toFixed(3) + ")";
        slot.classList.toggle("ready", a.gauge >= 100 && a.domainT <= 0);
      }
    }
  }
};

/**
 * view/screens.js —— 标题 / 选人 / 暂停 / 结算（DOM 覆盖层）
 * ----------------------------------------------------------------------------
 * 单机默认：进游戏先选人（五条悟 / 两面宿傩），选完开打，打完结算是"再战 / 换人"。
 * 联机入口留了个位置，但 M0~M5 阶段不可用（按用户拍板：先单机，联机后接）。
 */
var Screens = {
  build: function (root) {
    var el = document.createElement("div");
    el.id = "screens";
    el.className = "show";
    el.innerHTML = [
      '<div class="panel title">',
      '  <div class="logo">新 宿 対 決</div>',
      '  <div class="sub">咒术回战 · 同人对战（固定 60 帧战斗内核）</div>',
      '  <div class="pick" id="sc-pick">',
      '    <div class="card" data-char="gojo"><div class="cn">五条悟</div><div class="ct">现代最强</div><div class="cd">蒼 / 赫 / 茈 / 无下限 / 无量空处</div></div>',
      '    <div class="card" data-char="sukuna"><div class="cn">两面宿傩</div><div class="ct">史上最强</div><div class="cd">解 / 捌 / 開 / 突进 / 伏魔御厨子</div></div>',
      "  </div>",
      '  <div class="diff" id="sc-diff"><span>对手强度</span><button data-d="0">简单</button><button data-d="1" class="on">普通</button><button data-d="2">困难</button></div>',
      '  <button class="go" id="sc-go">开 始 对 战</button>',
      '  <div class="foot">按 <b>1</b>/<b>2</b> 选人 · <b>Enter</b> 开始 · 触屏直接点卡片</div>',
      "</div>",
      '<div class="panel pause hide" id="sc-pause"><div class="pt">暂 停</div><div class="foot">Esc 继续 · R 重开</div></div>',
      '<div class="panel result hide" id="sc-result">',
      '  <div class="rt" id="sc-rtitle">胜 利</div>',
      '  <div class="rsub" id="sc-rsub"></div>',
      '  <div class="stats" id="sc-stats"></div>',
      '  <div class="row"><button id="sc-again">再 战</button><button id="sc-back">换 人</button></div>',
      "</div>"
    ].join("");
    root.appendChild(el);
    var $ = function (s) { return el.querySelector(s); };
    return {
      el: el, pick: $("#sc-pick"), diff: $("#sc-diff"), go: $("#sc-go"),
      title: el.querySelector(".title"), pause: $("#sc-pause"), result: $("#sc-result"),
      rtitle: $("#sc-rtitle"), rsub: $("#sc-rsub"), stats: $("#sc-stats"),
      again: $("#sc-again"), back: $("#sc-back"),
      showed: { title: true, pause: false, result: false }
    };
  },
  setMode: function (s, mode) {
    s.title.classList.toggle("hide", mode !== "title");
    s.pause.classList.toggle("hide", mode !== "pause");
    s.result.classList.toggle("hide", mode !== "result");
    s.el.classList.toggle("show", mode !== "fight");
  },
  setPick: function (s, charId) {
    var cards = s.el.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle("on", cards[i].getAttribute("data-char") === charId);
  },
  setDiff: function (s, d) {
    var bs = s.el.querySelectorAll("#sc-diff button");
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", i === Number(d));
  },
  showResult: function (s, win, info) {
    s.rtitle.textContent = win ? "胜 利" : "败 北";
    s.rtitle.className = win ? "rt win" : "rt lose";
    s.rsub.textContent = info.sub || "";
    s.stats.innerHTML = info.rows.map(function (r) { return "<div><span>" + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("");
  }
};

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

})();