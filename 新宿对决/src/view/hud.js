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
