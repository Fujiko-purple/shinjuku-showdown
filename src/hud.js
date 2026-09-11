// src/hud.js
/**
 * ============================================================================
 * HUD / 界面层（camera-ui 写域）
 * ----------------------------------------------------------------------------
 * 职责：把战斗状态翻译成"一眼看懂"的画面信息，并且不挡战斗主视野。
 *
 * 为什么需要这个模块：
 *   main.js 里的 HUD 更新只管血条宽度、连击数字、banner 计时；
 *   而「计时器是死的」「敌人跑出画面没有任何提示」「技能冷却看不出还剩几秒」
 *   这些问题需要一个每帧驱动、能读全量快照的地方 —— 就是这里。
 *
 * 接线方式（零侵入 main.js）：
 *   camera.js 的 updateGodCam(dt, snap) 每帧调用 hudTick(dt, snap)，
 *   hud.js 只做 main.js 不做的事，绝不覆盖 main.js 已经写过的属性。
 *
 * 分工边界：
 *   main.js 管 —— 血条宽度/幽灵条/combo/banner 文本与显隐/phase-tag/领域条 ready
 *   hud.js  管 —— 计时器、血量数值、咒力数值、领域百分比、距离读数、
 *                 离屏敌人指示、受击/就绪反馈、技能冷却环、音量面板收纳、教学提示
 * ============================================================================
 */

/** HUD 运行时状态（缓存 DOM + 上一帧的值，避免每帧无意义写 DOM） */
var HUD = {
  ready: false,
  el: null,
  player: null,
  enemy: null,
  timerEl: null,
  timerCls: "",
  phaseEl: null,
  phaseCls: "",
  distEl: null,
  distTxt: "",
  distCls: "",
  hpNum: { gojo: null, sukuna: null },
  hpLast: { gojo: -1, sukuna: -1 },
  ceNum: null,
  domNum: { gojo: null, sukuna: null },
  compass: null,
  compassArrow: null,
  compassDist: null,
  compassOn: false,
  compassTxt: "",
  matchT: 0,
  lastWhole: -1,
  flashT: 0,
  skills: [],
  skillBarLen: -1,
  skillReady: {},
  bannerEl: null,
  bannerTxt: "",
  hintsEl: null,
  hintT: -1,
  hintBuilt: false,
  dock: null,
  dockBtn: null,
  dockCheck: null,
  vw: 0,
  vh: 0,
  fpsAcc: 0,
  fpsN: 0,
  fps: 60
};

/** 只要出现这些按键，就认为玩家已经上手，教学提示立刻撤掉 */
var HUD_LEARN_KEYS = ["KeyJ", "KeyK", "KeyU", "KeyI", "KeyO", "KeyG", "KeyH", "KeyL", "Space", "ShiftLeft"];

function hud$(id) {
  return document.getElementById(id);
}

/** 一次性初始化：缓存 DOM。懒执行，保证 DOM 与控制台都就绪 */
function hudInit() {
  HUD.el = hud$("hud");
  if (!HUD.el) return;
  HUD.player = hud$("hp-gojo");
  HUD.enemy = hud$("hp-sukuna");
  HUD.timerEl = hud$("timer");
  HUD.phaseEl = hud$("phase-tag");
  HUD.distEl = hud$("focus-dist");
  HUD.hpNum.gojo = hud$("hp-gojo-num");
  HUD.hpNum.sukuna = hud$("hp-sukuna-num");
  HUD.ceNum = hud$("ce-gojo-num");
  HUD.domNum.gojo = hud$("dom-gojo-num");
  HUD.domNum.sukuna = hud$("dom-sukuna-num");
  HUD.compass = hud$("enemy-compass");
  HUD.compassArrow = hud$("ec-arrow");
  HUD.compassDist = hud$("ec-dist");
  HUD.bannerEl = hud$("banner");
  HUD.hintsEl = hud$("hints");
  HUD.dock = document.querySelector(".audio-dock");
  HUD.dockBtn = hud$("audio-toggle");
  HUD.vw = window.innerWidth;
  HUD.vh = window.innerHeight;
  hudBindAudioDock();
  HUD.ready = true;
}

