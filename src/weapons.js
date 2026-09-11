  function resolveQ(quality2) {
    const q = quality2 === "low" || quality2 === "medium" ? quality2 : "high";
    return {
      name: q,
      sphereSeg: q === "low" ? 16 : q === "medium" ? 24 : 40,
      tubeSeg: q === "low" ? 14 : q === "medium" ? 20 : 28,
      ringSeg: q === "low" ? 28 : q === "medium" ? 48 : 72,
      ribSeg: q === "low" ? 4 : q === "medium" ? 6 : 8,
      cylSeg: q === "low" ? 14 : q === "medium" ? 20 : 28,
      diskParticles: q === "low" ? 90 : q === "medium" ? 240 : 420,
      trailParticles: q === "low" ? 26 : q === "medium" ? 70 : 130,
      shardCount: q === "low" ? 0 : q === "medium" ? 90 : 150,
      lightning: q !== "low",
      debris: q !== "low",
      callout: q !== "low",
      ribRings: q === "low" ? 5 : q === "medium" ? 7 : 9,
      shrineBands: q === "low" ? 0 : q === "medium" ? 8 : 14
    };
  }
  var TEX_CACHE = /* @__PURE__ */ new Map();
  function glowTexture(colorHex) {
    const key = `glow:${colorHex}`;
    let tex = TEX_CACHE.get(key);
    if (tex) return tex;
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext("2d");
    const col = new Color(colorHex);
    const r = Math.round(col.r * 255);
    const gg = Math.round(col.g * 255);
    const b = Math.round(col.b * 255);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.22, `rgba(${r},${gg},${b},0.80)`);
    grad.addColorStop(0.55, `rgba(${r},${gg},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    tex = new CanvasTexture(cv);
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    TEX_CACHE.set(key, tex);
    return tex;
  }
  function pointTexture() {
    const tex = glowTexture(16777215);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }
  function disposeTextures() {
    for (const tex of TEX_CACHE.values()) tex.dispose();
    TEX_CACHE.clear();
  }
  function clampNum(v, lo, hi, def2) {
    if (typeof v !== "number" || !isFinite(v)) return def2;
    return Math.max(lo, Math.min(hi, v));
  }
  function smoothstep01(a, b, x) {
    if (b <= a) return x < a ? 0 : 1;
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function mulberry322(a) {
    let s = a >>> 0;
    return () => {
      s = s + 1831565813 >>> 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function addPolar(geo) {
    const uv = geo.attributes.uv;
    const n = uv.count;
    const arr = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = uv.getX(i) - 0.5;
      const y = uv.getY(i) - 0.5;
      arr[i * 2] = Math.sqrt(x * x + y * y) * 2;
      arr[i * 2 + 1] = Math.atan2(y, x);
    }
    geo.setAttribute("aPolar", new BufferAttribute(arr, 2));
    return geo;
  }
  function quadSoup(n) {
    const geo = new BufferGeometry();
    const pos = new Float32Array(n * 18);
    const uv = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      uv[o] = 0;
      uv[o + 1] = 0;
      uv[o + 2] = 1;
      uv[o + 3] = 0;
      uv[o + 4] = 0;
      uv[o + 5] = 1;
      uv[o + 6] = 1;
      uv[o + 7] = 0;
      uv[o + 8] = 1;
      uv[o + 9] = 1;
      uv[o + 10] = 0;
      uv[o + 11] = 1;
    }
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("uv", new BufferAttribute(uv, 2));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    return geo;
  }
  function writeQuad(arr, i, cx, cy, cz, ux, uy, uz, vx, vy, vz) {
    const o = i * 18;
    const ax = ux, ay = uy, az = uz;
    const bx = vx, by = vy, bz = vz;
    arr[o] = cx - ax - bx;
    arr[o + 1] = cy - ay - by;
    arr[o + 2] = cz - az - bz;
    arr[o + 3] = cx + ax - bx;
    arr[o + 4] = cy + ay - by;
    arr[o + 5] = cz + az - bz;
    arr[o + 6] = cx - ax + bx;
    arr[o + 7] = cy - ay + by;
    arr[o + 8] = cz - az + bz;
    arr[o + 9] = cx + ax - bx;
    arr[o + 10] = cy + ay - by;
    arr[o + 11] = cz + az - bz;
    arr[o + 12] = cx + ax + bx;
    arr[o + 13] = cy + ay + by;
    arr[o + 14] = cz + az + bz;
    arr[o + 15] = cx - ax + bx;
    arr[o + 16] = cy - ay + by;
    arr[o + 17] = cz - az + bz;
  }
  function triSoup(n) {
    const geo = new BufferGeometry();
    const pos = new Float32Array(n * 9);
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    return geo;
  }
  function crescentSoup(n, cols) {
    const c = Math.max(4, cols | 0);
    const vertsPerBlade = (c - 1) * 6;
    const total = Math.max(1, n) * vertsPerBlade;
    const geo = new BufferGeometry();
    const pos = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const prog = new Float32Array(total);
    const sweep2 = new Float32Array(total);
    const alpha = new Float32Array(total);
    const width = new Float32Array(total);
    for (let b = 0; b < Math.max(1, n); b++) {
      const base = b * vertsPerBlade;
      for (let i = 0; i < c - 1; i++) {
        const u0 = i / (c - 1);
        const u1 = (i + 1) / (c - 1);
        const o = base + i * 6;
        uv[o * 2] = u0;
        uv[o * 2 + 1] = 0;
        uv[(o + 1) * 2] = u1;
        uv[(o + 1) * 2 + 1] = 0;
        uv[(o + 2) * 2] = u0;
        uv[(o + 2) * 2 + 1] = 1;
        uv[(o + 3) * 2] = u1;
        uv[(o + 3) * 2 + 1] = 0;
        uv[(o + 4) * 2] = u1;
        uv[(o + 4) * 2 + 1] = 1;
        uv[(o + 5) * 2] = u0;
        uv[(o + 5) * 2 + 1] = 1;
        prog[o] = u0;
        prog[o + 1] = u1;
        prog[o + 2] = u0;
        prog[o + 3] = u1;
        prog[o + 4] = u1;
        prog[o + 5] = u0;
      }
    }
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("uv", new BufferAttribute(uv, 2));
    geo.setAttribute("aProg", new BufferAttribute(prog, 1));
    geo.setAttribute("aSweep", new BufferAttribute(sweep2, 1));
    geo.setAttribute("aAlpha", new BufferAttribute(alpha, 1));
    geo.setAttribute("aWidth", new BufferAttribute(width, 1));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    return { geo, cols: c, vertsPerBlade, pos, uv, prog, sweep: sweep2, alpha, width, n: Math.max(1, n) };
  }
  function writeCrescentBlade(soup, b, cx, cy, cz, dx, dy, dz, px2, py2, pz2, len, maxW, curve) {
    const c = soup.cols;
    const base = b * soup.vertsPerBlade;
    const arr = soup.pos;
    const hx = dx * len * 0.5, hy = dy * len * 0.5, hz = dz * len * 0.5;
    const halfW = new Float32Array(c);
    const bend = new Float32Array(c);
    for (let i = 0; i < c; i++) {
      const u = i / (c - 1);
      halfW[i] = Math.max(1e-4, maxW * 0.5 * Math.pow(Math.sin(Math.PI * u), 0.75));
      bend[i] = curve * (1 - Math.pow(1 - 2 * u, 2)) * len;
    }
    for (let i = 0; i < c - 1; i++) {
      const u0 = i / (c - 1), u1 = (i + 1) / (c - 1);
      const x0 = (u0 - 0.5) * len, x1 = (u1 - 0.5) * len;
      const w0 = halfW[i], w1 = halfW[i + 1];
      const b0 = bend[i], b1 = bend[i + 1];
      const o = base + i * 6;
      arr[o * 3] = cx + dx * x0 + px2 * (b0 - w0);
      arr[o * 3 + 1] = cy + dy * x0 + py2 * (b0 - w0);
      arr[o * 3 + 2] = cz + dz * x0 + pz2 * (b0 - w0);
      arr[(o + 1) * 3] = cx + dx * x1 + px2 * (b1 - w1);
      arr[(o + 1) * 3 + 1] = cy + dy * x1 + py2 * (b1 - w1);
      arr[(o + 1) * 3 + 2] = cz + dz * x1 + pz2 * (b1 - w1);
      arr[(o + 2) * 3] = cx + dx * x0 + px2 * (b0 + w0);
      arr[(o + 2) * 3 + 1] = cy + dy * x0 + py2 * (b0 + w0);
      arr[(o + 2) * 3 + 2] = cz + dz * x0 + pz2 * (b0 + w0);
      arr[(o + 3) * 3] = arr[(o + 1) * 3];
      arr[(o + 3) * 3 + 1] = arr[(o + 1) * 3 + 1];
      arr[(o + 3) * 3 + 2] = arr[(o + 1) * 3 + 2];
      arr[(o + 4) * 3] = cx + dx * x1 + px2 * (b1 + w1);
      arr[(o + 4) * 3 + 1] = cy + dy * x1 + py2 * (b1 + w1);
      arr[(o + 4) * 3 + 2] = cz + dz * x1 + pz2 * (b1 + w1);
      arr[(o + 5) * 3] = arr[(o + 2) * 3];
      arr[(o + 5) * 3 + 1] = arr[(o + 2) * 3 + 1];
      arr[(o + 5) * 3 + 2] = arr[(o + 2) * 3 + 2];
    }
    void hx;
    void hy;
    void hz;
  }
  function writeBladeAttrs(soup, b, sweep2, alpha, width) {
    const o0 = b * soup.vertsPerBlade;
    const o1 = o0 + soup.vertsPerBlade;
    for (let i = o0; i < o1; i++) {
      soup.sweep[i] = sweep2;
      soup.alpha[i] = alpha;
      soup.width[i] = width;
    }
  }
  function scarSoup(n) {
    const geo = new BufferGeometry();
    const verts = Math.max(1, n) * 6;
    const pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const seed = new Float32Array(verts);
    const alpha = new Float32Array(verts);
    for (let b = 0; b < Math.max(1, n); b++) {
      const base = b * 6;
      const quads = [[0, 0], [1, 0], [0, 1], [1, 0], [1, 1], [0, 1]];
      for (let k = 0; k < 6; k++) {
        uv[(base + k) * 2] = quads[k][0];
        uv[(base + k) * 2 + 1] = quads[k][1];
      }
    }
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("uv", new BufferAttribute(uv, 2));
    geo.setAttribute("aSeed", new BufferAttribute(seed, 1));
    geo.setAttribute("aAlpha", new BufferAttribute(alpha, 1));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    return { geo, pos, seed, alpha, vertsPer: 6, n: Math.max(1, n) };
  }
  function writeScar(soup, b, cx, cy, cz, dx, dy, dz, px2, py2, pz2, len, halfW, aSeed, aAlpha) {
    const o = b * 6;
    const arr = soup.pos;
    const hl = len * 0.5;
    const corners = [[-hl, -halfW], [hl, -halfW], [-hl, halfW], [hl, -halfW], [hl, halfW], [-hl, halfW]];
    for (let k = 0; k < 6; k++) {
      const t = corners[k][0];
      const w = corners[k][1];
      const i = o + k;
      arr[i * 3] = cx + dx * t + px2 * w;
      arr[i * 3 + 1] = cy + dy * t + py2 * w;
      arr[i * 3 + 2] = cz + dz * t + pz2 * w;
      soup.seed[i] = aSeed;
      soup.alpha[i] = aAlpha;
    }
  }
  function mergeGeometries(list) {
    let vCount = 0;
    let iCount = 0;
    for (const g of list) {
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    }
    const position = new Float32Array(vCount * 3);
    const normal = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const index = new Uint32Array(iCount);
    let vo = 0;
    let io = 0;
    for (const g of list) {
      const p = g.attributes.position;
      const nAttr = g.attributes.normal;
      const uAttr = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        position[(vo + i) * 3] = p.getX(i);
        position[(vo + i) * 3 + 1] = p.getY(i);
        position[(vo + i) * 3 + 2] = p.getZ(i);
        if (nAttr) {
          normal[(vo + i) * 3] = nAttr.getX(i);
          normal[(vo + i) * 3 + 1] = nAttr.getY(i);
          normal[(vo + i) * 3 + 2] = nAttr.getZ(i);
        }
        if (uAttr) {
          uv[(vo + i) * 2] = uAttr.getX(i);
          uv[(vo + i) * 2 + 1] = uAttr.getY(i);
        }
      }
      if (g.index) {
        for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.getX(i) + vo;
        io += g.index.count;
      } else {
        for (let i = 0; i < p.count; i++) index[io + i] = i + vo;
        io += p.count;
      }
      vo += p.count;
    }
    const out = new BufferGeometry();
    out.setAttribute("position", new BufferAttribute(position, 3));
    out.setAttribute("normal", new BufferAttribute(normal, 3));
    out.setAttribute("uv", new BufferAttribute(uv, 2));
    out.setIndex(new BufferAttribute(index, 1));
    out.computeBoundingSphere();
    return out;
  }
  var GLSL_NOISE = `
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm2(vec2 p){
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float fbm3(vec3 p){
  float s = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++){ s += a * vnoise3(p); p *= 2.05; a *= 0.5; }
  return s;
}
`;
  var GLSL_FRESNEL = `
float fresnelTerm(vec3 N, vec3 V, float pw){
  return pow(clamp(1.0 - abs(dot(normalize(N), normalize(V))), 0.0, 1.0), pw);
}
`;
  var VERT_UV = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  var VERT_UV_POLAR = `
attribute vec2 aPolar;
varying vec2 vPolar;
void main(){
  vPolar = aPolar;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  var VERT_POLAR_ONLY = `
attribute vec2 aPolar;
varying vec2 vPolar;
void main(){
  vPolar = aPolar;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  var SHELL_VERT = `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosL = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
  var SHELL_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uHot;
uniform float uTime;
uniform float uAlpha;
uniform float uGlow;
uniform float uPulse;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
${GLSL_NOISE}
${GLSL_FRESNEL}
void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  float f = fresnelTerm(N, V, 2.4);
  float n = fbm3(normalize(vPosL) * 2.6 + vec3(0.0, uTime * 0.55, uTime * 0.31));
  vec3 col = mix(uColor, uColor2, smoothstep(0.15, 0.85, n));
  col = mix(col, uHot, smoothstep(0.55, 1.0, f * 0.75 + n * 0.35));
  col *= uGlow * (0.75 + 0.85 * f) * (0.85 + 0.30 * uPulse);
  gl_FragColor = vec4(col, uAlpha * clamp(f * 1.45 + 0.10, 0.0, 1.0));
}
`;
  /* 吸引盘（苍）：把「一圈亮斑」改成「有缝的螺旋吸积带」。
   * 旧版的问题是 alpha 峰值接近 1、颜色又亮，叠上外壳直接变成一整块青色大饼，
   * 角色和 HUD 全被盖住。新版：
   *   - 径向 alpha 只在一条中段环带里最强，越靠近球心越暗（中心保持剪影）
   *   - 用「细密螺旋缝隙」把环带切碎，肉眼能读出旋转方向
   *   - 峰值 alpha 压到 0.55 左右，颜色靠 uColorOut 的青蓝对比撑，不靠亮度撑
   */
  var DISK_FRAG = `
uniform vec3 uColorIn;
uniform vec3 uColorOut;
uniform float uTime;
uniform float uAlpha;
uniform float uSpin;
uniform float uGain;
varying vec2 vPolar;
${GLSL_NOISE}
void main(){
  float r = vPolar.x;
  float a = vPolar.y;
  // 内圈转得快、外圈转得慢 —— 差速旋转本身就是"方向感"
  float ang = a + uTime * uSpin * (0.55 + 1.65 / (0.25 + r * r));
  float streak = fbm2(vec2(ang * 4.2, r * 2.6 - uTime * 0.55));
  // 螺旋缝隙：两组不同密度的细带，把盘面切成可辨认的丝
  float gap1 = 0.5 + 0.5 * sin(ang * 13.0 + r * 9.0 - uTime * 1.4);
  float gap2 = 0.5 + 0.5 * sin(ang * 5.0 - r * 17.0 + uTime * 0.8);
  float band = smoothstep(0.28, 0.92, streak * 0.75 + gap1 * 0.35) * (0.45 + 0.75 * gap2);
  // 径向窗口：靠中心和最外缘都收掉，只在吸积带里显形
  float tin = smoothstep(0.02, 0.34, r);
  float tout = 1.0 - smoothstep(0.62, 1.0, r);
  float m = tin * tout;
  vec3 col = mix(uColorIn, uColorOut, smoothstep(0.1, 0.95, r));
  col *= uGain * (0.45 + 1.25 * band);
  gl_FragColor = vec4(col, clamp(m * (0.06 + 0.62 * band), 0.0, 0.72) * uAlpha);
}
`;
  var WARP_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
uniform float uPower;
varying vec2 vPolar;
${GLSL_NOISE}
void main(){
  float r = vPolar.x;
  float a = vPolar.y;
  float ang = a + uTime * (0.35 + 1.2 / (0.3 + r * r));
  float n = fbm2(vec2(ang * 2.1, r * 10.0 - uTime * 1.35));
  float n2 = fbm2(vec2(ang * 5.7 + 3.1, r * 5.0 + uTime * 0.70));
  float rings = 0.5 + 0.5 * sin(r * 26.0 - uTime * 3.4 + n * 5.0);
  float body = smoothstep(0.0, 0.22, r) * (1.0 - smoothstep(0.45, 1.0, r));
  float m = body * (0.30 + 0.85 * n) * (0.45 + 0.65 * rings);
  vec3 col = uColor * (0.75 + 1.35 * n2);
  col *= smoothstep(0.02, 0.34, r) * 1.25;
  gl_FragColor = vec4(col, clamp(m * uAlpha * uPower, 0.0, 1.0));
}
`;
  /* 无下限护盾的"皮层"：只画菲涅尔轮廓。
   * 旧版用 SHELL_FRAG，alpha 里带 0.10 的常量底 —— 正面朝向相机也有一层薄雾，
   * 叠上 3 层网格后五条悟整个人被封在一个青色胶囊里（Lead 在播片截图里看到的）。
   * 这里把正面贡献压到 0：朝相机的面几乎全透，只有轮廓处发光，
   * 角色本身永远看得见。
   */
  var INF_SKIN_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uHot;
uniform float uTime;
uniform float uAlpha;
uniform float uPulse;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
${GLSL_NOISE}
${GLSL_FRESNEL}
void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  float rim = fresnelTerm(N, V, 3.6);
  float shell = pow(rim, 1.5);
  float n = fbm3(normalize(vPosL) * 3.1 + vec3(0.0, uTime * 0.35, uTime * 0.2));
  vec3 col = mix(uColor, uColor2, clamp(rim * 1.15 + n * 0.25, 0.0, 1.0));
  col = mix(col, uHot, pow(rim, 3.0) * 0.45);
  float a = clamp(shell * 0.85 + n * rim * 0.30, 0.0, 1.0) * uAlpha * (0.92 + 0.08 * uPulse);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * (0.5 + 1.15 * a), a);
}
`;
  var CRACK_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uHot;
uniform float uTime;
uniform float uAlpha;
uniform float uPower;
uniform float uBlast;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
${GLSL_NOISE}
${GLSL_FRESNEL}
void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  float f = fresnelTerm(N, V, 2.0);
  vec3 sp = normalize(vPosL);
  float n = fbm3(sp * 3.1 + vec3(uTime * 0.35));
  float n2 = fbm3(sp * 6.7 - vec3(0.0, uTime * 0.90, uTime * 0.40));
  float ridge = 1.0 - abs(n * 2.0 - 1.0);
  float crack = smoothstep(0.62, 0.99, ridge * (0.65 + 0.55 * n2));
  float body = 0.30 + 0.95 * n;
  float flicker = 0.85 + 0.15 * sin(uTime * 21.0 + n * 12.0);
  vec3 col = mix(uColor, uColor2, smoothstep(0.25, 0.90, n2));
  // 只有"裂纹"本身发高热，其余保持深红 —— 旧版 uHot*2.6 会把整颗球烤成橙色火球
  col += uHot * crack * 0.75;
  col += uHot * pow(f, 1.8) * 0.28;
  col *= body * flicker * (0.62 + 0.55 * uPower);
  col = mix(col, vec3(1.0), uBlast * (0.45 + 0.35 * crack));
  gl_FragColor = vec4(col, clamp((0.20 + 0.85 * crack + 0.55 * f) * uAlpha, 0.0, 1.0));
}
`;
  var TEAR_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uHot;
