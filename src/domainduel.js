/**
 * ============================================================================
 * 领域对决「术式同步」 · src/domainduel.js（domainduel 写域，契约 §5）
 * ----------------------------------------------------------------------------
 * 【用户原话】「领域对决对玩家太简单了，需要加入一些新的机制，让领域对决需要更准的
 *   操作来对齐，不然就会失败。」
 *
 * 【旧版】两个领域对撞 → 底部一条拉锯条 → 玩家无脑连点 J/K（每次 +0.09）就能轻松推赢
 *   AI（AI 每秒才推 0.26）。整场没有任何「对准」成分：按得越快越赢。
 *
 * 【现在】同步轴（屏幕中下方那条）：
 *   · needle 在 [-1, 1] 上匀速往返扫动，周期 1.6s → 1.12s（每同步一次加快一档）
 *   · window 每回合在指针【前方】随机位置出现，宽度 0.30 → 0.18（每同步一次收窄一档）
 *     → 窗口停留 120 → 99.9 → 81.6 → 65.1 → 50.4ms（最后一档刻意卡在人类精度线之上）
 *   · 指针在窗口内按下 J / K / 鼠标左键 → 同步成功：tug += 0.17，sync++，指针定格 0.1s
 *   · 窗口外按下 → 失误：tug -= 0.12，miss++，0.25s 乱按锁定
 *   · 指针扫过窗口却没按 → 错过：tug -= 0.08，miss++
 *   · sync >= 5 → 无量空处 压制 伏魔御厨子（玩家赢）
 *   · miss >= 3 → 领域崩坏（玩家输，吃 CLASH_WIN_DMG + 术式熔断）
 *   · 12s 上限：|tug| >= 0.35 判胜负，否则双崩（比旧版 0.15 更严）
 *   · 全程都有宿傩的持续推搡（TUNE.CLASH_AI_PUSH × 难度），站着不动必输
 *
 * 【「乱按必输」是构造性的，不靠概率】—— 这是本模块存在的唯一理由：
 *   ① 窗口外按键：一次失误 + 0.25s 乱按锁定；
 *   ② 锁定期间再按：不记新失误，但把锁定【续期】（+0.06s/次，上限 0.4s）；
 *   ③ 于是「每帧都按」的玩家永远处在锁定期 —— 既同步不了，也刷不出第 2、3 次失误，
 *      只能眼看着宿傩把 tug 推到底（≈3.4~3.9s）。
 *      实测（_tools/probe-duel.mjs，30 局）：连点 30/30 输、精确 30/30 赢、静止 30/30 输。
 *   ④ 低帧率兜底：若这一帧指针「跳」过了窗口而玩家正好按下（一帧位移 > 窗宽），
 *      算同步成功而不是失误 —— 判定不该随帧率变严（30fps 下最后两档窗宽只有 1 帧）。
 *
 * 【接线】combat.js 的 DomainRunner 构造里 firstHook("clash", combat2) 拿本工厂；
 *   返回对象实现默认 DomainClash 的全部接口：
 *   active / tug / winner / elapsed / begin() / push(amount,label) / update(dt,edges) /
 *   resolve(winner,byTime) / reset()
 *   本文件不碰 combat.js / hud.js / weapons.js / body.html：HUD 是自己建的 DOM、
 *   球体视觉仍由 DomainRunner 的 weapons.domainClash({tug}) 负责、文案由 Lead 维护。
 *
 * 【调试】__SS.duel / window.__DUEL（实例）、__SS.mech.duel（契约 §1.3 快照）、
 *         window.__DUEL_FACTORY（另造独立实例）、duel.tune / duel._debugWindow()（探针覆盖边界分支用）
 * ============================================================================
 */

/* ============================================================================
 * 数值表 —— 前面几组是契约 §5 冻结值，其余是工程常数
 * ========================================================================== */
var DomainDuelTune = {
  PERIOD_START: 1.6,
  // 第 0 回合指针往返周期（s）
  PERIOD_MIN: 1.12,
  /**
   * 最快周期。停在这里是**可玩性下限**：窗口停留时间 dwell = 窗宽 × 周期 / 4，
   * 最后一档 0.18 × 1.12 / 4 = 50.4ms。优秀玩家按点精度约 ±30~50ms，
   * dwell 掉到 50ms 以下（0.12/0.85 → 25.5ms，只有 1.53 帧）第 5 次同步就变成运气而不是技术。
   */
  PERIOD_STEP: 0.12,
  // 每次同步加快 0.12s（1.6 → 1.48 → 1.36 → 1.24 → 1.12）
  WINDOW_START: 0.30,
  // 第 0 回合窗口宽度（同步轴单位，轴长 2.0）→ 停留 120ms
  WINDOW_MIN: 0.18,
  WINDOW_STEP: 0.03,
  // 每次同步收窄 0.03（0.30 → 0.27 → 0.24 → 0.21 → 0.18）→ 停留 120/99.9/81.6/65.1/50.4ms
  SYNC_GAIN: 0.17,
  // 同步成功推动 tug
  MISS_PRESS: 0.12,
  // 窗口外按下扣 tug
  MISS_PASS: 0.08,
  // 错过窗口扣 tug
  LOCK_TIME: 0.25,
  // 乱按锁定（契约的 debounce）
  LOCK_EXTEND: 0.06,
  // 锁定期内再按 → 续期，连点者永远出不来
  LOCK_MAX: 0.40,
  SYNC_GRACE: 0.12,
  // 同步成功后的输入保护（防"抖手第二下"被判失误，不影响任何判定）
  SYNC_FREEZE: 0.10,
  // 同步成功指针定格（演出，也是给玩家的确认）
  SYNC_TO_WIN: 5,
  MISS_TO_LOSE: 3,
  TUG_MAX: 1,
  // 指针放置：落在「未来 PLACE_MIN ~ PLACE_MAX 秒能到达」的位置上（前方随机，禁背板）
  PLACE_MIN: 0.22,
  PLACE_MAX: 1.05,
  PLACE_GAP: 0.26,
  // 新窗口中心与上一次至少差这么多（禁止原地重抽 / 背板）
  TIMEOUT_BAND: 0.35,
  // 12s 超时判胜负的带宽（旧版 0.15）
  HUD_HOLD: 1.8,
  // 结算后 HUD 保留时间（让玩家看清结果）
  /**
   * 结算面板（整屏大字）保留时间。
   * 用户原话：「领域对拼输赢好像显示不够明显 不知道是输了还是赢了」——
   * 根因是 main.js 用 tug 判胜负（同步轴结算时 tug 常停在 0）把胜利播成"被击破"，
   * 而且只有一条 2.4s 的顶部横幅。现在改成整屏大字 + 分数 + 代价，给足 3s。
   */
  RESULT_HOLD: 3
};

/* 本模块私有工具（同作用域里有很多模块，统一加 duel 前缀避免重名） */
function duelClamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/* ============================================================================
 * 同步轴 HUD（自己建 DOM + 自己注入样式，不改 hud.js / styles.css）
 * ========================================================================== */
