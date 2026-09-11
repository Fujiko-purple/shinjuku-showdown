  var AMBIENT = new Color(2239554);
  var LIGHT_COLOR = new Color(11058909);
  var FILL = new Color(1317162);
  var LIGHT_DIR = new Vector3(0.42, -0.8, 0.43).normalize();
  var SUN_DIR = LIGHT_DIR.clone().negate().normalize();
  var INK_DARK = 1008153;
  var _tmpColor = new Color();
  var matCache = /* @__PURE__ */ new WeakMap();

  /**
   * toonMat —— 统一的卡通材质工厂
   * 新增：
   *   vc    顶点色模式（合并网格靠它用一张材质画出多种颜色，draw call 直接砍半）
   *   ink   剪影墨色 / inkAmount 边缘压深强度
   *   decal 贴片模式（脸部球面贴片，开 polygonOffset 防止与头面 z-fighting）
   */
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
      opt.blending !== void 0 ? opt.blending : 0,
      opt.vc ? 1 : 0,
      opt.ink !== void 0 ? opt.ink : src.ink,
      opt.inkAmount !== void 0 ? opt.inkAmount : src.inkAmount,
      opt.decal ? 1 : 0
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
    uni.uInk = { value: new Color(opt.ink !== void 0 ? opt.ink : src.ink) };
    uni.uLightDir = { value: SUN_DIR.clone() };
    uni.uAmbient = { value: AMBIENT.clone() };
    uni.uLightColor = { value: LIGHT_COLOR.clone() };
    uni.uFill = { value: FILL.clone() };
    uni.uBands = { value: opt.bands || src.bands };
    uni.uRimPower = { value: opt.rimPower !== void 0 ? opt.rimPower : src.rimPower };
    uni.uRimStrength = { value: opt.rimStrength !== void 0 ? opt.rimStrength : src.rimStrength };
    uni.uEmissiveI = { value: opt.emissiveI || 0 };
    uni.uInkAmount = { value: opt.inkAmount !== void 0 ? opt.inkAmount : src.inkAmount };
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
      vertexColors: !!opt.vc,
      fog: true,
      lights: false,
      transparent: !!opt.transparent,
      depthWrite: opt.transparent ? false : true,
      side: opt.side !== void 0 ? opt.side : FrontSide,
      blending: opt.blending !== void 0 ? opt.blending : NormalBlending,
      polygonOffset: !!opt.decal,
      polygonOffsetFactor: opt.decal ? -2 : 0,
      polygonOffsetUnits: opt.decal ? -2 : 0
    });
    mat.userData.base = {
      color: new Color(argb),
      emissive: new Color(emi),
      emissiveI: opt.emissiveI || 0,
      rimStrength: opt.rimStrength !== void 0 ? opt.rimStrength : src.rimStrength,
      opacity: opt.opacity !== void 0 ? opt.opacity : 1
    };
    mat.userData.isToon = true;
    mat.userData.isOutline = !!opt.outline;
    bag.set(key, mat);
    return mat;
  }

  // 受击闪白 / 咒力光晕只作用在角色本体上：描边壳、落地阴影不参与
  function collectToonMaterials(root) {
    const set = /* @__PURE__ */ new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && m.userData && m.userData.isToon && !m.userData.isOutline) set.add(m);
      }
    });
    return [...set];
  }

  var _boxCache = /* @__PURE__ */ new Map();
  function boxGeo(w, h, d) {
    const k = "b" + w + "|" + h + "|" + d;
    let g = _boxCache.get(k);
    if (!g) {
      g = new BoxGeometry(w, h, d);
      _boxCache.set(k, g);
    }
    return g;
  }
  var _blobCache = /* @__PURE__ */ new Map();
  function blobC(w, h, d, q) {
    const k = "l" + w + "|" + h + "|" + d + "|" + q.radial + "|" + q.seg;
    let g = _blobCache.get(k);
    if (!g) {
      g = blobGeo(w, h, d, q);
      _blobCache.set(k, g);
    }
    return g;
  }
  var _limbCache = /* @__PURE__ */ new Map();
  function limbC(rTop, rBot, len, q, bulge) {
    const k = "m" + rTop + "|" + rBot + "|" + len + "|" + q.radial + "|" + q.seg + "|" + (bulge || 1);
    let g = _limbCache.get(k);
    if (!g) {
      g = limbY(rTop, rBot, len, q, bulge);
      _limbCache.set(k, g);
    }
    return g;
  }

  /* =========================================================================
   *  两个角色的配色与材质
   *  材质数量刻意压到最少：本体只有 body / skin / cloth 三张顶点色材质，
   *  其余（脸 / 眼罩 / 眼 / 纹样 / 外壳 / 描边）各一张
   * ========================================================================= */
  function commonMat(src, q) {
    const M = (c, o) => toonMat(src, c, o);
    src.mat.outline = M(src.ink, { outline: true, rim: src.rim, rimPower: 1.5, transparent: true, opacity: 0.95, side: BackSide });
    src.mat.shell = M(src.auraColor, { transparent: true, opacity: 0.16, blending: AdditiveBlending, glowOnly: 2.1, rimPower: 1.7, side: DoubleSide });
    src.mat.runes = M(src.auraColor, { map: src.tex.runes, transparent: true, opacity: 0.9, blending: AdditiveBlending, glowOnly: 0.9, side: DoubleSide, rim: src.rim, rimStrength: 0.6 });
  }

  function gojoPalette(q) {
    const src = {
      rim: C.CYAN,
      rimPower: 2.0,
      rimStrength: 0.34,
      bands: 3,
      ink: 657930,
      inkAmount: 0.5,
      tex: {
        faceBlind: texGojoFaceBlind(q.tex),
        faceEyes: texGojoFaceEyes(q.tex),
        blindfold: texGojoBlindfold(q.tex),
        runes: texRunes(q.tex, "#5ff0ff", "#2b86ff"),
        glow: texGlow2(q.tex, "#ffffff", "#5ff0ff"),
        shadow: texContactShadow(q.tex > 256 ? 256 : q.tex)
      }
    };
    const M = (c, o) => toonMat(src, c, o);
    const vc = { vc: true, bands: 3 };
    src.mat = {
      // ---- 本体：顶点色，一张材质画完制服 / 裤子 / 靴子 / 头发 ----
      body: M(16777215, Object.assign({ rim: C.NEON_CYAN, rimStrength: 0.30, ink: 657930, inkAmount: 0.52 }, vc)),
      skin: M(16777215, Object.assign({ rim: 16770773, rimPower: 2.6, rimStrength: 0.16, ink: 526600, inkAmount: 0.34 }, vc)),
      hair: M(16777215, Object.assign({ rim: C.CYAN, rimStrength: 0.62, rimPower: 1.5, emissive: C.AZURE, emissiveI: 0.05, ink: 1184538, inkAmount: 0.4 }, vc)),
      // ---- 脸：两张球面贴片（眼罩态 / 六眼态），切换零成本 ----
      face: M(16777215, { map: src.tex.faceBlind, bands: 3, rim: 16770773, rimPower: 2.6, rimStrength: 0.14, inkAmount: 0.28, decal: true }),
      faceEyes: M(16777215, { map: src.tex.faceEyes, bands: 3, rim: 16770773, rimPower: 2.6, rimStrength: 0.14, emissive: 1507327, emissiveI: 0.16, inkAmount: 0.28, decal: true }),
      blindfold: M(1579032, { map: src.tex.blindfold, uvScale: 1, rim: 2767450, rimStrength: 0.3, ink: 657930, inkAmount: 0.55, decal: true }),
      eye: M(C.CYAN, { rim: C.CYAN, rimStrength: 0.7, emissive: C.NEON_CYAN, emissiveI: 2.2, bands: 1 }),
      eyeGlow: M(C.CYAN, { transparent: true, opacity: 0.5, blending: AdditiveBlending, glowOnly: 1, rim: C.GOLD, side: DoubleSide }),
      shadow: new MeshBasicMaterial({ map: src.tex.shadow, color: 657930, transparent: true, opacity: 0.62, depthWrite: false, side: DoubleSide })
    };
    src.ink = 657930;
    src.auraColor = C.NEON_CYAN;
    src.eyeColor = C.CYAN;
    // 兼容旧键名
    src.mat.coat = src.mat.body;
    src.mat.coatLo = src.mat.body;
    src.mat.collar = src.mat.body;
    src.mat.pants = src.mat.body;
    src.mat.boots = src.mat.body;
    commonMat(src, q);
    return src;
  }

  function sukunaPalette(q) {
    const src = {
      rim: C.CRIMSON,
      rimPower: 1.9,
      rimStrength: 0.34,
      bands: 3,
      ink: 590343,
      inkAmount: 0.52,
      tex: {
        face: texSukunaFace(q.tex),
        eyePair: texSukunaEyePair(q.tex),
        kimono: texSukunaKimono(q.tex),
        runes: texRunes(q.tex, "#ff2b2b", "#8c0b1e"),
        glow: texGlow2(q.tex, "#ffd0d0", "#ff1f3d"),
        shadow: texContactShadow(q.tex > 256 ? 256 : q.tex)
      }
    };
    const M = (c, o) => toonMat(src, c, o);
    const vc = { vc: true, bands: 3 };
    src.mat = {
      body: M(16777215, Object.assign({ rim: C.CRIMSON, rimStrength: 0.30, ink: 590343, inkAmount: 0.54 }, vc)),
      skin: M(16777215, Object.assign({ rim: 16763328, rimPower: 2.4, rimStrength: 0.17, ink: 590343, inkAmount: 0.34 }, vc)),
      // 和服布面：白底墨纹
      robe: M(16777215, Object.assign({ map: src.tex.kimono, uvScale: 1.6, rim: C.CRIMSON, rimStrength: 0.26, ink: 590343, inkAmount: 0.5 }, vc)),
      hair: M(16777215, Object.assign({ rim: C.CRIMSON, rimStrength: 0.58, rimPower: 1.5, emissive: 3802896, emissiveI: 0.08, ink: 1184538, inkAmount: 0.4 }, vc)),
      face: M(16777215, { map: src.tex.face, bands: 3, rim: 16763328, rimPower: 2.4, rimStrength: 0.16, inkAmount: 0.3, decal: true }),
      // 真身：额上的第二对眼（觉醒态才显示）
      eyePair: M(16777215, { map: src.tex.eyePair, bands: 2, emissive: 458752, emissiveI: 0.5, inkAmount: 0.3, decal: true }),
      eye: M(C.CRIMSON, { rim: C.SCARLET, rimStrength: 0.85, emissive: C.SCARLET, emissiveI: 2, bands: 1 }),
      eye2: M(C.BLOOD, { rim: C.CRIMSON, rimStrength: 0.7, emissive: C.CRIMSON, emissiveI: 0, bands: 1 }),
      eyeGlow: M(C.CRIMSON, { transparent: true, opacity: 0.5, blending: AdditiveBlending, glowOnly: 1, side: DoubleSide }),
      shadow: new MeshBasicMaterial({ map: src.tex.shadow, color: 590343, transparent: true, opacity: 0.62, depthWrite: false, side: DoubleSide })
    };
    src.auraColor = C.CRIMSON;
    src.eyeColor = C.CRIMSON;
    src.mat.robeDark = src.mat.body;
    src.mat.sash = src.mat.body;
    src.mat.tattoo = src.mat.body;
    src.mat.sandal = src.mat.body;
    commonMat(src, q);
    return src;
  }