uniform float uTime;
uniform float uAlpha;
uniform float uPower;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
${GLSL_NOISE}
${GLSL_FRESNEL}
void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  float f = fresnelTerm(N, V, 2.2);
  vec3 sp = normalize(vPosL);
  float warp = fbm3(sp * 2.2 + vec3(0.0, 0.0, uTime * 0.85));
  float tear = fbm3(sp * 5.3 + vec3(uTime * 1.15, -uTime * 0.80, 0.0) + warp * 1.6);
  float rip = smoothstep(0.55, 0.92, tear);
  float band = smoothstep(0.42, 0.62, abs(tear - 0.5) + 0.32 * f);
  vec3 col = mix(uColor, uColor2, rip);
  col = mix(col, uHot, band * 0.65);
  col *= (0.65 + 1.60 * f) * (0.80 + 0.55 * warp) * (0.65 + 0.75 * uPower);
  gl_FragColor = vec4(col, clamp((0.12 + 0.80 * rip + 0.70 * f) * uAlpha, 0.0, 1.0));
}
`;
  var BEAM_VERT = `
uniform float uGrow;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main(){
  vUv = uv;
  vec3 p = position;
  float head = 1.0 - uGrow;
  float k = clamp((uv.y - head) / 0.02, 0.0, 1.0);
  p.y = mix(head, uv.y, k);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
  var BEAM_FRAG = `
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uEdge;
uniform float uTime;
uniform float uAlpha;
uniform float uPower;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
${GLSL_NOISE}
${GLSL_FRESNEL}
void main(){
  float a = vUv.x * 6.2831853;
  float y = vUv.y;
  float flow = fbm2(vec2(a * 2.3, y * 9.0 - uTime * 7.5));
  float flow2 = fbm2(vec2(a * 5.1 + 1.7, y * 4.0 - uTime * 4.0));
  float core = smoothstep(0.55, 1.0, flow * 0.70 + flow2 * 0.55);
  vec3 col = mix(uEdge, uMid, smoothstep(0.10, 0.60, flow2));
  col = mix(col, uCore, core * 0.9);
  float f = fresnelTerm(vNormalW, vViewDir, 1.6);
  col += uEdge * f * 1.4;
  float headGlow = smoothstep(0.82, 1.0, y) * uPower;
  col += uCore * headGlow * 1.5;
  col *= (0.65 + 0.95 * uPower);
  gl_FragColor = vec4(col, clamp((0.38 + 0.80 * core + 0.50 * f) * uAlpha, 0.0, 1.0));
}
`;
  var LATTICE_VERT = `
uniform float uTime;
uniform float uLayer;
uniform vec3 uHit;
uniform float uHitT;
uniform float uDent;
varying vec3 vPosL;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main(){
  vec3 p = position;
  vec3 n = normalize(p);
  float w = sin(p.x * 8.0 + uTime * 1.7) * sin(p.y * 7.0 - uTime * 1.3) * sin(p.z * 9.0 + uTime * 2.1);
  float w2 = sin(p.x * 21.0 - uTime * 3.3) * sin(p.z * 19.0 + uTime * 2.6);
  p += n * ((w * 0.026 + w2 * 0.010) * (1.0 + uLayer * 0.4));
  vec3 hn = normalize(uHit);
  float d = dot(n, hn);
  float dd = max(0.0, 1.0 - d) * 5.5;
  float ang = acos(clamp(d, -1.0, 1.0));
  float dent = exp(-dd * dd) * uDent;
  float ripple = sin(ang * 26.0 - uTime * 11.0);
  float ga = ang * 3.4;
  float gate = exp(-ga * ga);
  p -= n * (dent * 0.22 + ripple * gate * uHitT * 0.09);
  vPosL = p;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * n);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
  var LATTICE_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uTime;
uniform float uAlpha;
uniform float uFreq;
uniform vec3 uHit;
uniform float uHitT;
varying vec3 vPosL;
varying vec3 vNormalW;
varying vec3 vViewDir;
${GLSL_FRESNEL}
void main(){
  vec3 p = normalize(vPosL);
  vec3 g = abs(fract(p * uFreq + vec3(0.0, uTime * 0.08, 0.0)) - 0.5);
  float lineX = 1.0 - smoothstep(0.0, 0.035, min(g.x, 1.0 - g.x));
  float lineY = 1.0 - smoothstep(0.0, 0.035, min(g.y, 1.0 - g.y));
  float lineZ = 1.0 - smoothstep(0.0, 0.035, min(g.z, 1.0 - g.z));
  float grid = clamp(lineX + lineY + lineZ, 0.0, 1.0);
  float f = fresnelTerm(vNormalW, vViewDir, 3.0);
  float d = dot(p, normalize(uHit));
  float dd2 = max(0.0, 1.0 - d) * 5.0;
  float hit = exp(-dd2 * dd2) * uHitT;
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + p.y * 6.0);
  vec3 col = mix(uColor, uColor2, grid);
  col += uColor2 * hit * 1.8;
  gl_FragColor = vec4(col * pulse, clamp((grid * 0.55 + f * 0.42 + 0.03 + hit * 0.55) * uAlpha, 0.0, 1.0));
}
`;
  var STAR_FRAG = `
uniform float uTime;
uniform float uAlpha;
uniform float uScale;
uniform vec3 uTint;
varying vec3 vPosL;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vPosL);
  float sw = sin(d.y * 3.2 + uTime * 0.14) * 0.5 + uTime * 0.035;
  float cs = cos(sw); float sn = sin(sw);
  vec3 r = vec3(d.x * cs - d.z * sn, d.y, d.x * sn + d.z * cs);
  vec3 col = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 3; i++){
    float sc = uScale * (28.0 + float(i) * 74.0);
    vec3 q = r * sc;
    vec3 id = floor(q);
    vec3 fp = fract(q) - 0.5;
    float h = hash13(id + float(i) * 17.3);
    float present = step(0.905 - float(i) * 0.018, h);
    // 注意：GLSL 规定 smoothstep 在 edge0 >= edge1 时结果未定义，故一律写成正向形式
    float star = present * (1.0 - smoothstep(0.0, 0.34, length(fp))) * (0.55 + 0.75 * h);
    float tw = 0.65 + 0.35 * sin(uTime * (2.1 + h * 4.0) + h * 40.0);
    col += uTint * star * tw;
    total += star;
  }
  float neb = fbm3(r * 2.4 + vec3(uTime * 0.03)) * 0.55;
  float neb2 = fbm3(r * 5.1 - vec3(uTime * 0.02)) * 0.35;
  col += vec3(0.05, 0.07, 0.16) * neb + vec3(0.10, 0.05, 0.14) * neb2;
  gl_FragColor = vec4(col, clamp(uAlpha * (0.30 + total * 0.9 + neb * 0.5), 0.0, 1.0));
}
`;
  var GALAXY_FRAG = `
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uSpin;
varying vec2 vPolar;
${GLSL_NOISE}
void main(){
  float r = vPolar.x;
  float a = vPolar.y;
  float arms = log(max(r, 0.035)) * 3.1 - a - uTime * uSpin;
  float sp = 0.5 + 0.5 * sin(arms * 2.0);
  float sp2 = 0.5 + 0.5 * sin(arms * 2.0 + 3.14159265);
  float dust = fbm2(vec2(arms * 2.6, r * 7.0 - uTime * 0.4));
  float inner = 1.0 - smoothstep(0.05, 1.0, r);
  float ring = smoothstep(0.03, 0.30, r) * (1.0 - smoothstep(0.55, 1.0, r));
  vec3 col = mix(uColorA, uColorB, sp * dust) * (0.35 + 1.45 * sp2 * dust);
  col += uColorA * inner * 1.6;
  gl_FragColor = vec4(col, clamp(ring * (0.30 + 0.85 * dust) * uAlpha, 0.0, 1.0));
}
`;
  var BONE_VERT = `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
void main(){
  vPosL = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
  var BONE_FRAG = `
uniform vec3 uBone;
uniform vec3 uBone2;
uniform vec3 uGlow;
uniform float uTime;
uniform float uAlpha;
uniform float uGrow;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
${GLSL_NOISE}
${GLSL_FRESNEL}
void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  float lam = dot(N, normalize(vec3(0.35, 0.90, 0.25)));
  float band = lam > 0.55 ? 1.0 : (lam > 0.05 ? 0.62 : 0.34);
  vec3 col = mix(uBone, uBone2, band);
  float vein = fbm3(vPosL * 3.4 + vec3(0.0, uTime * 0.22, 0.0));
  float glow = smoothstep(0.52, 0.95, vein);
  col = mix(col, uGlow, glow * 0.62);
  float f = fresnelTerm(N, V, 2.6);
  col += uGlow * f * 0.85;
  col *= mix(0.25, 1.0, uGrow);
  gl_FragColor = vec4(col, uAlpha);
}
`;
  var FOG_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uTime;
uniform float uAlpha;
varying vec2 vPolar;
${GLSL_NOISE}
void main(){
  float r = vPolar.x;
  float a = vPolar.y;
  float n = fbm2(vec2(a * 3.2 + uTime * 0.22, r * 5.5 - uTime * 0.35));
  float n2 = fbm2(vec2(a * 7.7 - uTime * 0.40, r * 2.2));
  float gap = 0.55 + 0.45 * sin(a * 3.0 + uTime * 0.35 + n * 4.0);
  float ring = smoothstep(0.10, 0.55, r) * (1.0 - smoothstep(0.62, 1.0, r));
  float m = ring * (0.30 + 0.95 * n) * gap * (0.45 + 0.70 * n2);
  vec3 col = mix(uColor, uColor2, n2);
  gl_FragColor = vec4(col, clamp(m * uAlpha, 0.0, 1.0));
}
`;
  var CRESCENT_VERT = `
attribute float aProg;
attribute float aSweep;
attribute float aAlpha;
attribute float aWidth;
varying vec2 vUv;
varying float vProg;
varying float vSweep;
varying float vA;
varying float vW;
void main(){
  vUv = uv;
  vProg = aProg;
  vSweep = aSweep;
  vA = aAlpha;
  vW = aWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  var CRESCENT_FRAG = `
uniform vec3 uColor;
uniform vec3 uHot;
varying vec2 vUv;
varying float vProg;
varying float vSweep;
varying float vA;
varying float vW;
void main(){
  float edge = abs(vUv.y - 0.5) * 2.0;
  float glow = 1.0 - smoothstep(0.06, 1.0, edge);       // 窄辉光
  // edge1 用 max(vW, 0.001) 兜底：smoothstep 在 edge0 == edge1 时同样未定义
  float core = 1.0 - smoothstep(0.0, max(vW, 0.001), edge);  // 极细白色内核
  // head 用 d*d 而不是 pow(d, 2.0)：GLSL 的 pow 在底数为负时结果未定义
  float head = exp(-(vProg - vSweep) * (vProg - vSweep) * 36.0);
  float g = glow * 0.55 + core * 1.70 + head * 2.00;
  vec3 col = mix(uColor, uHot, clamp(core + head * 0.8, 0.0, 1.0));
  gl_FragColor = vec4(col * g, clamp(g * vA, 0.0, 1.0));
}
`;
  var SCAR_VERT = `
