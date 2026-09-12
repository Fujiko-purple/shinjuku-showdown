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
