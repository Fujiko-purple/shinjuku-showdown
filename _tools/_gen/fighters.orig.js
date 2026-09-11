  var ANIM_NAMES = [
    "idle",
    "walk",
    "run",
    "dash",
    "jump",
    "land",
    "punch",
    "punch2",
    "kick",
    "upper",
    "combo_finish",
    "block",
    "block_hit",
    "hit_light",
    "hit_heavy",
    "knockback",
    "getup",
    "cast_charge",
    "cast_release",
    "cast_point",
    "chant",
    "domain_expand",
    "guard_infinity",
    "heal",
    "air_spin",
    "backstep",
    "taunt",
    "victory",
    "defeat",
    "down"
  ];
  var DEG = Math.PI / 180;
  var clamp5 = (v, a, b) => v < a ? a : v > b ? b : v;
  var easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  var easeOut2 = (t) => 1 - Math.pow(1 - t, 3);
  function angleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  var QUALITY3 = {
    low: { seg: 4, radial: 8, hair: 9, secondary: false, cloth: false, shell: false, outline: false, tatooDetail: 6, tex: 128 },
    medium: { seg: 6, radial: 12, hair: 14, secondary: true, cloth: true, shell: true, outline: false, tatooDetail: 10, tex: 256 },
    high: { seg: 8, radial: 16, hair: 20, secondary: true, cloth: true, shell: true, outline: true, tatooDetail: 14, tex: 512 }
  };
  var normQuality = (q) => QUALITY3[q] || QUALITY3.high;
  function makeCanvas2(w, h) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    return cv;
  }
  function paintTexture(size, draw, opts) {
    const o = opts || {};
    const cv = makeCanvas2(size, size);
    if (!cv) return null;
    try {
      const ctx2 = typeof cv.getContext === "function" ? cv.getContext("2d") : null;
      if (!ctx2) return null;
      draw(ctx2, size);
      const tex = new CanvasTexture(cv);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      if (o.repeat) {
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.repeat.set(o.repeat[0], o.repeat[1]);
      }
      tex.needsUpdate = true;
      return tex;
    } catch (e) {
      return null;
    }
  }
  function sprinkle(ctx2, size, count, color, rMin, rMax, alpha) {
    ctx2.globalAlpha = alpha;
    ctx2.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const r = rMin + Math.random() * (rMax - rMin);
      ctx2.beginPath();
      ctx2.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx2.fill();
    }
    ctx2.globalAlpha = 1;
  }
  function texGojoFace(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#efd9c8";
      ctx2.fillRect(0, 0, s, s);
      const g = ctx2.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, "rgba(150,120,110,0.45)");
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(150,120,110,0.45)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s);
      ctx2.fillStyle = "rgba(20,22,32,0.55)";
      ctx2.fillRect(0, s * 0.16, s, s * 0.24);
      ctx2.strokeStyle = "#a9705f";
      ctx2.lineWidth = Math.max(1, s * 0.012);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.44, s * 0.78);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.82, s * 0.56, s * 0.78);
      ctx2.stroke();
      ctx2.strokeStyle = "rgba(160,125,110,0.7)";
      ctx2.lineWidth = Math.max(1, s * 8e-3);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.5, s * 0.46);
      ctx2.lineTo(s * 0.5, s * 0.66);
      ctx2.stroke();
    });
  }
  function texGojoBlindfold(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#0a0c14";
      ctx2.fillRect(0, 0, s, s);
      ctx2.fillStyle = "#181c28";
      ctx2.fillRect(0, s * 0.18, s, s * 0.64);
      ctx2.fillStyle = "rgba(120,140,180,0.20)";
      ctx2.fillRect(0, s * 0.3, s, s * 0.05);
      ctx2.fillStyle = "rgba(255,255,255,0.06)";
      ctx2.fillRect(0, s * 0.6, s, s * 0.03);
      sprinkle(ctx2, s, 40, "#000000", 1, 2.5, 0.35);
    });
  }
  function texSukunaFace(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#f0dccb";
      ctx2.fillRect(0, 0, s, s);
      const g = ctx2.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, "rgba(140,110,100,0.42)");
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(140,110,100,0.42)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s);
      ctx2.strokeStyle = "#0b0b10";
      ctx2.lineCap = "round";
      ctx2.lineWidth = s * 0.022;
      ctx2.beginPath();
      ctx2.moveTo(s * 0.5, s * 0.04);
      ctx2.lineTo(s * 0.5, s * 0.2);
      ctx2.stroke();
      ctx2.lineWidth = s * 0.016;
      ctx2.beginPath();
      ctx2.moveTo(s * 0.36, s * 0.1);
      ctx2.lineTo(s * 0.64, s * 0.1);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.4, s * 0.045);
      ctx2.lineTo(s * 0.6, s * 0.045);
      ctx2.stroke();
      ctx2.lineWidth = s * 0.02;
      ctx2.beginPath();
      ctx2.moveTo(s * 0.33, s * 0.5);
      ctx2.lineTo(s * 0.67, s * 0.5);
      ctx2.stroke();
      ctx2.lineWidth = s * 0.015;
      ctx2.beginPath();
      ctx2.moveTo(s * 0.34, s * 0.6);
      ctx2.quadraticCurveTo(s * 0.3, s * 0.78, s * 0.4, s * 0.92);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.66, s * 0.6);
      ctx2.quadraticCurveTo(s * 0.7, s * 0.78, s * 0.6, s * 0.92);
      ctx2.stroke();
      ctx2.fillStyle = "#1a1216";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.34, s * 0.38, s * 0.085, s * 0.038, -0.12, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.ellipse(s * 0.66, s * 0.38, s * 0.085, s * 0.038, 0.12, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.ellipse(s * 0.3, s * 0.6, s * 0.055, s * 0.03, -0.25, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.ellipse(s * 0.7, s * 0.6, s * 0.055, s * 0.03, 0.25, 0, Math.PI * 2);
      ctx2.fill();
    });
  }
  function texSukunaKimono(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#f2ece0";
      ctx2.fillRect(0, 0, s, s);
      ctx2.strokeStyle = "#12131a";
      ctx2.lineWidth = s * 0.012;
      for (let i = -2; i < 6; i++) {
        ctx2.beginPath();
        ctx2.moveTo(s * (i * 0.22), 0);
        ctx2.lineTo(s * (i * 0.22 + 0.3), s);
        ctx2.stroke();
      }
      ctx2.lineWidth = s * 6e-3;
      for (let i = 0; i < 5; i++) {
        const y = s * (0.14 + i * 0.18);
        ctx2.beginPath();
        ctx2.moveTo(0, y);
        ctx2.lineTo(s, y);
        ctx2.stroke();
      }
      sprinkle(ctx2, s, 60, "#b9b2a4", 1, 2, 0.35);
    }, { repeat: [2, 2] });
  }
  function texRunes(size, colorA, colorB) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#000000";
      ctx2.fillRect(0, 0, s, s);
      ctx2.strokeStyle = colorA;
      ctx2.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        ctx2.lineWidth = s * (0.012 - i * 2e-3);
        ctx2.globalAlpha = 0.85 - i * 0.12;
        ctx2.beginPath();
        ctx2.arc(s * 0.5, s * 0.5, s * (0.16 + i * 0.09), 0, Math.PI * 2);
        ctx2.stroke();
      }
      ctx2.globalAlpha = 0.95;
      ctx2.lineWidth = s * 0.014;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        const r0 = s * 0.18, r1 = s * (0.36 + i % 3 * 0.05);
        ctx2.strokeStyle = i % 2 ? colorA : colorB;
        ctx2.beginPath();
        ctx2.moveTo(s * 0.5 + Math.cos(a) * r0, s * 0.5 + Math.sin(a) * r0);
        ctx2.lineTo(s * 0.5 + Math.cos(a) * r1, s * 0.5 + Math.sin(a) * r1);
        ctx2.stroke();
      }
      ctx2.fillStyle = colorB;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + 0.3;
        ctx2.save();
        ctx2.translate(s * 0.5 + Math.cos(a) * s * 0.28, s * 0.5 + Math.sin(a) * s * 0.28);
        ctx2.rotate(a);
        ctx2.fillRect(-s * 0.02, -s * 6e-3, s * 0.04, s * 0.012);
        ctx2.restore();
      }
      ctx2.globalAlpha = 1;
    });
  }
  function texGlow2(size, inner, outer) {
    return paintTexture(size, (ctx2, s) => {
      const g = ctx2.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.5);
      g.addColorStop(0, inner);
      g.addColorStop(0.45, outer);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = "#000000";
      ctx2.fillRect(0, 0, s, s);
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s);
    });
  }
  var TOON_VERT = (
    /* glsl */
    `
  #include <common>
  #include <fog_pars_vertex>
  #include <color_pars_vertex>
  varying vec3 vNrm;
  varying vec3 vWPos;
  varying vec2 vUv2;
  void main() {
    #include <color_vertex>
    vUv2 = uv;
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vWPos = wp.xyz;
    vNrm = normalize( mat3( modelMatrix ) * normal );
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
  );
  var TOON_FRAG = (
    /* glsl */
    `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform vec3 uEmissive;
  uniform vec3 uLightDir;
  uniform vec3 uAmbient;
  uniform vec3 uLightColor;
  uniform vec3 uFill;
  uniform float uBands;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform float uEmissiveI;
  uniform float uFlash;
  uniform float uAlpha;
  uniform float uOpacity;
  uniform float uUseMap;
  uniform float uUvScale;
  uniform float uOutline;
  uniform float uGlowOnly;
  #ifdef USE_MAP
  uniform sampler2D uMap;
  #endif
  varying vec3 vNrm;
  varying vec3 vWPos;
  varying vec2 vUv2;

  void main() {
    vec3 N = normalize( vNrm );
    vec3 V = normalize( cameraPosition - vWPos );
    vec3 base = uColor;
    float alpha = uAlpha;
    #ifdef USE_MAP
      vec3 texc = texture2D( uMap, vUv2 * uUvScale ).rgb;
      base = mix( base, base * texc * 1.35, uUseMap );
    #endif

    // --- 2 段 / 3 段色阶（固定方向光，不依赖 scene 真实光源） ---
    float ndl = dot( N, uLightDir );
    float bands = max( uBands, 1.0 );
    float lit = floor( clamp( ndl * 0.5 + 0.5, 0.0, 0.9999 ) * bands ) / ( bands - 1.0 + 1e-4 );
    lit = clamp( lit, 0.0, 1.0 );
    vec3 col = base * mix( uAmbient, uLightColor, lit );
    // 半球补光（上方偏冷，下方偏暖），避免暗部死黑
    col += base * uFill * ( N.y * 0.5 + 0.5 );

    // --- Fresnel 边缘光（颜色 = 角色咒力色） ---
    float fres = pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), max( uRimPower, 0.35 ) );
    col += uRim * fres * uRimStrength;

    // --- 自发光 / 受击闪白 ---
    col += uEmissive * uEmissiveI;
    col = mix( col, vec3( 1.0 ), clamp( uFlash, 0.0, 1.0 ) );

    // 描边：只保留背离视线的壳
    if ( uOutline > 0.0 ) {
      col = uRim * fres * uRimStrength;
      alpha *= smoothstep( 0.10, 0.55, fres );
    }
    if ( uGlowOnly > 0.0 ) {
      col += uColor * fres * uGlowOnly;
    }
    gl_FragColor = vec4( col, alpha * uOpacity );
    #include <fog_fragment>
  }
