// src/mobile.js
/**
 * ============================================================================
 * 移动端适配模块：触屏操作 / 响应式布局 / 性能降档 / 横竖屏
 * ----------------------------------------------------------------------------
 * 接入方式：build.mjs 把它作为「最后一个模块」拼进主 IIFE。
 *
 * ★ 与游戏本体的接口（刻意保持极窄，且都走「稳定契约」）★
 *   1) 输入：**合成键盘事件**（window keydown/keyup）。
 *      为什么不去直接调 startMatch/pauseGame/skipCutscene 这些函数？——
 *      重构期间实测踩过坑：main.js 是 Lead 的写域，skipCutscene 被改过一次名字，
 *      直接调用 → ReferenceError → 被全局错误处理当成游戏崩溃。
 *      走键位这条路与真实键盘完全同构，只要键位不变触屏就一直能用。
 *   2) 摇杆模拟量：window.__TOUCH（Lead 在 main.js buildInput 里读的桥）
 *   3) 像素比上限：window.__PR_MAX（Lead 在 main.js applyResize 里读）
 *   4) 状态读取：window.__SS.state（文档化调试接口）
 *   5) 镜头：window.__SS.cam（架构文档里写明由 camera.js 提供）
 *   任何一步拿不到都不抛异常 —— 所有事件回调都包了 safe()，绝不把游戏拖崩。
 * ============================================================================
 */