attribute float aSeed;
attribute float aAlpha;
varying vec2 vUv;
varying float vSeed;
varying float vA;
void main(){
  vUv = uv;
  vSeed = aSeed;
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  var SCAR_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vA;
${GLSL_NOISE}
void main(){
  float edge = abs(vUv.y - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.02, 0.30, edge);
  float burst = 1.0 - smoothstep(0.25, 1.0, edge);
  float seg = vnoise(vec2(vUv.x * 26.0 + vSeed, vSeed * 3.1));
  float sp = step(0.42, seg);
  float flick = 0.70 + 0.50 * sin(uTime * 26.0 + seg * 30.0);
  vec3 col = mix(uColor, uColor2, sp);
  float a = (line * 1.40 + burst * 0.30 * sp) * flick * vA;
  gl_FragColor = vec4(col * (0.90 + line * 1.40), clamp(a, 0.0, 1.0));
}
`;
  var FLAME_FRAG = `
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uOuter;
uniform float uTime;
uniform float uAlpha;
varying vec3 vPosL;
varying vec3 vNormalW;
varying vec3 vViewDir;
${GLSL_NOISE}
${GLSL_FRESNEL}
void main(){
  vec3 sp = normalize(vPosL + vec3(0.0, 0.5, 0.0));
  float n = fbm3(sp * 4.5 + vec3(0.0, uTime * 3.4, uTime * 1.2));
  float n2 = fbm3(sp * 9.0 - vec3(uTime * 2.0, uTime * 4.5, 0.0));
  float heat = clamp(n * 0.75 + n2 * 0.55, 0.0, 1.0);
  vec3 col = mix(uOuter, uMid, smoothstep(0.20, 0.62, heat));
  col = mix(col, uCore, smoothstep(0.62, 0.98, heat));
  float f = fresnelTerm(vNormalW, vViewDir, 1.5);
  col += uOuter * f * 1.1;
  gl_FragColor = vec4(col * (1.0 + heat * 0.9), clamp((0.30 + heat * 0.85 + f * 0.40) * uAlpha, 0.0, 1.0));
}
`;
  var RIFT_FRAG = `
uniform vec3 uEdgeA;
uniform vec3 uEdgeB;
uniform vec3 uCore;
uniform float uTime;
uniform float uAlpha;
uniform float uOpen;
varying vec2 vUv;
${GLSL_NOISE}
void main(){
  float v = (vUv.y - 0.5) * 2.0;
  float h = abs(v) * uOpen;
  float body = 1.0 - smoothstep(0.86, 1.04, h);
  float e = smoothstep(0.74, 0.999, h) * step(h, 1.06);
  vec3 ecol = v < 0.0 ? uEdgeB : uEdgeA;
  float n = fbm2(vec2(vUv.x * 7.0 - uTime * 0.35, v * 34.0 + uTime * 0.90));
  float n2 = fbm2(vec2(vUv.x * 22.0 + uTime * 0.70, v * 9.0));
  float jag = 0.55 + 0.75 * n;
  // sin(π) 在浮点下可能是极小负数，pow 前先夹到非负，避免未定义行为
  float taper = pow(max(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 0.0), 0.22);
  vec3 col = uCore * (0.75 + 0.80 * n2);
  col += ecol * e * (1.90 + n * 1.60) * taper;
  float a = (body * 1.25 + e * 1.50 * jag) * uAlpha * taper;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;
  var CLASH_FRAG = `
uniform vec3 uCore;
uniform vec3 uA;
uniform vec3 uB;
uniform float uTime;
uniform float uTug;
uniform float uAlpha;
uniform float uWin;
varying vec2 vUv;
${GLSL_NOISE}
void main(){
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float a = atan(c.y, c.x);
  float n = fbm2(vec2(a * 2.4 + uTime * 0.55, r * 4.2 - uTime * 0.85));
  float n2 = fbm2(vec2(a * 6.1 - uTime * 1.20, r * 2.0 + uTime * 0.40));
  float boundary = 0.5 + uTug * 0.22 + (n - 0.5) * 0.30;
  float side = smoothstep(boundary - 0.06, boundary + 0.06, vUv.x + (n2 - 0.5) * 0.14);
  vec3 col = mix(uA, uB, side);
  // 同理用乘法代替 pow(x, 2.0)，x 可能为负
  float dh = (vUv.x - boundary) * 7.0;
  float hot = exp(-dh * dh) * (1.0 - smoothstep(0.30, 1.0, r));
  col = mix(col, uCore, clamp(hot, 0.0, 1.0));
  col *= 0.55 + 1.50 * n + 0.90 * (1.0 - smoothstep(0.40, 1.05, r));
  float win = clamp(uWin, 0.0, 1.0);
  col = mix(col, uA * 1.6, win * (1.0 - side));
  col = mix(col, uB * 1.6, win * side);
  float edge = 1.0 - smoothstep(0.72, 1.02, r);
  gl_FragColor = vec4(col, clamp((hot * 1.30 + edge * (0.42 + 0.50 * n)) * uAlpha, 0.0, 1.0));
}
`;
  var SPIRAL_VERT = `
uniform float uSize;
uniform float uPixelRatio;
attribute float aSeed;
attribute float aSize;
varying float vSeed;
varying float vFade;
void main(){
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFade = clamp(1.0 - (-mv.z) / 320.0, 0.15, 1.0);
  gl_PointSize = uSize * aSize * uPixelRatio * (140.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;
  var SPIRAL_FRAG = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAlpha;
uniform sampler2D uMap;
varying float vSeed;
varying float vFade;
void main(){
  float m = texture2D(uMap, gl_PointCoord).a;
  vec3 col = mix(uColorA, uColorB, fract(vSeed * 7.31));
  gl_FragColor = vec4(col * (0.60 + 1.40 * m), m * m * uAlpha * vFade);
}
`;
  var RIPPLE_FRAG = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;
uniform float uAlpha;
uniform float uPower;
uniform float uSeed;
varying vec2 vPolar;
void main(){
  float r = vPolar.x;
  float a = vPolar.y;
  float m = 0.0;
  float bright = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float ph = fract(uTime * 0.85 + fi * 0.25 + uSeed);
    float w = 0.022 + 0.055 * ph;
    float d = (r - ph) / w;
    float ring = exp(-d * d) * (1.0 - ph);
    m += ring;
    bright += ring * (0.6 + 0.6 * fi * 0.25);
  }
  // 角向断续，避免死板的完美圆环
  float cut = 0.55 + 0.45 * sin(a * 7.0 + uTime * 1.6);
  vec3 col = mix(uColorA, uColorB, clamp(m, 0.0, 1.0));
  gl_FragColor = vec4(col * (0.6 + 1.6 * bright) * uPower, clamp(m * cut * uAlpha, 0.0, 1.0));
}
`;
  var BAND_VERT = `
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main(){
  vUv = uv;
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  var SLASHBAND_FRAG = `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
varying float vA;
${GLSL_NOISE}
void main(){
  float t = vUv.x;
  float across = abs(vUv.y - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.05, 0.45, across);
  float taper = pow(max(sin(clamp(t, 0.0, 1.0) * 3.14159265), 0.0), 0.7);
  float n = vnoise(vec2(t * 18.0, uTime * 2.0));
  float m = line * taper * (0.55 + 0.75 * n) * vA;
  gl_FragColor = vec4(uColor * (0.80 + 1.50 * m), clamp(m * uAlpha, 0.0, 1.0));
}
`;
  var BOLT_VERT = `
attribute float aDim;
varying vec3 vCol;
void main(){
  vCol = color * aDim;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  var BOLT_FRAG = `
varying vec3 vCol;
void main(){
  gl_FragColor = vec4(vCol, 1.0);
}
`;
  var VOID_FLOW_VERT = `
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform float uR;
attribute float aSeed;
attribute float aSize;
attribute float aPhase;
attribute float aBand;
varying float vSeed;
varying float vAlpha;
void main(){
  vSeed = aSeed;
  // ph: 0 = 贴着球壁, 1 = 落入球心
  float ph = fract(uTime * (0.16 + aSeed * 0.26) + aPhase);
  float r = uR * (0.60 + 0.38 * aSeed) * (1.0 - 0.96 * ph);
  float ang = aPhase * 6.2831853 + uTime * (0.30 + aSeed * 0.55) + ph * 2.4;
  float cb = cos(aBand);
  vec3 p = vec3(cos(ang) * cb, sin(aBand), sin(ang) * cb) * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // 两端淡入淡出，避免碎光在球壁 / 球心「凭空出现」
  vAlpha = smoothstep(0.0, 0.10, ph) * (1.0 - smoothstep(0.62, 1.0, ph));
  gl_PointSize = uSize * aSize * uPixelRatio * (140.0 / max(1.0, -mv.z));
}
`;
  var VOID_FLOW_FRAG = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAlpha;
uniform sampler2D uMap;
varying float vSeed;
varying float vAlpha;
void main(){
  float m = texture2D(uMap, gl_PointCoord).a;
  vec3 col = mix(uColorA, uColorB, fract(vSeed * 7.31));
  gl_FragColor = vec4(col * (0.55 + 1.45 * m), m * m * uAlpha * vAlpha);
}
`;
  function countVisibleDrawables(obj, acc) {
    if (obj.visible === false) return acc;
    if (obj.isMesh || obj.isPoints || obj.isLine || obj.isLineSegments) {
      acc.objects++;
      if (obj.material) acc.materials.add(obj.material);
    }
    const ch = obj.children;
    for (let i = 0; i < ch.length; i++) countVisibleDrawables(ch[i], acc);
    return acc;
  }
  function createWeapons(scene2, fx2, opts) {
    const Q = resolveQ(opts && opts.quality);
    const fxc = fx2 || null;
    const rand2 = mulberry322(6221079);
    const DPR = Math.min(2, typeof window !== "undefined" && window.devicePixelRatio || 1);
    const active = [];
    const pools = /* @__PURE__ */ new Map();
    const ownedGeos = [];
    const matRegistry = /* @__PURE__ */ new Set();
    const matPools = /* @__PURE__ */ new Map();
    const geoCache = /* @__PURE__ */ new Map();
    let disposed = false;
    let warmed = false;
    const _v14 = new Vector3();
    const _v24 = new Vector3();
    const _v34 = new Vector3();
    const _m4 = new Matrix4();
    const call = (name, arg) => {
      if (!fxc) return;
      const f = fxc[name];
      if (typeof f === "function") {
        try {
          f.call(fxc, arg);
        } catch (e) {
        }
      }
    };
    const cachedGeo = (key, build) => {
      let g = geoCache.get(key);
      if (!g) {
        g = build();
        ownedGeos.push(g);
        geoCache.set(key, g);
      }
      return g;
    };
    const geoSphere = (r) => cachedGeo(`sphere:${r.toFixed(4)}`, () => new SphereGeometry(r, Q.sphereSeg, Math.max(8, Q.sphereSeg >> 1)));
    const geoRing = (inner, outer, phi) => cachedGeo(`ring:${inner.toFixed(3)}:${outer.toFixed(3)}:${phi}`, () => addPolar(new RingGeometry(inner, outer, Q.ringSeg, phi)));
    const geoCyl = () => cachedGeo("cyl", () => new CylinderGeometry(1, 1, 1, Q.cylSeg, 6, true));
    const geoQuad = () => cachedGeo("quad", () => new PlaneGeometry(1, 1));
    const geoIco = (detail) => cachedGeo(`ico:${detail}`, () => new IcosahedronGeometry(1, detail));
    const geoCone = () => cachedGeo("cone", () => new ConeGeometry(0.55, 2.1, Q.cylSeg >> 1, 3, false));
    const geoRift = () => cachedGeo("rift", () => new PlaneGeometry(1, 220, 1, 12));
    const acquire = (key, make) => {
      let p = pools.get(key);
      if (!p) {
        p = { free: [], all: [] };
        pools.set(key, p);
      }
      if (p.free.length) return p.free.pop();
      const o = make();
      if (o) o._poolKey = key;
      p.all.push(o);
      return o;
    };
    const poolRelease = (key, obj) => {
      const p = pools.get(key);
      if (p) p.free.push(obj);
    };
    const releaseAll = () => {
      for (const p of pools.values()) {
        p.free = p.all.slice();
        for (const o of p.all) {
          if (o) o._released = true;
        }
      }
    };
    const launch = (h) => {
      if (h.object && scene2 && !h.object.parent) scene2.add(h.object);
      active.push(h);
      return h;
    };
    const spawnPooled = (key, build, cfg2) => {
      const h = acquire(key, build);
      h._released = false;
      for (const m of h._mats) matMarkBusy(m);
      h.apply(cfg2);
      return launch(h);
    };
    const matAcquire = (key, make) => {
      let arr = matPools.get(key);
      if (!arr) {
        arr = [];
        matPools.set(key, arr);
      }
      for (let i = 0; i < arr.length; i++) {
        const entry = arr[i];
        if (!entry.busy) {
          entry.busy = true;
          return entry.mat;
        }
      }
      const mat = make();
      matRegistry.add(mat);
      arr.push({ mat, busy: true });
      return mat;
    };
    const matFree = (mat) => {
      if (!mat) return;
      for (const arr of matPools.values()) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].mat === mat) {
            arr[i].busy = false;
            return;
          }
        }
      }
    };
    const matMarkBusy = (mat) => {
      if (!mat) return;
      for (const arr of matPools.values()) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].mat === mat) {
            arr[i].busy = true;
            return;
          }
        }
      }
    };
    function voidInfoTexture() {
      const key = "void:info";
      let tex = TEX_CACHE.get(key);
      if (tex) return tex;
      const S = 1024;
      const cv = document.createElement("canvas");
      cv.width = S;
      cv.height = S;
      const x = cv.getContext("2d");
      x.fillStyle = "#000000";
      x.fillRect(0, 0, S, S);
      const chars = "無量空処情報無限五条悟呪術師領域展開必中効果∞Ω◯△".split("");
      x.textBaseline = "middle";
      for (let i = 0; i < 900; i++) {
        const fs = 10 + Math.random() * 30;
        x.font = `${fs.toFixed(0)}px "Noto Sans SC","Microsoft YaHei",monospace`;
        const r = 200 + Math.random() * 55 | 0;
        const g2 = 220 + Math.random() * 35 | 0;
        x.fillStyle = `rgba(${r},${g2},255,${(0.2 + Math.random() * 0.8).toFixed(2)})`;
        x.fillText(chars[Math.random() * chars.length | 0], Math.random() * S, Math.random() * S);
      }
      x.save();
      x.translate(S / 2, S / 2);
      for (let i = 0; i < 30; i++) {
        x.strokeStyle = `rgba(190,220,255,${(0.06 + Math.random() * 0.22).toFixed(2)})`;
        x.lineWidth = 0.5 + Math.random() * 2.5;
        x.beginPath();
        x.arc(0, 0, 20 + i * 15, 0, Math.PI * 2);
        x.stroke();
      }
      for (let i = 0; i < 160; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = Math.random() * 120;
        const r1 = r0 + 60 + Math.random() * 380;
        x.strokeStyle = `rgba(220,235,255,${(0.05 + Math.random() * 0.25).toFixed(2)})`;
        x.lineWidth = 0.4 + Math.random() * 1.6;
        x.beginPath();
        x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        x.stroke();
      }
      x.restore();
      tex = new CanvasTexture(cv);
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.repeat.set(2, 1);
      tex.colorSpace = SRGBColorSpace;
      tex.needsUpdate = true;
      TEX_CACHE.set(key, tex);
      return tex;
    }
    class Handle {
      constructor() {
        this.alive = false;
        this.t = 0;
        this.life = 1;
        this.object = null;
        this._ended = false;
        this._onEnd = null;
        this._mats = /* @__PURE__ */ new Set();
        this._poolKey = null;
        this._released = false;
        this._winner = void 0;
      }
      /** 登记一个材质（会在结束时归还材质池） */
      use(mat) {
        if (mat) this._mats.add(mat);
        return mat;
      }
      /** 结束（幂等）：先回收，再触发一次 onEnd */
      finish() {
        if (this._ended) return;
        this._ended = true;
        this.alive = false;
        this.onKilled();
        const cb = this._onEnd;
        this._onEnd = null;
        if (cb) {
          try {
            cb(this._winner);
          } catch (e) {
          }
        }
      }
      /** 幂等 kill */
      kill() {
        this.finish();
      }
      /** 回收：摘出场景 + 归还材质 + 归还对象池（幂等；_mats 需保留供复用时重新占用） */
      onKilled() {
        if (this._released) return;
        this._released = true;
        if (this.object && this.object.parent) this.object.parent.remove(this.object);
        for (const m of this._mats) matFree(m);
        if (this._poolKey) poolRelease(this._poolKey, this);
      }
      setPos() {
      }
      setPath() {
      }
      update() {
      }
    }
    const BLUE_R = 2.9;
    /* ==========================================================================
     * 术式顺转「苍」 —— 引力球
     *
     * 旧版是一颗 2.9m 的球外面套三层加法壳（shell 1.35 倍亮 + 满强度吸积盘 +
     * 满强度空间扭曲环），三层叠在一起变成一整块青色大饼：
     * 球心、吸积盘的丝、旋转方向全部糊没，屏幕中间还过曝。
     *
     * 新版按「形体 / 方向 / 层次」三层来搭：
     *   暗核   —— 球心是一块实心深蓝黑，玩家能看见"这里有个球"
     *   锐边环 —— 一圈很细很亮的环，勾出球的轮廓（形体）
     *   吸积盘 —— 有螺旋缝隙的中段环带，差速旋转（方向：往中心收）
     *   吸入丝 —— 从外向内收的粒子流 + 被吞进去的碎片（方向：往中心收）
     *   扭曲环 —— 很淡的背景折射雾，只做"空间被吸"的暗示（层次）
     * 峰值亮度整体砍到旧版的 ~45%，靠结构与色彩对比而不是靠亮度抢画面。
     * ======================================================================== */
    function createBlue(cfg2) {
      const R = BLUE_R;
      const g = new Group();
      g.position.copy(cfg2.pos);
      // 暗核：深蓝黑，不是纯黑（纯黑在夜街上会显得像 bug 洞）
      const core = new Mesh(geoSphere(R * 0.97), matAcquire("blue:core", () => new MeshBasicMaterial({ color: 197662 })));
      g.add(core);
      // 外壳：SHELL_FRAG 由 fresnel 主导，这里只负责"边缘发光 + 表面流动"
      const shell = new Mesh(geoSphere(R * 1.42), matAcquire("blue:shell", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.AZURE) },
          uColor2: { value: new Color(C.CYAN) },
          uHot: { value: new Color(C.WHITE) },
          uTime: { value: 0 },
          uAlpha: { value: 0.5 },
          uGlow: { value: 0.78 },
          uPulse: { value: 0 }
        },
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
      })));
      g.add(shell);
      // 锐边环：极细的一圈，是"形体"的主要来源
      const rim = new Mesh(geoRing(R * 1.0, R * 1.085, 3), matAcquire("blue:rim", () => new ShaderMaterial({
        uniforms: {
          uColorA: { value: new Color(C.CYAN) },
          uColorB: { value: new Color(C.WHITE) },
          uTime: { value: 0 },
          uAlpha: { value: 0 },
          uPower: { value: 0.55 },
          uSeed: { value: 3.1 }
        },
        vertexShader: VERT_UV_POLAR,
        fragmentShader: RIPPLE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      g.add(rim);
      // 吸积盘：中段环带 + 螺旋缝隙；亮度靠 uGain 控制，不吃满屏
      const disk = new Mesh(geoRing(R * 1.12, R * 2.72, 4), matAcquire("blue:disk", () => new ShaderMaterial({
        uniforms: {
          uColorIn: { value: new Color(C.CYAN) },
          uColorOut: { value: new Color(C.AZURE) },
          uTime: { value: 0 },
          uAlpha: { value: 0.85 },
          uSpin: { value: 1.35 },
          uGain: { value: 0.62 }
        },
        vertexShader: VERT_UV_POLAR,
        fragmentShader: DISK_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      g.add(disk);
      // 空间扭曲雾：极淡，只在外围做层次
      const warp = new Mesh(geoRing(R * 1.2, R * 3.4, 3), matAcquire("blue:warp", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.AZURE) },
          uTime: { value: 0 },
          uAlpha: { value: 0.4 },
          uPower: { value: 1 }
        },
        vertexShader: VERT_UV_POLAR,
        fragmentShader: WARP_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      g.add(warp);
      const pCount = Q.diskParticles;
      const src = cachedGeo(`spiralSeed:${pCount}`, () => {
        const geo = new BufferGeometry();
        const seed = new Float32Array(pCount);
        const size = new Float32Array(pCount);
        for (let i = 0; i < pCount; i++) {
          seed[i] = rand2();
          size[i] = 0.5 + rand2() * 1.1;
        }
        geo.setAttribute("position", new BufferAttribute(new Float32Array(pCount * 3), 3));
        geo.setAttribute("aSeed", new BufferAttribute(seed, 1));
        geo.setAttribute("aSize", new BufferAttribute(size, 1));
        geo.boundingSphere = new Sphere(new Vector3(), 1e5);
        return geo;
      });
      const ownGeo = new BufferGeometry();
      ownGeo.setAttribute("position", new BufferAttribute(new Float32Array(pCount * 3), 3));
      ownGeo.setAttribute("aSeed", src.attributes.aSeed);
      ownGeo.setAttribute("aSize", src.attributes.aSize);
      ownGeo.boundingSphere = new Sphere(new Vector3(), 1e5);
      ownedGeos.push(ownGeo);
      const particles = new Points(ownGeo, matAcquire("blue:points", () => new ShaderMaterial({
        uniforms: {
          uSize: { value: 1.6 },
          uPixelRatio: { value: DPR },
          uColorA: { value: new Color(C.CYAN) },
          uColorB: { value: new Color(C.AZURE) },
          uAlpha: { value: 1 },
          uMap: { value: pointTexture() }
        },
        vertexShader: SPIRAL_VERT,
        fragmentShader: SPIRAL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
      })));
      particles.frustumCulled = false;
      g.add(particles);
      const orbit = new Float32Array(pCount * 4);
      for (let i = 0; i < pCount; i++) {
        orbit[i * 4] = R * (3.9 + rand2() * 2.6);
        orbit[i * 4 + 1] = rand2() * Math.PI * 2;
        orbit[i * 4 + 2] = 0.55 + rand2() * 1.5;
        orbit[i * 4 + 3] = (rand2() - 0.5) * 0.42;
      }
      const pArr = ownGeo.attributes.position.array;
      const h = new Handle();
      h.object = g;
      h._dir = new Vector3(0, 1, 0);
      h._onTick = null;
      h.use(core.material);
      h.use(shell.material);
      h.use(rim.material);
      h.use(disk.material);
      h.use(warp.material);
      h.use(particles.material);
      h.setPos = (p) => {
        g.position.copy(p);
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = c.onEnd || null;
        h._onTick = c.onTick || null;
        g.position.copy(c.pos);
        h._dir.copy(c.dir);
        if (h._dir.lengthSq() < 1e-8) h._dir.set(0, 1, 0);
        h._dir.normalize();
        g.quaternion.setFromUnitVectors(_v14.set(0, 0, 1), h._dir);
        h.t = 0;
        h._ended = false;
        h.alive = true;
        shell.material.uniforms.uAlpha.value = 0.5;
        rim.material.uniforms.uAlpha.value = 0;
        disk.material.uniforms.uAlpha.value = 0.85;
        warp.material.uniforms.uAlpha.value = 0.4;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const pulse = Math.sin(h.t * 3.3) * 0.5 + Math.sin(h.t * 7.1) * 0.22;
        const su = shell.material.uniforms;
        su.uTime.value = h.t;
        su.uPulse.value = pulse;
        su.uAlpha.value = 0.5 * (1 - Math.pow(k, 3.5)) * (0.85 + 0.2 * pulse);
        // 锐边环：出现时"啪"一下点亮，然后维持一个稳定的轮廓亮度
        const ru = rim.material.uniforms;
        ru.uTime.value = h.t;
        ru.uAlpha.value = (0.55 + 0.45 * Math.min(1, h.t / 0.12)) * (1 - Math.pow(k, 2.2)) * (0.9 + 0.1 * pulse);
        rim.scale.setScalar(1 + 0.012 * pulse);
        disk.material.uniforms.uTime.value = h.t;
        disk.material.uniforms.uAlpha.value = 0.85 * (1 - Math.pow(k, 3));
        // 吸积盘越到后期收得越紧（被球心吞进去）
        disk.scale.setScalar(1 - 0.18 * Math.pow(k, 1.6));
        warp.material.uniforms.uTime.value = h.t;
        warp.material.uniforms.uAlpha.value = 0.4 * (1 - Math.pow(k, 2.4));
        const sc = 1 + pulse * 0.035 * (1 - k);
        core.scale.setScalar(sc);
        shell.scale.setScalar(sc * (1 + 0.05 * Math.sin(h.t * 5)));
        for (let i = 0; i < pCount; i++) {
          const r0 = orbit[i * 4];
          const a0 = orbit[i * 4 + 1];
          const sp = orbit[i * 4 + 2];
          const tl = orbit[i * 4 + 3];
          const f = (h.t * 0.42 * sp + i * 0.137 % 1) % 1;
          const r = r0 * (1 - f) + R * 0.55 * f + 1e-3;
          const a = a0 + h.t * (1.35 + 2.9 / (0.4 + r * 0.35));
          const y = Math.sin(f * 6 + a0 * 3) * r * tl * (1 - f * 0.85);
          pArr[i * 3] = Math.cos(a) * r;
          pArr[i * 3 + 1] = y;
          pArr[i * 3 + 2] = Math.sin(a) * r;
        }
        ownGeo.attributes.position.needsUpdate = true;
        particles.material.uniforms.uAlpha.value = 1 - Math.pow(k, 3);
        if (h._onTick) {
          try {
            h._onTick(dt);
          } catch (e) {
          }
        }
        if (h.t >= h.life) h.finish();
      };
      return h;
    }
    /* ==========================================================================
     * 术式反转「赫」 —— 斥力冲击
     *
     * 旧版的问题：一颗球 + 一个 4.6R 的大环 + 满强度加壳，飞出时屏幕右侧直接
     * 被青白色冲爆（基线截图 base-03 就是这个），既看不出"斥力"，也看不出往哪飞。
     *
     * 新版把"斥力"拆成能读出来的几何：
     *   局部坐标约定：+Z = 运动方向（apply() 里把 group 的 +Z 对齐到 dir）
     *   ① 暗核     —— 深红黑实心球，球心永远不是发光点，剪影清楚
     *   ② 裂纹壳   —— 只画裂纹与边缘（CRACK_FRAG 调暗后），球体有质感
     *   ③ 斥力面   —— 核心前方一片"活塞面"（局部 XY 平面的环），法线朝运动方向
     *   ④ 尾锥     —— 核心后方 3 圈逐渐放大的环，越远越淡：像锥形的压力波拖尾
     *   ⑤ 爆炸     —— 方向性火花（沿运动方向喷）+ 冲击环 + 地面扬尘 + 克制闪光
     * 亮度整体比旧版低一个档次，但结构清楚 10 倍。
     * ======================================================================== */
    function createRed(cfg2) {
      const R = 1.62;
      const g = new Group();
      g.position.copy(cfg2.pos);
      // ① 暗核：深红黑，球心是实体不是发光点
      const core = new Mesh(geoSphere(R * 0.92), matAcquire("red:core", () => new MeshBasicMaterial({ color: 1245728 })));
      g.add(core);
      // ② 裂纹壳：主色保持深红，只有裂纹末端发白热（旧版整颗被烤成橙色火球）
      const shell = new Mesh(geoSphere(R * 1.18), matAcquire("red:shell", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.SCARLET) },
          uColor2: { value: new Color(C.CRIMSON) },
          uHot: { value: new Color(16743002) },
          uTime: { value: 0 },
          uAlpha: { value: 0.44 },
          uPower: { value: 1 },
          uBlast: { value: 0 }
        },
        vertexShader: SHELL_VERT,
        fragmentShader: CRACK_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
      })));
      g.add(shell);
      // ③ 斥力面：局部 XY 平面 → 法线正好是运动方向，"顶着前面推"的感觉
      const pushMat = () => new ShaderMaterial({
        uniforms: {
          uColorA: { value: new Color(C.SCARLET) },
          uColorB: { value: new Color(16762580) },
          uTime: { value: 0 },
          uAlpha: { value: 0 },
          uPower: { value: 1 },
          uSeed: { value: 0.7 }
        },
        vertexShader: VERT_UV_POLAR,
        fragmentShader: RIPPLE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      });
      const plate = new Mesh(geoRing(R * 0.5, R * 1.7, 3), matAcquire("red:plate", pushMat));
      plate.position.set(0, 0, R * 0.62);
      g.add(plate);
      // ④ 尾锥：3 圈环，尺寸递增、亮度递减
      const hoops = [];
      for (let i = 0; i < 3; i++) {
        const m = new Mesh(geoRing(R * (0.9 + i * 0.35), R * (1.25 + i * 0.5), 3), matAcquire("red:hoop" + i, pushMat));
        m.rotation.x = Math.PI / 2;
        m.position.set(0, 0, -R * (0.7 + i * 1.1));
        g.add(m);
        hoops.push(m);
      }
      const h = new Handle();
      h.object = g;
      h._follow = null;
      h._power = 1;
      h.use(core.material);
      h.use(shell.material);
      h.use(plate.material);
      for (const m of hoops) h.use(m.material);
      // 运动方向：由 setPos 的位置差推导，爆发时用来做"沿飞行方向的锥形火花"
      h._dirVec = new Vector3(0, 0, -1);
      h.setPos = (p) => {
        _v24.copy(p).sub(g.position);
        if (_v24.lengthSq() > 1e-6) h._dirVec.copy(_v24).normalize();
        g.position.copy(p);
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = c.onEnd || null;
        h._follow = c.follow || null;
        h._power = clampNum(c.power, 0.55, 2.2, 1);
        g.scale.setScalar(0.6 + 0.65 * h._power);
        g.position.copy(c.pos);
        shell.material.uniforms.uBlast.value = 0;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        if (h._follow && h._follow.getWorldPosition) {
          h._follow.getWorldPosition(_v14);
          g.position.copy(_v14);
        }
        const pw = h._power;
        const u = shell.material.uniforms;
        u.uTime.value = h.t;
        u.uPower.value = pw;
        /* --- 蓄势 → 爆发 ---
         * 前段（life 的 0~78%）是"压缩"：外壳轻微脉动、斥力面收紧，
         * 末段 0.22s 是"炸开"：斥力面猛地放大，尾锥一圈圈甩出去。
         */
        const blastDur = 0.22;
        const bt = (h.t - (h.life - blastDur)) / blastDur;
        const blasting = bt >= 0;
        const bt01 = blasting ? Math.min(1, Math.max(0, bt)) : 0;
        u.uBlast.value = blasting ? bt01 * 1.6 : 0;
        const scale = blasting ? 1 + bt01 * 0.6 : 1 + Math.sin(h.t * 4.2) * 0.03;
        shell.scale.setScalar(scale);
        core.scale.setScalar(scale * (blasting ? 1 + bt01 * 0.9 : 1));
        // 外壳亮度：满强度只留给爆发那一瞬，之前维持在 0.62 以下（保护剪影）
        u.uAlpha.value = (0.3 + 0.34 * pw) * (blasting ? 1 - bt01 * 0.25 : 1 - Math.pow(k, 3) * 0.35);
        // ③ 斥力面：贴着核心前方，爆发瞬间向外扩一圈
        const pu = plate.material.uniforms;
        pu.uTime.value = h.t;
        pu.uPower.value = pw;
        pu.uAlpha.value = (blasting ? 0.95 : 0.66 + 0.1 * Math.sin(h.t * 9)) * (1 - Math.pow(k, 5)) * pw;
        plate.scale.setScalar(1 + bt01 * 0.85);
        // ④ 尾锥：三圈依次放大、越远越淡，形成清晰的"拖尾方向"
        for (let i = 0; i < hoops.length; i++) {
          const m = hoops[i];
          const hu = m.material.uniforms;
          const phase = 1 - Math.pow(k, 2.2);
          hu.uTime.value = h.t + i * 0.35;
          hu.uPower.value = pw * 0.8;
          hu.uAlpha.value = (blasting ? 0.72 - i * 0.16 : 0.46 - i * 0.11) * phase;
          const wob = 1 + 0.06 * Math.sin(h.t * 7.5 - i * 0.9);
          m.scale.setScalar(wob * (1 + bt01 * (0.35 + i * 0.25)));
        }
        if (h.t >= h.life) {
          /* --- 爆发：方向性冲击 ---
           * 斥力的"方向"由三件事共同表达：
           *   1) 沿运动方向喷出的锥形火花（hitSpark 的 dir 参数）
           *   2) 垂直于运动方向的冲击环（默认朝向 +Z 的环，正好是"迎面推开"的平面）
           *   3) 贴地时踢起的一圈扬尘
           */
          call("shockwave", {
            pos: g.position,
            radius: R * 1.2 * pw,
            maxRadius: R * (7 + 5 * pw),
            life: 0.5,
            color: C.SCARLET,
            color2: C.GOLD,
            thickness: 0.85,
            ringCount: Q.name === "low" ? 0 : 2,
            bright: 0.9
          });
          call("hitSpark", {
            pos: g.position,
            dir: h._dirVec || null,
            color: C.SCARLET,
            color2: C.GOLD,
            count: Q.name === "low" ? 12 : 34,
            size: 0.85,
            speed: 26 * pw,
            life: 0.6,
            spread: 0.7
          });
          call("groundRing", {
            pos: { x: g.position.x, y: 0.03, z: g.position.z },
            radius: R * 0.5,
            maxRadius: R * (2.0 + pw * 0.6),
            life: 0.45,
            color: C.SCARLET,
            color2: C.CRIMSON,
            thickness: 0.3,
            bright: 0.42,
            // soft 决定"环有多粗"：0.6 会糊成一个实心圆盘，0.26 才是干净的一道灼痕
            soft: 0.26
          });
          h.finish();
        }
      };
      return h;
    }
    function makePurpleOrb(cfg2) {
      const g = new Group();
      g.position.copy(cfg2.from);
      const R = 4.2;
      const core = new Mesh(geoSphere(R * 1.05), matAcquire("purple:core", () => new MeshBasicMaterial({ color: 0 })));
      g.add(core);
      const shell = new Mesh(geoSphere(R * 1.42), matAcquire("purple:shell", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.VIOLET) },
          uColor2: { value: new Color(6953936) },
          uHot: { value: new Color(15784191) },
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uPower: { value: 1 }
        },
        vertexShader: SHELL_VERT,
        fragmentShader: TEAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
      })));
      g.add(shell);
      const ARC_SEG = 20;
      const ARC_N = 3;
      const arcGeo = new BufferGeometry();
      arcGeo.setAttribute("position", new BufferAttribute(new Float32Array(ARC_N * ARC_SEG * 6), 3));
      arcGeo.boundingSphere = new Sphere(new Vector3(), 1e5);
      ownedGeos.push(arcGeo);
      const arcLines = new LineSegments(arcGeo, matAcquire("purple:arc", () => new LineBasicMaterial({
        color: new Color(14725375),
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false
      })));
      arcLines.frustumCulled = false;
      g.add(arcLines);
      const arcSeed = new Float32Array(ARC_N);
      for (let a = 0; a < ARC_N; a++) arcSeed[a] = rand2();
      const arcArr = arcGeo.attributes.position.array;
      const arcPts = new Float32Array(ARC_N * (ARC_SEG + 1) * 3);
      const h = new Handle();
      h.object = g;
      h._from = new Vector3();
      h._to = new Vector3();
      h._power = 1;
      h._impacted = false;
      h._onImpact = null;
      h.use(core.material);
      h.use(shell.material);
      h.use(arcLines.material);
      h.setPos = (p) => {
        g.position.copy(p);
      };
      h.setPath = (a, b) => {
        h._from.copy(a);
        h._to.copy(b);
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = null;
        h._onImpact = c.onImpact || null;
        h._impacted = false;
        h._power = clampNum(c.power, 0.5, 1.5, 1);
        h._from.copy(c.from);
        h._to.copy(c.to);
        g.position.copy(c.from);
        g.quaternion.identity();
        shell.material.uniforms.uPower.value = h._power;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const flyK = smoothstep01(0.32, 0.92, k);
        _v14.copy(h._from).lerp(h._to, flyK);
        g.position.copy(_v14);
        const u = shell.material.uniforms;
        u.uTime.value = h.t;
        u.uAlpha.value = (1 - Math.pow(k, 6)) * (0.85 + 0.15 * Math.sin(h.t * 9));
        const grow = 0.45 + 0.55 * smoothstep01(0, 0.32, k) * (0.6 + 0.6 * h._power);
        g.scale.setScalar(grow);
        core.scale.setScalar(1 + Math.sin(h.t * 6.1) * 0.05);
        for (let a = 0; a < ARC_N; a++) {
          const seed = arcSeed[a];
          const ph = h.t * (3 + a * 1.4) + a * 2.1;
          const base = a * (ARC_SEG + 1) * 3;
          for (let i = 0; i <= ARC_SEG; i++) {
            const tt = i / ARC_SEG;
            const ang = ph + tt * Math.PI * 2;
            const rad = R * 1.5 * (1 + 0.16 * Math.sin(tt * 9 + ph * 2));
            const jag = 0.35 * Math.sin(tt * 21 + seed * 30 + ph * 3) * (1 - tt);
            arcPts[base + i * 3] = Math.cos(ang) * rad * (1 + jag);
            arcPts[base + i * 3 + 1] = Math.sin(tt * Math.PI) * R * 1.1 - R * 0.5 + jag * R * 0.4;
            arcPts[base + i * 3 + 2] = Math.sin(ang) * rad * (1 - jag);
          }
        }
        for (let a = 0; a < ARC_N; a++) {
          const base = a * (ARC_SEG + 1) * 3;
          const out = a * ARC_SEG * 6;
          for (let i = 0; i < ARC_SEG; i++) {
            const s0 = base + i * 3;
            const s1 = base + (i + 1) * 3;
            const o = out + i * 6;
            arcArr[o] = arcPts[s0];
            arcArr[o + 1] = arcPts[s0 + 1];
            arcArr[o + 2] = arcPts[s0 + 2];
            arcArr[o + 3] = arcPts[s1];
            arcArr[o + 4] = arcPts[s1 + 1];
            arcArr[o + 5] = arcPts[s1 + 2];
          }
        }
        arcGeo.attributes.position.needsUpdate = true;
        if (!h._impacted && flyK >= 0.985) {
          h._impacted = true;
          if (h._onImpact) {
            try {
              h._onImpact(h._to.clone());
            } catch (e) {
            }
          }
          call("shockwave", {
            pos: h._to,
            radius: R * 1.2,
            maxRadius: R * (12 + 10 * h._power),
            life: 0.7,
            color: C.VIOLET,
            color2: 16777215,
            thickness: 2.2,
            ringCount: Q.name === "low" ? 0 : 2
          });
          call("hitSpark", { pos: h._to, color: C.VIOLET, color2: 16777215, count: Q.name === "low" ? 16 : 64, size: 1.8, speed: 42, life: 0.8, spread: 1 });
          call("screen", { flash: 0.5, color: C.VIOLET, shake: 0.8, life: 0.35 });
          if (Q.debris) call("debris", { pos: h._to, color: C.CONCRETE, count: 10, power: 1.2, size: 1.4, life: 1.4, up: 6 });
        }
        if (h.t >= h.life) h.finish();
      };
      return h;
    }
    function makePurpleLine(cfg2) {
      const g = new Group();
      const R = 6;
      const beamMat = (u) => matAcquire(`purple:beam:${u.uCore.value.getHexString()}`, () => new ShaderMaterial({
        uniforms: u,
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      }));
      const inner = new Mesh(geoCyl(), beamMat({
        uCore: { value: new Color(16777215) },
        uMid: { value: new Color(14196991) },
        uEdge: { value: new Color(C.VIOLET) },
        uTime: { value: 0 },
        uAlpha: { value: 1 },
        uPower: { value: 1 },
        uGrow: { value: 0 }
      }));
      const outer = new Mesh(geoCyl(), beamMat({
        uCore: { value: new Color(15778047) },
        uMid: { value: new Color(10494176) },
        uEdge: { value: new Color(16724080) },
        uTime: { value: 3.7 },
        uAlpha: { value: 1 },
        uPower: { value: 0.8 },
        uGrow: { value: 0 }
      }));
      g.add(outer, inner);
      const shardN = Q.name === "low" ? 4 : Q.name === "medium" ? 8 : 14;
      const shardGeo = quadSoup(shardN);
      ownedGeos.push(shardGeo);
      const shardArr = shardGeo.attributes.position.array;
      const shardData = [];
      for (let i = 0; i < shardN; i++) {
        shardData.push({
          t: (i + 0.5) / shardN,
          rr: R * (1.5 + rand2() * 2.4),
          spin: 0.4 + i % 3 * 0.25,
          ph: rand2() * 6.28,
          // 面片的两个正交半边方向（随机朝向）
          ux: rand2() * 2 - 1,
          uy: rand2() * 2 - 1,
          uz: rand2() * 2 - 1,
          vx: rand2() * 2 - 1,
          vy: rand2() * 2 - 1,
          vz: rand2() * 2 - 1,
          hw: R * (0.6 + rand2() * 1.1),
          hh: R * (0.08 + rand2() * 0.21)
        });
      }
      const shards = new Mesh(shardGeo, matAcquire("purple:shard", () => new MeshBasicMaterial({
        color: 328458,
        transparent: true,
        opacity: 0.95,
        side: DoubleSide,
        depthWrite: false
      })));
      shards.frustumCulled = false;
      g.add(shards);
      const nova = new Mesh(geoSphere(R * 0.8), matAcquire("purple:nova", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.VIOLET) },
          uColor2: { value: new Color(16777215) },
          uHot: { value: new Color(16777215) },
          uTime: { value: 0 },
          uAlpha: { value: 0 },
          uGlow: { value: 2.2 },
          uPulse: { value: 0 }
        },
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
      })));
      g.add(nova);
      const h = new Handle();
      h.object = g;
      h._from = new Vector3();
      h._to = new Vector3();
      h._power = 1;
      h._impacted = false;
      h._onImpact = null;
      h.use(inner.material);
      h.use(outer.material);
      h.use(nova.material);
      h.use(shards.material);
      h._layout = (a, b) => {
        h._from.copy(a);
        h._to.copy(b);
        _v14.copy(b).sub(a);
        const len = Math.max(0.01, _v14.length());
        _v24.copy(_v14).normalize();
        g.quaternion.setFromUnitVectors(_v34.set(0, 1, 0), _v24);
        g.position.copy(a).addScaledVector(_v14, 0.5);
        inner.scale.set(R, len, R);
        outer.scale.set(R * 2.6, len, R * 2.6);
        nova.position.copy(b);
        const up = Math.abs(_v24.y) > 0.94 ? _v34.set(1, 0, 0) : _v34.set(0, 1, 0);
        const s1 = new Vector3().crossVectors(_v24, up).normalize();
        const s2 = new Vector3().crossVectors(_v24, s1).normalize();
        for (let i = 0; i < shardN; i++) {
          const d = shardData[i];
          const cx = a.x + _v14.x * d.t + s1.x * d.rr;
          const cy = a.y + _v14.y * d.t + s1.y * d.rr;
          const cz = a.z + _v14.z * d.t + s1.z * d.rr;
          const hw = d.hw * (1 + 0.6 * d.spin);
          writeQuad(shardArr, i, cx, cy, cz, d.ux * hw, d.uy * hw, d.uz * hw, d.vx * d.hh, d.vy * d.hh, d.vz * d.hh);
        }
        shardGeo.attributes.position.needsUpdate = true;
        void s2;
      };
      h.setPath = (a, b) => h._layout(a, b);
      h.setPos = () => {
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = null;
        h._onImpact = c.onImpact || null;
        h._impacted = false;
        h._power = clampNum(c.power, 0.5, 1.5, 1);
        inner.material.uniforms.uPower.value = h._power;
        outer.material.uniforms.uPower.value = h._power * 0.8;
        inner.material.uniforms.uGrow.value = 0;
        outer.material.uniforms.uGrow.value = 0;
        h._layout(c.from, c.to);
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const growK = Math.min(0.2 / Math.max(h.life, 0.02), 0.5);
        const grow = smoothstep01(0, growK, k);
        inner.material.uniforms.uGrow.value = grow;
        outer.material.uniforms.uGrow.value = grow * 0.94;
        inner.material.uniforms.uTime.value = h.t;
        outer.material.uniforms.uTime.value = h.t + 3.7;
        const fade = 1 - smoothstep01(0.72, 1, k);
        inner.material.uniforms.uAlpha.value = fade;
        outer.material.uniforms.uAlpha.value = fade * 0.85;
        const nk = smoothstep01(0.05, 0.55, k);
        const ns = 0.3 + nk * (2.2 + h._power * 2) * (1 - 0.35 * smoothstep01(0.6, 1, k));
        nova.scale.setScalar(ns);
        nova.material.uniforms.uTime.value = h.t;
        nova.material.uniforms.uAlpha.value = (1 - smoothstep01(0.55, 1, k)) * 1.1;
        for (let i = 0; i < shardN; i++) {
          const d = shardData[i];
          d.ph += dt * d.spin;
          const wob = 1 + 0.5 * Math.abs(Math.sin(h.t * 1.6 + i)) * (1 - 0.5 * k);
          d.ux = Math.cos(d.ph);
          d.uy = Math.sin(d.ph * 1.7) * 0.6;
          d.uz = Math.sin(d.ph);
          d.vx = -Math.sin(d.ph);
          d.vy = Math.cos(d.ph * 1.3) * 0.6;
          d.vz = Math.cos(d.ph);
          const cx = h._from.x + (h._to.x - h._from.x) * d.t + Math.sin(d.ph * 2) * d.rr * 0.35;
          const cy = h._from.y + (h._to.y - h._from.y) * d.t + Math.cos(d.ph * 1.4) * d.rr * 0.35;
          const cz = h._from.z + (h._to.z - h._from.z) * d.t + Math.sin(d.ph * 1.1) * d.rr * 0.35;
          const hw = d.hw * wob;
          writeQuad(shardArr, i, cx, cy, cz, d.ux * hw, d.uy * hw, d.uz * hw, d.vx * d.hh, d.vy * d.hh, d.vz * d.hh);
        }
        shardGeo.attributes.position.needsUpdate = true;
        shards.material.opacity = 0.95 * (1 - 0.6 * k);
        if (!h._impacted && grow >= 0.985) {
          h._impacted = true;
          if (h._onImpact) {
            try {
              h._onImpact(h._to.clone());
            } catch (e) {
            }
          }
          call("shockwave", {
            pos: h._to,
            radius: R * 1.4,
            maxRadius: R * (16 + 12 * h._power),
            life: 0.9,
            color: C.VIOLET,
            color2: 16777215,
            thickness: 3,
            ringCount: Q.name === "low" ? 0 : 3
          });
          call("hitSpark", { pos: h._to, color: C.VIOLET, color2: 16777215, count: Q.name === "low" ? 20 : 90, size: 2.4, speed: 64, life: 1, spread: 1 });
          call("screen", { flash: 0.85, color: 15257855, shake: 1.4, life: 0.5, chroma: 1 });
          if (Q.debris) call("debris", { pos: h._to, color: C.CONCRETE, count: 18, power: 1.8, size: 2, life: 1.8, up: 12 });
          if (Q.callout) call("callout", { text: "虚式「茈」", pos: h._to, color: C.VIOLET, color2: 16777215, life: 1.2, size: 1.3 });
        }
        if (h.t >= h.life) h.finish();
      };
      return h;
    }
    function createInfinityShield(cfg2) {
      const g = new Group();
      g.position.copy(cfg2.pos);
      const layers = Q.name === "low" ? 1 : Q.name === "medium" ? 2 : 3;
      const freqs = [7, 11, 17];
      const meshes = [];
      for (let i = 0; i < layers; i++) {
        const m = new Mesh(geoIco(i === 0 ? 2 : 1), matAcquire(`inf:mat${i}`, () => new ShaderMaterial({
          uniforms: {
            uColor: { value: new Color(C.CYAN) },
            uColor2: { value: new Color(C.WHITE) },
            uTime: { value: 0 },
            uAlpha: { value: 0.9 },
            uFreq: { value: freqs[i] },
            uLayer: { value: i },
            uHit: { value: new Vector3(0, 1, 0) },
            uHitT: { value: 0 },
            uDent: { value: i === 0 ? 1 : 0 }
          },
          vertexShader: LATTICE_VERT,
          fragmentShader: LATTICE_FRAG,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          side: DoubleSide
        })));
        m.scale.setScalar(1 + i * 0.16);
        m.userData.spin = 0.25 + i * 0.42;
        meshes.push(m);
        g.add(m);
      }
      const skin = new Mesh(geoSphere(0.985), matAcquire("inf:skin", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.CYAN) },
          uColor2: { value: new Color(C.WHITE) },
          uHot: { value: new Color(C.WHITE) },
          uTime: { value: 0 },
          uAlpha: { value: 0.34 },
          uPulse: { value: 0 }
        },
        vertexShader: SHELL_VERT,
        fragmentShader: INF_SKIN_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      g.add(skin);
      const h = new Handle();
      h.object = g;
      h._follow = null;
      h._hitT = 0;
      h._hit = new Vector3(0, 1, 0);
      h._radius = 3.2;
      h.use(skin.material);
      for (const m of meshes) h.use(m.material);
      h.setPos = (p) => {
        g.position.copy(p);
      };
      h.hit = (worldPoint) => {
        _v14.copy(worldPoint).sub(g.position);
        if (_v14.lengthSq() < 1e-8) _v14.set(0, 1, 0);
        h._hit.copy(_v14.normalize());
        h._hitT = 1;
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = null;
        h._follow = c.follow || null;
        h._radius = clampNum(c.radius, 0.4, 400, 3.2);
        g.position.copy(c.pos);
        // 视觉半径比逻辑半径小一档：贴住身体轮廓，不要鼓成一个球
        g.scale.setScalar(h._radius * 0.84);
        h._hit.set(0, 1, 0);
        h._hitT = 0;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        /* 播片/标题状态强制关闭：
         * 护盾是"战斗中的被动特效"，在播片里出现会变成一个青色胶囊糊住主角
         * （Lead 在 cine 截图里确认过）。这里读 window.__SS.state（只读，防御式），
         * 只要不是战斗态就整组隐藏，切回战斗后自动恢复。
         */
        if (typeof window !== "undefined" && window.__SS) {
          const st = window.__SS.state;
          g.visible = st !== "cutscene" && st !== "title" && st !== "loading";
        }
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        if (h._follow && h._follow.getWorldPosition) {
          h._follow.getWorldPosition(_v14);
          g.position.copy(_v14);
        }
        // 出现快、收得更快：0.12 的 life 淡入，走到 55% 就开始崩掉，
        // 让"挡下攻击"读起来是一瞬间的玻璃闪光，而不是一个一直罩着的泡
        const fadeIn = smoothstep01(0, 0.12, k);
        const fadeOut = 1 - smoothstep01(0.55, 1, k);
        h._hitT = Math.max(0, h._hitT - dt * 1.1);
        for (let i = 0; i < meshes.length; i++) {
          const m = meshes[i];
          const u = m.material.uniforms;
          u.uTime.value = h.t * (1 + i * 0.35);
          // 网格层也收一档：三层叠起来仍然很亮，会盖住角色
          // 网格层再收：护盾是"一瞬间的挡下"，不是一直亮着的壳
          u.uAlpha.value = (0.27 - i * 0.08) * fadeIn * fadeOut;
          u.uHit.value.copy(h._hit);
          u.uHitT.value = h._hitT * (i === 0 ? 1 : 0.5);
          m.rotation.y += dt * m.userData.spin;
          m.rotation.x += dt * m.userData.spin * 0.4;
        }
        skin.material.uniforms.uTime.value = h.t;
        skin.material.uniforms.uPulse.value = Math.sin(h.t * 2.4);
        skin.material.uniforms.uAlpha.value = 0.19 * fadeIn * fadeOut * (1 + h._hitT * 0.6);
        if (h.t >= h.life) h.finish();
      };
      return h;
    }
    let shrineGeoCache = null;
    const buildShrineGeometry = () => {
      if (shrineGeoCache) return shrineGeoCache;
      const rnd3 = mulberry322(45285);
      const parts = [];
      const rings = Q.ribRings;
      const ringRadius = [7.2, 9.4, 11.4, 13.6, 15.2, 17, 19.4, 21, 23.4];
      const ringY = [2.2, 8.6, 14, 19.4, 24, 29, 33.4, 37, 41];
      const ringCount = [10, 9, 8, 8, 7, 7, 6, 5, 4];
      for (let ri = 0; ri < rings; ri++) {
        const R = ringRadius[ri % ringRadius.length];
        const Y = ringY[ri % ringY.length];
        const N = ringCount[ri % ringCount.length];
        const spin = ri * 0.42;
        for (let i = 0; i < N; i++) {
          const a = i / N * Math.PI * 2 + spin;
          const arc = Math.PI * 2 / N * 1.1;
          const pts = [];
          for (let k = 0; k <= 3; k++) {
            const t = k / 3;
            const aa = a + (t - 0.5) * arc;
            const lift = Math.sin(t * Math.PI) * (1.5 + ri * 0.22);
            pts.push(new Vector3(Math.cos(aa) * R, Y + lift, Math.sin(aa) * R));
          }
          const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
          parts.push(new TubeGeometry(curve, Q.ribSeg, 0.42 + rnd3() * 0.2, Q.ribSeg, false));
        }
        const seg = Math.max(8, Math.round(N * 1.6));
        parts.push(new TorusGeometry(R, 0.22 + rnd3() * 0.1, Math.max(3, Q.ribSeg >> 1), seg));
      }
      const cols = 8;
      const topY = ringY[Math.min(rings, ringY.length - 1)];
      for (let i = 0; i < cols; i++) {
        const a = i / cols * Math.PI * 2 + 0.2;
        const R = 9.6 + rnd3() * 1.4;
        const pts = [];
        for (let k = 0; k <= 4; k++) {
          const t = k / 4;
          const rr2 = R * (1 - 0.28 * t * t);
          pts.push(new Vector3(
            Math.cos(a + t * 0.22) * rr2,
            -0.4 + t * topY,
            Math.sin(a + t * 0.22) * rr2
          ));
        }
        const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
        parts.push(new TubeGeometry(curve, Q.ribSeg * 2, 0.72 + rnd3() * 0.24, Math.max(4, (Q.ribSeg >> 1) + 2), false));
      }
      const fangs = 10;
      for (let i = 0; i < fangs; i++) {
        const a = i / fangs * Math.PI * 2;
        const R = 3.6;
        const pts = [
          new Vector3(Math.cos(a) * R, 40, Math.sin(a) * R),
          new Vector3(Math.cos(a) * (R + 1.6), 44.5, Math.sin(a) * (R + 1.6)),
          new Vector3(Math.cos(a) * (R + 0.4), 49.5, Math.sin(a) * (R + 0.4)),
          new Vector3(Math.cos(a) * (R + 2.6), 53.5, Math.sin(a) * (R + 2.6))
        ];
        const curve = new CatmullRomCurve3(pts, false, "catmullrom", 0.5);
        parts.push(new TubeGeometry(curve, Q.ribSeg, 0.62, Math.max(4, (Q.ribSeg >> 1) + 2), false));
      }
      const wheelParts = [];
      wheelParts.push(new TorusGeometry(3.2, 0.55, 6, Math.max(12, Q.ribSeg * 2)));
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const spike = new ConeGeometry(0.42, 3.4, 5, 1, false);
        const rot = new Matrix4().makeRotationZ(a);
        const off = new Matrix4().makeTranslation(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 0);
        const rot2 = new Matrix4().makeRotationZ(Math.PI / 2);
        const m = new Matrix4().multiplyMatrices(rot, off).multiply(rot2);
        spike.applyMatrix4(m);
        wheelParts.push(spike);
      }
      const body = mergeGeometries(parts);
      const wheel = mergeGeometries(wheelParts);
      for (const p of parts) p.dispose();
      for (const p of wheelParts) p.dispose();
      shrineGeoCache = { body, wheel, topY: 41 };
      return shrineGeoCache;
    };
    function createShrineDomain(cfg2) {
      const geo = buildShrineGeometry();
      if (!geoCache.has("shrine:body")) {
        ownedGeos.push(geo.body, geo.wheel);
        geoCache.set("shrine:body", geo.body);
        geoCache.set("shrine:wheel", geo.wheel);
      }
      const g = new Group();
      g.position.copy(cfg2.pos);
      const boneMat = matAcquire("shrine:bone", () => new ShaderMaterial({
        uniforms: {
          uBone: { value: new Color(15262422) },
          uBone2: { value: new Color(9274743) },
          uGlow: { value: new Color(C.BLOOD) },
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uGrow: { value: 0 }
        },
        vertexShader: BONE_VERT,
        fragmentShader: BONE_FRAG,
        transparent: true,
        depthWrite: true
      }));
      const body = new Mesh(geo.body, boneMat);
      g.add(body);
      const wheelMat = matAcquire("shrine:wheel", () => new MeshBasicMaterial({ color: 14209216 }));
      const wheel = new Mesh(geo.wheel, wheelMat);
      wheel.position.y = geo.topY + 1.4;
      g.add(wheel);
      const wheel2 = new Mesh(geo.wheel, wheelMat);
      wheel2.position.y = geo.topY + 3;
      wheel2.scale.setScalar(0.62);
      g.add(wheel2);
      const fogGeo = addPolar(new RingGeometry(14, 46, Q.ringSeg, 3));
      ownedGeos.push(fogGeo);
      const fog = new Mesh(fogGeo, matAcquire("shrine:fog", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.BLOOD) },
          uColor2: { value: new Color(C.CRIMSON) },
          uTime: { value: 0 },
          uAlpha: { value: 0 }
        },
        vertexShader: VERT_POLAR_ONLY,
        fragmentShader: FOG_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      fog.rotation.x = -Math.PI / 2;
      fog.position.y = 0.25;
      g.add(fog);
      const bandN = Q.shrineBands;
      const bandGeo = quadSoup(Math.max(1, bandN));
      bandGeo.setAttribute("aAlpha", new BufferAttribute(new Float32Array(Math.max(1, bandN) * 6), 1));
      ownedGeos.push(bandGeo);
      const bandArr = bandGeo.attributes.position.array;
      const bandAlpha = bandGeo.attributes.aAlpha.array;
      const bandData = [];
      for (let i = 0; i < bandN; i++) {
        bandData.push({
          radius: 6 + rand2() * 15,
          y: 2 + rand2() * 34,
          ang: rand2() * Math.PI * 2,
          spin: (0.6 + rand2() * 1.6) * (rand2() > 0.5 ? 1 : -1),
          len: 8 + rand2() * 16,
          tilt: (rand2() - 0.5) * 1.1,
          phase: rand2()
        });
      }
      const bands = bandN > 0 ? new Mesh(bandGeo, matAcquire("shrine:band", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(C.WHITE) },
          uAlpha: { value: 0.9 },
          uTime: { value: 0 }
        },
        vertexShader: BAND_VERT,
        fragmentShader: SLASHBAND_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      }))) : null;
      if (bands) {
        bands.frustumCulled = false;
        g.add(bands);
      }
      const h = new Handle();
      h.object = g;
      h.use(boneMat);
      h.use(wheelMat);
      h.use(fog.material);
      if (bands) h.use(bands.material);
      h.setPos = (p) => {
        g.position.copy(p);
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = c.onEnd || null;
        h._baseY = c.pos.y;
        g.position.copy(c.pos);
        g.rotation.y = 0;
        boneMat.uniforms.uGrow.value = 0;
        boneMat.uniforms.uAlpha.value = 1;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const rise = smoothstep01(0, Math.min(1.5 / Math.max(h.life, 0.02), 0.92), k);
        const e = 1 - Math.pow(1 - rise, 3);
        boneMat.uniforms.uTime.value = h.t;
        boneMat.uniforms.uGrow.value = e;
        boneMat.uniforms.uAlpha.value = 1 - smoothstep01(0.86, 1, k) * 0.85;
        g.position.y = h._baseY - (1 - e) * 6;
        g.rotation.y += dt * 0.075;
        wheel.rotation.z += dt * 0.6;
        wheel2.rotation.z -= dt * 1.15;
        fog.material.uniforms.uTime.value = h.t;
        fog.material.uniforms.uAlpha.value = e * 0.85 * (1 - smoothstep01(0.82, 1, k));
        if (bands) {
          const cx = g.position.x, cz = g.position.z;
          const fade2 = e * (1 - smoothstep01(0.85, 1, k));
          for (let i = 0; i < bandN; i++) {
            const d = bandData[i];
            d.ang += dt * d.spin;
            const pr = (h.t * (0.7 + d.phase) + d.phase) % 1;
            const px2 = Math.cos(d.ang) * d.radius;
            const py2 = d.y + (pr - 0.5) * 5;
            const pz2 = Math.sin(d.ang) * d.radius;
            let fx3 = cx - px2, fz = cz - pz2;
            const fl = Math.hypot(fx3, fz) || 1;
            fx3 /= fl;
            fz /= fl;
            const tx = -fz, tz = fx3;
            const cy = Math.cos(d.tilt), sy = Math.sin(d.tilt);
            const hw = d.len * 0.5;
            const hh = (0.35 + 0.5 * Math.abs(Math.sin(pr * Math.PI))) * 0.5;
            writeQuad(
              bandArr,
              i,
              px2,
              py2,
              pz2,
              tx * hw * cy,
              hw * sy,
              tz * hw * cy,
              fx3 * hh,
              0,
              fz * hh
            );
            const a = (0.35 + 0.55 * Math.sin(pr * Math.PI)) * fade2;
            const o = i * 6;
            bandAlpha[o] = a;
            bandAlpha[o + 1] = a;
            bandAlpha[o + 2] = a;
            bandAlpha[o + 3] = a;
            bandAlpha[o + 4] = a;
            bandAlpha[o + 5] = a;
          }
          bandGeo.attributes.position.needsUpdate = true;
          bandGeo.attributes.aAlpha.needsUpdate = true;
          bands.material.uniforms.uTime.value = h.t;
          bands.material.uniforms.uAlpha.value = 0.9;
        }
        if (h.t >= h.life) {
          if (Q.debris) call("debris", { pos: g.position, color: 14209216, count: 20, power: 1, size: 1.2, life: 1.4, up: 8 });
          h.finish();
        }
      };
      return h;
    }
    const VOID_R = 58;
    function createVoidDomain(cfg2) {
      const R = VOID_R;
      const g = new Group();
      g.position.copy(cfg2.pos);
      const shell = new Mesh(geoSphere(1), matAcquire("void:black", () => new MeshBasicMaterial({
        color: 262922,
        side: BackSide,
        transparent: true,
        depthWrite: true,
        fog: false
      })));
      shell.scale.setScalar(R);
      g.add(shell);
      const info = new Mesh(geoSphere(1), matAcquire("void:info", () => new MeshBasicMaterial({
        map: voidInfoTexture(),
        // 只画内壁（背向）—— 与旧版一致。球内看是四壁的信息，球外看是裹着字的黑球；
        // 换成双面会让两层字叠加，直接糊成一片白
        side: BackSide,
        transparent: true,
        opacity: 0.75,
        blending: AdditiveBlending,
        depthWrite: false,
        // 关掉深度测试：上帝视角是俯视的，球的下半部整片埋在地面以下，
        // 若按常规深度遮挡，铺满视野的情报内壁根本露不出来 —— 这一条是
        // 「情報過載」能不能成立的关键，它让字与线永远盖在场景之上。
        depthTest: false,
        fog: false
      })));
      info.scale.setScalar(R * 0.985);
      info.renderOrder = 12;
      g.add(info);
      const infoTex = info.material.map;
      const rimGeo = cachedGeo("torus:goldRim", () => new TorusGeometry(1, 6e-3, 6, 128));
      const rim = new Mesh(rimGeo, matAcquire("void:rim", () => new MeshBasicMaterial({
        color: 16769704,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false
      })));
      rim.scale.setScalar(R * 1.002);
      g.add(rim);
      const rim2 = new Mesh(rimGeo, matAcquire("void:rim", () => new MeshBasicMaterial({
        color: 16769704,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false
      })));
      rim2.rotation.set(Math.PI / 2, 0, 0);
      rim2.scale.setScalar(R * 0.99);
      g.add(rim2);
      const core = new Mesh(geoSphere(1), matAcquire("void:core", () => new MeshBasicMaterial({
        color: 0,
        fog: false
      })));
      const coreRim = new Mesh(geoSphere(1), matAcquire("void:coreRim", () => new MeshBasicMaterial({
        color: 16773327,
        side: BackSide,
        fog: false
      })));
      coreRim.scale.setScalar(1.35);
      core.add(coreRim);
      g.add(core);
      const flowN = Q.name === "low" ? 70 : Q.name === "medium" ? 120 : 180;
      const flowGeo = new BufferGeometry();
      {
        const seed = new Float32Array(flowN);
        const size = new Float32Array(flowN);
        const phase = new Float32Array(flowN);
        const band = new Float32Array(flowN);
        for (let i = 0; i < flowN; i++) {
          seed[i] = rand2();
          size[i] = 0.5 + rand2() * 1.1;
          phase[i] = rand2();
          band[i] = (rand2() - 0.5) * 2.4;
        }
        flowGeo.setAttribute("position", new BufferAttribute(new Float32Array(flowN * 3), 3));
        flowGeo.setAttribute("aSeed", new BufferAttribute(seed, 1));
        flowGeo.setAttribute("aSize", new BufferAttribute(size, 1));
        flowGeo.setAttribute("aPhase", new BufferAttribute(phase, 1));
        flowGeo.setAttribute("aBand", new BufferAttribute(band, 1));
        flowGeo.boundingSphere = new Sphere(new Vector3(), 1e5);
        ownedGeos.push(flowGeo);
      }
      const flow = new Points(flowGeo, matAcquire("void:flow", () => new ShaderMaterial({
        uniforms: {
          uSize: { value: 3 },
          uPixelRatio: { value: DPR },
          uTime: { value: 0 },
          uR: { value: R },
          uAlpha: { value: 0 },
          uColorA: { value: new Color(16777215) },
          uColorB: { value: new Color(12575999) },
          uMap: { value: pointTexture() }
        },
        vertexShader: VOID_FLOW_VERT,
        fragmentShader: VOID_FLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
      })));
      flow.frustumCulled = false;
      g.add(flow);
      const h = new Handle();
      h.object = g;
      h.use(shell.material);
      h.use(info.material);
      h.use(rim.material);
      h.use(rim2.material);
      h.use(core.material);
      h.use(coreRim.material);
      h.use(flow.material);
      h.setPos = (p) => {
        g.position.copy(p);
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = c.onEnd || null;
        g.position.copy(c.pos);
        h.t = 0;
        h._ended = false;
        h.alive = true;
        rim.rotation.set(0, 0, 0);
        rim2.rotation.set(Math.PI / 2, 0, 0);
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const grow = 1 - Math.pow(1 - Math.min(1, h.t / 1.3), 5);
        const fade = 1 - smoothstep01(0.9, 1, k);
        const Rs = R * (0.02 + 0.98 * grow);
        shell.scale.setScalar(Rs);
        shell.material.opacity = fade;
        info.scale.setScalar(Rs * 0.985);
        info.material.opacity = 0.75 * fade * (0.25 + 0.75 * grow);
        rim.scale.setScalar(Rs * 1.002);
        rim.material.opacity = 0.9 * fade;
        rim2.scale.setScalar(Rs * 0.99);
        rim2.material.opacity = 0.5 * fade;
        core.scale.setScalar(0.95 * (0.3 + grow * (1 + Math.sin(h.t * 3) * 0.15)));
        infoTex.offset.x += dt * 0.035;
        infoTex.offset.y += dt * 0.012;
        rim.rotation.y += dt * 0.35;
        rim.rotation.x += dt * 0.12;
        rim2.rotation.y -= dt * 0.22;
        const u = flow.material.uniforms;
        u.uTime.value = h.t;
        u.uAlpha.value = 0.85 * fade * grow;
        if (h.t >= h.life) h.finish();
      };
      return h;
    }
    const CRESCENT_COLS = 10;
    const SCAR_COLS = 4;
    function createDismantle(cfg2) {
      const g = new Group();
      const count = Math.max(1, Math.round(cfg2.count == null ? 3 : cfg2.count));
      const q = Math.max(1, Math.round(cfg2.q == null ? count : cfg2.q));
      const soup = crescentSoup(q, CRESCENT_COLS);
      ownedGeos.push(soup.geo);
      const bladeMesh = new Mesh(soup.geo, matAcquire("dismantle:blade", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(12576511) },
          uHot: { value: new Color(16777215) }
        },
        vertexShader: CRESCENT_VERT,
        fragmentShader: CRESCENT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      bladeMesh.frustumCulled = false;
      g.add(bladeMesh);
      const scars = scarSoup(q);
      ownedGeos.push(scars.geo);
      const scarMesh = new Mesh(scars.geo, matAcquire("scar:mat", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(16773864) },
          uColor2: { value: new Color(C.CRIMSON) },
          uTime: { value: 0 }
        },
        vertexShader: SCAR_VERT,
        fragmentShader: SCAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      scarMesh.frustumCulled = false;
      g.add(scarMesh);
      const h = new Handle();
      h.object = g;
      h.use(bladeMesh.material);
      h.use(scarMesh.material);
      h._from = new Vector3();
      h._to = new Vector3();
      h._onHit = null;
      h._hitFlags = new Uint8Array(q);
      h._stagger = new Float32Array(q);
      h._offAng = new Float32Array(q * 2);
      h._hitTmp = new Vector3();
      h._ctr = new Float32Array(q * 3);
      h._dirv = new Float32Array(q * 3);
      h._halfW = new Float32Array(q);
      h._layout = (fresh) => {
        _v14.copy(h._to).sub(h._from);
        const len = Math.max(0.01, _v14.length());
        _v24.copy(_v14).normalize();
        const up = Math.abs(_v24.y) > 0.94 ? _v34.set(1, 0, 0) : _v34.set(0, 1, 0);
        const s1 = new Vector3().crossVectors(_v24, up).normalize();
        const s2 = new Vector3().crossVectors(_v24, s1).normalize();
        const mid = new Vector3().copy(h._from).addScaledVector(_v14, 0.5);
        for (let i = 0; i < q; i++) {
          if (fresh) {
            h._offAng[i * 2] = rand2() * Math.PI * 2;
            const baseAng = i % 3 * (Math.PI * 2 / 3);
            h._offAng[i * 2] = baseAng + (rand2() - 0.5) * 1.1;
            h._offAng[i * 2 + 1] = (rand2() - 0.5) * 0.3;
          }
          const ang = h._offAng[i * 2];
          const off = h._offAng[i * 2 + 1];
          const cx = mid.x + s1.x * Math.cos(ang) * off * len + s2.x * Math.sin(ang) * off * len;
          const cy = mid.y + s1.y * Math.cos(ang) * off * len + s2.y * Math.sin(ang) * off * len;
          const cz = mid.z + s1.z * Math.cos(ang) * off * len + s2.z * Math.sin(ang) * off * len;
          const roll = ang * 0.55 + off * 1.4;
          const cr = Math.cos(roll), sr = Math.sin(roll);
          const dx = _v24.x * cr + s1.x * sr;
          const dy = _v24.y * cr + s1.y * sr;
          const dz = _v24.z * cr + s1.z * sr;
          let px2 = dy * 0 - dz * 1;
          let py2 = dz * 0 - dx * 0;
          let pz2 = dx * 1 - dy * 0;
          const pl = Math.hypot(px2, py2, pz2) || 1;
          px2 /= pl;
          py2 /= pl;
          pz2 /= pl;
          h._ctr[i * 3] = cx;
          h._ctr[i * 3 + 1] = cy;
          h._ctr[i * 3 + 2] = cz;
          h._dirv[i * 3] = dx;
          h._dirv[i * 3 + 1] = dy;
          h._dirv[i * 3 + 2] = dz;
          h._halfW[i] = 0.55 + Math.abs(off) * 3;
          writeCrescentBlade(soup, i, cx, cy, cz, dx, dy, dz, px2, py2, pz2, len, 0.22, 0.1);
          writeScar(scars, i, cx, cy, cz, dx, dy, dz, px2, py2, pz2, len, h._halfW[i], i * 3.7, 0);
        }
        soup.geo.attributes.position.needsUpdate = true;
        scars.geo.attributes.position.needsUpdate = true;
      };
      h.setPath = (a, b) => {
        h._from.copy(a);
        h._to.copy(b);
        h._layout(false);
      };
      h.setPos = (p) => {
        _v14.copy(p).sub(h._from);
        h._from.copy(p);
        h._to.add(_v14);
        h._layout(false);
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = null;
        h._onHit = c.onHit || null;
        h._hitFlags.fill(0);
        const spread = Math.min(0.16, Math.max(0.03, h.life * 0.22));
        for (let i = 0; i < q; i++) {
          h._stagger[i] = i / Math.max(1, q) * spread + rand2() * 0.02;
          writeBladeAttrs(soup, i, 0, 0, 0.13);
        }
        scarMesh.material.uniforms.uTime.value = 0;
        h._from.copy(c.from);
        h._to.copy(c.to);
        h._layout(true);
        soup.geo.attributes.aSweep.needsUpdate = true;
        soup.geo.attributes.aAlpha.needsUpdate = true;
        soup.geo.attributes.aWidth.needsUpdate = true;
        scars.geo.attributes.aSeed.needsUpdate = true;
        scars.geo.attributes.aAlpha.needsUpdate = true;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const fade = 1 - smoothstep01(0.75, 1, k);
        let anyBlade = false;
        let anyScar = false;
        for (let i = 0; i < q; i++) {
          const start = h._stagger[i];
          const p = (h.t - start) / 0.12;
          let sweep2 = 0;
          let ba = 0;
          if (p >= 0 && p <= 1) {
            sweep2 = p;
            ba = Math.sin(p * Math.PI) * fade;
            anyBlade = true;
            if (!h._hitFlags[i]) {
              h._hitFlags[i] = 1;
              if (h._onHit) {
                h._hitTmp.set(h._ctr[i * 3], h._ctr[i * 3 + 1], h._ctr[i * 3 + 2]);
                try {
                  h._onHit(h._hitTmp.clone(), i);
                } catch (e) {
                }
              }
            }
          }
          writeBladeAttrs(soup, i, sweep2, ba, 0.13);
          const scarDelay = 0.05 + i % 3 * 0.05;
          const sp = (h.t - start - 0.12 - scarDelay) / 0.34;
          let sa = 0;
          if (sp > 0 && sp < 1.6) {
            sa = (sp < 1 ? sp : Math.max(0, 1 - (sp - 1) / 0.6)) * 0.95 * fade;
            anyScar = true;
          }
          const o = i * scars.vertsPer;
          for (let v = 0; v < scars.vertsPer; v++) scars.alpha[o + v] = sa;
        }
        soup.geo.attributes.aSweep.needsUpdate = true;
        soup.geo.attributes.aAlpha.needsUpdate = true;
        scars.geo.attributes.aAlpha.needsUpdate = true;
        bladeMesh.visible = anyBlade;
        scarMesh.visible = anyScar;
        scarMesh.material.uniforms.uTime.value = h.t;
        if (h.t >= h.life) h.finish();
      };
      h.onKilled = function onKilled() {
        Handle.prototype.onKilled.call(this);
        bladeMesh.visible = false;
        scarMesh.visible = false;
      };
      return h;
    }
    function createCleave(cfg2) {
      const g = new Group();
      const count = Math.max(2, Math.round(cfg2.count == null ? 9 : cfg2.count));
      const q = Math.max(2, Math.round(cfg2.q == null ? count : cfg2.q));
      const soup = crescentSoup(q, CRESCENT_COLS);
      ownedGeos.push(soup.geo);
      const bladeMesh = new Mesh(soup.geo, matAcquire("cleave:blade", () => new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(16767196) },
          uHot: { value: new Color(16777215) }
        },
        vertexShader: CRESCENT_VERT,
        fragmentShader: CRESCENT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      bladeMesh.frustumCulled = false;
      g.add(bladeMesh);
      const pose = [];
      for (let i = 0; i < q; i++) {
        pose.push({
          a: rand2() * Math.PI * 2,
          cone: 0.55 + rand2() * 0.55,
          dist: 0.8 + rand2() * 2.6,
          yOff: rand2() - 0.45,
          roll: rand2() * Math.PI * 2,
          len: 2.4 + rand2() * 2.4
        });
      }
      const h = new Handle();
      h.object = g;
      h.use(bladeMesh.material);
      h._onHit = null;
      h._trig = new Float32Array(q);
      h._hitFlags = new Uint8Array(q);
      h._ctr = new Float32Array(q * 3);
      h._hitTmp = new Vector3();
      h._layout = (dirIn) => {
        const ox = g.position.x, oy = g.position.y, oz = g.position.z;
        const up = Math.abs(dirIn.y) > 0.94 ? _v34.set(1, 0, 0) : _v34.set(0, 1, 0);
        const c1 = new Vector3().crossVectors(dirIn, up).normalize();
        const c2 = new Vector3().crossVectors(dirIn, c1).normalize();
        for (let i = 0; i < q; i++) {
          const p = pose[i];
          const dx = dirIn.x + c1.x * Math.cos(p.a) * p.cone + c2.x * Math.sin(p.a) * p.cone;
          const dy = dirIn.y + c1.y * Math.cos(p.a) * p.cone + c2.y * Math.sin(p.a) * p.cone;
          const dz = dirIn.z + c1.z * Math.cos(p.a) * p.cone + c2.z * Math.sin(p.a) * p.cone;
          const dl = Math.hypot(dx, dy, dz) || 1;
          const nx = dx / dl, ny = dy / dl, nz = dz / dl;
          const cx = ox + Math.cos(p.a) * p.dist * 0.9;
          const cy = oy + p.yOff * p.dist * 1.1;
          const cz = oz + Math.sin(p.a) * p.dist * 0.9;
          const rx = c1.x * Math.cos(p.roll) + c2.x * Math.sin(p.roll);
          const ry = c1.y * Math.cos(p.roll) + c2.y * Math.sin(p.roll);
          const rz = c1.z * Math.cos(p.roll) + c2.z * Math.sin(p.roll);
          const dot = rx * nx + ry * ny + rz * nz;
          let px2 = rx - nx * dot, py2 = ry - ny * dot, pz2 = rz - nz * dot;
          const pl = Math.hypot(px2, py2, pz2) || 1;
          px2 /= pl;
          py2 /= pl;
          pz2 /= pl;
          h._ctr[i * 3] = cx;
          h._ctr[i * 3 + 1] = cy;
          h._ctr[i * 3 + 2] = cz;
          writeCrescentBlade(soup, i, cx - ox, cy - oy, cz - oz, nx, ny, nz, px2, py2, pz2, p.len, 0.3, 0.16);
        }
        soup.geo.attributes.position.needsUpdate = true;
      };
      h.setPos = (p) => {
        g.position.copy(p);
      };
      h.setPath = () => {
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = null;
        h._onHit = c.onHit || null;
        h._hitFlags.fill(0);
        let acc = 0;
        for (let i = 0; i < q; i++) {
          acc += 0.04 + rand2() * 0.03;
          h._trig[i] = acc;
          writeBladeAttrs(soup, i, 0, 0, 0.17);
        }
        g.position.copy(c.pos);
        const dir = _v14.copy(c.dir || _v24.set(0, 0, -1));
        if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
        dir.normalize();
        h._layout(dir);
        soup.geo.attributes.aSweep.needsUpdate = true;
        soup.geo.attributes.aAlpha.needsUpdate = true;
        soup.geo.attributes.aWidth.needsUpdate = true;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const fade = 1 - smoothstep01(0.7, 1, k);
        let any = false;
        for (let i = 0; i < q; i++) {
          const p = (h.t - h._trig[i]) / 0.1;
          let sweep2 = 0;
          let a = 0;
          if (p >= 0 && p <= 1) {
            sweep2 = p;
            a = Math.sin(p * Math.PI) * fade * 1.35;
            any = true;
            if (!h._hitFlags[i]) {
              h._hitFlags[i] = 1;
              h._hitTmp.set(h._ctr[i * 3], h._ctr[i * 3 + 1], h._ctr[i * 3 + 2]);
              if (h._onHit) {
                try {
                  h._onHit(h._hitTmp.clone(), i);
                } catch (e) {
                }
              }
              if (Q.name !== "low" && i > 0 && i % 2 === 0) {
                call("hitSpark", {
                  pos: h._hitTmp,
                  color: 16773344,
                  color2: C.CRIMSON,
                  count: 8,
                  size: 0.8,
                  speed: 14,
                  life: 0.32,
                  spread: 1
                });
              }
            }
          }
          writeBladeAttrs(soup, i, sweep2, a, 0.17);
        }
        soup.geo.attributes.aSweep.needsUpdate = true;
        soup.geo.attributes.aAlpha.needsUpdate = true;
        bladeMesh.visible = any;
        if (h.t >= h.life) h.finish();
      };
      h.onKilled = function onKilled() {
        Handle.prototype.onKilled.call(this);
        bladeMesh.visible = false;
      };
      return h;
    }
    function createFurnace(cfg2) {
      const g = new Group();
      const from = new Vector3().copy(cfg2.from);
      const to = new Vector3().copy(cfg2.to);
      const dir = new Vector3().copy(to).sub(from);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
      dir.normalize();
      const head = new Mesh(geoCone(), matAcquire("furnace:flame", () => new ShaderMaterial({
        uniforms: {
          uCore: { value: new Color(16774352) },
          uMid: { value: new Color(C.NEON_AMBER) },
          uOuter: { value: new Color(C.CRIMSON) },
          uTime: { value: 0 },
          uAlpha: { value: 1 }
        },
        vertexShader: `
        varying vec3 vPosL;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main(){
          vPosL = position;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      head.rotation.x = Math.PI / 2;
      g.add(head);
      const trailN = Q.trailParticles;
      const trailGeo = new BufferGeometry();
      trailGeo.setAttribute("position", new BufferAttribute(new Float32Array(trailN * 3), 3));
      const tSeeds = new Float32Array(trailN);
      const tSizes = new Float32Array(trailN);
      for (let i = 0; i < trailN; i++) {
        tSeeds[i] = rand2();
        tSizes[i] = 0.5 + rand2() * 1.2;
      }
      trailGeo.setAttribute("aSeed", new BufferAttribute(tSeeds, 1));
      trailGeo.setAttribute("aSize", new BufferAttribute(tSizes, 1));
      trailGeo.boundingSphere = new Sphere(new Vector3(), 1e5);
      ownedGeos.push(trailGeo);
      const trail = new Points(trailGeo, matAcquire("furnace:trailMat", () => new ShaderMaterial({
        uniforms: {
          uSize: { value: 3 },
          uPixelRatio: { value: DPR },
          uColorA: { value: new Color(16773312) },
          uColorB: { value: new Color(C.CRIMSON) },
          uAlpha: { value: 1 },
          uMap: { value: pointTexture() }
        },
        vertexShader: SPIRAL_VERT,
        fragmentShader: SPIRAL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending
      })));
      trail.frustumCulled = false;
      g.add(trail);
      const tArr = trailGeo.attributes.position.array;
      const tLife = new Float32Array(trailN);
      const tPos = new Float32Array(trailN * 3);
      const tVel = new Float32Array(trailN * 3);
      let cursor = 0;
      const lineSeg = Q.name === "low" ? 12 : 22;
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(lineSeg * 6), 3));
      lineGeo.boundingSphere = new Sphere(new Vector3(), 1e5);
      ownedGeos.push(lineGeo);
      const fireLine = new LineSegments(lineGeo, matAcquire("furnace:line", () => new LineBasicMaterial({
        color: new Color(16742954),
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
        depthWrite: false
      })));
      fireLine.frustumCulled = false;
      g.add(fireLine);
      const lineTrail = [];
      for (let i = 0; i < lineSeg; i++) lineTrail.push(new Vector3());
      const h = new Handle();
      h.object = g;
      h._onHit = null;
      h._hitDone = false;
      h._from = new Vector3();
      h._to = new Vector3();
      h._dir = new Vector3(0, 0, -1);
      h.use(head.material);
      h.use(trail.material);
      h.use(fireLine.material);
      h.setPath = (a, b) => {
        h._from.copy(a);
        h._to.copy(b);
        h._dir.copy(b).sub(a);
        if (h._dir.lengthSq() < 1e-8) h._dir.set(0, 0, -1);
        h._dir.normalize();
      };
      h.setPos = (p) => {
        _v14.copy(p).sub(h._from);
        h._from.copy(p);
        h._to.add(_v14);
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = null;
        h._onHit = c.onHit || null;
        h._hitDone = false;
        h.setPath(c.from, c.to);
        g.position.copy(h._from);
        g.lookAt(_v24.copy(h._from).add(h._dir));
        head.visible = true;
        cursor = 0;
        tLife.fill(0);
        for (let i = 0; i < trailN; i++) tArr[i * 3 + 1] = -9999;
        for (const p of lineTrail) p.copy(h._from);
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        const fly = smoothstep01(0.1, 0.72, k);
        _v14.copy(h._from).lerp(h._to, fly);
        g.position.copy(_v14);
        g.lookAt(_v24.copy(_v14).add(h._dir));
        const flying = k < 0.74;
        head.visible = flying;
        head.material.uniforms.uTime.value = h.t;
        head.material.uniforms.uAlpha.value = flying ? 1 : 0;
        const hs = 1 + Math.sin(h.t * 22) * 0.12;
        head.scale.set(hs, hs * 1.6, hs);
        if (flying) {
          const spawns = Q.name === "low" ? 1 : 2;
          for (let s = 0; s < spawns; s++) {
            const i = cursor;
            cursor = (cursor + 1) % trailN;
            const s1 = tSeeds[i];
            tPos[i * 3] = g.position.x + (rand2() - 0.5) * 1.2;
            tPos[i * 3 + 1] = g.position.y + (rand2() - 0.5) * 1.2;
            tPos[i * 3 + 2] = g.position.z + (rand2() - 0.5) * 1.2;
            tVel[i * 3] = -h._dir.x * (2 + rand2() * 4) + (rand2() - 0.5) * 2.4;
            tVel[i * 3 + 1] = -h._dir.y * (2 + rand2() * 4) + 1.4 + s1 * 2;
            tVel[i * 3 + 2] = -h._dir.z * (2 + rand2() * 4) + (rand2() - 0.5) * 2.4;
            tLife[i] = 0.55 + s1 * 0.5;
          }
        }
        for (let i = 0; i < trailN; i++) {
          if (tLife[i] > 0) {
            tLife[i] -= dt;
            tPos[i * 3] += tVel[i * 3] * dt;
            tPos[i * 3 + 1] += tVel[i * 3 + 1] * dt;
            tPos[i * 3 + 2] += tVel[i * 3 + 2] * dt;
            tVel[i * 3 + 1] -= 1.2 * dt;
            tVel[i * 3] *= 1 - 1.6 * dt;
            tVel[i * 3 + 2] *= 1 - 1.6 * dt;
            tArr[i * 3] = tPos[i * 3];
            tArr[i * 3 + 1] = tPos[i * 3 + 1];
            tArr[i * 3 + 2] = tPos[i * 3 + 2];
          } else {
            tArr[i * 3] = 0;
            tArr[i * 3 + 1] = -9999;
            tArr[i * 3 + 2] = 0;
          }
        }
        trailGeo.attributes.position.needsUpdate = true;
        for (let i = lineSeg - 1; i > 0; i--) lineTrail[i].copy(lineTrail[i - 1]);
        lineTrail[0].copy(g.position);
        const larr = lineGeo.attributes.position.array;
        for (let i = 0; i < lineSeg; i++) {
          const a = lineTrail[i];
          const b = lineTrail[Math.min(i + 1, lineSeg - 1)];
          const jitter = 0.35 + i * 0.06;
          larr[i * 6] = a.x + (i % 2 ? jitter : -jitter);
          larr[i * 6 + 1] = a.y + (i % 3 ? jitter : -jitter);
          larr[i * 6 + 2] = a.z + (i % 2 ? -jitter : jitter);
          larr[i * 6 + 3] = b.x;
          larr[i * 6 + 4] = b.y;
          larr[i * 6 + 5] = b.z;
        }
        lineGeo.attributes.position.needsUpdate = true;
        fireLine.material.opacity = 0.85 * (1 - smoothstep01(0.72, 1, k));
        if (!h._hitDone && k >= 0.7) {
          h._hitDone = true;
          if (h._onHit) {
            try {
              h._onHit(h._to.clone());
            } catch (e) {
            }
          }
          call("shockwave", {
            pos: h._to,
            radius: 1.5,
            maxRadius: 26,
            life: 0.6,
            color: C.NEON_AMBER,
            color2: C.CRIMSON,
            thickness: 1.6,
            ringCount: Q.name === "low" ? 0 : 2
          });
          call("hitSpark", {
            pos: h._to,
            color: 16765040,
            color2: C.CRIMSON,
            count: Q.name === "low" ? 16 : 70,
            size: 1.8,
            speed: 34,
            life: 0.85,
            spread: 1,
            gravity: -6
          });
          call("screen", { flash: 0.45, color: 16751162, shake: 0.7, life: 0.3 });
        }
        if (h.t >= h.life) h.finish();
      };
      return h;
    }
    const RIFT_H = 220;
    function createWorldSlash(cfg2) {
      const g = new Group();
      const core = new Mesh(geoRift(), matAcquire("world:rift", () => new ShaderMaterial({
        uniforms: {
          uEdgeA: { value: new Color(15922943) },
          // 一侧偏白
          uEdgeB: { value: new Color(16723818) },
          // 另一侧偏紫红
          uCore: { value: new Color(262922) },
          uTime: { value: 0 },
          uAlpha: { value: 1 },
          uOpen: { value: 0.05 }
        },
        vertexShader: VERT_UV,
        fragmentShader: RIFT_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide
      })));
      g.add(core);
      const fragN = Q.name === "low" ? 0 : Q.name === "medium" ? 12 : 22;
      const fragGeo = fragN > 0 ? triSoup(fragN) : null;
      let fragArr = null;
      const fragData = [];
      let frags = null;
      if (fragN > 0) {
        ownedGeos.push(fragGeo);
        fragArr = fragGeo.attributes.position.array;
        for (let i = 0; i < fragN; i++) {
          fragData.push({
            x: rand2() - 0.5,
            y: rand2(),
            z: (rand2() - 0.5) * 0.4,
            spin: (rand2() - 0.5) * 4,
            fall: 0.5 + rand2() * 1.5,
            s: 0.6 + rand2() * 2.4
          });
        }
        frags = new Mesh(fragGeo, matAcquire("world:fragMat", () => new MeshBasicMaterial({
          color: new Color(1709092),
          side: DoubleSide,
          transparent: true,
          opacity: 0.9
        })));
        frags.frustumCulled = false;
        g.add(frags);
      }
      const h = new Handle();
      h.object = g;
      h._onHit = null;
      h._hitDone = false;
      h._from = new Vector3();
      h._to = new Vector3();
      h._len = 1;
      h._center = new Vector3();
      h.use(core.material);
      if (frags) h.use(frags.material);
      h._layout = () => {
        _v14.copy(h._to).sub(h._from);
        h._len = Math.max(0.01, _v14.length());
        _v24.copy(_v14).normalize();
        h._center.copy(h._from).addScaledVector(_v14, 0.5);
        const up = new Vector3(0, 1, 0);
        _v34.crossVectors(_v24, up);
        if (_v34.lengthSq() < 1e-6) _v34.set(0, 0, 1);
        _v34.normalize();
        _m4.makeBasis(_v24, up, _v34);
        g.quaternion.setFromRotationMatrix(_m4);
        g.position.set(h._center.x, RIFT_H * 0.5 - 4, h._center.z);
        core.scale.set(h._len, 1, 1);
      };
      h.setPath = (a, b) => {
        h._from.copy(a);
        h._to.copy(b);
        h._layout();
      };
      h.setPos = (p) => {
        _v14.copy(p).sub(h._from);
        h._from.copy(p);
        h._to.add(_v14);
        h._layout();
      };
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = null;
        h._onHit = c.onHit || null;
        h._hitDone = false;
        h._from.copy(c.from);
        h._to.copy(c.to);
        h._layout();
        core.material.uniforms.uOpen.value = 0.02;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        let open;
        if (k < 0.1) open = 0.02 + k / 0.1 * 0.03;
        else if (k < 0.22) open = smoothstep01(0, 1, (k - 0.1) / 0.12);
        else open = 1 - smoothstep01(0, 1, (k - 0.22) / 0.78) * 0.92;
        const u = core.material.uniforms;
        u.uOpen.value = Math.max(0.015, open);
        u.uTime.value = h.t;
        u.uAlpha.value = 1 - smoothstep01(0.9, 1, k);
        if (!h._hitDone && k >= 0.2) {
          h._hitDone = true;
          if (h._onHit) {
            try {
              h._onHit(h._to.clone());
            } catch (e) {
            }
          }
          call("screen", { flash: 0.55, color: 16777215, shake: 1.6, chroma: 1.2, life: 0.5 });
          call("shockwave", {
            pos: h._center,
            radius: 4,
            maxRadius: 90,
            life: 0.8,
            color: 16723818,
            color2: 16777215,
            thickness: 2.4,
            ringCount: Q.name === "low" ? 0 : 2
          });
          if (Q.debris) call("debris", { pos: h._center, color: 1709092, count: 16, power: 1.4, size: 1.6, life: 1.6, up: 10 });
        }
        if (frags) {
          for (let i = 0; i < fragN; i++) {
            const d = fragData[i];
            d.y -= dt * d.fall * 0.12;
            if (d.y < -0.5) d.y += 1;
            const cx = d.x * h._len;
            const cy = (d.y - 0.5) * RIFT_H * 0.9;
            const cz = d.z * 6;
            const s = d.s * (1 + 0.3 * Math.sin(h.t * 3 + i));
            const ra = h.t * d.spin;
            const cr = Math.cos(ra), sr = Math.sin(ra);
            const o = i * 9;
            fragArr[o] = cx + cr * s;
            fragArr[o + 1] = cy + sr * s;
            fragArr[o + 2] = cz;
            fragArr[o + 3] = cx - cr * s * 0.5 + sr * s;
            fragArr[o + 4] = cy - sr * s * 0.5 - cr * s;
            fragArr[o + 5] = cz + s * 0.4;
            fragArr[o + 6] = cx - cr * s * 0.5 - sr * s;
            fragArr[o + 7] = cy - sr * s * 0.5 + cr * s;
            fragArr[o + 8] = cz - s * 0.4;
          }
          fragGeo.attributes.position.needsUpdate = true;
          frags.material.opacity = 0.85 * (1 - k) * open;
        }
        if (h.t >= h.life) h.finish();
      };
      return h;
    }
    function createDomainClash(cfg2) {
      const g = new Group();
      const axisN = new Vector3(1, 0, 0);
      const mid = new Vector3();
      const scale = { v: 120 };
      const face = new Mesh(geoQuad(), matAcquire("clash:face", () => new ShaderMaterial({
        uniforms: {
          uCore: { value: new Color(16777215) },
          uA: { value: new Color(C.CYAN) },
          uB: { value: new Color(C.BLOOD) },
          uTime: { value: 0 },
          uTug: { value: 0 },
          uAlpha: { value: 1 },
          uWin: { value: 0 }
        },
        vertexShader: VERT_UV,
        fragmentShader: CLASH_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide
      })));
      const rim = new Mesh(geoRing(0.94, 1, 1), matAcquire("clash:rim", () => new MeshBasicMaterial({
        color: 16777215,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide
      })));
      g.add(face, rim);
      const boltN = Q.lightning ? 6 : 0;
      const boltSeg = 14;
      const boltVertN = Math.max(1, boltN) * boltSeg * 2;
      const boltGeo = new BufferGeometry();
      boltGeo.setAttribute("position", new BufferAttribute(new Float32Array(boltVertN * 3), 3));
      boltGeo.setAttribute("color", new BufferAttribute(new Float32Array(boltVertN * 3), 3));
      boltGeo.setAttribute("aDim", new BufferAttribute(new Float32Array(boltVertN), 1));
      boltGeo.boundingSphere = new Sphere(new Vector3(), 1e5);
      ownedGeos.push(boltGeo);
      const boltArr = boltGeo.attributes.position.array;
      const boltCol = boltGeo.attributes.color.array;
      const boltDim = boltGeo.attributes.aDim.array;
      {
        const cA = new Color(C.CYAN);
        const cB = new Color(16724048);
        for (let b = 0; b < boltN; b++) {
          const c = b % 2 === 0 ? cA : cB;
          for (let v = 0; v < boltSeg * 2; v++) {
            const o = (b * boltSeg * 2 + v) * 3;
            boltCol[o] = c.r;
            boltCol[o + 1] = c.g;
            boltCol[o + 2] = c.b;
          }
        }
      }
      const bolts = boltN > 0 ? new LineSegments(boltGeo, matAcquire("clash:bolt", () => new ShaderMaterial({
        uniforms: {},
        vertexShader: BOLT_VERT,
        fragmentShader: BOLT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexColors: true
      }))) : null;
      if (bolts) {
        bolts.frustumCulled = false;
        g.add(bolts);
      }
      const boltPts = new Float32Array(Math.max(1, boltN) * (boltSeg + 1) * 3);
      const h = new Handle();
      h.object = g;
      h._tug = 0;
      h._tugFn = () => 0;
      h._scale = 120;
      h.use(face.material);
      h.use(rim.material);
      if (bolts) h.use(bolts.material);
      h.apply = (c) => {
        h.life = c.life;
        h._onEnd = c.onEnd || null;
        h._tugFn = typeof c.tug === "function" ? c.tug : () => 0;
        h._tug = 0;
        _v14.copy(c.shrinePos).sub(c.voidPos);
        if (_v14.lengthSq() < 1e-6) _v14.set(1, 0, 0);
        axisN.copy(_v14).normalize();
        mid.copy(c.voidPos).addScaledVector(_v14, 0.5);
        const up = _v34.set(0, 1, 0);
        const right = _v24.crossVectors(up, axisN);
        if (right.lengthSq() < 1e-6) right.set(0, 0, 1);
        right.normalize();
        _m4.makeBasis(right, up, axisN);
        g.quaternion.setFromRotationMatrix(_m4);
        scale.v = Math.max(30, Math.min(190, c.voidPos.distanceTo(c.shrinePos) * 0.6 + 55));
        h._scale = scale.v;
        g.position.copy(mid);
        face.material.uniforms.uWin.value = 0;
        h.t = 0;
        h._ended = false;
        h.alive = true;
      };
      h.update = (dt) => {
        if (!h.alive) return;
        h.t += dt;
        const k = h.life > 0 ? Math.min(h.t / h.life, 1) : 1;
        let tug = 0;
        try {
          tug = h._tugFn();
        } catch (e) {
          tug = 0;
        }
        if (typeof tug !== "number" || !isFinite(tug)) tug = 0;
        tug = Math.max(-1, Math.min(1, tug));
        h._tug = tug;
        g.position.copy(mid).addScaledVector(axisN, -tug * h._scale * 0.16);
        const u = face.material.uniforms;
        u.uTime.value = h.t;
        u.uTug.value = tug;
        const grow = smoothstep01(0, 0.16, k);
        const closing = smoothstep01(0.88, 1, k);
        u.uWin.value = smoothstep01(0.86, 0.99, k) * 0.85;
        u.uAlpha.value = grow * (1 - closing * 0.85);
        const s = h._scale * (0.35 + 0.65 * grow) * (1 + 0.04 * Math.sin(h.t * 6));
        face.scale.set(s, s, 1);
        rim.scale.set(s, s, 1);
        rim.material.opacity = 0.55 * grow * (1 - closing) * (1 + 0.2 * Math.sin(h.t * 9));
        rim.material.color.setRGB(1, 0.9 - 0.2 * tug, 0.92 + 0.08 * tug);
        if (bolts) {
          for (let b = 0; b < boltN; b++) {
            const phase = h.t * (7 + b * 2.3) + b * 1.7;
            const side = b % 2 === 0 ? 1 : -1;
            const base = b * (boltSeg + 1) * 3;
            for (let i = 0; i <= boltSeg; i++) {
              const tt = i / boltSeg;
              const jag = (Math.sin(phase * 3.1 + tt * 27 + b) + Math.sin(phase * 7.7 - tt * 15)) * 0.5;
              const rr2 = (0.25 + tt * 0.75) * 0.5 * s;
              const ang = b * 1.05 + phase * 0.25 + side * tt * 0.5;
              boltPts[base + i * 3] = Math.cos(ang) * rr2 + jag * 6 * (1 - tt);
              boltPts[base + i * 3 + 1] = Math.sin(ang) * rr2 + jag * 6 * tt;
              boltPts[base + i * 3 + 2] = jag * 4;
            }
            const dim = (0.85 - 0.4 * Math.abs(tug)) * grow * (0.5 + 0.5 * Math.abs(Math.sin(phase)));
            const out = b * boltSeg * 2;
            for (let i = 0; i < boltSeg; i++) {
              const s0 = base + i * 3;
              const s1 = base + (i + 1) * 3;
              const o = out + i * 2;
              boltArr[o * 3] = boltPts[s0];
              boltArr[o * 3 + 1] = boltPts[s0 + 1];
              boltArr[o * 3 + 2] = boltPts[s0 + 2];
              boltArr[(o + 1) * 3] = boltPts[s1];
              boltArr[(o + 1) * 3 + 1] = boltPts[s1 + 1];
              boltArr[(o + 1) * 3 + 2] = boltPts[s1 + 2];
              boltDim[o] = dim;
              boltDim[o + 1] = dim;
            }
          }
          boltGeo.attributes.position.needsUpdate = true;
          boltGeo.attributes.aDim.needsUpdate = true;
        }
        if (Q.debris && Math.floor(h.t * 6) !== Math.floor((h.t - dt) * 6)) {
          call("hitSpark", {
            pos: g.position,
            color: tug >= 0 ? C.CYAN : C.CRIMSON,
            color2: 16777215,
            count: 6,
            size: 1,
            speed: 18,
            life: 0.4,
            spread: 1
          });
        }
        if (h.t >= h.life) {
          const winner = tug >= 0 ? "gojo" : "sukuna";
          const col = winner === "gojo" ? C.CYAN : C.CRIMSON;
          call("screen", { flash: 1, color: col, shake: 2.2, chroma: 1.4, life: 0.9, blur: 0.6 });
          call("shockwave", {
            pos: g.position,
            radius: h._scale * 0.4,
            maxRadius: h._scale * 4,
            life: 1,
            color: col,
            color2: 16777215,
            thickness: 4,
            ringCount: Q.name === "low" ? 0 : 3
          });
          if (Q.callout) {
            call("callout", {
              text: winner === "gojo" ? "无量空处 胜" : "伏魔御厨子 胜",
              pos: g.position,
              color: col,
              color2: 16777215,
              life: 1.6,
              size: 1.5
            });
          }
          u.uWin.value = 1;
          h._winner = winner;
          h.finish();
        }
      };
      h._winner = "sukuna";
      h.kill = () => {
        if (!h.alive && h._ended) return;
        const winner = h._tug >= 0 ? "gojo" : "sukuna";
        h._winner = winner;
        const cb = h._onEnd;
        h._onEnd = null;
        h._ended = true;
        h.alive = false;
        h.onKilled();
        if (cb) {
          try {
            cb(winner);
          } catch (e) {
          }
        }
      };
      return h;
    }
    const api = {
      /** 每帧推进全部活跃 handle */
      update(t, dt) {
        if (disposed) return;
        // 第一次 update：把常用术式的材质/几何全部建一遍并渲染一帧，
        // 让 three 在标题画面就把 program 编译掉（避免第一次放技能现编译卡帧）。
        if (!warmed) {
          warmed = true;
          try {
            api.warmSkills();
          } catch (e) {
          }
        }
        const d = typeof dt === "number" && isFinite(dt) ? Math.min(dt, 0.1) : 0;
        for (let i = active.length - 1; i >= 0; i--) {
          const h = active[i];
          if (!h.alive) {
            try {
              h.onKilled();
            } catch (e) {
            }
            active.splice(i, 1);
            continue;
          }
          try {
            h.update(d);
          } catch (e) {
            h.alive = false;
            try {
              h.onKilled();
            } catch (e2) {
            }
            active.splice(i, 1);
          }
        }
      },
      /** 立即结束并回收全部 */
      clear() {
        for (let i = active.length - 1; i >= 0; i--) {
          const h = active[i];
          h.alive = false;
          h._ended = true;
          h._onEnd = null;
          try {
            h.onKilled();
          } catch (e) {
          }
        }
        active.length = 0;
        releaseAll();
      },
      /** 释放全部资源 */
      dispose() {
        api.clear();
        for (const g of ownedGeos) {
          try {
            g.dispose();
          } catch (e) {
          }
        }
        ownedGeos.length = 0;
        for (const m of matRegistry) {
          try {
            m.dispose();
          } catch (e) {
          }
        }
        matRegistry.clear();
        for (const arr of matPools.values()) arr.length = 0;
        matPools.clear();
        geoCache.clear();
        pools.clear();
        disposeTextures();
        shrineGeoCache = null;
        disposed = true;
      },
      /* ------------------------------------------------------------------
       * 预热：在"标题画面"阶段把常用术式各生成一次（放在 y=-400 的地底，
       * 肉眼不可见），life 0.01 让它下一帧就回收。
       * 目的是让 three 提前编译这些 shader program —— 实测第一次放技能
       * 现编译会卡掉一整帧（worstFps 掉到个位数）。
       * 领域（void/shrine/clash）没有预热：它们每次对局最多各出现一次，
       * 而且要建 1024² 文字贴图，放在加载阶段会拖慢首屏。
       * 预生成的材质会留在 matPools 里复用，等于把编译成本前移。
       * ------------------------------------------------------------------ */
      warmSkills() {
        const P = new Vector3(0, -400, 0);
        const P2 = new Vector3(0, -400, -12);
        const D = new Vector3(0, 0, -1);
        const jobs = [
          () => api.blue({ pos: P.clone(), dir: D.clone(), life: 0.01 }),
          () => api.red({ pos: P.clone(), dir: D.clone(), power: 1, life: 0.01 }),
          () => api.purple({ from: P.clone(), to: P2.clone(), mode: "orb", life: 0.01 }),
          () => api.purple({ from: P.clone(), to: P2.clone(), mode: "line", life: 0.01 }),
          () => api.dismantle({ from: P.clone(), to: P2.clone(), count: 2, life: 0.01 }),
          () => api.cleave({ pos: P.clone(), dir: D.clone(), count: 3, life: 0.01 }),
          () => api.furnace({ from: P.clone(), to: P2.clone(), life: 0.01 }),
          () => api.worldSlash({ from: P.clone(), to: P2.clone(), life: 0.01 }),
          () => api.infinityShield({ pos: P.clone(), radius: 1.2, life: 0.01 }),
          // 领域：无量空处要现场画 1024² 的"情报"文字贴图（900 次 fillText），
          // 不预热的话第一次开领域会卡 100ms+（acceptance 的 worstFps 尖峰就是它）。
          // 放到标题画面阶段做，代价是加载多花一点点时间。
          () => api.voidDomain({ pos: P.clone(), life: 0.01 }),
          () => api.shrineDomain({ pos: P2.clone(), life: 0.01 }),
          // 领域对撞（两个领域同时展开时才有）如果不预热，第一次对撞会现编译卡一帧
          () => api.domainClash({ voidPos: P.clone(), shrinePos: P2.clone(), tug: () => 0, life: 0.2 })
        ];
        for (const f of jobs) {
          try {
            f();
          } catch (e) {
          }
        }
      },
      /* ---- 五条悟 ---- */
      blue(o) {
        const c = o || {};
        const cfg2 = {
          pos: c.pos ? c.pos.clone() : new Vector3(),
          dir: c.dir ? c.dir.clone() : new Vector3(0, 1, 0),
          life: clampNum(c.life, 0.1, 60, 3.6),
          onTick: typeof c.onTick === "function" ? c.onTick : null,
          onEnd: typeof c.onEnd === "function" ? c.onEnd : null
        };
        return spawnPooled("blue", () => createBlue(cfg2), cfg2);
      },
      red(o) {
        const c = o || {};
        const cfg2 = {
          pos: c.pos ? c.pos.clone() : new Vector3(),
          dir: c.dir ? c.dir.clone() : new Vector3(0, 1, 0),
          power: clampNum(c.power, 0.55, 2.2, 1),
          life: clampNum(c.life, 0.1, 60, 2.2),
          follow: c.follow || null,
          onEnd: typeof c.onEnd === "function" ? c.onEnd : null
        };
        return spawnPooled("red", () => createRed(cfg2), cfg2);
      },
      purple(o) {
        const c = o || {};
        const from = c.from ? c.from.clone() : new Vector3();
        const to = c.to ? c.to.clone() : from.clone().add(new Vector3(0, 0, -40));
        const mode = c.mode === "line" ? "line" : "orb";
        const cfg2 = {
          from,
          to,
          mode,
          power: clampNum(c.power, 0.5, 1.5, 1),
          life: clampNum(c.life, 0.1, 60, mode === "line" ? 1.5 : 2.4),
          onImpact: typeof c.onImpact === "function" ? c.onImpact : null
        };
        return mode === "line" ? spawnPooled("purple:line", () => makePurpleLine(cfg2), cfg2) : spawnPooled("purple:orb", () => makePurpleOrb(cfg2), cfg2);
      },
      infinityShield(o) {
        const c = o || {};
        const cfg2 = {
          pos: c.pos ? c.pos.clone() : new Vector3(),
          radius: clampNum(c.radius, 0.4, 400, 3.2),
          follow: c.follow || null,
          life: clampNum(c.life, 0.1, 600, 2.5)
        };
        return spawnPooled("infinity", () => createInfinityShield(cfg2), cfg2);
      },
      voidDomain(o) {
        const c = o || {};
        const cfg2 = {
          pos: c.pos ? c.pos.clone() : new Vector3(),
          life: clampNum(c.life, 0.1, 600, 12),
          onEnd: typeof c.onEnd === "function" ? c.onEnd : null
        };
        return spawnPooled("void", () => createVoidDomain(cfg2), cfg2);
      },
      /* ---- 宿傩 ---- */
      dismantle(o) {
        const c = o || {};
        const from = c.from ? c.from.clone() : new Vector3();
        const to = c.to ? c.to.clone() : from.clone().add(new Vector3(0, 0, -20));
        const count = c.count == null ? 3 : Math.max(1, Math.min(24, Math.round(c.count)));
        const q = Q.name === "low" ? Math.max(1, Math.ceil(count * 0.6)) : count;
        const cfg2 = {
          from,
          to,
          count,
          q,
          life: clampNum(c.life, 0.05, 30, 0.9),
          onHit: typeof c.onHit === "function" ? c.onHit : null
        };
        return spawnPooled(`dismantle:${q}`, () => createDismantle(cfg2), cfg2);
      },
      cleave(o) {
        const c = o || {};
        const count = c.count == null ? 9 : Math.max(2, Math.min(20, Math.round(c.count)));
        const q = Q.name === "low" ? Math.max(3, Math.ceil(count * 0.6)) : count;
        const cfg2 = {
          pos: c.pos ? c.pos.clone() : new Vector3(),
          dir: c.dir ? c.dir.clone() : new Vector3(0, 0, -1),
          count,
          q,
          life: clampNum(c.life, 0.05, 30, 1.2),
          onHit: typeof c.onHit === "function" ? c.onHit : null
        };
        return spawnPooled(`cleave:${q}`, () => createCleave(cfg2), cfg2);
      },
      furnace(o) {
        const c = o || {};
        const from = c.from ? c.from.clone() : new Vector3();
        const to = c.to ? c.to.clone() : from.clone().add(new Vector3(0, 0, -30));
        const cfg2 = {
          from,
          to,
          life: clampNum(c.life, 0.1, 30, 1),
          onHit: typeof c.onHit === "function" ? c.onHit : null
        };
        return spawnPooled("furnace", () => createFurnace(cfg2), cfg2);
      },
      shrineDomain(o) {
        const c = o || {};
        const cfg2 = {
          pos: c.pos ? c.pos.clone() : new Vector3(),
          life: clampNum(c.life, 0.1, 600, 14),
          onEnd: typeof c.onEnd === "function" ? c.onEnd : null
        };
        return spawnPooled("shrine", () => createShrineDomain(cfg2), cfg2);
      },
      worldSlash(o) {
        const c = o || {};
        const from = c.from ? c.from.clone() : new Vector3();
        const to = c.to ? c.to.clone() : from.clone().add(new Vector3(0, 0, -60));
        const cfg2 = {
          from,
          to,
          life: clampNum(c.life, 0.1, 30, 1.8),
          onHit: typeof c.onHit === "function" ? c.onHit : null
        };
        return spawnPooled("worldslash", () => createWorldSlash(cfg2), cfg2);
      },
      /* ---- 领域对撞 ---- */
      domainClash(o) {
        const c = o || {};
        const cfg2 = {
          voidPos: c.voidPos ? c.voidPos.clone() : new Vector3(-40, 0, 0),
          shrinePos: c.shrinePos ? c.shrinePos.clone() : new Vector3(40, 0, 0),
          tug: typeof c.tug === "function" ? c.tug : () => 0,
          life: clampNum(c.life, 0.1, 300, 8),
          onEnd: typeof c.onEnd === "function" ? c.onEnd : null
        };
        return spawnPooled("clash", () => createDomainClash(cfg2), cfg2);
      },
      /* ---- 统计 / 调试 ---- */
      get activeCount() {
        return active.length;
      },
      /** 调试：材质 UUID → 池 key（实机排查"不明物体"用） */
      debugMatUuids() {
        const out = {};
        for (const [k, arr] of matPools) for (const e2 of arr) if (e2 && e2.uuid) out[e2.uuid] = k;
        return out;
      },
      /** 调试：各材质池的 (总数 / 占用中) */
      debugMatPools() {
        const out = {};
        for (const [k, arr] of matPools) {
          let busy = 0;
          for (const e of arr) if (e.busy) busy++;
          out[k] = `${arr.length}/${busy}`;
        }
        return out;
      },
      /** 统计当前活跃术式占用的 drawcall 与材质共享情况 */
      stats() {
        const acc = { objects: 0, materials: /* @__PURE__ */ new Set() };
        for (const h of active) {
          if (!h.object) continue;
          countVisibleDrawables(h.object, acc);
        }
        return { handles: active.length, objects: acc.objects, materials: acc.materials.size, pooledMaterials: matRegistry.size };
      }
    };
    return api;
  }