/** 音量面板：默认收起，点一下才展开，6 秒没操作自动收回（战斗中它不该常驻） */
function hudBindAudioDock() {
  if (!HUD.dock || !HUD.dockBtn) return;
  var open = false;
  var closeAt = 0;
  var apply = function (v) {
    HUD.dock.classList.toggle("open", v);
    HUD.dockBtn.classList.toggle("on", v);
    open = v;
    if (v) closeAt = performance.now() + 6000;
  };
  HUD.dockBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    apply(!open);
    // 别让按钮抢走焦点：空格键是闪避/无下限，不能在按钮上触发 click
    try { HUD.dockBtn.blur(); } catch (err) { /* 忽略 */ }
  });
  HUD.dock.addEventListener("input", function () { closeAt = performance.now() + 6000; });
  HUD.dock.addEventListener("pointerdown", function () { closeAt = performance.now() + 6000; });
  HUD.dockCheck = function () {
    if (open && closeAt > 0 && performance.now() > closeAt) apply(false);
  };
}

/** 窗口尺寸变化（由 camera.js 的 camApplyAspect 转调） */
function hudResize() {
  HUD.vw = window.innerWidth;
  HUD.vh = window.innerHeight;
  if (HUD.el) HUD.el.classList.toggle("compact", HUD.vw < 900);
}

/** 每场战斗开始时复位 HUD 的一次性状态 */
function hudResetMatch() {
  HUD.matchT = 0;
  HUD.lastWhole = -1;
  HUD.hintT = -1;
  HUD.hintBuilt = false;
  HUD.flashT = 0;
  HUD.hpLast.gojo = -1;
  HUD.hpLast.sukuna = -1;
  HUD.distTxt = "";
  for (var i = 0; i < HUD.skills.length; i++) HUD.skillReady[HUD.skills[i].dataset.skill] = false;
  if (HUD.hintsEl) {
    HUD.hintsEl.innerHTML = "";
    HUD.hintsEl.classList.remove("show");
  }
  if (HUD.el) HUD.el.classList.remove("hurt-gojo", "hurt-sukuna");
}