`
  );
  var AMBIENT = new Color(2239554);
  var LIGHT_COLOR = new Color(11058909);
  var FILL = new Color(1317162);
  var LIGHT_DIR = new Vector3(0.42, -0.8, 0.43).normalize();
  var SUN_DIR = LIGHT_DIR.clone().negate().normalize();
  var _tmpColor = new Color();
  var matCache = /* @__PURE__ */ new WeakMap();
  function toonMat(src, argb, o) {
    const opt = o || {};
    const rim = opt.rim !== void 0 ? opt.rim : src.rim;
    const emi = opt.emissive !== void 0 ? opt.emissive : 0;
    const key = [
      argb,
      rim,
      opt.rimPower || src.rimPower,
      opt.rimStrength !== void 0 ? opt.rimStrength : src.rimStrength,
      emi,
      opt.emissiveI || 0,
      opt.bands || src.bands,
      opt.map ? opt.map.uuid : "-",
      opt.uvScale !== void 0 ? opt.uvScale : 1,
      opt.transparent ? 1 : 0,
      opt.opacity !== void 0 ? opt.opacity : 1,
      opt.glowOnly || 0,
      opt.outline ? 1 : 0,
      opt.side !== void 0 ? opt.side : 0,
      opt.blending !== void 0 ? opt.blending : 0
    ].join("|");
    let bag = matCache.get(src);
    if (!bag) {
      bag = /* @__PURE__ */ new Map();
      matCache.set(src, bag);
    }
    const hit = bag.get(key);
    if (hit) return hit;
    const uni = UniformsUtils.merge([UniformsLib.fog, {}]);
    uni.uColor = { value: new Color(argb) };
    uni.uRim = { value: new Color(rim) };
    uni.uEmissive = { value: new Color(emi) };
    uni.uLightDir = { value: SUN_DIR.clone() };
    uni.uAmbient = { value: AMBIENT.clone() };
    uni.uLightColor = { value: LIGHT_COLOR.clone() };
    uni.uFill = { value: FILL.clone() };
    uni.uBands = { value: opt.bands || src.bands };
    uni.uRimPower = { value: opt.rimPower !== void 0 ? opt.rimPower : src.rimPower };
    uni.uRimStrength = { value: opt.rimStrength !== void 0 ? opt.rimStrength : src.rimStrength };
    uni.uEmissiveI = { value: opt.emissiveI || 0 };
    uni.uFlash = { value: 0 };
    uni.uAlpha = { value: 1 };
    uni.uOpacity = { value: opt.opacity !== void 0 ? opt.opacity : 1 };
    uni.uUseMap = { value: opt.map ? 1 : 0 };
    uni.uUvScale = { value: opt.uvScale !== void 0 ? opt.uvScale : 1 };
    uni.uOutline = { value: opt.outline ? 1 : 0 };
    uni.uGlowOnly = { value: opt.glowOnly || 0 };
    if (opt.map) uni.uMap = { value: opt.map };
    const mat = new ShaderMaterial({
      uniforms: uni,
      vertexShader: TOON_VERT,
      fragmentShader: TOON_FRAG,
      // 只声明真正用得到的宏，避免出现空 sampler / 空 attribute 导致程序链接失败
      defines: opt.map ? { USE_MAP: "" } : {},
      fog: true,
      lights: false,
      transparent: !!opt.transparent,
      depthWrite: opt.transparent ? false : true,
      side: opt.side !== void 0 ? opt.side : FrontSide,
      blending: opt.blending !== void 0 ? opt.blending : NormalBlending
    });
    mat.userData.base = {
      color: new Color(argb),
      emissive: new Color(emi),
      emissiveI: opt.emissiveI || 0,
      rimStrength: opt.rimStrength !== void 0 ? opt.rimStrength : src.rimStrength,
      opacity: opt.opacity !== void 0 ? opt.opacity : 1
    };
    mat.userData.isToon = true;
    bag.set(key, mat);
    return mat;
  }
  function collectToonMaterials(root) {
    const set = /* @__PURE__ */ new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && m.userData && m.userData.isToon) set.add(m);
    });
    return [...set];
  }
  var _boxCache = /* @__PURE__ */ new Map();
  function boxGeo(w, h, d) {
    const k = `b${w}|${h}|${d}`;
    let g = _boxCache.get(k);
    if (!g) {
      g = new BoxGeometry(w, h, d);
      _boxCache.set(k, g);
    }
    return g;
  }
  function limbGeo(q, r, len) {
    return new CapsuleGeometry(r, Math.max(0.01, len - r * 2), q.seg, q.radial);
  }
  function bakeGradient(geo, colTop, colBot, yMin, yMax) {
    const pos = geo.attributes.position;
    const n = pos.count;
    const arr = new Float32Array(n * 3);
    const a = new Color(colBot), b = new Color(colTop), t = new Color();
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      const k = clamp5((y - yMin) / Math.max(1e-4, yMax - yMin), 0, 1);
      t.copy(a).lerp(b, k);
      arr[i * 3] = t.r;
      arr[i * 3 + 1] = t.g;
      arr[i * 3 + 2] = t.b;
    }
    geo.setAttribute("color", new BufferAttribute(arr, 3));
    return geo;
  }
  function gojoPalette(q) {
    const src = {
      rim: C.CYAN,
      rimPower: 2.1,
      rimStrength: 0.42,
      bands: 2,
      tex: { face: texGojoFace(q.tex), blindfold: texGojoBlindfold(q.tex), runes: texRunes(q.tex, "#5ff0ff", "#2b86ff"), glow: texGlow2(q.tex, "#ffffff", "#5ff0ff") }
    };
    const M = (c, o) => toonMat(src, c, o);
    src.mat = {
      // 制服：深蓝黑高领外套
      coat: M(1514283, { rim: C.NEON_CYAN, rimStrength: 0.5 }),
      coatLo: M(1053471),
      collar: M(1909299, { rim: C.CYAN, rimStrength: 0.62 }),
      pants: M(855832),
      boots: M(526865, { rim: C.NEON_CYAN, rimStrength: 0.3 }),
      skin: M(15718856, { bands: 3, rim: 16770773, rimPower: 2.6, rimStrength: 0.22 }),
      face: M(16777215, { map: src.tex.face, bands: 3, rim: 16770773, rimPower: 2.6, rimStrength: 0.2 }),
      hair: M(C.WHITE, { bands: 2, rim: C.CYAN, rimStrength: 0.95, rimPower: 1.5, emissive: C.AZURE, emissiveI: 0.1 }),
      blindfold: M(16777215, { map: src.tex.blindfold, rim: 2767450, rimStrength: 0.35 }),
      eye: M(C.CYAN, { rim: C.CYAN, rimStrength: 0.8, emissive: C.NEON_CYAN, emissiveI: 2.4, bands: 1 }),
      eyeGlow: M(C.CYAN, { transparent: true, opacity: 0.55, blending: AdditiveBlending, glowOnly: 1, rim: C.GOLD, side: DoubleSide }),
      runes: M(C.CYAN, { map: src.tex.runes, transparent: true, opacity: 0.9, blending: AdditiveBlending, glowOnly: 0.9, side: DoubleSide, rim: C.AZURE, rimStrength: 0.6 }),
      shell: M(C.AZURE, { transparent: true, opacity: 0.16, blending: AdditiveBlending, glowOnly: 2.1, rimPower: 1.7, side: DoubleSide }),
      outline: M(329228, { outline: true, rim: C.NEON_CYAN, rimStrength: 0.75, rimPower: 1.6, transparent: true, opacity: 0.9, side: BackSide })
    };
    src.auraColor = C.NEON_CYAN;
    src.eyeColor = C.CYAN;
    return src;
  }
  function sukunaPalette(q) {
    const src = {
      rim: C.CRIMSON,
      rimPower: 1.9,
      rimStrength: 0.46,
      bands: 2,
      tex: { face: texSukunaFace(q.tex), kimono: texSukunaKimono(q.tex), runes: texRunes(q.tex, "#ff2b2b", "#8c0b1e"), glow: texGlow2(q.tex, "#ffd0d0", "#ff1f3d") }
    };
    const M = (c, o) => toonMat(src, c, o);
    src.mat = {
      skin: M(15785163, { bands: 3, rim: 16763328, rimPower: 2.4, rimStrength: 0.24 }),
      face: M(16777215, { map: src.tex.face, bands: 3, rim: 16763328, rimPower: 2.4, rimStrength: 0.22 }),
      // 白底黑纹和服
      robe: M(15920352, { map: src.tex.kimono, uvScale: 2, rim: C.CRIMSON, rimStrength: 0.38 }),
      robeDark: M(1184538, { rim: C.BLOOD, rimStrength: 0.55 }),
      sash: M(1711142, { rim: C.CRIMSON, rimStrength: 0.42 }),
      tattoo: M(723728, { rim: C.BLOOD, rimStrength: 0.3 }),
      hair: M(15760018, { bands: 2, rim: C.CRIMSON, rimStrength: 0.9, rimPower: 1.5, emissive: 3802896, emissiveI: 0.3 }),
      eye: M(C.CRIMSON, { rim: C.SCARLET, rimStrength: 0.85, emissive: C.SCARLET, emissiveI: 2, bands: 1 }),
      eye2: M(C.BLOOD, { rim: C.CRIMSON, rimStrength: 0.7, emissive: C.CRIMSON, emissiveI: 0, bands: 1 }),
      eyeGlow: M(C.CRIMSON, { transparent: true, opacity: 0.5, blending: AdditiveBlending, glowOnly: 1, side: DoubleSide }),
      runes: M(C.CRIMSON, { map: src.tex.runes, transparent: true, opacity: 0.9, blending: AdditiveBlending, glowOnly: 0.9, side: DoubleSide, rim: C.SCARLET, rimStrength: 0.6 }),
      shell: M(C.CRIMSON, { transparent: true, opacity: 0.17, blending: AdditiveBlending, glowOnly: 2.1, rimPower: 1.7, side: DoubleSide }),
      outline: M(655878, { outline: true, rim: C.CRIMSON, rimStrength: 0.8, rimPower: 1.5, transparent: true, opacity: 0.9, side: BackSide }),
      sandal: M(2759444)
    };
    src.auraColor = C.CRIMSON;
    src.eyeColor = C.CRIMSON;
    return src;
  }
  var BONES = [
    "hips",
    "core",
    "chest",
    "neck",
    "head",
    "shoulderL",
    "upperArmL",
    "foreArmL",
    "handL",
    "shoulderR",
    "upperArmR",
    "foreArmR",
    "handR",
    "thighL",
    "shinL",
    "footL",
    "thighR",
    "shinR",
    "footR",
    "arm2L1",
    "arm2L2",
    "arm2R1",
    "arm2R2"
  ];
  function buildRig(who, src, q) {
    const isGojo = who === "gojo";
    const M = src.mat;
    const sk = isGojo ? 1 : 0.974;
    const root = new Group();
    root.name = who;
    const bones = {};
    const cloth = [];
    const hairTips = [];
    const outlineMeshes = [];
    const meshBag = [];
    const mk = (name, parent, x, y, z, order) => {
      const g = new Group();
      g.name = name;
      g.position.set(x, y, z);
      g.rotation.order = order || "ZYX";
      parent.add(g);
      bones[name] = g;
      return g;
    };
    const part = (parent, name, geo, mat, x, y, z) => {
      const m = new Mesh(geo, mat);
      m.name = name;
      m.position.set(x, y, z);
      m.castShadow = false;
      m.receiveShadow = false;
      parent.add(m);
      meshBag.push(m);
      return m;
    };
    const shell = (parent, geo, s) => {
      if (!q.outline) return;
      const m = new Mesh(geo, M.outline);
      m.scale.setScalar(s);
      m.position.copy(parent.position);
      parent.parent.add(m);
      outlineMeshes.push({ mesh: m, host: parent });
    };
    const hipsY = 1.06 * sk;
    const hips = mk("hips", root, 0, hipsY, 0);
    const core = mk("core", hips, 0, 0.1 * sk, 0);
    const chest = mk("chest", core, 0, 0.15 * sk, 0);
    const neck = mk("neck", chest, 0, 0.235 * sk, 0);
    const head = mk("head", neck, 0, 0.085 * sk, 0);
    part(hips, "pelvisMesh", boxGeo(0.3 * sk, 0.2 * sk, 0.2 * sk), M.coat, 0, -0.01 * sk, 0);
    part(core, "abdomenMesh", boxGeo(0.29 * sk, 0.18 * sk, 0.19 * sk), M.coat, 0, -0.04 * sk, 0);
    const chestMesh = part(chest, "chestMesh", new CylinderGeometry(0.205 * sk, 0.165 * sk, 0.3 * sk, q.radial, 1), M.coat, 0, -0.02 * sk, 0);
    chestMesh.scale.set(1, 1, 0.68);
    part(chest, "backMesh", boxGeo(0.34 * sk, 0.26 * sk, 0.1 * sk), M.coatLo, 0, -0.01 * sk, -0.075 * sk);
    if (isGojo) {
      part(chest, "collarMesh", new CylinderGeometry(0.115 * sk, 0.135 * sk, 0.2 * sk, q.radial, 1, true), M.collar, 0, 0.16 * sk, 0);
      part(core, "zipMesh", boxGeo(0.035 * sk, 0.4 * sk, 0.02 * sk), M.collar, 0, 0.02 * sk, 0.1 * sk);
      const hemCount = q.cloth ? 8 : 4;
      for (let i = 0; i < hemCount; i++) {
        const a = i / hemCount * Math.PI * 2;
        const pg = new PlaneGeometry(0.2 * sk, 0.3 * sk, 1, q.cloth ? 3 : 1);
        const p = new Mesh(pg, M.coat);
        p.position.set(Math.sin(a) * 0.155 * sk, -0.3 * sk, Math.cos(a) * 0.135 * sk);
        p.rotation.y = a;
        hips.add(p);
        cloth.push({ mesh: p, base: p.rotation.clone(), basePos: p.position.clone(), amp: 0.16, axis: "x", phase: a });
        meshBag.push(p);
      }
    } else {
      const lapelL = new Mesh(new PlaneGeometry(0.16 * sk, 0.44 * sk), M.robeDark);
      lapelL.position.set(0.055 * sk, 0.02 * sk, 0.105 * sk);
      lapelL.rotation.set(0.06, 0, 0.3);
      chest.add(lapelL);
      meshBag.push(lapelL);
      const lapelR = lapelL.clone();
      lapelR.position.x = -0.055 * sk;
      lapelR.rotation.z = -0.3;
      chest.add(lapelR);
      meshBag.push(lapelR);
      part(hips, "sashMesh", new CylinderGeometry(0.185 * sk, 0.185 * sk, 0.13 * sk, q.radial, 1), M.sash, 0, 0.1 * sk, 0);
      part(hips, "sashKnot", boxGeo(0.1 * sk, 0.1 * sk, 0.1 * sk), M.robeDark, 0, 0.1 * sk, -0.16 * sk);
      const hemCount = q.cloth ? 12 : 5;
      for (let i = 0; i < hemCount; i++) {
        const a = i / hemCount * Math.PI * 2;
        const pg = new PlaneGeometry(0.19 * sk, 0.52 * sk, 1, q.cloth ? 4 : 1);
        if (q.cloth) bakeGradient(pg, 2763312, 16777215, -0.26 * sk, 0.26 * sk);
        const p = new Mesh(pg, M.robe);
        p.position.set(Math.sin(a) * 0.17 * sk, -0.34 * sk, Math.cos(a) * 0.15 * sk);
        p.rotation.y = a;
        hips.add(p);
        cloth.push({ mesh: p, base: p.rotation.clone(), basePos: p.position.clone(), amp: 0.3, axis: "x", phase: a });
        meshBag.push(p);
      }
    }
    const headGeo = boxGeo(0.185 * sk, 0.225 * sk, 0.205 * sk);
    part(head, "skullMesh", headGeo, M.skin, 0, 0.105 * sk, -8e-3);
    part(head, "jawMesh", boxGeo(0.15 * sk, 0.075 * sk, 0.16 * sk), M.skin, 0, 0.045 * sk, 0.018);
    const facePlane = new Mesh(new PlaneGeometry(0.2 * sk, 0.21 * sk), M.face);
    facePlane.position.set(0, 0.115 * sk, 0.1);
    head.add(facePlane);
    meshBag.push(facePlane);
    part(neck, "neckMesh", new CapsuleGeometry(0.055 * sk, 0.06 * sk, q.seg, q.radial), M.skin, 0, 0, 0);
    const eyeZ = 0.104;
    if (isGojo) {
      const bf = new Mesh(new CylinderGeometry(0.107 * sk, 0.107 * sk, 0.075 * sk, q.radial, 1, true), M.blindfold);
      bf.position.set(0, 0.135 * sk, -5e-3);
      bf.scale.set(1, 1, 1.08);
      head.add(bf);
      meshBag.push(bf);
      for (const s of [1, -1]) {
        const eye = new Mesh(new PlaneGeometry(0.075 * sk, 0.03 * sk), M.eye);
        eye.position.set(s * 0.042 * sk, 0.133 * sk, eyeZ);
        eye.visible = false;
        eye.name = "eyeGlow" + (s > 0 ? "L" : "R");
        head.add(eye);
        meshBag.push(eye);
        const halo = new Mesh(new PlaneGeometry(0.16 * sk, 0.1 * sk), M.eyeGlow);
        halo.position.set(s * 0.042 * sk, 0.133 * sk, eyeZ - 4e-3);
        halo.visible = false;
        halo.name = "eyeHalo" + (s > 0 ? "L" : "R");
        head.add(halo);
        meshBag.push(halo);
      }
    } else {
      for (const s of [1, -1]) {
        const eye = new Mesh(new PlaneGeometry(0.058 * sk, 0.026 * sk), M.eye);
        eye.position.set(s * 0.04 * sk, 0.14 * sk, eyeZ);
        head.add(eye);
        meshBag.push(eye);
        const eye2 = new Mesh(new PlaneGeometry(0.042 * sk, 0.02 * sk), M.eye2);
        eye2.position.set(s * 0.046 * sk, 0.095 * sk, eyeZ);
        eye2.name = "eye2" + (s > 0 ? "L" : "R");
        head.add(eye2);
        meshBag.push(eye2);
      }
      const tt = M.tattoo;
      const tat = (w, h, x, y, z, rx) => {
        const m = new Mesh(boxGeo(w * sk, h * sk, 0.012), tt);
        m.position.set(x * sk, y * sk, z);
        if (rx) m.rotation.x = rx;
        head.add(m);
        meshBag.push(m);
      };
      tat(0.02, 0.075, 0, 0.2, 0.098);
      tat(0.115, 0.014, 0, 0.222, 0.098);
      tat(0.075, 0.014, 0, 0.183, 0.1);
      tat(0.135, 0.016, 0, 0.078, 0.101);
      for (const s of [1, -1]) {
        tat(0.014, 0.115, s * 0.072, 0.045, 0.098);
        tat(0.016, 0.06, s * 0.086, 0.135, 0.092);
      }
      const bodyTat = (w, h, x, y, z, parent) => {
        const m = new Mesh(boxGeo(w * sk, h * sk, 0.014), tt);
        m.position.set(x * sk, y * sk, z);
        parent.add(m);
        meshBag.push(m);
      };
      bodyTat(0.026, 0.24, 0, -0.02, 0.1, chest);
      bodyTat(0.15, 0.018, 0, 0.06, 0.1, chest);
      bodyTat(0.16, 0.016, 0, 0, 0.1, core);
      for (const s of [1, -1]) bodyTat(0.017, 0.14, s * 0.085, -0.03, 0.075, chest);
    }
    const hairCol = isGojo ? 16777215 : 15760018;
    const hairCount = q.hair;
    const hairRng = (i) => (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1;
    for (let i = 0; i < hairCount; i++) {
      const layer = i < hairCount * 0.55 ? 0 : 1;
      const n = layer === 0 ? Math.round(hairCount * 0.55) : hairCount - Math.round(hairCount * 0.55);
      const j = layer === 0 ? i : i - Math.round(hairCount * 0.55);
      const a = j / n * Math.PI * 2 + layer * 0.4;
      const r = layer === 0 ? 0.062 * sk : 0.078 * sk;
      const len = (layer === 0 ? 0.2 : 0.145) * sk * (0.8 + hairRng(i) * 0.5);
      const rad = (layer === 0 ? 0.04 : 0.034) * sk;
      const cone = new Mesh(new ConeGeometry(rad, len, q.seg > 6 ? 5 : 4, 1), M.hair);
      const spread = isGojo ? 0.45 : 0.75;
      cone.position.set(Math.sin(a) * r, 0.215 * sk + len * 0.42, Math.cos(a) * r - 0.01);
      cone.rotation.order = "ZYX";
      cone.rotation.x = Math.cos(a) * spread * (isGojo ? -1 : 1) * 0.8 - 0.1;
      cone.rotation.z = -Math.sin(a) * spread * (isGojo ? 1 : -1) * 0.8;
      cone.rotation.y = a;
      head.add(cone);
      meshBag.push(cone);
      if (q.secondary) hairTips.push({ mesh: cone, base: cone.rotation.clone(), lag: hairRng(i + 99) * 0.4 + 0.6 });
    }
    part(head, "hairBack", boxGeo(0.175 * sk, 0.14 * sk, 0.1 * sk), M.hair, 0, 0.185 * sk, -0.062);
    const shoulderX = 0.185 * sk;
    const mkArm = (side, tag) => {
      const s = side;
      const sh = mk("shoulder" + tag, chest, s * shoulderX, 0.19 * sk, 0);
      const ua = mk("upperArm" + tag, sh, 0, -0.035 * sk, 0);
      const fa = mk("foreArm" + tag, ua, 0, -0.295 * sk, 0);
      const hd = mk("hand" + tag, fa, 0, -0.275 * sk, 0);
      part(sh, "deltoid" + tag, new SphereGeometry(0.078 * sk, q.radial, q.seg), isGojo ? M.coat : M.robe, 0, 0, 0);
      part(ua, "upperArmMesh" + tag, limbGeo(q, 0.062 * sk, 0.295 * sk), isGojo ? M.coat : M.robe, 0, -0.147 * sk, 0);
      part(fa, "foreArmMesh" + tag, limbGeo(q, 0.052 * sk, 0.275 * sk), isGojo ? M.coat : tag === "L" || tag === "R" ? M.robe : M.robe, 0, -0.137 * sk, 0);
      part(hd, "palmMesh" + tag, new CapsuleGeometry(0.048 * sk, 0.075 * sk, q.seg, q.radial), M.skin, 0, -0.055 * sk, 0);
      const gp = new Object3D();
      gp.name = "grip" + tag;
      gp.position.set(0, -0.055 * sk, 0);
      hd.add(gp);
      return { sh, ua, fa, hd, gp };
    };
    const armL = mkArm(1, "L");
    const armR = mkArm(-1, "R");
    const rigGrips = { L: armL.gp, R: armR.gp };
    const arms2 = {};
    {
      const arm2Mat = isGojo ? M.coat : M.robe;
      const mkArm2 = (side, tag) => {
        const s = side;
        const sh = mk("arm2" + tag + "1", chest, s * 0.15 * sk, -0.045 * sk, -0.055 * sk);
        const fa = mk("arm2" + tag + "2", sh, 0, -0.245 * sk, 0);
        part(sh, "deltoid2" + tag, new SphereGeometry(0.062 * sk, q.radial, q.seg), arm2Mat, 0, 0, 0);
        part(sh, "arm2Mesh" + tag, limbGeo(q, 0.052 * sk, 0.245 * sk), arm2Mat, 0, -0.122 * sk, 0);
        part(fa, "arm2MeshB" + tag, limbGeo(q, 0.045 * sk, 0.235 * sk), arm2Mat, 0, -0.117 * sk, 0);
        part(fa, "palm2" + tag, new CapsuleGeometry(0.042 * sk, 0.062 * sk, q.seg, q.radial), M.skin, 0, -0.05 * sk, 0);
        const gp = new Object3D();
        gp.name = "grip2" + tag;
        gp.position.set(0, -0.05 * sk, 0);
        fa.add(gp);
        return { sh, fa, gp };
      };
      arms2.L = mkArm2(1, "L");
      arms2.R = mkArm2(-1, "R");
      for (const k of ["L", "R"]) {
        arms2[k].sh.visible = false;
        arms2[k].sh.scale.setScalar(0.01);
      }
    }
    const mkLeg = (side, tag) => {
      const s = side;
      const th = mk("thigh" + tag, hips, s * 0.105 * sk, -0.1 * sk, 0);
      const sn = mk("shin" + tag, th, 0, -0.425 * sk, 0);
      const ft = mk("foot" + tag, sn, 0, -0.418 * sk, 0);
      part(th, "thighMesh" + tag, limbGeo(q, 0.083 * sk, 0.425 * sk), isGojo ? M.pants : M.skin, 0, -0.212 * sk, 0);
      part(sn, "shinMesh" + tag, limbGeo(q, 0.062 * sk, 0.418 * sk), isGojo ? M.boots : M.skin, 0, -0.209 * sk, 0);
      if (isGojo) {
        part(sn, "bootCuff" + tag, new CylinderGeometry(0.078 * sk, 0.07 * sk, 0.1 * sk, q.radial, 1), M.boots, 0, -0.05 * sk, 0);
        part(ft, "footMesh" + tag, boxGeo(0.098 * sk, 0.062 * sk, 0.245 * sk), M.boots, 0, -0.03 * sk, 0.045 * sk);
      } else {
        part(ft, "footMesh" + tag, boxGeo(0.092 * sk, 0.055 * sk, 0.215 * sk), M.skin, 0, -0.026 * sk, 0.038 * sk);
        part(ft, "sandal" + tag, boxGeo(0.1 * sk, 0.022 * sk, 0.235 * sk), M.sandal, 0, -0.058 * sk, 0.048 * sk);
        part(sn, "ankleTat" + tag, new CylinderGeometry(0.066 * sk, 0.066 * sk, 0.02 * sk, q.radial, 1), M.tattoo, 0, -0.4 * sk, 0);
      }
      return { th, sn, ft };
    };
    const legL = mkLeg(1, "L");
    const legR = mkLeg(-1, "R");
    const handR = new Object3D();
    handR.name = "handR";
    const handL = new Object3D();
    handL.name = "handL";
    const chestPoint = new Object3D();
    chestPoint.name = "chest";
    handR.position.set(0, -0.055 * sk, 0);
    handL.position.set(0, -0.055 * sk, 0);
    chestPoint.position.set(0, 0.02 * sk, 0.1 * sk);
    bones.handR.add(handR);
    bones.handL.add(handL);
    bones.chest.add(chestPoint);
    const handR2 = new Object3D();
    handR2.name = "handR2";
    const handL2 = new Object3D();
    handL2.name = "handL2";
    if (arms2.L) {
      root.add(handR2);
      root.add(handL2);
    }
    let shellMesh = null;
    if (q.shell) {
      const sg = new CapsuleGeometry(0.36 * sk, 0.72 * sk, q.seg, q.radial);
      bakeGradient(sg, 0, 16777215, -0.6 * sk, 0.6 * sk);
      shellMesh = new Mesh(sg, M.shell);
      shellMesh.position.set(0, 0.34 * sk, 0);
      shellMesh.scale.set(1, 1, 0.72);
      shellMesh.visible = false;
      shellMesh.renderOrder = 5;
      root.add(shellMesh);
    }
    const runes = [];
    if (q.shell) {
      const spots = [
        [chest, 0, 0, 0.115, 0.2],
        [core, 0, -0.02, 0.105, 0.16],
        [bones.upperArmL, 0, -0.15, 0.055, 0.11],
        [bones.upperArmR, 0, -0.15, 0.055, 0.11],
        [bones.thighL, 0, -0.24, 0.085, 0.13],
        [bones.thighR, 0, -0.24, 0.085, 0.13]
      ];
      for (const [parent, x, y, z, s] of spots) {
        const m = new Mesh(new PlaneGeometry(s * sk, s * sk), M.runes);
        m.position.set(x * sk, y * sk, z * sk);
        m.visible = false;
        m.renderOrder = 6;
        parent.add(m);
        runes.push(m);
      }
    }
    const outlines = outlineMeshes.map((o) => o);
    const sync2 = () => {
      arms2.L.gp.getWorldPosition(handL2.position);
      arms2.R.gp.getWorldPosition(handR2.position);
      root.worldToLocal(handL2.position);
      root.worldToLocal(handR2.position);
    };
    const syncFallback = () => {
      rigGrips.L.getWorldPosition(handL2.position);
      rigGrips.R.getWorldPosition(handR2.position);
      root.worldToLocal(handL2.position);
      root.worldToLocal(handR2.position);
    };
    return {
      root,
      bones,
      handR,
      handL,
      chest: chestPoint,
      handR2,
      handL2,
      arms2,
      cloth,
      hairTips,
      runes,
      shellMesh,
      outlines,
      meshes: meshBag,
      sync2,
      syncFallback,
      sk,
      isGojo
    };
  }
  var P = (x, y, z) => [x || 0, y || 0, z || 0];
  var POSE_LIB = {
    /* --- 站姿 / 位移 --- */
    idle: [
      [0, 0, {
        hips: P(0, 0, 0),
        core: P(0.01, 0, 0),
        chest: P(0.02, 0, 0),
        neck: P(-0.02, 0, 0),
        head: P(0, 0, 0),
        shoulderL: P(0, 0, 0.03),
        shoulderR: P(0, 0, -0.03),
        upperArmL: P(-0.167, 0.015, 0.173),
        foreArmL: P(0.11, 0, 2e-3),
        handL: P(0, 0, 0),
        upperArmR: P(-0.167, -0.015, -0.173),
        foreArmR: P(0.11, 0, -2e-3),
        handR: P(0, 0, 0),
        thighL: P(0.02, 0, 0.03),
        shinL: P(-0.05, 0, 0),
        footL: P(0.03, 0, 0),
        thighR: P(0.02, 0, -0.03),
        shinR: P(-0.05, 0, 0),
        footR: P(0.03, 0, 0)
      }],
      [0.5, 0, {
        core: P(0.035, 0, 0),
        chest: P(0.045, 0, 0),
        neck: P(-0.035, 0, 0),
        head: P(0.015, 0.03, 0),
        upperArmL: P(-0.03, 0, 0.14),
        upperArmR: P(-0.03, 0, -0.14)
      }],
      [1, 0, {
        core: P(0.01, 0, 0),
        chest: P(0.02, 0, 0),
        neck: P(-0.02, 0, 0),
        head: P(0, 0, 0),
        upperArmL: P(-0.06, 0, 0.13),
        upperArmR: P(-0.06, 0, -0.13)
      }]
    ],
    walk: [
      [0, 0, {
        hips: P(0, 0, 0),
        core: P(0.03, 0.05, 0.03),
        chest: P(0.02, -0.06, 0),
        head: P(0, -0.05, 0),
        upperArmL: P(0.42, 0, 0.1),
        foreArmL: P(-0.28, 0, 0),
        upperArmR: P(-0.36, 0, -0.1),
        foreArmR: P(-0.3, 0, 0),
        thighL: P(-0.42, 0, 0.03),
        shinL: P(-0.12, 0, 0),
        footL: P(0.12, 0, 0),
        thighR: P(0.34, 0, -0.03),
        shinR: P(-0.34, 0, 0),
        footR: P(-0.1, 0, 0)
      }],
      [0.25, -0.018, {
        core: P(0.06, 0, 0),
        hips: P(0, 0, 0.02),
        thighL: P(-0.12, 0, 0.03),
        shinL: P(-0.08, 0, 0),
        thighR: P(-0.02, 0, -0.03),
        shinR: P(-0.52, 0, 0)
      }],
      [0.5, 0, {
        hips: P(0, 0, 0),
        core: P(0.03, -0.05, -0.03),
        chest: P(0.02, 0.06, 0),
        head: P(0, 0.05, 0),
        upperArmL: P(-0.36, 0, 0.1),
        foreArmL: P(-0.3, 0, 0),
        upperArmR: P(0.42, 0, -0.1),
        foreArmR: P(-0.28, 0, 0),
        thighL: P(0.34, 0, 0.03),
        shinL: P(-0.34, 0, 0),
        footL: P(-0.1, 0, 0),
        thighR: P(-0.42, 0, -0.03),
        shinR: P(-0.12, 0, 0),
        footR: P(0.12, 0, 0)
      }],
      [0.75, -0.018, {
        core: P(0.06, 0, 0),
        hips: P(0, 0, -0.02),
        thighL: P(-0.02, 0, 0.03),
        shinL: P(-0.52, 0, 0),
        thighR: P(-0.12, 0, -0.03),
        shinR: P(-0.08, 0, 0)
      }],
      [1, 0, {
        hips: P(0, 0, 0),
        core: P(0.03, 0.05, 0.03),
        chest: P(0.02, -0.06, 0),
        head: P(0, -0.05, 0),
        upperArmL: P(0.42, 0, 0.1),
        foreArmL: P(-0.28, 0, 0),
        upperArmR: P(-0.36, 0, -0.1),
        foreArmR: P(-0.3, 0, 0),
        thighL: P(-0.42, 0, 0.03),
        shinL: P(-0.12, 0, 0),
        footL: P(0.12, 0, 0),
        thighR: P(0.34, 0, -0.03),
        shinR: P(-0.34, 0, 0),
        footR: P(-0.1, 0, 0)
      }]
    ],
    run: [
      [0, -0.045, {
        hips: P(0, 0, 0),
        core: P(0.24, 0.12, 0.04),
        chest: P(0.1, -0.14, 0),
        neck: P(-0.16, 0, 0),
        head: P(-0.06, -0.1, 0),
        upperArmL: P(0.95, 0, 0.16),
        foreArmL: P(-1.35, 0, 0),
        upperArmR: P(-0.75, 0, -0.16),
        foreArmR: P(-1.2, 0, 0),
        thighL: P(-0.85, 0, 0.04),
        shinL: P(-0.3, 0, 0),
        footL: P(0.2, 0, 0),
        thighR: P(0.55, 0, -0.04),
        shinR: P(-0.95, 0, 0),
        footR: P(-0.16, 0, 0)
      }],
      [0.25, 0.02, {
        core: P(0.28, 0, 0),
        thighL: P(-0.2, 0, 0.04),
        shinL: P(-0.15, 0, 0),
        thighR: P(-0.2, 0, -0.04),
        shinR: P(-1.3, 0, 0)
      }],
      [0.5, -0.045, {
        core: P(0.24, -0.12, -0.04),
        chest: P(0.1, 0.14, 0),
        head: P(-0.06, 0.1, 0),
        upperArmL: P(-0.75, 0, 0.16),
        foreArmL: P(-1.2, 0, 0),
        upperArmR: P(0.95, 0, -0.16),
        foreArmR: P(-1.35, 0, 0),
        thighL: P(0.55, 0, 0.04),
        shinL: P(-0.95, 0, 0),
        footL: P(-0.16, 0, 0),
        thighR: P(-0.85, 0, -0.04),
        shinR: P(-0.3, 0, 0),
        footR: P(0.2, 0, 0)
      }],
      [0.75, 0.02, {
        core: P(0.28, 0, 0),
        thighL: P(-0.2, 0, 0.04),
        shinL: P(-1.3, 0, 0),
        thighR: P(-0.2, 0, -0.04),
        shinR: P(-0.15, 0, 0)
      }],
      [1, -0.045, {
        core: P(0.24, 0.12, 0.04),
        chest: P(0.1, -0.14, 0),
        head: P(-0.06, -0.1, 0),
        upperArmL: P(0.95, 0, 0.16),
        foreArmL: P(-1.35, 0, 0),
        upperArmR: P(-0.75, 0, -0.16),
        foreArmR: P(-1.2, 0, 0),
        thighL: P(-0.85, 0, 0.04),
        shinL: P(-0.3, 0, 0),
        footL: P(0.2, 0, 0),
        thighR: P(0.55, 0, -0.04),
        shinR: P(-0.95, 0, 0),
        footR: P(-0.16, 0, 0)
      }]
    ],
    dash: [
      [0, 0, { core: P(0.05, 0, 0), chest: P(0.02, 0, 0) }],
      [0.14, -0.06, {
        core: P(0.45, 0.1, 0),
        chest: P(0.2, -0.1, 0),
        neck: P(-0.28, 0, 0),
        upperArmL: P(-1.05, 0, 0.25),
        foreArmL: P(-1.55, 0, 0),
        upperArmR: P(0.85, 0, -0.25),
        foreArmR: P(-1.3, 0, 0),
        thighL: P(-0.85, 0, 0.05),
        shinL: P(-1.1, 0, 0),
        thighR: P(0.62, 0, -0.05),
        shinR: P(-0.35, 0, 0),
        footR: P(0.3, 0, 0)
      }],
      [0.3, -0.1, {
        core: P(0.55, -0.12, 0),
        chest: P(0.28, 0.12, 0),
        neck: P(-0.34, 0, 0),
        upperArmL: P(0.95, 0, 0.22),
        foreArmL: P(-1.3, 0, 0),
        upperArmR: P(-1.15, 0, -0.22),
        foreArmR: P(-1.55, 0, 0),
        thighL: P(0.85, 0, 0.05),
        shinL: P(-0.4, 0, 0),
        thighR: P(-1.05, 0, -0.05),
        shinR: P(-1.35, 0, 0)
      }],
      [0.46, -0.02, {
        core: P(0.12, 0, 0),
        chest: P(0.06, 0, 0),
        neck: P(-0.08, 0, 0),
        upperArmL: P(-0.3, 0, 0.16),
        upperArmR: P(-0.3, 0, -0.16),
        foreArmL: P(-0.55, 0, 0),
        foreArmR: P(-0.55, 0, 0),
        thighL: P(-0.18, 0, 0.04),
        shinL: P(-0.3, 0, 0),
        thighR: P(-0.18, 0, -0.04),
        shinR: P(-0.3, 0, 0)
      }]
    ],
    jump: [
      [0, 0, {}],
      [0.12, -0.16, {
        core: P(0.3, 0, 0),
        chest: P(0.16, 0, 0),
        neck: P(-0.22, 0, 0),
        upperArmL: P(-0.6, 0, 0.14),
        foreArmL: P(-0.45, 0, 0),
        upperArmR: P(-0.6, 0, -0.14),
        foreArmR: P(-0.45, 0, 0),
        thighL: P(-0.7, 0, 0.05),
        shinL: P(-1.15, 0, 0),
        footL: P(0.35, 0, 0),
        thighR: P(-0.7, 0, -0.05),
        shinR: P(-1.15, 0, 0),
        footR: P(0.35, 0, 0)
      }],
      [0.28, 0.55, {
        core: P(-0.1, 0, 0),
        chest: P(-0.08, 0, 0),
        neck: P(0.08, 0, 0),
        upperArmL: P(-1.55, 0, 0.2),
        foreArmL: P(-0.2, 0, 0),
        upperArmR: P(-1.55, 0, -0.2),
        foreArmR: P(-0.2, 0, 0),
        thighL: P(-0.45, 0, 0.04),
        shinL: P(-0.75, 0, 0),
        footL: P(-0.25, 0, 0),
        thighR: P(0.25, 0, -0.04),
        shinR: P(-0.5, 0, 0),
        footR: P(-0.2, 0, 0)
      }],
      [0.5, 0.72, {
        core: P(-0.05, 0, 0),
        upperArmL: P(-1.3, 0, 0.24),
        upperArmR: P(-1.3, 0, -0.24),
        thighL: P(-0.3, 0, 0.04),
        shinL: P(-1.05, 0, 0),
        thighR: P(0.1, 0, -0.04),
        shinR: P(-0.85, 0, 0)
      }],
      [0.72, 0.3, {
        core: P(0.1, 0, 0),
        chest: P(0.06, 0, 0),
        upperArmL: P(-0.45, 0, 0.2),
        upperArmR: P(-0.45, 0, -0.2),
        thighL: P(-0.55, 0, 0.04),
        shinL: P(-0.75, 0, 0),
        footL: P(0.25, 0, 0),
        thighR: P(-0.55, 0, -0.04),
        shinR: P(-0.75, 0, 0),
        footR: P(0.25, 0, 0)
      }],
      [0.88, -0.14, { core: P(0.15, 0, 0), upperArmL: P(-0.25, 0, 0.16), upperArmR: P(-0.25, 0, -0.16) }]
    ],
    land: [
      [0, 0.06, {
        core: P(-0.05, 0, 0),
        upperArmL: P(-0.35, 0, 0.18),
        upperArmR: P(-0.35, 0, -0.18),
        thighL: P(-0.35, 0, 0.04),
        shinL: P(-0.45, 0, 0),
        thighR: P(-0.35, 0, -0.04),
        shinR: P(-0.45, 0, 0)
      }],
      [0.16, -0.26, {
        core: P(0.52, 0, 0),
        chest: P(0.24, 0, 0),
        neck: P(-0.34, 0, 0),
        head: P(-0.1, 0, 0),
        upperArmL: P(-1.15, 0, 0.3),
        foreArmL: P(-0.85, 0, 0),
        upperArmR: P(-1.15, 0, -0.3),
        foreArmR: P(-0.85, 0, 0),
        thighL: P(-1.05, 0, 0.08),
        shinL: P(-1.65, 0, 0),
        footL: P(0.45, 0, 0),
        thighR: P(-1.05, 0, -0.08),
        shinR: P(-1.65, 0, 0),
        footR: P(0.45, 0, 0)
      }],
      [0.36, -0.06, {
        core: P(0.14, 0, 0),
        chest: P(0.08, 0, 0),
        neck: P(-0.1, 0, 0),
        head: P(0, 0, 0),
        upperArmL: P(-0.4, 0, 0.16),
        foreArmL: P(-0.3, 0, 0),
        upperArmR: P(-0.4, 0, -0.16),
        foreArmR: P(-0.3, 0, 0),
        thighL: P(-0.35, 0, 0.05),
        shinL: P(-0.55, 0, 0),
        footL: P(0.15, 0, 0),
        thighR: P(-0.35, 0, -0.05),
        shinR: P(-0.55, 0, 0),
        footR: P(0.15, 0, 0)
      }],
      [0.55, 0, {}]
    ],
    backstep: [
      [0, 0, {}],
      [0.1, 0.06, {
        core: P(-0.22, 0, 0),
        chest: P(-0.1, 0, 0),
        neck: P(0.14, 0, 0),
        upperArmL: P(-0.55, 0, 0.34),
        foreArmL: P(-0.95, 0, 0),
        upperArmR: P(-0.55, 0, -0.34),
        foreArmR: P(-0.95, 0, 0),
        thighL: P(-1, 0, 0.06),
        shinL: P(-1.35, 0, 0),
        footL: P(0.35, 0, 0),
        thighR: P(-0.2, 0, -0.06),
        shinR: P(-0.3, 0, 0)
      }],
      [0.26, -0.03, {
        core: P(0.16, 0, 0),
        chest: P(0.08, 0, 0),
        neck: P(-0.08, 0, 0),
        upperArmL: P(-0.75, 0, 0.28),
        foreArmL: P(-1.15, 0, 0),
        upperArmR: P(-0.7, 0, -0.28),
        foreArmR: P(-1.1, 0, 0),
        thighL: P(-0.25, 0, 0.06),
        shinL: P(-0.55, 0, 0),
        thighR: P(-0.55, 0, -0.06),
        shinR: P(-0.9, 0, 0),
        footR: P(0.3, 0, 0)
      }],
      [0.46, 0, { core: P(0.04, 0, 0), thighL: P(-0.1, 0, 0.05), shinL: P(-0.25, 0, 0), thighR: P(-0.1, 0, -0.05), shinR: P(-0.25, 0, 0) }]
    ],
    air_spin: [
      [0, 0.1, {
        core: P(0.1, 0, 0),
        chest: P(0.05, 0, 0),
        upperArmL: P(-1.35, 0, 0.55),
        foreArmL: P(-0.55, 0, 0),
        upperArmR: P(-1.35, 0, -0.55),
        foreArmR: P(-0.55, 0, 0),
        thighL: P(-0.55, 0, 0.06),
        shinL: P(-1.25, 0, 0),
        thighR: P(-0.3, 0, -0.06),
        shinR: P(-1, 0, 0)
      }],
      [0.3, 0.16, {
        hips: P(0, 1.25, 0),
        core: P(-0.2, 0, 0),
        chest: P(-0.1, 0, 0),
        neck: P(0.1, 0, 0),
        upperArmL: P(-0.85, 0, 0.85),
        upperArmR: P(-1.85, 0, -0.35),
        thighL: P(-1.1, 0, 0.1),
        shinL: P(-1.55, 0, 0),
        thighR: P(0.35, 0, -0.1),
        shinR: P(-0.6, 0, 0)
      }],
      [0.6, 0.16, {
        hips: P(0, 2.55, 0),
        core: P(-0.2, 0, 0),
        upperArmL: P(-1.85, 0, 0.35),
        upperArmR: P(-0.85, 0, -0.85),
        thighL: P(0.35, 0, 0.1),
        shinL: P(-0.6, 0, 0),
        thighR: P(-1.1, 0, -0.1),
        shinR: P(-1.55, 0, 0)
      }],
      [0.86, 0.08, {
        hips: P(0, 4.05, 0),
        core: P(0.2, 0, 0),
        chest: P(0.1, 0, 0),
        neck: P(-0.12, 0, 0),
        upperArmL: P(-0.55, 0, 0.5),
        upperArmR: P(-0.55, 0, -0.5),
        thighL: P(-0.7, 0, 0.08),
        shinL: P(-0.95, 0, 0),
        thighR: P(-0.7, 0, -0.08),
        shinR: P(-0.95, 0, 0)
      }],
      [1, 0, {
        hips: P(0, 6.2832, 0),
        core: P(0.05, 0, 0),
        chest: P(0.03, 0, 0),
        upperArmL: P(-0.3, 0, 0.22),
        upperArmR: P(-0.3, 0, -0.22),
        thighL: P(-0.22, 0, 0.05),
        shinL: P(-0.4, 0, 0),
        thighR: P(-0.22, 0, -0.05),
        shinR: P(-0.4, 0, 0)
      }]
    ],
    /* --- 体术连段：预备 - 发力 - 收招 --- */
    punch: [
      [0, 0, {}],
      [0.09, 0, {
        hips: P(0, 0.22, 0),
        core: P(-0.06, 0.3, 0),
        chest: P(-0.04, 0.34, 0),
        neck: P(0.05, -0.2, 0),
        shoulderR: P(0, 0, -0.18),
        upperArmR: P(-0.046, 0.022, 0.889),
        foreArmR: P(1.893, -0.029, 0.021),
        handR: P(0, 0, 0),
        shoulderL: P(0, 0, 0.12),
        upperArmL: P(-1.592, 0.042, 0.041),
        foreArmL: P(0.52, 0.433, -1.38),
        thighL: P(-0.3, 0, 0.04),
        thighR: P(0.2, 0, -0.04)
      }],
      [0.2, 0, {
        hips: P(0, -0.42, 0),
        core: P(0.06, -0.44, 0),
        chest: P(0.05, -0.48, 0),
        neck: P(-0.06, 0.26, 0),
        shoulderR: P(0, 0, 0.14),
        upperArmR: P(-0.299, 0.273, 1.478),
        foreArmR: P(0.106, -2e-3, 0.031),
        handR: P(0, 0, 0),
        shoulderL: P(0, 0, 0.06),
        upperArmL: P(-0.138, -0.057, -0.777),
        foreArmL: P(1.445, 0.05, -0.057),
        thighL: P(-0.48, 0, 0.04),
        shinL: P(-0.3, 0, 0),
        thighR: P(0.35, 0, -0.04),
        shinR: P(-0.3, 0, 0)
      }],
      [0.32, 0, {
        hips: P(0, -0.2, 0),
        core: P(0.04, -0.22, 0),
        chest: P(0.04, -0.22, 0),
        neck: P(-0.04, 0.12, 0),
        upperArmR: P(-1.57, -0.253, -0.254),
        foreArmR: P(-3e-3, 4e-3, 1.692),
        upperArmL: P(-0.362, -0.014, -0.077),
        foreArmL: P(1.999, 0.021, -0.014),
        thighL: P(-0.28, 0, 0.04),
        thighR: P(0.2, 0, -0.04)
      }],
      [0.5, 0, {}]
    ],
    punch2: [
      [0, 0, {}],
      [0.08, 0, {
        hips: P(0, -0.2, 0),
        core: P(-0.06, -0.28, 0),
        chest: P(-0.05, -0.32, 0),
        neck: P(0.05, 0.18, 0),
        upperArmL: P(-0.037, -0.016, -0.816),
        foreArmL: P(1.913, 0.021, -0.015),
        shoulderR: P(0, 0, 0.1),
        upperArmR: P(-1.609, -0.068, -0.065),
        foreArmR: P(0.584, -0.47, 1.346),
        thighL: P(0.18, 0, 0.04),
        thighR: P(-0.28, 0, -0.04)
      }],
      [0.19, 0, {
        hips: P(0, 0.44, 0),
        core: P(0.06, 0.46, 0),
        chest: P(0.05, 0.5, 0),
        neck: P(-0.06, -0.26, 0),
        shoulderL: P(0, 0, -0.14),
        upperArmL: P(-0.25, -0.23, -1.486),
        foreArmL: P(0.107, 1e-3, -0.026),
        shoulderR: P(0, 0, -0.06),
        upperArmR: P(-0.154, 0.061, 0.754),
        foreArmR: P(1.4, -0.051, 0.061),
        thighL: P(0.36, 0, 0.04),
        shinL: P(-0.3, 0, 0),
        thighR: P(-0.5, 0, -0.04),
        shinR: P(-0.3, 0, 0)
      }],
      [0.31, 0, {
        hips: P(0, 0.2, 0),
        core: P(0.04, 0.22, 0),
        chest: P(0.04, 0.22, 0),
        upperArmL: P(-1.58, 0.264, 0.262),
        foreArmL: P(0.035, 0.041, -1.72),
        upperArmR: P(-0.395, 0.011, 0.052),
        foreArmR: P(1.963, -0.016, 0.011),
        thighL: P(0.2, 0, 0.04),
        thighR: P(-0.28, 0, -0.04)
      }],
      [0.5, 0, {}]
    ],
    kick: [
      [0, 0, {}],
      [0.12, -0.02, {
        hips: P(0, 0.1, 0),
        core: P(-0.16, 0.22, 0),
        chest: P(-0.1, 0.26, 0),
        neck: P(0.12, -0.16, 0),
        upperArmL: P(-0.95, 0, 0.45),
        foreArmL: P(-1.3, 0, 0),
        upperArmR: P(0.35, 0, -0.45),
        foreArmR: P(-1.5, 0, 0),
        thighR: P(-1.35, 0, -0.1),
        shinR: P(-1.85, 0, 0),
        footR: P(-0.25, 0, 0),
        thighL: P(0.08, 0, 0.04),
        shinL: P(-0.18, 0, 0)
      }],
      [0.24, 0.06, {
        hips: P(-0.1, -0.34, 0),
        core: P(-0.34, -0.4, 0),
        chest: P(-0.2, -0.44, 0),
        neck: P(0.24, 0.24, 0),
        upperArmL: P(-0.25, 0, 0.8),
        foreArmL: P(-1.55, 0, 0),
        upperArmR: P(-0.6, 0, -0.85),
        foreArmR: P(-1.6, 0, 0),
        thighR: P(-1.95, 0, -0.06),
        shinR: P(-0.1, 0, 0),
        footR: P(0.35, 0, 0),
        thighL: P(-0.22, 0, 0.04),
        shinL: P(-0.45, 0, 0)
      }],
      [0.38, 0, {
        hips: P(0, -0.16, 0),
        core: P(-0.1, -0.2, 0),
        chest: P(-0.06, -0.2, 0),
        upperArmL: P(-0.45, 0, 0.35),
        foreArmL: P(-1.1, 0, 0),
        upperArmR: P(-0.35, 0, -0.4),
        foreArmR: P(-1.2, 0, 0),
        thighR: P(-0.95, 0, -0.06),
        shinR: P(-0.8, 0, 0),
        footR: P(0.15, 0, 0),
        thighL: P(-0.15, 0, 0.04),
        shinL: P(-0.3, 0, 0)
      }],
      [0.62, 0, {}]
    ],
    upper: [
      [0, 0, {}],
      [0.14, -0.14, {
        core: P(0.42, 0.18, 0),
        chest: P(0.2, 0.22, 0),
        neck: P(-0.26, -0.14, 0),
        head: P(-0.1, 0, 0),
        upperArmR: P(-0.722, 5e-3, 0.013),
        foreArmR: P(1.735, -8e-3, 6e-3),
        handR: P(0.35, 0, 0),
        upperArmL: P(-0.341, -0.019, -0.109),
        foreArmL: P(-2.25, -0.525, -0.255),
        thighL: P(-0.65, 0, 0.05),
        shinL: P(-1.05, 0, 0),
        thighR: P(-0.65, 0, -0.05),
        shinR: P(-1.05, 0, 0)
      }],
      [0.28, 0.14, {
        core: P(-0.3, -0.34, 0),
        chest: P(-0.16, -0.38, 0),
        neck: P(0.24, 0.2, 0),
        head: P(0.12, 0, 0),
        upperArmR: P(-1.562, 0.657, 0.662),
        foreArmR: P(1e-3, 0, 0.11),
        upperArmL: P(-0.108, -0.022, -0.402),
        foreArmL: P(2.097, 0.033, -0.019),
        thighL: P(0.3, 0, 0.05),
        shinL: P(-0.25, 0, 0),
        thighR: P(0.3, 0, -0.05),
        shinR: P(-0.25, 0, 0)
      }],
      [0.44, 0, {
        core: P(-0.1, -0.16, 0),
        chest: P(-0.06, -0.16, 0),
        neck: P(0.08, 0.1, 0),
        upperArmR: P(-0.729, 0.082, 0.215),
        foreArmR: P(-1.785, 0.393, 0.318),
        upperArmL: P(-0.4, 0, 0.3),
        foreArmL: P(-1.1, 0, 0),
        thighL: P(0.1, 0, 0.05),
        thighR: P(0.1, 0, -0.05)
      }],
      [0.66, 0, {}]
    ],
    combo_finish: [
      [0, 0, {}],
      [0.16, -0.06, {
        hips: P(0, 0.25, 0),
        core: P(-0.2, 0.35, 0),
        chest: P(-0.12, 0.4, 0),
        neck: P(0.16, -0.24, 0),
        upperArmR: P(0.137, -0.057, 0.782),
        foreArmR: P(1.488, 0.053, -0.057),
        handR: P(0.4, 0, 0),
        upperArmL: P(-1.551, -0.023, -0.023),
        foreArmL: P(0.882, 0.55, -1.078),
        thighL: P(-0.4, 0, 0.05),
        shinL: P(-0.7, 0, 0),
        thighR: P(-0.4, 0, -0.05),
        shinR: P(-0.7, 0, 0)
      }],
      [0.34, 0.1, {
        hips: P(0, -0.55, 0),
        core: P(0.28, -0.62, 0),
        chest: P(0.2, -0.66, 0),
        neck: P(-0.24, 0.34, 0),
        head: P(-0.16, 0.1, 0),
        upperArmR: P(0.175, -0.173, 1.56),
        foreArmR: P(0.108, 1e-3, -0.019),
        handR: P(-0.3, 0, 0),
        upperArmL: P(-0.167, -0.063, -0.72),
        foreArmL: P(0.668, 0.014, -0.04),
        thighL: P(-0.55, 0, 0.06),
        shinL: P(-0.35, 0, 0),
        thighR: P(-0.35, 0, -0.06),
        shinR: P(-0.55, 0, 0)
      }],
      [0.5, 0, {
        hips: P(0, -0.28, 0),
        core: P(0.1, -0.3, 0),
        chest: P(0.08, -0.3, 0),
        neck: P(-0.1, 0.16, 0),
        upperArmR: P(-1.574, -0.081, -0.081),
        foreArmR: P(0.036, -0.038, 1.628),
        upperArmL: P(-0.3, -0.042, -0.277),
        foreArmL: P(1.844, 0.056, -0.042),
        thighL: P(-0.25, 0, 0.05),
        thighR: P(-0.2, 0, -0.05)
      }],
      [0.78, 0, {}]
    ],
    /* --- 防御 / 受击 --- */
    block: [
      [0, 0, {}],
      [0.12, -0.03, {
        hips: P(0, 0.34, 0),
        core: P(0.14, 0.3, 0),
        chest: P(0.1, 0.26, 0),
        neck: P(-0.12, -0.2, 0),
        head: P(-0.06, -0.12, 0),
        shoulderL: P(0, 0, 0.1),
        shoulderR: P(0, 0, -0.1),
        upperArmL: P(-1.609, -0.074, -0.071),
        foreArmL: P(-0.522, -0.653, -1.806),
        handL: P(-0.25, 0, 0),
        upperArmR: P(-2.042, -0.245, -0.15),
        foreArmR: P(-2.528, -0.948, -0.322),
        handR: P(-0.25, 0, 0),
        thighL: P(-0.28, 0, 0.06),
        shinL: P(-0.45, 0, 0),
        thighR: P(-0.28, 0, -0.06),
        shinR: P(-0.45, 0, 0)
      }],
      [0.3, -0.03, { core: P(0.16, 0.32, 0), chest: P(0.12, 0.28, 0), upperArmL: P(-1.533, 0.039, 0.04), foreArmL: P(-1.216, -0.922, -1.24), upperArmR: P(-1.688, -0.017, -0.015), foreArmR: P(-2.676, -0.267, -0.064) }]
    ],
    block_hit: [
      [0, -0.03, {
        core: P(0.14, 0.3, 0),
        chest: P(0.1, 0.26, 0),
        upperArmL: P(-1.28, 0, 0.58),
        foreArmL: P(-2.05, 0, 0),
        upperArmR: P(-1.28, 0, -0.58),
        foreArmR: P(-2.05, 0, 0),
        thighL: P(-0.28, 0, 0.06),
        shinL: P(-0.45, 0, 0),
        thighR: P(-0.28, 0, -0.06),
        shinR: P(-0.45, 0, 0)
      }],
      [0.1, -0.07, {
        core: P(0.3, 0.26, 0),
        chest: P(0.22, 0.22, 0),
        neck: P(0.16, -0.16, 0),
        head: P(0.16, 0, 0),
        upperArmL: P(-1.508, 0.051, 0.055),
        foreArmL: P(-1.968, -1.194, -0.849),
        upperArmR: P(-2.608, 0.609, 0.171),
        foreArmR: P(-2.244, 1.275, 0.685),
        thighL: P(-0.42, 0, 0.08),
        shinL: P(-0.62, 0, 0),
        thighR: P(-0.42, 0, -0.08),
        shinR: P(-0.62, 0, 0)
      }],
      [0.26, -0.03, { core: P(0.14, 0.3, 0), chest: P(0.1, 0.26, 0), neck: P(-0.12, -0.2, 0), head: P(-0.06, -0.12, 0) }],
      [0.42, -0.03, {}]
    ],
    hit_light: [
      [0, 0, {}],
      [0.06, 0.01, {
        hips: P(0, 0.14, 0),
        core: P(0.2, 0.18, 0.05),
        chest: P(0.16, 0.22, 0.06),
        neck: P(0.34, -0.18, -0.1),
        head: P(0.3, -0.14, -0.1),
        upperArmL: P(0.32, 0, 0.42),
        foreArmL: P(-0.8, 0, 0),
        upperArmR: P(0.24, 0, -0.3),
        foreArmR: P(-0.65, 0, 0),
        thighL: P(0.22, 0, 0.05),
        shinL: P(-0.3, 0, 0),
        thighR: P(0.3, 0, -0.05),
        shinR: P(-0.45, 0, 0)
      }],
      [0.2, 0, {
        core: P(0.06, 0.06, 0),
        chest: P(0.05, 0.07, 0),
        neck: P(0.1, -0.06, 0),
        head: P(0.08, -0.04, 0),
        upperArmL: P(0.1, 0, 0.24),
        upperArmR: P(0.06, 0, -0.2),
        thighL: P(0.06, 0, 0.05),
        thighR: P(0.1, 0, -0.05)
      }],
      [0.36, 0, {}]
    ],
    hit_heavy: [
      [0, 0, {}],
      [0.08, 0.03, {
        hips: P(0, 0.26, 0),
        core: P(0.46, 0.28, 0.12),
        chest: P(0.36, 0.34, 0.14),
        neck: P(0.58, -0.26, -0.2),
        head: P(0.5, -0.2, -0.18),
        shoulderL: P(0, 0, 0.2),
        shoulderR: P(0, 0, -0.16),
        upperArmL: P(0.8, 0, 0.7),
        foreArmL: P(-1.15, 0, 0),
        upperArmR: P(0.62, 0, -0.5),
        foreArmR: P(-0.95, 0, 0),
        thighL: P(0.5, 0, 0.06),
        shinL: P(-0.55, 0, 0),
        thighR: P(0.62, 0, -0.06),
        shinR: P(-0.8, 0, 0)
      }],
      [0.26, 0.01, {
        core: P(0.22, 0.12, 0.05),
        chest: P(0.16, 0.14, 0.06),
        neck: P(0.24, -0.1, -0.08),
        head: P(0.2, -0.08, -0.07),
        upperArmL: P(0.35, 0, 0.4),
        foreArmL: P(-0.7, 0, 0),
        upperArmR: P(0.25, 0, -0.32),
        foreArmR: P(-0.6, 0, 0),
        thighL: P(0.2, 0, 0.06),
        shinL: P(-0.3, 0, 0),
        thighR: P(0.28, 0, -0.06),
        shinR: P(-0.45, 0, 0)
      }],
      [0.46, 0, { core: P(0.08, 0.04, 0), chest: P(0.06, 0.05, 0), neck: P(0.08, -0.03, 0), head: P(0.06, 0, 0) }],
      [0.7, 0, {}]
    ],
    knockback: [
      [0, 0, {}],
      [0.1, 0.1, {
        hips: P(-0.12, 0, 0),
        core: P(-0.34, 0.1, 0.1),
        chest: P(-0.26, 0.14, 0.1),
        neck: P(-0.4, -0.1, 0),
        head: P(-0.34, -0.08, 0),
        upperArmL: P(-1.35, 0, 0.75),
        foreArmL: P(-0.55, 0, 0),
        upperArmR: P(-1.35, 0, -0.75),
        foreArmR: P(-0.55, 0, 0),
        thighL: P(-0.85, 0, 0.1),
        shinL: P(-0.55, 0, 0),
        footL: P(0.3, 0, 0),
        thighR: P(-0.35, 0, -0.1),
        shinR: P(-0.9, 0, 0),
        footR: P(0.2, 0, 0)
      }],
      [0.34, 0.04, {
        core: P(-0.28, 0.06, 0.05),
        chest: P(-0.18, 0.08, 0.05),
        neck: P(-0.3, -0.06, 0),
        head: P(-0.24, 0, 0),
        upperArmL: P(-1.05, 0, 0.6),
        foreArmL: P(-0.8, 0, 0),
        upperArmR: P(-1.05, 0, -0.6),
        foreArmR: P(-0.8, 0, 0),
        thighL: P(-0.55, 0, 0.08),
        shinL: P(-0.65, 0, 0),
        thighR: P(-0.2, 0, -0.08),
        shinR: P(-0.7, 0, 0)
      }],
      [0.6, 0, {
        core: P(-0.1, 0, 0),
        chest: P(-0.06, 0, 0),
        neck: P(-0.1, 0, 0),
        head: P(-0.08, 0, 0),
        upperArmL: P(-0.55, 0, 0.35),
        upperArmR: P(-0.55, 0, -0.35),
        foreArmL: P(-0.45, 0, 0),
        foreArmR: P(-0.45, 0, 0),
        thighL: P(-0.25, 0, 0.06),
        shinL: P(-0.35, 0, 0),
        thighR: P(-0.1, 0, -0.06),
        shinR: P(-0.35, 0, 0)
      }],
      [0.88, 0, {}]
    ],
    down: [
      [0, 0, {}],
      [0.18, -0.34, {
        hips: P(-0.55, 0, 0),
        core: P(0.85, 0, 0),
        chest: P(0.35, 0, 0),
        neck: P(0.45, 0.1, 0),
        head: P(0.4, 0.14, 0),
        upperArmL: P(-2.35, 0, 0.6),
        foreArmL: P(-1, 0, 0),
        upperArmR: P(-2.2, 0, -0.6),
        foreArmR: P(-0.85, 0, 0),
        thighL: P(-1.35, 0, 0.3),
        shinL: P(-1.45, 0, 0),
        footL: P(0.4, 0, 0),
        thighR: P(-1.25, 0, -0.3),
        shinR: P(-1.6, 0, 0),
        footR: P(0.4, 0, 0)
      }],
      [0.38, -0.72, {
        hips: P(-1.42, 0, 0),
        core: P(0.22, 0, 0),
        chest: P(0.1, 0, 0),
        neck: P(0.18, 0.08, 0),
        head: P(0.16, 0.12, 0),
        upperArmL: P(-2.1, 0, 1.05),
        foreArmL: P(-0.85, 0, 0),
        upperArmR: P(-2, 0, -1.05),
        foreArmR: P(-0.75, 0, 0),
        thighL: P(-0.45, 0, 0.28),
        shinL: P(-0.55, 0, 0),
        footL: P(0.15, 0, 0),
        thighR: P(-0.4, 0, -0.28),
        shinR: P(-0.7, 0, 0),
        footR: P(0.15, 0, 0)
      }],
      [0.52, -0.8, { hips: P(-1.48, 0, 0), core: P(0.1, 0, 0), chest: P(0.06, 0, 0), neck: P(0.12, 0.06, 0), head: P(0.1, 0.1, 0) }]
    ],
    getup: [
      [0, -0.8, {
        hips: P(-1.48, 0, 0),
        core: P(0.1, 0, 0),
        chest: P(0.06, 0, 0),
        neck: P(0.12, 0.06, 0),
        head: P(0.1, 0.1, 0),
        upperArmL: P(-2.1, 0, 1.05),
        foreArmL: P(-0.85, 0, 0),
        upperArmR: P(-2, 0, -1.05),
        foreArmR: P(-0.75, 0, 0),
        thighL: P(-0.45, 0, 0.28),
        shinL: P(-0.55, 0, 0),
        thighR: P(-0.4, 0, -0.28),
        shinR: P(-0.7, 0, 0)
      }],
      [0.24, -0.72, {
        hips: P(-1.05, 0, 0),
        core: P(0.75, 0.1, 0),
        chest: P(0.3, 0.12, 0),
        neck: P(-0.2, -0.1, 0),
        head: P(-0.16, -0.1, 0),
        upperArmL: P(-1.6, 0, 0.85),
        foreArmL: P(-1.85, 0, 0),
        upperArmR: P(-1.6, 0, -0.85),
        foreArmR: P(-1.85, 0, 0),
        thighL: P(-1.55, 0, 0.35),
        shinL: P(-1.75, 0, 0),
        footL: P(0.45, 0, 0),
        thighR: P(-1.35, 0, -0.35),
        shinR: P(-1.95, 0, 0),
        footR: P(0.45, 0, 0)
      }],
      [0.55, -0.4, {
        hips: P(-0.3, 0, 0),
        core: P(0.6, 0, 0),
        chest: P(0.35, 0, 0),
        neck: P(-0.35, 0, 0),
        head: P(-0.2, 0, 0),
        upperArmL: P(-0.9, 0, 0.45),
        foreArmL: P(-1.3, 0, 0),
        upperArmR: P(-0.9, 0, -0.45),
        foreArmR: P(-1.3, 0, 0),
        thighL: P(-1.3, 0, 0.2),
        shinL: P(-1.55, 0, 0),
        footL: P(0.4, 0, 0),
        thighR: P(-0.95, 0, -0.2),
        shinR: P(-1.7, 0, 0),
        footR: P(0.4, 0, 0)
      }],
      [0.8, -0.1, {
        hips: P(-0.06, 0, 0),
        core: P(0.26, 0, 0),
        chest: P(0.16, 0, 0),
        neck: P(-0.16, 0, 0),
        head: P(-0.06, 0, 0),
        upperArmL: P(-0.45, 0, 0.25),
        foreArmL: P(-0.6, 0, 0),
        upperArmR: P(-0.45, 0, -0.25),
        foreArmR: P(-0.6, 0, 0),
        thighL: P(-0.55, 0, 0.08),
        shinL: P(-0.85, 0, 0),
        footL: P(0.25, 0, 0),
        thighR: P(-0.45, 0, -0.08),
        shinR: P(-0.9, 0, 0),
        footR: P(0.25, 0, 0)
      }],
      [1, 0, {}]
    ],
    /* --- 术式：蓄力 / 释放 / 指向 / 咏唱 / 领域 / 无下限 / 反转术式 --- */
    cast_charge: [
      [0, 0, {}],
      [0.22, -0.04, {
        hips: P(0, 0.16, 0),
        core: P(0.22, 0.2, 0),
        chest: P(0.16, 0.18, 0),
        neck: P(-0.16, -0.12, 0),
        head: P(-0.1, -0.08, 0),
        shoulderL: P(0, 0, 0.14),
        shoulderR: P(0, 0, -0.14),
        upperArmL: P(-1.388, 0.33, 0.395),
        foreArmL: P(-0.557, -0.614, -1.675),
        handL: P(-0.3, 0, 0),
        upperArmR: P(-1.289, 0.55, 0.719),
        foreArmR: P(-0.311, -0.768, -2.401),
        handR: P(-0.3, 0, 0),
        thighL: P(-0.3, 0, 0.08),
        shinL: P(-0.5, 0, 0),
        thighR: P(-0.3, 0, -0.08),
        shinR: P(-0.5, 0, 0)
      }],
      [0.62, -0.06, {
        core: P(0.3, 0.24, 0),
        chest: P(0.2, 0.2, 0),
        neck: P(-0.22, -0.14, 0),
        head: P(-0.14, -0.1, 0),
        upperArmL: P(-1.425, 0.201, 0.233),
        foreArmL: P(-0.78, -0.673, -1.41),
        upperArmR: P(-0.836, 0.276, 0.605),
        foreArmR: P(-2.283, -0.688, -0.325),
        thighL: P(-0.44, 0, 0.1),
        shinL: P(-0.72, 0, 0),
        thighR: P(-0.44, 0, -0.1),
        shinR: P(-0.72, 0, 0)
      }],
      [1, -0.05, {
        core: P(0.26, 0.22, 0),
        chest: P(0.18, 0.18, 0),
        neck: P(-0.2, -0.12, 0),
        head: P(-0.12, -0.08, 0),
        upperArmL: P(-1.42, 0.252, 0.293),
        foreArmL: P(-0.624, -0.631, -1.583),
        upperArmR: P(-0.493, -0.022, -0.088),
        foreArmR: P(-2.411, -0.322, -0.124),
        thighL: P(-0.4, 0, 0.1),
        shinL: P(-0.66, 0, 0),
        thighR: P(-0.4, 0, -0.1),
        shinR: P(-0.66, 0, 0)
      }]
    ],
    cast_release: [
      [0, -0.05, {
        core: P(0.26, 0.22, 0),
        chest: P(0.18, 0.18, 0),
        neck: P(-0.2, -0.12, 0),
        head: P(-0.12, -0.08, 0),
        upperArmL: P(-1.36, 0, 0.36),
        foreArmL: P(-1.88, 0, 0),
        upperArmR: P(-1.36, 0, -0.36),
        foreArmR: P(-1.88, 0, 0),
        thighL: P(-0.4, 0, 0.1),
        shinL: P(-0.66, 0, 0),
        thighR: P(-0.4, 0, -0.1),
        shinR: P(-0.66, 0, 0)
      }],
      [0.08, -0.09, {
        core: P(0.4, 0.3, 0),
        chest: P(0.26, 0.26, 0),
        neck: P(-0.26, -0.16, 0),
        head: P(-0.16, -0.1, 0),
        upperArmL: P(-1.558, 0.027, 0.028),
        foreArmL: P(-0.479, -0.536, -1.689),
        upperArmR: P(-0.983, 0.257, 0.473),
        foreArmR: P(-2.423, -0.804, -0.317)
      }],
      [0.2, 0.06, {
        hips: P(0, -0.18, 0),
        core: P(-0.28, -0.26, 0),
        chest: P(-0.16, -0.24, 0),
        neck: P(0.24, 0.16, 0),
        head: P(0.16, 0.1, 0),
        shoulderL: P(0, 0, -0.1),
        shoulderR: P(0, 0, 0.1),
        upperArmL: P(-1.514, 0.085, 0.09),
        foreArmL: P(0.625, -0.371, 1.053),
        handL: P(-0.5, 0, 0),
        upperArmR: P(-1.009, 0.314, 0.558),
        foreArmR: P(0.094, -3e-3, 0.057),
        handR: P(-0.5, 0, 0),
        thighL: P(0.24, 0, 0.08),
        shinL: P(-0.3, 0, 0),
        thighR: P(0.24, 0, -0.08),
        shinR: P(-0.3, 0, 0)
      }],
      [0.38, 0, {
        core: P(-0.08, -0.1, 0),
        chest: P(-0.05, -0.08, 0),
        neck: P(0.08, 0.06, 0),
        upperArmL: P(-1.674, -0.014, -0.013),
        foreArmL: P(1.696, -0.156, 0.137),
        upperArmR: P(-1.614, -0.014, -0.013),
        foreArmR: P(1.395, -0.271, 0.322),
        thighL: P(0.08, 0, 0.06),
        thighR: P(0.08, 0, -0.06)
      }],
      [0.62, 0, {}]
    ],
    cast_point: [
      [0, 0, {}],
      [0.16, -0.02, {
        hips: P(0, 0.3, 0),
        core: P(-0.12, 0.34, 0),
        chest: P(-0.08, 0.36, 0),
        neck: P(0.1, -0.26, 0),
        head: P(0.04, -0.2, 0),
        shoulderR: P(0, 0, -0.2),
        upperArmR: P(-0.142, 0.062, 0.829),
        foreArmR: P(2.071, -0.093, 0.055),
        handR: P(0, 0, 0),
        shoulderL: P(0, 0, 0.1),
        upperArmL: P(-1.508, -0.01, -0.01),
        foreArmL: P(1.791, 0.188, -0.151),
        handL: P(-0.3, 0, 0),
        thighL: P(-0.24, 0, 0.06),
        thighR: P(-0.2, 0, -0.06)
      }],
      [0.34, 0, {
        hips: P(0, -0.16, 0),
        core: P(0.06, -0.2, 0),
        chest: P(0.04, -0.22, 0),
        neck: P(-0.06, 0.16, 0),
        head: P(-0.04, 0.14, 0),
        shoulderR: P(0, 0, 0.1),
        upperArmR: P(-1.113, 0.593, 0.913),
        foreArmR: P(0.06, -3e-3, 0.092),
        handR: P(-0.15, 0, 0),
        upperArmL: P(-0.24, 1e-3, 6e-3),
        foreArmL: P(1.713, -1e-3, 1e-3),
        thighL: P(-0.3, 0, 0.06),
        shinL: P(-0.24, 0, 0),
        thighR: P(0.18, 0, -0.06)
      }],
      [0.66, 0, {
        core: P(0.02, -0.08, 0),
        chest: P(0.02, -0.09, 0),
        neck: P(-0.02, 0.06, 0),
        head: P(-0.02, 0.06, 0),
        upperArmR: P(-1.175, 0.272, 0.406),
        foreArmR: P(-0.627, 0.082, 0.253),
        upperArmL: P(-0.579, 0.07, 0.235),
        foreArmL: P(1.951, -0.115, 0.078),
        thighL: P(-0.24, 0, 0.06),
        thighR: P(0.12, 0, -0.06)
      }]
    ],
    chant: [
      [0, 0, {}],
      [0.3, -0.03, {
        core: P(0.14, 0, 0),
        chest: P(0.1, 0, 0),
        neck: P(-0.1, 0, 0),
        head: P(-0.18, 0, 0),
        shoulderL: P(0, 0, 0.22),
        shoulderR: P(0, 0, -0.22),
        upperArmL: P(-1.703, 0.45, 0.396),
        foreArmL: P(0.203, 0.452, -2.306),
        handL: P(-0.6, 0, 0),
        upperArmR: P(-1.703, -0.45, -0.396),
        foreArmR: P(0.203, -0.452, 2.306),
        handR: P(-0.6, 0, 0),
        thighL: P(-0.16, 0, 0.08),
        shinL: P(-0.24, 0, 0),
        thighR: P(-0.16, 0, -0.08),
        shinR: P(-0.24, 0, 0)
      }],
      [0.8, -0.05, {
        core: P(0.2, 0, 0),
        chest: P(0.14, 0, 0),
        neck: P(-0.14, 0, 0),
        head: P(-0.24, 0, 0),
        upperArmL: P(-1.567, 0.501, 0.502),
        foreArmL: P(-4e-3, -0.011, -2.405),
        upperArmR: P(-1.567, -0.501, -0.502),
        foreArmR: P(-4e-3, 0.011, 2.405),
        thighL: P(-0.22, 0, 0.08),
        shinL: P(-0.34, 0, 0),
        thighR: P(-0.22, 0, -0.08),
        shinR: P(-0.34, 0, 0)
      }],
      [1.15, -0.02, {
        core: P(0.06, 0, 0),
        chest: P(0.04, 0, 0),
        neck: P(-0.04, 0, 0),
        head: P(-0.08, 0, 0),
        upperArmL: P(-1.743, 0.343, 0.289),
        upperArmR: P(-1.743, -0.343, -0.289),
        foreArmL: P(0.441, 0.707, -2.051),
        foreArmR: P(0.441, -0.707, 2.051)
      }]
    ],
    domain_expand: [
      [0, -0.02, {
        core: P(0.06, 0, 0),
        chest: P(0.04, 0, 0),
        neck: P(-0.04, 0, 0),
        head: P(-0.08, 0, 0),
        upperArmL: P(-1.764, 0.344, 0.284),
        foreArmL: P(0.501, 0.782, -2.03),
        handL: P(-0.55, 0, 0),
        upperArmR: P(-1.764, -0.344, -0.284),
        foreArmR: P(0.501, -0.782, 2.03),
        handR: P(-0.55, 0, 0),
        thighL: P(-0.12, 0, 0.08),
        thighR: P(-0.12, 0, -0.08)
      }],
      [0.16, -0.06, {
        core: P(0.28, 0, 0),
        chest: P(0.18, 0, 0),
        neck: P(-0.2, 0, 0),
        head: P(-0.3, 0, 0),
        shoulderL: P(0, 0, 0.3),
        shoulderR: P(0, 0, -0.3),
        upperArmL: P(-1.516, 0.487, 0.513),
        foreArmL: P(-0.065, -0.185, -2.47),
        upperArmR: P(-1.516, -0.487, -0.513),
        foreArmR: P(-0.065, 0.185, 2.47),
        thighL: P(-0.34, 0, 0.1),
        shinL: P(-0.5, 0, 0),
        thighR: P(-0.34, 0, -0.1),
        shinR: P(-0.5, 0, 0)
      }],
      [0.34, 0.08, {
        hips: P(-0.26, 0, 0),
        core: P(-0.78, 0, 0),
        chest: P(-0.44, 0, 0),
        neck: P(0.6, 0, 0),
        head: P(0.68, 0, 0),
        shoulderL: P(0, 0, -0.25),
        shoulderR: P(0, 0, 0.25),
        upperArmL: P(-0.82, 0.335, 0.743),
        foreArmL: P(0.853, -0.182, 0.395),
        handL: P(0.45, 0, 0),
        upperArmR: P(-0.82, -0.335, -0.743),
        foreArmR: P(0.853, 0.182, -0.395),
        handR: P(0.45, 0, 0),
        thighL: P(0.32, 0, 0.26),
        shinL: P(-0.3, 0, 0),
        thighR: P(0.32, 0, -0.26),
        shinR: P(-0.3, 0, 0)
      }],
      [0.62, 0.02, {
        hips: P(-0.05, 0, 0),
        core: P(-0.4, 0, 0),
        chest: P(-0.22, 0, 0),
        neck: P(0.3, 0, 0),
        head: P(0.34, 0, 0),
        upperArmL: P(-1.061, 0.34, 0.57),
        foreArmL: P(1.055, -0.408, 0.682),
        upperArmR: P(-1.061, -0.34, -0.57),
        foreArmR: P(1.055, 0.408, -0.682),
        thighL: P(0.18, 0, 0.2),
        thighR: P(0.18, 0, -0.2)
      }],
      [0.92, 0, {
        core: P(-0.04, 0, 0),
        chest: P(-0.02, 0, 0),
        neck: P(0.04, 0, 0),
        head: P(0.04, 0, 0),
        upperArmL: P(-1.619, -0.03, -0.029),
        foreArmL: P(1.38, -0.545, 0.652),
        upperArmR: P(-1.619, 0.03, 0.029),
        foreArmR: P(1.38, 0.545, -0.652)
      }]
    ],
    guard_infinity: [
      [0, 0, {}],
      [0.22, -0.02, {
        hips: P(0, 0.4, 0),
        core: P(0.1, 0.34, 0),
        chest: P(0.06, 0.3, 0),
        neck: P(-0.1, -0.24, 0),
        head: P(-0.06, -0.18, 0),
        shoulderR: P(0, 0, -0.16),
        upperArmR: P(-1.571, -0.163, -0.163),
        foreArmR: P(-2e-3, -3e-3, -1.834),
        handR: P(-0.35, 0, 0),
        shoulderL: P(0, 0, 0.08),
        upperArmL: P(-1.527, 0.011, 0.011),
        foreArmL: P(1.866, -0.316, 0.235),
        handL: P(-0.2, 0, 0),
        thighL: P(-0.2, 0, 0.14),
        shinL: P(-0.26, 0, 0),
        thighR: P(-0.16, 0, -0.14),
        shinR: P(-0.3, 0, 0)
      }],
      [0.6, -0.02, {
        core: P(0.12, 0.36, 0),
        chest: P(0.07, 0.32, 0),
        neck: P(-0.11, -0.25, 0),
        head: P(-0.07, -0.19, 0),
        upperArmR: P(-1.46, 0, -0.25),
        upperArmL: P(-0.31, 0, 0.43)
      }],
      [1, -0.02, {
        core: P(0.1, 0.34, 0),
        chest: P(0.06, 0.3, 0),
        neck: P(-0.1, -0.24, 0),
        head: P(-0.06, -0.18, 0),
        upperArmR: P(-1.48, 0, -0.24),
        upperArmL: P(-0.3, 0, 0.42)
      }]
    ],
    heal: [
      [0, 0, {}],
      [0.28, -0.05, {
        core: P(0.26, 0.1, 0),
        chest: P(0.18, 0.08, 0),
        neck: P(-0.22, -0.06, 0),
        head: P(-0.34, -0.04, 0),
        shoulderL: P(0, 0, 0.26),
        shoulderR: P(0, 0, -0.26),
        upperArmL: P(-1.517, 0.351, 0.37),
        foreArmL: P(-0.087, -0.265, -2.508),
        handL: P(-0.7, 0, 0),
        upperArmR: P(-1.578, -0.633, -0.628),
        foreArmR: P(6e-3, -0.019, 2.485),
        handR: P(-0.7, 0, 0),
        thighL: P(-0.42, 0, 0.1),
        shinL: P(-0.68, 0, 0),
        thighR: P(-0.42, 0, -0.1),
        shinR: P(-0.68, 0, 0)
      }],
      [0.62, -0.04, {
        core: P(0.3, 0.1, 0),
        chest: P(0.2, 0.08, 0),
        neck: P(-0.26, -0.06, 0),
        head: P(-0.38, -0.04, 0),
        upperArmL: P(-1.5, 0.316, 0.338),
        foreArmL: P(-0.125, -0.388, -2.524),
        upperArmR: P(-1.42, -0.649, -0.747),
        foreArmR: P(-0.119, 0.355, 2.503),
        thighL: P(-0.46, 0, 0.1),
        shinL: P(-0.74, 0, 0),
        thighR: P(-0.46, 0, -0.1),
        shinR: P(-0.74, 0, 0)
      }],
      [1, -0.02, {
        core: P(0.16, 0.06, 0),
        chest: P(0.1, 0.05, 0),
        neck: P(-0.14, -0.03, 0),
        head: P(-0.2, 0, 0),
        upperArmL: P(-1.67, 0.515, 0.468),
        foreArmL: P(0.119, 0.301, -2.395),
        upperArmR: P(-1.848, -0.347, -0.263),
        foreArmR: P(0.853, -0.925, 1.663),
        thighL: P(-0.26, 0, 0.08),
        shinL: P(-0.44, 0, 0),
        thighR: P(-0.26, 0, -0.08),
        shinR: P(-0.44, 0, 0)
      }]
    ],
    /* --- 情绪 --- */
    taunt: [
      [0, 0, {}],
      [0.2, 0, {
        hips: P(0, -0.12, 0),
        core: P(-0.08, -0.14, 0),
        chest: P(-0.05, -0.12, 0),
        neck: P(-0.1, 0.1, 0),
        head: P(-0.16, 0.12, -0.05),
        upperArmR: P(-0.303, 0, -2e-3),
        foreArmR: P(-1.841, -6e-3, -5e-3),
        handR: P(-0.45, 0, 0),
        upperArmL: P(-0.1, 0, 0.28),
        foreArmL: P(-0.55, 0, 0)
      }],
      [0.44, 0.02, {
        hips: P(0, 0.14, 0),
        core: P(0.04, 0.16, 0),
        chest: P(0.03, 0.14, 0),
        neck: P(-0.06, -0.1, 0),
        head: P(-0.1, -0.12, 0.05),
        upperArmR: P(-1.632, -0.051, -0.048),
        foreArmR: P(-1.461, -0.897, -0.986),
        handR: P(0.55, 0, 0)
      }],
      [0.7, 0, {
        core: P(0.14, 0.08, 0),
        chest: P(0.1, 0.08, 0),
        neck: P(-0.12, -0.06, 0),
        head: P(-0.18, -0.06, 0),
        upperArmR: P(-1.187, 0.36, 0.528),
        foreArmR: P(-1.267, -1.003, -1.283),
        upperArmL: P(-0.12, 0, 0.26)
      }],
      [1, 0, {}]
    ],
    victory: [
      [0, 0, {}],
      [0.22, 0.06, {
        hips: P(0, -0.1, 0),
        core: P(-0.24, -0.12, 0),
        chest: P(-0.14, -0.1, 0),
        neck: P(0.18, 0.1, 0),
        head: P(0.24, 0.12, 0),
        shoulderL: P(0, 0, -0.18),
        shoulderR: P(0, 0, 0.18),
        upperArmL: P(-1.863, 0.083, 0.062),
        foreArmL: P(-1.386, 0.239, 0.287),
        handL: P(0.4, 0, 0),
        upperArmR: P(-1.708, 0, 0),
        foreArmR: P(-1.226, 2e-3, 2e-3),
        handR: P(0.35, 0, 0),
        thighL: P(0.16, 0, 0.2),
        shinL: P(-0.2, 0, 0),
        thighR: P(0.16, 0, -0.2),
        shinR: P(-0.2, 0, 0)
      }],
      [0.52, 0.04, {
        core: P(-0.16, -0.06, 0),
        chest: P(-0.1, -0.05, 0),
        neck: P(0.12, 0.05, 0),
        head: P(0.16, 0.06, 0),
        upperArmL: P(-1.79, 0.056, 0.045),
        upperArmR: P(-1.706, -0.021, -0.019),
        foreArmL: P(-1.639, 0.281, 0.262),
        foreArmR: P(-1.62, -0.166, -0.158)
      }],
      [0.85, 0.03, {
        core: P(-0.2, -0.08, 0),
        chest: P(-0.12, -0.06, 0),
        neck: P(0.16, 0.06, 0),
        head: P(0.2, 0.08, 0),
        upperArmL: P(-1.816, 0.066, 0.051),
        upperArmR: P(-1.733, -0.021, -0.018),
        foreArmL: P(-1.454, 0.243, 0.272),
        foreArmR: P(-1.41, -0.111, -0.13)
      }]
    ],
    defeat: [
      [0, 0, {}],
      [0.24, -0.24, {
        hips: P(-0.3, 0, 0),
        core: P(0.62, 0, 0.1),
        chest: P(0.34, 0, 0.08),
        neck: P(0.42, 0.06, 0),
        head: P(0.46, 0.08, 0),
        upperArmL: P(-0.728, 0.027, 0.07),
        foreArmL: P(-0.955, 0.045, 0.086),
        upperArmR: P(-0.632, -0.066, -0.202),
        foreArmR: P(-1.223, -0.23, -0.326),
        thighL: P(-0.95, 0, 0.24),
        shinL: P(-1.35, 0, 0),
        footL: P(0.35, 0, 0),
        thighR: P(-0.85, 0, -0.24),
        shinR: P(-1.5, 0, 0),
        footR: P(0.35, 0, 0)
      }],
      [0.46, -0.7, {
        hips: P(-1.3, 0, 0),
        core: P(0.36, 0, 0),
        chest: P(0.18, 0, 0),
        neck: P(0.14, 0.06, 0),
        head: P(0.16, 0.1, 0),
        upperArmL: P(-2.15, 0, 1),
        foreArmL: P(-0.8, 0, 0),
        upperArmR: P(-2.05, 0, -0.95),
        foreArmR: P(-0.7, 0, 0),
        thighL: P(-0.55, 0, 0.26),
        shinL: P(-0.75, 0, 0),
        thighR: P(-0.45, 0, -0.26),
        shinR: P(-0.85, 0, 0)
      }],
      [0.62, -0.8, {
        hips: P(-1.48, 0, 0),
        core: P(0.08, 0, 0),
        chest: P(0.05, 0, 0),
        neck: P(0.1, 0.06, 0),
        head: P(0.12, 0.1, 0),
        upperArmL: P(-2.05, 0, 1.1),
        upperArmR: P(-1.95, 0, -1.05),
        thighL: P(-0.42, 0, 0.3),
        shinL: P(-0.5, 0, 0),
        thighR: P(-0.38, 0, -0.3),
        shinR: P(-0.6, 0, 0)
      }],
      [0.9, -0.82, { core: P(0.04, 0, 0), chest: P(0.03, 0, 0), neck: P(0.06, 0.04, 0), head: P(0.08, 0.06, 0) }]
    ]
  };
  var ONESHOT = {
    dash: "easeIn",
    punch: "easeOut",
    punch2: "easeOut",
    kick: "easeOut",
    upper: "easeOut",
    combo_finish: "easeOut",
    cast_point: "easeOut",
    cast_charge: "easeIn",
    cast_release: "easeOut",
    chant: "easeIn",
    domain_expand: "easeOut",
    guard_infinity: "easeIn",
    heal: "easeIn",
    air_spin: "easeOut",
    backstep: "easeOut",
    jump: "easeOut",
    land: "easeIn",
    block: "easeOut",
    block_hit: "easeOut",
    hit_light: "easeOut",
    hit_heavy: "easeOut",
    knockback: "easeOut",
    down: "easeOut",
    getup: "easeIn",
    taunt: "easeOut",
    victory: "easeOut",
    defeat: "easeOut"
  };
  var animSpeed = (name) => name === "run" ? 0.72 : name === "walk" ? 0.95 : name === "idle" ? 2.6 : 1.15;
  var OVERRIDES = {
    gojo: {
      taunt: { head: P(-0.22, 0.2, -0.1), upperArmR: P(-1.25, 0, -0.3), foreArmR: P(-0.35, 0, 0), handR: P(-0.55, 0, 0), core: P(-0.04, -0.16, 0) }
    },
    sukuna: {
      idle: { core: P(0.05, 0, 0), upperArmL: P(-0.14, 0, 0.3), foreArmL: P(-0.45, 0, 0), upperArmR: P(-0.14, 0, -0.3), foreArmR: P(-0.45, 0, 0), thighL: P(0.04, 0, 0.09), thighR: P(0.04, 0, -0.09) },
      taunt: { head: P(-0.1, 0.22, 0.1), upperArmR: P(-0.85, 0, -0.85), foreArmR: P(-1.25, 0, 0), handR: P(0.3, 0, 0), core: P(0.1, -0.1, 0) },
      victory: { head: P(-0.3, 0.14, 0), upperArmL: P(-1.15, 0, 0.95), upperArmR: P(-1.15, 0, -0.95) }
    }
  };
  function createSampler(lib, overrides) {
    const cache = /* @__PURE__ */ new Map();
    const zero = P(0, 0, 0);
    const compile = (name) => {
      const raw = lib[name];
      if (!raw) return null;
      const frames = raw.map(([t, ry, pose]) => ({
        t,
        ry: ry || 0,
        pose: Object.assign({}, pose, overrides && overrides[name] ? overrides[name] : {})
      }));
      const base = {};
      const idle0 = lib.idle && lib.idle[0] && lib.idle[0][2] || {};
      for (const b of BONES) base[b] = idle0[b] || zero;
      const firstSeen = {};
      for (const f of frames) {
        for (const b of BONES) {
          if (f.pose[b] !== void 0 && firstSeen[b] === void 0) firstSeen[b] = f.pose[b];
        }
      }
      for (const f of frames) {
        for (const b of BONES) {
          if (f.pose[b] === void 0) f.pose[b] = firstSeen[b] !== void 0 ? firstSeen[b] : base[b];
        }
      }
      const dur = frames[frames.length - 1].t || 1;
      return { frames, dur };
    };
    const get = (name) => {
      if (!cache.has(name)) cache.set(name, compile(name));
      return cache.get(name);
    };
    const sample = (name, t, out) => {
      const clip = get(name);
      if (!clip) return false;
      const d = clip.dur;
      const tt = clamp5(t, 0, d);
      const fr = clip.frames;
      let i = 0;
      while (i < fr.length - 2 && tt > fr[i + 1].t) i++;
      const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)];
      const span = Math.max(1e-6, b.t - a.t);
      const e = easeInOut(clamp5((tt - a.t) / span, 0, 1));
      for (const bone of BONES) {
        const va = a.pose[bone], vb = b.pose[bone];
        const o = out[bone];
        o[0] = va[0] + (vb[0] - va[0]) * e;
        o[1] = va[1] + (vb[1] - va[1]) * e;
        o[2] = va[2] + (vb[2] - va[2]) * e;
      }
      out.__rootY = a.ry + (b.ry - a.ry) * e;
      out.__hipsYaw = out.hips[1];
      return true;
    };
    return { get, sample, has: (n) => !!lib[n] };
  }
  function createFighter(who, opts) {
    const side = who === "sukuna" ? "sukuna" : "gojo";
    const q = normQuality(opts && opts.quality);
    const src = side === "gojo" ? gojoPalette(q) : sukunaPalette(q);
    const rig = buildRig(side, src, q);
    const { root, bones } = rig;
    const sampler = createSampler(POSE_LIB, OVERRIDES[side]);
    const toonMats = collectToonMaterials(root);
    const poseBuf = {};
    for (const b of BONES) poseBuf[b] = [0, 0, 0];
    const state2 = {
      hp: 1e3,
      hpMax: 1e3,
      ce: 500,
      ceMax: 500,
      domain: 0,
      dead: false,
      anim: "idle",
      animT: 0,
      phase: "idle"
    };
    const ctrl = {
      root,
      handR: rig.handR,
      handL: rig.handL,
      chest: rig.chest,
      handR2: rig.handR2,
      handL2: rig.handL2,
      bones,
      state: state2,
      side
    };
    let curName = "idle";
    let curT = 0;
    let curSpeed = animSpeed("idle");
    let curLoop = true;
    let onEndCb = null;
    let ended = false;
    let tGlobal = 0;
    let flash = 0;
    let flashDecay = 3.2;
    let knock = new Vector3();
    let guardOn = false;
    let auraOn = false;
    let domained = false;
    let mode = "normal";
    let awakenedT = 0;
    let blindfoldOn = side === "gojo";
    const WALK_SPEED = 2;
    const RUN_SPEED = 5.2;
    const moveDir = new Vector3();
    const tmpV = new Vector3();
    const prevHeadPos = new Vector3();
    const headVel = new Vector3();
    const hipsRestY = bones.hips.position.y;
    let targetYaw = null;
    const setFlash = (v) => {
      flash = clamp5(v, 0, 1);
      for (const m of toonMats) m.uniforms.uFlash.value = flash;
    };
    const applyAuraMats = () => {
      const boost = domained ? 1.9 : auraOn ? 1.35 : guardOn ? 1.5 : 1;
      const rimCol = domained || auraOn || guardOn ? src.auraColor : src.rim;
      for (const m of toonMats) {
        const base = m.userData.base;
        m.uniforms.uRimStrength.value = base.rimStrength * boost;
        m.uniforms.uEmissiveI.value = base.emissiveI * (domained ? 2 : auraOn ? 1.3 : 1) + (domained ? 0.38 : auraOn ? 0.16 : guardOn ? 0.22 : 0);
        m.uniforms.uRim.value.setHex(rimCol);
      }
      if (rig.shellMesh && q.shell) {
        rig.shellMesh.visible = auraOn || domained || guardOn;
        rig.shellMesh.scale.set(
          guardOn && !domained ? 0.9 : domained ? 1.12 : 1,
          guardOn && !domained ? 0.94 : domained ? 1.1 : 1,
          guardOn && !domained ? 0.64 : domained ? 0.82 : 0.72
        );
        src.mat.shell.uniforms.uOpacity.value = domained ? 0.3 : guardOn ? 0.26 : 0.15;
      }
      for (const r of rig.runes) r.visible = domained && q.shell;
    };
    const update2 = (dt) => {
      const d = Math.min(Math.max(dt || 0, 0), 0.1);
      tGlobal += d;
      state2.animT = curT;
      const clip = sampler.get(curName);
      const dur = clip ? clip.dur : 1;
      curT += d * curSpeed;
      if (curLoop) {
        if (dur > 0) curT = curT % dur;
      } else if (curT >= dur) {
        curT = dur;
        if (!ended) {
          ended = true;
          const cb = onEndCb;
          onEndCb = null;
          if (cb) {
            try {
              cb();
            } catch (e) {
            }
          }
        }
      }
      if (!sampler.sample(curName, curT, poseBuf)) return;
      for (const b of BONES) {
        const node = bones[b];
        const v = poseBuf[b];
        node.rotation.set(v[0], v[1], v[2]);
      }
      bones.hips.position.y = hipsRestY + poseBuf.__rootY;
      if (q.secondary) {
        const breath = Math.sin(tGlobal * 1.75) * 0.026;
        const sway = Math.sin(tGlobal * 0.62) * 0.02;
        const sway2 = Math.cos(tGlobal * 0.48) * 0.016;
        bones.chest.rotation.x += breath;
        bones.core.rotation.z += sway;
        bones.hips.rotation.z += sway2;
        bones.neck.rotation.y += Math.sin(tGlobal * 0.37 + 1.1) * 0.05;
        bones.head.rotation.z += Math.sin(tGlobal * 0.9) * 0.02;
        bones.head.getWorldPosition(tmpV);
        headVel.copy(tmpV).sub(prevHeadPos).multiplyScalar(28);
        prevHeadPos.copy(tmpV);
        if (headVel.lengthSq() > 4) headVel.setLength(2);
        for (const h of rig.hairTips) {
          h.mesh.rotation.x = h.base.x + headVel.z * 0.1 * h.lag;
          h.mesh.rotation.z = h.base.z - headVel.x * 0.1 * h.lag;
        }
      }
      if (q.cloth) {
        knock.multiplyScalar(Math.max(0, 1 - d * 7.5));
        const speed = knock.length();
        for (const c of rig.cloth) {
          const w = Math.sin(tGlobal * 4.2 + c.phase * 2) * 0.5 + Math.sin(tGlobal * 2.3 + c.phase) * 0.5;
          const amp = c.amp * (0.16 + Math.min(1.6, speed * 0.34));
          c.mesh.rotation.x = c.base.x + w * amp;
          c.mesh.rotation.z = c.base.z + Math.cos(tGlobal * 3.1 + c.phase) * amp * 0.4;
          c.mesh.position.y = c.basePos.y - Math.abs(w) * amp * 0.06;
        }
      }
      if (knock.lengthSq() > 1e-6) {
        root.position.x += knock.x * d;
        root.position.z += knock.z * d;
      }
      if (flash > 0) setFlash(Math.max(0, flash - d * flashDecay));
      if (targetYaw !== null) {
        const diff = angleDelta(root.rotation.y, targetYaw);
        const step = Math.sign(diff) * Math.min(Math.abs(diff), d * 9);
        root.rotation.y += step;
        if (Math.abs(diff) < 2e-3) {
          root.rotation.y = targetYaw;
          targetYaw = null;
        }
      }
      {
        const canShow = !rig.isGojo;
        const on = canShow && mode === "awakened";
        awakenedT += ((on ? 1 : 0) - awakenedT) * Math.min(1, d * 6.5);
        const k = awakenedT;
        for (const tag of ["L", "R"]) {
          const a2 = rig.arms2[tag];
          a2.sh.visible = k > 0.02;
          if (!a2.sh.visible) continue;
          const pop = 1 - k;
          const sgn = tag === "L" ? 1 : -1;
          a2.sh.scale.setScalar(0.04 + 0.96 * easeOut2(k));
          const mainU = bones["upperArm" + tag];
          const mainF = bones["foreArm" + tag];
          a2.sh.rotation.set(
            0.1 + mainU.rotation.x * 0.62,
            mainU.rotation.y * 0.55,
            sgn * (0.44 + mainU.rotation.z * 0.33)
          );
          a2.fa.rotation.set(
            0.06 + mainF.rotation.x * 0.7,
            mainF.rotation.y * 0.7,
            sgn * 0.24 + mainF.rotation.z * 0.55
          );
        }
        if (k > 0.5) rig.sync2();
        else rig.syncFallback();
      }
    };
    const has = (name) => sampler.has(name);
    const play2 = (name, o) => {
      const opt = o || {};
      if (!sampler.has(name)) return;
      const loop3 = opt.loop !== void 0 ? !!opt.loop : ONESHOT[name] === void 0;
      if (name === curName && loop3) {
        curSpeed = (opt.speed !== void 0 ? opt.speed : 1) * animSpeed(name);
        return;
      }
      curName = name;
      curT = 0;
      ended = false;
      curLoop = loop3;
      curSpeed = (opt.speed !== void 0 ? opt.speed : 1) * animSpeed(name);
      onEndCb = typeof opt.onEnd === "function" ? opt.onEnd : null;
      state2.anim = name;
      if (/^(punch|punch2|kick|upper|combo_finish|dash|backstep|air_spin)$/.test(name)) state2.phase = "attack";
      else if (/^(walk|run|jump|land)$/.test(name)) state2.phase = "move";
      else if (/^(block|block_hit|guard_infinity)$/.test(name)) state2.phase = "guard";
      else if (/^(hit_light|hit_heavy|knockback)$/.test(name)) state2.phase = "hit";
      else if (/^(cast_charge|cast_release|cast_point|chant|heal)$/.test(name)) state2.phase = "cast";
      else if (name === "domain_expand") state2.phase = "domain";
      else if (/^(down|getup|defeat)$/.test(name)) state2.phase = "down";
      else if (name === "victory") state2.phase = "win";
      else state2.phase = "idle";
      if (name === "down" || name === "defeat") state2.dead = name === "defeat" ? state2.dead : state2.dead;
    };
    const playOnce2 = (name, o) => {
      const opt = o || {};
      return new Promise((resolve) => {
        if (!has(name)) {
          resolve();
          return;
        }
        play2(name, { speed: opt.speed, loop: false, onEnd: () => resolve() });
      });
    };
    const getPos = () => root.position.clone();
    const setPos = (x, y, z) => {
      root.position.set(x || 0, y || 0, z || 0);
      return ctrl;
    };
    const getYaw = () => root.rotation.y;
    const faceTo = (x, z, instant) => {
      const dx = x - root.position.x;
      const dz = z - root.position.z;
      if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return;
      const yaw = Math.atan2(dx, dz);
      if (instant) {
        root.rotation.y = yaw;
        targetYaw = null;
      } else targetYaw = yaw;
    };
    const moveTowards = (x, z, speed, dt) => {
      const dx = x - root.position.x;
      const dz = z - root.position.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) return 0;
      const step = Math.min(len, Math.max(0, speed) * dt);
      moveDir.set(dx / len, 0, dz / len);
      root.position.x += moveDir.x * step;
      root.position.z += moveDir.z * step;
      faceTo(x, z, false);
      if (curName === "idle" || curName === "walk" || curName === "run") {
        const want = speed >= RUN_SPEED * 0.8 ? "run" : speed >= WALK_SPEED * 0.5 ? "walk" : "idle";
        if (want !== curName) play2(want, { loop: true });
      }
      return step;
    };
    const hitFlash = (amount, fromDir) => {
      const a = clamp5(amount === void 0 ? 1 : amount, 0, 2);
      setFlash(Math.min(1, a));
      flashDecay = 3 + a * 2;
      if (fromDir && fromDir.isVector3) {
        tmpV.copy(fromDir);
        tmpV.y = 0;
        if (tmpV.lengthSq() > 1e-6) {
          tmpV.normalize().multiplyScalar(2.4 * a);
          knock.x += tmpV.x;
          knock.z += tmpV.z;
        }
      }
    };
    const setGuard = (on) => {
      guardOn = !!on;
      applyAuraMats();
      if (guardOn) play2("guard_infinity", { loop: true, speed: 0.9 });
    };
    const setAura = (on) => {
      auraOn = !!on;
      applyAuraMats();
    };
    const setDomained = (on) => {
      domained = !!on;
      applyAuraMats();
    };
    const setVisible = (v) => {
      root.visible = !!v;
    };
    const setScale = (s) => {
      const v = s === void 0 ? 1 : s;
      root.scale.setScalar(v);
    };
    const setMode = (m) => {
      mode = m === "awakened" ? "awakened" : "normal";
      if (mode === "awakened") {
        if (side === "gojo") setBlindfold(false);
        else for (const o of rig.meshes) {
          if (o.name && o.name.indexOf("eye2") === 0) o.material = src.mat.eye;
        }
        setDomained(domained);
      } else if (side === "sukuna") {
        for (const o of rig.meshes) if (o.name && o.name.indexOf("eye2") === 0) o.material = src.mat.eye2;
      }
    };
    const setBlindfold = (on) => {
      blindfoldOn = !!on;
      if (side !== "gojo") return;
      for (const o of rig.meshes) {
        const n = o.name || "";
        if (n.indexOf("eyeGlow") === 0) o.visible = !blindfoldOn;
        if (n.indexOf("eyeHalo") === 0) o.visible = !blindfoldOn;
        if (o.material === src.mat.blindfold) o.visible = blindfoldOn;
      }
    };
    const reset = () => {
      curName = "idle";
      curT = 0;
      ended = false;
      curLoop = true;
      curSpeed = animSpeed("idle");
      onEndCb = null;
      state2.anim = "idle";
      state2.animT = 0;
      state2.phase = "idle";
      state2.dead = false;
      tGlobal = 0;
      setFlash(0);
      knock.set(0, 0, 0);
      targetYaw = null;
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      setScale(1);
      setAura(false);
      setDomained(false);
      guardOn = false;
      mode = "normal";
      awakenedT = 0;
      if (rig.arms2.L) {
        rig.arms2.L.sh.visible = false;
        rig.arms2.R.sh.visible = false;
      }
      if (side === "gojo") setBlindfold(true);
      else for (const o of rig.meshes) if (o.name && o.name.indexOf("eye2") === 0) o.material = src.mat.eye2;
      if (rig.shellMesh) rig.shellMesh.visible = false;
      for (const r of rig.runes) r.visible = false;
      sampler.sample("idle", 0, poseBuf);
      for (const b of BONES) {
        const v = poseBuf[b];
        bones[b].rotation.set(v[0], v[1], v[2]);
      }
      bones.hips.position.y = hipsRestY + poseBuf.__rootY;
      for (const c of rig.cloth) {
        c.mesh.rotation.copy(c.base);
        c.mesh.position.copy(c.basePos);
      }
      for (const h of rig.hairTips) h.mesh.rotation.copy(h.base);
      if (rig.arms2.L) rig.sync2();
      applyAuraMats();
    };
    Object.assign(ctrl, {
      getPos,
      setPos,
      faceTo,
      moveTowards,
      play: play2,
      playOnce: playOnce2,
      has,
      update: update2,
      hitFlash,
      setGuard,
      setAura,
      setDomained,
      setVisible,
      setScale,
      setMode,
      reset,
      setBlindfold,
      getYaw,
      // 便捷只读
      get quality() {
        return opts && opts.quality ? opts.quality : "high";
      },
      get mode() {
        return mode;
      },
      get guard() {
        return guardOn;
      },
      get aura() {
        return auraOn;
      },
      get domained() {
        return domained;
      },
      animNames: ANIM_NAMES.slice(),
      materials: src.mat,
      palette: src,
      dispose() {
        root.traverse((o) => {
          if (o.isMesh) {
            if (o.geometry && o.geometry.dispose) o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) if (m && m.dispose) m.dispose();
          }
        });
      }
    });
    reset();
    applyAuraMats();
    return ctrl;
  }