var DomainDuelHud = {
  root: null,
  needle: null,
  win: null,
  syncEl: null,
  crackEl: null,
  tugFill: null,
  statusEl: null,
  pips: null,
  flashEl: null,
  styleEl: null,
  /** 结算面板（整屏大字：领域胜利 / 领域败北 / 两败俱伤） */
  resEl: null,
  resTitle: null,
  resVs: null,
  resLine: null,
  resHint: null,
  resT: 0,
  built: false,
  on: false,
  placeT: 0,
  lastBottom: -1,
  last: {},
  /** 建 DOM + 注入样式（只在第一次 begin 时调用） */
  build: function () {
    if (this.built || typeof document === "undefined") return;
    this.built = true;
    var st = document.createElement("style");
    st.id = "duel-hud-style";
    st.textContent = [
      "#duel-hud{position:fixed;left:50%;transform:translateX(-50%);bottom:26vh;z-index:30;",
      "pointer-events:none;width:min(78vw,620px);padding:7px 12px 9px;box-sizing:border-box;",
      "font-family:'Noto Sans JP',system-ui,-apple-system,'Segoe UI',sans-serif;",
      "font-variant-numeric:tabular-nums;color:#eaf6ff;",
      "background:linear-gradient(180deg,rgba(6,10,18,.80),rgba(6,10,18,.52));",
      "border:1px solid rgba(120,230,255,.30);box-shadow:0 10px 34px rgba(0,0,0,.62);",
      "opacity:0;transition:opacity .14s linear}",
      "#duel-hud.on{opacity:1}",
      "#duel-hud .dh-top{display:flex;align-items:center;gap:10px;margin-bottom:6px;line-height:1.1}",
      "#duel-hud .dh-title{font-size:clamp(14px,3.4vmin,18px);font-weight:700;letter-spacing:.18em;",
      "color:#fff;text-shadow:0 0 14px rgba(120,230,255,.9),0 2px 0 #000}",
      "#duel-hud .dh-sync{font-size:clamp(14px,3.4vmin,18px);font-weight:700;color:#7ff0ff;",
      "text-shadow:0 0 12px rgba(90,220,255,.8),0 2px 0 #000}",
      "#duel-hud .dh-crack{margin-left:auto;font-size:clamp(13px,3.2vmin,16px);font-weight:700;",
      "color:#ff9a8a;text-shadow:0 0 10px rgba(255,60,60,.6),0 2px 0 #000;white-space:nowrap}",
      "#duel-hud .dh-crack i{display:inline-block;font-style:normal;letter-spacing:2px;margin-right:4px}",
      "#duel-hud .dh-crack i b{font-weight:400;color:rgba(255,255,255,.22);transition:color .12s}",
      "#duel-hud .dh-crack i b.on{color:#ff5340;text-shadow:0 0 10px #ff2b00}",
      "#duel-hud .dh-axis{position:relative;height:20px;border:1px solid rgba(255,255,255,.26);",
      "background:linear-gradient(180deg,rgba(0,0,0,.86),rgba(0,0,0,.66));overflow:hidden}",
      "#duel-hud .dh-tick{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.14)}",
      "#duel-hud .dh-win{position:absolute;top:0;bottom:0;background:linear-gradient(180deg,rgba(127,240,255,.95),rgba(60,190,255,.55));",
      "box-shadow:0 0 18px rgba(90,220,255,.95),inset 0 0 8px rgba(255,255,255,.6)}",
      "#duel-hud .dh-needle{position:absolute;top:-2px;bottom:-2px;width:5px;margin-left:-2.5px;border-radius:2px;",
      "background:#fff;box-shadow:0 0 12px #fff,0 0 24px rgba(140,240,255,.9)}",
      "#duel-hud .dh-tug{position:relative;height:5px;margin-top:5px;background:rgba(0,0,0,.6);",
      "border:1px solid rgba(255,255,255,.16);overflow:hidden}",
      "#duel-hud .dh-tug i{position:absolute;left:50%;top:0;bottom:0;width:50%;transform-origin:left center;",
      "background:linear-gradient(90deg,rgba(90,220,255,.25),#5ad8ff)}",
      "#duel-hud .dh-hint{margin-top:5px;font-size:clamp(13px,3.2vmin,16px);letter-spacing:.06em;color:#dff4ff;",
      "text-shadow:0 2px 6px #000;text-align:center}",
      "#duel-hud .dh-hint b{color:#0a0e16;background:#7ff0ff;padding:0 6px;margin:0 2px;border-radius:2px;",
      "box-shadow:0 0 12px rgba(90,220,255,.9)}",
      "#duel-hud .dh-status{position:absolute;left:0;right:0;top:calc(100% + 2px);text-align:center;",
      "font-size:clamp(15px,4vmin,22px);font-weight:800;letter-spacing:.22em;opacity:0;",
      "transition:opacity .1s linear;text-shadow:0 0 18px currentColor,0 3px 0 #000}",
      "#duel-hud.hit .dh-axis{box-shadow:0 0 26px rgba(90,220,255,.9)}",
      "#duel-hud.bad .dh-axis{box-shadow:0 0 26px rgba(255,60,40,.9);border-color:rgba(255,90,70,.75)}",
      "#duel-flash{position:fixed;inset:0;z-index:29;pointer-events:none;opacity:0;",
      "background:radial-gradient(ellipse at center,rgba(255,0,0,0) 34%,rgba(150,0,8,.45) 74%,rgba(255,30,30,.62) 100%);",
      "transition:opacity .09s linear}",
      // 触屏（844x390）：面板左右下三面都是 touch-ui 的控件，所以收窄 + 压扁，
      // 塞进旧「領域対決」面板拉通后的空白带里（位置由 place() 量出来）
      "html.is-touch #duel-hud{width:min(78vw,620px);padding:5px 9px 6px}",
      "html.is-touch #duel-hud .dh-tick{display:none}",
      "html.is-touch #duel-hud .dh-top{margin-bottom:4px}",
      "html.is-touch #duel-hud .dh-axis{height:18px}",
      "html.is-touch #duel-hud .dh-tug{height:4px;margin-top:4px}",
      "html.is-touch #duel-hud .dh-hint{margin-top:3px;font-size:13px;letter-spacing:0}",
      "html.is-touch #duel-hud .dh-title{letter-spacing:.06em}",
      "html.is-touch #duel-hud .dh-status{font-size:clamp(14px,3.6vmin,18px)}",
      /* ---- 结算面板：领域对拼的输赢必须一眼看出来 ---- */
      "#duel-result{position:fixed;inset:0;z-index:41;pointer-events:none;display:flex;flex-direction:column;",
      "align-items:center;justify-content:center;text-align:center;opacity:0;transition:opacity .18s linear;",
      "font-family:'Noto Sans JP',system-ui,-apple-system,'Segoe UI',sans-serif}",
      "#duel-result.on{opacity:1}",
      "#duel-result .dr-veil{position:absolute;inset:0;",
      "background:radial-gradient(ellipse at center,rgba(0,0,0,0) 22%,rgba(0,0,0,.5) 72%,rgba(0,0,0,.72) 100%)}",
      "#duel-result .dr-box{position:relative;padding:14px 34px 18px;border:1px solid rgba(255,255,255,.34);",
      /* 领域背景本身很亮很花（猩红裂纹 + 电光），结算框必须够不透明才读得清 */
      "background:linear-gradient(180deg,rgba(4,7,13,.93),rgba(4,7,13,.8))}",
      "#duel-result .dr-tag{font-size:clamp(13px,3vmin,18px);font-weight:700;letter-spacing:.42em;",
      "color:#cfe6f5;text-shadow:0 2px 6px #000;margin-bottom:2px}",
      "#duel-result .dr-title{font-size:clamp(40px,10vmin,86px);font-weight:800;letter-spacing:.2em;",
      "line-height:1.08;text-shadow:0 0 26px currentColor,0 0 64px currentColor,0 4px 0 #000}",
      "#duel-result .dr-vs{margin-top:2px;font-size:clamp(15px,3.6vmin,22px);font-weight:700;letter-spacing:.08em;",
      "color:#fff;text-shadow:0 2px 8px #000}",
      "#duel-result .dr-line{margin-top:4px;font-size:clamp(14px,3.4vmin,20px);color:#dfeaf6;text-shadow:0 2px 6px #000}",
      "#duel-result .dr-hint{margin-top:6px;font-size:clamp(13px,3vmin,17px);color:#9fd8ee;letter-spacing:.06em;",
      "text-shadow:0 2px 6px #000}",
      "#duel-result.win .dr-title{color:#7ff0ff}",
      "#duel-result.win .dr-box{border-color:rgba(127,240,255,.8);box-shadow:0 0 46px rgba(90,220,255,.5)}",
      "#duel-result.lose .dr-title{color:#ff5340}",
      "#duel-result.lose .dr-box{border-color:rgba(255,90,70,.85);box-shadow:0 0 46px rgba(255,50,30,.5)}",
      "#duel-result.draw .dr-title{color:#c9a6ff}",
      "#duel-result.draw .dr-box{border-color:rgba(200,160,255,.8);box-shadow:0 0 46px rgba(170,120,255,.5)}",
      "html.is-touch #duel-result .dr-title{font-size:clamp(30px,8.4vmin,58px);letter-spacing:.14em}",
      "html.is-touch #duel-result .dr-box{padding:10px 16px 12px}"
    ].join("");
    (document.head || document.documentElement).appendChild(st);
    this.styleEl = st;

    var root = document.createElement("div");
    root.id = "duel-hud";
    root.innerHTML =
      '<div class="dh-top">' +
      '<span class="dh-title">术式同步</span>' +
      '<span class="dh-sync">同步 ×0</span>' +
      '<span class="dh-crack"><i><b>◆</b><b>◆</b><b>◆</b></i><span class="dh-ck">裂纹 0/3</span></span>' +
      "</div>" +
      '<div class="dh-axis">' +
      '<div class="dh-tick" style="left:25%"></div><div class="dh-tick" style="left:50%"></div><div class="dh-tick" style="left:75%"></div>' +
      '<div class="dh-win"></div>' +
      '<div class="dh-needle"></div>' +
      '<div class="dh-status"></div>' +
      "</div>" +
      '<div class="dh-tug"><i></i></div>' +
      '<div class="dh-hint">指针进入亮窗内按 <b>J</b> / <b>K</b> 对齐</div>';
    root.style.display = "none";
    document.body.appendChild(root);
    this.root = root;
    this.needle = root.querySelector(".dh-needle");
    this.win = root.querySelector(".dh-win");
    this.syncEl = root.querySelector(".dh-sync");
    this.crackEl = root.querySelector(".dh-ck");
    this.tugFill = root.querySelector(".dh-tug i");
    this.statusEl = root.querySelector(".dh-status");
    this.hintEl = root.querySelector(".dh-hint");
    this.pips = root.querySelectorAll(".dh-crack i b");

    var fl = document.createElement("div");
    fl.id = "duel-flash";
    document.body.appendChild(fl);
    this.flashEl = fl;

    /* ---- 结算面板：单独一块 DOM，和同步轴 HUD 的显隐互不干扰 ---- */
    var res = document.createElement("div");
    res.id = "duel-result";
    res.style.display = "none";
    res.innerHTML =
      '<div class="dr-veil"></div>' +
      '<div class="dr-box">' +
      '<div class="dr-tag">領 域 対 決</div>' +
      '<div class="dr-title"></div>' +
      '<div class="dr-vs"></div>' +
      '<div class="dr-line"></div>' +
      '<div class="dr-hint"></div>' +
      "</div>";
    document.body.appendChild(res);
    this.resEl = res;
    this.resTitle = res.querySelector(".dr-title");
    this.resVs = res.querySelector(".dr-vs");
    this.resLine = res.querySelector(".dr-line");
    this.resHint = res.querySelector(".dr-hint");
  },
  /** 结算面板：整屏大字 + 分数 + 代价。3s 后自动收（TUNE.RESULT_HOLD） */
  result: function (info) {
    if (!this.built) this.build();
    if (!this.resEl) return;
    var kind = info.kind === "win" ? "win" : info.kind === "lose" ? "lose" : "draw";
    var title = kind === "win" ? "领域胜利" : kind === "lose" ? "领域败北" : "两败俱伤";
    this.resTitle.textContent = title;
    this.resVs.textContent = kind === "draw"
      ? "双方领域同时崩坏 · 用时 " + info.elapsed.toFixed(1) + "s"
      : (kind === "win" ? "你 Ⅴ 宿傩" : "宿傩 Ⅴ 你") +
        " · 同步 " + info.sync + "/" + DomainDuelTune.SYNC_TO_WIN +
        " · 失误 " + Math.min(info.miss, DomainDuelTune.MISS_TO_LOSE) + "/" + DomainDuelTune.MISS_TO_LOSE +
        " · 用时 " + info.elapsed.toFixed(1) + "s" + (info.byTime ? "（12s 判定）" : "");
    this.resLine.textContent = kind === "draw"
      ? "双方术式熔断 " + info.burnout.toFixed(1) + "s · 各 −" + info.dmg + " HP"
      : (kind === "win" ? "伏魔御厨子 破碎" : "无量空处 碎裂") +
        " — " + (kind === "win" ? "宿傩" : "你") + " −" + info.dmg + " HP · 术式熔断 " + info.burnout.toFixed(1) + "s";
    this.resHint.textContent = kind === "win"
      ? "同步 " + DomainDuelTune.SYNC_TO_WIN + " 次就能压碎对手领域"
      : kind === "lose"
        ? "指针进亮窗再按 J / K —— 失误 " + DomainDuelTune.MISS_TO_LOSE + " 次领域就崩"
        : "两边都没压住 —— 谁都别想赢";
    this.resEl.className = kind + " on";
    this.resEl.style.display = "";
    this.resT = DomainDuelTune.RESULT_HOLD;
    /**
     * 触屏档：结算大字会压住左下角的教学提示条（实测重叠 3572 px²，
     * 「拖动画面转视角 · 双指捏合缩放」被切一半）。把提示条临时收起来，
     * 面板收掉时再还原 —— 不永久吞掉玩家的教学提示。
     */
    try {
      var tip = document.querySelector(".t-tip.t-show");
      if (tip) { this._tipHeld = tip; tip.classList.remove("t-show"); }
    } catch (e) { /* 忽略 */ }
    /**
     * 结算瞬间把同步轴面板收掉。
     * 不然它会和整屏大字叠在一起（实测截图里白色轴条正好压在结算框下沿，
     * 屏幕中下方同时有三套字：大字标题、轴面板、提示行）。
     */
    this.hide();
  },
  clearResult: function () {
    this.resT = 0;
    if (this._tipHeld) {
      try { this._tipHeld.classList.add("t-show"); } catch (e) { /* 忽略 */ }
      this._tipHeld = null;
    }
    if (!this.resEl) return;
    this.resEl.className = "";
    this.resEl.style.display = "none";
  },
  show: function () {
    if (!this.built) this.build();
    if (!this.on) {
      this.root.style.display = "";
      this.root.classList.add("on");
      this.on = true;
    }
    // 触屏没有 J/K，文案要跟着输入方式走
    try {
      var touchUI = document.documentElement.classList.contains("is-touch");
      var txt = touchUI ? "亮窗内点 <b>轻</b> / <b>重</b> 对齐" : "指针进入亮窗内按 <b>J</b> / <b>K</b> 对齐";
      if (this.hintEl.getAttribute("data-txt") !== txt) {
        this.hintEl.innerHTML = txt;
        this.hintEl.setAttribute("data-txt", txt);
      }
    } catch (e) {
      /* 忽略 */
    }
  },
  hide: function () {
    if (!this.built) return;
    if (this.on) {
      this.root.classList.remove("on", "hit", "bad");
      this.root.style.display = "none";
      this.on = false;
    }
  },
  /**
   * 位置：贴在旧版「领域对撞」面板（#hud .clash 的提示行）正下方。
   * 那条面板在触屏下是 top:40% 拉通的（mobile.css），量它的提示行底边最稳。
   * 每 0.3s 量一次，不每帧读布局。
   */
  place: function (dt) {
    this.placeT -= dt;
    if (this.placeT > 0) return;
    this.placeT = 0.3;
    var vh = window.innerHeight || 0;
    var myH = this.root.getBoundingClientRect().height || 0;
    var panel = document.querySelector("#hud .clash");
    var hint = document.querySelector("#hud .clash-hint");
    var pr = panel ? panel.getBoundingClientRect() : null;
    var hr = hint ? hint.getBoundingClientRect() : null;
    var bottom = -1;
    var visible = !!(pr && pr.height > 0 && pr.bottom > 0 && pr.top < vh);
    if (visible) {
      /**
       * 同步轴必须和旧「領域対決」面板（main.js 驱动的那条拉锯条）**完全不重叠**：
       *   桌面：旧面板贴屏幕底（bottom:12.5vh, y 524~630），下方只剩能力条
       *         → 同步轴放它上方（y 415~514，正好是"屏幕中下方"）；
       *   触屏：mobile.css 把旧面板 top:40% 拉通成一大块（844x390 时 y 156~339），
       *         里面还叠着横幅 / 触屏按键（摇杆 y249+、技能键 y312+、工具键 y263+），
       *         所以同步轴放旧面板**上方**（y 71~146，顶栏之下）—— 实测四边都不打架。
       * 只有上方放不下（超矮屏）时才退到"面板内容下方"。
       */
      var above = Math.round(vh - pr.top + 10);
      if (above >= 10 && above + myH <= vh - 6) bottom = above;
      if (bottom < 0 && hr && hr.height > 0) {
        var below = Math.round(vh - hr.bottom - 8 - myH);
        if (below >= 10 && below + myH <= vh - 6) bottom = below;
      }
    }
    // 面板不在（结算保留期 / 被其它状态收起）时沿用上一次的位置，别乱跳
    if (bottom < 6) bottom = this.lastBottom >= 6 ? this.lastBottom : Math.round(vh * 0.26);
    if (Math.abs(bottom - this.lastBottom) > 0.5) {
      this.root.style.bottom = bottom + "px";
      this.lastBottom = bottom;
    }
  },
  /** 每帧：读 duel 的自报状态刷 DOM（只在值变化时写） */
  tick: function (dt, duel) {
    /**
     * 结算面板独立计时：对拼结束后同步轴 HUD 会收起来，但胜负大字必须留住，
     * 所以它不跟着 duel.active 走，而是自己数 TUNE.RESULT_HOLD 秒。
     */
    /**
     * 结算面板在「离开战斗」的瞬间必须收掉（独立验证 A9/A11/A12）：
     *   · reset() 清不掉面板 → 新一局开局大字还挂在屏幕上
     *   · 保留期内点「返回标题」→ 面板 z-index 41 > 标题页 40，盖住模式选择按钮
     *   · 点「重新开始」→ 播片阶段面板还挂着
     * 所以这里跟同步轴 HUD 用同一套 state 过滤。
     */
    if (typeof state !== "undefined" && (state === "title" || state === "loading" || state === "cutscene")) {
      if (this.resT > 0) this.clearResult();
    }
    if (this.resT > 0) {
      this.resT = Math.max(0, this.resT - Math.max(0, dt || 0));
      if (this.resT <= 0) this.clearResult();
      /**
       * 结算大字在的时候**完全不要碰**同步轴 HUD：
       * 主循环那边 _hudHold(1.8s) 还没过期，每帧都会调 show() 把面板又拉回来，
       * 于是结算框和三套文字叠在一起（截图里白色轴条就压在结算框下沿）。
       */
      return;
    }
    if (!duel || (!duel.active && !(duel._hudHold > 0))) {
      this.hide();
      return;
    }
    // 标题 / 播片 / 暂停时收起，避免压在暂停面板上
    if (typeof state !== "undefined" && (state === "title" || state === "loading" || state === "cutscene" || state === "paused")) {
      this.hide();
      return;
    }
    this.show();
    this.place(dt);
    var L = this.last;
    var np = (duel.needle + 1) * 50;
    if (L.np !== np) {
      this.needle.style.left = np + "%";
      L.np = np;
    }
    var lp = (duel.lo + 1) * 50;
    var w = (duel.hi - duel.lo) * 50;
    if (L.lp !== lp || L.w !== w) {
      this.win.style.left = lp + "%";
      this.win.style.width = w + "%";
      L.lp = lp;
      L.w = w;
    }
    var sy = "同步 ×" + duel.sync;
    if (L.sy !== sy) {
      this.syncEl.textContent = sy;
      L.sy = sy;
    }
    var ck = "裂纹 " + Math.min(DomainDuelTune.MISS_TO_LOSE, duel.miss) + "/" + DomainDuelTune.MISS_TO_LOSE;
    if (L.ck !== ck) {
      this.crackEl.textContent = ck;
      L.ck = ck;
    }
    var on = Math.min(DomainDuelTune.MISS_TO_LOSE, duel.miss);
    if (L.on !== on) {
      for (var i = 0; i < this.pips.length; i++) this.pips[i].classList.toggle("on", i < on);
      L.on = on;
    }
    var tx = Math.abs(duel.tug) < 0.008 ? 0.0002 : duel.tug * 2;
    if (L.tx !== tx) {
      this.tugFill.style.transform = "scaleX(" + tx + ")";
      L.tx = tx;
    }
    // 状态字 / 红闪：hit=同步成功，bad=失误
    var cls = "";
    if (duel.flashT > 0) {
      var kind = duel.flashKind;
      var word =
        kind === "sync" ? "同 步" : kind === "miss" ? "失 误" : kind === "win" ? "术式压制" : kind === "lose" ? "领域崩坏" : kind === "start" ? "对准指针" : "同时崩坏";
      var col = kind === "sync" || kind === "win" ? "#7ff0ff" : "#ff6a52";
      if (L.word !== word) {
        this.statusEl.textContent = word;
        this.statusEl.style.color = col;
        L.word = word;
      }
      if (L.op !== 1) {
        this.statusEl.style.opacity = "1";
        L.op = 1;
      }
      cls = kind === "sync" || kind === "win" ? "hit" : "bad";
    } else if (L.op !== 0) {
      this.statusEl.style.opacity = "0";
      L.op = 0;
    }
    var next = cls ? cls + " on" : "on";
    if (this.root.className !== next) this.root.className = next;
    var fo = duel.redFlash > 0 ? Math.min(0.75, duel.redFlash * 2.2) : 0;
    if (L.fo !== fo) {
      this.flashEl.style.opacity = String(fo);
      L.fo = fo;
    }
  }
};

