  var $ = (id) => document.getElementById(id);
  var GOJO_SPAWN = new Vector3(0, 0, 30);
  var SUKUNA_SPAWN = new Vector3(0, 0, -32);
  var CINE_GOJO = GOJO_SPAWN.clone();
  var CINE_SUKUNA = SUKUNA_SPAWN.clone();
  var FIGHT_GOJO = new Vector3(0, 0, 10);
  var FIGHT_SUKUNA = new Vector3(0, 0, -10);
  var QS = new URLSearchParams(location.search);
  var QUALITY4 = (() => {
    const forced = (QS.get("q") || QS.get("quality") || "").toLowerCase();
    if (forced === "low" || forced === "medium" || forced === "high") return forced;
    return detectQuality();
  })();
  var DEV = {
    noCine: QS.has("nocine"),
    fastCine: QS.has("fast"),
    debug: QS.has("debug")
  };
  /**
   * 后处理默认开启。
   * 原因：不走 composer 时，three.js 只在最终屏幕输出上做一次 ACES，叠加混合的特效
   * 亮度可达 3~10，会被整体压成纯白 —— 这是基线里「青白色冲爆全屏」的结构性根因，
   * 不是 bloom 参数问题。走 HDR 渲染目标 + composite 才能做完整的曝光保护。
   * 需要对比时用 ?post=0 关掉。
   */
  var POST_ON = QS.get("post") !== "0";
  var crashed = false;
  function crash(err) {
    if (crashed) return;
    crashed = true;
    const msg = err && (err.stack || err.message) || String(err);
    console.error("[新宿决战] 崩溃:", err);
    const box = $("crash");
    const pre = $("crash-msg");
    if (pre) pre.textContent = msg;
    if (box) box.classList.remove("hidden");
    const ld = $("loading");
    if (ld) ld.classList.add("hidden");
  }
  window.addEventListener("error", (e) => crash(e.error || e.message));
  /**
   * 未处理的 Promise 拒绝。
   * 全屏 / 音频播放 / 剪贴板这类"浏览器权限"拒绝是无害的，绝不能让它们弹崩溃面板——
   * 这曾经让手机点全屏直接显示 "TypeError: Permissions check failed" 并中断游戏。
   */
  window.addEventListener("unhandledrejection", (e) => {
    const r = e && e.reason;
    const msg = (r && (r.message || String(r))) || "";
    if (/Permissions check failed|fullscreen|play\(\) request was interrupted|NotAllowedError/i.test(msg)) {
      console.info("[新宿决战] 已忽略无害的权限拒绝:", msg);
      e.preventDefault?.();
      return;
    }
    crash(r);
  });
  $("btn-crash-reload")?.addEventListener("click", () => location.reload());
  var keys = /* @__PURE__ */ Object.create(null);
  var freshKeys = /* @__PURE__ */ new Set();
  var TRACKED = /* @__PURE__ */ new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyJ",
    "KeyK",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyH",
    "KeyG",
    "KeyL",
    "KeyQ",
    "Space",
    "ShiftLeft",
    "ShiftRight",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown"
  ]);
  window.addEventListener("keydown", (e) => {
    if (TRACKED.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    freshKeys.add(e.code);
    onKeyDown(e.code);
  });
  window.addEventListener("keyup", (e) => {
    if (TRACKED.has(e.code)) e.preventDefault();
    keys[e.code] = false;
  });
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
  });
  var mouse = { x: 0, y: 0, left: false, right: false, wheel: 0, moved: false, lastMoveT: 0 };
  var canvas = $("gl");
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.right = true;
    unlockAudio();
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (mouse.left || mouse.right) {
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (mouse.left) {
        cam.yaw -= dx * 55e-4;
        cam.pitch -= dy * 42e-4;
      }
      if (mouse.right) {
        cam.panX -= dx * 0.09 * (cam.dist / 60);
        cam.panZ -= dy * 0.09 * (cam.dist / 60);
      }
      mouse.moved = true;
    }
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    mouse.wheel += Math.sign(e.deltaY);
  }, { passive: false });
  var render = null;
  var city = null;
  var fx = null;
  var weapons = null;
  var audio = null;
  var gojo = null;
  var sukuna = null;
  var combat = null;
  var cutscene = null;
  var scene = new Scene();
  // 相机（godCam / activeCam / cam）已抽到 src/camera.js
  var flashEl = null;
  var state = "loading";
  var prevState = "title";
  var matchTime = 0;
  var hitstop = 0;
  var slowmo = 0;
  var realT = 0;
  var gameT = 0;
  var stats2 = { hits: 0, blackFlash: 0, maxCombo: 0, dmgDealt: 0, dmgTaken: 0, clashWins: 0, time: 0 };
  var audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked || !audio) return;
    audioUnlocked = true;
    try {
      audio.unlock();
    } catch (e) {
      console.warn("audio unlock failed", e);
    }
    audio?.play?.("ui_confirm");
    audio?.loop?.("music_intro", { fadeIn: 2 });
  }
  window.addEventListener("pointerdown", unlockAudio, { once: false });
  var bgmEl = null;
  var bgmPlaying = false;
  function bgm() {
    if (bgmEl === null) bgmEl = $("bgm") || false;
    return bgmEl || null;
  }
  function setBgmVolume(v) {
    const el = bgm();
    if (el) el.volume = Math.max(0, Math.min(1, v));
  }
  /**
   * 启动 BGM（唯一的权威入口，单文件版与站点版都走这里）。
   *
   * ⚠ 这里踩过一个非常隐蔽的坑，正是用户报的「BGM 加载有问题」：
   *   旧实现里 el.play() 一旦抛异常（移动端音频尚未就绪时是常态），p 就是 null，
   *   于是走 else 分支把 bgmPlaying 直接置成 true —— **"失败"被当成了"已播放"**，
   *   之后用户再怎么点都不会重试，BGM 就永久哑掉了，而且控制台一片安静。
   *   现在：只有真正在播放才算成功；任何失败都保持可重试，下一次手势自动重来
   *   （那时音频多半已经下载好，成功率高得多）。
   */
  function startBGM() {
    const el = bgm();
    if (!el || bgmPlaying) return;
    // 站点版：音频走 data-src 外链，首次交互才真正开始下载
    if (!el.getAttribute("src") && el.dataset && el.dataset.src) {
      el.src = el.dataset.src;
    }
    el.loop = true;
    const slider = $("vol-music");
    setBgmVolume(slider ? Number(slider.value) / 100 : 0.55);
    let p = null;
    try {
      p = el.play();
    } catch (e) {
      p = null;
    }
    if (p && typeof p.then === "function") {
      p.then(() => {
        bgmPlaying = true;
      }).catch((e) => {
        // 保持 bgmPlaying=false → 下一次任意手势会再试一次
        console.info("[新宿决战] BGM 首播未成功，将在下次交互重试:", e && e.name);
      });
    } else if (!el.paused) {
      // 老浏览器同步返回 play()：必须核对实际播放状态，不能凭空认为成功
      bgmPlaying = true;
    }
  }
  // 四种手势都监听：移动端不同浏览器派发的事件不一样，少一个就有一批用户没声音
  window.addEventListener("pointerdown", startBGM, { passive: true });
  window.addEventListener("touchstart", startBGM, { passive: true });
  window.addEventListener("keydown", startBGM, { passive: true });
  window.addEventListener("click", startBGM, { passive: true });
  /** 诊断口：BGM 状态一眼可见（排查"没声音"这类问题时不用再猜） */
  window.__BGM_STATE = function () {
    const el = bgm();
    if (!el) return { missing: true };
    return {
      playing: bgmPlaying, paused: el.paused, volume: el.volume,
      readyState: el.readyState, networkState: el.networkState,
      src: (el.getAttribute("src") || "").slice(0, 32),
      hasDataSrc: !!(el.dataset && el.dataset.src),
      error: el.error ? { code: el.error.code, message: el.error.message } : null,
    };
  };
  function onKeyDown(code) {
    switch (code) {
      case "Escape":
      case "KeyP":
        if (state === "fight" || state === "clash") pauseGame();
        else if (state === "paused") resumeGame();
        break;
      case "KeyR":
        if (state !== "loading" && state !== "cutscene") restartMatch();
        break;
      case "KeyF":
        toggleFullscreen();
        break;
      case "KeyQ":
        cam.lockOn = !cam.lockOn;
        break;
      case "Space":
        if (state === "cutscene") skipCutscene();
        break;
    }
  }
  /**
   * 全屏切换。
   * ⚠ 必须 catch：requestFullscreen() 返回 Promise，在权限被拒（手机浏览器常见，
   * 尤其是非用户手势触发、或 WebView/iframe 里）会 reject 成
   * "TypeError: Permissions check failed" 并冒泡成未处理异常，被 main.js 的
   * unhandledrejection 监听捕获后直接弹出「运行出错」崩溃面板。
   */
  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        const p = document.documentElement.requestFullscreen?.();
        if (p && p.catch) p.catch((e) => console.info("[新宿决战] 全屏被拒绝，继续窗口模式:", e && e.message));
      } else {
        const p = document.exitFullscreen?.();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      console.info("[新宿决战] 全屏不可用:", e && e.message);
    }
  }
  var ui = {};
  function cacheUI() {
    const ids = [
      "hud",
      "hp-gojo",
      "hp-gojo-ghost",
      "tech-gojo",
      "dom-gojo",
      "burnout-gojo",
      "hp-sukuna",
      "hp-sukuna-ghost",
      "dom-sukuna",
      "wheel",
      "combo",
      "timer",
      "phase-tag",
      "ability-bar",
      "clash",
      "clash-fill-gojo",
      "clash-fill-sukuna",
      "clash-pin",
      "banner",
      "hints",
      "caption",
      "cine-ui",
      "cine-bar",
      "lowhp",
      "title",
      "pause",
      "result",
      "loading",
      "loading-step",
      "result-mark",
      "result-title",
      "result-sub",
      "result-stats"
    ];
    for (const id of ids) ui[id] = $(id);
    ui.hud = $("hud");
    ui.captionMain = document.querySelector("#caption .cap-main");
    ui.captionSub = document.querySelector("#caption .cap-sub");
    ui.domBars = { gojo: ui["dom-gojo"]?.parentElement, sukuna: ui["dom-sukuna"]?.parentElement };
  }
  var abilityEls = /* @__PURE__ */ new Map();
  var ABILITY_META = {
    [SKILL.BLUE]: { key: "U", glyph: "蒼", label: "苍" },
    [SKILL.RED]: { key: "I", glyph: "赫", label: "赫" },
    [SKILL.PURPLE]: { key: "O", glyph: "茈", label: "茈", charged: true },
    [SKILL.REVERSE]: { key: "H", glyph: "反", label: "反转" },
    [SKILL.DOMAIN_VOID]: { key: "G", glyph: "領", label: "无量空处" },
    [SKILL.PURPLE_200]: { key: "L", glyph: "二", label: "200% 茈", charged: true }
  };
  function buildAbilityBar(skills) {
    const bar = ui["ability-bar"];
    if (!bar || !skills) return;
    bar.innerHTML = "";
    abilityEls.clear();
    for (const s of skills) {
      const meta = ABILITY_META[s.skill];
      if (!meta) continue;
      const el = document.createElement("div");
      el.className = "ab";
      el.dataset.skill = s.skill;
      el.innerHTML = `<span class="ab-key">${meta.key}</span><span class="ab-cost">${s.cost > 0 ? s.cost : ""}</span><span class="ab-glyph">${meta.glyph}</span><span class="ab-name">${meta.label}</span><span class="ab-cd"></span><span class="ab-cd-num"></span>`;
      bar.appendChild(el);
      abilityEls.set(s.skill, {
        el,
        cd: el.querySelector(".ab-cd"),
        num: el.querySelector(".ab-cd-num"),
        charged: !!meta.charged
      });
    }
  }
  async function boot() {
    if (window.__BOOT) window.__BOOT.ok = "running";
    const step = (s) => {
      const el = $("loading-step");
      if (el) el.textContent = s;
      if (window.__BOOT) window.__BOOT.step = s;
    };
    const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
    cacheUI();
    flashEl = $("flash");
    step("检测图形环境");
    await yieldFrame();
    const postOn = POST_ON;
    render = createRender({
      canvas,
      quality: QUALITY4,
      hdr: QS.get("hdr") !== "0",
      post: postOn
    });
    step("生成新宿废墟");
    await yieldFrame();
    city = createCity({ quality: QUALITY4 });
    scene.add(city.group);
    step("构建术式特效");
    await yieldFrame();
    fx = createFX(scene, godCam, { quality: QUALITY4 });
    weapons = createWeapons(scene, fx, { quality: QUALITY4 });
    step("合成咒力音频");
    await yieldFrame();
    audio = createAudio({ quality: QUALITY4 });
    step("召唤术师");
    await yieldFrame();
    gojo = createFighter(SIDE.GOJO, { quality: QUALITY4 });
    sukuna = createFighter(SIDE.SUKUNA, { quality: QUALITY4 });
    scene.add(gojo.root, sukuna.root);
    gojo.setPos(GOJO_SPAWN.x, 0, GOJO_SPAWN.z);
    sukuna.setPos(SUKUNA_SPAWN.x, 0, SUKUNA_SPAWN.z);
    gojo.faceTo(SUKUNA_SPAWN.x, SUKUNA_SPAWN.z, true);
    sukuna.faceTo(GOJO_SPAWN.x, GOJO_SPAWN.z, true);
    step("展开战场逻辑");
    await yieldFrame();
    combat = createCombat({ scene, fx, weapons, audio, city, gojo, sukuna, camera: godCam, quality: QUALITY4, render });
    buildAbilityBar(combat.getSnapshot().skills);
    step("编排分镜");
    await yieldFrame();
    cutscene = createCutscene({
      scene,
      city,
      gojo,
      sukuna,
      fx,
      weapons,
      audio,
      quality: QUALITY4,
      aspect: window.innerWidth / Math.max(1, window.innerHeight),
      onEvent: onCutsceneEvent
    });
    step("预热");
    await yieldFrame();
    warmUp();
    camInit();
    applyResize();
    window.addEventListener("resize", applyResize);
    bindUI();
    $("loading")?.classList.add("hidden");
    if (window.__BOOT) {
      window.__BOOT.ok = true;
      window.__BOOT.step = "完成";
    }
    gotoTitle();
    requestAnimationFrame(loop2);
  }
  function warmUp() {
    try {
      applyResize();
      for (let i = 0; i < 3; i++) render.render(scene, godCam, 1 / 60);
    } catch (e) {
      console.warn("warmup failed", e);
    }
  }
  function applyResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect2 = w / Math.max(1, h);
    camApplyAspect(aspect2);
    if (cutscene?.camera) {
      cutscene.camera.aspect = aspect2;
      cutscene.camera.updateProjectionMatrix();
    }
    /**
     * 像素比上限：手机 DPR 常为 3，直接按 3 倍分辨率渲染必然掉帧。
     * __PR_MAX 由 src/mobile.js 按设备档位写入；桌面默认 2 —— 1600x900@DPR1 不受影响。
     */
    const prMax = window.__PR_MAX || 2;
    const pr = Math.min(window.devicePixelRatio || 1, prMax);
    render.resize(w, h, pr);
    fx?.setViewportSize?.(h * Math.min(pr, QUALITY4 === "low" ? 1 : 1.5));
  }
  function show(el, on = true) {
    if (!el) return;
    el.classList.toggle("hidden", !on);
  }
  function gotoTitle() {
    state = "title";
    activeCam = godCam;
    if (ui.hud) ui.hud.classList.add("hidden");
    show(ui.title, true);
    show(ui.pause, false);
    show(ui.result, false);
    camToTitle();
    combat?.setAiEnabled(false);
    audio?.loop?.("music_intro", { fadeIn: 2.5 });
  }
  function startMatch(withCutscene) {
    unlockAudio();
    show(ui.title, false);
    show(ui.result, false);
    show(ui.pause, false);
    if (ui.hud) ui.hud.classList.remove("hidden");
    combat.reset();
    weapons.clear();
    fx.clear();
    resetStats();
    matchTime = 0;
    gameT = 0;
    if (withCutscene && !DEV.noCine) {
      placeFighters(CINE_GOJO, CINE_SUKUNA);
      cutscene.reset();
      state = "cutscene";
      activeCam = cutscene.camera;
      combat.setAiEnabled(false);
      combat.setInvincible(SIDE.GOJO, true);
      combat.setInvincible(SIDE.SUKUNA, true);
      camSaveForCine();
      ui.hud?.classList.add("cinema");
      show(ui["cine-ui"], true);
      show(ui.caption, false);
      show(ui.clash, false);
      audio.loop("music_intro", { fadeIn: 1.2 });
    } else {
      placeFighters(FIGHT_GOJO, FIGHT_SUKUNA);
      beginFight();
    }
  }
  function placeFighters(a, b) {
    gojo.setPos(a.x, 0, a.z);
    sukuna.setPos(b.x, 0, b.z);
    gojo.faceTo(b.x, b.z, true);
    sukuna.faceTo(a.x, a.z, true);
  }
  function beginFight() {
    state = "fight";
    activeCam = godCam;
    combat.setAiEnabled(true);
    combat.setInvincible(SIDE.GOJO, false);
    combat.setInvincible(SIDE.SUKUNA, false);
    combat.setMode("fight");
    placeFighters(FIGHT_GOJO, FIGHT_SUKUNA);
    ui.hud?.classList.remove("cinema");
    show(ui["cine-ui"], false);
    show(ui.caption, false);
    camToFight();
    audio.loop("music_battle", { fadeIn: 1.5 });
    banner("— 决战开始 —", 1.6);
    showHints();
    matchTime = performance.now();
  }
  function showHints() {
    combat.tutorialHint("dodge", true);
    setTimeout(() => combat.tutorialHint("purple", true), 9e3);
    setTimeout(() => combat.tutorialHint("domain", true), 2e4);
  }
  function resetStats() {
    stats2.hits = 0;
    stats2.blackFlash = 0;
    stats2.maxCombo = 0;
    stats2.dmgDealt = 0;
    stats2.dmgTaken = 0;
    stats2.clashWins = 0;
    stats2.time = 0;
    lastHP = { gojo: 0, sukuna: 0 };
    shownCombo = 0;
  }
  function pauseGame() {
    if (state !== "fight" && state !== "clash") return;
    prevState = state;
    state = "paused";
    show(ui.pause, true);
    audio.play("ui_back");
  }
  function resumeGame() {
    if (state !== "paused") return;
    state = prevState;
    show(ui.pause, false);
    audio.play("ui_confirm");
  }
  function endMatch(win) {
    state = win ? "victory" : "defeat";
    audio.stop("music_battle");
    audio.stop("music_domain");
    audio.play(win ? "victory" : "defeat");
    audio.loop(win ? "music_final" : "music_intro", { fadeIn: 1 });
    fx.screen({ desaturate: win ? 0.15 : 0.5, vignette: 0.6, flash: 0.5, color: win ? C.CYAN : C.CRIMSON, chroma: 1.6, shake: 0.8, life: 3 });
    stats2.time = (performance.now() - matchTime) / 1e3;
    setTimeout(() => {
      show(ui.result, true);
      const mark = ui["result-mark"];
      mark.textContent = win ? "勝" : "敗";
      mark.classList.toggle("lose", !win);
      ui["result-title"].textContent = win ? "五条悟 · 胜" : "五条悟 · 败";
      ui["result-sub"].textContent = win ? "宿傩的咒力残秽正在消散。新宿上空，只剩一个人还站着。" : "无下限被破解了。宿傩的斩击，连空间本身都切开了。";
      ui["result-stats"].innerHTML = `
      <div><span>用时</span><b>${fmtTime(stats2.time)}</b></div>
      <div><span>最高连击</span><b>${stats2.maxCombo}</b></div>
      <div><span>黑闪</span><b>${stats2.blackFlash}</b></div>
      <div><span>造成伤害</span><b>${Math.round(stats2.dmgDealt)}</b></div>
      <div><span>承受伤害</span><b>${Math.round(stats2.dmgTaken)}</b></div>
      <div><span>领域对决胜</span><b>${stats2.clashWins}</b></div>`;
    }, 3400);
  }
  function restartMatch() {
    show(ui.pause, false);
    show(ui.result, false);
    startMatch(state === "title");
  }
  function returnToTitle() {
    state = "title";
    show(ui.pause, false);
    show(ui.result, false);
    weapons.clear();
    fx.clear();
    gotoTitle();
  }
  function onCutsceneEvent(name, data) {
    switch (name) {
      case "caption":
        if (data && data.text) {
          ui.captionMain.textContent = data.text;
          ui.captionSub.textContent = data.sub || "";
          show(ui.caption, true);
          ui.captionMain.style.animation = "none";
          ui.captionSub.style.animation = "none";
          void ui.captionMain.offsetWidth;
          ui.captionMain.style.animation = "";
          ui.captionSub.style.animation = "";
        }
        break;
      case "city_thrash":
      case "city_collapse": {
        const idx = cutscene.getDeadBuildings();
        const list = city.buildings;
        let done = 0;
        for (const i of idx) {
          if (done >= (name === "city_collapse" ? 14 : 4)) break;
          const b = list[i];
          if (b && !b.destroyed) {
            b.destroy();
            done++;
          }
        }
        fx.groundRing({
          pos: new Vector3(0, 0, name === "city_collapse" ? -31 : 0),
          color: C.NEON_AMBER,
          color2: C.CONCRETE2,
          maxRadius: name === "city_collapse" ? 150 : 40,
          life: 1.8,
          thickness: 4
        });
        break;
      }
      case "impact":
        stats2.dmgDealt += SKILL_DATA[SKILL.PURPLE_200].dmg;
        break;
      case "end":
        if (state === "cutscene") {
          applyDamageSafe(SIDE.SUKUNA, 420, { silent: true });
          beginFight();
        }
        break;
    }
  }
  function skipCutscene() {
    if (state !== "cutscene") return;
    cutscene.skip();
    const idx = cutscene.getDeadBuildings();
    for (const i of idx.slice(0, 40)) {
      const b = city.buildings[i];
      if (b && !b.destroyed) b.destroy();
    }
    applyDamageSafe(SIDE.SUKUNA, 380, { silent: true });
    banner("宿傩 · 右臂被『茈』湮灭", 2.4);
    beginFight();
  }
  function applyDamageSafe(side, amount, opts) {
    try {
      combat.applyDamage(side, amount, opts);
    } catch (e) {
      console.warn("applyDamage failed", e);
    }
  }
  var lastHP = { gojo: 0, sukuna: 0 };
  var shownCombo = 0;
  var bannerTimer = 0;
  var ghostHP = { gojo: 1, sukuna: 1 };
  function banner(text, dur = 2) {
    ui.banner.textContent = text;
    ui.banner.classList.add("show");
    bannerTimer = dur;
  }
  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  function setBar(el, ratio) {
    if (!el) return;
    const r = Math.max(0, Math.min(1, ratio));
    el.style.transform = `scaleX(${r})`;
  }
  function updateHUD(dt, snap) {
    if (!snap) return;
    setBar(ui["hp-gojo"], snap.gojo.hp / snap.gojo.hpMax);
    setBar(ui["tech-gojo"], snap.gojo.ce / snap.gojo.ceMax);
    setBar(ui["hp-sukuna"], snap.sukuna.hp / snap.sukuna.hpMax);
    setBar(ui["dom-gojo"], snap.gojo.domain / 100);
    setBar(ui["dom-sukuna"], snap.sukuna.domain / 100);
    ghostHP.gojo = Math.max(snap.gojo.hp / snap.gojo.hpMax, ghostHP.gojo - dt * 0.42);
    ghostHP.sukuna = Math.max(snap.sukuna.hp / snap.sukuna.hpMax, ghostHP.sukuna - dt * 0.42);
    if (snap.gojo.hp / snap.gojo.hpMax > ghostHP.gojo) ghostHP.gojo = snap.gojo.hp / snap.gojo.hpMax;
    if (snap.sukuna.hp / snap.sukuna.hpMax > ghostHP.sukuna) ghostHP.sukuna = snap.sukuna.hp / snap.sukuna.hpMax;
    setBar(ui["hp-gojo-ghost"], ghostHP.gojo);
    setBar(ui["hp-sukuna-ghost"], ghostHP.sukuna);
    ui.domBars.gojo?.classList.toggle("ready", snap.gojo.domain >= 100);
    ui.domBars.sukuna?.classList.toggle("ready", snap.sukuna.domain >= 100);
    if (snap.combo >= 2) {
      const b = ui.combo.querySelector("b");
      if (b) b.textContent = String(snap.combo);
      ui.combo.classList.add("show");
      if (snap.combo > stats2.maxCombo) stats2.maxCombo = snap.combo;
    } else {
      ui.combo.classList.remove("show");
    }
    const ph = ["", "第一形态", "第二形态", "真身 · 摩虚罗适应"][snap.phase] || "第一形态";
    ui["phase-tag"].textContent = `宿傩 · ${ph}`;
    const wheelOn = snap.phase >= 3;
    ui.wheel.classList.toggle("hidden", !wheelOn);
    for (const s of snap.skills) {
      const a = abilityEls.get(s.skill);
      if (!a) continue;
      const cdRatio = s.cdMax > 0 ? s.cd / s.cdMax : 0;
      a.cd.style.transform = `scaleY(${Math.max(0, Math.min(1, cdRatio))})`;
      a.num.textContent = s.cd > 0.05 ? s.cd.toFixed(1) : "";
      a.el.classList.toggle("cooling", s.cd > 0.05);
      a.el.classList.toggle("ready", s.ready && s.cd <= 0.05);
      a.el.classList.toggle("disabled", !s.ready && s.cd <= 0.05);
      if (s.skill === SKILL.DOMAIN_VOID) {
        a.el.classList.toggle("charged", snap.gojo.domain >= 100);
      }
    }
    const p2 = abilityEls.get(SKILL.PURPLE_200);
    if (p2) {
      p2.el.classList.toggle("charged", snap.chargeT > 0.02);
      p2.el.classList.toggle("ready", snap.chargeT <= 0.02);
    }
    const burnout = snap.gojo.burnout > 0;
    show(ui["burnout-gojo"], burnout);
    if (burnout) ui["burnout-gojo"].textContent = `术式熔断 ${snap.gojo.burnout.toFixed(1)}s`;
    const inClash = !!snap.clashActive;
    show(ui.clash, inClash);
    if (inClash) {
      const t = Math.max(-1, Math.min(1, snap.tug));
      const pin = 50 + t * 46;
      ui["clash-pin"].style.left = pin + "%";
      ui["clash-fill-gojo"].style.transform = `scaleX(${Math.max(0.04, (t + 1) / 2)})`;
      ui["clash-fill-sukuna"].style.transform = `scaleX(${Math.max(0.04, (1 - t) / 2)})`;
    }
    const low = snap.gojo.hp / snap.gojo.hpMax;
    ui.lowhp.classList.toggle("on", low < 0.28 && !snap.gojo.dead);
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) ui.banner.classList.remove("show");
    }
    if (state === "cutscene" && cutscene) {
      ui["cine-bar"].style.width = (cutscene.progress * 100).toFixed(1) + "%";
    }
  }
  var inputSnapshot = {
    moveX: 0,
    moveZ: 0,
    camX: 0,
    camY: 0,
    zoom: 0,
    light: false,
    heavy: false,
    blue: false,
    red: false,
    purple: false,
    heal: false,
    dodge: false,
    dash: false,
    domain: false,
    lockOn: false,
    charge: false,
    mouse: { x: 0, y: 0, pressed: false, released: false }
  };
  function buildInput(dt) {
    const k = keys;
    const ax = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const az = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
    /**
     * 触屏摇杆桥：src/mobile.js 把虚拟摇杆的模拟量写进 window.__TOUCH。
     * 摇杆激活时以摇杆为准（模拟量能做出 8 方向之外的走位）；
     * 未激活时完全走键盘，键鼠行为与改动前逐字节一致。
     * 按键类动作（轻击/术式/闪避…）不在这里处理 —— mobile.js 直接写 keys/freshKeys。
     */
    const T = window.__TOUCH;
    const useTouch = !!(T && T.on);
    if (useTouch && T.camX) cam.yaw -= T.camX * dt * 1.35;
    if (useTouch && T.camY) cam.pitch += T.camY * dt * 0.95;
    const cx = useTouch ? (T.camX || 0) : (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
    const cy = useTouch ? (T.camY || 0) : (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    if (!useTouch) {
      if (cx) cam.yaw -= cx * dt * 1.35;
      if (cy) cam.pitch += cy * dt * 0.95;
    }
    cam.pitch = Math.max(0.16, Math.min(1.47, cam.pitch));
    inputSnapshot.moveX = useTouch ? (T.mx || 0) : ax;
    inputSnapshot.moveZ = useTouch ? (T.mz || 0) : az;
    inputSnapshot.camX = cx;
    inputSnapshot.camY = cy;
    inputSnapshot.zoom = mouse.wheel;
    mouse.wheel = 0;
    inputSnapshot.light = freshKeys.has("KeyJ");
    inputSnapshot.heavy = freshKeys.has("KeyK");
    inputSnapshot.blue = freshKeys.has("KeyU");
    inputSnapshot.red = freshKeys.has("KeyI");
    inputSnapshot.heal = freshKeys.has("KeyH");
    inputSnapshot.dodge = freshKeys.has("Space");
    inputSnapshot.domain = freshKeys.has("KeyG");
    inputSnapshot.lockOn = freshKeys.has("KeyQ");
    inputSnapshot.dash = !!(k.ShiftLeft || k.ShiftRight);
    inputSnapshot.purple = !!k.KeyO;
    inputSnapshot.charge = !!k.KeyL;
    inputSnapshot.mouse.x = mouse.x;
    inputSnapshot.mouse.y = mouse.y;
    inputSnapshot.mouse.pressed = mouse.left;
    inputSnapshot.mouse.released = !mouse.left;
  }
  // updateGodCam / camMoveTarget / camDesired / clampNum2 已移到 src/camera.js
  var lastNow = 0;
  var fpsAcc = 0;
  var fpsN = 0;
  var fps = 60;
  function loop2(now2) {
    requestAnimationFrame(loop2);
    if (crashed) return;
    if (!lastNow) lastNow = now2;
    let dt = (now2 - lastNow) / 1e3;
    lastNow = now2;
    if (dt > 0.1) dt = 0.1;
    realT += dt;
    fpsAcc += dt;
    fpsN++;
    if (fpsAcc > 0.5) {
      fps = fpsN / fpsAcc;
      fpsAcc = 0;
      fpsN = 0;
    }
    let scale = 1;
    if (state === "paused") scale = 0;
    else if (state === "cutscene") scale = DEV.fastCine ? 4 : 1;
    else if (slowmo > 0) {
      scale = 0.22;
      slowmo -= dt;
    } else if (hitstop > 0) {
      scale = 0;
      hitstop -= dt;
    }
    const sdt = dt * scale;
    gameT += sdt;
    buildInput(dt);
    const freezeReq = fx?.screenState?.freeze || 0;
    if (freezeReq > 0) {
      hitstop = Math.max(hitstop, freezeReq);
      fx.screenState.freeze = 0;
    }
    try {
      city.update(gameT, sdt);
      if (state === "cutscene" && cutscene) {
        cutscene.update(sdt);
      }
      if (combat && (state === "fight" || state === "clash" || state === "victory" || state === "defeat")) {
        combat.update(inputSnapshot, sdt, gameT);
      } else if (combat && (state === "title" || state === "paused" || state === "cutscene")) {
        combat.update(EMPTY_INPUT, 0, gameT);
      }
      gojo.update(sdt);
      sukuna.update(sdt);
      weapons.update(gameT, sdt);
      fx.update(gameT, sdt);
      audio.update(gameT, sdt);
    } catch (e) {
      crash(e);
      return;
    }
    const snap = combat ? safeSnapshot() : null;
    afterUpdate(snap, dt);
    if (state === "cutscene" && cutscene) {
      activeCam = cutscene.camera;
    } else {
      activeCam = godCam;
      updateGodCam(dt, snap);
    }
    render.pullFromFX(fx, dt);
    render.updateFX(dt);
    if (slowmo > 0) render.impulse({ chroma: 1.6, radialBlur: 0.22 });
    if (snap && !snap.gojo.dead && snap.gojo.hp / snap.gojo.hpMax < 0.3) {
      render.impulse({ vignette: 0.34, desaturate: 0.12, color: C.CRIMSON });
    }
    if (snap && snap.clashActive) render.impulse({ chroma: 0.9, vignette: 0.3 });
    /**
     * 无后处理时的 DOM 闪光兜底（?post=0 才走这里）。
     * 强度从 0.72 降到 0.32：原来满强度会把整个 HUD 一起糊掉。
     * 用可选链保护，避免 render.js 结构演进时这里连带崩溃。
     */
    if (!POST_ON && flashEl) {
      const fu = render?.composite?.uniforms;
      const f = fu && fu.uFlash ? Math.min(1, fu.uFlash.value) : 0;
      if (f > 4e-3 && fu.uFlashColor) {
        const c = fu.uFlashColor.value;
        flashEl.style.background = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
        flashEl.style.opacity = String(f * 0.32);
      } else if (flashEl.style.opacity !== "0") {
        flashEl.style.opacity = "0";
      }
    }
    render.render(scene, activeCam, dt);
    updateHUD(dt, snap);
    if (DEV.debug) debugOverlay(snap);
    freshKeys.clear();
  }
  var EMPTY_INPUT = {
    moveX: 0,
    moveZ: 0,
    camX: 0,
    camY: 0,
    zoom: 0,
    light: false,
    heavy: false,
    blue: false,
    red: false,
    purple: false,
    heal: false,
    dodge: false,
    dash: false,
    domain: false,
    lockOn: false,
    charge: false,
    mouse: { x: 0, y: 0, pressed: false, released: false }
  };
  function safeSnapshot() {
    try {
      return combat.getSnapshot();
    } catch (e) {
      crash(e);
      return null;
    }
  }
  function afterUpdate(snap, dt) {
    if (!snap) return;
    if (Array.isArray(snap.events) && snap.events.length) {
      for (const ev of snap.events) handleCombatEvent(ev);
    }
    const inClash = !!snap.clashActive;
    if (inClash && state === "fight") {
      state = "clash";
      ui.hud?.classList.add("cinema");
      audio.loop("music_domain", { fadeIn: 0.8 });
      audio.play("domain_clash");
      render.impulse({ flash: 0.85, color: C.VIOLET, shake: 1.4, chroma: 2.2, radialBlur: 0.4 });
    } else if (!inClash && state === "clash") {
      state = "fight";
      ui.hud?.classList.remove("cinema");
      audio.loop("music_battle", { fadeIn: 1 });
      const won = snap.tug > 0;
      if (won) stats2.clashWins++;
      render.impulse({ flash: 0.9, color: won ? C.CYAN : C.CRIMSON, shake: 2, chroma: 2.4, radialBlur: 0.5 });
      slowmo = 1.3;
      banner(won ? "无量空处 压倒 伏魔御厨子" : "无量空处 被击破 —— 术式熔断", 2.8);
    }
    const domChanged = snap.gojoDomain !== lastDomain.gojo || snap.sukunaDomain !== lastDomain.sukuna;
    if (domChanged) {
      if (snap.gojoDomain) {
        render.impulse({ flash: 0.75, color: C.CYAN, shake: 1.3, chroma: 2, radialBlur: 0.36, bloom: 1.7 });
        audio.play("domain_void");
        slowmo = Math.max(slowmo, 0.9);
      }
      if (snap.sukunaDomain) {
        render.impulse({ flash: 0.75, color: C.CRIMSON, shake: 1.3, chroma: 2, radialBlur: 0.36, bloom: 1.7 });
        audio.play("domain_shrine");
        slowmo = Math.max(slowmo, 0.9);
      }
      lastDomain.gojo = snap.gojoDomain;
      lastDomain.sukuna = snap.sukunaDomain;
    }
    if (lastHP.sukuna && snap.sukuna.hp < lastHP.sukuna) stats2.dmgDealt += lastHP.sukuna - snap.sukuna.hp;
    if (lastHP.gojo && snap.gojo.hp < lastHP.gojo) stats2.dmgTaken += lastHP.gojo - snap.gojo.hp;
    lastHP.gojo = snap.gojo.hp;
    lastHP.sukuna = snap.sukuna.hp;
    if (snap.sukuna.dead && state !== "victory" && state !== "defeat") endMatch(true);
    else if (snap.gojo.dead && state !== "victory" && state !== "defeat") endMatch(false);
  }
  var lastDomain = { gojo: null, sukuna: null };
  function handleCombatEvent(ev) {
    switch (ev.type) {
      case "blackflash":
        stats2.blackFlash++;
        stats2.hits += 1;
        slowmo = Math.max(slowmo, 0.5);
        render.impulse({ flash: 0.85, color: C.GOLD, shake: 1.5, chroma: 2.6, radialBlur: 0.42 });
        audio.play("blackflash");
        break;
      case "hit":
        stats2.hits += 1;
        break;
      case "clash_win":
        stats2.clashWins++;
        break;
      case "skill":
        if (ev.skill === SKILL.PURPLE) render.impulse({ chroma: 1.4, radialBlur: 0.2, bloom: 1.5 });
        if (ev.skill === SKILL.RED) render.impulse({ shake: 0.5, chroma: 0.8 });
        break;
      case "banner":
        if (ev.text) banner(ev.text, ev.dur || 2.2);
        break;
      case "building_down":
        render.impulse({ shake: 0.25 });
        break;
    }
  }
  var dbgEl = null;
  function debugOverlay(snap) {
    if (!dbgEl) {
      dbgEl = document.createElement("div");
      dbgEl.style.cssText = "position:fixed;left:8px;top:8px;z-index:70;font:11px/1.5 monospace;color:#0f0;background:rgba(0,0,0,.7);padding:6px 8px;white-space:pre;pointer-events:none";
      document.body.appendChild(dbgEl);
    }
    const info = render.renderer.info;
    dbgEl.textContent = `state=${state} fps=${fps.toFixed(0)} q=${QUALITY4}
draws=${info.render.calls} tris=${(info.render.triangles / 1e3).toFixed(0)}k
gojo hp=${snap.gojo.hp.toFixed(0)} ce=${snap.gojo.ce.toFixed(0)} dom=${snap.gojo.domain.toFixed(0)}
suku hp=${snap.sukuna.hp.toFixed(0)} ph=${snap.phase} dom=${snap.sukuna.domain.toFixed(0)}
dist=${snap.distance.toFixed(1)} combo=${snap.combo} tug=${snap.tug.toFixed(2)}
clash=${snap.clashActive} mode=${snap.mode} cam=${cam.dist.toFixed(0)}`;
    info.reset();
  }
  function bindUI() {
    $("btn-start")?.addEventListener("click", () => {
      audio.play("ui_confirm");
      startMatch(true);
    });
    $("btn-skip-cine")?.addEventListener("click", () => {
      audio.play("ui_confirm");
      startMatch(false);
    });
    $("btn-resume")?.addEventListener("click", resumeGame);
    $("btn-restart")?.addEventListener("click", () => {
      audio.play("ui_confirm");
      restartMatch();
    });
    $("btn-totitle")?.addEventListener("click", () => {
      audio.play("ui_back");
      returnToTitle();
    });
    $("btn-again")?.addEventListener("click", () => {
      audio.play("ui_confirm");
      restartMatch();
    });
    $("btn-back")?.addEventListener("click", () => {
      audio.play("ui_back");
      returnToTitle();
    });
    const vol = (id, labelId, fn) => {
      const el = $(id), lab = $(labelId);
      if (!el) return;
      el.addEventListener("input", () => {
        const v = Number(el.value) / 100;
        if (lab) lab.textContent = el.value;
        fn(v);
      });
    };
    vol("vol-master", "vol-master-label", (v) => audio.setMaster(v));
    vol("vol-music", "vol-music-label", (v) => {
      audio.setMusic(v);
      setBgmVolume(v);
    });
    vol("vol-sfx", "vol-sfx-label", (v) => audio.setSfx(v));
    document.addEventListener("pointerdown", unlockAudio, { once: true });
  }
  boot().catch(crash);
  window.__SS = {
    get state() {
      return state;
    },
    get snap() {
      return combat ? combat.getSnapshot() : null;
    },
    cam,
    scene,
    godCam,
    get activeCamera() {
      return activeCam;
    },
    get combat() {
      return combat;
    },
    get fx() {
      return fx;
    },
    get weapons() {
      return weapons;
    },
    get audio() {
      return audio;
    },
    get city() {
      return city;
    },
    get render() {
      return render;
    },
    get cutscene() {
      return cutscene;
    },
    get gojo() {
      return gojo;
    },
    get sukuna() {
      return sukuna;
    },
    get quality() {
      return QUALITY4;
    },
    get stats() {
      return stats2;
    }
  };
})();