var MOBILE = (function () {
  "use strict";

  /* ==========================================================================
     一、环境探测
     ========================================================================== */
  var QS = new URLSearchParams(location.search);
  var NAV = navigator;
  var UA = NAV.userAgent || "";
  var hasTouch = ("ontouchstart" in window) || (NAV.maxTouchPoints || 0) > 0;
  var touchFlag = QS.get("touch");
  /** 是否启用触屏交互层：真触屏设备默认开，?touch=1 强制开，?touch=0 强制关 */
  var isTouch = touchFlag === "1" || (touchFlag !== "0" && hasTouch);
  var isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Windows Phone|HarmonyOS/i.test(UA) ||
                   !!(NAV.userAgentData && NAV.userAgentData.mobile);
  var DEBUG = QS.has("mdebug");

  function viewport() {
    return { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
  }
  function isPortrait() {
    var vp = viewport();
    return vp.h > vp.w;
  }
  function isMobileViewport() {
    var vp = viewport();
    return Math.min(vp.w, vp.h) <= 560;
  }

  /** 设备档位：决定像素比上限（渲染分辨率倍率）。手机永远不进最高的 1.5 档。 */
  function detectTier() {
    var vp = viewport();
    var long = Math.max(vp.w, vp.h);
    var mem = NAV.deviceMemory || 0;             // Safari 不实现，返回 0
    var cores = NAV.hardwareConcurrency || 0;
    var low = (mem > 0 && mem <= 4) || (cores > 0 && cores <= 4) || long < 640;
    if (low) return { name: "low", prMax: 1.0, label: "低" };
    if (!isMobileUA && !isMobileViewport() && cores >= 8 && long >= 900) {
      return { name: "high", prMax: 1.5, label: "高" };
    }
    return { name: "mid", prMax: 1.25, label: "中" };
  }

  var tier = detectTier();
  var env = {
    isTouch: isTouch,
    isMobileUA: isMobileUA,
    isMobileViewport: isMobileViewport(),
    portrait: isPortrait(),
    dpr: window.devicePixelRatio || 1,
    cores: NAV.hardwareConcurrency || 0,
    memory: NAV.deviceMemory || 0,
    maxTouchPoints: NAV.maxTouchPoints || 0,
    standalone: !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches),
  };

  /** 游戏状态：走文档化接口 window.__SS.state，拿不到就回退同作用域的 state */
  function gameState() {
    var S = window.__SS;
    if (S) {
      try {
        var v = S.state;
        if (typeof v === "string") return v;
      } catch (e) { /* 继续回退 */ }
    }
    try { return state; } catch (e2) { return ""; }
  }
  /** 主相机：按架构文档走 window.__SS.cam */
  function camRef() {
    var S = window.__SS;
    if (S && S.cam) return S.cam;
    try { return cam; } catch (e) { return null; }
  }
  /** 所有跨模块访问都从这里过一道，任何一个缺失都不会把游戏带崩 */
  function safe(fn) {
    return function (ev) {
      try { return fn(ev); } catch (err) {
        if (DEBUG) console.error("[mobile]", err);
      }
    };
  }

  /* ==========================================================================
     二、性能：像素比上限 + 自适应分辨率
     ========================================================================== */
  var perf = {
    tier: tier.name,
    prBase: tier.prMax,
    userCap: 1,        // 玩家在「画质」按钮里选的倍率
    scale: 1,          // 自适应缩放（掉帧就继续降）
    fps: 60,
    fpsAvg: 60,
    samples: [],
    dropped: 0,
    raised: 0,
    lastApply: 0,
  };
  var perfWinAcc = 0, perfWinFrames = 0, perfStable = 0;
  var qualityTouched = false;

  function prTarget() {
    return Math.max(0.5, Math.min(2, perf.prBase * perf.userCap * perf.scale));
  }
  function perfSnapshot() {
    return {
      tier: perf.tier,
      pr: +prTarget().toFixed(2),
      scale: +perf.scale.toFixed(2),
      fps: +perf.fpsAvg.toFixed(1),
      fpsNow: +perf.fps.toFixed(1),
      dropped: perf.dropped,
      raised: perf.raised,
      dpr: env.dpr,
      vw: viewport().w,
      vh: viewport().h,
    };
  }
  /** 把像素比上限写进 main.js 的 __PR_MAX，再让它重算画布（桌面保持默认 2） */
  function applyPerfTargets(reason) {
    window.__PR_MAX = isTouch ? prTarget() : 2;
    perf.lastApply = performance.now();
    try {
      if (window.__SS && window.__SS.render && typeof applyResize === "function") applyResize();
    } catch (e) { /* 启动阶段 render 还没建好 */ }
    try { if (window.__SS && window.__SS.stats) window.__SS.stats.mobile = perfSnapshot(); } catch (e2) { /* 忽略 */ }
    if (DEBUG && reason) console.log("[mobile] __PR_MAX=" + window.__PR_MAX.toFixed(2) + " (" + reason + ")");
  }

  function perfTick(dt) {
    if (dt <= 0) return;
    perf.fps = 1 / dt;
    perfWinAcc += dt;
    perfWinFrames++;
    if (perfWinAcc < 0.75) return;
    var f = perfWinFrames / perfWinAcc;
    perf.fpsAvg = perf.fpsAvg * 0.5 + f * 0.5;
    perf.samples.push(+f.toFixed(1));
    if (perf.samples.length > 40) perf.samples.shift();
    perfWinAcc = 0;
    perfWinFrames = 0;
    if (perf.samples.length <= 3) return;   // 开局前 3 个窗口必然抖，不下结论
    if (f < 27 && perf.scale > 0.6) {
      perf.scale = Math.max(0.6, perf.scale - 0.12);
      perf.dropped++;
      perfStable = 0;
      applyPerfTargets("掉帧降分辨率");
    } else if (f > 52) {
      perfStable++;
      if (perfStable >= 4 && perf.scale < 1) {
        perf.scale = Math.min(1, perf.scale + 0.06);
        perf.raised++;
        perfStable = 0;
        applyPerfTargets("帧率富余回升");
      }
    } else {
      perfStable = 0;
    }
  }

  /* ==========================================================================
     三、输入注入（合成键盘事件，与真实键盘同构）
     ========================================================================== */
  var T = window.__TOUCH || (window.__TOUCH = { on: false, mx: 0, mz: 0, camX: 0, camY: 0 });
  var KEY = {
    KeyJ: ["j", 74], KeyK: ["k", 75], KeyU: ["u", 85], KeyI: ["i", 73], KeyO: ["o", 79],
    KeyH: ["h", 72], KeyG: ["g", 71], KeyL: ["l", 76], KeyQ: ["q", 81],
    KeyP: ["p", 80], KeyR: ["r", 82], KeyF: ["f", 70],
    Space: [" ", 32], ShiftLeft: ["Shift", 16], Escape: ["Escape", 27],
  };
  var heldKeys = [];

  function keyEvent(type, code) {
    var m = KEY[code] || [code, 0];
    var ev = new KeyboardEvent(type, {
      key: m[0], code: code, keyCode: m[1], which: m[1],
      bubbles: true, cancelable: true, composed: true, repeat: false,
    });
    window.dispatchEvent(ev);
  }
  function keyDown(code) {
    keyEvent("keydown", code);
    if (heldKeys.indexOf(code) < 0) heldKeys.push(code);
  }
  function keyUp(code) {
    keyEvent("keyup", code);
    var i = heldKeys.indexOf(code);
    if (i >= 0) heldKeys.splice(i, 1);
  }
  /** 点按：按下后 70ms 抬起（足够游戏取到 freshKeys，又不至于变成长按） */
  function tapKey(code) {
    keyDown(code);
    setTimeout(function () { keyUp(code); }, 70);
  }
  /** 长按类（茈 / 200% / 疾走）：按下不放，松手才 keyup */
  function holdKey(code, on) { if (on) keyDown(code); else keyUp(code); }
  function releaseAllHolds() {
    for (var i = heldKeys.length - 1; i >= 0; i--) keyUp(heldKeys[i]);
    heldKeys.length = 0;
  }

  /* ==========================================================================
     四、触屏控件 DOM
     ========================================================================== */
  var host = null, joyEl = null, joyBase = null, knobEl = null, actsEl = null,
      utilEl = null, skipEl = null, tipEl = null, rotateEl = null, legendEl = null;

  function mk(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }

  /* DOM 顺序 = 屏幕从左到右；「輕」在最后 = 最靠近右拇指 */
  var ACTIONS = [
    { act: "ult", cls: "t-ult", label: "二", hold: "KeyL", tip: "起手式：按住蓄力，松开放 200% 茈" },
    { act: "dash", cls: "t-dash", label: "疾", tip: "疾走（点一下锁住）" },
    { act: "dodge", cls: "t-space", label: "閃", tip: "无下限 / 闪避" },
    { act: "heavy", cls: "t-k", label: "重", tip: "重击 / 踢击" },
    { act: "light", cls: "t-j", label: "輕", tip: "轻击（可三连段）" },
  ];
  var ACT_DEF = {};
  for (var ai = 0; ai < ACTIONS.length; ai++) ACT_DEF[ACTIONS[ai].act] = ACTIONS[ai];

  /** HUD 技能栏的 data-skill -> 触屏行为（hold=true 表示按住蓄力） */
  var SKILL_ACT = {
    blue: { code: "KeyU", hold: false },
    red: { code: "KeyI", hold: false },
    purple: { code: "KeyO", hold: true },
    reverse: { code: "KeyH", hold: false },
    void: { code: "KeyG", hold: false },
    purple200: { code: "KeyL", hold: true },
  };

  /* 工具键：全用中日韩字体里一定有的字形，避免 ★ 之类的字符变豆腐块 */
  var UTILS = [
    { act: "cam", html: "◎", tip: "锁定镜头" },
    { act: "quality", html: "画", tip: "画质 低/中/高" },
    { act: "full", html: "全", tip: "全屏 + 横屏" },
    { act: "sound", html: "音", tip: "音量" },
    { act: "pause", html: "停", tip: "暂停" },
  ];

  function buildDOM() {
    if (host) return;
    host = mk("div", "t-hidden", document.body);
    host.id = "touch-ui";

    // 摇杆：容器比底盘大半圈，拇指「擦边」也算按到
    joyEl = mk("div", "t-joy t-fade", host);
    joyEl.id = "t-joy";
    joyBase = mk("div", "t-joy-base", joyEl);
    knobEl = mk("div", "t-joy-knob", joyEl);

    actsEl = mk("div", "t-acts", host);
    actsEl.id = "t-acts";
    for (var i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i];
      var b = mk("button", "t-btn " + a.cls, actsEl, '<span class="t-label">' + a.label + "</span>");
      b.type = "button";
      b.dataset.act = a.act;
      b.setAttribute("aria-label", a.tip);
    }

    utilEl = mk("div", "t-util", host);
    utilEl.id = "t-util";
    for (var j = 0; j < UTILS.length; j++) {
      var ub = mk("button", "t-ubtn", utilEl, UTILS[j].html);
      ub.type = "button";
      ub.dataset.act = UTILS[j].act;
      ub.setAttribute("aria-label", UTILS[j].tip);
    }

    skipEl = mk("button", "t-skip t-hidden", host, "跳过播片");
    skipEl.id = "t-skip";
    skipEl.type = "button";

    tipEl = mk("div", "t-tip", host);
    tipEl.id = "t-tip";
  }

  /* ==========================================================================
     五、手势层
     —— Pointer Events：鼠标 / 手指 / CDP 触屏注入都走同一条路
     —— 三种互不干扰的角色：摇杆 / 按键 / 镜头拖拽（含双指缩放）
     ========================================================================== */
  var pointers = new Map();
  var lookPointers = [];
  var pinchPrev = 0;
  var stick = { active: false, cx: 0, cy: 0, R: 1, mx: 0, mz: 0 };
  var dashOn = false;
  var lastInteraction = 0;

  var RE_CTRL = ".t-btn, .t-ubtn, .ab, .t-skip, .t-rbtn, .t-joy";
  var RE_UI = ".screen, button, input, a, .audio-panel, .boot-diag";

  function nowMs() { return performance.now(); }
  function markActive() {
    lastInteraction = nowMs();
    if (host) host.classList.remove("t-idle");
    if (joyEl) joyEl.classList.remove("t-fade");
  }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* 忽略 */ } }

  function onDown(e) {
    if (!isTouch || !host) return;
    var t = e.target;
    var ctrl = t && t.closest ? t.closest(RE_CTRL) : null;
    if (ctrl && ctrl.closest && !ctrl.closest("#touch-ui, #hud")) ctrl = null;
    if (ctrl && ctrl.closest(".screen") && !ctrl.closest("#touch-ui")) ctrl = null;
    if (ctrl) {
      e.preventDefault();
      markActive();
      try { ctrl.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (ctrl === joyEl) startStick(e);
      else if (ctrl.classList.contains("ab")) startSkill(e, ctrl);
      else startButton(e, ctrl);
      return;
    }
    // 界面按钮（标题/暂停/结算/音量）：交给浏览器原生 click
    if (t && t.closest && t.closest(RE_UI)) return;
    // 其余区域（3D 画布 / HUD 空白）：拖镜头
    e.preventDefault();
    markActive();
    lookPointers.push(e.pointerId);
    pointers.set(e.pointerId, { kind: "look", x: e.clientX, y: e.clientY });
    if (lookPointers.length === 2) {
      var a = pointers.get(lookPointers[0]), b = pointers.get(lookPointers[1]);
      pinchPrev = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onMove(e) {
    if (!isTouch) return;
    var p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (p.kind === "stick") moveStick(e);
    else if (p.kind === "look") moveLook(e);
  }

  function onUp(e) {
    if (!isTouch) return;
    var p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.kind === "stick") endStick();
    else if (p.kind === "button") { if (p.el) p.el.classList.remove("t-down"); if (p.hold) holdKey(p.hold, false); }
    else if (p.kind === "skill") { if (p.el) p.el.classList.remove("t-down"); if (p.meta && p.meta.hold) holdKey(p.meta.code, false); }
    else if (p.kind === "look") {
      var i = lookPointers.indexOf(e.pointerId);
      if (i >= 0) lookPointers.splice(i, 1);
      if (lookPointers.length < 2) pinchPrev = 0;
    }
    // 只有「真的一根手指都不剩」时才清长按，避免多点触控互相踩
    if (pointers.size === 0) {
      if (dashOn) { /* 疾走是开关，松手不清 */ } 
      releaseAllHolds();
      if (dashOn) keyDown("ShiftLeft");
    }
    syncBridge();
  }

  function startStick(e) {
    var r = joyBase.getBoundingClientRect();
    stick.active = true;
    stick.cx = r.left + r.width / 2;
    stick.cy = r.top + r.height / 2;
    stick.R = Math.max(24, r.width * 0.42);
    pointers.set(e.pointerId, { kind: "stick", x: e.clientX, y: e.clientY });
    joyEl.classList.add("t-active");
    moveStick(e);
  }
  function moveStick(e) {
    if (!stick.active) return;
    var dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    var d = Math.hypot(dx, dy);
    var nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : 0;
    var clamped = Math.min(d, stick.R);
    var mag = clamped / stick.R;
    mag = mag < 0.16 ? 0 : (mag - 0.16) / 0.84;   // 死区
    stick.mx = +(nx * mag).toFixed(3);
    stick.mz = +(ny * mag).toFixed(3);
    knobEl.style.transform = "translate(calc(-50% + " + (nx * clamped).toFixed(1) + "px), calc(-50% + " + (ny * clamped).toFixed(1) + "px))";
    joyEl.classList.toggle("t-push", mag > 0.92);
    syncBridge();
  }
  function endStick() {
    stick.active = false;
    stick.mx = 0; stick.mz = 0;
    joyEl.classList.remove("t-active", "t-push");
    knobEl.style.transform = "translate(-50%, -50%)";
    syncBridge();
  }
  function syncBridge() {
    T.on = !!(isTouch && stick.active);
    T.mx = stick.mx;
    T.mz = stick.mz;
    T.camX = 0;   // 镜头旋转由本模块直接写 cam.yaw/pitch，手感更跟手
    T.camY = 0;
  }

  function startButton(e, el) {
    var act = el.dataset.act;
    var def = ACT_DEF[act];
    el.classList.add("t-down");
    pointers.set(e.pointerId, { kind: "button", el: el, act: act, hold: def && def.hold });
    buzz(8);
    if (def && def.hold) { holdKey(def.hold, true); return; }
    switch (act) {
      case "light": tapKey("KeyJ"); break;
      case "heavy": tapKey("KeyK"); break;
      case "dodge": tapKey("Space"); break;
      case "dash": toggleDash(el); break;
    }
  }
  function toggleDash(el) {
    dashOn = !dashOn;
    holdKey("ShiftLeft", dashOn);
    el.classList.toggle("t-on", dashOn);
    toast(dashOn ? "疾走：开" : "疾走：关", 900);
    buzz(12);
  }

  function startSkill(e, el) {
    var meta = SKILL_ACT[el.dataset.skill];
    el.classList.add("t-down");
    pointers.set(e.pointerId, { kind: "skill", el: el, meta: meta });
    if (!meta) return;
    buzz(10);
    if (meta.hold) holdKey(meta.code, true);
    else tapKey(meta.code);
  }

  /* ---- 镜头：单指拖 = 转视角，双指捏 = 缩放 ---- */
  var LOOK_YAW = 0.0042, LOOK_PITCH = 0.0032;
  function moveLook(e) {
    var c = camRef();
    if (!c) return;
    if (lookPointers.length >= 2) {
      var a = pointers.get(lookPointers[0]), b = pointers.get(lookPointers[1]);
      if (!a || !b) return;
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchPrev > 8 && d > 8 && c.zoomBias != null) {
        c.zoomBias = Math.max(0.35, Math.min(3.2, c.zoomBias * (1 + (pinchPrev / d - 1) * 0.85)));
      }
      pinchPrev = d;
      return;
    }
    var p = pointers.get(e.pointerId);
    if (!p) return;
    c.yaw -= (e.clientX - p.x) * LOOK_YAW;
    c.pitch = Math.max(0.16, Math.min(1.47, c.pitch - (e.clientY - p.y) * LOOK_PITCH));
  }

  /* ==========================================================================
     六、工具键 / 提示 / 旋转提示 / 标题页图例
     ========================================================================== */
  /**
   * 全屏 + 锁定横屏。
   * 三个坑都在这里处理：
   *  1. 必须**等全屏真正生效**再锁横屏 —— 非全屏状态下 lock() 必被拒。
   *     原来固定等 700ms 是赌运气，全屏动画稍慢就失败；改成轮询 fullscreenElement。
   *  2. lock() 返回 Promise，被拒时原来静默吞掉，用户只觉得"点了没反应" → 现在明确提示。
   *  3. iOS Safari 根本没有 orientation.lock → 同样给提示，而不是假装成功。
   */
  /**
   * 锁横屏。等到全屏真正生效后再调（非全屏状态下 lock() 必被拒），
   * 失败重试 2 次（部分机型第一次 lock 会因为切换动画还没结束而失败）。
   */
  function tryLockOrientation(retry) {
    var left = retry === void 0 ? 2 : retry;
    window.__FSL = window.__FSL || {};
    var so = screen.orientation;
    if (!so || !so.lock) {
      // iOS Safari 至今没有 Screen Orientation API（只有 Android Chrome / 三星浏览器支持）。
      // 唯一能让 iPhone 自动横屏的办法是"添加到主屏幕"，由 manifest 的 orientation:"landscape" 生效。
      window.__FSL.lock = "unsupported";
      toast("iPhone 不支持网页自动横屏：请手动横过来，或用「添加到主屏幕」安装后自动横屏", 4200);
      return;
    }
    function attempt(n) {
      try {
        var r = so.lock("landscape");
        window.__FSL.lock = "requested";
        if (r && r.catch) r.catch(function (err) {
          window.__FSL.lock = "rejected:" + (err && err.name ? err.name : "?");
          if (n > 0) setTimeout(function () { attempt(n - 1); }, 260);
          else toast("自动横屏被系统拒绝（部分机型需先在系统里打开「自动旋转」），请手动横过来", 3600);
        });
      } catch (e) {
        window.__FSL.lock = "threw";
        if (n > 0) setTimeout(function () { attempt(n - 1); }, 260);
        else toast("本机不支持自动横屏，请手动把手机横过来", 3200);
      }
    }
    attempt(left);
  }
  /**
   * 全屏 + 锁定横屏。
   * ⚠ 这里**必须直接调 requestFullscreen()，不能再走 tapKey("KeyF")**：
   * 游戏的 F 键是 toggle，用户如果已经是全屏（先按过一次全屏、或系统本来就全屏），
   * 再点「全屏并横屏」会被 toggle 成**退出全屏**，然后 lock() 因为不在全屏而失败 ——
   * 现象就是"点了全屏并横屏，结果既没全屏也没横屏"。
   * 直连调用还会把 navigationUI:"hide" 一起带上（安卓地址栏不再占高度）。
   */
  function goFullscreenLandscape() {
    window.__FSL = { requested: true, lock: null };
    var el = document.documentElement;
    var already = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (already) {
      window.__FSL.fs = "already";
      setTimeout(function () { tryLockOrientation(); }, 60);
      return;
    }
    var p = null;
    try {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) p = req.call(el, { navigationUI: "hide" });
    } catch (e) {
      p = null;
    }
    if (p && p.then) {
      p.then(function () {
        window.__FSL.fs = "ok";
        setTimeout(function () { tryLockOrientation(); }, 120);
      }).catch(function (e) {
        // 直连被拒（Permissions check failed / WebView 限制）：退回游戏自身的 F 键路径再试一次
        window.__FSL.fs = "rejected:" + (e && e.name ? e.name : "?");
        tapKey("KeyF");
        setTimeout(function () { tryLockOrientation(); }, 520);
      });
    } else {
      // 老实现（同步返回 undefined）：轮询等全屏生效
      tapKey("KeyF");
      var tries = 0;
      (function wait() {
        tries++;
        if (!(document.fullscreenElement || document.webkitFullscreenElement) && tries < 14) { setTimeout(wait, 150); return; }
        window.__FSL.fs = "ok";
        tryLockOrientation();
      })();
    }
  }
  function utilAction(act, el) {
    switch (act) {
      case "cam": {
        tapKey("KeyQ");   // 游戏自己的键位：Q = 锁定镜头
        var c = camRef();
        var on = c ? !c.lockOn : false;
        setTimeout(function () { if (el) el.classList.toggle("t-on", c ? !!c.lockOn : on); }, 60);
        toast(on ? "镜头锁定：开" : "镜头锁定：关", 1000);
        break;
      }
      case "quality": cycleQuality(); break;
      case "full": goFullscreenLandscape(); break;
      case "sound": toggleSheet(); break;
      case "pause": tapKey("Escape"); break;
    }
  }
  var qualitySteps = [{ k: 0.8, n: "低" }, { k: 1, n: "中" }, { k: 1.2, n: "高" }];
  var qualityIdx = 1;
  function cycleQuality() {
    qualityIdx = (qualityIdx + 1) % qualitySteps.length;
    perf.userCap = qualitySteps[qualityIdx].k;
    perf.scale = 1;
    qualityTouched = true;
    applyPerfTargets("手动画质");
    toast("画质：" + qualitySteps[qualityIdx].n + "（分辨率 " + prTarget().toFixed(2) + "x）", 1300);
  }
  function toggleSheet() {
    var panel = document.querySelector(".audio-panel");
    if (!panel) return;
    panel.classList.toggle("t-sheet");
    if (panel.classList.contains("t-sheet")) {
      panel.querySelectorAll("input").forEach(function (inp) {
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
  }

  var toastTimer = 0;
  function toast(text, ms) {
    if (!tipEl) return;
    tipEl.textContent = text;
    tipEl.classList.add("t-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { tipEl.classList.remove("t-show"); }, ms || 1600);
  }

  function buildRotateHint() {
    if (rotateEl) return rotateEl;
    rotateEl = mk("div", "t-rotate t-hidden", document.body);
    rotateEl.innerHTML =
      '<div class="t-rotate-inner">' +
      /* 图标用 SVG：任何字体环境都不会变成豆腐块 */
      '<svg class="t-rotate-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
      '<rect x="21" y="9" width="24" height="46" rx="5" stroke="rgba(255,216,115,.9)" stroke-width="2.5"/>' +
      '<rect x="26" y="15" width="14" height="30" rx="2" fill="rgba(95,240,255,.2)"/>' +
      '<circle cx="33" cy="50" r="1.8" fill="rgba(255,216,115,.9)"/>' +
      '<path d="M14 47C6 36 8 22 18 15" stroke="rgba(95,240,255,.85)" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M13 13l6 1.5-2 6" stroke="rgba(95,240,255,.95)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      "<h2>横 屏 更 爽</h2>" +
      "<p>这是 3D 对战游戏，横屏能多看到约 2 倍的战场宽度。<br>点下面按钮直接全屏横屏；竖屏也能玩，视野会窄一些。</p>" +
      '<div class="t-rotate-actions">' +
      '<button type="button" class="t-rbtn primary" data-act="rotate-go">全屏并横屏</button>' +
      '<button type="button" class="t-rbtn" data-act="rotate-skip">竖屏也要玩</button>' +
      "</div></div>";
    document.body.appendChild(rotateEl);
    rotateEl.addEventListener("pointerdown", safe(function (e) {
      var b = e.target.closest(".t-rbtn");
      if (!b) return;
      e.preventDefault();
      b.classList.add("t-down");
      setTimeout(function () { b.classList.remove("t-down"); }, 140);
      // ⚠ 原来这里只调了 tapKey("KeyF")（全屏），**漏掉横屏锁定** ——
      // 这正是"点全屏并横屏却不自动横屏"的 bug。现在统一走 goFullscreenLandscape()。
      if (b.dataset.act === "rotate-go") { goFullscreenLandscape(); hideRotateHint(true); }
      else hideRotateHint(true);
    }));
    return rotateEl;
  }
  function hideRotateHint(remember) {
    if (rotateEl) rotateEl.classList.add("t-hidden");
    if (remember) { try { sessionStorage.setItem("ss_rotate_ok", "1"); } catch (e) { /* 忽略 */ } }
  }
  function maybeShowRotateHint() {
    if (!isTouch || !isPortrait()) return;
    var seen = false;
    try { seen = sessionStorage.getItem("ss_rotate_ok") === "1"; } catch (e) { /* 忽略 */ }
    if (seen) return;
    if (window.__BOOT && window.__BOOT.ok !== true) return;
    buildRotateHint().classList.remove("t-hidden");
  }

  /** 标题页：把桌面键位表换成触屏图例 */
  function buildLegend() {
    if (!isTouch || legendEl) return;
    var grid = document.querySelector("#title .controls-grid");
    if (!grid) return;
    legendEl = mk("div", "t-legend");
    legendEl.innerHTML =
      "<div><h4>左手</h4><b>左下摇杆</b> 移动（相对镜头）· 推到底自动冲刺</div>" +
      "<div><h4>右手</h4><b>輕 / 重</b> 体术连段 · <b>閃</b> 无下限闪避 · <b>疾</b> 疾走开关 · <b>二</b> 蓄力 200% 茈</div>" +
      "<div><h4>术式</h4><b>領 蒼 赫 茈 反</b> 就是 HUD 技能栏，冷却/耗蓝直接显示在格子上；<b>茈</b> 按住蓄力</div>" +
      "<div><h4>镜头</h4><b>拖动画面</b> 转视角 · <b>双指捏合</b> 拉近拉远 · 右上 <b>◎</b> 锁人</div>" +
      "<div><h4>其它</h4>右上角 <b>停</b> 暂停 · <b>全</b> 全屏横屏 · <b>音</b> 音量 · <b>画</b> 画质</div>" +
      "<div><h4>提示</h4>命中后 0.28 秒内再次命中 → <b>黑闪</b>；领域对决胜靠连点 <b>輕 / 重</b></div>";
    grid.parentNode.insertBefore(legendEl, grid.nextSibling);
  }

  /**
   * 教学提示里写的是键盘键位（"空格：无下限术式"、"领域槽满时按 G 展开"），
   * 手机上只会让人困惑。只改 #hints 里 .hint 的文本，不动 HUD 结构。
   */
  var HINT_MAP = [
    [/空格/g, "閃"],
    [/W\s*A\s*S\s*D/gi, "摇杆"],
    [/Shift/gi, "疾"],
    [/J\s*\/\s*K/g, "輕/重"],
    [/按\s*G\b/g, "点 領"],
    [/按\s*J\b/g, "点 輕"],
    [/按\s*K\b/g, "点 重"],
    [/按\s*H\b/g, "点 反"],
    [/按\s*U\b/g, "点 蒼"],
    [/按\s*I\b/g, "点 赫"],
    [/按\s*O\b/g, "点 茈"],
    [/按\s*L\b/g, "点 二"],
  ];
  /** 单独的键位高亮（hud.js 里是 <b>J</b> 这种），按「整个文本节点 == 键名」精确替换 */
  var HINT_EXACT = {
    J: "輕", K: "重", U: "蒼", I: "赫", O: "茈", H: "反", L: "二", G: "領", Q: "◎", P: "停",
    Shift: "疾", "空格": "閃", Space: "閃", WASD: "摇杆",
  };
  /** 只改文本节点，保留 <b> 之类的高亮标记 */
  function localizeHints(root) {
    if (!root || !document.createTreeWalker) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) {
      var t = n.nodeValue;
      var exact = HINT_EXACT[t.trim()];
      if (exact && t === t.trim()) { n.nodeValue = exact; continue; }   // 只有真的变了才写，避免观察器自激
      var out = t;
      for (var k = 0; k < HINT_MAP.length; k++) out = out.replace(HINT_MAP[k][0], HINT_MAP[k][1]);
      if (out !== t) n.nodeValue = out;
    }
  }
  function watchHints() {
    if (!window.MutationObserver) return;
    // 教学提示在 #hints；被敌人打中时的「空格：无下限术式」走的是 #banner
    var boxes = [document.getElementById("hints"), document.getElementById("banner")].filter(Boolean);
    var run = safe(function () { boxes.forEach(localizeHints); });
    run();
    boxes.forEach(function (b) {
      new MutationObserver(run).observe(b, { childList: true, subtree: true, characterData: true });
    });
  }

  /* ==========================================================================
     七、每帧同步（我的 rAF 比 main.js 的 loop2 先注册，按键零延迟）
     ========================================================================== */
  var lastNow = 0;
  var shownState = "";
  var uiShown = false;
  var pendingTip = 0;
  var tipShown = false;
  var dbg = { frames: 0, wantUI: null, state: null, isTouch: isTouch, host: false, lastErr: null };

  function syncUI(dt) {
    var st = gameState();
    var inFight = st === "fight" || st === "clash" || st === "victory" || st === "defeat";
    var inCine = st === "cutscene";
    var wantUI = isTouch && (inFight || inCine);
    dbg.frames++; dbg.state = st; dbg.wantUI = wantUI; dbg.host = !!host;

    if (wantUI !== uiShown || st !== shownState) {
      uiShown = wantUI;
      shownState = st;
      host.classList.toggle("t-hidden", !wantUI);
      host.classList.toggle("t-off", !wantUI);
      host.classList.toggle("t-cine", inCine);
      skipEl.classList.toggle("t-hidden", !inCine);
      joyEl.style.display = inCine ? "none" : "";
      actsEl.style.display = inCine ? "none" : "";
      utilEl.style.display = inCine ? "none" : "";
      document.querySelectorAll("#ability-bar .ab").forEach(function (el2) {
        el2.style.display = inCine ? "none" : "";
      });
      if (inFight && !tipShown) { tipShown = true; pendingTip = 1.6; }
      // 开打了就收起竖屏提示，别挂在战场上
      if (inFight && rotateEl && !rotateEl.classList.contains("t-hidden")) hideRotateHint(false);
    }

    // 空闲淡出：手一停就把战场让出来
    if (!host.classList.contains("t-hidden")) {
      var idle = (nowMs() - lastInteraction) > 1400 && !stick.active && pointers.size === 0;
      if (idle !== host.classList.contains("t-idle")) {
        host.classList.toggle("t-idle", idle);
        joyEl.classList.toggle("t-fade", idle);
      }
    }

    if (pendingTip > 0) {
      pendingTip -= dt;
      if (pendingTip <= 0 && !document.hidden && (st === "fight" || st === "clash")) {
        toast("拖动画面转视角 · 双指捏合缩放 · 右上 ◎ 锁人", 4600);
      }
    }

    // 竖屏视场补偿：aspect<1 时横向视野被压扁，抬垂直 FOV 换回一点战场宽度（上限 68° 防鱼眼）
    if (isTouch && window.__SS && window.__SS.godCam) {
      var vp2 = viewport();
      var asp = vp2.w / Math.max(1, vp2.h);
      var fovWant = asp < 1 ? Math.min(68, 46 * (1 + (1 - asp) * 0.55)) : 46;
      var gc = window.__SS.godCam;
      if (Math.abs(gc.fov - fovWant) > 0.05) { gc.fov = fovWant; gc.updateProjectionMatrix(); }
    }

    perfTick(dt);
  }

  /* ==========================================================================
     八、窗口事件
     ========================================================================== */
  function onViewportChange() {
    var vp = viewport();
    env.dpr = window.devicePixelRatio || 1;
    env.portrait = vp.h > vp.w;
    var nt = detectTier();
    if (nt.prMax !== tier.prMax && !qualityTouched) {
      tier = nt; perf.prBase = nt.prMax; perf.scale = 1;
      applyPerfTargets("档位变化");
    }
    if (host) host.classList.toggle("t-portrait", env.portrait);
    if (env.portrait) setTimeout(safe(maybeShowRotateHint), 260);
  }

  function bindEvents() {
    var opt = { passive: false };
    document.addEventListener("pointerdown", safe(onDown), opt);
    window.addEventListener("pointermove", safe(onMove), { passive: false });
    window.addEventListener("pointerup", safe(onUp));
    window.addEventListener("pointercancel", safe(onUp));
    window.addEventListener("blur", safe(function () {
      releaseAllHolds();
      endStick();
      pointers.clear();
      lookPointers.length = 0;
    }));
    window.addEventListener("resize", safe(onViewportChange));
    window.addEventListener("orientationchange", safe(function () {
      setTimeout(safe(onViewportChange), 220);
      // 全屏状态下跨过 90° 之后系统有时会解除锁定，这里补一次
      if (window.__FSL && window.__FSL.lock === "requested") setTimeout(safe(function () { tryLockOrientation(1); }), 400);
    }));
    // 切回前台时（手机锁屏/切 App 回来）系统会重置方向锁定，同样补一次
    document.addEventListener("visibilitychange", safe(function () {
      if (!document.hidden && window.__FSL && window.__FSL.lock === "requested") setTimeout(safe(function () { tryLockOrientation(1); }), 300);
    }));
    // 手机上切后台 = 自动暂停，回来不会发现自己已经死了
    document.addEventListener("visibilitychange", safe(function () {
      if (QS.get("autopause") === "0") return;
      var gs = gameState();
      if (document.hidden && (gs === "fight" || gs === "clash")) tapKey("Escape");
      if (!document.hidden) lastInteraction = nowMs();
    }));
    // 工具键（委托：元素动态重建也不受影响）
    document.addEventListener("pointerdown", safe(function (e) {
      var u = e.target && e.target.closest ? e.target.closest(".t-ubtn") : null;
      if (!u) return;
      e.preventDefault();
      markActive();
      u.classList.add("t-down");
      setTimeout(function () { u.classList.remove("t-down"); }, 130);
      buzz(8);
      utilAction(u.dataset.act, u);
    }), opt);
    // 播片跳过
    document.addEventListener("pointerdown", safe(function (e) {
      var s = e.target && e.target.closest ? e.target.closest("#t-skip") : null;
      if (!s) return;
      e.preventDefault();
      tapKey("Space");     // 游戏自己的键位：播片中按空格 = 跳过
    }), opt);
    var bar = document.getElementById("ability-bar");
    if (bar) bar.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  /* ==========================================================================
     九、布局体检（验收工具用：真实几何检测，不是「看着还行」）
     ========================================================================== */
  function visible(e) {
    var n = e;
    while (n && n.nodeType === 1) {
      var s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
      n = n.parentElement;
    }
    return true;
  }
  function rect1(e) {
    if (!visible(e)) return null;
    var r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return {
      el: e,
      name: (e.id ? "#" + e.id : "") + (e.className ? "." + String(e.className).split(" ").filter(Boolean)[0] : ""),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
    };
  }
  function rectOf(sel, all) {
    if (all) {
      var out = [];
      document.querySelectorAll(sel).forEach(function (e) { var r = rect1(e); if (r) out.push(r); });
      return out;
    }
    var e1 = document.querySelector(sel);
    return e1 ? rect1(e1) : null;
  }
  function related(a, b) { return !!(a.el && b.el && (a.el.contains(b.el) || b.el.contains(a.el))); }
  function inter(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    var h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (w <= 1 || h <= 1) return 0;
    return w * h;
  }
  function brief(r) { return { name: r.name, x: r.x, y: r.y, w: r.w, h: r.h }; }

  function audit() {
    var vp = viewport();
    var controls = [];
    var joy = rectOf("#t-joy");
    if (joy) controls.push(joy);
    rectOf("#t-acts .t-btn", true).forEach(function (r) { controls.push(r); });
    rectOf("#ability-bar .ab", true).forEach(function (r) { controls.push(r); });
    rectOf(".t-util .t-ubtn", true).forEach(function (r) { controls.push(r); });
    var skip = rectOf("#t-skip");
    if (skip) controls.push(skip);

    var hud = [];
    ["#hud .fighter-panel.left", "#hud .center-readout", "#hud .fighter-panel.right", "#hud #ability-bar",
     "#hud .clash", "#hud .banner", "#hud .hints", "#hud .combo"].forEach(function (s) {
      var r = rectOf(s);
      if (r) hud.push(r);
    });

    var issues = [];
    controls.forEach(function (c) {
      if (c.x < -2 || c.y < -2 || c.right > vp.w + 2 || c.bottom > vp.h + 2) {
        issues.push("控件越界: " + c.name + " " + JSON.stringify(brief(c)));
      }
    });
    var overlapCtrl = [];
    for (var i = 0; i < controls.length; i++) {
      for (var j = i + 1; j < controls.length; j++) {
        if (related(controls[i], controls[j])) continue;
        var a = inter(controls[i], controls[j]);
        if (a > 4) overlapCtrl.push(controls[i].name + " × " + controls[j].name + " = " + a + "px²");
      }
    }
    if (overlapCtrl.length) issues.push("触屏控件互相重叠: " + overlapCtrl.join(", "));

    var overlapHud = [];
    controls.forEach(function (c) {
      hud.forEach(function (h) {
        if (related(c, h)) return;
        var a = inter(c, h);
        if (a > 24) overlapHud.push(c.name + " × " + h.name + " = " + a + "px²");
      });
    });
    if (overlapHud.length) issues.push("控件压住 HUD: " + overlapHud.join(", "));

    var overlapSelf = [];
    for (var m = 0; m < hud.length; m++) {
      for (var n = m + 1; n < hud.length; n++) {
        if (hud[m].name === hud[n].name || related(hud[m], hud[n])) continue;
        var ar = inter(hud[m], hud[n]);
        if (ar > 900) overlapSelf.push(hud[m].name + " × " + hud[n].name + " = " + ar + "px²");
      }
    }
    if (overlapSelf.length) issues.push("HUD 互相重叠: " + overlapSelf.join(", "));

    // 战场净空：顶部状态条底边 -> 压到画面中部的控件顶边
    var topBottom = 0, ctrlTop = vp.h;
    hud.forEach(function (h) {
      if (h.name.indexOf("fighter-panel") < 0 && h.name.indexOf("center-readout") < 0) return;
      topBottom = Math.max(topBottom, h.bottom);
    });
    var zx0 = vp.w * 0.18, zx1 = vp.w * 0.82;
    controls.forEach(function (c) {
      if (c.right < zx0 || c.x > zx1) return;
      if (c.y < vp.h * 0.3) return;
      ctrlTop = Math.min(ctrlTop, c.y);
    });
    var freeH = Math.max(0, ctrlTop - topBottom);
    if (freeH < vp.h * 0.5) issues.push("战场净空过小: " + freeH + "px (" + Math.round(freeH / vp.h * 100) + "% 屏高，要求 ≥50%)");

    var covered = 0;
    controls.forEach(function (c) { covered += c.w * c.h; });
    var coverPct = Math.round(covered / (vp.w * vp.h) * 100);
    if (coverPct > 34) issues.push("控件遮挡面积过大: " + coverPct + "%");

    return {
      ok: issues.length === 0,
      viewport: { w: vp.w, h: vp.h, dpr: env.dpr, portrait: env.portrait, orientation: env.portrait ? "portrait" : "landscape" },
      env: env,
      tier: tier,
      perf: perfSnapshot(),
      hudClass: document.getElementById("hud") ? document.getElementById("hud").className : null,
      touchVisible: !!(host && !host.classList.contains("t-hidden")),
      controls: controls.map(brief),
      hud: hud.map(brief),
      freeViewH: freeH,
      coverPct: coverPct,
      issues: issues,
    };
  }

  /* ==========================================================================
     十、启动
     ========================================================================== */
  function bootMobile() {
    if (!isTouch) { syncBridge(); applyPerfTargets("桌面"); return; }
    document.documentElement.classList.add("is-touch");
    buildDOM();
    buildLegend();
    bindEvents();
    watchHints();
    if (env.portrait) host.classList.add("t-portrait");
    applyPerfTargets("启动");
    lastInteraction = nowMs();
    if (DEBUG) console.log("[mobile] 触屏层已启用 " + JSON.stringify(env) + " " + JSON.stringify(tier) + " __PR_MAX=" + window.__PR_MAX);
    var tries = 0;
    var timer = setInterval(safe(function () {
      tries++;
      if (window.__BOOT && window.__BOOT.ok === true) {
        clearInterval(timer);
        maybeShowRotateHint();
      } else if (tries > 200) clearInterval(timer);
    }), 250);
  }

  function rafLoop(now) {
    requestAnimationFrame(rafLoop);
    if (!lastNow) lastNow = now;
    var dt = (now - lastNow) / 1000;
    lastNow = now;
    if (dt > 0.5) dt = 0.5;      // 切后台回来别把统计带歪
    if (!isTouch || !host) return;
    try { syncUI(dt); } catch (e) { dbg.lastErr = String(e && (e.stack || e.message) || e); if (DEBUG) console.error("[mobile] syncUI", e); }
  }

  // 先起 rAF（必须早于 main.js 的 loop2），再建 DOM
  requestAnimationFrame(rafLoop);
  try { bootMobile(); } catch (e) { console.error("[mobile] 初始化失败", e); }

  /* 对外接口：验收工具 / 控制台调试 */
  window.__MOBILE = {
    get env() { return env; },
    get tier() { return tier; },
    get perf() { return perfSnapshot(); },
    get perfRaw() { return perf; },
    get stick() { return { active: stick.active, mx: stick.mx, mz: stick.mz }; },
    get touch() { return isTouch; },
    get dbg() { return dbg; },
    get dash() { return dashOn; },
    audit: audit,
    toast: toast,
    setScale: function (s) { perf.scale = Math.max(0.5, Math.min(1, +s || 1)); applyPerfTargets("手动"); },
    setPrMax: function (v) { perf.prBase = +v || 1; applyPerfTargets("手动"); },
    prMax: function () { return prTarget(); },
    showRotate: function () { buildRotateHint().classList.remove("t-hidden"); },
    hideRotate: hideRotateHint,
    /** 验收脚本用：直接注入摇杆模拟量，不必真的拖 */
    drive: function (mx, mz) { stick.active = !!Math.hypot(mx, mz); stick.mx = +mx || 0; stick.mz = +mz || 0; syncBridge(); },
    qualitySteps: qualitySteps,
  };
  return window.__MOBILE;
})();