/* ============================================================================
 * 领域对决本体
 * ========================================================================== */
var DomainDuel = class {
  constructor(combat2) {
    this.combat = combat2;
    this.active = false;
    this.tug = 0;
    this.life = 0;
    this.elapsed = 0;
    this.winner = null;
    this.pressCount = 0;
    // ---- 术式同步状态 ----
    this.needle = 0;
    this.dir = 1;
    this.lo = -0.15;
    this.hi = 0.15;
    this.sync = 0;
    this.miss = 0;
    this.streak = 0;
    this.best = 0;
    this.ignored = 0;
    // 乱按锁定里被吞掉的按键次数（调试口径）
    this.round = 0;
    this.lockT = 0;
    this.lockHard = false;
    this.freezeT = 0;
    this.windowSeq = 0;
    this.flashT = 0;
    this.flashKind = "";
    this.redFlash = 0;
    this._fxT = 0;
    this._decay = 0;
    this._hudHold = 0;
    // 上一帧指针是否在窗口内（判"完整扫过窗口"）
    this._wasIn = false;
    this._rng = Math.random;
    this._low = typeof QUALITY4 !== "undefined" && QUALITY4 === "low";
    /** 数值表引用（探针覆盖边界分支用，游戏内不要改） */
    this.tune = DomainDuelTune;
  }

  /** 探针用：强制把窗口放到指定位置（只用于覆盖边界分支，游戏内不要调） */
  _debugWindow(lo, hi) {
    this.lo = lo;
    this.hi = hi;
    this._wasIn = this._inWindow(this.needle);
  }

  /** 用固定种子跑（探针复现用）；不调用就是 Math.random */
  setSeed(seed) {
    this._seed = seed >>> 0 || 1;
    this._rng = () => {
      this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
      return this._seed / 4294967296;
    };
  }
  _rand() {
    return this._rng();
  }

  /* ---- 回合参数：越同步越快、越同步越窄 ---- */
  _period() {
    return Math.max(DomainDuelTune.PERIOD_MIN, DomainDuelTune.PERIOD_START - DomainDuelTune.PERIOD_STEP * this.sync);
  }
  _width() {
    return Math.max(DomainDuelTune.WINDOW_MIN, DomainDuelTune.WINDOW_START - DomainDuelTune.WINDOW_STEP * this.sync);
  }
  /** 三角波速度：半周期走完 2 个单位 */
  _speed() {
    return 4 / this._period();
  }
  /** 当前窗口的静止时间（ms）—— 这就是「要对到多准」的硬指标 */
  dwellMs() {
    return (1000 * this._width()) / this._speed();
  }

  reset() {
    this.active = false;
    // 结算大字也要跟着清（独立验证 A9：reset 后面板仍 cls="win on" 挂在屏幕上）
    if (typeof DomainDuelHud !== "undefined" && DomainDuelHud) DomainDuelHud.clearResult();
    this.tug = 0;
    this.life = 0;
    this.elapsed = 0;
    this.winner = null;
    this.pressCount = 0;
    this.needle = 0;
    this.dir = 1;
    this.sync = 0;
    this.miss = 0;
    this.streak = 0;
    this.best = 0;
    this.ignored = 0;
    this.round = 0;
    this.lockT = 0;
    this.lockHard = false;
    this.freezeT = 0;
    this.flashT = 0;
    this.flashKind = "";
    this.redFlash = 0;
    this._fxT = 0;
    this._decay = 0;
    this._hudHold = 0;
    this._placeWindow(true);
    this._wasIn = this._inWindow(this.needle);
  }

  begin() {
    const cb = this.combat;
    this.active = true;
    this.tug = 0;
    this.life = TUNE.CLASH_LIFE;
    this.elapsed = 0;
    this.winner = null;
    this.pressCount = 0;
    this.sync = 0;
    this.miss = 0;
    this.streak = 0;
    this.best = 0;
    this.ignored = 0;
    this.round = 0;
    this.lockT = 0;
    this.lockHard = false;
    this.freezeT = 0;
    this.windowSeq = 0;
    this.redFlash = 0;
    this.flashT = 0.9;
    this.flashKind = "start";
    this._fxT = 0;
    this._decay = 0;
    this._hudHold = 0;
    this._low = typeof QUALITY4 !== "undefined" && QUALITY4 === "low";
    // 起始位置随机：第一次按键没有任何"背板"可依
    this.needle = this._rand() * 2 - 1;
    this.dir = this._rand() < 0.5 ? -1 : 1;
    this._placeWindow(true);
    this._wasIn = this._inWindow(this.needle);
    cb.banner("领域对撞 — 指针进入亮窗时按 J / K 对齐术式", 3);
    cb.audio.play("domain_clash");
    cb.audio.loop("music_domain");
    cb.fx.screen({ flash: 0.9, color: C.VIOLET, shake: 1.4, chroma: 1, vignette: 0.5, blur: 0.5, life: 1 });
    cb.fx.callout({
      text: "术式同步",
      sub: "DOMAIN SYNCHRO",
      pos: cb.fighters[SIDE.GOJO].ctrl.chest.getWorldPosition(new Vector3()),
      color: C.VIOLET,
      color2: C.CYAN,
      life: 2,
      size: 2.2,
      screenAnchor: false
    });
    cb.pushEvent({ type: "duel_begin" });
    DomainDuelHud.clearResult();   // 上一局的胜负大字先收掉，别压在新对局上
    DomainDuelHud.show();
  }

  /**
   * 通用推力（保留默认 DomainClash 的接口）。
   * 本机制的 sync / miss 都走它，所以外部也能用同一个入口推 tug。
   */
  push(amount, label) {
    if (!this.active || this.winner) return;
    const cb = this.combat;
    this.tug = duelClamp(this.tug + amount, -DomainDuelTune.TUG_MAX, DomainDuelTune.TUG_MAX);
    this.pressCount++;
    if (label !== "miss" && label !== "pass") {
      const p = cb.fighters[SIDE.GOJO].ctrl.handR.getWorldPosition(new Vector3());
      cb.fx.hitSpark({
        pos: p,
        color: amount >= 0 ? C.CYAN : C.CRIMSON,
        color2: amount >= 0 ? C.WHITE : C.INK,
        count: this._low ? 6 : 10,
        size: 0.45,
        life: 0.25,
        speed: 12
      });
    }
    if (this.tug >= 1) this.resolve(SIDE.GOJO);
    else if (this.tug <= -1) this.resolve(SIDE.SUKUNA);
  }

  /* ---- 几何 ---- */
  _mid() {
    const cb = this.combat;
    const a = cb.fighters[SIDE.GOJO].p;
    const b = cb.fighters[SIDE.SUKUNA].p;
    return new Vector3((a.x + b.x) * 0.5, 2.2, (a.z + b.z) * 0.5);
  }
  _chest(side) {
    return this.combat.fighters[side].ctrl.chest.getWorldPosition(new Vector3());
  }

  /* ---- 指针运动（三角波 + 边界反射；返回本帧是否「进入」窗口） ---- */
  _enters(a, b) {
    if (b >= a) return a <= this.lo && b >= this.lo;
    return a >= this.hi && b <= this.hi;
  }
  _moveNeedle(dt) {
    // 同步成功后的定拍：这段时间指针不动（演出 + 给玩家确认）
    let move = dt;
    if (this.freezeT > 0) {
      const used = Math.min(this.freezeT, dt);
      this.freezeT -= used;
      move -= used;
    }
    if (move <= 1e-6) return false;
    const v = this._speed();
    let crossed = false;
    let remain = move;
    let guard = 0;
    while (remain > 1e-6 && guard++ < 12) {
      const target = this.dir > 0 ? 1 : -1;
      const tHit = Math.abs(target - this.needle) / v;
      if (tHit > remain) {
        const from = this.needle;
        this.needle = from + this.dir * v * remain;
        if (this._enters(from, this.needle)) crossed = true;
        remain = 0;
      } else {
        const from = this.needle;
        this.needle = target;
        if (this._enters(from, target)) crossed = true;
        this.dir = -this.dir;
        remain -= tHit;
        if (tHit <= 1e-9) remain -= 1e-3;
      }
    }
    this.needle = duelClamp(this.needle, -1, 1);
    return crossed;
  }
  /** 从当前状态往前推 t 秒后的指针位置（放窗口用） */
  _needleAt(t) {
    const v = this._speed();
    let x = this.needle;
    let d = this.dir;
    let remain = Math.max(0, t - (this.freezeT > 0 ? this.freezeT : 0));
    let guard = 0;
    while (remain > 1e-6 && guard++ < 12) {
      const target = d > 0 ? 1 : -1;
      const tHit = Math.abs(target - x) / v;
      if (tHit > remain) {
        x += d * v * remain;
        remain = 0;
      } else {
        x = target;
        d = -d;
        remain -= tHit;
        if (tHit <= 1e-9) remain -= 1e-3;
      }
    }
    return x;
  }
  _inWindow(x) {
    return x >= this.lo && x <= this.hi;
  }

  /**
   * 放窗口：在「未来 0.22 ~ 1.05s 指针会到达」的位置里随机取一点。
   * 位置是随机的（禁背板），但一定在前面、且跟上一个窗口拉开距离（不会原地重抽）。
   */
  _placeWindow(first) {
    const half = this._width() * 0.5;
    const span = 1 - half;
    const lastMid = (this.lo + this.hi) * 0.5;
    let center = null;
    for (let i = 0; i < 40; i++) {
      const delay = DomainDuelTune.PLACE_MIN + this._rand() * (DomainDuelTune.PLACE_MAX - DomainDuelTune.PLACE_MIN);
      const p = this._needleAt(delay);
      if (Math.abs(p) > span) continue;
      if (!first && Math.abs(p - lastMid) < DomainDuelTune.PLACE_GAP) continue;
      center = p;
      break;
    }
    if (center === null) center = duelClamp(this._needleAt(DomainDuelTune.PLACE_MIN), -span, span);
    this.lo = center - half;
    this.hi = center + half;
    this.windowSeq++;
  }

  /* ---- 事件：同步 / 乱按 / 错过 ---- */
  _onSync() {
    const cb = this.combat;
    this.freezeT = DomainDuelTune.SYNC_FREEZE;
    this.lockT = DomainDuelTune.SYNC_GRACE;
    this.lockHard = false;
    this.sync++;
    this.round = this.sync;
    this.streak++;
    if (this.streak > this.best) this.best = this.streak;
    this.flashT = 0.42;
    this.flashKind = "sync";
    this.push(DomainDuelTune.SYNC_GAIN, "sync");
    this._placeWindow(false);
    this._syncFx();
    cb.pushEvent({ type: "duel_sync", sync: this.sync, round: this.round, tug: this.tug, dwell: Math.round(this.dwellMs()) });
  }
  _onWrongPress() {
    const cb = this.combat;
    this.miss++;
    this.streak = 0;
    this.lockT = DomainDuelTune.LOCK_TIME;
    this.lockHard = true;
    this.flashT = 0.5;
    this.flashKind = "miss";
    this.redFlash = 0.5;
    this.push(-DomainDuelTune.MISS_PRESS, "miss");
    this._placeWindow(false);
    this._missFx("press");
    cb.pushEvent({ type: "duel_miss", miss: this.miss, reason: "press", lock: DomainDuelTune.LOCK_TIME });
  }
  _onPassMiss() {
    const cb = this.combat;
    this.miss++;
    this.streak = 0;
    this.flashT = 0.4;
    this.flashKind = "miss";
    this.redFlash = 0.34;
    this.push(-DomainDuelTune.MISS_PASS, "pass");
    this._placeWindow(false);
    this._missFx("pass");
    cb.pushEvent({ type: "duel_miss", miss: this.miss, reason: "pass" });
  }

  /* ---- 演出 ---- */
  _syncFx() {
    const cb = this.combat;
    const low = this._low;
    cb.fx.shockwave({ pos: this._mid(), maxRadius: low ? 14 : 22, color: C.CYAN, color2: C.WHITE, life: 0.45, thickness: 0.6 });
    cb.fx.hitSpark({
      pos: this._chest(SIDE.GOJO),
      color: C.CYAN,
      color2: C.WHITE,
      count: low ? 10 : 18,
      size: 0.45,
      speed: 14,
      life: 0.3
    });
    cb.fx.screen({ flash: 0.42, color: C.CYAN, shake: 0.5, chroma: 0.55, vignette: 0.18, blur: 0.12, life: 0.4 });
    cb.audio.play("charge_ready", { volume: 0.5, rate: 1 + this.sync * 0.05 });
  }
  /** 失败：猩红裂纹（随 miss 累积变多）+ 红闪 + 领域球方向炸开 */
  _missFx(reason) {
    const cb = this.combat;
    const low = this._low;
    const mid = this._mid();
    const n = Math.min(DomainDuelTune.MISS_TO_LOSE, this.miss);
    for (let i = 0; i < n; i++) {
      const a = this._rand() * Math.PI * 2;
      const r0 = 3 + i * 1.4;
      const len = 6 + this.miss * 2.5;
      cb.fx.lightning({
        from: new Vector3(mid.x + Math.cos(a) * r0, mid.y + (this._rand() - 0.5) * 3, mid.z + Math.sin(a) * r0),
        to: new Vector3(mid.x + Math.cos(a) * (r0 + len), mid.y + (this._rand() - 0.5) * 6, mid.z + Math.sin(a) * (r0 + len)),
        color: C.CRIMSON,
        color2: C.INK,
        branches: low ? 1 : 2,
        life: 0.3,
        width: 0.22,
        jag: 1.7
      });
    }
    cb.fx.hitSpark({ pos: this._chest(SIDE.GOJO), color: C.CRIMSON, color2: C.INK, count: low ? 6 : 12, size: 0.4, speed: 10, life: 0.28 });
    cb.fx.screen({ flash: 0.6, color: C.CRIMSON, shake: 0.85, chroma: 0.85, vignette: 0.45, blur: 0.14, life: 0.45 });
    cb.audio.play(reason === "press" ? "hit_heavy" : "ui_back", { volume: 0.45, rate: reason === "press" ? 0.62 : 0.75 });
  }

  /**
   * 每帧。
   * @param {number} dt
   * @param {{light:boolean,heavy:boolean,mouse:boolean}} edges 本帧按键边沿
   */
  update(dt, edges) {
    const cb = this.combat;
    if (this.redFlash > 0) this.redFlash = Math.max(0, this.redFlash - dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this._hudHold > 0) this._hudHold = Math.max(0, this._hudHold - dt);
    if (!this.active) {
      // 收招：tug 缓慢回中（与旧版一致）
      if (this._decay > 0) {
        this._decay -= dt;
        this.tug *= Math.max(0, 1 - dt * 2.2);
        if (this._decay <= 0) this.tug = 0;
      }
      return;
    }
    this.elapsed += dt;
    this.life -= dt;
    if (this.lockT > 0) this.lockT = Math.max(0, this.lockT - dt);

    const pressed = !!(edges && (edges.light || edges.heavy || edges.mouse));
    // 先记下「玩家按下时看到的指针位置」，再移动指针
    const inside = this._inWindow(this.needle);
    const locked = this.lockT > 0;
    const crossed = this._moveNeedle(dt);
    const insideNow = this._inWindow(this.needle);
    /**
     * 「扫过窗口」= 上一帧指针还在窗里、这一帧出来了（整段窗口一次都没按）。
     * ⚠ 早期版本在指针**刚进窗**的那一帧就重抽窗口，结果是：
     *   窗口在指针碰到它的瞬间就跳走 —— 玩家看到的"亮窗"几乎没法用，
     *   只有背板猜到进窗帧的人才能同步。契约 §5 写的是"指针**经过后**才重新随机"，
     *   所以必须让窗口留到指针离开，玩家整段停留时间里都能对齐。
     */
    const swept = this._wasIn && !insideNow;
    const sweptFast = !this._wasIn && !insideNow && crossed;
    // 一帧内整个窗口被跳过（30fps 下窗宽只有 1~2 帧）→ 按下就算对齐

    if (locked) {
      // 乱按锁定：这一帧的按键被吞掉；再按就把锁定续期（连点者永远出不来）
      if (pressed) {
        if (this.lockHard) this.lockT = Math.min(DomainDuelTune.LOCK_MAX, this.lockT + DomainDuelTune.LOCK_EXTEND);
        this.ignored++;
      }
    } else if (pressed) {
      // 窗口内按 = 对齐；crossed 是低帧率兜底（指针整帧跳过窗口）
      if (inside || insideNow || crossed) this._onSync();
      else this._onWrongPress();
    } else if (swept || sweptFast) {
      this._onPassMiss();
    }
    // 事件里可能换过窗口，用当前窗口重新采样
    this._wasIn = this._inWindow(this.needle);

    // 宿傩的持续推搡（保留 TUNE.CLASH_AI_PUSH）
    const sk = cb.fighters[SIDE.SUKUNA];
    const hpFrac = sk ? duelClamp(sk.hp / sk.hpMax, 0, 1) : 1;
    const diff = cb.ai ? cb.ai.difficulty : 1;
    const aiPush = TUNE.CLASH_AI_PUSH * diff * (0.7 + 0.3 * hpFrac);
    this.tug = duelClamp(this.tug - aiPush * dt, -DomainDuelTune.TUG_MAX, DomainDuelTune.TUG_MAX);

    // 僵持区相互侵蚀（旧版的张力：贴着 0 的时候两边一起掉血）
    if (Math.abs(this.tug) < TUNE.CLASH_STALE_BAND) {
      const dmg = TUNE.CLASH_EROSION_DPS * dt * TUNE.INCOMING_SCALE;
      for (const side of [SIDE.GOJO, SIDE.SUKUNA]) {
        const c = cb.fighters[side];
        if (c.dead) continue;
        c.hp = Math.max(0, c.hp - dmg);
        if (c.hp <= 0) cb.onDeath(c);
      }
    }

    // 领域对撞的持续演出（比旧版收了一半强度：现在玩家要盯着同步轴看）
    // dt=0（暂停帧 / 探针直接驱动）时不要刷特效，否则会每帧spawn一次
    if (dt > 0) this._fxT -= dt;
    if (this._fxT <= 0 && dt > 0) {
      this._fxT = 0.16;
      const tension = 1 - Math.abs(this.tug);
      const low = this._low;
      cb.fx.lightning({
        from: this._chest(SIDE.GOJO),
        to: this._chest(SIDE.SUKUNA),
        color: this.tug >= 0 ? C.CYAN : C.CRIMSON,
        color2: C.VIOLET,
        branches: low ? 1 : 2,
        life: 0.22,
        width: 0.26,
        jag: 1.2
      });
      cb.fx.screen({ shake: 0.14 + tension * 0.22, chroma: 0.18 + tension * 0.22, vignette: 0.24 + tension * 0.2, blur: 0.12, life: 0.2 });
      if (tension > 0.55 && !low) {
        cb.fx.shockwave({ pos: this._mid(), maxRadius: 22, color: C.VIOLET, color2: C.WHITE, life: 0.34, thickness: 0.4 });
      }
    }

    if (this.winner) return;
    if (this.sync >= DomainDuelTune.SYNC_TO_WIN) return void this.resolve(SIDE.GOJO);
    if (this.miss >= DomainDuelTune.MISS_TO_LOSE) return void this.resolve(SIDE.SUKUNA);
    if (this.tug >= 1) return void this.resolve(SIDE.GOJO);
    if (this.tug <= -1) return void this.resolve(SIDE.SUKUNA);
    if (this.life <= 0) {
      if (this.tug >= DomainDuelTune.TIMEOUT_BAND) this.resolve(SIDE.GOJO, true);
      else if (this.tug <= -DomainDuelTune.TIMEOUT_BAND) this.resolve(SIDE.SUKUNA, true);
      else this.resolve(null);
    }
  }

  /**
   * 结算（与默认 DomainClash 逐条对齐，保证收尾/扣血/熔断沿用既有系统）。
   * @param {'gojo'|'sukuna'|null} winner null = 双双崩溃
   * @param {boolean} [byTime] 是否因 12s 上限判定
   */
  resolve(winner, byTime) {
    if (this.winner !== null || !this.active) return;
    const cb = this.combat;
    const timeUp = !!byTime;
    this.winner = winner || "draw";
    this.active = false;
    this._decay = 2;
    this._hudHold = DomainDuelTune.HUD_HOLD;
    this.flashT = 1.6;
    this.flashKind = winner === SIDE.GOJO ? "win" : winner === SIDE.SUKUNA ? "lose" : "draw";
    const loserSide = winner === SIDE.GOJO ? SIDE.SUKUNA : winner === SIDE.SUKUNA ? SIDE.GOJO : null;
    cb.pushEvent({
      type: winner === SIDE.GOJO ? "clash_win" : winner === SIDE.SUKUNA ? "clash_lose" : "clash_draw",
      winner: winner || "draw",
      tug: this.tug,
      elapsed: this.elapsed,
      sync: this.sync,
      miss: this.miss,
      byTime: timeUp
    });
    if (winner && loserSide) {
      const w = cb.fighters[winner];
      const l = cb.fighters[loserSide];
      const dmg = TUNE.CLASH_WIN_DMG[winner];
      cb.banner(winner === SIDE.GOJO ? "术式同步 5/5 — 伏魔御厨子 破碎！" : "领域崩坏 — 无量空处 碎裂！", 2.4);
      cb.fx.callout({
        text: "领域破碎",
        sub: winner === SIDE.GOJO ? "伏魔御厨子" : "无量空处",
        pos: l.ctrl.chest.getWorldPosition(new Vector3()),
        color: winner === SIDE.GOJO ? C.CYAN : C.CRIMSON,
        color2: C.WHITE,
        life: 1.8,
        size: 2,
        shake: 0.5
      });
      cb.fx.shockwave({ pos: l.p.clone(), maxRadius: 60, color: winner === SIDE.GOJO ? C.CYAN : C.CRIMSON, color2: C.VIOLET, life: 1, thickness: 1.2 });
      cb.fx.screen({ flash: 0.8, color: winner === SIDE.GOJO ? C.CYAN : C.CRIMSON, shake: 1.6, chroma: 0.9, blur: 0.4, life: 0.8 });
      // 裂纹爆开：失败方的领域球向外炸出猩红电弧
      const nBolt = winner === SIDE.SUKUNA ? 5 : 3;
      for (let i = 0; i < nBolt; i++) {
        const a = this._rand() * Math.PI * 2;
        cb.fx.lightning({
          from: l.ctrl.chest.getWorldPosition(new Vector3()),
          to: new Vector3(l.p.x + Math.cos(a) * 16, 4 + this._rand() * 8, l.p.z + Math.sin(a) * 16),
          color: C.CRIMSON,
          color2: C.VIOLET,
          branches: this._low ? 1 : 3,
          life: 0.4,
          width: 0.3,
          jag: 1.8
        });
      }
      cb.audio.play("ko");
      cb.audio.play("domain_clash", { volume: 0.8 });
      l.hp = Math.max(0, l.hp - dmg * TUNE.INCOMING_SCALE);
      l.burnoutT = TUNE.BURNOUT[loserSide];
      l.stunT = Math.max(l.stunT, TUNE.HITSTUN_HEAVY);
      l.vel.set(0, 0, 0);
      cb.runner.cancel(loserSide, "burnout");
      w.gainDomain(20);
      cb.fx.damageNumber({
        pos: l.ctrl.chest.getWorldPosition(new Vector3()),
        amount: Math.round(dmg * TUNE.INCOMING_SCALE),
        color: C.GOLD,
        crit: true,
        life: 1.4
      });
      if (l.hp <= 0) cb.onDeath(l);
    } else {
      cb.banner("领域同时崩坏 — 术式熔断", 2.2);
      cb.fx.screen({ flash: 0.6, color: C.VIOLET, shake: 1.2, chroma: 0.8, life: 0.7 });
      for (const side of [SIDE.GOJO, SIDE.SUKUNA]) {
        const c = cb.fighters[side];
        c.burnoutT = Math.max(c.burnoutT, TUNE.DRAW_BURNOUT);
        c.hp = Math.max(0, c.hp - 90 * TUNE.INCOMING_SCALE);
        cb.runner.cancel(side, "burnout");
        if (c.hp <= 0) cb.onDeath(c);
      }
      cb.audio.play("ko");
    }
    if (timeUp) {
      cb.fx.callout({
        text: "领域终结",
        sub: "12s",
        pos: cb.fighters[SIDE.GOJO].p.clone().setY(3),
        color: C.VIOLET,
        color2: C.WHITE,
        life: 1.2,
        size: 1.4
      });
    }
    /**
     * 整屏结算面板（用户：「领域对拼输赢好像显示不够明显 不知道是输了还是赢了」）。
     * 分数、代价、下一步怎么按全写在同一屏上，不靠一条 2.4s 的顶部横幅。
     */
    try {
      const winSide = winner === SIDE.GOJO ? SIDE.GOJO : winner === SIDE.SUKUNA ? SIDE.SUKUNA : null;
      DomainDuelHud.result({
        kind: winSide === SIDE.GOJO ? "win" : winSide === SIDE.SUKUNA ? "lose" : "draw",
        byTime: timeUp,
        sync: this.sync,
        miss: this.miss,
        elapsed: this.elapsed,
        dmg: winSide
          ? Math.round(TUNE.CLASH_WIN_DMG[winSide] * TUNE.INCOMING_SCALE)
          : Math.round(90 * TUNE.INCOMING_SCALE),
        burnout: winSide ? TUNE.BURNOUT[loserSide] : TUNE.DRAW_BURNOUT
      });
    } catch (e) {
      console.warn("[duel] 结算面板失败:", e);
    }
    cb.domains.onClashResolved(winner || null);
  }

  /** 契约 §1.3 快照（键名照抄） */
  debug() {
    return {
      needle: this.needle,
      lo: this.lo,
      hi: this.hi,
      sync: this.sync,
      miss: this.miss,
      tug: this.tug,
      round: this.round,
      debounce: this.lockT,
      active: this.active,
      // --- 额外口径（探针/验证用） ---
      winner: this.winner,
      elapsed: this.elapsed,
      life: this.life,
      dir: this.dir,
      width: this._width(),
      period: this._period(),
      dwellMs: this.dwellMs(),
      streak: this.streak,
      best: this.best,
      ignored: this.ignored,
      locked: this.lockT > 0,
      freeze: this.freezeT,
      pressCount: this.pressCount,
      windowSeq: this.windowSeq,
      // 双方实时数值（暂停态同步驱动时主循环快照不刷新，探针只能从这里读）
      hp: {
        gojo: this.combat.fighters[SIDE.GOJO].hp,
        sukuna: this.combat.fighters[SIDE.SUKUNA].hp
      },
      burnout: {
        gojo: this.combat.fighters[SIDE.GOJO].burnoutT,
        sukuna: this.combat.fighters[SIDE.SUKUNA].burnoutT
      }
    };
  }
};

