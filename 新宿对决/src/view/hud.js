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
