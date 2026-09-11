  var LIMIT = 64;
  var TRAIL_LIMIT = 32;
  var NUMBER_LIMIT = 48;
  var CALLOUT_LIMIT = 12;
  var DAMAGE_TEX_MAX = 64;
  var CALLOUT_TEX_MAX = 24;
  var PARTICLE_CAP = { low: 1200, medium: 3e3, high: 6e3 };
  var TRAIL_SEGS = 48;
  var LIGHT_SEGS = 24;
  var LIGHT_BRANCH_SEGS = 6;
  var LIGHT_BRANCH_MAX = 8;
  var LIGHT_VERTS = (LIGHT_SEGS + 1 + LIGHT_BRANCH_MAX * (LIGHT_BRANCH_SEGS + 1)) * 2 + 8;
  var TRAIL_PAIRS = TRAIL_SEGS + 1;
  var STALE_TRAIL = 1.5;
  var MAX_TRAIL_AGE = 10;
  var FONT_STACK = '"Yu Mincho","YuMincho","Hiragino Mincho ProN","Noto Serif JP","MS Mincho","SimSun","Songti SC","Noto Serif CJK SC",serif';
  var TAU2 = Math.PI * 2;
  var _v12 = new Vector3();
  var _v22 = new Vector3();
  var _v32 = new Vector3();
  var _v4 = new Vector3();
  var _v5 = new Vector3();
  var _v6 = new Vector3();
  var _q12 = new Quaternion();
  var _m12 = new Matrix4();
  var _c1 = new Color();
  var _c2 = new Color();
  var _e1 = new Vector3();
  var _e2 = new Vector3();
  var _up = new Vector3(0, 1, 0);
  var rnd = () => Math.random();
  var rnd2 = () => Math.random() * 2 - 1;
  var rr = (a, b) => a + Math.random() * (b - a);
  var clamp3 = (v, a, b) => v < a ? a : v > b ? b : v;
  var easeOut = (x) => 1 - (1 - x) * (1 - x);
  var easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  function def(v, d) {
    return v === void 0 || v === null || typeof v === "number" && Number.isNaN(v) ? d : v;
  }
  function readVec(src, out) {
    if (!src) return out.set(0, 0, 0);
    return out.set(def(src.x, 0), def(src.y, 0), def(src.z, 0));
  }
  var LRU = class {
    constructor(max) {
      this.max = max;
      this.map = /* @__PURE__ */ new Map();
    }
    get(k) {
      const v = this.map.get(k);
      if (v === void 0) return void 0;
      this.map.delete(k);
      this.map.set(k, v);
      return v;
    }
    set(k, v) {
      if (this.map.has(k)) this.map.delete(k);
      this.map.set(k, v);
      while (this.map.size > this.max) {
        const oldest = this.map.keys().next().value;
        const tex = this.map.get(oldest);
        if (tex && tex.dispose) tex.dispose();
        this.map.delete(oldest);
      }
      return v;
    }
    clear() {
      for (const t of this.map.values()) if (t && t.dispose) t.dispose();
      this.map.clear();
    }
  };
  var Pool = class {
    /**
     * @param {number} cap 池容量
     * @param {number} limit 并发上限
     * @param {(u:object, o:object)=>void} onSpawn
     * @param {(u:object, dt:number)=>void} onUpdate 内部通过 setAlive(u,false) 报死
     */
    constructor(cap, limit, onSpawn, onUpdate) {
      this.cap = cap;
      this.limit = limit;
      this.onSpawn = onSpawn;
      this.onUpdate = onUpdate;
      this.users = new Array(cap);
      for (let i = 0; i < cap; i++) {
        this.users[i] = { zone: this, index: i, alive: false, age: 0, life: 1 };
      }
      this.active = [];
      this._frozen = { zone: this, index: -1, alive: false, age: 0, life: 1 };
    }
    /** 取空闲实例；全忙则抢最旧的 */
    alloc() {
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        if (!u.alive) return u;
      }
      return this.active.length ? this.active[0] : this._frozen;
    }
    spawn(o) {
      const u = this.alloc();
      u.age = 0;
      this.onSpawn(u, o || {});
      if (u.index < 0) return u;
      if (u.alive && this.active.indexOf(u) < 0) {
        this.active.push(u);
        while (this.active.length > this.limit) {
          this.setAlive(this.active[0], false);
          this.active.shift();
        }
      }
      return u;
    }
    setAlive(u, on) {
      u.alive = on;
    }
    update(dt) {
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        u.age += dt;
        this.onUpdate(u, dt);
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        if (!this.active[i].alive) {
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
        }
      }
    }
    releaseAll() {
      for (let i = 0; i < this.active.length; i++) this.setAlive(this.active[i], false);
      this.active.length = 0;
    }
    get count() {
      return this.active.length;
    }
  };
  function makeCanvas(w, h) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    return cv;
  }
  function finishTex(cv, repeat) {
    const tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
    tex.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
  function texGlow() {
    const s = 128;
    const cv = makeCanvas(s, s);
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.18, "rgba(255,255,255,0.92)");
    grd.addColorStop(0.42, "rgba(255,255,255,0.34)");
    grd.addColorStop(0.72, "rgba(255,255,255,0.07)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return finishTex(cv, false);
  }
  function texStar() {
    const s = 128;
    const cv = makeCanvas(s, s);
    const g = cv.getContext("2d");
    const half = s / 2;
    const grd = g.createRadialGradient(half, half, 0, half, half, half * 0.55);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = "lighter";
    g.translate(half, half);
    for (let a = 0; a < 4; a++) {
      g.rotate(Math.PI / 2);
      const lg = g.createLinearGradient(0, 0, 0, -half);
      lg.addColorStop(0, "rgba(255,255,255,0.95)");
      lg.addColorStop(0.45, "rgba(255,255,255,0.28)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(-half * 0.075, 0);
      g.lineTo(0, -half);
      g.lineTo(half * 0.075, 0);
      g.closePath();
      g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    return finishTex(cv, false);
  }
  function texRing() {
    const s = 128;
    const cv = makeCanvas(s, s);
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.62, "rgba(255,255,255,0)");
    grd.addColorStop(0.82, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.92, "rgba(255,255,255,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return finishTex(cv, false);
  }
  function texSmoke() {
    const s = 128;
    const half = s / 2;
    const cv = makeCanvas(s, s);
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(half, half, 0, half, half, half);
    grd.addColorStop(0, "rgba(255,255,255,0.75)");
    grd.addColorStop(0.4, "rgba(255,255,255,0.42)");
    grd.addColorStop(0.72, "rgba(255,255,255,0.14)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 120; i++) {
      const a = rnd() * TAU2;
      const px2 = half + Math.cos(a) * s * (0.22 + rnd() * 0.28);
      const py2 = half + Math.sin(a) * s * (0.22 + rnd() * 0.28);
      const rad = 2 + rnd() * 12;
      const dg = g.createRadialGradient(px2, py2, 0, px2, py2, rad);
      dg.addColorStop(0, "rgba(0,0,0," + (0.1 + rnd() * 0.35).toFixed(3) + ")");
      dg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = dg;
      g.fillRect(px2 - rad, py2 - rad, rad * 2, rad * 2);
    }
    g.globalCompositeOperation = "source-over";
    return finishTex(cv, false);
  }
  function texNoise() {
    const s = 128;
    const cv = makeCanvas(s, s);
    const g = cv.getContext("2d");
    g.fillStyle = "#808080";
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = "lighter";
    for (const step of [32, 16, 8]) {
      for (let y = 0; y < s; y += step) {
        for (let x = 0; x < s; x += step) {
          const v = 0.5 + rnd2() * 0.5;
          const rad = step * (0.8 + rnd() * 0.7);
          const px2 = x + step * 0.5;
          const py2 = y + step * 0.5;
          const dg = g.createRadialGradient(px2, py2, 0, px2, py2, rad);
          dg.addColorStop(0, "rgba(255,255,255," + (0.18 * v).toFixed(3) + ")");
          dg.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = dg;
          g.fillRect(px2 - rad, py2 - rad, rad * 2, rad * 2);
        }
      }
    }
    g.globalCompositeOperation = "source-over";
    return finishTex(cv, true);
  }
  function texDamage(label, crit) {
    const fontPx = crit ? 132 : 104;
    const pad = crit ? 48 : 34;
    const cv = makeCanvas(8, 8);
    let g = cv.getContext("2d");
    g.font = "900 " + fontPx + "px " + FONT_STACK;
    let w = 200;
    try {
      const m = g.measureText(label);
      if (m && typeof m.width === "number" && m.width > 0) w = Math.ceil(m.width);
    } catch (e) {
      w = 200;
    }
    const cw = Math.max(64, Math.ceil(w + pad * 2));
    const ch = fontPx + pad * 2;
    cv.width = cw;
    cv.height = ch;
    g = cv.getContext("2d");
    g.clearRect(0, 0, cw, ch);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 " + fontPx + "px " + FONT_STACK;
    const cx = cw / 2;
    const cy = ch / 2;
    g.shadowColor = crit ? "rgba(255,150,40,0.95)" : "rgba(140,190,255,0.75)";
    g.shadowBlur = crit ? 34 : 18;
    g.fillStyle = crit ? "#ffd873" : "#ffffff";
    g.fillText(label, cx, cy);
    g.shadowBlur = 0;
    g.lineJoin = "round";
    g.lineWidth = crit ? 13 : 9;
    g.strokeStyle = "#06060c";
    g.strokeText(label, cx, cy);
    g.lineWidth = crit ? 7 : 5;
    g.strokeStyle = "#101018";
    g.strokeText(label, cx, cy);
    g.fillStyle = crit ? "#ffd873" : "#ffffff";
    g.fillText(label, cx, cy);
    g.fillStyle = "rgba(255,255,255,0.72)";
    g.fillText(label, cx, cy - fontPx * 0.03);
    const tex = finishTex(cv, false);
    tex.userData = { aspect: cw / ch };
    return tex;
  }
  function texCallout(text, sub, colorHex, color2Hex) {
    const fontPx = 190;
    const subPx = 62;
    const padX = 110;
    const hasSub = !!sub;
    const cv = makeCanvas(8, 8);
    let g = cv.getContext("2d");
    g.font = "900 " + fontPx + "px " + FONT_STACK;
    let w = 600;
    let sw = 300;
    try {
      const m = g.measureText(text);
      if (m && typeof m.width === "number" && m.width > 0) w = Math.ceil(m.width);
    } catch (e) {
      w = 600;
    }
    if (hasSub) {
      try {
        const m2 = g.measureText(sub);
        if (m2 && typeof m2.width === "number" && m2.width > 0) sw = Math.ceil(m2.width);
      } catch (e) {
        sw = 300;
      }
    }
    const cw = Math.max(320, Math.ceil(w + padX * 2), Math.ceil(sw + padX * 2));
    const ch = Math.ceil(fontPx * 1.3 + (hasSub ? subPx * 1.6 : 0) + 130);
    cv.width = cw;
    cv.height = ch;
    g = cv.getContext("2d");
    g.clearRect(0, 0, cw, ch);
    g.textAlign = "center";
    g.textBaseline = "middle";
    const cx = cw / 2;
    const cy = 42 + fontPx * 0.66;
    const mainCol = colorHex === void 0 || colorHex === null ? "#ffffff" : "#" + new Color(colorHex).getHexString();
    const glowCol = color2Hex === void 0 || color2Hex === null ? "#ff2d6f" : "#" + new Color(color2Hex).getHexString();
    g.font = "900 " + fontPx + "px " + FONT_STACK;
    g.shadowColor = glowCol;
    g.shadowBlur = 48;
    g.fillStyle = glowCol;
    g.fillText(text, cx, cy);
    g.shadowBlur = 0;
    g.lineJoin = "round";
    g.miterLimit = 2;
    g.strokeStyle = "#06060c";
    g.lineWidth = 32;
    g.strokeText(text, cx, cy);
    g.lineWidth = 18;
    g.strokeStyle = "#0b0b16";
    g.strokeText(text, cx, cy);
    g.fillStyle = mainCol;
    g.fillText(text, cx, cy);
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.fillText(text, cx, cy - fontPx * 0.035);
    if (hasSub) {
      const sy = cy + fontPx * 0.72 + subPx;
      g.font = "700 " + subPx + "px " + FONT_STACK;
      g.lineWidth = 12;
      g.strokeStyle = "#06060c";
      g.strokeText(sub, cx, sy);
      g.fillStyle = "#ffe9b0";
      g.fillText(sub, cx, sy);
    }
    const seal = 76;
    const sx = cw - padX * 0.6 - seal;
    const sy2 = ch - 32 - seal;
    g.fillStyle = "rgba(190,24,40,0.92)";
    g.fillRect(sx, sy2, seal, seal);
    g.strokeStyle = "rgba(255,230,230,0.85)";
    g.lineWidth = 5;
    g.strokeRect(sx + 6, sy2 + 6, seal - 12, seal - 12);
    g.fillStyle = "rgba(255,242,242,0.95)";
    g.font = "700 " + Math.round(seal * 0.62) + "px " + FONT_STACK;
    g.fillText("祓", sx + seal / 2, sy2 + seal / 2 + 2);
    const tex = finishTex(cv, false);
    tex.userData = { aspect: cw / ch };
    return tex;
  }
  var TexBank = class {
    constructor() {
      this._glow = null;
      this._star = null;
      this._ring = null;
      this._smoke = null;
      this._noise = null;
      this.damage = new LRU(DAMAGE_TEX_MAX);
      this.callout = new LRU(CALLOUT_TEX_MAX);
    }
    glow() {
      if (!this._glow) this._glow = texGlow();
      return this._glow;
    }
    star() {
      if (!this._star) this._star = texStar();
      return this._star;
    }
    ring() {
      if (!this._ring) this._ring = texRing();
      return this._ring;
    }
    smoke() {
      if (!this._smoke) this._smoke = texSmoke();
      return this._smoke;
    }
    noise() {
      if (!this._noise) this._noise = texNoise();
      return this._noise;
    }
    damageTex(label, crit) {
      const k = (crit ? "C|" : "N|") + label;
      let t = this.damage.get(k);
      if (!t) t = this.damage.set(k, texDamage(label, crit));
      return t;
    }
    calloutTex(text, sub, color, color2) {
      const k = text + "|" + (sub || "") + "|" + def(color, -1) + "|" + def(color2, -1);
      let t = this.callout.get(k);
      if (!t) t = this.callout.set(k, texCallout(text, sub, color, color2));
      return t;
    }
    dispose() {
      for (const t of [this._glow, this._star, this._ring, this._smoke, this._noise]) {
        if (t) t.dispose();
      }
      this._glow = this._star = this._ring = this._smoke = this._noise = null;
      this.damage.clear();
      this.callout.clear();
    }
  };
  function makeRingGeo(segments, thickness, radialSteps) {
    const t = clamp3(thickness, 0.02, 0.98);
    const inner = 1 - t;
    const seg = clamp3(segments | 0, 8, 160);
    const rows = clamp3(radialSteps | 0, 1, 16);
    const n = (seg + 1) * (rows + 1);
    const pos = new Float32Array(n * 3);
    const aRad = new Float32Array(n);
    const idx = new Uint16Array(seg * rows * 6);
    let p = 0;
    for (let r = 0; r <= rows; r++) {
      const rt = r / rows;
      const radius = inner + (1 - inner) * rt;
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * TAU2;
        pos[p * 3 + 0] = Math.cos(a) * radius;
        pos[p * 3 + 1] = Math.sin(a) * radius;
        pos[p * 3 + 2] = 0;
        aRad[p] = rt;
        p++;
      }
    }
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < seg; i++) {
        const a0 = r * (seg + 1) + i;
        const b0 = a0 + seg + 1;
        idx[k++] = a0;
        idx[k++] = b0;
        idx[k++] = a0 + 1;
        idx[k++] = a0 + 1;
        idx[k++] = b0;
        idx[k++] = b0 + 1;
      }
    }
    const geo = new BufferGeometry();
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aRadial", new BufferAttribute(aRad, 1));
    geo.boundingSphere = new Sphere(new Vector3(), 1.05);
    return geo;
  }
  function makeBeamGeo(radialSegments) {
    const seg = clamp3(radialSegments | 0, 6, 64);
    const n = (seg + 1) * 2;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const ang = new Float32Array(n);
    const idx = new Uint16Array(seg * 6);
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * TAU2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const o = i * 2;
      pos[o * 3 + 0] = ca;
      pos[o * 3 + 1] = -0.5;
      pos[o * 3 + 2] = sa;
      pos[(o + 1) * 3 + 0] = ca;
      pos[(o + 1) * 3 + 1] = 0.5;
      pos[(o + 1) * 3 + 2] = sa;
      for (let k = 0; k < 2; k++) {
        nrm[(o + k) * 3 + 0] = ca;
        nrm[(o + k) * 3 + 1] = 0;
        nrm[(o + k) * 3 + 2] = sa;
        uv[(o + k) * 2 + 0] = k;
        uv[(o + k) * 2 + 1] = i / seg;
        ang[o + k] = a;
      }
    }
    for (let i = 0; i < seg; i++) {
      const o = i * 2;
      const k = i * 6;
      idx[k + 0] = o;
      idx[k + 1] = o + 1;
      idx[k + 2] = o + 2;
      idx[k + 3] = o + 2;
      idx[k + 4] = o + 1;
      idx[k + 5] = o + 3;
    }
    const geo = new BufferGeometry();
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("normal", new BufferAttribute(nrm, 3));
    geo.setAttribute("uv", new BufferAttribute(uv, 2));
    geo.setAttribute("aAng", new BufferAttribute(ang, 1));
    return geo;
  }
  function makeCrescentGeo(segments) {
    const seg = clamp3(segments | 0, 6, 96);
    const n = (seg + 1) * 2;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const idx = new Uint16Array(seg * 6);
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const x = t - 0.5;
      const bulge = Math.sin(Math.PI * t);
      const half = 0.5 * Math.pow(Math.max(0, bulge), 0.62);
      const o = i * 2;
      pos[o * 3 + 0] = x;
      pos[o * 3 + 1] = half;
      pos[o * 3 + 2] = 0;
      pos[(o + 1) * 3 + 0] = x;
      pos[(o + 1) * 3 + 1] = -half;
      pos[(o + 1) * 3 + 2] = 0;
      uv[o * 2 + 0] = t;
      uv[o * 2 + 1] = 1;
      uv[(o + 1) * 2 + 0] = t;
      uv[(o + 1) * 2 + 1] = -1;
    }
    for (let i = 0; i < seg; i++) {
      const o = i * 2;
      const k = i * 6;
      idx[k + 0] = o;
      idx[k + 1] = o + 1;
      idx[k + 2] = o + 2;
      idx[k + 3] = o + 2;
      idx[k + 4] = o + 1;
      idx[k + 5] = o + 3;
    }
    const geo = new BufferGeometry();
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("uv", new BufferAttribute(uv, 2));
    geo.boundingSphere = new Sphere(new Vector3(), 1);
    return geo;
  }
  function makeLightningGeo() {
    const pos = new Float32Array(LIGHT_VERTS * 3);
    const aSide = new Float32Array(LIGHT_VERTS);
    const aU = new Float32Array(LIGHT_VERTS);
    for (let i = 0; i < LIGHT_VERTS; i++) {
      aSide[i] = i % 2 === 0 ? -1 : 1;
      pos[i * 3 + 1] = -1e6;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aSide", new BufferAttribute(aSide, 1));
    geo.setAttribute("aU", new BufferAttribute(aU, 1));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new Sphere(new Vector3(), 1e6);
    return geo;
  }
  function makeTrailGeo() {
    const n = TRAIL_PAIRS * 2;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < TRAIL_PAIRS; i++) {
      const t = i / TRAIL_SEGS;
      const o = i * 2;
      uv[o * 2 + 0] = t;
      uv[o * 2 + 1] = 0;
      uv[(o + 1) * 2 + 0] = t;
      uv[(o + 1) * 2 + 1] = 1;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("uv", new BufferAttribute(uv, 2));
    geo.setAttribute("aCol", new BufferAttribute(col, 3));
    geo.boundingSphere = new Sphere(new Vector3(), 1e6);
    geo.setDrawRange(0, 0);
    return geo;
  }
  var PARTICLE_VS = (
    /* glsl */
    `
precision highp float;
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  float d = max( 0.35, -mv.z );
  gl_PointSize = clamp( aSize * uScale / d, 1.0, 900.0 );
}
`
  );
  var PARTICLE_FS = (
    /* glsl */
    `
precision highp float;
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D( uMap, gl_PointCoord );
  float a = t.a * vAlpha;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColor * t.rgb * a, a );
}
`
  );
  var RING_VS = (
    /* glsl */
    `
precision highp float;
attribute float aRadial;
varying vec2 vP;
varying float vRad;
void main() {
  vP = position.xy;
  vRad = aRadial;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
  );
  var RING_FS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
uniform float uLife;
uniform vec3  uColor;
uniform vec3  uColor2;
uniform float uBright;
uniform float uSoft;
uniform float uInner;
uniform float uBurn;
uniform float uArc;      // 0 = 整环；>0 = 只在某个扇区内显形（有方向的冲击波）
uniform float uArcDir;   // 扇区中心（局部极角）
varying vec2 vP;
varying float vRad;
float hash11( float p ) {
  return fract( sin( p * 127.1 ) * 43758.5453123 );
}
void main() {
  float r = length( vP );
  // 环形亮度：边缘比中心亮
  float band = smoothstep( 0.0, uSoft, vRad ) * ( 1.0 - smoothstep( 1.0 - uSoft, 1.0, vRad ) );
  float rim  = pow( smoothstep( 0.32, 1.0, vRad ), 2.2 );
  float body = max( band * 0.70, rim );
  float a = body * uInner * uLife * uBright;
  vec3 col = mix( uColor, uColor2, rim );
  col += vec3( 1.0 ) * pow( rim, 3.0 ) * 0.55;
  if ( uBurn > 0.0 && r < 0.985 ) {
    // 地面烧灼：径向暗化 + 随机裂纹
    float ang = atan( vP.y, vP.x );
    float crack = sin( ang * 27.0 ) * sin( ang * 11.0 + 1.7 ) * sin( ang * 6.0 - 0.6 );
    float cmask = smoothstep( 0.58, 1.0, crack );
    float cr = 0.28 + 0.64 * hash11( ang * 91.7 );
    float crackLine = cmask * smoothstep( abs( r - cr ), 0.0, 0.055 );
    float burn = ( 1.0 - smoothstep( 0.30, 0.98, r ) ) * 0.44;
    col = mix( col, uColor2 * 0.20, burn * uBurn * uLife );
    col += uColor2 * crackLine * uBurn * uLife * 1.5;
    a += crackLine * uBurn * uLife * 0.85;
  }
  /* --- 方向性扇区 ---
   * 斥力冲击波不是一圈均匀的白环，而是"朝着某个方向压出去的一道波前"。
   * uArc>0 时只在 uArcDir 附近的扇区显形，扇区边缘快速淡出，
   * 再把扇区中心提亮，就读得出"从哪来、往哪去"。
   */
  if ( uArc > 0.001 ) {
    float ang = atan( vP.y, vP.x );
    float da = ang - uArcDir;
    da = atan( sin( da ), cos( da ) );
    float m = 1.0 - smoothstep( uArc * 0.30, uArc, abs( da ) );
    a *= m * m;
    col *= 0.5 + 0.5 * m;
  }
  // 圆环内侧不要实心亮斑
  a *= 1.0 - ( 1.0 - smoothstep( 0.0, 0.9, r ) ) * 0.75;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( col * a, a );
}
`
  );
  var BEAM_VS = (
    /* glsl */
    `
precision highp float;
attribute float aAng;
varying vec2 vUv;
varying float vAng;
void main() {
  vUv = uv;
  vAng = aAng;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
  );
  var BEAM_FS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
uniform float uLife;
uniform vec3  uColor;
uniform vec3  uColor2;
uniform float uCore;
uniform float uGlow;
uniform float uGrow;
uniform float uHelix;
uniform float uSeed;
varying vec2 vUv;
varying float vAng;
float hash21( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
void main() {
  float y  = vUv.y;
  float rr = vUv.x;
  float an = vAng;
  float core = pow( 1.0 - clamp( rr, 0.0, 1.0 ), 2.0 );
  // 沿轴向流动的两层噪声
  float n1 = vnoise( vec2( an * 1.7 + uSeed, y * 7.0 - uTime * 4.2 ) );
  float n2 = vnoise( vec2( an * 4.1 - uSeed * 1.7, y * 15.0 - uTime * 8.5 ) );
  float turb = mix( n1, n2, 0.45 );
  float along = 0.60 + 0.60 * turb;
  // 两端渐隐
  float cap = smoothstep( 0.0, 0.07, y ) * ( 1.0 - smoothstep( 0.90, 1.0, y ) );
  // 伸展动画：未展开的一端淡出
  float front = smoothstep( uGrow - 0.10, uGrow + 0.02, y );
  float body = ( core * uCore + ( 1.0 - core ) * uGlow * 0.85 ) * along * cap * front;
  vec3 col = mix( uColor2, uColor, core );
  col = mix( col, vec3( 1.0 ), pow( core, 3.0 ) * 0.85 );
  if ( uHelix > 0.0 ) {
    // 螺旋缠绕的能量丝（茈 用）
    float ph = an * 2.0 + y * 26.0 - uTime * 6.5 + uSeed * 3.1;
    float sp = pow( max( 0.0, sin( ph ) ), 16.0 );
    float sp2 = pow( max( 0.0, sin( ph * 1.53 + 2.1 ) ), 22.0 );
    float fil = ( sp + sp2 * 0.7 ) * uHelix * cap * front;
    col += ( uColor2 * 1.1 + vec3( 0.45 ) ) * fil * 1.7;
    body += fil * 0.75;
  }
  float a = body * uLife;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( col * a, a );
}
`
  );
  var SLASH_VS = (
    /* glsl */
    `
precision highp float;
varying vec2 vSuv;
void main() {
  vSuv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
  );
  var SLASH_FS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
uniform float uLife;
uniform vec3  uColor;
uniform vec3  uColor2;
uniform float uSweep;
uniform float uEdge;
uniform float uSeed;
varying vec2 vSuv;
float hash21( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
void main() {
  float u = vSuv.x;
  float v = abs( vSuv.y );
  // 横向剖面：中线白热刀刃 + 柔边
  float prof = exp( -v * v * 26.0 ) * 0.95 + pow( max( 0.0, 1.0 - v ), 0.55 ) * 0.35;
  float base = ( 1.0 - v ) * 0.28;
  // 两端收尖
  float tip = smoothstep( 0.0, 0.055, u ) * ( 1.0 - smoothstep( 0.945, 1.0, u ) );
  // 扫过动画：刀锋前沿之后的残像
  float travel = smoothstep( u, u + 0.34, uSweep );
  float head = exp( -pow( ( u - uSweep ) * 7.5, 2.0 ) );
  float body = base + prof * ( 0.22 + 0.78 * travel ) + head * prof * 1.5;
  body *= tip;
  // 轻微颗粒抖动（加 uSeed 让不同刀光的噪点不重复）
  float n = hash21( vec2( floor( u * 40.0 ), floor( v * 6.0 ) + uSeed ) );
  body *= 0.88 + 0.24 * n;
  vec3 col = mix( uColor, uColor2, pow( v, 0.7 ) );
  col = mix( col, vec3( 1.0 ), exp( -v * v * 34.0 ) * 0.85 );
  col += uColor2 * head * 0.9;
  float a = body * uLife * uEdge;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( col * a, a );
}
`
  );
  var SPHERE_VS = (
    /* glsl */
    `
precision highp float;
varying vec3 vN;
varying vec3 vP;
varying vec3 vVp;
void main() {
  vN = normalize( normalMatrix * normal );
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vP = wp.xyz;
  vVp = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
  );
  /* 咒力球外壳：只画「边缘光 + 表面流动 + 迎风面亮斑」。
   * 中心刻意留暗（加法混合下中心贡献接近 0），让球体内部的暗核露出来，
   * 这样一颗球才有剪影；迎风面亮斑沿运动方向，一眼能看出它往哪飞。 */
  var SPHERE_FS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
uniform float uLife;
uniform float uCharge;
uniform float uDistort;
uniform float uPulse;
uniform float uStreak;
uniform vec3  uColor;
uniform vec3  uCore;
uniform vec3  uHot;
uniform vec3  uStreakDir;
varying vec3 vN;
varying vec3 vP;
varying vec3 vVp;
float hash31( vec3 p ) {
  p = fract( p * 0.3183099 + vec3( 0.1, 0.2, 0.3 ) );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float noise3( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  float n000 = hash31( i + vec3( 0.0, 0.0, 0.0 ) );
  float n100 = hash31( i + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = hash31( i + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = hash31( i + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = hash31( i + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = hash31( i + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = hash31( i + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = hash31( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix(
    mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
    mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ),
    f.z );
}
float fbm( vec3 p ) {
  float s = 0.0;
  float a = 0.5;
  for ( int i = 0; i < 4; i++ ) {
    s += a * noise3( p );
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
void main() {
  vec3 n = normalize( vN );
  vec3 v = normalize( vVp );
  // 半径越小（引力越强）表面扰动尺度越细
  float sc = 2.6 / max( 0.35, 1.0 + uDistort * 2.2 );
  vec3 q = vP * sc + vec3( 0.0, uTime * 0.20, uTime * 0.36 );
  float f = fbm( q + fbm( q * 0.5 ) * 1.3 );
  // 边缘光：视线越掠射越亮 —— 球体的"轮廓线"来源，中心留暗保证剪影
  float fres = pow( 1.0 - clamp( dot( n, v ), 0.0, 1.0 ), 3.1 );
  // 迎风面：沿运动方向的那半球亮起来，是"方向感"的主要来源
  float head = pow( clamp( dot( n, normalize( uStreakDir ) ), 0.0, 1.0 ), 2.2 ) * uStreak;
  // 赤道吸积带（细，不要糊满整个球）
  float disk = pow( max( 0.0, 1.0 - abs( n.y ) ), 6.0 );
  float bright = mix( 0.50, 1.35, uCharge );
  vec3 col = mix( uColor, uCore, clamp( f * f * 1.7 + head * 0.55, 0.0, 1.0 ) );
  col = mix( col, uHot, clamp( head * 0.85, 0.0, 0.75 ) );
  col *= bright * ( 0.72 + 0.30 * f + 0.75 * fres + 0.35 * head + 0.20 * disk ) * ( 1.0 + uPulse * 0.35 );
  // 中心留暗：a 主要由边缘光/噪声/迎风面贡献，facing 相机的正面几乎不发光
  float a = ( 0.34 + 0.66 * uCharge ) * ( 0.10 + 0.95 * fres * fres + 0.55 * f + 0.70 * head ) * uLife;
  a = clamp( a, 0.0, 1.0 );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( col * a, a );
}
`
  );
  var AURA_VS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
varying vec3 vN;
varying vec3 vNw;
varying vec3 vP;
varying vec3 vVp;
float hash31( vec3 p ) {
  p = fract( p * 0.3183099 + vec3( 0.1, 0.2, 0.3 ) );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float noise3( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  float n000 = hash31( i + vec3( 0.0, 0.0, 0.0 ) );
  float n100 = hash31( i + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = hash31( i + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = hash31( i + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = hash31( i + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = hash31( i + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = hash31( i + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = hash31( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix(
    mix( mix( n000, n100, f.x ), mix( n010, n110, f.x ), f.y ),
    mix( mix( n001, n101, f.x ), mix( n011, n111, f.x ), f.y ),
    f.z );
}
void main() {
  vec3 dir = normalize( position );
  vec3 q = position * 1.9 + vec3( 0.0, uTime * 0.75, 0.0 );
  float n = noise3( q ) * 0.65 + noise3( q * 2.2 - 1.4 ) * 0.35;
  float d = ( n - 0.5 ) * 0.30;
  vec3 disp = position + dir * d;
  vN = normalize( normalMatrix * normal );
  vNw = normalize( normalize( mat3( modelMatrix ) * normal ) + dir * d * 0.9 );
  vec4 wp = modelMatrix * vec4( disp, 1.0 );
  vP = wp.xyz;
  vVp = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
  );
  var AURA_FS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
uniform float uLife;
uniform float uIntensity;
uniform float uKind;
uniform vec3  uColor;
uniform vec3  uColor2;
varying vec3 vN;
varying vec3 vNw;
varying vec3 vP;
varying vec3 vVp;
float hash21( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
void main() {
  vec3 N = normalize( vN );
  vec3 Nw = normalize( vNw );
  float fres = pow( 1.0 - clamp( dot( N, normalize( vVp ) ), 0.0, 1.0 ), 2.1 );
  vec3 col = uColor;
  float a = 0.0;
  float lon = atan( Nw.z, Nw.x );
  float lat = asin( clamp( Nw.y, -1.0, 1.0 ) );
  if ( uKind < 0.5 ) {
    // 0 = cursed：普通咒力外放，向上流动的火舌
    float up = vP.y * 0.55 - uTime * 1.35;
    float n = vnoise( vec2( lon * 2.2, up * 1.6 ) );
    float flame = pow( max( 0.0, n * 1.25 ), 2.0 );
    a = ( fres * 0.55 + flame * 0.45 ) * uIntensity;
    col = mix( uColor, uColor2, flame );
  } else if ( uKind < 1.5 ) {
    // 1 = infinity：空间被无限细分 —— 网格线 + 表面涟漪
    float grid = max(
      smoothstep( 0.90, 1.0, abs( sin( lat * 7.0 + uTime * 0.35 ) ) ),
      smoothstep( 0.90, 1.0, abs( sin( lon * 9.0 ) ) ) );
    float rip = vnoise( Nw.xz * 5.0 + vec2( uTime * 0.55, -uTime * 0.4 ) );
    float ripple = pow( max( 0.0, sin( rip * 9.0 - uTime * 2.4 ) ), 6.0 );
    a = ( grid * 0.55 + ripple * 0.50 + fres * 0.22 ) * uIntensity;
    col = mix( uColor, uColor2, max( grid, ripple ) );
    col += vec3( 0.5 ) * ripple;
  } else if ( uKind < 2.5 ) {
    // 2 = shrine：白骨 / 刀刃碎片外壳，冷白硬边
    float n = vnoise( vec2( lon * 6.0, Nw.y * 4.0 ) );
    float slab = smoothstep( 0.55, 0.95, n );
    a = ( slab * 0.55 + fres * 0.42 ) * uIntensity;
    col = mix( uColor, uColor2, slab );
    col += uColor2 * fres * 0.7;
  } else {
    // 3 = flame：竈 的灼热外壳，橙红向上翻滚
    float up = vP.y * 0.9 - uTime * 2.1;
    float n = vnoise( vec2( lon * 3.4 + uTime * 0.3, up * 2.2 ) );
    float n2 = vnoise( vec2( lon * 7.1 - uTime * 0.5, up * 4.6 ) );
    float heat = pow( max( 0.0, n * 0.70 + n2 * 0.55 ), 1.7 );
    float hi = smoothstep( 0.62, 1.0, heat );
    a = ( heat * 0.72 + fres * 0.50 ) * uIntensity;
    col = mix( uColor, uColor2, 0.35 );
    col = mix( col, vec3( 1.0, 0.92, 0.70 ), hi * 0.85 );
  }
  a *= uLife;
  a = clamp( a, 0.0, 1.0 );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( col * a, a );
}
`
  );
  var DEBRIS_VS = (
    /* glsl */
    `
precision highp float;
attribute vec3 aCol;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vVp;
void main() {
  vCol = aCol;
  vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
  vN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * normal );
  vVp = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
  );
  var DEBRIS_FS = (
    /* glsl */
    `
precision highp float;
uniform float uFog;
uniform vec3 uLight;      // 固定主光方向（世界空间）——原来是拿视线方向当光，导致碎片"怎么转都不变"
varying vec3 vCol;
varying vec3 vN;
varying vec3 vVp;
void main() {
  vec3 n = normalize( vN );
  vec3 l = normalize( uLight );
  // 主光 + 天空/地面双向补光：碎片要有明暗面，才不是一块贴纸
  float key = clamp( dot( n, l ) * 0.5 + 0.5, 0.0, 1.0 );
  float sky = clamp( n.y * 0.5 + 0.5, 0.0, 1.0 );
  float lam = 0.22 + 0.62 * key + 0.16 * sky;
  vec3 col = vCol * lam;
  // 一点环境色，避免暗面死黑
  col += vec3( 0.012, 0.016, 0.026 );
  gl_FragColor = vec4( col * uFog, 1.0 );
}
`
  );
  var TRAIL_VS = (
    /* glsl */
    `
precision highp float;
attribute vec3 aCol;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv;
  vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
  );
  var TRAIL_FS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
uniform vec3  uColor;
uniform vec3  uColor2;
varying vec2 vUv;
varying vec3 vCol;
float hash21( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
void main() {
  float u = vUv.x;                 // 0 = 尾端（老），1 = 头端（新）
  float v = abs( vUv.y * 2.0 - 1.0 );
  float taper = 0.08 + 0.92 * u;
  float prof = exp( -v * v * 5.2 ) * 0.55 + ( 1.0 - v ) * 0.45;
  float flick = 0.80 + 0.30 * hash21( vec2( floor( u * 22.0 ), floor( uTime * 14.0 ) ) );
  vec3 col = mix( uColor2, uColor, u );
  col = mix( col, vec3( 1.0 ), pow( u, 3.0 ) * 0.55 );
  float a = prof * taper * vCol.x * flick;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( col * a, a );
}
`
  );
  var LIGHT_VS = (
    /* glsl */
    `
precision highp float;
attribute float aSide;
attribute float aU;
varying float vU;
varying float vSide;
void main() {
  vU = aU;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
  );
  var LIGHT_FS = (
    /* glsl */
    `
precision highp float;
uniform float uTime;
uniform float uLife;
uniform float uFlick;
uniform float uSeed;
uniform vec3  uColor;
uniform vec3  uColor2;
varying float vU;
varying float vSide;
float hash21( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
void main() {
  float fade = smoothstep( 0.0, 0.10, vU ) * ( 1.0 - smoothstep( 0.86, 1.0, vU ) );
  float pulse = 0.72 + 0.55 * hash21( vec2( floor( vU * 26.0 ) + uSeed, floor( uTime * 44.0 ) ) );
  float core = exp( -abs( vSide ) * 2.6 );
  float glow = exp( -abs( vSide ) * 1.1 ) * 0.5;
  vec3 col = mix( uColor, uColor2, 0.35 + 0.4 * hash21( vec2( floor( vU * 18.0 ), uSeed ) ) );
  col = mix( col, vec3( 1.0 ), core * 0.9 );
  float a = ( core * 0.95 + glow ) * fade * pulse * uFlick * uLife;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( col * a, a );
}
`
  );
  function makeMaterials(tex) {
    const m = {};
    const add = AdditiveBlending;
    m.particle = new ShaderMaterial({
      uniforms: { uMap: { value: tex.glow() }, uScale: { value: 1080 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: add
    });
    m.shock = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 1 },
        uColor: { value: new Color(C.WHITE) },
        uColor2: { value: new Color(C.CYAN) },
        uBright: { value: 1 },
        uSoft: { value: 0.42 },
        uInner: { value: 1 },
        uBurn: { value: 0 },
        uArc: { value: 0 },
        uArcDir: { value: 0 }
      },
      vertexShader: RING_VS,
      fragmentShader: RING_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: add
    });
    m.ground = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 0 },
        uColor: { value: new Color(C.NEON_AMBER) },
        uColor2: { value: new Color(C.SCARLET) },
        uBright: { value: 1 },
        uSoft: { value: 0.5 },
        uInner: { value: 1 },
        uBurn: { value: 1 },
        uArc: { value: 0 },
        uArcDir: { value: 0 }
      },
      vertexShader: RING_VS,
      fragmentShader: RING_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: add
    });
    m.beam = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 1 },
        uColor: { value: new Color(C.WHITE) },
        uColor2: { value: new Color(C.VIOLET) },
        uCore: { value: 0.65 },
        uGlow: { value: 1 },
        uGrow: { value: 1 },
        uHelix: { value: 0 },
        uSeed: { value: 0 }
      },
      vertexShader: BEAM_VS,
      fragmentShader: BEAM_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: add
    });
    m.slash = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 1 },
        uColor: { value: new Color(C.WHITE) },
        uColor2: { value: new Color(C.CYAN) },
        uSweep: { value: 1 },
        uEdge: { value: 1 },
        uSeed: { value: 0 }
      },
      vertexShader: SLASH_VS,
      fragmentShader: SLASH_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: add
    });
    // 咒力球外壳模板：SpherePool 会按实例克隆它（每个球自己的颜色/寿命/方向）
    m.sphere = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 1 },
        uCharge: { value: 1 },
        uDistort: { value: 0 },
        uPulse: { value: 0 },
        uStreak: { value: 0 },
        uColor: { value: new Color(C.AZURE) },
        uCore: { value: new Color(C.CYAN) },
        uHot: { value: new Color(C.WHITE) },
        uStreakDir: { value: new Vector3(0, 1, 0) }
      },
      vertexShader: SPHERE_VS,
      fragmentShader: SPHERE_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: add
    });
    m.aura = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 1 },
        uIntensity: { value: 1 },
        uKind: { value: 0 },
        uColor: { value: new Color(C.CRIMSON) },
        uColor2: { value: new Color(C.BLOOD) }
      },
      vertexShader: AURA_VS,
      fragmentShader: AURA_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: add
    });
    m.auraWire = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 1 },
        uIntensity: { value: 1 },
        uKind: { value: 1 },
        uColor: { value: new Color(C.CYAN) },
        uColor2: { value: new Color(C.AZURE) }
      },
      vertexShader: AURA_VS,
      fragmentShader: AURA_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      wireframe: true,
      blending: add
    });
    m.debris = new ShaderMaterial({
      uniforms: {
        uFog: { value: 1 },
        uLight: { value: new Vector3(-0.42, 0.78, 0.46).normalize() }
      },
      vertexShader: DEBRIS_VS,
      fragmentShader: DEBRIS_FS,
      transparent: false,
      depthWrite: true,
      depthTest: true
    });
    m.trail = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(C.CYAN) },
        uColor2: { value: new Color(C.AZURE) }
      },
      vertexShader: TRAIL_VS,
      fragmentShader: TRAIL_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: add
    });
    m.light = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: 0 },
        uFlick: { value: 1 },
        uSeed: { value: 0 },
        uColor: { value: new Color(C.VIOLET) },
        uColor2: { value: new Color(C.WHITE) }
      },
      vertexShader: LIGHT_VS,
      fragmentShader: LIGHT_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: DoubleSide,
      blending: add
    });
    return m;
  }
  var ParticlePool = class {
    constructor(ctx2, cap) {
      this.ctx = ctx2;
      this.cap = cap;
      const pos = new Float32Array(cap * 3);
      const col = new Float32Array(cap * 3);
      const size = new Float32Array(cap);
      const alpha = new Float32Array(cap);
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
      geo.setAttribute("aColor", new BufferAttribute(col, 3).setUsage(DynamicDrawUsage));
      geo.setAttribute("aSize", new BufferAttribute(size, 1).setUsage(DynamicDrawUsage));
      geo.setAttribute("aAlpha", new BufferAttribute(alpha, 1).setUsage(DynamicDrawUsage));
      geo.boundingSphere = new Sphere(new Vector3(), 1e6);
      this.geo = geo;
      this.arrPos = pos;
      this.arrCol = col;
      this.arrSize = size;
      this.arrAlpha = alpha;
      this.points = new Points(geo, ctx2.mats.particle);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
      ctx2.group.add(this.points);
      this.free = new Int32Array(cap);
      for (let i = 0; i < cap; i++) this.free[i] = i;
      this.freeTop = cap;
      this.d = new Array(cap);
      for (let i = 0; i < cap; i++) {
        this.d[i] = {
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          maxLife: 1,
          size0: 1,
          size1: 0,
          grav: 0,
          damp: 0,
          a0: 1,
          spin: 0,
          cx: 0,
          cy: 0,
          cz: 0
        };
      }
      this.live = 0;
    }
    alloc() {
      if (this.freeTop <= 0) return -1;
      return this.free[--this.freeTop];
    }
    /**
     * 生成一颗粒子。全部走位置参数，热路径不建对象。
     * spin>0 时粒子会向 (cx,cy,cz) 指数收束（蓄力 / 苍 的引力感）。
     */
    spawn(px2, py2, pz2, vx, vy, vz, r, g, b, size0, size1, life, grav, damp2, alpha, spin, cx, cy, cz) {
      const i = this.alloc();
      if (i < 0) return -1;
      const p = this.d[i];
      p.vx = vx;
      p.vy = vy;
      p.vz = vz;
      p.life = life;
      p.maxLife = life;
      p.size0 = size0;
      p.size1 = size1;
      p.grav = grav;
      p.damp = damp2;
      p.a0 = alpha;
      p.spin = spin;
      p.cx = cx;
      p.cy = cy;
      p.cz = cz;
      const o = i * 3;
      this.arrPos[o] = px2;
      this.arrPos[o + 1] = py2;
      this.arrPos[o + 2] = pz2;
      this.arrCol[o] = r;
      this.arrCol[o + 1] = g;
      this.arrCol[o + 2] = b;
      this.arrSize[i] = size0;
      this.arrAlpha[i] = alpha;
      this.live++;
      return i;
    }
    update(dt) {
      const a = this.arrPos;
      const sz = this.arrSize;
      const al = this.arrAlpha;
      const d = this.d;
      const free = this.free;
      let live = 0;
      let top = this.freeTop;
      for (let i = 0; i < this.cap; i++) {
        const p = d[i];
        if (p.life <= 0) {
          if (sz[i] !== 0) sz[i] = 0;
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          sz[i] = 0;
          al[i] = 0;
          if (top < this.cap) free[top++] = i;
          continue;
        }
        const k = p.life / p.maxLife;
        const o = i * 3;
        if (p.spin > 0) {
          const f = Math.exp(-p.spin * dt);
          a[o] = p.cx + (a[o] - p.cx) * f;
          a[o + 1] = p.cy + (a[o + 1] - p.cy) * f;
          a[o + 2] = p.cz + (a[o + 2] - p.cz) * f;
        }
        const dm = p.damp > 0 ? Math.exp(-p.damp * dt) : 1;
        p.vx *= dm;
        p.vz *= dm;
        p.vy = p.vy * dm + p.grav * dt;
        a[o] += p.vx * dt;
        a[o + 1] += p.vy * dt;
        a[o + 2] += p.vz * dt;
        const inv = 1 - k;
        sz[i] = p.size0 + (p.size1 - p.size0) * inv;
        al[i] = p.a0 * (k < 0.72 ? 1 : (1 - k) / 0.28);
        live++;
      }
      this.freeTop = top;
      this.live = live;
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
    /** 把场上粒子朝某点拉（可选，供 苍 的引力场使用） */
    pull(x, y, z, strength, radius) {
      const a = this.arrPos;
      const r2 = radius * radius;
      for (let i = 0; i < this.cap; i++) {
        if (this.d[i].life <= 0) continue;
        const o = i * 3;
        const dx = x - a[o];
        const dy = y - a[o + 1];
        const dz = z - a[o + 2];
        const dsq = dx * dx + dy * dy + dz * dz;
        if (dsq > r2 || dsq < 1e-4) continue;
        const inv = strength / Math.sqrt(dsq);
        this.d[i].vx += dx * inv;
        this.d[i].vy += dy * inv;
        this.d[i].vz += dz * inv;
      }
    }
    releaseAll() {
      const sz = this.arrSize;
      const al = this.arrAlpha;
      const free = this.free;
      let top = this.freeTop;
      for (let i = 0; i < this.cap; i++) {
        if (this.d[i].life > 0) {
          this.d[i].life = 0;
          sz[i] = 0;
          al[i] = 0;
          if (top < this.cap) free[top++] = i;
        }
      }
      this.freeTop = top;
      this.live = 0;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
    dispose() {
      this.geo.dispose();
      this.ctx.group.remove(this.points);
    }
  };
  var ShockPool = class extends Pool {
    constructor(ctx2) {
      const make = (u, o) => {
        readVec(o.pos, u.pos);
        u.color.set(def(o.color, C.WHITE));
        u.color2.set(def(o.color2, C.CYAN));
        u.maxR = Math.max(0.02, def(o.maxRadius, 6));
        u.startR = clamp3(def(o.radius, 0.05), 1e-3, u.maxR);
        u.life = def(o.life, 0.55);
        u.thick = clamp3(def(o.thickness, 0.35), 0.03, 0.95);
        u.tilt = def(o.tilt, 0);
        u.bright = def(o.bright, 1);
        u.soft = def(o.soft, 0.42);
        u.segments = clamp3(def(o.segments, 64) | 0, 12, 128);
        u.ringCount = clamp3(def(o.ringCount, 1) | 0, 1, 4);
        u.innerFade = def(o.innerFade, 1);
        // 方向性冲击波：arc>0 时只画一个扇区，arcDir 是扇区中心（局部极角）
        u.arc = clamp3(def(o.arc, 0), 0, Math.PI, 0);
        u.arcDir = def(o.arcDir, 0);
        u.burn = def(o.burn, 0);
        if (o.normal) readVec(o.normal, _v12).normalize();
        else _v12.set(0, 1, 0);
        if (u.tilt > 0) {
          _v22.set(rnd2(), rnd2(), rnd2());
          if (_v22.lengthSq() < 1e-6) _v22.set(1, 0, 0);
          _v22.normalize();
          _q12.setFromAxisAngle(_v22, u.tilt * rnd2());
          _v12.applyQuaternion(_q12).normalize();
        }
        u.normal.copy(_v12);
        u.alive = true;
      };
      /* 冲击波的生命曲线：
       *   0 → 0.18  迅速点亮（前缘"崩"出来）
       *   0.18 → 1  缓慢淡出，同时半径按 easeOut 扩张
       * 旧版因为没人写材质 uniform，uLife 恒为 1，于是所有冲击波
       * 都是满强度白青色环一路扫过屏幕 —— 那正是"青白色冲爆"的主犯之一。
       */
      const upd = (u, dt) => {
        if (u.age >= u.life) {
          for (let k = 0; k < u.mesh.length; k++) u.mesh[k].visible = false;
          this.setAlive(u, false);
          return;
        }
        const mat = u.mat;
        const un = mat.uniforms;
        un.uTime.value = this.ctx.time;
        un.uColor.value.copy(u.color);
        un.uColor2.value.copy(u.color2);
        const tl = clamp3(u.age / Math.max(1e-3, u.life), 0, 1);
        // 前缘短促、尾部拉长的亮度包络；同时按环半径衰减（越远越弱）
        const grow = easeOut(tl);
        const env = tl < 0.16 ? tl / 0.16 : Math.pow(1 - (tl - 0.16) / 0.84, 1.6);
        /* 波前随半径变细、变淡。
         * 关键：uSoft 是"环带占半径的比例"，半径 16m 的冲击波如果还保持 0.42 的
         * soft，环带本身就有 7m 厚 —— 在屏幕上就是一张盖住半边的实心大饼
         * （用户报的"青色半透明椭球胀到半屏"就是这个）。
         * 现在越往外扩，波前越薄（0.42 → 0.16），读起来才是"一道推出去的气浪"。
         */
        un.uSoft.value = clamp3(u.soft * (1 - 0.62 * grow), 0.12, 0.6);
        un.uInner.value = u.innerFade;
        un.uBurn.value = u.burn;
        un.uArc.value = u.arc;
        un.uArcDir.value = u.arcDir;
        un.uBright.value = u.bright * (1 - 0.3 * grow);
        un.uLife.value = clamp3(env, 0, 1) * (1 - 0.55 * grow);
        for (let k = 0; k < u.mesh.length; k++) {
          const m = u.mesh[k];
          if (k >= u.ringCount) {
            m.visible = false;
            continue;
          }
          const dl = 0.05 * k;
          const kk = clamp3((u.age - dl) / Math.max(1e-3, u.life - dl), 0, 1);
          const r = u.startR + (u.maxR - u.startR) * easeOut(kk) * (1 + k * 0.2);
          m.visible = kk > 0 && kk < 1;
          m.scale.set(r, r, r);
        }
      };
      super(LIMIT, LIMIT, make, upd);
      this.ctx = ctx2;
      this.geoCache = /* @__PURE__ */ new Map();
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        u.pos = new Vector3();
        u.normal = new Vector3(0, 1, 0);
        u.color = new Color();
        u.color2 = new Color();
        u.mesh = [];
        u.geoRef = null;
        // 每实例一份材质：多个冲击波同时存在时颜色/寿命/扇区互不串台
        u.mat = ctx2.mats.shock.clone();
        for (let k = 0; k < 4; k++) {
          const m = new Mesh(this.geo(64, 0.35), u.mat);
          m.visible = false;
          m.frustumCulled = false;
          m.renderOrder = 6;
          ctx2.group.add(m);
          u.mesh.push(m);
        }
      }
    }
    geo(segments, thickness) {
      const key = segments + ":" + thickness.toFixed(3);
      let g = this.geoCache.get(key);
      if (!g) {
        g = makeRingGeo(segments, thickness, 3);
        this.geoCache.set(key, g);
      }
      return g;
    }
    spawn(o) {
      const u = super.spawn(o);
      if (u.index < 0) return u;
      const g = this.geo(u.segments, u.thick);
      if (u.geoRef !== g) {
        u.geoRef = g;
        for (let k = 0; k < 4; k++) u.mesh[k].geometry = g;
      }
      for (let k = 0; k < 4; k++) {
        const m = u.mesh[k];
        m.quaternion.setFromUnitVectors(_up, u.normal);
        m.position.copy(u.pos);
        m.visible = k === 0;
        m.scale.set(u.startR, u.startR, u.startR);
      }
      return u;
    }
    dispose() {
      for (const g of this.geoCache.values()) g.dispose();
      this.geoCache.clear();
      for (let i = 0; i < this.cap; i++) {
        this.users[i].mat.dispose();
        for (const m of this.users[i].mesh) this.ctx.group.remove(m);
      }
    }
  };
  var BeamPool = class extends Pool {
    constructor(ctx2) {
      const make = (u, o) => {
        readVec(o.from, u.from);
        readVec(o.to, u.to);
        u.color.set(def(o.color, C.WHITE));
        u.color2.set(def(o.color2, C.VIOLET));
        u.coreRatio = clamp3(def(o.coreWidth, 0.18) / Math.max(0.02, def(o.glowWidth, 0.7)), 0.05, 1);
        u.glowW = Math.max(0.02, def(o.glowWidth, 0.7));
        u.life = def(o.life, 0.6);
        u.grow = clamp3(def(o.grow, 4), 0.15, 60);
        u.helix = clamp3(def(o.helix, 0), 0, 4);
        u.segments = clamp3(def(o.segments, 24) | 0, 4, 64);
        u.seed = rnd() * 10;
        u.length = 0;
        u.alive = true;
      };
      const upd = (u, dt) => {
        if (u.age >= u.life) {
          u.mesh.visible = false;
          this.setAlive(u, false);
          return;
        }
        alignBeam(u);
      };
      super(LIMIT, LIMIT, make, upd);
      this.ctx = ctx2;
      this.geoCache = /* @__PURE__ */ new Map();
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        u.from = new Vector3();
        u.to = new Vector3();
        u.dir = new Vector3();
        u.len = 1;
        u.color = new Color();
        u.color2 = new Color();
        // 每实例一份材质：多条光束同时存在时颜色/生长互不串台
        u.mat = ctx2.mats.beam.clone();
        u.mesh = new Mesh(this.geo(8), u.mat);
        u.mesh.visible = false;
        u.mesh.frustumCulled = false;
        u.mesh.renderOrder = 4;
        ctx2.group.add(u.mesh);
        u.geoRef = null;
      }
    }
    geo(segments) {
      let g = this.geoCache.get(segments);
      if (!g) {
        g = makeBeamGeo(segments);
        this.geoCache.set(segments, g);
      }
      return g;
    }
    spawn(o) {
      const u = super.spawn(o);
      if (u.index < 0) return u;
      const g = this.geo(u.segments);
      if (u.geoRef !== g) {
        u.geoRef = g;
        u.mesh.geometry = g;
      }
      u.mesh.visible = true;
      alignBeam(u);
      return u;
    }
    update(dt) {
      super.update(dt);
      const ctx2 = this.ctx;
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        const k = clamp3(u.age / u.life, 0, 1);
        const mat = u.mat;
        mat.uniforms.uTime.value = ctx2.time;
        // 末端 20% 淡出，中段保持实心 —— 光束的"方向"靠前端锥体读
        mat.uniforms.uLife.value = k < 0.8 ? 1 : Math.max(0, 1 - (k - 0.8) / 0.2);
        mat.uniforms.uGrow.value = clamp3(u.grow * u.age, 0, 1);
        mat.uniforms.uHelix.value = u.helix;
        mat.uniforms.uSeed.value = u.seed;
        mat.uniforms.uCore.value = 0.25 + 0.75 * (1 - u.coreRatio);
        mat.uniforms.uGlow.value = 1;
        mat.uniforms.uColor.value.copy(u.color);
        mat.uniforms.uColor2.value.copy(u.color2);
      }
    }
    dispose() {
      for (const g of this.geoCache.values()) g.dispose();
      this.geoCache.clear();
      for (let i = 0; i < this.cap; i++) {
        this.users[i].mat.dispose();
        this.ctx.group.remove(this.users[i].mesh);
      }
    }
  };
  function alignBeam(u) {
    u.dir.subVectors(u.to, u.from);
    u.len = u.dir.length();
    if (u.len < 1e-4) u.len = 1e-4;
    const g = clamp3(u.grow * u.age, 0, 1);
    u.length = easeOut(g);
    _v32.copy(u.dir).multiplyScalar(1 - u.length);
    _v4.copy(u.from).add(_v32);
    u.mesh.position.copy(_v4);
    u.mesh.quaternion.setFromUnitVectors(_up, _v12.copy(u.dir).normalize());
    u.mesh.scale.set(u.glowW, Math.max(1e-3, u.len * u.length), u.glowW);
  }
  var SlashPool = class extends Pool {
    constructor(ctx2) {
      const make = (u, o) => {
        readVec(o.from, u.from);
        readVec(o.to, u.to);
        u.color.set(def(o.color, C.WHITE));
        u.color2.set(def(o.color2, C.CYAN));
        u.width = Math.max(5e-3, def(o.width, 0.35));
        u.life = def(o.life, 0.3);
        u.bend = clamp3(def(o.bend, 0.55), 0, 2);
        u.spin = def(o.spin, 0);
        u.sweepT = clamp3(def(o.sweepTime, 0.42), 0.05, 1);
        u.seed = rnd() * 20;
        u.alive = true;
      };
      const upd = (u, dt) => {
        if (u.age >= u.life) {
          for (const m of u.mesh) m.visible = false;
          this.setAlive(u, false);
          return;
        }
        for (let i = 0; i < u.n; i++) {
          const m = u.mesh[i];
          const off = u.delay[i];
          if (u.age < off) {
            m.visible = false;
            continue;
          }
          m.visible = true;
          const kk = clamp3((u.age - off) / Math.max(1e-3, u.life - off), 0, 1);
          m.position.copy(u.origin[i]).addScaledVector(u.nrm, u.push * easeOut(kk));
          m.scale.set(u.scale * (1 + 0.1 * easeOut(kk)), u.scaleY[i], 1);
        }
      };
      super(LIMIT, LIMIT, make, upd);
      this.ctx = ctx2;
      this.geo = makeCrescentGeo(40);
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        u.from = new Vector3();
        u.to = new Vector3();
        u.nrm = new Vector3();
        u.color = new Color();
        u.color2 = new Color();
        u.n = 1;
        u.scale = 1;
        u.push = 0;
        u.origin = [];
        u.delay = [];
        u.scaleY = [];
        u.mesh = [];
        // 每实例一份材质：多段刀光同时存在时颜色/扫掠进度互不串台
        u.mat = ctx2.mats.slash.clone();
        for (let k = 0; k < 6; k++) {
          const m = new Mesh(this.geo, u.mat);
          m.visible = false;
          m.frustumCulled = false;
          m.renderOrder = 7;
          ctx2.group.add(m);
          u.mesh.push(m);
          u.origin.push(new Vector3());
          u.delay.push(0);
          u.scaleY.push(1);
        }
      }
    }
    spawn(o) {
      const u = super.spawn(o);
      if (u.index < 0) return u;
      const n = clamp3(def(o.count, 1) | 0, 1, 6);
      u.n = n;
      const len = u.from.distanceTo(u.to);
      u.scale = Math.max(0.05, len);
      u.push = u.width * 0.5;
      _v12.subVectors(u.to, u.from);
      if (_v12.lengthSq() < 1e-10) _v12.set(1, 0, 0);
      _v12.normalize();
      if (o.planeNormal) {
        readVec(o.planeNormal, _v32).normalize();
      } else {
        _v32.set(0, 1, 0);
        _v32.addScaledVector(_v12, -_v12.dot(_v32));
        if (_v32.lengthSq() < 1e-6) _v32.set(0, 0, 1);
        _v32.normalize();
      }
      u.nrm.copy(_v32);
      _v22.crossVectors(_v32, _v12);
      if (_v22.lengthSq() < 1e-10) _v22.set(0, 1, 0);
      _v22.normalize();
      _m12.makeBasis(_v12, _v22, _v32);
      _q12.setFromRotationMatrix(_m12);
      for (let k = 0; k < 6; k++) {
        const m = u.mesh[k];
        if (k >= n) {
          m.visible = false;
          continue;
        }
        const ph = n > 1 ? k / n * TAU2 + rnd() * 1.2 : 0;
        const off = n > 1 ? rnd() * 0.09 : 0;
        const jit = n > 1 ? u.width * 0.9 : 0;
        u.origin[k].copy(u.from);
        u.origin[k].x += rnd2() * jit * 0.5;
        u.origin[k].y += rnd2() * jit * 0.5;
        u.origin[k].z += rnd2() * jit * 0.5;
        u.delay[k] = off;
        u.scaleY[k] = (0.25 + u.bend) * rr(0.85, 1.15);
        m.position.copy(u.origin[k]);
        m.quaternion.copy(_q12);
        if (ph !== 0) m.rotateX(ph);
        m.scale.set(u.scale, u.scaleY[k], 1);
        m.visible = true;
      }
      return u;
    }
    update(dt) {
      super.update(dt);
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        const k = clamp3(u.age / u.life, 0, 1);
        const mat = u.mat;
        mat.uniforms.uTime.value = this.ctx.time;
        mat.uniforms.uSweep.value = clamp3(k / u.sweepT, 0, 1.2);
        mat.uniforms.uLife.value = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
        mat.uniforms.uColor.value.copy(u.color);
        mat.uniforms.uColor2.value.copy(u.color2);
        mat.uniforms.uSeed.value = u.seed;
      }
    }
    dispose() {
      this.geo.dispose();
      for (let i = 0; i < this.cap; i++) {
        this.users[i].mat.dispose();
        for (const m of this.users[i].mesh) this.ctx.group.remove(m);
      }
    }
  };
  /* ============================================================================
   * SpherePool —— 咒力球（弹体 / 蓄力球 / 命中爆散球）
   *
   * 旧版三个致命问题，这里全部修掉：
   *   1. 所有球共用一份材质，update() 只把「最大的那个」的参数写进去
   *      ⇒ 多球同屏时颜色与寿命互相串台（红球显白、白球乱闪）。
   *      现在每个实例一份材质（同 shader，不增加 program 数量），各写各的。
   *   2. 每个球只有一层加法外壳 ⇒ 中心也是亮的，叠几层就是一团纯白。
   *      现在内层是一个实心暗核（形成剪影），外壳只画边缘光 + 迎风面亮斑。
   *   3. combat.js 每帧都会补一颗 life=0.1 的球，位置几乎不动
   *      ⇒ 同位置叠 6~10 层，必定爆白。
   *      现在 pool.spawn() 自带去重：同一「家族」（同色同半径）且距离很近的活跃球
   *      直接复用并刷新寿命/位置，等于「一颗球跟着弹体飞」，层数恒为 1。
   *      这样不用改 combat.js 的调用方式，也不会改变它的命中逻辑。
   * ========================================================================== */
  var SpherePool = class extends Pool {
    constructor(ctx2) {
      const make = (u, o) => {
        u.follow = o.follow && o.follow.isObject3D ? o.follow : null;
        if (u.follow) {
          u.follow.updateWorldMatrix(true, false);
          u.world.setFromMatrixPosition(u.follow.matrixWorld);
        } else {
          readVec(o.pos, u.world);
        }
        u.color.set(def(o.color, C.AZURE));
        u.core.set(def(o.coreColor, C.CYAN));
        u.radius = Math.max(0.02, def(o.radius, 1.2));
        u.life = def(o.life, 1.2);
        u.charge0 = clamp3(def(o.charge, 1), 0, 1);
        u.charge1 = u.charge0;
        u.currentCharge = u.charge0;
        u.distort = clamp3(def(o.distort, 0.2), 0, 2);
        u.pulse = def(o.pulse, 0.1);
        // 迎风面的高光取"该术式自己的核心色"，而不是一律白 —— 
        // 否则红球顶着白色高光帽，看起来就是个白色火球，丢掉了颜色识别度
        if (o.hot !== void 0 || o.coreColor !== void 0) u.hot.set(def(o.hot, def(o.coreColor, C.WHITE)));
        u.alive = true;
        // 家族 key：同色 + 同量级半径 = 同一颗弹体，可以合并
        u.key = ((def(o.color, C.AZURE) | 0) >>> 0) + ":" + Math.round(u.radius * 4);
        u.merged = 0;
        u.fresh = true;
      };
      const upd = (u, dt) => {
        if (u.follow) {
          u.follow.updateWorldMatrix(true, false);
          u.world.setFromMatrixPosition(u.follow.matrixWorld);
        } else if (u.followPos) {
          u.world.copy(u.followPos);
        }
        if (u.age >= u.life) {
          u.shell.visible = false;
          u.coreMesh.visible = false;
          this.setAlive(u, false);
          return;
        }
        const k = clamp3(u.age / u.life, 0, 1);
        u.currentCharge = u.charge0 + (u.charge1 - u.charge0) * easeOut(Math.min(1, k * 1.8));
        const pop = 1 + 0.09 * Math.sin(u.age * 16 + u.seed);
        const s = u.radius * (0.55 + 0.75 * u.currentCharge) * pop;
        /* --- 速度 / 方向：用世界位置差算出运动矢量 --- */
        _v32.copy(u.world);
        if (u.fresh) {
          u.prev.copy(_v32);
          u.dir.set(0, 0, 0);
          u.speed = 0;
          u.fresh = false;
        } else {
          _v5.subVectors(_v32, u.prev);
          const d = _v5.length();
          const inv = d > 1e-6 ? 1 / d : 0;
          u.speed += (d / Math.max(dt, 1e-4) - u.speed) * Math.min(1, dt * 9);
          // 方向做低通，避免抖动
          u.dir.lerp(_v5.multiplyScalar(inv), Math.min(1, dt * 9));
          if (u.dir.lengthSq() > 1e-8) u.dir.normalize();
          else u.dir.set(0, 1, 0);
          u.prev.copy(_v32);
        }
        const sp = clamp3(u.speed / 22, 0, 1);
        // 沿运动方向拉长（彗星体），静止时保持球体
        const stretch = 1 + sp * 0.85;
        const flat = 1 - sp * 0.16;
        u.coreMesh.position.copy(u.world);
        u.coreMesh.scale.set(s * flat * 0.94, s * stretch * 0.94, s * 0.94);
        u.shell.position.copy(u.world);
        u.shell.quaternion.setFromUnitVectors(_up, u.dir);
        u.coreMesh.quaternion.copy(u.shell.quaternion);
        u.shell.scale.set(s * flat, s * stretch, s * flat);
        // 每实例参数（不再串台）
        const un = u.mat.uniforms;
        un.uTime.value = this.ctx.time;
        un.uLife.value = (1 - k * k) * (u.merged > 0 ? 1 : 0.92);
        un.uCharge.value = u.currentCharge;
        un.uDistort.value = u.distort;
        un.uPulse.value = u.pulse * Math.sin(this.ctx.time * 9 + u.seed);
        un.uColor.value.copy(u.color);
        un.uCore.value.copy(u.core);
        un.uHot.value.copy(u.hot);
        un.uStreak.value = Math.max(u.hotBoost * (1 - k * 0.35), sp * 0.85);
        un.uStreakDir.value.copy(u.streakDir);
        // 暗核颜色 = 本体色的极暗版本：球心是一块"深色实体"，不是发光点
        u.coreCol.copy(u.core).multiplyScalar(0.085);
        u.coreMat.color.copy(u.coreCol);
        u.shell.visible = true;
        u.coreMesh.visible = true;
        // 弹体尾迹：真的在动了才拖尾，静止的蓄力球不留痕
        if (!u.trail && sp > 0.18 && this.ctx.trails) {
          u.trail = this.ctx.trails.spawn({ width: u.radius * 0.7, life: 0.3, fade: 1.6 });
        }
        if (u.trail && u.trail.alive) u.trail.update(u.world);
        if (u.merged > 0) u.merged--;
      };
      super(LIMIT, LIMIT, make, upd);
      this.ctx = ctx2;
      this.geo = new IcosahedronGeometry(1, 4);
      this.coreGeo = new IcosahedronGeometry(0.86, 3);
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        u.world = new Vector3();
        u.prev = new Vector3();
        u.dir = new Vector3(0, 1, 0);
        u.streakDir = new Vector3(0, 1, 0);
        u.speed = 0;
        u.merged = 0;
        u.hotBoost = 0;
        u.followPos = null;
        u.color = new Color();
        u.core = new Color();
        u.hot = new Color(C.WHITE);
        u.coreCol = new Color();
        u.seed = rnd() * 10;
        // 每实例一份外壳材质（同 program，成本只在 uniform 上传）
        u.mat = ctx2.mats.sphere.clone();
        u.shell = new Mesh(this.geo, u.mat);
        u.shell.visible = false;
        u.shell.renderOrder = 5;
        // 暗核：把球体中心压成剪影，避免"一团白光"
        u.coreMat = new MeshBasicMaterial({ color: 0 });
        u.coreMat.toneMapped = true;
        u.coreMesh = new Mesh(this.coreGeo, u.coreMat);
        u.coreMesh.visible = false;
        u.coreMesh.renderOrder = 4;
        u.trail = null;
        ctx2.group.add(u.shell);
        ctx2.group.add(u.coreMesh);
      }
    }
    /**
     * 生成/复用一颗咒力球。
     * 去重规则：同 key（同色同量级半径）、距离 < radius*1.9 且还活着的球，
     * 直接把新位置写进去并刷新寿命 —— 等价于"这颗球被弹体带着飞"。
     */
    spawn(o) {
      o = o || {};
      const obj = {
        pos: o.pos,
        follow: o.follow,
        color: o.color,
        coreColor: o.coreColor,
        radius: o.radius,
        life: o.life,
        charge: o.charge,
        distort: o.distort,
        pulse: o.pulse,
        hot: o.hot
      };
      _v5.set(0, 0, 0);
      if (obj.follow && obj.follow.isObject3D) {
        obj.follow.updateWorldMatrix(true, false);
        _v5.setFromMatrixPosition(obj.follow.matrixWorld);
      } else {
        readVec(o.pos, _v5);
      }
      const key = ((def(obj.color, C.AZURE) | 0) >>> 0) + ":" + Math.round(Math.max(0.02, def(obj.radius, 1.2)) * 4);
      const mergeR = Math.max(0.9, Math.max(0.02, def(obj.radius, 1.2)) * 2.1);
      const mergeR2 = mergeR * mergeR;
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive || u.key !== key) continue;
        if (u.world.distanceToSquared(_v5) > mergeR2) continue;
        u.world.copy(_v5);
        u.fresh = false;
        u.merged = 3;
        u.age = Math.min(u.age, u.life * 0.25);
        u.life = Math.max(u.life, def(obj.life, u.life));
        if (obj.charge !== void 0) {
          u.charge0 = u.currentCharge;
          u.charge1 = clamp3(obj.charge, 0, 1);
        }
        if (obj.pulse !== void 0) u.pulse = obj.pulse;
        if (obj.hot !== void 0 || obj.coreColor !== void 0) {
          u.hot.set(def(obj.hot, def(obj.coreColor, C.WHITE)));
          u.hotBoost = 1;
        }
        if (obj.coreColor !== void 0) u.core.set(obj.coreColor);
        return u;
      }
      const u = super.spawn(obj);
      if (u.index < 0) return u;
      u.streakDir.copy(u.dir);
      u.hotBoost = obj.hot !== void 0 ? 1 : 0;
      if (u.trail && u.trail.alive) u.trail.update(u.world);
      return u;
    }
    dispose() {
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        u.mat.dispose();
        u.coreMat.dispose();
        this.ctx.group.remove(u.shell);
        this.ctx.group.remove(u.coreMesh);
      }
      this.geo.dispose();
      this.coreGeo.dispose();
    }
  };
  var AuraPool = class {
    constructor(ctx2) {
      this.ctx = ctx2;
      this.cap = LIMIT;
      this.users = [];
      this.active = [];
      const shellGeo = new IcosahedronGeometry(1, 3);
      const wireGeo = new IcosahedronGeometry(1, 2);
      this.shellGeo = shellGeo;
      this.wireGeo = wireGeo;
      ctx2.shardGeo = new ConeGeometry(0.22, 1, 4, 1, false);
      for (let i = 0; i < this.cap; i++) {
        const u = {
          zone: this,
          index: i,
          alive: false,
          age: 0,
          life: 1,
          kind: 0,
          stopped: false,
          hold: false,
          color: new Color(),
          color2: new Color(),
          intensity: 1,
          scale: 1,
          follow: null,
          pos: new Vector3(),
          group: new Group(),
          shards: []
        };
        // 每实例一份材质：两个角色同时挂不同领域/咒力光时不会互相串色
        u.mat = ctx2.mats.aura.clone();
        u.matW = ctx2.mats.auraWire.clone();
        const shell = new Mesh(shellGeo, u.mat);
        shell.frustumCulled = false;
        shell.renderOrder = 3;
        u.shell = shell;
        u.group.add(shell);
        const wire = new Mesh(wireGeo, u.matW);
        wire.frustumCulled = false;
        wire.renderOrder = 3;
        u.wire = wire;
        u.group.add(wire);
        for (let k = 0; k < 12; k++) {
          const sh = new Mesh(ctx2.shardGeo, u.mat);
          sh.visible = false;
          sh.frustumCulled = false;
          sh.renderOrder = 3;
          u.group.add(sh);
          u.shards.push(sh);
        }
        u.group.visible = false;
        ctx2.group.add(u.group);
        this.users.push(u);
      }
    }
    alloc() {
      for (let i = 0; i < this.cap; i++) if (!this.users[i].alive) return this.users[i];
      return this.active.length ? this.active[0] : null;
    }
    /**
     * @param {object} o FXAuraOpts
     * @returns {{stop:()=>void, alive:boolean}}
     */
    spawn(o) {
      const u = this.alloc();
      if (!u) return { stop() {
      }, alive: false };
      if (u.alive) this.setAlive(u, false);
      const isObj = o.target && o.target.isObject3D;
      u.follow = isObj ? o.target : null;
      if (isObj) {
        o.target.updateWorldMatrix(true, false);
        u.pos.setFromMatrixPosition(o.target.matrixWorld);
      } else {
        readVec(o.target, u.pos);
      }
      const kinds = { cursed: 0, infinity: 1, shrine: 2, flame: 3 };
      u.kind = def(kinds[def(o.kind, "cursed")], 0);
      u.color.set(def(o.color, u.kind === 3 ? C.NEON_AMBER : u.kind === 0 ? C.CRIMSON : C.CYAN));
      u.color2.set(
        u.kind === 3 ? C.SCARLET : u.kind === 2 ? C.WHITE : u.kind === 1 ? C.AZURE : C.BLOOD
      );
      u.scale = Math.max(0.05, def(o.scale, 1.1));
      u.intensity = clamp3(def(o.intensity, 1), 0, 4);
      u.life = def(o.life, 0);
      u.hold = u.life > 0;
      u.age = 0;
      u.stopped = false;
      u.group.visible = true;
      u.shell.visible = u.kind !== 1;
      u.wire.visible = u.kind === 1 || u.kind === 2;
      for (const s of u.shards) s.visible = u.kind === 2;
      for (let k = 0; k < u.shards.length; k++) {
        const s = u.shards[k];
        s.userData.a = k / u.shards.length * TAU2 + rnd() * 0.5;
        s.userData.b = rr(-1.1, 1.1);
        s.userData.r = rr(1.05, 1.5);
        s.userData.sp = rr(0.6, 1.9) * (rnd() < 0.5 ? -1 : 1);
        s.scale.setScalar(rr(0.16, 0.4));
      }
      u.alive = true;
      if (this.active.indexOf(u) < 0) {
        this.active.push(u);
        while (this.active.length > LIMIT) {
          this.setAlive(this.active[0], false);
          this.active.shift();
        }
      }
      const self2 = this;
      return {
        get alive() {
          return u.alive;
        },
        stop() {
          self2.setAlive(u, false);
        }
      };
    }
    setAlive(u, on) {
      if (u.alive === on) return;
      u.alive = on;
      if (!on) {
        u.group.visible = false;
        u.follow = null;
      }
    }
    update(dt) {
      const ctx2 = this.ctx;
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        u.age += dt;
        // 逐实例写 uniform（旧版只写「最后一个」，多个光环同屏必定串味）
        const mat = u.mat;
        const matW = u.matW;
        mat.uniforms.uTime.value = ctx2.time;
        matW.uniforms.uTime.value = ctx2.time;
        mat.uniforms.uKind.value = u.kind;
        mat.uniforms.uColor.value.copy(u.color);
        mat.uniforms.uColor2.value.copy(u.color2);
        mat.uniforms.uLife.value = 1;
        mat.uniforms.uIntensity.value = u.intensity;
        matW.uniforms.uColor.value.copy(u.color);
        matW.uniforms.uColor2.value.copy(u.color2);
        matW.uniforms.uIntensity.value = u.intensity * 0.85;
        matW.uniforms.uLife.value = 1;
        if (u.hold && u.age >= u.life) this.setAlive(u, false);
        if (u.follow) {
          u.follow.updateWorldMatrix(true, false);
          u.pos.setFromMatrixPosition(u.follow.matrixWorld);
          if (u.kind === 1 || u.kind === 3) u.pos.y += 1;
        }
        u.group.position.copy(u.pos);
        u.group.scale.setScalar(u.scale);
        const br = 1 + 0.035 * Math.sin(ctx2.time * 2.6 + i);
        u.shell.scale.setScalar(br);
        u.wire.scale.setScalar(br * 1.06);
        for (const s of u.shards) {
          if (!s.visible) continue;
          const d = s.userData;
          const a = d.a + ctx2.time * d.sp;
          s.position.set(Math.cos(a) * d.r, d.b + Math.sin(a * 1.7) * 0.22, Math.sin(a) * d.r);
          s.rotation.set(a * 1.3, a * 0.8, a * 1.7);
        }
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        if (!this.active[i].alive) {
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
        }
      }
    }
    releaseAll() {
      for (const u of this.active) this.setAlive(u, false);
      this.active.length = 0;
    }
    dispose() {
      for (const u of this.users) {
        u.mat.dispose();
        u.matW.dispose();
        this.ctx.group.remove(u.group);
      }
      this.shellGeo.dispose();
      this.wireGeo.dispose();
    }
  };
  var GroundRingPool = class extends Pool {
    constructor(ctx2) {
      const make = (u, o) => {
        readVec(o.pos, u.pos);
        if (o.followGround !== false) u.pos.y = 0.02;
        u.color.set(def(o.color, C.NEON_AMBER));
        u.color2.set(def(o.color2, C.SCARLET));
        u.maxR = Math.max(0.1, def(o.maxRadius, 9));
        u.life = def(o.life, 0.9);
        u.thick = clamp3(def(o.thickness, 0.5), 0.05, 0.95);
        u.segments = clamp3(def(o.segments, 64) | 0, 12, 128);
        u.alive = true;
      };
      const upd = (u, dt) => {
        if (u.age >= u.life) {
          u.mesh.visible = false;
          this.setAlive(u, false);
          return;
        }
        const k = clamp3(u.age / u.life, 0, 1);
        const r = u.maxR * easeOut(k);
        u.mesh.scale.set(r, r, r);
        u.mesh.visible = true;
      };
      super(LIMIT, LIMIT, make, upd);
      this.ctx = ctx2;
      this.geoCache = /* @__PURE__ */ new Map();
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        u.pos = new Vector3();
        u.color = new Color();
        u.color2 = new Color();
        u.geoRef = null;
        // 每实例一份材质：多个地面环（扬尘/灼痕/领域边）同时存在时互不串台
        u.mat = ctx2.mats.ground.clone();
        u.mesh = new Mesh(this.geo(64, 0.5), u.mat);
        u.mesh.rotation.x = -Math.PI / 2;
        u.mesh.visible = false;
        u.mesh.frustumCulled = false;
        u.mesh.renderOrder = 2;
        ctx2.group.add(u.mesh);
      }
    }
    geo(segments, thick) {
      const key = segments + ":" + thick.toFixed(2);
      let g = this.geoCache.get(key);
      if (!g) {
        g = makeRingGeo(segments, thick, 4);
        this.geoCache.set(key, g);
      }
      return g;
    }
    spawn(o) {
      const u = super.spawn(o);
      if (u.index < 0) return u;
      const g = this.geo(u.segments, u.thick);
      if (u.geoRef !== g) {
        u.geoRef = g;
        u.mesh.geometry = g;
      }
      u.mesh.position.copy(u.pos);
      const r0 = u.maxR * 0.05;
      u.mesh.scale.set(r0, r0, r0);
      u.mesh.visible = true;
      return u;
    }
    update(dt) {
      super.update(dt);
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        const k = clamp3(u.age / u.life, 0, 1);
        const mat = u.mat;
        mat.uniforms.uTime.value = this.ctx.time;
        mat.uniforms.uLife.value = 1 - k * k;
        mat.uniforms.uColor.value.copy(u.color);
        mat.uniforms.uColor2.value.copy(u.color2);
        mat.uniforms.uSoft.value = def(u.soft, 0.5);
        mat.uniforms.uBurn.value = 1;
        mat.uniforms.uBright.value = def(u.bright, 1);
        mat.uniforms.uInner.value = 1;
      }
    }
    dispose() {
      for (const g of this.geoCache.values()) g.dispose();
      this.geoCache.clear();
      for (let i = 0; i < this.cap; i++) {
        this.users[i].mat.dispose();
        this.ctx.group.remove(this.users[i].mesh);
      }
    }
  };
  var DamagePool = class {
    constructor(ctx2, tex) {
      this.ctx = ctx2;
      this.tex = tex;
      this.cap = NUMBER_LIMIT;
      this.users = [];
      this.active = [];
      this.matCache = /* @__PURE__ */ new Map();
      for (let i = 0; i < this.cap; i++) {
        const mat = new SpriteMaterial({
          transparent: true,
          depthWrite: false,
          depthTest: true,
          blending: AdditiveBlending
        });
        const sp = new Sprite(mat);
        sp.visible = false;
        sp.renderOrder = 9;
        ctx2.group.add(sp);
        this.users.push({
          zone: this,
          index: i,
          alive: false,
          age: 0,
          life: 1,
          sprite: sp,
          mat,
          key: "",
          pos: new Vector3(),
          rise: 1.5,
          scale: 1,
          aspect: 3,
          wob: 0
        });
      }
    }
    /** 每个不同的数字/暴击组合只建一次材质 */
    matFor(label, crit) {
      const key = (crit ? "C|" : "N|") + label;
      let m = this.matCache.get(key);
      if (!m) {
        m = new SpriteMaterial({
          map: this.tex.damageTex(label, crit),
          transparent: true,
          depthWrite: false,
          depthTest: true,
          blending: AdditiveBlending
        });
        this.matCache.set(key, m);
      }
      return { m, key };
    }
    alloc() {
      for (let i = 0; i < this.cap; i++) if (!this.users[i].alive) return this.users[i];
      return this.active.length ? this.active[0] : null;
    }
    spawn(o) {
      const u = this.alloc();
      if (!u) return;
      const crit = !!o.crit;
      const amount = def(o.amount, 0);
      const prefix = def(o.prefix, "");
      const label = prefix + (amount < 0 ? "-" : "") + Math.abs(Math.round(amount));
      const found = this.matFor(label, crit);
      if (u.key !== found.key) {
        u.sprite.material = found.m;
        u.key = found.key;
        const t = found.m.map;
        u.aspect = t && t.userData && t.userData.aspect || 3;
      }
      readVec(o.pos, u.pos);
      u.rise = def(o.rise, crit ? 2.2 : 1.5);
      u.scale = crit ? 1.5 : 1;
      u.life = def(o.life, crit ? 1.25 : 0.95);
      u.wob = rnd() * TAU2;
      u.age = 0;
      u.sprite.visible = true;
      u.alive = true;
      if (this.active.indexOf(u) < 0) {
        this.active.push(u);
        while (this.active.length > NUMBER_LIMIT) {
          this.setAlive(this.active[0], false);
          this.active.shift();
        }
      }
    }
    setAlive(u, on) {
      if (u.alive === on) return;
      u.alive = on;
      if (!on) u.sprite.visible = false;
    }
    update(dt) {
      const cam2 = this.ctx.camera;
      const fov2 = cam2 && cam2.fov || 55;
      const tanHalf = Math.tan(fov2 * Math.PI / 360);
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        u.age += dt;
        if (u.age >= u.life) {
          this.setAlive(u, false);
          continue;
        }
        const k = clamp3(u.age / u.life, 0, 1);
        const t = u.age;
        u.sprite.position.set(
          u.pos.x + Math.sin(u.wob + t * 2.4) * 0.16,
          u.pos.y + u.rise * easeOutCubic(Math.min(1, k * 1.35)),
          u.pos.z + Math.cos(u.wob + t * 2) * 0.16
        );
        const d = Math.max(1.6, cam2.position.distanceTo(u.sprite.position));
        const h = 2 * tanHalf * d;
        const pop = k < 0.14 ? 0.6 + 2.9 * k : 1 + 0.16 * Math.exp(-(k - 0.14) * 14);
        const sc = h * 0.075 * u.scale * pop;
        u.sprite.scale.set(sc * u.aspect, sc, 1);
        u.mat.opacity = clamp3(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, 0, 1);
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        if (!this.active[i].alive) {
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
        }
      }
    }
    releaseAll() {
      for (const u of this.active) this.setAlive(u, false);
      this.active.length = 0;
    }
    dispose() {
      for (const u of this.users) {
        this.ctx.group.remove(u.sprite);
        u.mat.dispose();
      }
      for (const m of this.matCache.values()) m.dispose();
      this.matCache.clear();
    }
  };
  var CalloutPool = class {
    constructor(ctx2, tex) {
      this.ctx = ctx2;
      this.tex = tex;
      this.cap = CALLOUT_LIMIT;
      this.users = [];
      this.active = [];
      for (let i = 0; i < this.cap; i++) {
        const mat = new SpriteMaterial({
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: NormalBlending
        });
        const sp = new Sprite(mat);
        sp.visible = false;
        sp.renderOrder = 20;
        ctx2.group.add(sp);
        this.users.push({
          zone: this,
          index: i,
          alive: false,
          age: 0,
          life: 1,
          sprite: sp,
          mat,
          pos: new Vector3(),
          aspect: 4,
          size: 0.34,
          rise: 1.1,
          shake: 0,
          anchored: false,
          key: "",
          wob: 0,
          worldY: 0
        });
      }
    }
    alloc() {
      for (let i = 0; i < this.cap; i++) if (!this.users[i].alive) return this.users[i];
      return this.active.length ? this.active[0] : null;
    }
    spawn(o) {
      const u = this.alloc();
      if (!u) return;
      const text = def(o.text, "");
      const sub = def(o.sub, "");
      const col = def(o.color, C.WHITE);
      const col2 = def(o.color2, C.NEON_PINK);
      readVec(o.pos, u.pos);
      const key = text + "|" + sub + "|" + col + "|" + col2;
      if (u.key !== key) {
        const t = this.tex.calloutTex(text, sub, col, col2);
        u.mat.map = t;
        u.mat.needsUpdate = true;
        u.key = key;
        u.aspect = t.userData && t.userData.aspect || 4;
      }
      u.anchored = !!o.screenAnchor;
      u.size = clamp3(def(o.size, 0.34), 0.02, 3);
      u.life = def(o.life, 2);
      u.rise = def(o.rise, 1.1);
      u.shake = def(o.shake, 0.6);
      u.wob = rnd() * TAU2;
      u.age = 0;
      u.worldY = u.pos.y;
      u.sprite.visible = true;
      u.alive = true;
      if (u.shake > 0) {
        this.ctx.screenState.shake = Math.max(this.ctx.screenState.shake, u.shake * 0.4);
        this.ctx.screenState.life = 1;
      }
      if (this.active.indexOf(u) < 0) {
        this.active.push(u);
        while (this.active.length > CALLOUT_LIMIT) {
          this.setAlive(this.active[0], false);
          this.active.shift();
        }
      }
    }
    setAlive(u, on) {
      if (u.alive === on) return;
      u.alive = on;
      if (!on) u.sprite.visible = false;
    }
    update(dt) {
      const cam2 = this.ctx.camera;
      const fov2 = cam2 && cam2.fov || 55;
      const tanHalf = Math.tan(fov2 * Math.PI / 360);
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        u.age += dt;
        if (u.age >= u.life) {
          this.setAlive(u, false);
          continue;
        }
        const k = clamp3(u.age / u.life, 0, 1);
        let d;
        if (u.anchored) {
          d = 14;
          const halfH = tanHalf * d;
          _v12.set(0, halfH * 0.3, -d).applyQuaternion(cam2.quaternion).add(cam2.position);
          u.sprite.position.copy(_v12);
        } else {
          d = Math.max(2, cam2.position.distanceTo(u.pos));
          const slam = k < 0.18 ? -1 * (1 - easeOutCubic(k / 0.18)) : 0;
          const rebound = k >= 0.18 && k < 0.34 ? Math.sin((k - 0.18) / 0.16 * Math.PI) * 0.15 : 0;
          const float = k > 0.4 ? -u.rise * ((k - 0.4) / 0.6) : 0;
          const jitter = k < 0.1 ? (1 - k / 0.1) * u.shake * 0.13 * rnd2() : 0;
          u.sprite.position.set(
            u.pos.x + jitter,
            u.pos.y + d * 0.16 + d * (slam + rebound + float),
            u.pos.z + jitter * 0.6
          );
        }
        const h = 2 * tanHalf * d;
        const pop = k < 0.16 ? 0.35 + 4.2 * k : 1 + 0.1 * Math.exp(-(k - 0.16) * 12);
        const frac = clamp3(u.size * 0.115, 0.03, 0.26);
        const sc = h * frac * pop;
        u.sprite.scale.set(sc * u.aspect, sc, 1);
        u.mat.opacity = clamp3(k < 0.62 ? 1 : 1 - (k - 0.62) / 0.38, 0, 1);
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        if (!this.active[i].alive) {
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
        }
      }
    }
    releaseAll() {
      for (const u of this.active) this.setAlive(u, false);
      this.active.length = 0;
    }
    dispose() {
      for (const u of this.users) {
        this.ctx.group.remove(u.sprite);
        u.mat.dispose();
      }
    }
  };
  var DebrisPool = class {
    constructor(ctx2) {
      this.ctx = ctx2;
      this.cap = LIMIT * 4;
      /* 碎块几何：把立方体的顶点随机推歪，得到"混凝土块"而不是"标准方块"。
       * 原来的正立方体加纯色材质，在画面里就是一堆漂浮的红色贴纸。 */
      this.geo = (() => {
        const g = new BoxGeometry(1, 1, 1, 2, 2, 2);
        const p = g.attributes.position;
        const rnd3 = () => Math.random();
        const seen = new Map();
        for (let i = 0; i < p.count; i++) {
          const key = p.getX(i).toFixed(3) + "," + p.getY(i).toFixed(3) + "," + p.getZ(i).toFixed(3);
          let o = seen.get(key);
          if (!o) {
            o = [Math.hypot(p.getX(i), p.getY(i), p.getZ(i)), (rnd3() - 0.5) * 0.42, (rnd3() - 0.5) * 0.42, (rnd3() - 0.5) * 0.42];
            seen.set(key, o);
          }
          p.setXYZ(i, p.getX(i) + o[1], p.getY(i) + o[2], p.getZ(i) + o[3]);
        }
        g.computeVertexNormals();
        return g;
      })();
      this.mesh = new InstancedMesh(this.geo, ctx2.mats.debris, this.cap);
      this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 1;
      this.colAttr = new InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
      this.colAttr.setUsage(DynamicDrawUsage);
      this.geo.setAttribute("aCol", this.colAttr);
      ctx2.group.add(this.mesh);
      this.users = [];
      for (let i = 0; i < this.cap; i++) {
        this.users.push({
          zone: this,
          index: i,
          alive: false,
          age: 0,
          life: 1,
          pos: new Vector3(),
          vel: new Vector3(),
          ang: new Vector3(),
          rot: new Euler(),
          sx: 0.2,
          sy: 0.2,
          sz: 0.2,
          grav: 26,
          bounced: false,
          base: new Color(),
          hotColor: new Color(),
          heatT: 0.4,
          tint: 1
        });
      }
      this.active = [];
      this._mat = new Matrix4();
      this._quat = new Quaternion();
      this._sc = new Vector3();
      this._mat.makeScale(0, 0, 0);
      for (let i = 0; i < this.cap; i++) {
        this.mesh.setMatrixAt(i, this._mat);
        this.colAttr.setXYZ(i, 0, 0, 0);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
    alloc() {
      for (let i = 0; i < this.cap; i++) if (!this.users[i].alive) return this.users[i];
      return this.active.length ? this.active[0] : null;
    }
    /* 生成碎块。
     * 关键克制点：
     *   - color 只当作"被高温烤红的偏色"，主体永远是混凝土灰（否则就是漂浮的红方块）
     *   - 尺寸/速度/寿命都收窄，碎片不会飞出去半条街再飘着不落
     *   - 记录 heat，前 0.5s 发红发热，之后冷却成普通碎石
     */
    spawn(o) {
      const first = this.alloc();
      if (!first) return;
      const count = clamp3(def(o.count, 10) | 0, 1, 64);
      const power = clamp3(def(o.power, 8), 0, 40);
      const size = clamp3(def(o.size, 0.34), 0.08, 0.85);
      const life = clamp3(def(o.life, 1.2), 0.35, 2.4);
      const up = def(o.up, 1);
      _c1.set(def(o.color, C.CONCRETE2));
      readVec(o.pos, _v12);
      for (let i = 0; i < count; i++) {
        const s = this.users[(first.index + i) % this.cap];
        if (!s || s.alive && s !== first) continue;
        if (s.alive) continue;
        s.pos.copy(_v12);
        s.pos.x += rnd2() * size;
        s.pos.y += rnd() * size;
        s.pos.z += rnd2() * size;
        const a = rnd() * TAU2;
        const el = rr(0.1, 1);
        const sp = power * rr(0.22, 0.62);
        s.vel.set(
          Math.cos(a) * sp * (1 - el * 0.35),
          up * sp * el + rr(0, 1.2),
          Math.sin(a) * sp * (1 - el * 0.35)
        );
        s.ang.set(rnd2() * 12, rnd2() * 12, rnd2() * 12);
        s.rot.set(rnd() * TAU2, rnd() * TAU2, rnd() * TAU2);
        const sz = size * rr(0.55, 1.35);
        s.sx = sz * rr(0.75, 1.3);
        s.sy = sz * rr(0.6, 1.25);
        s.sz = sz * rr(0.75, 1.3);
        s.grav = rr(0.9, 1.5) * 26;
        s.bounced = false;
        s.life = life * rr(0.75, 1.05);
        s.age = 0;
        // 主体是混凝土：请求色最多占 35%，其余交给灰
        s.base.set(C.CONCRETE).lerp(_c1, 0.35);
        s.hotColor.set(_c1);
        s.heatT = rr(0.28, 0.55);
        s.tint = rr(0.75, 1.15);
        s.alive = true;
        if (this.active.indexOf(s) < 0) this.active.push(s);
      }
      while (this.active.length > this.cap) {
        this.setAlive(this.active[0], false);
        this.active.shift();
      }
    }
    setAlive(u, on) {
      if (u.alive === on) return;
      u.alive = on;
      if (!on) {
        this._mat.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(u.index, this._mat);
        this.colAttr.setXYZ(u.index, 0, 0, 0);
      }
    }
    update(dt) {
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        u.age += dt;
        if (u.age >= u.life) {
          this.setAlive(u, false);
          continue;
        }
        if (!u.bounced && u.pos.y <= 0.05 && u.vel.y < 0) {
          u.bounced = true;
          u.pos.y = 0.05;
          u.vel.y = -u.vel.y * 0.42;
          u.vel.x *= 0.55;
          u.vel.z *= 0.55;
        }
        u.vel.y -= u.grav * dt;
        u.pos.addScaledVector(u.vel, dt);
        if (u.pos.y < 0.02) {
          u.pos.y = 0.02;
          u.vel.y = 0;
          u.vel.x *= 1 - Math.min(0.9, dt * 6);
          u.vel.z *= 1 - Math.min(0.9, dt * 6);
        }
        u.rot.x += u.ang.x * dt;
        u.rot.y += u.ang.y * dt;
        u.rot.z += u.ang.z * dt;
        const k = u.age / u.life;
        const shrink = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        // 离相机太近的碎块直接收掉：一块 0.5m 的石头飘到镜头前 1m，
        // 在屏幕上就是一整块盖住角色的色块（基线里"巨大红色多边形"就是这么来的）
        let near = 1;
        if (this.ctx.camera) {
          const dx = u.pos.x - this.ctx.camera.position.x;
          const dy = u.pos.y - this.ctx.camera.position.y;
          const dz = u.pos.z - this.ctx.camera.position.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 2.56) near = Math.max(0, Math.sqrt(d2) / 1.6 - 0.2);
        }
        this._quat.setFromEuler(u.rot);
        const sc = shrink * near;
        this._sc.set(u.sx * sc, u.sy * sc, u.sz * sc);
        this._mat.compose(u.pos, this._quat, this._sc);
        this.mesh.setMatrixAt(u.index, this._mat);
        /* 高温 → 冷却：刚炸开时碎块被烧红（受击色 + 橙红），0.3~0.6s 内褪成混凝土灰。
         * 这样"红色"是能量残留，而不是石头本来的颜色。 */
        const heat = clamp3(1 - u.age / u.heatT, 0, 1);
        const t = u.tint * shrink;
        const hr = u.base.r + (u.hotColor.r * 1.9 - u.base.r) * heat;
        const hg = u.base.g + (u.hotColor.g * 1.0 - u.base.g) * heat;
        const hb = u.base.b + (u.hotColor.b * 0.35 - u.base.b) * heat;
        this.colAttr.setXYZ(u.index, hr * t, hg * t, hb * t);
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        if (!this.active[i].alive) {
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
        }
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
    releaseAll() {
      for (const u of this.active) this.setAlive(u, false);
      this.active.length = 0;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
    dispose() {
      this.ctx.group.remove(this.mesh);
      this.geo.dispose();
      this.mesh.dispose();
    }
  };
  var TrailPool = class {
    constructor(ctx2) {
      this.ctx = ctx2;
      this.cap = TRAIL_LIMIT;
      this.users = [];
      this.active = [];
      this._a = new Vector3();
      this._b = new Vector3();
      this._dir = new Vector3();
      this._side = new Vector3();
      this._toCam = new Vector3();
      for (let i = 0; i < this.cap; i++) {
        const geo = makeTrailGeo();
        const mesh = new Mesh(geo, ctx2.mats.trail);
        mesh.frustumCulled = false;
        mesh.renderOrder = 8;
        mesh.visible = false;
        ctx2.group.add(mesh);
        this.users.push({
          zone: this,
          index: i,
          alive: false,
          age: 0,
          life: 1,
          mesh,
          geo,
          target: null,
          buf: new Float32Array(TRAIL_SEGS * 3),
          head: 0,
          filled: 0,
          width: 0.4,
          fade: 0.6,
          stopped: false,
          stale: true,
          sinceMove: 0,
          lastPos: new Vector3()
        });
      }
    }
    alloc() {
      for (let i = 0; i < this.cap; i++) if (!this.users[i].alive) return this.users[i];
      return this.active.length ? this.active[0] : null;
    }
    /**
     * @param {object} o FXTrailOpts
     * @returns {{update:(p:THREE.Vector3)=>void, stop:()=>void}}
     */
    spawn(o) {
      const u = this.alloc();
      if (!u) return { update() {
      }, stop() {
      } };
      if (u.alive) this.setAlive(u, false);
      u.target = o.target && o.target.isObject3D ? o.target : null;
      u.width = Math.max(0.01, def(o.width, 0.4));
      u.life = def(o.life, 0.6);
      u.fade = clamp3(def(o.fade, 0.6), 0.02, 3);
      u.head = 0;
      u.filled = 0;
      u.age = 0;
      u.sinceMove = 0;
      u.stale = true;
      u.stopped = false;
      u.alive = true;
      if (u.target) {
        u.target.updateWorldMatrix(true, false);
        this._push(u, _v12.setFromMatrixPosition(u.target.matrixWorld));
      }
      if (this.active.indexOf(u) < 0) {
        this.active.push(u);
        while (this.active.length > this.cap) {
          this.setAlive(this.active[0], false);
          this.active.shift();
        }
      }
      const self2 = this;
      return {
        get alive() {
          return u.alive;
        },
        update(p) {
          if (!u.alive || u.stopped) return;
          self2._push(u, p);
        },
        stop() {
          u.stopped = true;
          u.target = null;
        }
      };
    }
    _push(u, p) {
      if (!p) return;
      const b = u.buf;
      if (u.filled > 0) {
        const dx = p.x - u.lastPos.x;
        const dy = p.y - u.lastPos.y;
        const dz = p.z - u.lastPos.z;
        if (dx * dx + dy * dy + dz * dz < 9e-4) return;
      }
      const h = u.head * 3;
      b[h] = p.x;
      b[h + 1] = p.y;
      b[h + 2] = p.z;
      u.lastPos.set(p.x, p.y, p.z);
      u.head = (u.head + 1) % TRAIL_SEGS;
      if (u.filled < TRAIL_SEGS) u.filled++;
      u.age = 0;
      u.sinceMove = 0;
      u.stale = false;
    }
    setAlive(u, on) {
      if (u.alive === on) return;
      u.alive = on;
      if (!on) u.mesh.visible = false;
    }
    update(dt) {
      this.ctx.mats.trail.uniforms.uTime.value = this.ctx.time;
      for (let i = 0; i < this.active.length; i++) {
        const u = this.active[i];
        if (!u.alive) continue;
        if (u.target) {
          u.target.updateWorldMatrix(true, false);
          this._push(u, _v12.setFromMatrixPosition(u.target.matrixWorld));
        }
        u.sinceMove += dt;
        if (u.stopped) {
          u.age += dt;
          if (u.age >= u.life) {
            this.setAlive(u, false);
            continue;
          }
        } else if (u.sinceMove > STALE_TRAIL || u.age > MAX_TRAIL_AGE) {
          this.setAlive(u, false);
          continue;
        }
        const fade = u.stopped ? clamp3(1 - u.age / u.life, 0, 1) : 1;
        this._build(u, fade);
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        if (!this.active[i].alive) {
          this.active[i] = this.active[this.active.length - 1];
          this.active.pop();
        }
      }
    }
    /** 用环形缓冲重建飘带顶点（面向相机的带状面） */
    _build(u, fade) {
      const n = u.filled;
      if (n < 2) {
        u.mesh.visible = false;
        u.geo.setDrawRange(0, 0);
        return;
      }
      u.mesh.visible = true;
      const pos = u.geo.attributes.position.array;
      const col = u.geo.attributes.aCol.array;
      const cam2 = this.ctx.camera;
      const b = u.buf;
      const start = u.filled < TRAIL_SEGS ? 0 : u.head;
      const pairs = Math.min(TRAIL_PAIRS, n);
      for (let s = 0; s < pairs; s++) {
        const idx = (start + s) % TRAIL_SEGS * 3;
        this._a.set(b[idx], b[idx + 1], b[idx + 2]);
        const nidx = (start + Math.min(s + 1, pairs - 1)) % TRAIL_SEGS * 3;
        this._b.set(b[nidx], b[nidx + 1], b[nidx + 2]);
        this._dir.subVectors(this._b, this._a);
        if (this._dir.lengthSq() < 1e-10) this._dir.set(1, 0, 0);
        this._dir.normalize();
        this._toCam.subVectors(cam2.position, this._a);
        this._side.crossVectors(this._dir, this._toCam);
        if (this._side.lengthSq() < 1e-10) this._side.set(0, 1, 0);
        this._side.normalize();
        const t = pairs > 1 ? s / (pairs - 1) : 0;
        const w = u.width * (0.15 + 0.85 * Math.pow(t, u.fade)) * fade;
        const o = s * 6;
        pos[o] = this._a.x + this._side.x * w;
        pos[o + 1] = this._a.y + this._side.y * w;
        pos[o + 2] = this._a.z + this._side.z * w;
        pos[o + 3] = this._a.x - this._side.x * w;
        pos[o + 4] = this._a.y - this._side.y * w;
        pos[o + 5] = this._a.z - this._side.z * w;
        const f = Math.pow(t, 0.8) * fade;
        col[o] = f;
        col[o + 1] = f;
        col[o + 2] = f;
        col[o + 3] = f;
        col[o + 4] = f;
        col[o + 5] = f;
      }
      for (let s = pairs; s < TRAIL_PAIRS; s++) {
        const o = s * 6;
        pos[o] = pos[o + 3] = this._a.x;
        pos[o + 1] = pos[o + 4] = this._a.y;
        pos[o + 2] = pos[o + 5] = this._a.z;
        col[o] = col[o + 1] = col[o + 2] = 0;
        col[o + 3] = col[o + 4] = col[o + 5] = 0;
      }
      u.geo.setDrawRange(0, Math.max(0, (pairs - 1) * 6));
      u.geo.attributes.position.needsUpdate = true;
      u.geo.attributes.aCol.needsUpdate = true;
    }
    releaseAll() {
      for (const u of this.active) this.setAlive(u, false);
      this.active.length = 0;
    }
    dispose() {
      for (const u of this.users) {
        u.geo.dispose();
        this.ctx.group.remove(u.mesh);
      }
    }
  };
  var LightningPool = class extends Pool {
    constructor(ctx2) {
      const make = (u, o) => {
        readVec(o.from, u.from);
        readVec(o.to, u.to);
        u.color.set(def(o.color, C.VIOLET));
        u.color2.set(def(o.color2, C.WHITE));
        u.branches = clamp3(def(o.branches, 3) | 0, 0, LIGHT_BRANCH_MAX);
        u.life = def(o.life, 0.35);
        u.width = Math.max(5e-3, def(o.width, 0.16));
        u.jag = clamp3(def(o.jag, 0.4), 0, 2);
        u.seed = rnd() * 100;
        u.tick = 1;
        u.flick = 1;
        u.mesh.visible = true;
        u.alive = true;
      };
      const upd = (u, dt) => {
        if (u.age >= u.life) {
          u.mesh.visible = false;
          this.setAlive(u, false);
          return;
        }
        u.tick += dt;
        if (u.tick > 0.022) {
          u.tick = 0;
          buildBolt(u);
        }
        const k = u.age / u.life;
        u.mesh.visible = rnd() < 0.88 - k * 0.4;
        u.flick = 0.65 + rnd() * 0.75;
      };
      super(LIMIT, LIMIT, make, upd);
      this.ctx = ctx2;
      for (let i = 0; i < this.cap; i++) {
        const u = this.users[i];
        u.from = new Vector3();
        u.to = new Vector3();
        u.color = new Color();
        u.color2 = new Color();
        u.tick = 1;
        u.flick = 1;
        u.seed = 0;
        u.mesh = new Mesh(makeLightningGeo(), ctx2.mats.light);
        u.mesh.visible = false;
        u.mesh.frustumCulled = false;
        u.mesh.renderOrder = 6;
        ctx2.group.add(u.mesh);
      }
    }
    spawn(o) {
      const u = super.spawn(o);
      if (u.index < 0) return u;
      buildBolt(u);
      return u;
    }
    update(dt) {
      super.update(dt);
      const mat = this.ctx.mats.light;
      mat.uniforms.uTime.value = this.ctx.time;
      const u = this.active.length ? this.active[this.active.length - 1] : null;
      if (u) {
        mat.uniforms.uLife.value = 1 - clamp3(u.age / u.life, 0, 1);
        mat.uniforms.uFlick.value = u.flick;
        mat.uniforms.uSeed.value = u.seed;
        mat.uniforms.uColor.value.copy(u.color);
        mat.uniforms.uColor2.value.copy(u.color2);
      } else {
        mat.uniforms.uLife.value = 0;
      }
    }
    dispose() {
      for (let i = 0; i < this.cap; i++) {
        this.users[i].mesh.geometry.dispose();
        this.ctx.group.remove(this.users[i].mesh);
      }
    }
  };
  var _pathA = [];
  var _pathB = [];
  var _pathTmp = new Float32Array(3 * 256);
  function jaggedPath(a, b, segs, amp, out, e1, e2) {
    out.length = 0;
    const n = clamp3(segs | 0, 1, 84);
    const cnt = n + 1;
    _pathTmp[0] = a.x;
    _pathTmp[1] = a.y;
    _pathTmp[2] = a.z;
    _pathTmp[n * 3] = b.x;
    _pathTmp[n * 3 + 1] = b.y;
    _pathTmp[n * 3 + 2] = b.z;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      _pathTmp[i * 3] = a.x + (b.x - a.x) * t;
      _pathTmp[i * 3 + 1] = a.y + (b.y - a.y) * t;
      _pathTmp[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    let step = 1;
    while (step * 2 <= n) step *= 2;
    let a2 = amp;
    while (step >= 2) {
      const half = step >> 1;
      for (let i = half; i < n; i += step) {
        const j = i * 3;
        const d1 = rr(-1, 1) * a2;
        const d2 = rr(-1, 1) * a2;
        _pathTmp[j] += e1.x * d1 + e2.x * d2;
        _pathTmp[j + 1] += e1.y * d1 + e2.y * d2;
        _pathTmp[j + 2] += e1.z * d1 + e2.z * d2;
      }
      step = half;
      a2 *= 0.56;
    }
    if (step === 1) {
      for (let i = 1; i < n; i++) {
        const j = i * 3;
        _pathTmp[j] += e1.x * rr(-1, 1) * amp * 0.25;
        _pathTmp[j + 1] += e1.y * rr(-1, 1) * amp * 0.25;
        _pathTmp[j + 2] += e1.z * rr(-1, 1) * amp * 0.25;
      }
    }
    for (let i = 0; i < cnt; i++) {
      out.push(_pathTmp[i * 3], _pathTmp[i * 3 + 1], _pathTmp[i * 3 + 2]);
    }
  }
  function buildBolt(u) {
    const geo = u.mesh.geometry;
    const pos = geo.attributes.position.array;
    const aU = geo.attributes.aU.array;
    let ptr = 0;
    _v4.subVectors(u.to, u.from);
    const dist = _v4.length();
    if (dist < 1e-4) {
      geo.setDrawRange(0, 0);
      return;
    }
    _v4.multiplyScalar(1 / dist);
    _v22.set(0, 1, 0);
    if (Math.abs(_v4.y) > 0.94) _v22.set(1, 0, 0);
    _v32.crossVectors(_v4, _v22).normalize();
    _v22.crossVectors(_v32, _v4).normalize();
    const amp = Math.min(dist * 0.1, 1.4) * u.jag;
    jaggedPath(u.from, u.to, LIGHT_SEGS, amp, _pathA, _v22, _v32);
    const pts = _pathA.length / 3;
    for (let i = 0; i < pts; i++) {
      if (ptr + 2 > LIGHT_VERTS) break;
      const t = pts > 1 ? i / (pts - 1) : 0;
      const x = _pathA[i * 3];
      const y = _pathA[i * 3 + 1];
      const z = _pathA[i * 3 + 2];
      const w = u.width * (0.5 + 0.8 * Math.sin(Math.PI * clamp3(t, 0, 1)));
      let o = ptr * 3;
      pos[o] = x + _v22.x * w;
      pos[o + 1] = y + _v22.y * w;
      pos[o + 2] = z + _v22.z * w;
      aU[ptr] = t;
      ptr++;
      o = ptr * 3;
      pos[o] = x - _v22.x * w;
      pos[o + 1] = y - _v22.y * w;
      pos[o + 2] = z - _v22.z * w;
      aU[ptr] = t;
      ptr++;
    }
    for (let k = 0; k < u.branches; k++) {
      if (ptr + (LIGHT_BRANCH_SEGS + 1) * 2 > LIGHT_VERTS) break;
      const fi = clamp3(Math.round(rr(0.12, 0.8) * (pts - 1)), 0, pts - 1);
      _v12.set(_pathA[fi * 3], _pathA[fi * 3 + 1], _pathA[fi * 3 + 2]);
      _e1.set(rr(-1, 1), rr(-0.6, 0.9), rr(-1, 1));
      if (_e1.lengthSq() < 1e-6) _e1.set(0, 1, 0);
      _e1.normalize();
      const blen = dist * rr(0.12, 0.34);
      _v22.copy(_v4).multiplyScalar(0.5).addScaledVector(_e1, 0.85);
      if (_v22.lengthSq() < 1e-6) _v22.copy(_e1);
      _v22.normalize();
      _v32.set(_v12.x + _v22.x * blen, _v12.y + _v22.y * blen, _v12.z + _v22.z * blen);
      _e2.set(0, 1, 0);
      _v22.crossVectors(_v4, _e2);
      if (_v22.lengthSq() < 1e-6) _v22.set(1, 0, 0);
      _v22.normalize();
      _e2.crossVectors(_v22, _v4).normalize();
      jaggedPath(_v12, _v32, LIGHT_BRANCH_SEGS, amp * 0.6, _pathB, _v22, _e2);
      const bpts = _pathB.length / 3;
      const bw = u.width * 0.55;
      for (let i = 0; i < bpts; i++) {
        if (ptr + 2 > LIGHT_VERTS) break;
        const t = bpts > 1 ? i / (bpts - 1) : 0;
        const w = bw * (0.3 + 0.7 * (1 - t));
        const x = _pathB[i * 3];
        const y = _pathB[i * 3 + 1];
        const z = _pathB[i * 3 + 2];
        let o = ptr * 3;
        pos[o] = x + _v22.x * w;
        pos[o + 1] = y + _v22.y * w;
        pos[o + 2] = z + _v22.z * w;
        aU[ptr] = t;
        ptr++;
        o = ptr * 3;
        pos[o] = x - _v22.x * w;
        pos[o + 1] = y - _v22.y * w;
        pos[o + 2] = z - _v22.z * w;
        aU[ptr] = t;
        ptr++;
      }
    }
    for (let i = ptr; i < LIGHT_VERTS; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = -1e6;
      pos[i * 3 + 2] = 0;
      aU[i] = 0;
    }
    geo.setDrawRange(0, ptr);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aU.needsUpdate = true;
  }
  function createFX(scene2, camera, opts) {
    const raw = opts && opts.quality || "medium";
    const q = raw === "low" || raw === "high" ? raw : "medium";
    const tex = new TexBank();
    const mats = makeMaterials(tex);
    const group = new Group();
    group.name = "fx-group";
    group.matrixAutoUpdate = false;
    scene2.add(group);
    const ctx2 = {
      scene: scene2,
      camera,
      group,
      mats,
      tex,
      quality: q,
      time: 0,
      /** 与 render.js 的约定：屏幕空间冲击状态（见文件头注释） */
      screenState: {
        flash: 0,
        flashColor: new Color(C.WHITE),
        shake: 0,
        blur: 0,
        vignette: 0,
        chroma: 0,
        freeze: 0,
        life: 0
      },
      /** 刀刃碎片几何（AuraPool 构造时创建） */
      shardGeo: null
    };
    const particles = new ParticlePool(ctx2, PARTICLE_CAP[q]);
    const shocks = new ShockPool(ctx2);
    const beams = new BeamPool(ctx2);
    const slashes = new SlashPool(ctx2);
    const spheres = new SpherePool(ctx2);
    const auras = new AuraPool(ctx2);
    const grounds = new GroundRingPool(ctx2);
    const numbers = new DamagePool(ctx2, tex);
    const callouts = new CalloutPool(ctx2, tex);
    const debriss = new DebrisPool(ctx2);
    const trails = new TrailPool(ctx2);
    const lights = new LightningPool(ctx2);
    // 让咒力球能用上尾迹（SpherePool 在构造时还看不到 trails）
    ctx2.trails = trails;
    let warmPending = true;
    /* ==========================================================================
     * hitSpark —— 命中火花
     *
     * 旧版是「以命中点为中心的均匀球状爆散 + 3~6 颗纯白大闪」，问题：
     *   1. 没有方向：看不出这一拳是从哪边打过来的
     *   2. 白闪粒子尺寸大、加法叠在一起，命中点直接糊成白斑
     * 现在：
     *   - 有 dir 时火花收束成一个锥体（沿受击方向飞出），并保留少量侧向火星
     *   - 白色"闪光粒子"只留 2~3 颗且尺寸缩小，颜色改成受击色系的暖色，
     *     保证命中瞬间还能看见被击中的人
     *   - 命中点接近地面时自动补一圈扬尘（地面接触反馈）
     * ======================================================================== */
    function hitSpark(o) {
      o = o || {};
      const pos = readVec(o.pos, _v12);
      const base = _c1.set(def(o.color, C.WHITE));
      const alt = _c2.set(def(o.color2, def(o.color, C.NEON_CYAN)));
      const crit = !!o.crit;
      const baseCount = q === "low" ? 12 : q === "high" ? 30 : 22;
      const count = clamp3(def(o.count, Math.round(baseCount * (crit ? 1.8 : 1))) | 0, 1, 160);
      const size = def(o.size, crit ? 0.5 : 0.28);
      const life = def(o.life, crit ? 0.5 : 0.34);
      const speed = def(o.speed, crit ? 16 : 11);
      const spread = clamp3(def(o.spread, 1), 0, 1);
      const grav = def(o.gravity, -6);
      const hasDir = !!o.dir;
      if (hasDir) readVec(o.dir, _v22).normalize();
      else _v22.set(0, 0, 0);
      const hx = pos.x;
      const hy = pos.y;
      const hz = pos.z;
      for (let i = 0; i < count; i++) {
        let dx, dy, dz;
        if (hasDir) {
          // 锥形：主方向 ± 约 35°，越靠外越慢
          const ct = rr(0.55, 1);
          const ph = rnd() * TAU2;
          const st = Math.sqrt(Math.max(0, 1 - ct * ct));
          const bx = Math.cos(ph) * st, by = Math.sin(ph) * st * 0.8, bz = Math.sin(ph) * st;
          dx = _v22.x * ct + bx * (0.5 + 0.5 * spread);
          dy = _v22.y * ct + by * (0.5 + 0.5 * spread) + 0.18;
          dz = _v22.z * ct + bz * (0.5 + 0.5 * spread);
        } else {
          const z = rr(-1, 1) * (0.35 + 0.65 * spread);
          const a = rnd() * TAU2;
          const r = Math.sqrt(Math.max(0, 1 - z * z));
          dx = Math.cos(a) * r;
          dy = z + 0.15;
          dz = Math.sin(a) * r;
        }
        const sp = speed * rr(0.35, 1.25);
        const mix = rnd();
        particles.spawn(
          hx + dx * 0.12,
          hy + dy * 0.12,
          hz + dz * 0.12,
          dx * sp,
          dy * sp + 1.6,
          dz * sp,
          base.r * (1 - mix) + alt.r * mix,
          base.g * (1 - mix) + alt.g * mix,
          base.b * (1 - mix) + alt.b * mix,
          size * rr(0.35, 1),
          size * 0.05,
          life * rr(0.6, 1.25),
          grav,
          2.6,
          1,
          0,
          0,
          0,
          0
        );
      }
      // 命中闪光：只留 1~2 颗、尺寸砍半、颜色走受击色 → 亮但不糊人
      const flashN = crit ? 2 : 1;
      for (let i = 0; i < flashN; i++) {
        const hotMix = 0.55 + 0.35 * rnd();
        particles.spawn(
          hx,
          hy,
          hz,
          rnd2() * 1.2,
          rnd() * 1.8,
          rnd2() * 1.2,
          base.r * (1 - hotMix) + hotMix,
          base.g * (1 - hotMix) + hotMix,
          base.b * (1 - hotMix) + hotMix,
          size * (crit ? 1.5 : 1.05) * rr(0.7, 1.2),
          size * 0.05,
          life * 0.45,
          0,
          4,
          1,
          0,
          0,
          0,
          0
        );
      }
      // 环状火花：绕受击方向盘成一个"冲击环"，而不是均匀的球状爆散
      const ringN = q === "low" ? 6 : 12;
      for (let i = 0; i < ringN; i++) {
        const a = i / ringN * TAU2;
        const sp = speed * 0.85;
        let rx, ry, rz;
        if (hasDir) {
          // 以 _v22 为轴的正交基
          _v32.set(0, 1, 0);
          if (Math.abs(_v22.y) > 0.9) _v32.set(1, 0, 0);
          _e1.crossVectors(_v22, _v32).normalize();
          _e2.crossVectors(_v22, _e1).normalize();
          rx = Math.cos(a) * _e1.x + Math.sin(a) * _e2.x;
          ry = Math.cos(a) * _e1.y + Math.sin(a) * _e2.y;
          rz = Math.cos(a) * _e1.z + Math.sin(a) * _e2.z;
        } else {
          rx = Math.cos(a);
          ry = Math.sin(a) * 0.5;
          rz = Math.sin(a);
        }
        particles.spawn(
          hx + rx * 0.2,
          hy + ry * 0.2,
          hz + rz * 0.2,
          rx * sp,
          ry * sp + 1,
          rz * sp,
          alt.r,
          alt.g,
          alt.b,
          size * 0.7,
          size * 0.1,
          life * 0.7,
          0,
          7,
          0.85,
          0,
          0,
          0,
          0
        );
      }
      /* --- 地面接触：命中点贴地时踢起一圈扬尘，让打击"落地" ---
       * 判据是命中高度 + 相机看不到的 y，所以只在真正接近地面时触发。 */
      if (hy < 0.85) {
        const dustN = q === "low" ? 5 : q === "high" ? 14 : 10;
        for (let i = 0; i < dustN; i++) {
          const a = rnd() * TAU2;
          const r = rr(0.2, 0.75);
          const sp = rr(2.2, 5.4);
          particles.spawn(
            hx + Math.cos(a) * r,
            0.08 + rnd() * 0.16,
            hz + Math.sin(a) * r,
            Math.cos(a) * sp,
            rr(0.6, 1.9),
            Math.sin(a) * sp,
            0.62,
            0.60,
            0.58,
            rr(0.28, 0.55),
            rr(1.1, 1.9),
            rr(0.5, 0.95),
            -1.2,
            2.1,
            0.5,
            0,
            0,
            0,
            0
          );
        }
        if (hy < 0.35 && rnd() < 0.5) {
          // 地面灼痕：一道细环就够。之前 maxRadius 放到 4.5m + soft 0.5，
          // 在画面里就是一块盖住半条路的深红色大圆盘。
          groundRing({
            pos: { x: hx, y: 0.02, z: hz },
            radius: 0.2,
            maxRadius: clamp3(size * 4.2, 0.8, 2.2),
            life: 0.4,
            color: _c1.getHex(),
            color2: _c2.getHex(),
            thickness: 0.34,
            bright: 0.5,
            soft: 0.3
          });
        }
      }
      // 命中环：半径收小 + 环带收细，避免"角色被一个青色球罩住"的观感
      shocks.spawn({
        pos,
        radius: size * 0.45,
        maxRadius: crit ? 1.7 : 1.05,
        life: life * 0.8,
        color: alt.getHex(),
        color2: base.getHex(),
        thickness: crit ? 0.42 : 0.3,
        soft: 0.3,
        ringCount: crit ? 2 : 1,
        segments: q === "low" ? 32 : 56,
        bright: 0.9
      });
      if (crit) {
        screen({ flash: 0.2, color: def(o.color2, C.SCARLET), shake: 0.1, chroma: 0.18 });
      }
    }
    function shockwave(o) {
      shocks.spawn(o || {});
    }
    function slash(o) {
      slashes.spawn(o || {});
    }
    function beam(o) {
      o = o || {};
      beams.spawn(o);
    }
    function sphere(o) {
      o = o || {};
      const u = spheres.spawn(o);
      if (!u || u.index < 0) return u;
      const charge = clamp3(def(o.charge, 1), 0, 1);
      const radius = Math.max(0.05, def(o.radius, 1.2));
      const n = Math.round(clamp3(6 + 26 * charge, 0, q === "low" ? 12 : 40));
      const c = _c1.set(def(o.color, C.AZURE));
      const c2 = _c2.set(def(o.coreColor, C.CYAN));
      _v12.copy(u.world);
      for (let i = 0; i < n; i++) {
        const z = rr(-1, 1);
        const a = rnd() * TAU2;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const R = radius * rr(2.2, 5);
        const mix = rnd();
        particles.spawn(
          _v12.x + Math.cos(a) * r * R,
          _v12.y + z * R,
          _v12.z + Math.sin(a) * r * R,
          0,
          0,
          0,
          c.r * (1 - mix) + c2.r * mix,
          c.g * (1 - mix) + c2.g * mix,
          c.b * (1 - mix) + c2.b * mix,
          radius * rr(0.06, 0.18),
          radius * 0.02,
          rr(0.35, 0.9) * (0.5 + charge),
          0,
          0,
          1,
          1.6 + 3.4 * charge,
          _v12.x,
          _v12.y,
          _v12.z
          // spin > 0 → 向心收束
        );
      }
      return u;
    }
    function aura(o) {
      return auras.spawn(o || {});
    }
    function groundRing(o) {
      grounds.spawn(o || {});
    }
    function damageNumber(o) {
      numbers.spawn(o || {});
    }
    function callout(o) {
      callouts.spawn(o || {});
    }
    function debris(o) {
      debriss.spawn(o || {});
    }
    function trail(o) {
      return trails.spawn(o || {});
    }
    function lightning(o) {
      o = o || {};
      const u = lights.spawn(o);
      if (u && u.index >= 0 && rnd() < 0.6) {
        hitSpark({
          pos: o.to,
          color: def(o.color, C.VIOLET),
          color2: def(o.color2, C.WHITE),
          count: 6,
          size: 0.35,
          speed: 8,
          life: 0.24
        });
      }
    }
    /* ==========================================================================
     * screen —— 屏幕级反馈（闪光 / 震动 / 色散 / 暗角 / 顿帧）
     *
     * 这里是「克制」的闸门。旧版把所有请求原样透传，术式动辄 flash=1.0、
     * shake=1.6、blur=0.5，命中瞬间整屏糊成一片白，玩家什么都看不见。
     * 现在统一压到一组经验上限。
     * 【用户反馈后的修正】"持续的过曝"和"瞬时的冲击"要分开对待：
     *   闪光峰值不再砍 —— 命中那一两帧要够亮（用户要的打击感就在这里），
     *   靠 render.js 的「柔肩 + 按亮度/中心分配 + 快速衰减」去保证
     *   它只是"闪一下"，不会变成一整屏白。
     *   flash ≤ 0.95（原 1.0 请求基本原样放行，但不再允许 >1 的离谱值）
     *   shake ≤ 1.35   —— 命中要震得出来
     *   blur  ≤ 0.34   —— 只做"气浪"暗示，不做视障
     *   chroma≤ 1.4
     * ======================================================================== */
    function screen(o) {
      o = o || {};
      const s = ctx2.screenState;
      // 请求值 ×1.7 再限幅：
      // 实测 combat/main 发过来的闪光请求多在 0.35~0.45，而它在 render 侧还要经历
      // 一帧的指数衰减，真正落到屏幕上的峰值只有 0.24~0.33 —— 打起来"没有打击感"。
      // 这里做一次前置放大，让命中峰值回到 0.6~0.9 区间（仍受 FLASH_MAX 与
      // 「按亮度分配 + 中心保护」约束，不会回到全屏死白）。
      if (o.flash !== void 0) s.flash = Math.max(s.flash, clamp3(def(o.flash, 0) * 1.7, 0, 0.95));
      if (o.color !== void 0) s.flashColor.set(o.color);
      if (o.shake !== void 0) s.shake = Math.max(s.shake, clamp3(def(o.shake, 0), 0, 1.35));
      if (o.blur !== void 0) s.blur = Math.max(s.blur, clamp3(def(o.blur, 0), 0, 0.34));
      if (o.vignette !== void 0) s.vignette = Math.max(s.vignette, clamp3(def(o.vignette, 0), 0, 0.7));
      if (o.chroma !== void 0) s.chroma = Math.max(s.chroma, clamp3(def(o.chroma, 0), 0, 1.4));
      if (o.freeze !== void 0) s.freeze = Math.max(s.freeze, clamp3(def(o.freeze, 0), 0, 1));
      s.life = 1;
    }
    /* --- 着色器预热 ---
     * three 是"第一次画到才编译 program"的，实测第一次放技能会卡掉一整帧
     * （Lead 的验收探针量到 worstFps 3.2 ≈ 300ms）。
     * 这里在创建时把所有池网格临时点亮（缩到 1e-4，肉眼不可见），
     * 让 main.js 的 warmUp() 那三帧渲染把 program 全部编译完；
     * 第一帧 update 再统一收起来，之后由各池自己按活跃状态开关。
     */
    /* 只点亮"每种 program 一个"的替身网格。
     * 曾经试过把池里全部网格（约 2000 个 draw call）点亮一帧，结果机器负载高时
     * 加载阶段直接卡死，风险太大；program 的编译是按 shader+define 去重的，
     * 所以每种材质点一个替身就够，代价 11 个 draw call。 */
    const warmGroup = new Group();
    const warmGeo = new SphereGeometry(1, 6, 4);
    const warmMeshes = [];
    for (const key of ["shock", "ground", "beam", "slash", "sphere", "aura", "auraWire", "trail", "light"]) {
      const m = new Mesh(warmGeo, mats[key]);
      m.frustumCulled = false;
      m.scale.setScalar(1e-4);
      m.renderOrder = -1;
      warmGroup.add(m);
      warmMeshes.push(m);
    }
    const warmPoints = new Points(warmGeo, mats.particle);
    warmPoints.frustumCulled = false;
    warmPoints.scale.setScalar(1e-4);
    warmGroup.add(warmPoints);
    warmMeshes.push(warmPoints);
    // 碎块用的是 InstancedMesh（带 USE_INSTANCING define），必须用同类对象预热
    const warmInst = new InstancedMesh(warmGeo, mats.debris, 1);
    warmInst.frustumCulled = false;
    warmInst.scale.setScalar(1e-4);
    warmGroup.add(warmInst);
    warmMeshes.push(warmInst);
    group.add(warmGroup);
    function update2(t, dt) {
      if (warmPending) {
        warmPending = false;
        group.remove(warmGroup);
        warmGeo.dispose();
        warmInst.dispose();
      }
      const d = clamp3(def(dt, 0), 0, 0.1);
      ctx2.time = def(t, ctx2.time + d);
      ctx2.dt = d;
      particles.update(d);
      shocks.update(d);
      beams.update(d);
      slashes.update(d);
      spheres.update(d);
      auras.update(d);
      grounds.update(d);
      numbers.update(d);
      callouts.update(d);
      debriss.update(d);
      trails.update(d);
      lights.update(d);
      const s = ctx2.screenState;
      s.flash *= Math.exp(-6 * d);
      s.shake *= Math.exp(-5 * d);
      s.blur *= Math.exp(-4 * d);
      s.chroma *= Math.exp(-4 * d);
      s.vignette *= Math.exp(-3 * d);
      s.freeze = Math.max(0, s.freeze - d * 0.85);
      if (s.flash < 2e-3) s.flash = 0;
      if (s.shake < 15e-4) s.shake = 0;
      if (s.blur < 2e-3) s.blur = 0;
      if (s.chroma < 2e-3) s.chroma = 0;
      if (s.vignette < 2e-3) s.vignette = 0;
      if (s.freeze < 4e-3) s.freeze = 0;
      s.life = Math.max(Math.min(1, s.flash * 2), Math.min(1, s.vignette), Math.min(1, s.freeze * 1.4));
    }
    function clear() {
      particles.releaseAll();
      shocks.releaseAll();
      beams.releaseAll();
      slashes.releaseAll();
      spheres.releaseAll();
      auras.releaseAll();
      grounds.releaseAll();
      numbers.releaseAll();
      callouts.releaseAll();
      debriss.releaseAll();
      trails.releaseAll();
      lights.releaseAll();
      const s = ctx2.screenState;
      s.flash = 0;
      s.shake = 0;
      s.blur = 0;
      s.vignette = 0;
      s.chroma = 0;
      s.freeze = 0;
      s.life = 0;
    }
    function dispose() {
      clear();
      particles.dispose();
      shocks.dispose();
      beams.dispose();
      slashes.dispose();
      spheres.dispose();
      auras.dispose();
      grounds.dispose();
      numbers.dispose();
      callouts.dispose();
      debriss.dispose();
      trails.dispose();
      lights.dispose();
      if (ctx2.shardGeo) ctx2.shardGeo.dispose();
      for (const k in mats) {
        if (mats[k] && mats[k].dispose) mats[k].dispose();
      }
      tex.dispose();
      scene2.remove(group);
    }
    /* 调试：把每个池的材质 UUID 暴露出来。
     * 用途：实机里看到"不明物体"时，用材质 UUID 反查它属于哪个池，
     * 而不是靠形状猜（排查"角色身上一直罩着一个球"时吃过这个亏）。 */
    function debugMaterials() {
      const out = {};
      for (const k in mats) if (mats[k] && mats[k].uuid) out[k] = mats[k].uuid;
      out.__spheres = spheres.users.map((u) => u.mat.uuid);
      out.__auras = auras.users.map((u) => u.mat.uuid);
      return out;
    }
    function poolStats() {
      return {
        particles: { active: particles.live, cap: particles.cap },
        shockwave: { active: shocks.count, cap: shocks.cap },
        beam: { active: beams.count, cap: beams.cap },
        slash: { active: slashes.count, cap: slashes.cap },
        sphere: { active: spheres.count, cap: spheres.cap },
        aura: { active: auras.active.length, cap: auras.cap },
        groundRing: { active: grounds.count, cap: grounds.cap },
        damageNumber: { active: numbers.active.length, cap: numbers.cap },
        callout: { active: callouts.active.length, cap: callouts.cap },
        debris: { active: debriss.active.length, cap: debriss.cap },
        trail: { active: trails.active.length, cap: trails.cap },
        lightning: { active: lights.count, cap: lights.cap },
        sceneObjects: { active: group.children.length, cap: group.children.length }
      };
    }
    function setViewportSize(pxHeight) {
      mats.particle.uniforms.uScale.value = Math.max(120, def(pxHeight, 1080));
    }
    return {
      update: update2,
      clear,
      dispose,
      hitSpark,
      shockwave,
      slash,
      beam,
      sphere,
      aura,
      groundRing,
      damageNumber,
      callout,
      debris,
      trail,
      lightning,
      screen,
      setViewportSize,
      poolStats,
      debugMaterials,
      get screenState() {
        return ctx2.screenState;
      },
      get group() {
        return group;
      },
      get time() {
        return ctx2.time;
      }
    };
  }
