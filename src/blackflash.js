/**
 * ============================================================================
 * 黑闪「0.000001 秒」—— src/blackflash.js（blackflash 写域）
 * ----------------------------------------------------------------------------
 * 模块职责
 *   把「黑闪」从旧版的「0.28s 窗口内接一发终结技」（触发几乎必成，用户说
 *   "触发太简单了"）重做成原作级别的精确同步操作，并负责它的全部可读性反馈。
 *
 * 原作条件（用户原话要求写进代码）
 *   「黑闪」= 物理打击与咒力冲击之间的时间差被压缩到 0.000001 秒以内产生的空间扭曲。
 *   它不是能靠意志控制的技巧 —— 连最强术师也无法随意打出；威力是普通打击的 2.5 倍，
 *   打出之后术师的咒力操作会变好（连闪更容易）。
 *
 * 游戏映射
 *   - 1 帧 ≈ 16.7ms ≈ 原作 1e-6 秒级的极微误差：
 *       命中帧 F = cb.frame，按下同步键 V 的帧 P = cb.pressFrame.v，
 *       |F - P| <= 窗口（默认 1 帧）才算同步成功。
 *     用帧号而不是时间：顿帧（hitstop）期间 dt = 0 但 cb.frame 照常 +1，
 *     用时间会让窗口在顿帧里"消失"，帧号判定才可复现。
 *   - 反乱按（本模块最关键的难点）：V 的按下边沿只要**不落在任何命中帧的
 *     ±1 帧内** -> 0.6s 咒力紊乱（紊乱期间 V 一律无效）+ 扣 5 CE。
 *     -> 每帧连点 / 随机乱按都永远出不了黑闪（契约 §6 硬性验收）。
 *   - 可读性（不能变成纯记忆题）：每次挥击在拳/脚上生成一个收缩环，
 *     正好在命中帧收缩到 0；命中帧无论成败都有 1 帧闪点（成功金 / 失败灰）。
 *
 * 接线（只走 contract.js 的 HOOKS 总线，绝不改别人的文件）
 *   blackFlash -> 判定 + 返回本次命中的伤害倍率（数字；false = 不算黑闪）
 *   beforeCast -> 挥击起手时生成收缩环（永远返回 undefined，不拦截出招）
 *   tick       -> 紊乱/冷却/连闪计时、乱按判决、收缩环与闪点动画
 *   reset      -> 每局重开清零
 *   combatInit -> 建立实例状态 + 3D 资源池
 *   另注册 MECH_DEBUG.blackFlash（契约 §1.3，独立验证只看它）
 *
 * 契约里没定义、由本实现定的两条（已在报告里说明）
 *   1) 连闪链的断裂条件：乱按（咒力紊乱）或距上次黑闪 > 10s；
 *      冷却期内的普通命中**不**断链（否则 3.2s 冷却下永远连不上第二发）。
 *   2) 「连闪加成窗口上限 2 帧」按字面执行：基础 1 帧 +（连闪>=2 / 掌握期 / 触屏）
 *      各 1 帧，最终 clamp 到 ±2 帧。
 * ============================================================================
 */
