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