/* ============================================================================
 * 接线
 * ========================================================================== */

/** 当前实例（HUD / reset / MECH_DEBUG 都要从全局入口拿） */
var DomainDuelCurrent = null;

/** HOOKS.clash 工厂：DomainRunner 构造时被 firstHook("clash", combat2) 调用 */
var createDomainDuel = function (combat2) {
  const inst = new DomainDuel(combat2);
  DomainDuelCurrent = inst;
  try {
    combat2.domainDuel = inst;
    // 探针句柄：__SS.duel 在 main.js 里读的是 combat.domains.clash（api 上没有 domains），
    // 所以模块自己再挂一个稳定的入口，探针用 __SS.duel || __DUEL。
    window.__DUEL = inst;
  } catch (e) {
    /* 忽略：兼容 cb / window 不可用的实现 */
  }
  return inst;
};
onHook("clash", createDomainDuel);

/** 每局重开：清干净，别把上一局的 needle/lock 带过来 */
onHook("reset", function () {
  if (DomainDuelCurrent) DomainDuelCurrent.reset();
  DomainDuelHud.hide();
  DomainDuelHud.clearResult();   // 结算大字也必须清掉（独立验证 A9：reset 后面板还挂着）
});

/**
 * HUD：由 hud.js 每帧驱动（契约 §1）。hudTick 在 title/loading 也会跑，
 * 所以可见性由本模块自己按 state 过滤。
 */
onHook("hud", function (dt) {
  DomainDuelHud.tick(dt, DomainDuelCurrent);
});

/** 契约 §1.3：模块必须自报状态 */
MECH_DEBUG.duel = function () {
  const d = DomainDuelCurrent;
  if (!d) {
    return { needle: 0, lo: 0, hi: 0, sync: 0, miss: 0, tug: 0, round: 0, debounce: 0, active: false };
  }
  return d.debug();
};

/* 探针用调试句柄：
 *   window.__DUEL          —— DomainRunner 真正在用的那个实例（探针直接驱动它）
 *   window.__DUEL_FACTORY  —— 另造一个独立实例（不进入主循环），跑纯逻辑统计 */
try {
  window.__DUEL_FACTORY = createDomainDuel;
} catch (e) {
  /* 无 window（不该发生）时忽略 */
}