var BlackFlash = (function () {
  "use strict";
  /* ==========================================================================
   * 1. 常量（契约 §6）
   * ======================================================================== */
  var WIN_BASE = 1;          // 基础同步窗口：±1 帧
  var WIN_MAX = 2;           // 窗口硬上限：±2 帧（连闪/掌握/触屏叠加后也不超过）
  var CE_REQ = 8;            // 硬性前提：命中时 ce >= 8
  var CE_COST = 8;           // 黑闪成功时消耗 8 咒力
  var BF_CD = 3.2;           // 黑闪冷却（契约 §6 的 BLACK_FLASH_CD = 3.2s）
  var CHAOS_T = 0.6;         // 咒力紊乱时长
  var CHAOS_CE = 5;          // 乱按额外扣的咒力
  var MASTERY_T = 6;         // 打出后 6s「咒力掌握变好」= 窗口 +1 帧
  var CHAIN_T = 10;          // 连闪链超时（契约未定义，见文件头说明）
  var MUL_BASE = 2.5;        // 基础倍率
  var MUL_STEP = 0.25;       // 每多连闪一次 +0.25
  var MUL_MAX = 3.5;         // 倍率上限
  var DOT_LIFE = 1 / 60;     // 命中帧闪点：正好 1 帧
  var HITFRAME_KEEP = 16;    // 命中帧历史长度（反乱按判定用）
  var PENDING_MAX = 8;       // 待定按压队列上限（防御：异常输入下不无限增长）
  var RING_R = { punch: 1.45, kick: 1.75 };
  var GOLD = 16767091;       // = C.GOLD，写死避免依赖读取顺序
  var GRAY = 10066329;       // 0x999999：失败闪点的灰
  /* ==========================================================================
   * 2. 实例状态
   * ======================================================================== */
  var ST = null;             // 当前战斗实例的状态（combatInit / reset 时重建）
  var pool = null;           // 3D 资源池（收缩环 + 闪点），延迟创建
  function newState(cb) {
    return {
      cb: cb,
      hitFrames: [],         // 最近若干个「玩家近战命中帧」
      pending: [],           // 待定按压：按下瞬间无法立刻判定（命中可能在下一帧）
      lastPressSeen: -999,   // 上一次读到的 cb.pressFrame.v
      presses: 0,            // 累计按下 V 次数
      legit: 0,              // 落在命中帧窗口内的按下次数
      mashes: 0,             // 乱按次数（被判为咒力紊乱）
      hits: 0,               // 近战命中帧总数
      fails: 0,              // 命中帧没同步成功的次数
      bf: 0,                 // 黑闪成功总次数
      chain: 0,              // 连闪链长度
      chainT: 0,             // 连闪链剩余时间
      cd: 0,                 // 黑闪冷却剩余
      chaosT: 0,             // 咒力紊乱剩余
      masteryT: 0,           // 「咒力掌握变好」剩余
      lastPress: null,
      lastJudge: null,
      last: null,            // 最近一次成功
      lastMash: null,
      ringsSpawned: 0,
      ringsSnapped: 0,
      ringErrMax: 0,         // |实际命中帧 - 收缩环预计闭合帧| 的最大值
      dotsSpawned: 0
    };
  }
  function ensure(cb) {
    if (!cb) return null;
    if (!ST || ST.cb !== cb) ST = newState(cb);
    return ST;
  }
  /* ==========================================================================
   * 3. 画质 / 环境
   * ======================================================================== */
  /** 画质档：优先用 main.js 的 QUALITY4（同作用域可见），拿不到再退回 contract.js 的探测 */
  function qualityOf() {
    try { if (typeof QUALITY4 !== "undefined" && QUALITY4) return QUALITY4; } catch (e) { /* 未定义 */ }
    try { if (typeof detectQuality === "function") return detectQuality(); } catch (e2) { /* 忽略 */ }
    return "high";
  }
  /** 触屏：窗口放宽 1 帧（契约 §6，判定标准是 html.is-touch） */
  function isTouch() {
    try { return document.documentElement.classList.contains("is-touch"); } catch (e) { return false; }
  }
  function activeCameraOf() {
    try {
      var S = window.__SS;
      if (S && S.activeCamera) return S.activeCamera;
    } catch (e) { /* 忽略 */ }
    try { if (typeof activeCam !== "undefined" && activeCam) return activeCam; } catch (e2) { /* 忽略 */ }
    try { if (typeof godCam !== "undefined" && godCam) return godCam; } catch (e3) { /* 忽略 */ }
    return null;
  }
  /* ==========================================================================
   * 4. 3D 资源池：收缩环 + 1 帧闪点
   * --------------------------------------------------------------------------
   * 自建（不占用 fx 的粒子预算）：收缩环 = 面向镜头的 Ring 网格，
   * 每帧缩到 (1 - k)，k -> 1 时半径 0；命中帧被强制贴上 0 并回报误差帧数。
   * ======================================================================== */
  function disposePool() {
    if (!pool) return;
    var p = pool;
    for (var i = 0; i < p.rings.length; i++) p.rings[i].mesh.visible = false;
    for (var j = 0; j < p.dots.length; j++) p.dots[j].mesh.visible = false;
    try { if (p.ringGeo) p.ringGeo.dispose(); } catch (e) { /* 忽略 */ }
    try { if (p.dotGeo) p.dotGeo.dispose(); } catch (e2) { /* 忽略 */ }
    pool = null;
  }
  function buildPool(scene2) {
    if (!scene2) return null;
    if (pool && pool.scene === scene2) return pool;
    disposePool();
    var q = qualityOf();
    var low = q === "low";
    var mid = q === "medium";
    // 低画质降级：环段数 30 -> 10、闪点球面 10x6 -> 6x4、池容量 3 -> 2
    var ringSeg = low ? 10 : mid ? 18 : 30;
    var dotSegW = low ? 6 : 10;
    var dotSegH = low ? 4 : 6;
    var ringGeo = new RingGeometry(0.82, 1, ringSeg, 1);
    var dotGeo = new SphereGeometry(1, dotSegW, dotSegH);
    var rings = [];
    var ringN = low ? 2 : 3;
    for (var i = 0; i < ringN; i++) {
      var rmat = new MeshBasicMaterial({
        color: GOLD, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false,
        blending: AdditiveBlending, side: DoubleSide
      });
      var rmesh = new Mesh(ringGeo, rmat);
      rmesh.frustumCulled = false;
      rmesh.renderOrder = 6;   // 画在角色之后：可读性优先，允许盖在身上
      rmesh.visible = false;
      scene2.add(rmesh);
      rings.push({ mesh: rmesh, mat: rmat, active: false, bone: null, t: 0, life: 0.12, radius: 1.5, spawnFrame: 0, predictedFrame: 0, snapped: false, offset: new Vector3(), pos: new Vector3() });
    }
    var dots = [];
    var dotN = low ? 2 : 3;
    for (var k = 0; k < dotN; k++) {
      var dmat = new MeshBasicMaterial({
        color: GOLD, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, blending: AdditiveBlending
      });
      var dmesh = new Mesh(dotGeo, dmat);
      dmesh.frustumCulled = false;
      dmesh.renderOrder = 7;
      dmesh.visible = false;
      scene2.add(dmesh);
      dots.push({ mesh: dmesh, mat: dmat, active: false, t: 0, life: DOT_LIFE, frame: -1, color: GOLD });
    }
    pool = { scene: scene2, rings: rings, dots: dots, ringGeo: ringGeo, dotGeo: dotGeo };
    return pool;
  }
  function spawnRing(st, cb, o) {
    var p = pool;
    if (!p || !o || !o.bone) return null;
    var r = null;
    for (var i = 0; i < p.rings.length; i++) if (!p.rings[i].active) { r = p.rings[i]; break; }
    if (!r) r = p.rings[0];            // 池满：复用最老的一个
    r.active = true;
    r.bone = o.bone;
    r.t = 0;
    r.life = Math.max(0.05, o.life || 0.12);
    r.radius = o.radius || 1.5;
    r.spawnFrame = cb.frame | 0;
    r.predictedFrame = o.predictedFrame || (r.spawnFrame + Math.round(r.life * 60));
    r.snapped = false;
    r.mat.color.setHex(GOLD);
    r.mat.opacity = 0.9;
    r.mesh.visible = true;
    r.mesh.scale.setScalar(r.radius);
    r.offset.set(0, 0.02, 0);
    st.ringsSpawned++;
    return r;
  }
  /** 命中帧把收缩环贴到 0（无论成败：环闭合 = 命中帧这一瞬间） */
  function snapRings(st, cb, frame) {
    var p = pool;
    if (!p) return;
    for (var i = 0; i < p.rings.length; i++) {
      var r = p.rings[i];
      if (!r.active || r.snapped) continue;
      r.snapped = true;
      r.t = r.life;                    // 立刻收缩到 0
      st.ringsSnapped++;
      var err = Math.abs(frame - r.predictedFrame);
      if (err > st.ringErrMax) st.ringErrMax = err;
    }
  }
  function spawnDot(cb, pos, ok) {
    var p = pool;
    if (!p) return;
    var d = null;
    for (var i = 0; i < p.dots.length; i++) if (!p.dots[i].active) { d = p.dots[i]; break; }
    if (!d) d = p.dots[0];
    d.active = true;
    d.t = 0;
    d.frame = cb.frame | 0;            // 记下生成帧：本帧渲染必须看得见（1 帧闪点）
    d.color = ok ? GOLD : GRAY;
    d.mat.color.setHex(d.color);
    d.mat.opacity = ok ? 1 : 0.75;
    d.mesh.position.copy(pos);
    // 成功闪点更大更亮（黑闪的"空间扭曲"起点），失败只是一粒灰点
    d.mesh.scale.setScalar(ok ? 0.42 : 0.22);
    d.mesh.visible = true;
    if (ST) ST.dotsSpawned++;
  }
  function updateVisuals(st, dt) {
    var p = pool;
    if (!p) return;
    var camNow = activeCameraOf();
    var i, r, d;
    for (i = 0; i < p.rings.length; i++) {
      r = p.rings[i];
      if (!r.active) continue;
      try {
        if (r.bone) { r.bone.getWorldPosition(r.pos); r.mesh.position.copy(r.pos).add(r.offset); }
      } catch (e) { r.active = false; r.mesh.visible = false; continue; }   // 骨架没了：直接回收
      if (!r.snapped) r.t += dt;
      var k = r.life > 0 ? Math.min(1, r.t / r.life) : 1;
      var sc = r.radius * (1 - k);
      if (k >= 1 && !r.snapped) {
        // 挥空：环闭合到 0 之后淡出，不再占用池
        r.mat.opacity = Math.max(0, r.mat.opacity - dt * 4);
        if (r.mat.opacity <= 0.01) { r.active = false; r.mesh.visible = false; continue; }
      }
      r.mesh.scale.setScalar(Math.max(0.001, sc));
      if (r.snapped) {
        r.mat.opacity = Math.max(0, r.mat.opacity - dt * 10);
        if (r.mat.opacity <= 0.02) { r.active = false; r.mesh.visible = false; continue; }
      }
      if (camNow) {
        try { r.mesh.quaternion.copy(camNow.quaternion); } catch (e2) { /* 忽略 */ }
      }
    }
    for (i = 0; i < p.dots.length; i++) {
      d = p.dots[i];
      if (!d.active) continue;
      // 生成帧不衰减 -> 保证 1 帧闪点在渲染里真的出现一帧
      if (d.frame !== (st.cb ? st.cb.frame : -1)) {
        d.t += dt;
        var k2 = d.life > 0 ? d.t / d.life : 1;
        if (k2 >= 1) { d.active = false; d.mesh.visible = false; continue; }
        d.mesh.scale.setScalar(Math.max(0.02, (d.color === GOLD ? 0.42 : 0.22) * (1 - k2 * 0.8)));
        d.mat.opacity = Math.max(0, 1 - k2);
      }
    }
  }
  /* ==========================================================================
   * 5. 命中帧 / 窗口 / 倍率
   * ======================================================================== */
  function rememberHitFrame(st, f) {
    st.hitFrames.push(f);
    if (st.hitFrames.length > HITFRAME_KEEP) st.hitFrames.splice(0, st.hitFrames.length - HITFRAME_KEEP);
  }
  /** 某个按下帧是否落在「任意命中帧 ±win」内 —— 反乱按与合法同步共用同一条判据 */
  function hasHitNear(st, p, win) {
    for (var i = 0; i < st.hitFrames.length; i++) {
      var d = st.hitFrames[i] - p;
      if (d <= win && d >= -win) return true;
    }
    return false;
  }
  /** 当前同步窗口（帧）：基础 1 +（连闪>=2 / 掌握期 / 触屏），硬上限 2 */
  function windowFrames(st) {
    var w = WIN_BASE;
    if (!st) return w;
    if (st.chain >= 2) w += 1;        // 连闪 2 次以上 -> 放宽到 2 帧
    if (st.masteryT > 0) w += 1;      // 打出后 6s 内「咒力掌握变好」
    if (isTouch()) w += 1;            // 触屏操作精度更低
    return Math.min(WIN_MAX, w);
  }
  /** 连闪 n 次时的倍率：min(3.5, 2.5 + 0.25*(n-1)) */
  function mulOf(n) {
    var v = MUL_BASE + MUL_STEP * (Math.max(1, n | 0) - 1);
    return Math.min(MUL_MAX, v);
  }
  function pressFrameOf(cb) {
    if (!cb || !cb.pressFrame) return -999;
    var v = cb.pressFrame.v;
    return (typeof v === "number" && isFinite(v)) ? (v | 0) : -999;
  }
  function hitPos(h) {
    try {
      if (h && h.to && h.to.ctrl && h.to.ctrl.chest) return h.to.ctrl.chest.getWorldPosition(new Vector3());
    } catch (e) { /* 忽略 */ }
    try {
      if (h && h.to && h.to.p) return new Vector3(h.to.p.x, h.to.p.y + 1.1, h.to.p.z);
    } catch (e2) { /* 忽略 */ }
    try { if (h && h.from && h.from.p) return h.from.p.clone().setY(h.from.p.y + 1.2); } catch (e3) { /* 忽略 */ }
    return new Vector3();
  }
  /* ==========================================================================
   * 6. 判定入口（HOOKS.blackFlash）
   * --------------------------------------------------------------------------
   * 返回值语义（契约 §6）：数字 = 本次命中的伤害倍率；false = 不算黑闪。
   * combat.js 用 firstHook 调用，只取第一个注册者。
   * ======================================================================== */
  function judge(cb, h, dmg) {
    if (!cb || !h || h.kind !== "melee") return false;
    var attacker = h.from;
    if (!attacker || attacker.side !== SIDE.GOJO) return false;   // 只认玩家的近战
    var st = ensure(cb);
    var pl = cb.fighters ? cb.fighters[SIDE.GOJO] : null;
    if (!st || !pl) return false;
    var F = cb.frame | 0;
    var P = pressFrameOf(cb);
    var win = windowFrames(st);
    var delta = F - P;
    st.hits++;
    rememberHitFrame(st, F);
    snapRings(st, cb, F);                 // 命中帧：收缩环贴到 0
    var pos = hitPos(h);
    var ok = false;
    var why = "";
    if (st.chaosT > 0) why = "chaos";
    else if (st.cd > 0) why = "cooldown";
    else if (!(pl.ce >= CE_REQ)) why = "ce";
    else if (P < -900 || Math.abs(delta) > win) why = "nosync";
    else ok = true;
    /** 是否"尝试过同步"（按过 V 且离命中帧不远）—— 决定要不要给细字提示 */
    var attempted = P > -900 && Math.abs(delta) <= win + 3;
    var mul = 0;
    if (ok) {
      mul = mulOf(st.chain + 1);
      st.bf++;
      st.chain++;
      st.chainT = CHAIN_T;
      st.cd = BF_CD;
      st.masteryT = MASTERY_T;
      pl.ce = Math.max(0, pl.ce - CE_COST);
      resolveNear(st, F, win);            // 命中帧附近的待定按压是合法同步，不是乱按
      st.last = {
        frame: F, press: P, delta: delta, mul: Math.round(mul * 100) / 100,
        chain: st.chain, skill: h.skill, dmg: Math.round((dmg || 0) * mul * 10) / 10
      };
    } else {
      st.fails++;
      /**
       * 失败反馈：灰色闪点 + 细字提示，不打断操作。
       * 细字只在"玩家确实按了 V 但没对上"时出现；普通平A也刷字会糊屏。
       */
      if (attempted) {
        try {
          cb.fx.callout({
            text: "未同步", sub: "V", pos: pos.clone(),
            color: GRAY, color2: C.INK, life: 0.42, size: 0.5, rise: 0.5
          });
        } catch (e) { /* 忽略 */ }
      }
    }
    spawnDot(cb, pos, ok);                // 命中帧无论成败都有 1 帧闪点
    st.lastJudge = {
      frame: F, press: P, delta: delta, win: win, ok: ok, why: why,
      mul: Math.round(mul * 100) / 100, ce: Math.round(pl.ce * 10) / 10, attempted: attempted
    };
    return ok ? mul : false;
  }
  /* ==========================================================================
   * 7. 反乱按：待定按压 -> 咒力紊乱
   * --------------------------------------------------------------------------
   * 按下 V 时命中可能发生在**下一帧**（|F-P|=1 也是合法同步），所以按下瞬间不能
   * 立刻判死：先入待定队列，等 (cb.frame - P) > win 仍没有命中帧"救"它时才判乱按。
   * 每帧连点：每次按下都会在 win+1 帧后落成一次紊乱（紊乱时长被不断刷新）-> 永远封杀。
   * ======================================================================== */
  function resolveNear(st, frame, win) {
    for (var i = st.pending.length - 1; i >= 0; i--) {
      var p = st.pending[i];
      if (Math.abs(p.frame - frame) <= win) { st.pending.splice(i, 1); st.legit++; }
    }
  }
  function onMash(st, cb, p) {
    st.mashes++;
    st.chain = 0;                         // 乱按断链（契约未定义，见文件头）
    st.chainT = 0;
    var pl = cb.fighters ? cb.fighters[SIDE.GOJO] : null;
    if (pl) pl.ce = Math.max(0, pl.ce - CHAOS_CE);
    var entering = st.chaosT <= 0;
    st.chaosT = CHAOS_T;
    st.lastMash = { frame: p.frame, ce: pl ? Math.round(pl.ce * 10) / 10 : -1 };
    if (!entering) return;                // 已经在紊乱里：只续时间，不重复刷演出
    var pos = null;
    try { pos = pl && pl.ctrl && pl.ctrl.chest ? pl.ctrl.chest.getWorldPosition(new Vector3()) : null; } catch (e) { pos = null; }
    try {
      cb.fx.callout({ text: "咒力紊乱", sub: "失同步", pos: pos || new Vector3(), color: C.CRIMSON, color2: C.INK, life: 0.55, size: 0.62, rise: 0.7 });
      cb.fx.screen({ chroma: 0.35, vignette: 0.18, shake: 0.22, life: 0.22 });
    } catch (e2) { /* 忽略 */ }
    try { cb.audio.play("whoosh", { volume: 0.35, rate: 1.5 }); } catch (e3) { /* 忽略 */ }
  }
  function registerPress(st, cb, P) {
    st.presses++;
    var win = windowFrames(st);
    st.lastPress = { frame: P, kind: "sync" };
    if (hasHitNear(st, P, win)) {
      // 命中帧 ±win 内的按下：合法同步尝试（哪怕这一发因为冷却/咒力打不出黑闪）
      st.legit++;
      cb.bfWindowUntil = cb.time + (win + 1) / 60;   // 给 HUD 的"同步窗口"进度条用
      return;
    }
    st.pending.push({ frame: P });
    if (st.pending.length > PENDING_MAX) onMash(st, cb, st.pending.shift());
  }
  function resolvePending(st, cb) {
    var win = windowFrames(st);
    for (var i = st.pending.length - 1; i >= 0; i--) {
      var p = st.pending[i];
      if (hasHitNear(st, p.frame, win)) { st.pending.splice(i, 1); st.legit++; continue; }
      if ((cb.frame | 0) - p.frame > win) { st.pending.splice(i, 1); onMash(st, cb, p); }
    }
  }
  /* ==========================================================================
   * 8. 每帧驱动（HOOKS.tick）
   * --------------------------------------------------------------------------
   * 注意：顿帧（hitstop）期间 update2 会提前 return，tick 不被调用 ——
   * 所以状态机只按 cb.frame / dt 增量推进，不做"每帧必然发生"的假设。
   * ======================================================================== */
  function tick(cb, dt, t) {
    var st = ensure(cb);
    if (!st) return;
    var d = Number(dt) || 0;
    if (d < 0) d = 0;
    if (d > 0.1) d = 0.1;
    if (st.chaosT > 0) st.chaosT = Math.max(0, st.chaosT - d);
    if (st.cd > 0) st.cd = Math.max(0, st.cd - d);
    if (st.masteryT > 0) st.masteryT = Math.max(0, st.masteryT - d);
    if (st.chainT > 0) {
      st.chainT = Math.max(0, st.chainT - d);
      if (st.chainT <= 0) st.chain = 0;   // 超时断链（契约未定义，见文件头）
    }
    var pf = pressFrameOf(cb);
    if (pf !== st.lastPressSeen) {        // pressFrame.v 只在按下边沿更新
      st.lastPressSeen = pf;
      /**
       * 过期 / 未来的按下帧直接忽略：api.reset() 会把 cb.frame 归零，但
       * cb.pressFrame 是 combat 的只读字段、不会跟着复位 —— 上一局遗留的帧号
       * 会被误判成「本局第 0 帧的一次按下」。只接受落在最近 2 秒内的帧号。
       */
      if (pf > -900 && pf <= cb.frame && cb.frame - pf <= 120) registerPress(st, cb, pf);
    }
    resolvePending(st, cb);
    // HUD / 旧接口兼容镜像（hud.js 的 snap.blackFlashReady 读 cb.bfWindowUntil）
    cb.bfCd = st.cd;
    cb.bfCount = st.bf;
    updateVisuals(st, d);
    updateTouchButton(st, cb);   // 触屏「咒」按钮（桌面端直接 return）
  }
  /* ==========================================================================
   * 9. 生命周期
   * ======================================================================== */
  function onCombatInit(cb) {
    if (!cb) return;
    ST = newState(cb);
    if (isTouch()) ensureTouchButton();   // 触屏：把「咒」按钮建出来（非触屏不创建）
    var sc = null;
    try { if (typeof scene !== "undefined" && scene) sc = scene; } catch (e) { sc = null; }
    buildPool(sc);
  }
  function reset(cb) {
    ST = newState(cb || (ST && ST.cb) || null);
    var p = pool;
    if (p) {
      for (var i = 0; i < p.rings.length; i++) { p.rings[i].active = false; p.rings[i].mesh.visible = false; }
      for (var j = 0; j < p.dots.length; j++) { p.dots[j].active = false; p.dots[j].mesh.visible = false; }
    }
  }
  /**
   * 挥击起手：在拳/脚上生成收缩环，预计在 cast 结束（active 第一帧）命中时收缩到 0。
   * 必须永远返回 undefined —— beforeCast 用严格等于 false 拦截出招，返回 false 会吃掉攻击。
   */
  function onBeforeCast(cb, actor, skill) {
    try {
      var st = ensure(cb);
      if (!st || !actor || actor.side !== SIDE.GOJO) return void 0;
      if (skill !== SKILL.PUNCH && skill !== SKILL.KICK) return void 0;
      var ctrl = actor.ctrl || {};
      var isKick = skill === SKILL.KICK;
      var bone = isKick
        ? (ctrl.footR || (ctrl.bones && ctrl.bones.footR))
        : (ctrl.handR || (ctrl.bones && ctrl.bones.handR));
      if (!bone) return void 0;
      var cast = (SKILL_DATA[skill] && SKILL_DATA[skill].cast) || 0.1;
      var life = Math.max(0.06, cast);
      spawnRing(st, cb, {
        bone: bone,
        life: life,
        radius: isKick ? RING_R.kick : RING_R.punch,
        predictedFrame: (cb.frame | 0) + Math.max(3, Math.round(life * 60))
      });
    } catch (e) { /* 视觉失败绝不能影响出招 */ }
    return void 0;
  }
  /* ==========================================================================
   * 11. 触屏「咒」按钮（模块自建 DOM，契约 §6）
   * --------------------------------------------------------------------------
   * 契约原文：同步键 V（新增），触屏模块自建「咒」按钮，调用 __INJECT.press("KeyV")。
   * 约束与取舍：
   *   - 只在 html.is-touch 时出现（桌面完全不创建，零开销）；低画质同样显示。
   *   - 命中区 >= 48x48 CSS px（844x390 实测 56px），圆形半透明、不挡视野。
   *   - 位置放在**左边缘中段**：摇杆（左下）、动作/技能/工具键（右下）、音量坞（右侧 46%）
   *     都不在这一带，也躲开左下摇杆正上方那条提示条。
   *   - touchstart -> press("KeyV")，touchend / touchcancel -> release("KeyV")；
   *     全部 preventDefault + passive:false，避免拖出页面滚动/缩放。
   *   - 紊乱期按钮变红：玩家能直接读到「现在按也没用」。
   * ======================================================================== */
  var tbtn = null;
  var tbtnStyle = null;
  function ensureTouchButton() {
    if (tbtn && tbtn.parentNode) return tbtn;
    try {
      if (!document.body) return null;
      if (!tbtnStyle) {
        tbtnStyle = document.createElement("style");
        tbtnStyle.id = "ss-bf-key-style";
        tbtnStyle.textContent = [
          "#ss-bf-key{position:fixed;left:calc(var(--t-edge,10px) + env(safe-area-inset-left) + 4px);bottom:50%;",
          "width:clamp(56px,15vmin,76px);height:clamp(56px,15vmin,76px);min-width:48px;min-height:48px;",
          "border-radius:50%;border:1.5px solid rgba(255,216,115,.62);background:rgba(10,9,7,.44);",
          "color:rgba(255,226,150,.96);font:600 clamp(18px,4.6vmin,25px)/1 system-ui,-apple-system,sans-serif;",
          "display:none;place-items:center;z-index:44;touch-action:none;padding:0;margin:0;",
          "user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;",
          "box-shadow:inset 0 0 0 1px rgba(0,0,0,.35), 0 0 18px rgba(255,216,115,.14);",
          "transition:transform .07s,background .1s,border-color .1s,color .1s}",
          "#ss-bf-key.on{transform:scale(.92);border-color:#ffe28a;color:#fff6d8;background:rgba(64,46,10,.62);",
          "box-shadow:0 0 22px rgba(255,216,115,.5)}",
          "#ss-bf-key.chaos{border-color:rgba(214,64,64,.72);color:rgba(255,150,150,.96);background:rgba(40,8,8,.52)}",
          "#ss-bf-key .k{display:block;line-height:1}",
          "#ss-bf-key .s{display:block;font-size:9px;letter-spacing:.16em;opacity:.72;margin-top:3px}"
        ].join("");
        document.head.appendChild(tbtnStyle);
      }
      var el = document.createElement("button");
      el.id = "ss-bf-key";
      el.type = "button";
      el.setAttribute("aria-label", "黑闪同步键 咒");
      el.innerHTML = "<span class=\"k\">咒</span><span class=\"s\">V</span>";
      // 按下即注入（真实输入链路：keys/freshKeys -> main.js inputSnapshot.v -> cb.pressFrame.v）
      var down = function (ev) {
        if (ev && ev.cancelable) ev.preventDefault();
        try { if (window.__INJECT) window.__INJECT.press("KeyV"); } catch (e) { /* 忽略 */ }
        el.classList.add("on");
      };
      var up = function (ev) {
        if (ev && ev.cancelable) ev.preventDefault();
        try { if (window.__INJECT) window.__INJECT.release("KeyV"); } catch (e2) { /* 忽略 */ }
        el.classList.remove("on");
      };
      el.addEventListener("touchstart", down, { passive: false });
      el.addEventListener("touchend", up, { passive: false });
      el.addEventListener("touchcancel", up, { passive: false });
      el.addEventListener("mousedown", down);      // 桌面/探针也能点
      el.addEventListener("mouseup", up);
      document.body.appendChild(el);
      tbtn = el;
    } catch (e) { tbtn = null; }
    return tbtn;
  }
  /** 每帧维护按钮可见性（只在战斗/暂停时显示）与紊乱态 */
  function updateTouchButton(st, cb) {
    if (!isTouch()) { if (tbtn) tbtn.style.display = "none"; return; }
    var show = true;
    try {
      var s = window.__SS && window.__SS.state;
      show = (s === "fight" || s === "clash" || s === "paused");
    } catch (e) { show = true; }
    if (!show) { if (tbtn) tbtn.style.display = "none"; return; }
    var el = ensureTouchButton();
    if (!el) return;
    if (el.style.display !== "grid") el.style.display = "grid";
    var chaos = !!(st && st.chaosT > 0);
    if (chaos !== el.__bfChaos) {
      el.__bfChaos = chaos;
      el.classList.toggle("chaos", chaos);
    }
  }
  /* ==========================================================================
   * 10. 对外接口 / 注册
   * ======================================================================== */
  /** 顶层调试快照（契约 §6 的 BlackFlash.debug()，人肉排查用；独立验证请读 MECH_DEBUG） */
  function debug() {
    var st = ST;
    var cb = st && st.cb;
    var pl = cb && cb.fighters ? cb.fighters[SIDE.GOJO] : null;
    return {
      active: !!st,
      frame: cb ? cb.frame | 0 : -1,
      ce: pl ? Math.round(pl.ce * 10) / 10 : -1,
      cd: st ? Math.round(st.cd * 1000) / 1000 : -1,
      chaosT: st ? Math.round(st.chaosT * 1000) / 1000 : -1,
      chain: st ? st.chain : -1,
      masteryT: st ? Math.round(st.masteryT * 1000) / 1000 : -1,
      win: st ? windowFrames(st) : -1,
      touch: isTouch(),
      quality: qualityOf(),
      registered: HOOKS.blackFlash.length > 0 && HOOKS.blackFlash[0] === hookBlackFlash,
      lastJudge: st ? st.lastJudge : null,
      last: st ? st.last : null,
      lastPress: st ? st.lastPress : null,
      lastMash: st ? st.lastMash : null,
      ringsSpawned: st ? st.ringsSpawned : 0,
      ringsSnapped: st ? st.ringsSnapped : 0,
      ringErrMax: st ? st.ringErrMax : 0,
      dotsSpawned: st ? st.dotsSpawned : 0,
      poolRings: pool ? pool.rings.length : 0,
      poolDots: pool ? pool.dots.length : 0
    };
  }
  function hookBlackFlash(cb, h, dmg) { return judge(cb, h, dmg); }
  /* ---- 注册（契约 §6 / §1.3）----
   * blackflash.js 在 manifest 里排在 combat.js 之前，文件加载时就注册，
   * 因此它是 blackFlash 钩子的第一个（也是唯一的）实现者。 */
  onHook("combatInit", onCombatInit);
  onHook("reset", reset);
  onHook("tick", tick);
  onHook("beforeCast", onBeforeCast);
  onHook("blackFlash", hookBlackFlash);
  /**
   * 独立验证用的自报快照（契约 §1.3 的字段名照抄，多出来的键是同名扩展、不改语义）：
   *   F      最近一次命中帧（cb.frame）
   *   P      最近一次按下 V 的帧（cb.pressFrame.v）
   *   delta  F - P
   *   ok     最近一次命中是否打出黑闪
   *   ce     玩家当前咒力
   *   chaos  咒力紊乱剩余秒数（> 0 = 紊乱期，V 无效）
   *   streak 连闪链长度
   *   mul    最近一次黑闪实际使用的伤害倍率（0 = 还没打出过）
   *   hits   近战命中帧总数
   *   fails  命中帧没同步成功的次数
   */
  MECH_DEBUG.blackFlash = function () {
    var st = ST;
    var cb = st && st.cb;
    var pl = cb && cb.fighters ? cb.fighters[SIDE.GOJO] : null;
    var lj = st && st.lastJudge;
    return {
      F: lj ? lj.frame : -1,
      P: lj ? lj.press : -999,
      delta: lj ? lj.delta : 0,
      ok: !!(lj && lj.ok),
      ce: pl ? Math.round(pl.ce * 10) / 10 : -1,
      ceAtJudge: lj && typeof lj.ce === "number" ? lj.ce : -1,   // 判定成功瞬间扣完 8 之后的咒力
      chaos: st ? Math.round(st.chaosT * 1000) / 1000 : 0,
      streak: st ? st.chain : 0,
      mul: st && st.last ? st.last.mul : 0,
      hits: st ? st.hits : 0,
      fails: st ? st.fails : 0,
      // ---- 扩展字段：同一次快照里给出，验证方可以只用上面 10 个 ----
      bf: st ? st.bf : 0,
      cd: st ? Math.round(st.cd * 1000) / 1000 : 0,
      win: st ? windowFrames(st) : WIN_BASE,
      mulNext: st ? Math.round(mulOf(st.chain + 1) * 100) / 100 : MUL_BASE,
      presses: st ? st.presses : 0,
      legit: st ? st.legit : 0,
      mashes: st ? st.mashes : 0,
      masteryT: st ? Math.round(st.masteryT * 1000) / 1000 : 0,
      chaosActive: !!(st && st.chaosT > 0),
      touch: isTouch(),
      why: lj ? lj.why : "",
      ringsSpawned: st ? st.ringsSpawned : 0,
      ringsSnapped: st ? st.ringsSnapped : 0,
      dotsSpawned: st ? st.dotsSpawned : 0,
      ringErrMax: st ? st.ringErrMax : 0
    };
  };
  return {
    judge: judge,
    reset: reset,
    debug: debug,
    tick: tick,                                   // 探针可以手动步进（不影响 combat 的正常 tick）
    windowFrames: function () { return windowFrames(ST); },
    state: function () { return ST; }
  };
})();
