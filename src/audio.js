  var EXP_EPS = 1e-4;
  var QUALITY2 = {
    low: { maxVoices: 20, hrtf: false, irLen: 0.7, noiseLen: 1, lookahead: 0.25, musicWet: 0.18 },
    medium: { maxVoices: 32, hrtf: true, irLen: 1.6, noiseLen: 1.5, lookahead: 0.32, musicWet: 0.26 },
    high: { maxVoices: 48, hrtf: true, irLen: 2.8, noiseLen: 2, lookahead: 0.42, musicWet: 0.32 }
  };
  var VOL_DEFAULT = { master: 0.9, sfx: 1, music: 0.55 };
  var noteHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  var MINOR = [0, 2, 3, 5, 7, 8, 10];
  var HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
  function deg(root, d, scale = MINOR) {
    const oct = Math.floor(d / 7);
    const idx = (d % 7 + 7) % 7;
    return root + scale[idx] + 12 * oct;
  }
  var clamp4 = (v, a, b) => v < a ? a : v > b ? b : v;
  function mulberry323(seed) {
    let a = seed >>> 0;
    return function() {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function isVec3(p) {
    if (!p) return false;
    if (typeof three_module_exports !== "undefined" && p instanceof Vector3) return true;
    return typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number";
  }
  var ctx = null;
  var ready = false;
  var quality = "high";
  var cfg = QUALITY2.high;
  var masterGain = null;
  var comp = null;
  var sfxBus = null;
  var musicBus = null;
  var reverbIn = null;
  var reverbInLong = null;
  var volMaster = VOL_DEFAULT.master;
  var volSfx = VOL_DEFAULT.sfx;
  var volMusic = VOL_DEFAULT.music;
  var noiseCache = /* @__PURE__ */ new Map();
  var curveCache = /* @__PURE__ */ new Map();
  var irCache = /* @__PURE__ */ new Map();
  var voices = [];
  var loops = /* @__PURE__ */ new Map();
  var tracks = /* @__PURE__ */ new Map();
  var stats = {
    nodesCreated: 0,
    disconnects: 0,
    voicesSpawned: 0,
    voicesStolen: 0,
    plays: 0,
    droppedPlays: 0,
    notes: 0,
    musicDropped: 0
  };
  function noiseBuffer(kind = "white") {
    const key = kind + "|" + quality;
    const cached = noiseCache.get(key);
    if (cached) return cached;
    const sr = ctx.sampleRate || 48e3;
    const len = Math.max(2048, Math.floor(sr * cfg.noiseLen));
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      const rnd3 = mulberry323(2654435769 + ch * 7919 + kind.length * 977);
      let b0 = 0, b1 = 0, b2 = 0, brown = 0;
      for (let i = 0; i < len; i++) {
        const w = rnd3() * 2 - 1;
        let s;
        if (kind === "pink") {
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          s = (b0 + b1 + b2 + w * 0.1848) * 0.22;
        } else if (kind === "brown") {
          brown = (brown + 0.02 * w) / 1.02;
          s = brown * 3.4;
        } else {
          s = w;
        }
        data[i] = clamp4(s, -1, 1);
      }
    }
    noiseCache.set(key, buf);
    return buf;
  }
  function makeDistortionCurve(amount = 1, n = 1024) {
    const k = Math.max(0, amount);
    const key = k + "|" + n;
    const cached = curveCache.get(key);
    if (cached) return cached;
    const curve = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const x = i * 2 / (n - 1) - 1;
      const y = Math.tanh(x * (1 + k * 0.5)) * 0.86 + Math.sin(x * Math.PI) * 0.07;
      curve[i] = y;
      if (Math.abs(y) > peak) peak = Math.abs(y);
    }
    if (peak > 0) for (let i = 0; i < n; i++) curve[i] /= peak;
    curveCache.set(key, curve);
    return curve;
  }
  function makeIR(seconds = 2, decay = 2.6, bright = 0.8) {
    const key = seconds + "|" + decay + "|" + bright + "|" + quality;
    const cached = irCache.get(key);
    if (cached) return cached;
    const sr = ctx.sampleRate || 48e3;
    const len = Math.max(256, Math.floor(sr * seconds));
    const buf = ctx.createBuffer(2, len, sr);
    const early = Math.floor(sr * 0.03);
    const earlyStep = Math.max(1, Math.floor(sr * 61e-4));
    let peak = 0;
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      const rnd3 = mulberry323(1374496523 + ch * 104729);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        const n = rnd3() * 2 - 1;
        lp += bright * (n - lp);
        let s = lp * env;
        if (i < early && i % earlyStep === 0) {
          s += (rnd3() * 2 - 1) * 0.75 * (1 - i / early);
        }
        data[i] = s;
        const a = Math.abs(s);
        if (a > peak) peak = a;
      }
    }
    if (peak > 0) {
      const k = 0.72 / peak;
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] *= k;
      }
    }
    irCache.set(key, buf);
    return buf;
  }
  function envPerc(p, t0, peak, attack = 3e-3, decay = 0.2) {
    const a = Math.max(6e-4, attack);
    const d = Math.max(4e-3, decay);
    const pk = Math.max(EXP_EPS, peak);
    p.cancelScheduledValues(t0);
    p.setValueAtTime(EXP_EPS, t0);
    p.linearRampToValueAtTime(pk, t0 + a);
    p.exponentialRampToValueAtTime(EXP_EPS, t0 + a + d);
    p.setValueAtTime(0, t0 + a + d + 8e-4);
    return t0 + a + d + 1e-3;
  }
  function envReverse(p, t0, peak, attack = 0.4, release = 0.12) {
    const a = Math.max(0.01, attack);
    const r = Math.max(5e-3, release);
    const pk = Math.max(EXP_EPS, peak);
    p.cancelScheduledValues(t0);
    p.setValueAtTime(EXP_EPS, t0);
    p.exponentialRampToValueAtTime(pk, t0 + a);
    p.exponentialRampToValueAtTime(EXP_EPS, t0 + a + r);
    p.setValueAtTime(0, t0 + a + r + 8e-4);
    return t0 + a + r + 1e-3;
  }
  function envSwell(p, t0, peak, attack = 0.4, hold = 0.6, release = 0.8) {
    const a = Math.max(5e-3, attack);
    const h = Math.max(0, hold);
    const r = Math.max(0.02, release);
    const pk = Math.max(EXP_EPS, peak);
    p.cancelScheduledValues(t0);
    p.setValueAtTime(EXP_EPS, t0);
    p.linearRampToValueAtTime(pk, t0 + a);
    p.setValueAtTime(pk, t0 + a + h);
    p.exponentialRampToValueAtTime(EXP_EPS, t0 + a + h + r);
    p.setValueAtTime(0, t0 + a + h + r + 1e-3);
    return t0 + a + h + r;
  }
  function sweep(param, f0, f1, t0, dur, exp = true) {
    const a = Math.max(12, f0);
    const b = Math.max(12, f1);
    param.setValueAtTime(a, t0);
    if (exp) param.exponentialRampToValueAtTime(b, t0 + Math.max(5e-3, dur));
    else param.linearRampToValueAtTime(b, t0 + Math.max(5e-3, dur));
  }
  var Voice = class {
    /**
     * @param {string} name     来源音效名
     * @param {number} endTime  预计结束时间（ctx 时间轴）
     * @param {number} priority 越大越不容易被抢断（音乐 = 0，SFX = 1，招牌音效 = 2）
     */
    constructor(name, endTime, priority = 1) {
      this.name = name;
      this.endTime = endTime;
      this.priority = priority;
      this.nodes = [];
      this.dead = false;
    }
    /** 登记节点；若本 Voice 已被抢断，则立刻断开新节点，避免泄漏 */
    own(node) {
      if (!node) return node;
      if (this.dead) {
        try {
          if (typeof node.disconnect === "function") {
            node.disconnect();
            stats.disconnects++;
          }
        } catch (e) {
        }
        return node;
      }
      this.nodes.push(node);
      stats.nodesCreated++;
      return node;
    }
    /** 断开全部节点（幂等）。已调度的 source 会提前 stop()，省 CPU。 */
    dispose() {
      if (this.dead) return;
      this.dead = true;
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (!n) continue;
        if (n.__started && typeof n.stop === "function") {
          try {
            n.stop();
          } catch (e) {
          }
        }
        try {
          if (typeof n.disconnect === "function") {
            n.disconnect();
            stats.disconnects++;
          }
        } catch (e) {
        }
      }
      this.nodes.length = 0;
    }
  };
  function registerVoice(v) {
    voices.push(v);
    stats.voicesSpawned++;
    while (voices.length > cfg.maxVoices) {
      let idx = -1;
      let bestPrio = Infinity;
      for (let i = 0; i < voices.length; i++) {
        const c = voices[i];
        if (c === v) continue;
        if (c.priority < bestPrio) {
          bestPrio = c.priority;
          idx = i;
        }
      }
      if (idx < 0) break;
      const victim = voices.splice(idx, 1)[0];
      victim.dispose();
      stats.voicesStolen++;
    }
  }
  function sweepVoices(now2) {
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      if (v.dead) {
        voices.splice(i, 1);
        continue;
      }
      if (now2 >= v.endTime) {
        v.dispose();
        voices.splice(i, 1);
      }
    }
  }
  var Rig = class {
    constructor(name, t0, opts = {}) {
      this.name = name;
      this.tail = opts.tail ?? 0.35;
      this.bus = opts.bus || sfxBus;
      this.rate = opts.rate ?? 1;
      this.cents = (opts.detune ?? 0) + (opts.rate ? 1200 * Math.log2(clamp4(opts.rate, 0.25, 4)) : 0);
      this.voice = new Voice(name, t0 + 0.1, opts.priority ?? 1);
      registerVoice(this.voice);
      this.out = this.own(ctx.createGain());
      this.out.gain.value = opts.gain ?? 1;
      const wet = opts.wet ?? 0.12;
      if (wet > 1e-3 && reverbIn) {
        const w = this.own(ctx.createGain());
        w.gain.value = wet;
        this.out.connect(w);
        w.connect(reverbIn);
      }
      const longWet = opts.long ?? 0;
      if (longWet > 1e-3 && reverbInLong) {
        const w2 = this.own(ctx.createGain());
        w2.gain.value = longWet;
        this.out.connect(w2);
        w2.connect(reverbInLong);
      }
      const pos = opts.pos;
      if (isVec3(pos)) {
        const pan = this.own(makePanner(pos, t0));
        this.out.connect(pan);
        pan.connect(this.bus);
        this.panner = pan;
      } else if (opts.pan) {
        const sp = this.own(ctx.createStereoPanner());
        sp.pan.value = clamp4(opts.pan, -1, 1);
        this.out.connect(sp);
        sp.connect(this.bus);
      } else {
        this.out.connect(this.bus);
      }
    }
    own(n) {
      return this.voice.own(n);
    }
    /** 振荡器（自动叠加整体变调） */
    osc(type = "sine", cents = 0) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = this.cents + cents;
      this.own(o);
      return o;
    }
    /** 噪声源（循环播放，短包络靠 gain 控制；buffer 全局共享） */
    noise(kind = "white") {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(kind);
      s.loop = true;
      s.playbackRate.value = clamp4(this.rate, 0.25, 4);
      this.own(s);
      return s;
    }
    gain(v = 1) {
      const g = ctx.createGain();
      g.gain.value = v;
      this.own(g);
      return g;
    }
    filter(type = "lowpass", freq = 1e3, q = 1) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      this.own(f);
      return f;
    }
    shaper(amount = 8) {
      const w = ctx.createWaveShaper();
      w.curve = makeDistortionCurve(amount);
      w.oversample = "2x";
      this.own(w);
      return w;
    }
    pan2(v = 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp4(v, -1, 1);
      this.own(p);
      return p;
    }
    /** 延迟（可做梳状滤波 / 反馈）。注意：必须走 own()，否则延迟节点会漏回收 */
    delayBox(time = 0.01, fb = 0.5, mix = 0.5) {
      const d = this.own(ctx.createDelay(1.5));
      d.delayTime.value = clamp4(time, 5e-4, 1.4);
      const fbg = this.gain(fb);
      const outg = this.gain(mix);
      d.connect(fbg);
      fbg.connect(d);
      d.connect(outg);
      return { input: d, output: outg, delay: d };
    }
    /** 顺序连接，返回末端节点 */
    link(...ns) {
      for (let i = 0; i + 1 < ns.length; i++) ns[i].connect(ns[i + 1]);
      return ns[ns.length - 1];
    }
    /** 启动一个 source 并预约停止；同时推进 Voice 结束时间 */
    src(node, t, dur) {
      const d = Math.max(0.012, dur);
      node.start(t);
      node.__started = true;
      node.stop(t + d);
      const end = t + d + this.tail;
      if (end > this.voice.endTime) this.voice.endTime = end;
      return node;
    }
  };
  function makePanner(pos, t0) {
    const p = ctx.createPanner();
    p.panningModel = cfg.hrtf ? "HRTF" : "equalpower";
    p.distanceModel = "inverse";
    p.refDistance = 8;
    p.maxDistance = 500;
    p.rolloffFactor = 1;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 360;
    p.coneOuterGain = 1;
    if (p.positionX) {
      p.positionX.setValueAtTime(pos.x, t0);
      p.positionY.setValueAtTime(pos.y, t0);
      p.positionZ.setValueAtTime(pos.z, t0);
    } else if (typeof p.setPosition === "function") {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    return p;
  }
  function noiseHit(rig, t0, o = {}) {
    const dur = o.dur ?? 0.06;
    const src = rig.noise(o.kind || "white");
    const flt = rig.filter(o.type || "bandpass", o.f0 ?? 2e3, o.q ?? 1);
    if (o.f1) sweep(flt.frequency, o.f0 ?? 2e3, o.f1, t0, dur * (o.sweep ?? 1));
    const g = rig.gain(0);
    rig.link(src, flt, g);
    g.connect(rig.out);
    envPerc(g.gain, t0, o.peak ?? 0.4, o.attack ?? 1e-3, o.decay ?? dur);
    rig.src(src, t0, dur + 0.02);
    return g;
  }
  function impactBody(rig, t0, o = {}) {
    const f0 = o.f0 ?? 120, f1 = o.f1 ?? 40;
    const dur = o.dur ?? 0.22, peak = o.peak ?? 0.95;
    const oscn = rig.osc("sine");
    sweep(oscn.frequency, f0, f1, t0, dur * 0.8);
    const sh = rig.shaper(o.dist ?? 10);
    const lp = rig.filter("lowpass", o.lp ?? 900, 0.7);
    const g = rig.gain(0);
    rig.link(oscn, sh, lp, g);
    g.connect(rig.out);
    envPerc(g.gain, t0, peak, o.attack ?? 4e-3, dur);
    rig.src(oscn, t0, dur + 0.04);
    if (o.sub) {
      const sub = rig.osc("sine");
      sub.frequency.setValueAtTime(o.sub, t0);
      const sg = rig.gain(0);
      rig.link(sub, sg);
      sg.connect(rig.out);
      envPerc(sg.gain, t0, peak * 0.7, 8e-3, dur * 1.4);
      rig.src(sub, t0, dur * 1.5);
    }
    if (o.click !== false) {
      noiseHit(rig, t0, {
        type: o.clickType || "bandpass",
        f0: o.clickF ?? 2200,
        f1: (o.clickF ?? 2200) * 0.4,
        q: 0.9,
        peak: peak * (o.clickAmp ?? 0.34),
        decay: o.clickDur ?? 0.05,
        dur: o.clickDur ?? 0.05
      });
    }
    return t0 + dur * (o.sub ? 1.5 : 1) + 0.05;
  }
  function metalStrike(rig, t0, o = {}) {
    const base = o.freq ?? 1760;
    const dur = o.dur ?? 0.3;
    const peak = o.peak ?? 0.3;
    const ratios = o.ratios || [1, 1.51, 2.37];
    ratios.forEach((r, i) => {
      const oscn = rig.osc(i === 0 ? "square" : "triangle");
      sweep(oscn.frequency, base * r, base * r * 0.91, t0, dur);
      const bp = rig.filter("bandpass", base * r * 1.12, 3.4);
      const g = rig.gain(0);
      rig.link(oscn, bp, g);
      g.connect(rig.out);
      envPerc(g.gain, t0, peak / (1 + i * 0.7), 1e-3, dur * (1 - i * 0.16));
      rig.src(oscn, t0, dur + 0.03);
    });
    noiseHit(rig, t0, { type: "highpass", f0: 4200, q: 0.7, peak: peak * 0.7, decay: 0.05, dur: 0.05 });
    return t0 + dur;
  }
  function bellFM(rig, t0, o = {}) {
    const f = o.freq ?? 880;
    const dur = o.dur ?? 1.6;
    const idx = o.index ?? 3;
    const car = rig.osc("sine");
    car.frequency.value = f;
    const mod = rig.osc("sine");
    mod.frequency.value = f * (o.ratio ?? 2.76);
    const modG = rig.gain(f * idx);
    modG.gain.setValueAtTime(f * idx, t0);
    modG.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.02), t0 + dur * 0.45);
    mod.connect(modG);
    modG.connect(car.frequency);
    const g = rig.gain(0);
    car.connect(g);
    g.connect(rig.out);
    envPerc(g.gain, t0, o.peak ?? 0.16, 2e-3, dur);
    rig.src(car, t0, dur + 0.05);
    rig.src(mod, t0, dur + 0.05);
    return t0 + dur;
  }
  function vocalFormant(rig, t0, o = {}) {
    const dur = o.dur ?? 1.8;
    const src = rig.noise(o.kind || "pink");
    const glot = rig.filter("lowpass", o.buzz ?? 300, 5.5);
    const pre = rig.gain(1);
    rig.link(src, glot, pre);
    const sum = rig.gain(0);
    const formants = o.formants || [[720, 1], [1240, 0.62], [2600, 0.3]];
    formants.forEach(([fq, amt]) => {
      const bp = rig.filter("bandpass", fq, 7);
      const g = rig.gain(amt);
      pre.connect(bp);
      bp.connect(g);
      g.connect(sum);
    });
    sum.connect(rig.out);
    envSwell(sum.gain, t0, o.peak ?? 0.15, o.attack ?? 0.6, dur * 0.45, o.release ?? 0.8);
    if (o.drift) {
      const lfo = rig.osc("sine");
      lfo.frequency.value = o.drift;
      const la = rig.gain(140);
      lfo.connect(la);
      la.connect(glot.frequency);
      rig.src(lfo, t0, dur + 0.1);
    }
    rig.src(src, t0, dur + 0.3);
    return t0 + dur;
  }
  function combBox(rig, input, time = 9e-3, fb = 0.62, mix = 0.6) {
    const box = rig.delayBox(time, fb, mix);
    input.connect(box.input);
    return box.output;
  }
  function haasWiden(rig, srcNode, delayMs = 13) {
    const dL = rig.own(ctx.createDelay(0.2));
    dL.delayTime.value = 6e-4;
    const dR = rig.own(ctx.createDelay(0.2));
    dR.delayTime.value = clamp4(delayMs / 1e3, 1e-3, 0.05);
    const merger = rig.own(ctx.createChannelMerger(2));
    srcNode.connect(dL);
    srcNode.connect(dR);
    dL.connect(merger, 0, 0);
    dR.connect(merger, 0, 1);
    return merger;
  }
  function playPunch(rig, t0) {
    return impactBody(rig, t0, { f0: 124, f1: 42, dur: 0.2, peak: 0.95, dist: 11, lp: 820, clickF: 2400, clickAmp: 0.36 });
  }
  function playKick(rig, t0) {
    return impactBody(rig, t0, {
      f0: 96,
      f1: 30,
      dur: 0.34,
      peak: 1,
      dist: 16,
      lp: 620,
      sub: 54,
      clickF: 3300,
      clickAmp: 0.3,
      clickDur: 0.04
    });
  }
  function playBlackflash(rig, t0) {
    const boom = t0 + 0.06;
    noiseHit(rig, t0, { type: "highpass", f0: 7200, q: 0.6, peak: 0.05, decay: 8e-3, dur: 0.012 });
    const sub = rig.osc("sine");
    sweep(sub.frequency, 80, 26, boom, 0.55);
    const subSh = rig.shaper(14);
    const subG = rig.gain(0);
    rig.link(sub, subSh, subG);
    subG.connect(rig.out);
    envPerc(subG.gain, boom, 1.25, 3e-3, 0.85);
    rig.src(sub, boom, 1.1);
    const burst = rig.noise("white");
    const bLp = rig.filter("lowpass", 14e3, 1.1);
    sweep(bLp.frequency, 14e3, 180, boom, 0.75);
    const bG = rig.gain(0);
    rig.link(burst, bLp, bG);
    bG.connect(rig.out);
    envPerc(bG.gain, boom, 0.95, 2e-3, 0.8);
    rig.src(burst, boom, 1);
    const crunch = rig.noise("brown");
    const cBp = rig.filter("bandpass", 420, 0.8);
    sweep(cBp.frequency, 900, 160, boom, 0.4);
    const cSh = rig.shaper(24);
    const cG = rig.gain(0);
    rig.link(crunch, cBp, cSh, cG);
    cG.connect(rig.out);
    envPerc(cG.gain, boom, 0.7, 3e-3, 0.5);
    rig.src(crunch, boom, 0.7);
    noiseHit(rig, boom, { type: "highpass", f0: 5200, q: 0.7, peak: 0.65, decay: 0.045, dur: 0.05 });
    noiseHit(rig, boom + 5e-3, { type: "bandpass", f0: 9e3, f1: 2600, q: 1.4, peak: 0.35, decay: 0.09, dur: 0.1 });
    const tail = rig.osc("sine");
    tail.frequency.value = 45;
    const tG = rig.gain(0);
    rig.link(tail, tG);
    tG.connect(rig.out);
    envPerc(tG.gain, boom + 0.02, 0.5, 0.02, 1.6);
    rig.src(tail, boom, 1.8);
    duckMusic(0.25, 0.15, 1.6);
    return boom + 2;
  }
  function playBlock(rig, t0) {
    const metal = rig.gain(1);
    const comb = combBox(rig, metal, 71e-4, 0.55, 0.5);
    comb.connect(rig.out);
    [[1560, 0.3], [2340, 0.22]].forEach(([f, a], i) => {
      const o = rig.osc("square");
      sweep(o.frequency, f, f * 0.86, t0, 0.16);
      const bp = rig.filter("bandpass", f * 1.1, 6);
      const g = rig.gain(a);
      rig.link(o, bp, g);
      g.connect(metal);
      envPerc(g.gain, t0, a, 1e-3, i === 0 ? 0.15 : 0.1);
      rig.src(o, t0, 0.2);
    });
    noiseHit(rig, t0, { type: "highpass", f0: 4600, q: 0.8, peak: 0.24, decay: 0.045, dur: 0.05 });
    return t0 + 0.32;
  }
  function playGuardInfinity(rig, t0) {
    const partials = [880, 1320, 1760, 2640, 3520];
    partials.forEach((f, i) => {
      const o = rig.osc("sine");
      sweep(o.frequency, f * 0.98, f * 1.02, t0, 1.1, false);
      const g2 = rig.gain(0);
      rig.link(o, g2);
      g2.connect(rig.out);
      envSwell(g2.gain, t0 + i * 0.02, 0.075 / (1 + i * 0.35), 0.18 + i * 0.03, 0.4, 0.5);
      rig.src(o, t0, 1.3);
    });
    const air = rig.noise("pink");
    const bp = rig.filter("bandpass", 3200, 9);
    sweep(bp.frequency, 1600, 5200, t0, 1);
    const g = rig.gain(0);
    rig.link(air, bp, g);
    g.connect(rig.out);
    envSwell(g.gain, t0, 0.09, 0.4, 0.3, 0.5);
    rig.src(air, t0, 1.3);
    return t0 + 1.3;
  }
  function playWhoosh(rig, t0) {
    const src = rig.noise("white");
    const bp = rig.filter("bandpass", 300, 1.3);
    sweep(bp.frequency, 320, 4200, t0, 0.38);
    const g = rig.gain(0);
    rig.link(src, bp, g);
    g.connect(rig.out);
    envSwell(g.gain, t0, 0.34, 0.11, 0.06, 0.2);
    rig.src(src, t0, 0.46);
    const body = rig.noise("brown");
    const lp = rig.filter("lowpass", 500, 0.7);
    const bg = rig.gain(0);
    rig.link(body, lp, bg);
    bg.connect(rig.out);
    envSwell(bg.gain, t0, 0.2, 0.14, 0.05, 0.16);
    rig.src(body, t0, 0.44);
    return t0 + 0.5;
  }
  function playDash(rig, t0) {
    const dop = rig.osc("sawtooth");
    dop.frequency.setValueAtTime(280, t0);
    dop.frequency.exponentialRampToValueAtTime(880, t0 + 0.16);
    dop.frequency.exponentialRampToValueAtTime(360, t0 + 0.5);
    const lp = rig.filter("lowpass", 1800, 3.2);
    sweep(lp.frequency, 900, 2600, t0, 0.2);
    sweep(lp.frequency, 2600, 500, t0 + 0.2, 0.32);
    const g = rig.gain(0);
    rig.link(dop, lp, g);
    g.connect(rig.out);
    envSwell(g.gain, t0, 0.28, 0.05, 0.15, 0.3);
    rig.src(dop, t0, 0.56);
    const air = rig.noise("white");
    const bp = rig.filter("bandpass", 700, 1.6);
    sweep(bp.frequency, 500, 3800, t0, 0.22);
    sweep(bp.frequency, 3800, 900, t0 + 0.22, 0.3);
    const ag = rig.gain(0);
    rig.link(air, bp, ag);
    ag.connect(rig.out);
    envSwell(ag.gain, t0, 0.3, 0.06, 0.12, 0.28);
    rig.src(air, t0, 0.56);
    return t0 + 0.62;
  }
  function playLand(rig, t0) {
    const end = impactBody(rig, t0, {
      f0: 88,
      f1: 34,
      dur: 0.26,
      peak: 0.85,
      dist: 8,
      lp: 700,
      sub: 48,
      clickType: "lowpass",
      clickF: 1200,
      clickAmp: 0.5,
      clickDur: 0.07
    });
    const rnd3 = mulberry323(1715004);
    for (let i = 0; i < 6; i++) {
      const t = t0 + 0.04 + rnd3() * 0.22;
      noiseHit(rig, t, { type: "bandpass", f0: 1800 + rnd3() * 3e3, q: 4, peak: 0.06, decay: 0.04, dur: 0.05 });
    }
    return end + 0.3;
  }
  function playBlueCharge(rig, t0) {
    const dur = 1.35;
    const src = rig.noise("white");
    const bp = rig.filter("bandpass", 180, 13);
    sweep(bp.frequency, 180, 3200, t0, dur);
    const g = rig.gain(0);
    rig.link(src, bp, g);
    g.connect(rig.out);
    envSwell(g.gain, t0, 0.34, dur * 0.85, 0.05, 0.18);
    rig.src(src, t0, dur + 0.2);
    const o = rig.osc("sine");
    sweep(o.frequency, 90, 620, t0, dur);
    const og = rig.gain(0);
    rig.link(o, og);
    og.connect(rig.out);
    envSwell(og.gain, t0, 0.3, dur * 0.9, 0.04, 0.16);
    rig.src(o, t0, dur + 0.2);
    const sub = rig.osc("sine");
    sweep(sub.frequency, 40, 118, t0, dur);
    const sg = rig.gain(0);
    rig.link(sub, sg);
    sg.connect(rig.out);
    envSwell(sg.gain, t0, 0.4, dur * 0.95, 0.03, 0.16);
    rig.src(sub, t0, dur + 0.2);
    return t0 + dur + 0.3;
  }
  function playBlueFire(rig, t0) {
    const atk = 0.5;
    const boom = t0 + atk;
    const src = rig.noise("white");
    const lp = rig.filter("lowpass", 260, 2.2);
    sweep(lp.frequency, 220, 5200, t0, atk);
    const g = rig.gain(0);
    rig.link(src, lp, g);
    g.connect(rig.out);
    envReverse(g.gain, t0, 0.8, atk, 0.45);
    rig.src(src, t0, atk + 0.5);
    const sub = rig.osc("sine");
    sweep(sub.frequency, 44, 32, t0, atk);
    const sh = rig.shaper(12);
    const sg = rig.gain(0);
    rig.link(sub, sh, sg);
    sg.connect(rig.out);
    envReverse(sg.gain, t0, 0.95, atk, 0.7);
    rig.src(sub, t0, atk + 0.8);
    noiseHit(rig, boom, { type: "lowpass", f0: 12e3, f1: 300, q: 0.9, peak: 0.5, decay: 0.35, dur: 0.4 });
    noiseHit(rig, boom, { type: "highpass", f0: 3800, q: 0.8, peak: 0.3, decay: 0.08, dur: 0.09 });
    return t0 + atk + 0.9;
  }
  function playRedCharge(rig, t0) {
    const dur = 0.9;
    const saw = rig.osc("sawtooth");
    sweep(saw.frequency, 70, 430, t0, dur);
    const lp = rig.filter("lowpass", 900, 6);
    sweep(lp.frequency, 400, 2600, t0, dur);
    const sh = rig.shaper(9);
    const g = rig.gain(0);
    rig.link(saw, lp, sh, g);
    g.connect(rig.out);
    envSwell(g.gain, t0, 0.34, dur * 0.9, 0.03, 0.14);
    rig.src(saw, t0, dur + 0.2);
    let t = t0 + 0.05;
    let gap = 0.14;
    while (t < t0 + dur - 0.02) {
      noiseHit(rig, t, { type: "bandpass", f0: 1400, q: 6, peak: 0.16, decay: 0.045, dur: 0.05 });
      t += gap;
      gap = Math.max(0.045, gap * 0.82);
    }
    const src = rig.noise("white");
    const bp = rig.filter("bandpass", 500, 11);
    sweep(bp.frequency, 500, 4200, t0, dur);
    const bg = rig.gain(0);
    rig.link(src, bp, bg);
    bg.connect(rig.out);
    envSwell(bg.gain, t0, 0.24, dur * 0.9, 0.02, 0.12);
    rig.src(src, t0, dur + 0.2);
    return t0 + dur + 0.3;
  }
  function playRedFire(rig, t0) {
    const sub = rig.osc("sine");
    sweep(sub.frequency, 105, 28, t0, 0.5);
    const subSh = rig.shaper(18);
    const sg = rig.gain(0);
    rig.link(sub, subSh, sg);
    sg.connect(rig.out);
    envPerc(sg.gain, t0, 1.15, 2e-3, 0.75);
    rig.src(sub, t0, 0.95);
    const burst = rig.noise("white");
    const lp = rig.filter("lowpass", 16e3, 1.2);
    sweep(lp.frequency, 16e3, 150, t0, 0.9);
    const bg = rig.gain(0);
    rig.link(burst, lp, bg);
    bg.connect(rig.out);
    envPerc(bg.gain, t0, 0.9, 2e-3, 0.95);
    rig.src(burst, t0, 1.1);
    const mid = rig.noise("pink");
    const bp = rig.filter("bandpass", 800, 1.1);
    sweep(bp.frequency, 2200, 240, t0, 0.6);
    const mg = rig.gain(0);
    rig.link(mid, bp, mg);
    mg.connect(rig.out);
    envPerc(mg.gain, t0, 0.55, 4e-3, 0.6);
    rig.src(mid, t0, 0.75);
    noiseHit(rig, t0, { type: "highpass", f0: 6e3, q: 0.7, peak: 0.45, decay: 0.07, dur: 0.08 });
    duckMusic(0.35, 0.1, 1.6);
    return t0 + 1.6;
  }
  function playPurpleCharge(rig, t0) {
    const dur = 2.5;
    const rumble = rig.noise("brown");
    const rlp = rig.filter("lowpass", 90, 3.5);
    sweep(rlp.frequency, 55, 180, t0, dur);
    const rg = rig.gain(0);
    rig.link(rumble, rlp, rg);
    rg.connect(rig.out);
    rg.gain.setValueAtTime(EXP_EPS, t0);
    rg.gain.exponentialRampToValueAtTime(0.75, t0 + dur * 0.92);
    rg.gain.exponentialRampToValueAtTime(EXP_EPS, t0 + dur + 0.25);
    rig.src(rumble, t0, dur + 0.35);
    const sub = rig.osc("sine");
    sweep(sub.frequency, 30, 92, t0, dur);
    const sg = rig.gain(0);
    rig.link(sub, sg);
    sg.connect(rig.out);
    sg.gain.setValueAtTime(EXP_EPS, t0);
    sg.gain.exponentialRampToValueAtTime(0.55, t0 + dur * 0.95);
    sg.gain.exponentialRampToValueAtTime(EXP_EPS, t0 + dur + 0.2);
    rig.src(sub, t0, dur + 0.3);
    [[1180, 0], [1790, 14]].forEach(([f, cents]) => {
      const o = rig.osc("sawtooth", cents);
      sweep(o.frequency, f, f * 2.1, t0, dur);
      const bp = rig.filter("bandpass", 1400, 5.5);
      sweep(bp.frequency, 1e3, 4200, t0, dur);
      const g = rig.gain(0);
      rig.link(o, bp, g);
      g.connect(rig.out);
      g.gain.setValueAtTime(EXP_EPS, t0 + 0.1);
      g.gain.exponentialRampToValueAtTime(0.13, t0 + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(EXP_EPS, t0 + dur + 0.15);
      rig.src(o, t0, dur + 0.25);
    });
    let t = t0 + 0.12;
    let gap = 0.3;
    while (t < t0 + dur - 0.03) {
      const k = (t - t0) / dur;
      const osc = rig.osc("sine");
      sweep(osc.frequency, 320 + k * 900, 120 + k * 300, t, 0.07);
      const g = rig.gain(0);
      rig.link(osc, g);
      g.connect(rig.out);
      envPerc(g.gain, t, 0.1 + k * 0.18, 2e-3, 0.075);
      rig.src(osc, t, 0.1);
      noiseHit(rig, t, { type: "bandpass", f0: 2200 + k * 2600, q: 8, peak: 0.08 + k * 0.08, decay: 0.035, dur: 0.04 });
      t += gap;
      gap = Math.max(0.05, gap * 0.86);
    }
    const suck = rig.noise("white");
    const sbp = rig.filter("bandpass", 300, 14);
    sweep(sbp.frequency, 240, 5200, t0 + dur * 0.5, dur * 0.55);
    const skg = rig.gain(0);
    rig.link(suck, sbp, skg);
    skg.connect(rig.out);
    envSwell(skg.gain, t0 + dur * 0.5, 0.2, dur * 0.4, 0.05, 0.12);
    rig.src(suck, t0, dur + 0.3);
    return t0 + dur + 0.4;
  }
  function playPurpleFire(rig, t0) {
    const dur = 3.2;
    const core = rig.noise("white");
    const bp = rig.filter("bandpass", 420, 6);
    sweep(bp.frequency, 380, 2400, t0, dur);
    const hp = rig.filter("highpass", 180, 0.7);
    const g = rig.gain(0);
    rig.link(core, bp, hp, g);
    g.connect(rig.out);
    const comb = combBox(rig, g, 0.0127, 0.5, 0.45);
    comb.connect(rig.out);
    envSwell(g.gain, t0, 0.62, 0.12, dur * 0.7, 0.45);
    rig.src(core, t0, dur + 0.5);
    [[620, 16], [930, 12]].forEach(([f, q]) => {
      const s2 = rig.noise("pink");
      const b2 = rig.filter("bandpass", f, q);
      sweep(b2.frequency, f, f * 1.9, t0, dur);
      const g2 = rig.gain(0);
      rig.link(s2, b2, g2);
      g2.connect(rig.out);
      envSwell(g2.gain, t0, 0.2, 0.2, dur * 0.65, 0.5);
      rig.src(s2, t0, dur + 0.5);
    });
    const sub = rig.osc("sine");
    sweep(sub.frequency, 52, 74, t0, dur);
    const sh = rig.shaper(10);
    const sg = rig.gain(0);
    rig.link(sub, sh, sg);
    sg.connect(rig.out);
    envSwell(sg.gain, t0, 0.6, 0.1, dur * 0.75, 0.5);
    rig.src(sub, t0, dur + 0.6);
    [-9, 7].forEach((cents) => {
      const o = rig.osc("sawtooth", cents);
      sweep(o.frequency, 160, 310, t0, dur);
      const lp = rig.filter("lowpass", 1400, 4);
      const og = rig.gain(0);
      rig.link(o, lp, og);
      og.connect(rig.out);
      envSwell(og.gain, t0, 0.13, 0.25, dur * 0.6, 0.5);
      rig.src(o, t0, dur + 0.6);
    });
    noiseHit(rig, t0, { type: "lowpass", f0: 13e3, f1: 400, q: 0.8, peak: 0.5, decay: 0.3, dur: 0.35 });
    noiseHit(rig, t0 + dur, { type: "highpass", f0: 4200, q: 0.8, peak: 0.28, decay: 0.2, dur: 0.25 });
    duckMusic(0.4, 0.2, 2);
    return t0 + dur + 0.8;
  }
  function playPurple200Fire(rig, t0) {
    const dur = 4.6;
    const core = rig.noise("white");
    const bp = rig.filter("bandpass", 340, 5);
    sweep(bp.frequency, 300, 3e3, t0, dur * 0.8);
    const g = rig.gain(0);
    rig.link(core, bp, g);
    g.connect(rig.out);
    const comb = combBox(rig, g, 0.0151, 0.55, 0.5);
    comb.connect(rig.out);
    envSwell(g.gain, t0, 0.8, 0.1, dur * 0.72, 0.7);
    rig.src(core, t0, dur + 0.6);
    const wide = rig.noise("white");
    const lp = rig.filter("lowpass", 15e3, 1);
    sweep(lp.frequency, 15e3, 300, t0 + 0.05, dur * 0.75);
    const wg = rig.gain(0);
    rig.link(wide, lp, wg);
    wg.connect(rig.out);
    envSwell(wg.gain, t0, 0.75, 0.06, dur * 0.7, 0.7);
    rig.src(wide, t0, dur + 0.6);
    [33, 41, 49].forEach((f, i) => {
      const o = rig.osc("sine");
      sweep(o.frequency, f * 0.92, f, t0, dur * 0.6);
      const sh = rig.shaper(12);
      const og = rig.gain(0);
      rig.link(o, sh, og);
      og.connect(rig.out);
      envSwell(og.gain, t0, 0.42 / (1 + i * 0.4), 0.15, dur * 0.55, 3);
      rig.src(o, t0, dur + 3.2);
    });
    const infra = rig.noise("brown");
    const ilp = rig.filter("lowpass", 60, 4);
    const ig = rig.gain(0);
    rig.link(infra, ilp, ig);
    ig.connect(rig.out);
    envSwell(ig.gain, t0, 0.9, 0.3, dur * 0.6, 3.1);
    rig.src(infra, t0, dur + 3.4);
    const rnd3 = mulberry323(195936478);
    const crash2 = rig.noise("brown");
    const clp = rig.filter("lowpass", 260, 1.4);
    const cg = rig.gain(0);
    rig.link(crash2, clp, cg);
    cg.connect(rig.out);
    cg.gain.setValueAtTime(EXP_EPS, t0 + 0.25);
    for (let i = 0; i < 7; i++) {
      const tt = t0 + 0.3 + i * 0.42 + rnd3() * 0.12;
      cg.gain.exponentialRampToValueAtTime(0.18 + rnd3() * 0.4, tt);
      cg.gain.exponentialRampToValueAtTime(0.06 + rnd3() * 0.12, tt + 0.2 + rnd3() * 0.25);
    }
    cg.gain.exponentialRampToValueAtTime(EXP_EPS, t0 + dur + 1.2);
    rig.src(crash2, t0 + 0.25, dur + 1.3);
    for (let i = 0; i < 14; i++) {
      const tt = t0 + 0.35 + rnd3() * (dur - 0.5);
      noiseHit(rig, tt, {
        type: "bandpass",
        f0: 220 + rnd3() * 900,
        q: 1.6,
        peak: 0.05 + rnd3() * 0.1,
        decay: 0.25 + rnd3() * 0.5,
        dur: 0.8,
        sweep: 0.5,
        f1: 120 + rnd3() * 200
      });
    }
    noiseHit(rig, t0, { type: "lowpass", f0: 16e3, f1: 220, q: 0.9, peak: 0.95, decay: 0.55, dur: 0.6 });
    noiseHit(rig, t0, { type: "highpass", f0: 5e3, q: 0.7, peak: 0.5, decay: 0.12, dur: 0.14 });
    duckMusic(0.18, 0.6, 3.4);
    return t0 + dur + 3.4;
  }
  function playDismantle(rig, t0) {
    noiseHit(rig, t0, { type: "highpass", f0: 7600, q: 0.8, peak: 0.5, decay: 0.02, dur: 0.024, attack: 4e-4 });
    noiseHit(rig, t0, { type: "bandpass", f0: 11e3, f1: 4200, q: 2.2, peak: 0.3, decay: 0.028, dur: 0.032 });
    [[6100, 0.26], [8900, 0.16], [4300, 0.12]].forEach(([f, a], i) => {
      const o = rig.osc("sine", i * 6);
      sweep(o.frequency, f, f * 0.14, t0, 0.09);
      const g = rig.gain(0);
      rig.link(o, g);
      g.connect(rig.out);
      envPerc(g.gain, t0, a, 8e-4, 0.085);
      rig.src(o, t0, 0.11);
    });
    noiseHit(rig, t0 + 0.01, { type: "bandpass", f0: 5200, f1: 1600, q: 1.1, peak: 0.09, decay: 0.07, dur: 0.09 });
    return t0 + 0.2;
  }
  function playCleave(rig, t0) {
    const gaps = [0, 0.055, 0.041, 0.068, 0.047, 0.13];
    const pans = [-0.45, 0.4, -0.2, 0.5, 0.05, 0];
    let t = t0;
    for (let i = 0; i < gaps.length; i++) {
      t += gaps[i];
      const heavy = i === gaps.length - 1;
      const p = rig.pan2(pans[i]);
      p.connect(rig.out);
      const f = 7e3 + i % 3 * 1500;
      const src = rig.noise("white");
      const hp = rig.filter("highpass", f, 0.9);
      sweep(hp.frequency, f, f * 0.45, t, 0.05);
      const g = rig.gain(0);
      rig.link(src, hp, g);
      g.connect(p);
      envPerc(g.gain, t, heavy ? 0.6 : 0.42, 6e-4, heavy ? 0.045 : 0.024);
      rig.src(src, t, heavy ? 0.07 : 0.045);
      const o = rig.osc("sine");
      sweep(o.frequency, 5200 + i * 700, 900, t, 0.08);
      const og = rig.gain(0);
      rig.link(o, og);
      og.connect(p);
      envPerc(og.gain, t, heavy ? 0.3 : 0.18, 8e-4, 0.08);
      rig.src(o, t, 0.1);
      if (heavy) {
        impactBody(rig, t + 0.01, { f0: 150, f1: 45, dur: 0.22, peak: 0.7, dist: 12, lp: 700, click: false });
      }
    }
    return t + 0.4;
  }
  function playFurnace(rig, t0) {
    const dur = 2.3;
    const rnd3 = mulberry323(8342044);
    const fire = rig.noise("white");
    const bp = rig.filter("bandpass", 700, 1.4);
    const g = rig.gain(0);
    rig.link(fire, bp, g);
    g.connect(rig.out);
    [[3.1, 520], [7.3, 260], [13.7, 140]].forEach(([rate, amt]) => {
      const lfo = rig.osc("sine");
      lfo.frequency.value = rate;
      const la = rig.gain(amt);
      lfo.connect(la);
      la.connect(bp.frequency);
      rig.src(lfo, t0, dur + 0.2);
    });
    [[2.3, 0.22], [5.9, 0.12]].forEach(([rate, amt]) => {
      const lfo = rig.osc("sine");
      lfo.frequency.value = rate;
      const la = rig.gain(amt);
      lfo.connect(la);
      la.connect(g.gain);
      rig.src(lfo, t0, dur + 0.2);
    });
    bp.frequency.setValueAtTime(620, t0);
    sweep(bp.frequency, 620, 1800, t0, dur);
    envSwell(g.gain, t0, 0.42, 0.18, dur * 0.6, 0.7);
    rig.src(fire, t0, dur + 0.3);
    const rumble = rig.noise("brown");
    const lp = rig.filter("lowpass", 140, 2.4);
    const rg = rig.gain(0);
    rig.link(rumble, lp, rg);
    rg.connect(rig.out);
    envSwell(rg.gain, t0, 0.5, 0.25, dur * 0.6, 0.7);
    rig.src(rumble, t0, dur + 0.3);
    const hiss = rig.noise("white");
    const hp = rig.filter("highpass", 4200, 0.8);
    const hg = rig.gain(0);
    rig.link(hiss, hp, hg);
    hg.connect(rig.out);
    envSwell(hg.gain, t0, 0.14, 0.4, dur * 0.5, 0.8);
    rig.src(hiss, t0, dur + 0.3);
    for (let i = 0; i < 22; i++) {
      const t = t0 + 0.1 + rnd3() * (dur - 0.3);
      noiseHit(rig, t, { type: "bandpass", f0: 1200 + rnd3() * 4200, q: 5, peak: 0.04 + rnd3() * 0.09, decay: 0.02 + rnd3() * 0.04, dur: 0.08 });
    }
    return t0 + dur + 0.6;
  }
  function playWorldSlash(rig, t0) {
    [[3250, 0.3], [4720, 0.24], [6180, 0.18], [8350, 0.13]].forEach(([f, a], i) => {
      const o = rig.osc("triangle", i * 5);
      sweep(o.frequency, f, f * 0.22, t0, 0.16);
      const g = rig.gain(0);
      rig.link(o, g);
      g.connect(rig.out);
      envPerc(g.gain, t0, a, 6e-4, 0.2);
      rig.src(o, t0, 0.24);
    });
    noiseHit(rig, t0, { type: "highpass", f0: 6400, q: 0.7, peak: 0.5, decay: 0.035, dur: 0.04 });
    noiseHit(rig, t0 + 8e-3, { type: "bandpass", f0: 9200, f1: 3400, q: 2.5, peak: 0.32, decay: 0.12, dur: 0.14 });
    const thread = rig.noise("pink");
    const tbp = rig.filter("bandpass", 1800, 18);
    const tg = rig.gain(0);
    rig.link(thread, tbp, tg);
    tg.connect(rig.out);
    tg.gain.setValueAtTime(EXP_EPS, t0 + 0.05);
    tg.gain.linearRampToValueAtTime(0.012, t0 + 0.18);
    tg.gain.exponentialRampToValueAtTime(EXP_EPS, t0 + 0.42);
    rig.src(thread, t0 + 0.05, 0.4);
    const tear = t0 + 0.42;
    const sub = rig.osc("sine");
    sweep(sub.frequency, 62, 24, tear, 1.4);
    const sh = rig.shaper(15);
    const sg = rig.gain(0);
    rig.link(sub, sh, sg);
    sg.connect(rig.out);
    envSwell(sg.gain, tear, 1.15, 0.03, 0.5, 1.6);
    rig.src(sub, tear, 2.4);
    const grind = rig.noise("brown");
    const glp = rig.filter("lowpass", 420, 3);
    sweep(glp.frequency, 900, 120, tear, 1.8);
    const gg = rig.gain(0);
    rig.link(grind, glp, gg);
    gg.connect(rig.out);
    envSwell(gg.gain, tear, 0.7, 0.05, 0.5, 1.8);
    rig.src(grind, tear, 2.6);
    const groan = rig.osc("sawtooth", -14);
    sweep(groan.frequency, 240, 90, tear, 1.6);
    const glp2 = rig.filter("lowpass", 1100, 7);
    const gg2 = rig.gain(0);
    rig.link(groan, glp2, gg2);
    gg2.connect(rig.out);
    envSwell(gg2.gain, tear, 0.2, 0.1, 0.6, 1.4);
    rig.src(groan, tear, 2.2);
    duckMusic(0.3, 0.3, 2.6);
    return tear + 3;
  }
  function playDomainVoid(rig, t0) {
    const dur = 5.4;
    const chord = [38, 50, 53, 57, 62, 64, 69, 74, 77];
    chord.forEach((midi, i) => {
      [[-11, 1], [0, 1], [13, 1]].forEach(([cents, w], j) => {
        const o = rig.osc("sine", cents + i % 3 * 3);
        const f = noteHz(midi);
        o.frequency.setValueAtTime(f, t0 + i * 0.05);
        o.frequency.exponentialRampToValueAtTime(f * 1.012, t0 + dur);
        const g = rig.gain(0);
        rig.link(o, g);
        g.connect(rig.out);
        envSwell(g.gain, t0 + i * 0.05, 0.075 / Math.sqrt(chord.length) * w / (1 + j * 0.4), 1.1 + i * 0.06, dur * 0.45, 1.4);
        rig.src(o, t0, dur + 1.4);
      });
    });
    const overload = t0 + 1;
    for (let i = 0; i < 12; i++) {
      const o = rig.osc("sine", (i - 6) * 4);
      o.frequency.value = noteHz(62 + i * 2);
      const g = rig.gain(0);
      rig.link(o, g);
      g.connect(rig.out);
      envPerc(g.gain, overload, 0.05, 4e-3, 0.12);
      rig.src(o, overload, 0.16);
    }
    noiseHit(rig, overload, { type: "bandpass", f0: 3e3, f1: 9e3, q: 0.9, peak: 0.16, decay: 0.1, dur: 0.12 });
    noiseHit(rig, overload + 0.22, { type: "lowpass", f0: 400, q: 0.8, peak: 0.05, decay: 0.1, dur: 0.12 });
    const shim = rig.noise("pink");
    const sbp = rig.filter("bandpass", 5200, 14);
    sweep(sbp.frequency, 2600, 8200, t0, dur);
    const shg = rig.gain(0);
    rig.link(shim, sbp, shg);
    const wide = haasWiden(rig, shg, 17);
    wide.connect(rig.out);
    envSwell(shg.gain, t0, 0.075, 1.6, dur * 0.4, 1.6);
    rig.src(shim, t0, dur + 1.2);
    const pulse = rig.osc("sine");
    pulse.frequency.value = 41;
    const pg = rig.gain(0);
    rig.link(pulse, pg);
    pg.connect(rig.out);
    envSwell(pg.gain, t0, 0.3, 1.4, dur * 0.45, 1.8);
    rig.src(pulse, t0, dur + 1.8);
    duckMusic(0.45, 0.8, 4);
    return t0 + dur + 2;
  }
  function playDomainShrine(rig, t0) {
    const dur = 5;
    const rnd3 = mulberry323(371230);
    const organ = [26, 38, 45, 50, 54, 56];
    organ.forEach((midi, i) => {
      const f = noteHz(midi);
      [[0, 1], [7, 0.5], [-6, 0.5]].forEach(([cents, w]) => {
        const o = rig.osc(i < 2 ? "sine" : "triangle", cents + i * 2);
        o.frequency.value = f;
        const g = rig.gain(0);
        rig.link(o, g);
        g.connect(rig.out);
        envSwell(g.gain, t0, 0.14 / Math.sqrt(organ.length) * w, 0.6 + i * 0.08, dur * 0.5, 1.2);
        rig.src(o, t0, dur + 1.2);
      });
    });
    const bellTimes = [0.15, 1.05, 1.9, 2.7, 3.5, 4.15];
    bellTimes.forEach((dt, i) => {
      bellFM(rig, t0 + dt, {
        freq: noteHz([62, 63, 68, 61, 66, 63][i]),
        // 半音摩擦
        ratio: [2.76, 3.41, 2.13, 3.76, 2.51, 3.07][i],
        dur: 1.3 + rnd3() * 0.9,
        peak: 0.12 + rnd3() * 0.07
      });
    });
    let t = t0 + 0.2;
    let gap = 0.26;
    while (t < t0 + dur - 0.2) {
      noiseHit(rig, t, {
        type: "highpass",
        f0: 6e3 + rnd3() * 3e3,
        q: 1.1,
        peak: 0.1 + rnd3() * 0.08,
        decay: 0.03,
        dur: 0.05,
        attack: 6e-4
      });
      t += gap;
      gap = Math.max(0.075, gap * 0.93);
    }
    const frame = rig.noise("brown");
    const flp = rig.filter("lowpass", 300, 3);
    const fg = rig.gain(0);
    rig.link(frame, flp, fg);
    const fcomb = combBox(rig, fg, 83e-4, 0.7, 0.5);
    fcomb.connect(rig.out);
    envSwell(fg.gain, t0, 0.4, 1, dur * 0.5, 1.4);
    rig.src(frame, t0, dur + 1);
    noiseHit(rig, t0, { type: "bandpass", f0: 2600, f1: 700, q: 1.6, peak: 0.45, decay: 0.25, dur: 0.3 });
    duckMusic(0.4, 0.6, 3.6);
    return t0 + dur + 1.6;
  }
  function playDomainClash(rig, t0) {
    const dur = 5.2;
    const pull = t0 + 4.2;
    const voidNotes = [50, 53, 57, 62];
    const shrineNotes = [50, 54, 56, 61];
    const panA = rig.pan2(-0.55);
    panA.connect(rig.out);
    const gA = rig.gain(0);
    gA.connect(panA);
    voidNotes.forEach((midi, i) => {
      const f = noteHz(midi);
      const o = rig.osc("sine", -9 + i * 4);
      o.frequency.value = f;
      const g = rig.gain(0.075);
      rig.link(o, g);
      g.connect(gA);
      const trem = rig.osc("sine");
      trem.frequency.setValueAtTime(7.2, t0);
      trem.frequency.linearRampToValueAtTime(2.6, t0 + dur);
      const ta = rig.gain(0.05);
      trem.connect(ta);
      ta.connect(g.gain);
      rig.src(trem, t0, dur + 0.5);
      rig.src(o, t0, dur + 0.5);
    });
    gA.gain.setValueAtTime(1e-3, t0);
    gA.gain.linearRampToValueAtTime(0.85, t0 + 0.9);
    gA.gain.setValueAtTime(0.85, pull);
    gA.gain.linearRampToValueAtTime(1.25, t0 + dur + 0.3);
    const panB = rig.pan2(0.55);
    panB.connect(rig.out);
    const gB = rig.gain(0);
    gB.connect(panB);
    shrineNotes.forEach((midi, i) => {
      const f = noteHz(midi);
      const o = rig.osc("sawtooth", 11 - i * 6);
      o.frequency.value = f;
      o.frequency.setValueAtTime(f, pull);
      o.frequency.exponentialRampToValueAtTime(noteHz(voidNotes[i]), t0 + dur + 0.2);
      const lp = rig.filter("lowpass", 900, 4);
      const g = rig.gain(0.06);
      rig.link(o, lp, g);
      g.connect(gB);
      rig.src(o, t0, dur + 0.5);
    });
    gB.gain.setValueAtTime(1e-3, t0);
    gB.gain.linearRampToValueAtTime(0.9, t0 + 0.8);
    gB.gain.setValueAtTime(0.9, pull);
    gB.gain.exponentialRampToValueAtTime(0.06, t0 + dur + 0.4);
    [[196, 203], [294, 300]].forEach(([fa, fb]) => {
      const oa = rig.osc("triangle", -6);
      oa.frequency.value = fa;
      const ob = rig.osc("triangle", 9);
      ob.frequency.value = fb;
      const g = rig.gain(0.05);
      rig.link(oa, g);
      ob.connect(g);
      g.connect(rig.out);
      envSwell(g.gain, t0, 0.05, 0.6, dur * 0.6, 1);
      rig.src(oa, t0, dur + 0.5);
      rig.src(ob, t0, dur + 0.5);
    });
    noiseHit(rig, t0, { type: "lowpass", f0: 9e3, f1: 300, q: 1, peak: 0.55, decay: 0.4, dur: 0.45 });
    const sub = rig.osc("sine");
    sweep(sub.frequency, 90, 30, t0, 0.7);
    const sg = rig.gain(0);
    rig.link(sub, sg);
    sg.connect(rig.out);
    envPerc(sg.gain, t0, 0.95, 4e-3, 0.9);
    rig.src(sub, t0, 1.1);
    impactBody(rig, pull, { f0: 170, f1: 38, dur: 0.5, peak: 1, dist: 18, lp: 800, sub: 44 });
    noiseHit(rig, pull, { type: "highpass", f0: 5600, q: 0.7, peak: 0.4, decay: 0.12, dur: 0.14 });
    duckMusic(0.3, 0.5, 3);
    return t0 + dur + 1.2;
  }
  function playHeal(rig, t0) {
    const arp = [62, 65, 69, 72, 74, 77, 81];
    arp.forEach((midi, i) => {
      const f = noteHz(midi);
      const t = t0 + i * 0.115;
      const o = rig.osc("sine", i * 3);
      o.frequency.setValueAtTime(f * 0.995, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.1);
      const o2 = rig.osc("triangle", -4);
      o2.frequency.value = f * 2;
      const g = rig.gain(0);
      const g2 = rig.gain(0);
      rig.link(o, g);
      rig.link(o2, g2);
      g.connect(rig.out);
      g2.connect(rig.out);
      envSwell(g.gain, t, 0.16 / (1 + i * 0.06), 0.03, 0.05, 0.5);
      envSwell(g2.gain, t, 0.045 / (1 + i * 0.1), 0.04, 0.04, 0.45);
      rig.src(o, t, 0.7);
      rig.src(o2, t, 0.65);
    });
    const shim = rig.osc("sine");
    sweep(shim.frequency, 1568, 2350, t0, 1.1);
    const shg = rig.gain(0);
    rig.link(shim, shg);
    shg.connect(rig.out);
    envSwell(shg.gain, t0 + 0.2, 0.05, 0.5, 0.3, 0.6);
    rig.src(shim, t0, 1.6);
    const bed = rig.osc("sine");
    bed.frequency.value = noteHz(38);
    const bg = rig.gain(0);
    rig.link(bed, bg);
    bg.connect(rig.out);
    envSwell(bg.gain, t0, 0.16, 0.3, 0.5, 0.9);
    rig.src(bed, t0, 1.8);
    return t0 + 1.9;
  }
  function playHitLight(rig, t0) {
    return impactBody(rig, t0, {
      f0: 200,
      f1: 78,
      dur: 0.14,
      peak: 0.8,
      dist: 8,
      lp: 1500,
      clickType: "bandpass",
      clickF: 3200,
      clickAmp: 0.4,
      clickDur: 0.04
    });
  }
  function playHitHeavy(rig, t0) {
    const end = impactBody(rig, t0, {
      f0: 150,
      f1: 45,
      dur: 0.42,
      peak: 1,
      dist: 20,
      lp: 520,
      sub: 46,
      clickType: "lowpass",
      clickF: 900,
      clickAmp: 0.55,
      clickDur: 0.09
    });
    const body = rig.noise("brown");
    const lp = rig.filter("lowpass", 380, 1.6);
    const sh = rig.shaper(16);
    const g = rig.gain(0);
    rig.link(body, lp, sh, g);
    g.connect(rig.out);
    envPerc(g.gain, t0, 0.55, 4e-3, 0.5);
    rig.src(body, t0, 0.65);
    return end + 0.3;
  }
  function playDeath(rig, t0) {
    const o = rig.osc("sine");
    sweep(o.frequency, 180, 26, t0, 1.5);
    const sh = rig.shaper(9);
    const g = rig.gain(0);
    rig.link(o, sh, g);
    g.connect(rig.out);
    envSwell(g.gain, t0, 0.85, 0.02, 0.35, 1.5);
    rig.src(o, t0, 2.4);
    const src = rig.noise("pink");
    const lp = rig.filter("lowpass", 3e3, 1.2);
    sweep(lp.frequency, 3e3, 160, t0, 1.6);
    const ng = rig.gain(0);
    rig.link(src, lp, ng);
    ng.connect(rig.out);
    envSwell(ng.gain, t0, 0.32, 0.02, 0.3, 1.6);
    rig.src(src, t0, 2.4);
    noiseHit(rig, t0 + 1.35, { type: "lowpass", f0: 500, q: 1, peak: 0.3, decay: 0.5, dur: 0.6 });
    return t0 + 3;
  }
  function playKo(rig, t0) {
    const end = playDeath(rig, t0);
    const sub = rig.osc("sine");
    sweep(sub.frequency, 120, 20, t0, 2);
    const sh = rig.shaper(14);
    const g = rig.gain(0);
    rig.link(sub, sh, g);
    g.connect(rig.out);
    envSwell(g.gain, t0, 0.95, 0.05, 0.5, 2.2);
    rig.src(sub, t0, 3);
    noiseHit(rig, t0, { type: "lowpass", f0: 6e3, f1: 200, q: 0.9, peak: 0.6, decay: 0.8, dur: 0.9 });
    return end + 1.2;
  }
  function playVictory(rig, t0) {
    const arp = [50, 57, 62, 66, 69, 74];
    arp.forEach((midi, i) => {
      const t = t0 + i * 0.11;
      const f = noteHz(midi);
      [[0, 0.18, "triangle"], [1202, 0.05, "sine"]].forEach(([cents, a, type]) => {
        const o = rig.osc(type, cents);
        o.frequency.value = f;
        const g = rig.gain(0);
        rig.link(o, g);
        g.connect(rig.out);
        envSwell(g.gain, t, a, 0.012, 0.1, 0.7);
        rig.src(o, t, 0.95);
      });
    });
    const fin = rig.osc("sine");
    fin.frequency.value = noteHz(74);
    const fg = rig.gain(0);
    rig.link(fin, fg);
    fg.connect(rig.out);
    envSwell(fg.gain, t0 + 0.66, 0.2, 0.02, 0.3, 1.1);
    rig.src(fin, t0 + 0.66, 1.6);
    bellFM(rig, t0 + 0.68, { freq: noteHz(86), ratio: 3.01, dur: 1.2, peak: 0.12 });
    return t0 + 2.2;
  }
  function playDefeat(rig, t0) {
    const line = [57, 56, 53, 51, 50, 49];
    line.forEach((midi, i) => {
      const t = t0 + i * 0.26;
      const f = noteHz(midi - 12);
      const o = rig.osc("sawtooth", -7);
      o.frequency.value = f;
      const o2 = rig.osc("sine", 6);
      o2.frequency.value = f * 2;
      const lp = rig.filter("lowpass", 900, 3);
      sweep(lp.frequency, 700, 320, t, 0.4);
      const g = rig.gain(0);
      const g2 = rig.gain(0);
      rig.link(o, lp, g);
      rig.link(o2, g2);
      g.connect(rig.out);
      g2.connect(rig.out);
      envSwell(g.gain, t, 0.2, 0.03, 0.12, 0.45);
      envSwell(g2.gain, t, 0.06, 0.03, 0.1, 0.4);
      rig.src(o, t, 0.7);
      rig.src(o2, t, 0.6);
    });
    const sub = rig.osc("sine");
    sweep(sub.frequency, 55, 32, t0, 1.8);
    const sg = rig.gain(0);
    rig.link(sub, sg);
    sg.connect(rig.out);
    envSwell(sg.gain, t0, 0.4, 0.2, 0.8, 1.2);
    rig.src(sub, t0, 2.4);
    return t0 + 2.6;
  }
  function playUiConfirm(rig, t0) {
    [[880, 0], [1320, 0.055]].forEach(([f, dt]) => {
      const o = rig.osc("sine");
      o.frequency.value = f;
      const o2 = rig.osc("triangle", 0);
      o2.frequency.value = f * 2;
      const g = rig.gain(0);
      const g2 = rig.gain(0);
      rig.link(o, g);
      rig.link(o2, g2);
      g.connect(rig.out);
      g2.connect(rig.out);
      envPerc(g.gain, t0 + dt, 0.2, 3e-3, 0.09);
      envPerc(g2.gain, t0 + dt, 0.05, 3e-3, 0.05);
      rig.src(o, t0 + dt, 0.14);
      rig.src(o2, t0 + dt, 0.1);
    });
    return t0 + 0.22;
  }
  function playUiMove(rig, t0) {
    const o = rig.osc("sine");
    o.frequency.value = 1245;
    const g = rig.gain(0);
    rig.link(o, g);
    g.connect(rig.out);
    envPerc(g.gain, t0, 0.115, 2e-3, 0.05);
    rig.src(o, t0, 0.08);
    return t0 + 0.1;
  }
  function playUiBack(rig, t0) {
    [[900, 0], [600, 0.05]].forEach(([f, dt]) => {
      const o = rig.osc("triangle");
      o.frequency.value = f;
      const g = rig.gain(0);
      rig.link(o, g);
      g.connect(rig.out);
      envPerc(g.gain, t0 + dt, 0.16, 2e-3, 0.07);
      rig.src(o, t0 + dt, 0.1);
    });
    return t0 + 0.18;
  }
  function playChargeReady(rig, t0) {
    bellFM(rig, t0, { freq: 1760, ratio: 3, dur: 0.8, peak: 0.2 });
    [[1760, 0], [2349, 0.07], [3520, 0.14]].forEach(([f, dt]) => {
      const o = rig.osc("sine");
      o.frequency.value = f;
      const g = rig.gain(0);
      rig.link(o, g);
      g.connect(rig.out);
      envPerc(g.gain, t0 + dt, 0.12, 2e-3, 0.16);
      rig.src(o, t0 + dt, 0.2);
    });
    noiseHit(rig, t0, { type: "highpass", f0: 7e3, q: 0.9, peak: 0.12, decay: 0.06, dur: 0.07 });
    return t0 + 0.9;
  }
  function playMahoraga(rig, t0) {
    const dur = 1.5;
    const wheel = rig.noise("brown");
    const bp = rig.filter("bandpass", 480, 9);
    const g = rig.gain(0);
    rig.link(wheel, bp, g);
    const comb = combBox(rig, g, 57e-4, 0.72, 0.6);
    comb.connect(rig.out);
    sweep(bp.frequency, 300, 900, t0, dur);
    envSwell(g.gain, t0, 0.32, 0.15, dur * 0.5, 0.6);
    rig.src(wheel, t0, dur + 0.4);
    for (let i = 0; i < 9; i++) {
      const t = t0 + i * 0.14;
      metalStrike(rig, t, { freq: 1200 + i * 90, dur: 0.22, peak: 0.14 });
    }
    return t0 + dur + 0.5;
  }
  var SFX = {
    punch: { fn: playPunch, wet: 0.14, gain: 0.95, prio: 1 },
    kick: { fn: playKick, wet: 0.18, gain: 1, prio: 1 },
    blackflash: { fn: playBlackflash, wet: 0.5, long: 0.6, gain: 1, prio: 2 },
    block: { fn: playBlock, wet: 0.16, gain: 0.8, prio: 1 },
    guard_infinity: { fn: playGuardInfinity, wet: 0.45, gain: 0.9, prio: 1 },
    whoosh: { fn: playWhoosh, wet: 0.16, gain: 0.85, prio: 1 },
    dash: { fn: playDash, wet: 0.18, gain: 0.9, prio: 1 },
    land: { fn: playLand, wet: 0.2, gain: 0.95, prio: 1 },
    blue_charge: { fn: playBlueCharge, wet: 0.4, gain: 0.95, prio: 1 },
    blue_fire: { fn: playBlueFire, wet: 0.45, long: 0.3, gain: 1, prio: 2 },
    red_charge: { fn: playRedCharge, wet: 0.3, gain: 0.95, prio: 1 },
    red_fire: { fn: playRedFire, wet: 0.5, long: 0.45, gain: 1.05, prio: 2 },
    purple_charge: { fn: playPurpleCharge, wet: 0.45, long: 0.35, gain: 1, prio: 2 },
    purple_fire: { fn: playPurpleFire, wet: 0.5, long: 0.5, gain: 1.1, prio: 2 },
    purple200_fire: { fn: playPurple200Fire, wet: 0.5, long: 0.7, gain: 1.35, prio: 3 },
    dismantle: { fn: playDismantle, wet: 0.12, gain: 0.9, prio: 1 },
    cleave: { fn: playCleave, wet: 0.2, gain: 1, prio: 2 },
    furnace: { fn: playFurnace, wet: 0.4, gain: 1, prio: 2 },
    worldslash: { fn: playWorldSlash, wet: 0.55, long: 0.7, gain: 1.1, prio: 3 },
    domain_void: { fn: playDomainVoid, wet: 0.7, long: 0.8, gain: 1, prio: 3 },
    domain_shrine: { fn: playDomainShrine, wet: 0.55, long: 0.55, gain: 1, prio: 3 },
    domain_clash: { fn: playDomainClash, wet: 0.5, long: 0.5, gain: 1.05, prio: 3 },
    heal: { fn: playHeal, wet: 0.45, gain: 0.9, prio: 2 },
    hit_light: { fn: playHitLight, wet: 0.12, gain: 0.9, prio: 1 },
    hit_heavy: { fn: playHitHeavy, wet: 0.22, gain: 1, prio: 1 },
    death: { fn: playDeath, wet: 0.5, long: 0.35, gain: 1, prio: 2 },
    ko: { fn: playKo, wet: 0.55, long: 0.5, gain: 1.1, prio: 3 },
    victory: { fn: playVictory, wet: 0.45, gain: 0.95, prio: 2 },
    defeat: { fn: playDefeat, wet: 0.45, gain: 0.95, prio: 2 },
    ui_confirm: { fn: playUiConfirm, wet: 0.12, gain: 0.8, prio: 1 },
    ui_move: { fn: playUiMove, wet: 0.08, gain: 0.7, prio: 1 },
    ui_back: { fn: playUiBack, wet: 0.1, gain: 0.75, prio: 1 },
    charge_ready: { fn: playChargeReady, wet: 0.35, gain: 0.9, prio: 2 },
    mahoraga: { fn: playMahoraga, wet: 0.4, gain: 0.95, prio: 2 }
  };
  var ALIAS = {
    rush: "dash",
    dash_hit: "dash",
    dodge: "whoosh",
    jump: "whoosh",
    step: "whoosh",
    infinity: "guard_infinity",
    amp: "blue_charge",
    simple_domain: "blue_charge",
    reverse: "heal",
    heal_start: "heal",
    blue: "blue_fire",
    red: "red_fire",
    purple: "purple_fire",
    purple200: "purple200_fire",
    void: "domain_void",
    shrine: "domain_shrine",
    shrine_domain: "domain_shrine",
    void_domain: "domain_void",
    wheel: "mahoraga",
    adaptation: "mahoraga",
    slash: "dismantle",
    cut: "dismantle",
    cleave_hit: "dismantle",
    boom: "red_fire",
    explosion: "red_fire",
    impact: "hit_heavy",
    hit: "hit_light",
    damage: "hit_light",
    hurt: "hit_heavy",
    win: "victory",
    lose: "defeat",
    gameover: "defeat",
    game_over: "defeat",
    confirm: "ui_confirm",
    back: "ui_back",
    move: "ui_move",
    select: "ui_move",
    ready: "charge_ready",
    charged: "charge_ready"
  };
  var KEYWORDS = [
    ["black", "blackflash"],
    ["flash", "blackflash"],
    ["200", "purple200_fire"],
    ["purple", "purple_fire"],
    ["violet", "purple_fire"],
    ["domain", "domain_shrine"],
    ["void", "domain_void"],
    ["shrine", "domain_shrine"],
    ["clash", "domain_clash"],
    ["charge", "blue_charge"],
    ["flame", "furnace"],
    ["fire", "furnace"],
    ["furnace", "furnace"],
    ["heal", "heal"],
    ["reverse", "heal"],
    ["death", "death"],
    ["ko", "ko"],
    ["victory", "victory"],
    ["defeat", "defeat"],
    ["ui", "ui_move"],
    ["slash", "dismantle"],
    ["cut", "dismantle"],
    ["dismantle", "dismantle"],
    ["punch", "punch"],
    ["kick", "kick"],
    ["hit", "hit_light"],
    ["block", "block"],
    ["guard", "block"],
    ["whoosh", "whoosh"],
    ["dash", "dash"],
    ["rush", "dash"],
    ["land", "land"],
    ["metal", "block"],
    ["explo", "red_fire"],
    ["boom", "red_fire"],
    ["beam", "purple_fire"],
    ["laser", "purple_fire"],
    ["ready", "charge_ready"],
    ["music", "music_battle"]
  ];
  function resolveSfx(name) {
    if (SFX[name]) return name;
    const lower = String(name).toLowerCase();
    if (ALIAS[lower] && SFX[ALIAS[lower]]) return ALIAS[lower];
    for (let i = 0; i < KEYWORDS.length; i++) {
      if (lower.includes(KEYWORDS[i][0])) return KEYWORDS[i][1];
    }
    let best = null;
    let bestScore = 3;
    for (const key of Object.keys(SFX)) {
      let score = 0;
      const n = Math.min(key.length, lower.length);
      for (let i = 0; i < n; i++) if (key[i] !== lower[i]) score++;
      score += Math.abs(key.length - lower.length);
      if (score < bestScore) {
        bestScore = score;
        best = key;
      }
    }
    return best;
  }
  function taiko(rig, t0, o = {}) {
    const f0 = o.f0 ?? 112;
    const f1 = o.f1 ?? 46;
    const dur = o.dur ?? 0.3;
    const peak = o.peak ?? 0.8;
    const o1 = rig.osc("sine");
    sweep(o1.frequency, f0, f1, t0, dur * 0.7);
    const sh = rig.shaper(7);
    const g = rig.gain(0);
    rig.link(o1, sh, g);
    g.connect(rig.out);
    envPerc(g.gain, t0, peak, 3e-3, dur);
    rig.src(o1, t0, dur + 0.04);
    noiseHit(rig, t0, {
      type: "lowpass",
      f0: 1100,
      f1: 400,
      q: 0.9,
      peak: peak * 0.32,
      decay: 0.08,
      dur: 0.09
    });
    return t0 + dur + 0.1;
  }
  function bassPulse(rig, t0, o = {}) {
    const f = o.freq ?? noteHz(38);
    const dur = o.dur ?? 0.3;
    const peak = o.peak ?? 0.5;
    const o1 = rig.osc(o.wave || "triangle");
    o1.frequency.value = f;
    const o2 = rig.osc("sine");
    o2.frequency.value = f * 0.5;
    const lp = rig.filter("lowpass", o.cut ?? 420, 4);
    sweep(lp.frequency, (o.cut ?? 420) * 1.8, o.cut ?? 420, t0, dur * 0.6);
    const g = rig.gain(0);
    rig.link(o1, lp, g);
    const g2 = rig.gain(peak * 0.5);
    o2.connect(g2);
    g2.connect(rig.out);
    g.connect(rig.out);
    envPerc(g.gain, t0, peak, 8e-3, dur);
    envPerc(g2.gain, t0, peak * 0.5, 0.01, dur * 1.2);
    rig.src(o1, t0, dur + 0.05);
    rig.src(o2, t0, dur * 1.3);
    return t0 + dur + 0.1;
  }
  function stringPad(rig, t0, dur, freqs, o = {}) {
    const lp = rig.filter("lowpass", o.cut ?? 900, o.q ?? 3.2);
    sweep(lp.frequency, o.cut ?? 900, o.cut2 ?? (o.cut ?? 900) * 1.7, t0, dur * 0.7, false);
    const lfo = rig.osc("sine");
    lfo.frequency.value = o.lfo ?? 0.13;
    const lfoAmt = rig.gain(o.lfoAmt ?? 320);
    lfo.connect(lfoAmt);
    lfoAmt.connect(lp.frequency);
    rig.src(lfo, t0, dur + 0.2);
    const g = rig.gain(0);
    rig.link(lp, g);
    g.connect(rig.out);
    const per = (o.peak ?? 0.09) / Math.max(1, freqs.length);
    freqs.forEach((f, i) => {
      [-7 + (o.detune ?? 0), 0, 9 - (o.detune ?? 0)].forEach((cents, j) => {
        const os = rig.osc(j === 1 ? "sawtooth" : "sawtooth", cents + (i % 2 ? 3 : -3));
        os.frequency.value = f;
        const vg = rig.gain(per / 3);
        os.connect(vg);
        vg.connect(lp);
        rig.src(os, t0, dur + 0.2);
      });
    });
    envSwell(g.gain, t0, 1, o.attack ?? 0.35, dur * 0.4, o.release ?? 0.9);
    return t0 + dur + 0.2;
  }
  function organStack(rig, t0, dur, midi, o = {}) {
    const f = noteHz(midi);
    const g = rig.gain(0);
    g.connect(rig.out);
    const draws = o.draws || [[1, 1], [2, 0.5], [3, 0.28], [4, 0.18]];
    draws.forEach(([mult, amt], i) => {
      const os = rig.osc("sine", i % 2 ? 4 : -4);
      os.frequency.value = f * mult;
      const vg = rig.gain((o.peak ?? 0.13) * amt);
      os.connect(vg);
      vg.connect(g);
      const vib = rig.osc("sine");
      vib.frequency.value = 4.6 + i * 0.3;
      const va = rig.gain(f * mult * 25e-4);
      vib.connect(va);
      va.connect(os.frequency);
      rig.src(vib, t0, dur + 0.2);
      rig.src(os, t0, dur + 0.2);
    });
    envSwell(g.gain, t0, 1, o.attack ?? 0.5, dur * 0.45, o.release ?? 0.9);
    return t0 + dur + 0.2;
  }
  function snareHit(rig, t0, peak = 0.4) {
    noiseHit(rig, t0, { type: "bandpass", f0: 1900, q: 0.8, peak, decay: 0.13, dur: 0.15 });
    noiseHit(rig, t0, { type: "highpass", f0: 6e3, q: 0.7, peak: peak * 0.4, decay: 0.06, dur: 0.07 });
    const o = rig.osc("triangle");
    sweep(o.frequency, 220, 150, t0, 0.09);
    const g = rig.gain(0);
    rig.link(o, g);
    g.connect(rig.out);
    envPerc(g.gain, t0, peak * 0.5, 2e-3, 0.08);
    rig.src(o, t0, 0.11);
    return t0 + 0.2;
  }
  function hatTick(rig, t0, peak = 0.14) {
    noiseHit(rig, t0, { type: "highpass", f0: 8200, q: 0.8, peak, decay: 0.032, dur: 0.036 });
    return t0 + 0.06;
  }
  function scaleRun(rig, t0, rootMidi, count, step, o = {}) {
    for (let i = 0; i < count; i++) {
      const midi = deg(rootMidi, i, o.scale || HARMONIC_MINOR) + (o.oct ?? 0);
      const t = t0 + i * step;
      const f = noteHz(midi);
      const os = rig.osc("sawtooth", i % 2 ? 5 : -5);
      os.frequency.value = f;
      const lp = rig.filter("lowpass", 1400 + i * 260, 5);
      const g = rig.gain(0);
      rig.link(os, lp, g);
      g.connect(rig.out);
      envPerc(g.gain, t, (o.peak ?? 0.11) * (1 - i / (count * 1.6)), 4e-3, step * 1.6);
      rig.src(os, t, step * 2);
    }
    return t0 + count * step + 0.2;
  }
  var PROG = [
    [50, 53, 57],
    // Dm
    [50, 53, 57],
    // Dm
    [46, 50, 53],
    // Bb
    [45, 49, 52]
    // A  (C# 来自和声小调)
  ];
  var PROG_FULL = [
    [50, 53, 57, 62],
    [50, 53, 57, 62],
    [46, 50, 53, 58],
    [45, 49, 52, 57]
  ];
  function musicRig(st, tail = 0.5) {
    if (!ready || !st.active || !st.out) return null;
    if (voices.length >= cfg.maxVoices - 2) {
      stats.musicDropped++;
      return null;
    }
    const rig = new Rig(st.name, ctx.currentTime, {
      bus: st.out,
      wet: st.wet ?? cfg.musicWet,
      long: st.wetLong ?? 0,
      priority: 0,
      tail
    });
    return rig.voice.dead ? null : rig;
  }
  function patchIntro(st, abs, t, sd) {
    const bar = Math.floor(abs / 16);
    const s = abs % 16;
    const barLen = sd * 16;
    if (s === 0 && bar % 2 === 0) {
      const rig = musicRig(st, 2.4);
      if (rig) bassPulse(rig, t, { freq: noteHz(26), dur: barLen * 1.6, peak: 0.42, cut: 180 });
    }
    if (s === 8 && bar % 4 === 2) {
      const rig = musicRig(st, 1.8);
      if (rig) bellFM(rig, t, { freq: noteHz(deg(50, bar % 7, HARMONIC_MINOR) + 24), ratio: 2.41, dur: 2.2, peak: 0.09 });
    }
    if (s === 0 && bar % 4 === 0) {
      const rig = musicRig(st, 1);
      if (rig) stringPad(rig, t, barLen * 3.2, [noteHz(38), noteHz(45)], { peak: 0.05, cut: 520, attack: 1.6, release: 1.6, detune: 6 });
    }
    if (bar % 8 === 5 && (s === 2 || s === 6 || s === 10)) {
      const idx = s === 2 ? 0 : s === 6 ? 2 : 4;
      const rig = musicRig(st, 1.2);
      if (rig) {
        const f = noteHz(deg(62, idx));
        const o = rig.osc("sine");
        o.frequency.value = f;
        const g = rig.gain(0);
        rig.link(o, g);
        g.connect(rig.out);
        envSwell(g.gain, t, 0.13, 0.02, 0.1, 0.9);
        rig.src(o, t, 1.2);
      }
    }
    if (s === 0 && bar % 2 === 1) {
      const rig = musicRig(st, 0.8);
      if (rig) impactBody(rig, t, { f0: 64, f1: 34, dur: 0.4, peak: 0.3, dist: 5, lp: 260, click: false });
    }
  }
  var TAIKO_STEPS = { 0: 1, 3: 0.5, 6: 0.72, 8: 0.95, 11: 0.5, 14: 0.78 };
  function patchBattle(st, abs, t, sd) {
    const bar = Math.floor(abs / 16);
    const s = abs % 16;
    const barLen = sd * 16;
    const chord = PROG[bar % 4];
    const tk = TAIKO_STEPS[s];
    if (tk !== void 0) {
      const rig = musicRig(st, 0.5);
      if (rig) taiko(rig, t, { f0: s === 0 ? 118 : 100, f1: s === 0 ? 44 : 52, peak: 0.72 * tk, dur: s === 0 ? 0.34 : 0.22 });
    }
    if (s === 0 || s === 6 || s === 10) {
      const rig = musicRig(st, 0.4);
      if (rig) bassPulse(rig, t, { freq: noteHz(chord[0] - 12), dur: s === 0 ? 0.34 : 0.2, peak: 0.42, cut: 340 });
    }
    if (s === 0) {
      const rig = musicRig(st, 1.2);
      if (rig) {
        stringPad(rig, t, barLen * 1.05, chord.map((m) => noteHz(m + 12)), {
          peak: 0.085,
          cut: 780,
          cut2: 1250,
          q: 3.4,
          lfo: 0.17 + bar % 3 * 0.05,
          detune: bar % 2 ? 12 : 0,
          attack: 0.3,
          release: 0.5
        });
      }
    }
    if (abs % 64 === 59 || abs % 64 === 31 || abs % 96 === 79) {
      const rig = musicRig(st, 1);
      if (rig) metalStrike(rig, t, { freq: noteHz(deg(62, 4, HARMONIC_MINOR) + 12), dur: 0.5, peak: 0.16, ratios: [1, 1.41, 2.13] });
    }
    if (abs % 128 === 124) {
      const rig = musicRig(st, 1.6);
      if (rig) impactBody(rig, t, { f0: 140, f1: 36, dur: 0.5, peak: 0.8, dist: 14, lp: 600, sub: 44 });
    }
  }
  function patchDomain(st, abs, t, sd) {
    const bar = Math.floor(abs / 16);
    const s = abs % 16;
    const barLen = sd * 16;
    const chord = PROG_FULL[bar % 4];
    if (s === 0) {
      const rig = musicRig(st, 1.6);
      if (rig) {
        stringPad(rig, t, barLen * 1.05, chord.map((m) => noteHz(m + 12)), {
          peak: 0.1,
          cut: 620,
          cut2: 980,
          q: 4.2,
          lfo: 0.09,
          detune: 8,
          attack: 0.6,
          release: 1
        });
      }
      const rig2 = musicRig(st, 1.6);
      if (rig2) organStack(rig2, t, barLen * 1.02, chord[0] - 24, { peak: 0.1, attack: 0.5 });
    }
    if (s === 0 && bar % 2 === 0) {
      const rig = musicRig(st, 1.4);
      if (rig) {
        const vowels = [[720, 1240, 2600], [400, 2e3, 2550], [600, 1040, 2400]];
        const v = vowels[bar / 2 % 3];
        vocalFormant(rig, t, {
          dur: barLen * 2,
          peak: 0.12,
          buzz: 260 + bar % 3 * 40,
          drift: 0.12,
          formants: [[v[0], 1], [v[1], 0.55], [v[2], 0.3]],
          attack: 0.9,
          release: 1.2
        });
      }
    }
    if (s === 8 && bar % 2 === 1) {
      const rig = musicRig(st, 1.8);
      if (rig) bellFM(rig, t, { freq: noteHz(chord[0]), ratio: 2, dur: 2.4, peak: 0.1 });
    }
    if (s === 0 || s === 12) {
      const rig = musicRig(st, 0.9);
      if (rig) bassPulse(rig, t, { freq: noteHz(chord[0] - 24), dur: barLen * 0.42, peak: 0.34, cut: 200 });
    }
  }
  function patchFinal(st, abs, t, sd) {
    const bar = Math.floor(abs / 16);
    const s = abs % 16;
    const barLen = sd * 16;
    const chord = PROG[bar % 4];
    if (s % 4 === 0) {
      const rig = musicRig(st, 0.5);
      if (rig) taiko(rig, t, { f0: 120, f1: 42, peak: 0.8, dur: 0.24 });
    }
    if (s === 4 || s === 12) {
      const rig = musicRig(st, 0.4);
      if (rig) snareHit(rig, t, 0.34);
    }
    if (s % 4 === 2) {
      const rig = musicRig(st, 0.2);
      if (rig) hatTick(rig, t, s === 6 || s === 14 ? 0.2 : 0.12);
    }
    {
      const rig = musicRig(st, 0.3);
      if (rig) {
        const midi = chord[0] - 12 + (s % 4 === 2 ? 3 : 0);
        bassPulse(rig, t, { freq: noteHz(midi), dur: sd * 0.9, peak: 0.3, cut: 420 });
      }
    }
    if (s === 0 && bar % 2 === 1) {
      const rig = musicRig(st, 1.2);
      if (rig) scaleRun(rig, t, 62, 8, sd * 0.5, { scale: HARMONIC_MINOR, oct: 0, peak: 0.1 });
    }
    if (s === 10) {
      const rig = musicRig(st, 0.6);
      if (rig) {
        const o = rig.osc("square", bar % 4 * 25);
        o.frequency.value = noteHz(86 - bar % 4);
        const g = rig.gain(0);
        const lp = rig.filter("lowpass", 3e3, 6);
        rig.link(o, lp, g);
        g.connect(rig.out);
        envPerc(g.gain, t, 0.07, 4e-3, 0.18);
        rig.src(o, t, 0.24);
      }
    }
    if (s === 0) {
      const rig = musicRig(st, 1.2);
      if (rig) {
        stringPad(rig, t, barLen * 1.02, chord.map((m) => noteHz(m + 12 + bar % 4)), {
          peak: 0.07,
          cut: 900 + bar % 8 * 90,
          cut2: 1500 + bar % 8 * 140,
          q: 3,
          lfo: 0.4,
          detune: 14,
          attack: 0.15,
          release: 0.3
        });
      }
    }
    if (abs % 128 === 120) {
      const rig = musicRig(st, 1.4);
      if (rig) playRedFire(rig, t);
    }
  }
  var MUSIC = {
    music_intro: {
      patch: patchIntro,
      wet: 0.55,
      wetLong: 0.3,
      bpmAt: () => 76
    },
    music_battle: {
      patch: patchBattle,
      wet: 0.28,
      wetLong: 0.18,
      bpmAt: () => 140
    },
    music_domain: {
      patch: patchDomain,
      wet: 0.55,
      wetLong: 0.4,
      bpmAt: () => 92
    },
    music_final: {
      patch: patchFinal,
      wet: 0.3,
      wetLong: 0.25,
      bpmAt: (bar) => Math.min(188, 150 + bar * 3)
      // 每小节 +3 BPM 的失控加速
    }
  };
  function getTrack(name) {
    let st = tracks.get(name);
    if (!st) {
      st = {
        name,
        active: false,
        out: null,
        nextTime: 0,
        step: 0,
        wet: MUSIC[name]?.wet ?? cfg.musicWet,
        wetLong: MUSIC[name]?.wetLong ?? 0
      };
      tracks.set(name, st);
    }
    return st;
  }
  function startTrack(name, fadeIn = 0.25) {
    const def2 = MUSIC[name];
    if (!def2 || !ready) return;
    for (const other of tracks.keys()) {
      if (other !== name) stopTrack(other, 0.35);
    }
    const st = getTrack(name);
    st.wet = def2.wet;
    st.wetLong = def2.wetLong;
    if (!st.out) {
      st.out = ctx.createGain();
      st.out.gain.value = 0;
      st.out.connect(musicBus);
      st.owned = false;
    }
    st.out.gain.cancelScheduledValues(ctx.currentTime);
    st.out.gain.setValueAtTime(Math.max(EXP_EPS, st.out.gain.value), ctx.currentTime);
    st.out.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.max(0.02, fadeIn));
    st.active = true;
    st.step = 0;
    st.nextTime = ctx.currentTime + 0.06;
  }
  function stopTrack(name, fade = 0.5) {
    const st = tracks.get(name);
    if (!st || !st.out) return;
    st.active = false;
    const now2 = ctx.currentTime;
    st.out.gain.cancelScheduledValues(now2);
    st.out.gain.setValueAtTime(Math.max(EXP_EPS, st.out.gain.value), now2);
    st.out.gain.linearRampToValueAtTime(EXP_EPS, now2 + Math.max(0.05, fade));
    st.out.gain.setValueAtTime(0, now2 + Math.max(0.05, fade) + 0.01);
    st.releaseAt = now2 + fade + 0.05;
  }
  function scheduleMusic(now2) {
    for (const st of tracks.values()) {
      if (!st.active) continue;
      if (st.nextTime < now2 - 0.5) st.nextTime = now2;
      let guard = 0;
      while (st.nextTime < now2 + cfg.lookahead && guard++ < 96) {
        const absStep = st.step;
        const bar = Math.floor(absStep / 16);
        const bpm = Math.max(30, MUSIC[st.name].bpmAt(bar));
        const stepDur = 60 / bpm / 4;
        try {
          MUSIC[st.name].patch(st, absStep, st.nextTime, stepDur);
          stats.notes++;
        } catch (e) {
        }
        st.nextTime += stepDur;
        st.step++;
      }
    }
  }
  function buildGraph() {
    masterGain = ctx.createGain();
    masterGain.gain.value = volMaster;
    comp = ctx.createDynamicsCompressor();
    if (comp.threshold) comp.threshold.value = -12;
    if (comp.knee) comp.knee.value = 24;
    if (comp.ratio) comp.ratio.value = 4;
    if (comp.attack) comp.attack.value = 4e-3;
    if (comp.release) comp.release.value = 0.2;
    masterGain.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = volSfx;
    sfxBus.connect(masterGain);
    musicBus = ctx.createGain();
    musicBus.gain.value = volMusic;
    musicBus.connect(masterGain);
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = makeIR(cfg.irLen, 2.4, 0.82);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.85;
    conv.connect(revOut);
    revOut.connect(masterGain);
    reverbIn = ctx.createGain();
    reverbIn.gain.value = 1;
    reverbIn.connect(conv);
    if (quality === "low") {
      reverbInLong = reverbIn;
    } else {
      const convL = ctx.createConvolver();
      convL.normalize = true;
      convL.buffer = makeIR(4.6, 1.35, 0.66);
      const revOutL = ctx.createGain();
      revOutL.gain.value = 0.7;
      convL.connect(revOutL);
      revOutL.connect(masterGain);
      reverbInLong = ctx.createGain();
      reverbInLong.gain.value = 1;
      reverbInLong.connect(convL);
    }
  }
  function unlock() {
    if (ready) {
      if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") tryResume();
      return;
    }
    const g = typeof globalThis !== "undefined" ? globalThis : null;
    const AC = g && (g.AudioContext || g.webkitAudioContext);
    if (!AC) return;
    try {
      ctx = new AC({ latencyHint: quality === "low" ? "playback" : "interactive" });
      buildGraph();
      ready = true;
    } catch (e) {
      ctx = null;
      ready = false;
      return;
    }
    if (ctx.state === "suspended" && typeof ctx.resume === "function") tryResume();
  }
  function tryResume() {
    try {
      const r = ctx.resume();
      if (r && typeof r.catch === "function") r.catch(() => {
      });
    } catch (e) {
    }
  }
  function play(name, opts) {
    if (!ready) {
      stats.droppedPlays++;
      return;
    }
    if (typeof name !== "string" || !name) {
      stats.droppedPlays++;
      return;
    }
    const o = opts || {};
    try {
      if (MUSIC[name]) {
        startTrack(name, 0.3);
        stats.plays++;
        return;
      }
      const key = resolveSfx(name);
      if (!key) {
        stats.droppedPlays++;
        return;
      }
      const spec = SFX[key];
      const t0 = ctx.currentTime + 2e-3;
      const rig = new Rig(key, t0, {
        bus: sfxBus,
        wet: spec.wet ?? 0.12,
        long: spec.long ?? 0,
        gain: (spec.gain ?? 1) * clamp4(o.volume ?? 1, 0, 4),
        pan: spec.pan ?? 0,
        pos: isVec3(o.pos) ? o.pos : null,
        rate: typeof o.rate === "number" ? o.rate : 1,
        detune: typeof o.detune === "number" ? o.detune : 0,
        priority: spec.prio ?? 1
      });
      if (rig.voice.dead) {
        stats.droppedPlays++;
        return;
      }
      const end = spec.fn(rig, t0) || t0 + 0.3;
      if (end + 0.05 > rig.voice.endTime) rig.voice.endTime = end + rig.tail;
      stats.plays++;
    } catch (e) {
      stats.droppedPlays++;
    }
  }
  /**
   * 外部 BGM 抑制开关。
   *
   * 本作自己有一套**程序化生成**的配乐（music_intro / music_battle / music_domain / music_final，
   * 见 MUSIC 表），而画面上还有一个 <audio> 元素在播玩家选的那首歌。
   * 两套一起响，玩家听到的就是「两首歌重叠」—— 实测战斗中 music_battle(140BPM) 与
   * <audio> 的 BGM 同时在放。
   *
   * 玩家既然能选歌，程序化配乐就必须让位：开关打开时立刻停掉所有 music_* 声部，
   * 并且后续的 loop("music_*") 全部忽略。**只影响配乐，音效（SFX）完全不受影响。**
   */
  var musicSuppressed = false;
  var activeMusic = {};
  function setMusicSuppressed(on) {
    const next = !!on;
    if (next === musicSuppressed) return;
    musicSuppressed = next;
    if (next) {
      for (const k in MUSIC) {
        if (activeMusic[k]) { stopTrack(k, 0.35); delete activeMusic[k]; }
      }
    }
  }
  function loop(name, opts) {
    if (!ready) {
      stats.droppedPlays++;
      return;
    }
    if (typeof name !== "string" || !name) return;
    if (MUSIC[name]) {
      if (musicSuppressed) return;   // 玩家选了外部 BGM → 程序化配乐不参与
      activeMusic[name] = true;
      startTrack(name, opts?.fadeIn ?? 0.4);
      return;
    }
    const key = resolveSfx(name);
    if (!key || !SFX[key]) return;
    const o = opts || {};
    const t0 = ctx.currentTime + 2e-3;
    const rig = new Rig(key, t0, {
      bus: sfxBus,
      wet: SFX[key].wet ?? 0.12,
      long: SFX[key].long ?? 0,
      gain: (SFX[key].gain ?? 1) * clamp4(o.volume ?? 1, 0, 4),
      priority: 1,
      pos: isVec3(o.pos) ? o.pos : null
    });
    if (rig.voice.dead) return;
    const end = SFX[key].fn(rig, t0) || t0 + 0.5;
    loops.set(name, { nextAt: end, opts: o, key });
    stats.plays++;
  }
  function stop(name) {
    if (!ready) return;
    if (MUSIC[name]) {
      delete activeMusic[name];
      stopTrack(name, 0.45);
      return;
    }
    const now2 = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      if (v.name !== name) continue;
      for (const n of v.nodes) {
        const p = n && n.gain;
        if (p && typeof p.cancelScheduledValues === "function") {
          try {
            p.cancelScheduledValues(now2);
            p.setValueAtTime(Math.max(EXP_EPS, typeof p.value === "number" ? p.value : EXP_EPS), now2);
            p.linearRampToValueAtTime(0, now2 + 0.06);
          } catch (e) {
          }
        }
      }
      v.endTime = Math.min(v.endTime, now2 + 0.09);
    }
    loops.delete(name);
  }
  function setMaster(v) {
    volMaster = clamp4(Number(v) || 0, 0, 1.5);
    if (ready && masterGain) masterGain.gain.setTargetAtTime(volMaster, ctx.currentTime, 0.03);
  }
  function setSfx(v) {
    volSfx = clamp4(Number(v) || 0, 0, 1.5);
    if (ready && sfxBus) sfxBus.gain.setTargetAtTime(volSfx, ctx.currentTime, 0.03);
  }
  function setMusic(v) {
    volMusic = clamp4(Number(v) || 0, 0, 1.5);
    if (ready && musicBus) musicBus.gain.setTargetAtTime(volMusic, ctx.currentTime, 0.05);
  }
  function duckMusic(target = 0.3, hold = 0.25, recover = 3) {
    if (!ready || !musicBus) return;
    const now2 = ctx.currentTime;
    const p = musicBus.gain;
    const base = volMusic;
    const low = Math.max(EXP_EPS, base * clamp4(target, 0.02, 1));
    try {
      p.cancelScheduledValues(now2);
      p.setTargetAtTime(low, now2, 0.08);
      p.setTargetAtTime(Math.max(EXP_EPS, base), now2 + 0.25 + Math.max(0, hold), Math.max(0.05, recover / 3));
    } catch (e) {
    }
  }
  function update(t, dt) {
    if (!ready) return;
    const now2 = ctx.currentTime;
    try {
      scheduleMusic(now2);
    } catch (e) {
    }
    if (loops.size) {
      for (const [name, st] of loops) {
        if (now2 >= st.nextAt - 0.02) {
          const key = st.key;
          if (!SFX[key]) {
            loops.delete(name);
            continue;
          }
          const rig = new Rig(key, now2 + 2e-3, {
            bus: sfxBus,
            wet: SFX[key].wet ?? 0.12,
            long: SFX[key].long ?? 0,
            gain: SFX[key].gain ?? 1,
            priority: 1
          });
          if (rig.voice.dead) {
            st.nextAt = now2 + 0.5;
            continue;
          }
          const end = SFX[key].fn(rig, now2 + 2e-3) || now2 + 0.5;
          st.nextAt = end - 0.05;
        }
      }
    }
    for (const st of tracks.values()) {
      if (!st.active && st.out && st.releaseAt && now2 >= st.releaseAt) {
        try {
          st.out.disconnect();
          stats.disconnects++;
        } catch (e) {
        }
        st.out = null;
        st.releaseAt = 0;
      }
    }
    sweepVoices(now2);
  }
  function createAudio(opts) {
    const o = opts || {};
    quality = QUALITY2[o.quality] ? o.quality : "high";
    cfg = QUALITY2[quality];
    return {
      unlock,
      play,
      loop,
    setMusicSuppressed,
    /** 诊断口：当前有没有程序化配乐在放（排查"两首歌重叠"用） */
    get musicState() { return { suppressed: musicSuppressed, active: Object.keys(activeMusic) }; },
      stop,
      setMaster,
      setSfx,
      setMusic,
      duck: () => duckMusic(0.3, 0.25, 3),
      update,
      /** 诊断接口（非契约内容，供自测/调试读取） */
      _debug: {
        get ctx() {
          return ctx;
        },
        get ready() {
          return ready;
        },
        get quality() {
          return quality;
        },
        get maxVoices() {
          return cfg.maxVoices;
        },
        get activeVoices() {
          return voices.length;
        },
        get stats() {
          return stats;
        },
        sfxNames: Object.keys(SFX),
        musicNames: Object.keys(MUSIC)
      }
    };
  }