/** MM:SS */
function hudFmtTime(sec) {
  var s = Math.max(0, Math.floor(sec));
  var m = Math.floor(s / 60);
  var r = s % 60;
  return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

/** 教学提示：开场 20 秒内给一份"能干什么"的清单，之后淡出（不挡视野） */
function hudBuildHints() {
  if (HUD.hintBuilt || !HUD.hintsEl) return;
  HUD.hintBuilt = true;
  // 只留两行，够看就行；多一行都是对战斗视野的侵占
  HUD.hintsEl.innerHTML =
    '<div class="hint"><b>J</b> / <b>K</b> 连击 · <b>空格</b> 闪避 · <b>Shift</b> 冲刺</div>' +
    '<div class="hint"><b>U</b>/<b>I</b>/<b>O</b> 术式 · <b>G</b> 领域 · <b>Q</b> 锁定</div>';
  HUD.hintsEl.classList.add("show");
}

/**
 * 每帧 HUD 更新。由 camera.js 的 updateGodCam 调用（在 main.js 的 updateHUD 之前）。
 * 只做 main.js 没做的事；所有写入都先用缓存值比较，避免每帧无谓的 DOM 写。
 */
function hudTick(dt, snap) {
  if (!HUD.ready) hudInit();
  if (!HUD.el) return;
  var fighting = state === "fight" || state === "clash" || state === "victory" || state === "defeat";

  // 标题 / 载入：HUD 不可见，只做复位与低频维护，省性能
  if (state === "title" || state === "loading") {
    if (HUD.matchT !== 0 || HUD.hintBuilt) hudResetMatch();
    hudCompassOff();
    if (HUD.dockCheck) HUD.dockCheck();
    return;
  }
  if (!fighting && state !== "paused") {
    hudCompassOff();
    return;
  }

  // ---- 1. 计时器：接上 main.js 的 matchTime（此前这个元素全工程没人写过）----
  if (fighting && typeof matchTime === "number" && matchTime > 0) {
    HUD.matchT = (performance.now() - matchTime) / 1000;
  }
  var whole = Math.floor(HUD.matchT);
  if (whole !== HUD.lastWhole) {
    HUD.lastWhole = whole;
    if (HUD.timerEl) HUD.timerEl.textContent = hudFmtTime(HUD.matchT);
  }
  var tCls = state === "paused" ? "timer paused" : (fighting ? "timer on" : "timer off");
  if (tCls !== HUD.timerCls && HUD.timerEl) {
    HUD.timerCls = tCls;
    HUD.timerEl.className = tCls;
  }

  if (!snap) return;

  // ---- 2. 血量数值 + 受击反馈 ----
  hudNum(HUD.hpNum.gojo, snap.gojo.hp, "hp");
  hudNum(HUD.hpNum.sukuna, snap.sukuna.hp, "hp");
  var ratioG = snap.gojo.hpMax > 0 ? snap.gojo.hp / snap.gojo.hpMax : 0;
  var ratioS = snap.sukuna.hpMax > 0 ? snap.sukuna.hp / snap.sukuna.hpMax : 0;
  hudBarCls(HUD.player, "gojo", ratioG < 0.3 ? "low" : "");
  hudBarCls(HUD.enemy, "sukuna", ratioS < 0.3 ? "low" : "");
  if (HUD.hpLast.gojo >= 0 && snap.gojo.hp < HUD.hpLast.gojo - 0.5) {
    HUD.flashT = 0.5;
    HUD.el.classList.add("hurt-gojo");
  }
  if (HUD.hpLast.sukuna >= 0 && snap.sukuna.hp < HUD.hpLast.sukuna - 0.5) {
    HUD.flashT = Math.max(HUD.flashT, 0.42);
    HUD.el.classList.add("hurt-sukuna");
  }
  HUD.hpLast.gojo = snap.gojo.hp;
  HUD.hpLast.sukuna = snap.sukuna.hp;
  if (HUD.flashT > 0) {
    HUD.flashT -= dt;
    if (HUD.flashT <= 0) HUD.el.classList.remove("hurt-gojo", "hurt-sukuna");
  }

  // ---- 3. 咒力 / 领域百分比 ----
  hudNum(HUD.ceNum, snap.gojo.ce, "ce");
  hudNum(HUD.domNum.gojo, snap.gojo.domain, "dom");
  hudNum(HUD.domNum.sukuna, snap.sukuna.domain, "dom");

  // ---- 4. 阶段（宿傩形态）：只加颜色 class，文本由 main.js 写 ----
  var pCls = "phase-tag ph" + Math.max(1, Math.min(3, snap.phase | 0));
  if (pCls !== HUD.phaseCls && HUD.phaseEl) {
    HUD.phaseCls = pCls;
    HUD.phaseEl.className = pCls;
  }

  // ---- 5. 距离读数：告诉你"现在是不是够得着" ----
  if (HUD.distEl) {
    var dd = snap.distance;
    var dCls = dd <= 4.5 ? "focus-dist melee" : dd <= 12 ? "focus-dist mid" : "focus-dist far";
    var txt = dd <= 4.5 ? "近身 " + dd.toFixed(1) + "m" : Math.round(dd) + "m";
    if (txt !== HUD.distTxt) {
      HUD.distTxt = txt;
      HUD.distEl.textContent = txt;
    }
    if (HUD.distEl.className !== dCls) HUD.distEl.className = dCls;
  }

  // ---- 6. 离屏敌人指示：人跑出画面时也要知道他在哪 ----
  hudCompass(fighting, snap);

  // ---- 7. 技能栏：冷却环 + 就绪弹跳（readiness 由 main.js 的 class 负责，这里补视觉层）----
  hudSkillBar(snap);

  // ---- 8. Banner 分级：短促的"黑闪！"走戏剧排面，长句走顶部信息条 ----
  if (HUD.bannerEl) {
    var btxt = HUD.bannerEl.textContent || "";
    if (btxt !== HUD.bannerTxt) {
      HUD.bannerTxt = btxt;
      var drama = btxt.length > 0 && btxt.length <= 8 && btxt.indexOf("：") < 0 && btxt.indexOf(":") < 0;
      HUD.bannerEl.classList.toggle("drama", drama);
    }
  }

  // ---- 9. 教学提示：学会就撤 ----
  // 只要玩家放过术式 / 打过连段 / 或者撑过 9 秒，提示立刻淡出。
  // 打了三分钟还挂着"J 连打"是在侮辱玩家智商，也是纯粹的画面污染。
  // 学习信号只看"玩家自己的输入"，不能看战斗事件 —— 宿傩每两秒放一次术式，
  // 用事件判断会让提示在开局第一帧就消失，等于没做教学。
  // 注意：领域槽/咒力会随时间自然回复，"数值变了"不能当作学习信号，
  // 否则提示会在开局第一秒就被撤掉（这条踩过坑）。
  var learned = snap.combo >= 3;
  if (typeof freshKeys !== "undefined" && freshKeys && freshKeys.has) {
    for (var fi = 0; fi < HUD_LEARN_KEYS.length; fi++) {
      if (freshKeys.has(HUD_LEARN_KEYS[fi])) { learned = true; break; }
    }
  }
  if (state === "fight" && !snap.clashActive) {
    if (!HUD.hintBuilt) hudBuildHints();
    if (HUD.hintT < 0) HUD.hintT = 0;
    HUD.hintT += dt;
  } else {
    learned = true;
  }
  if (HUD.hintsEl && HUD.hintsEl.classList.contains("show") && (learned || HUD.hintT > 9)) {
    HUD.hintsEl.classList.remove("show");
  }

  if (HUD.dockCheck) HUD.dockCheck();
}

/** 写数值读数（取整 + 比较后再写 DOM） */
function hudNum(el, v, kind) {
  if (!el) return;
  var out;
  if (kind === "ce" || kind === "dom") out = Math.round(v) + "%";
  else out = String(Math.max(0, Math.round(v)));
  if (el.__hudLast !== out) {
    el.__hudLast = out;
    el.textContent = out;
  }
}

/** 切血条状态 class（low 变红闪烁），只在变化时写 */
function hudBarCls(el, side, extra) {
  if (!el) return;
  var cls = "hp-fill " + side + (extra ? " " + extra : "");
  if (el.className !== cls) el.className = cls;
}

/** 离屏指示器：把「相机 → 敌人」的方向投到相机的右/上轴，得到屏幕方向角 */
function hudCompass(fighting, snap) {
  if (!HUD.compass || !sukuna || !sukuna.root) {
    hudCompassOff();
    return;
  }
  var ex = sukuna.root.position.x;
  var ey = sukuna.root.position.y + 1.0;
  var ez = sukuna.root.position.z;
  var p = camProjectPoint(ex, ey, ez);
  var off = !p.front || Math.abs(p.x) > 0.86 || Math.abs(p.y) > 0.84;
  if (!fighting || !off) {
    hudCompassOff();
    return;
  }
  var m = godCam.matrixWorld.elements;
  var dx = ex - godCam.position.x;
  var dy = ey - godCam.position.y;
  var dz = ez - godCam.position.z;
  var sx = dx * m[0] + dy * m[1] + dz * m[2];
  var sy = dx * m[4] + dy * m[5] + dz * m[6];
  var len = Math.hypot(sx, sy) || 1;
  sx /= len;
  sy /= len;
  var cx = HUD.vw * 0.5;
  var cy = HUD.vh * 0.5;
  var ax = cx + sx * HUD.vw * 0.34;
  var ay = cy - sy * HUD.vh * 0.31;
  var deg = Math.atan2(-sy, sx) * 180 / Math.PI;
  // 只转箭头，不转整个容器 —— 否则距离数字会跟着一起歪。
  // 位置/角度变化超过 0.6px(度) 才写 DOM：这个指示器常驻时每帧写 style 是纯浪费。
  if (HUD.compassAX === undefined || Math.abs(HUD.compassAX - ax) > 0.6 || Math.abs(HUD.compassAY - ay) > 0.6) {
    HUD.compassAX = ax;
    HUD.compassAY = ay;
    HUD.compass.style.transform = "translate(" + Math.round(ax) + "px," + Math.round(ay) + "px)";
  }
  if (HUD.compassArrow && (HUD.compassDeg === undefined || Math.abs(HUD.compassDeg - deg) > 0.6)) {
    HUD.compassDeg = deg;
    HUD.compassArrow.style.transform = "rotate(" + deg.toFixed(1) + "deg)";
  }
  var txt = Math.round(snap.distance) + "m";
  if (txt !== HUD.compassTxt) {
    HUD.compassTxt = txt;
    HUD.compassDist.textContent = txt;
  }
  HUD.compass.classList.toggle("behind", !p.front);
  if (!HUD.compassOn) {
    HUD.compassOn = true;
    HUD.compass.classList.remove("hidden");
    HUD.compass.classList.add("show");
  }
}

function hudCompassOff() {
  if (!HUD.compass || !HUD.compassOn) return;
  HUD.compassOn = false;
  HUD.compass.classList.remove("show");
  HUD.compass.classList.add("hidden");
}

/** 技能栏视觉层：冷却环用 CSS 变量驱动，就绪时弹一下 */
function hudSkillBar(snap) {
  // 缓存节点：每帧 getElementById 在低端手机上也是白扔的开销
  var bar = HUD.skillBar || (HUD.skillBar = document.getElementById("ability-bar"));
  if (!bar) return;
  if (bar.children.length !== HUD.skillBarLen) {
    HUD.skillBarLen = bar.children.length;
    HUD.skills = [];
    for (var i = 0; i < bar.children.length; i++) {
      var el = bar.children[i];
      HUD.skills.push(el);
      if (HUD.skillReady[el.dataset.skill] === undefined) HUD.skillReady[el.dataset.skill] = false;
    }
  }
  for (var k = 0; k < HUD.skills.length; k++) {
    var ab = HUD.skills[k];
    var sk = null;
    for (var j = 0; j < snap.skills.length; j++) {
      if (snap.skills[j].skill === ab.dataset.skill) { sk = snap.skills[j]; break; }
    }
    if (!sk) continue;
    var cdR = sk.cdMax > 0 ? Math.max(0, Math.min(1, sk.cd / sk.cdMax)) : 0;
    var key = ab.dataset.skill;
    var last = HUD.skillReady["cd:" + key];
    if (last === undefined || Math.abs(last - cdR) > 0.008) {
      HUD.skillReady["cd:" + key] = cdR;
      ab.style.setProperty("--cd", cdR.toFixed(3));
    }
    var ready = !!(sk.ready && sk.cd <= 0.05);
    if (ready !== HUD.skillReady[key]) {
      HUD.skillReady[key] = ready;
      ab.classList.toggle("hud-ready", ready);
      if (ready) {
        ab.classList.remove("hud-pop");
        void ab.offsetWidth; // 强制重排，让动画能重播
        ab.classList.add("hud-pop");
      }
    }
  }
}

/** HUD 每帧入口的兼容别名（main.js 若未来想直接调用可以用这个名字） */
function hudUpdate(dt, snap) {
  hudTick(dt, snap);
}
