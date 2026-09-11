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
    // shadow 常开：接触阴影是重量感的关键，低配也只降分辨率不关它
    low: { seg: 4, radial: 7, hair: 9, secondary: false, cloth: false, shell: false, outline: false, outlineAll: false, tex: 128, shadow: true, nails: false, tatooDetail: 6 },
    medium: { seg: 6, radial: 10, hair: 13, secondary: true, cloth: true, shell: true, outline: true, outlineAll: false, tex: 256, shadow: true, nails: true, tatooDetail: 10 },
    high: { seg: 8, radial: 14, hair: 18, secondary: true, cloth: true, shell: true, outline: true, outlineAll: true, tex: 512, shadow: true, nails: true, tatooDetail: 14 }
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
  /* =========================================================================
   *  程序化贴图：面部 / 眼罩 / 和服 / 落地阴影
   *  —— 全部 canvas 生成，零外部资源，质量档控制分辨率
   *  面部贴图采用「球面贴片 UV」：u 自左向右，v 自下巴(0)向额头(1)
   *  也就是说画布里 y=0 对应额头顶，y=size 对应下巴底
   * ========================================================================= */

  // 给布料撒一层细颗粒，避免大色块发死（比 sprinkle 更细、更随机）
  function fineNoise(ctx2, s, count, alpha, dark) {
    ctx2.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const v = Math.random();
      ctx2.fillStyle = v > 0.5 ? (dark ? "#000000" : "#ffffff") : (dark ? "#0a0a0a" : "#f2f2f2");
      ctx2.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
    }
    ctx2.globalAlpha = 1;
  }

  // 两侧压暗：球面贴片贴到脸上后，边缘正好是侧面，压暗能立刻做出体积
  function edgeShade(ctx2, s, alpha) {
    const g = ctx2.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, "rgba(70,48,52," + alpha + ")");
    g.addColorStop(0.22, "rgba(90,60,60,0.03)");
    g.addColorStop(0.5, "rgba(255,255,255,0.05)");
    g.addColorStop(0.78, "rgba(90,60,60,0.03)");
    g.addColorStop(1, "rgba(70,48,52," + alpha + ")");
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, s, s);
  }

  // 皮肤底色：额头亮、下颌暗的纵向渐变 + 两侧压暗，天然给出头部的体积
  function skinBase(ctx2, s, top, bottom) {
    const g = ctx2.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, top);
    g.addColorStop(0.55, top);
    g.addColorStop(1, bottom);
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, s, s);
  }

  // 眼白 + 虹膜 + 睫毛：写在贴图上，靠球面贴片天然贴合头型
  function paintEye(ctx2, s, cx, cy, rx, ry, iris, irisDark, glow, sclera) {
    ctx2.save();
    // 眼窝阴影
    ctx2.fillStyle = "rgba(78,50,54,0.5)";
    ctx2.beginPath();
    ctx2.ellipse(cx, cy - ry * 0.2, rx * 1.5, ry * 1.85, 0, 0, Math.PI * 2);
    ctx2.fill();
    // 眼白（宿傩用压暗的巩膜，避免"娃娃眼"）
    ctx2.fillStyle = sclera || "#ddd6d2";
    ctx2.beginPath();
    ctx2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx2.fill();
    // 上眼睑投影
    ctx2.fillStyle = "rgba(44,30,34,0.4)";
    ctx2.beginPath();
    ctx2.ellipse(cx, cy - ry * 0.58, rx * 0.99, ry * 0.6, 0, 0, Math.PI * 2);
    ctx2.fill();
    // 虹膜
    const ir = Math.min(rx, ry) * 1.16;
    const g = ctx2.createRadialGradient(cx, cy, ir * 0.12, cx, cy, ir);
    g.addColorStop(0, glow ? "#ffffff" : iris);
    g.addColorStop(0.4, iris);
    g.addColorStop(0.85, iris);
    g.addColorStop(1, irisDark);
    ctx2.fillStyle = g;
    ctx2.beginPath();
    ctx2.arc(cx, cy, ir, 0, Math.PI * 2);
    ctx2.fill();
    // 瞳孔
    ctx2.fillStyle = "rgba(8,10,16,0.9)";
    ctx2.beginPath();
    ctx2.arc(cx, cy, ir * 0.34, 0, Math.PI * 2);
    ctx2.fill();
    // 高光
    ctx2.fillStyle = "rgba(255,255,255,0.9)";
    ctx2.beginPath();
    ctx2.arc(cx - ir * 0.32, cy - ir * 0.36, ir * 0.26, 0, Math.PI * 2);
    ctx2.fill();
    // 上睫毛线
    ctx2.strokeStyle = "rgba(14,12,18,0.92)";
    ctx2.lineWidth = Math.max(1, s * 0.009);
    ctx2.beginPath();
    ctx2.ellipse(cx, cy, rx * 1.02, ry, 0, Math.PI * 1.02, Math.PI * 1.98);
    ctx2.stroke();
    ctx2.restore();
  }

  // 五条悟面部（戴眼罩）：只露鼻、嘴、下巴，五官位置压在眼罩下沿以下
  function texGojoFaceBlind(size) {
    return paintTexture(size, (ctx2, s) => {
      skinBase(ctx2, s, "#e9cdb4", "#cda88e");
      edgeShade(ctx2, s, 0.72);
      // 眼罩下沿的投影：只留一层很淡的过渡，重了就是"脏脸"
      const g = ctx2.createLinearGradient(0, s * 0.26, 0, s * 0.42);
      g.addColorStop(0, "rgba(60,40,44,0.30)");
      g.addColorStop(1, "rgba(60,40,44,0)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s * 0.42);
      // 鼻：只做一条鼻梁的暗侧 + 鼻头下的一点投影，不要画成"两团肉"
      ctx2.strokeStyle = "rgba(146,98,90,0.34)";
      ctx2.lineWidth = Math.max(1, s * 0.02);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.526, s * 0.5);
      ctx2.quadraticCurveTo(s * 0.552, s * 0.6, s * 0.53, s * 0.655);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(132,86,80,0.36)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.678, s * 0.032, s * 0.012, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 嘴：薄唇，唇线细、略平（冷淡表情）
      ctx2.strokeStyle = "rgba(112,54,50,0.9)";
      ctx2.lineCap = "round";
      ctx2.lineWidth = Math.max(1, s * 0.013);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.408, s * 0.795);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.816, s * 0.592, s * 0.795);
      ctx2.stroke();
      ctx2.strokeStyle = "rgba(190,120,112,0.34)";
      ctx2.lineWidth = Math.max(1, s * 0.022);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.44, s * 0.845);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.858, s * 0.56, s * 0.845);
      ctx2.stroke();
      fineNoise(ctx2, s, 200, 0.045, true);
    });
  }

  // 五条悟面部（六眼）：青色六眼，眼神冷
  function texGojoFaceEyes(size) {
    return paintTexture(size, (ctx2, s) => {
      skinBase(ctx2, s, "#e9cdb4", "#cda88e");
      edgeShade(ctx2, s, 0.72);
      paintEye(ctx2, s, s * 0.35, s * 0.4, s * 0.056, s * 0.036, "#5fdcff", "#08456b", true);
      paintEye(ctx2, s, s * 0.65, s * 0.4, s * 0.056, s * 0.036, "#5fdcff", "#08456b", true);
      // 白眉：细、挑、低对比（太亮会在脸上糊成两块白板）
      ctx2.strokeStyle = "rgba(236,240,246,0.62)";
      ctx2.lineCap = "round";
      ctx2.lineWidth = Math.max(1, s * 0.011);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.24, s * 0.295);
      ctx2.quadraticCurveTo(s * 0.31, s * 0.262, s * 0.4, s * 0.288);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.76, s * 0.295);
      ctx2.quadraticCurveTo(s * 0.69, s * 0.262, s * 0.6, s * 0.288);
      ctx2.stroke();
      // 鼻
      ctx2.strokeStyle = "rgba(150,104,96,0.26)";
      ctx2.lineWidth = Math.max(1, s * 0.02);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.525, s * 0.47);
      ctx2.quadraticCurveTo(s * 0.545, s * 0.55, s * 0.525, s * 0.6);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(140,92,86,0.24)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.625, s * 0.03, s * 0.012, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 嘴
      ctx2.strokeStyle = "rgba(126,62,58,0.7)";
      ctx2.lineWidth = Math.max(1, s * 0.011);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.415, s * 0.745);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.762, s * 0.585, s * 0.745);
      ctx2.stroke();
      fineNoise(ctx2, s, 200, 0.045, true);
    });
  }

  // 眼罩：黑布 + 中央压光 + 上下缝线（五条悟标志物）
  function texGojoBlindfold(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#0c0e17";
      ctx2.fillRect(0, 0, s, s);
      // 布纹：横向的细密暗条
      for (let i = 0; i < 34; i++) {
        ctx2.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.3)";
        ctx2.fillRect(0, (i / 34) * s, s, s / 34);
      }
      // 中段压光：这块布在霓虹下会反光，是它读起来"像布"的关键
      const g = ctx2.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "rgba(120,150,205,0.08)");
      g.addColorStop(0.28, "rgba(190,215,255,0.22)");
      g.addColorStop(0.46, "rgba(150,182,232,0.07)");
      g.addColorStop(0.72, "rgba(40,60,100,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s);
      // 上下缝线 + 针脚
      ctx2.strokeStyle = "rgba(170,195,235,0.5)";
      ctx2.lineWidth = Math.max(1, s * 0.01);
      ctx2.beginPath();
      ctx2.moveTo(0, s * 0.06);
      ctx2.lineTo(s, s * 0.06);
      ctx2.moveTo(0, s * 0.94);
      ctx2.lineTo(s, s * 0.94);
      ctx2.stroke();
      ctx2.strokeStyle = "rgba(190,210,240,0.28)";
      ctx2.lineWidth = Math.max(1, s * 0.007);
      for (let i = 0; i < 26; i++) {
        const x = (i + 0.5) / 26 * s;
        ctx2.beginPath();
        ctx2.moveTo(x, s * 0.035);
        ctx2.lineTo(x, s * 0.085);
        ctx2.moveTo(x, s * 0.915);
        ctx2.lineTo(x, s * 0.965);
        ctx2.stroke();
      }
      // 褶皱：几条斜向的暗纹，布才有起伏
      ctx2.strokeStyle = "rgba(0,0,0,0.28)";
      ctx2.lineWidth = Math.max(1, s * 0.02);
      for (let i = 0; i < 5; i++) {
        const x = s * (0.12 + i * 0.19);
        ctx2.beginPath();
        ctx2.moveTo(x, s * 0.1);
        ctx2.quadraticCurveTo(x + s * 0.03, s * 0.5, x - s * 0.02, s * 0.9);
        ctx2.stroke();
      }
      fineNoise(ctx2, s, 300, 0.06, false);
    });
  }

  // 宿傩面部：黑纹面 + 猩红眼
  function texSukunaFace(size) {
    return paintTexture(size, (ctx2, s) => {
      skinBase(ctx2, s, "#e8c4a8", "#c9a086");
      edgeShade(ctx2, s, 0.66);
      paintEye(ctx2, s, s * 0.35, s * 0.33, s * 0.074, s * 0.048, "#e02a18", "#3d0606", true, "#2b2426");
      paintEye(ctx2, s, s * 0.65, s * 0.33, s * 0.074, s * 0.048, "#e02a18", "#3d0606", true, "#2b2426");
      ctx2.strokeStyle = "rgba(10,9,14,0.95)";
      ctx2.lineCap = "round";
      // 眉上的粗横纹（宿傩最标志性的两道）
      ctx2.lineWidth = Math.max(1, s * 0.02);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.13, s * 0.19);
      ctx2.quadraticCurveTo(s * 0.24, s * 0.13, s * 0.4, s * 0.16);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.87, s * 0.19);
      ctx2.quadraticCurveTo(s * 0.76, s * 0.13, s * 0.6, s * 0.16);
      ctx2.stroke();
      // 眼下的两道弧线
      ctx2.lineWidth = Math.max(1, s * 0.015);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.16, s * 0.3);
      ctx2.quadraticCurveTo(s * 0.15, s * 0.44, s * 0.25, s * 0.5);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.84, s * 0.3);
      ctx2.quadraticCurveTo(s * 0.85, s * 0.44, s * 0.75, s * 0.5);
      ctx2.stroke();
      // 颊侧的竖纹
      ctx2.lineWidth = Math.max(1, s * 0.014);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.1, s * 0.3);
      ctx2.quadraticCurveTo(s * 0.08, s * 0.55, s * 0.14, s * 0.74);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.9, s * 0.3);
      ctx2.quadraticCurveTo(s * 0.92, s * 0.55, s * 0.86, s * 0.74);
      ctx2.stroke();
      // 下颌两侧的小竖纹
      ctx2.lineWidth = Math.max(1, s * 0.011);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.26, s * 0.76);
      ctx2.lineTo(s * 0.26, s * 0.9);
      ctx2.moveTo(s * 0.74, s * 0.76);
      ctx2.lineTo(s * 0.74, s * 0.9);
      ctx2.stroke();
      // 鼻与嘴
      ctx2.fillStyle = "rgba(255,248,240,0.22)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.52, s * 0.024, s * 0.07, 0, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "rgba(255,248,240,0.3)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.5, s * 0.02, s * 0.062, 0, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "rgba(120,70,64,0.24)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.6, s * 0.04, s * 0.016, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 冷笑：一边嘴角上扬
      ctx2.strokeStyle = "rgba(96,38,36,0.9)";
      ctx2.lineWidth = Math.max(1, s * 0.015);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.4, s * 0.715);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.725, s * 0.62, s * 0.665);
      ctx2.stroke();
      fineNoise(ctx2, s, 200, 0.045, true);
    });
  }

  // 宿傩·真身额眼（第二对眼）
  function texSukunaEyePair(size) {
    return paintTexture(size, (ctx2, s) => {
      skinBase(ctx2, s, "#e8c4a8", "#d6ac90");
      paintEye(ctx2, s, s * 0.3, s * 0.5, s * 0.085, s * 0.05, "#ff5a2a", "#5c0a08", true);
      paintEye(ctx2, s, s * 0.7, s * 0.5, s * 0.085, s * 0.05, "#ff5a2a", "#5c0a08", true);
      fineNoise(ctx2, s, 120, 0.05, true);
    });
  }

  // 和服：白底 + 墨色纹样，纹理要"能看出是布"，但不能花
  function texSukunaKimono(size) {
    return paintTexture(size, (ctx2, s) => {
      const g = ctx2.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "#f7f2e7");
      g.addColorStop(1, "#e2dccd");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s);
      // 细密的斜向织纹
      ctx2.globalAlpha = 0.055;
      ctx2.strokeStyle = "#5f573f";
      ctx2.lineWidth = 1;
      for (let i = -s; i < s * 2; i += Math.max(3, s * 0.018)) {
        ctx2.beginPath();
        ctx2.moveTo(i, 0);
        ctx2.lineTo(i + s, s);
        ctx2.stroke();
      }
      ctx2.globalAlpha = 1;
      // 墨色纹样：一道宽竖条 + 一道细横条，弱对比（避免贴上去像棋盘）
      ctx2.fillStyle = "rgba(20,20,26,0.5)";
      ctx2.fillRect(s * 0.5, 0, s * 0.03, s);
      ctx2.fillRect(0, s * 0.5, s, s * 0.016);
      ctx2.fillStyle = "rgba(20,20,26,0.18)";
      ctx2.fillRect(s * 0.16, 0, s * 0.012, s);
      ctx2.fillRect(s * 0.84, 0, s * 0.012, s);
      // 织物颗粒
      fineNoise(ctx2, s, 480, 0.05, true);
      fineNoise(ctx2, s, 300, 0.04, false);
    }, { repeat: [1, 1] });
  }

  // 落地阴影：中心实、外圈迅速衰减的椭圆软影
  function texContactShadow(size) {
    return paintTexture(size, (ctx2, s) => {
      const g = ctx2.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.5);
      g.addColorStop(0, "rgba(0,0,0,0.98)");
      g.addColorStop(0.26, "rgba(0,0,0,0.86)");
      g.addColorStop(0.46, "rgba(0,0,0,0.5)");
      g.addColorStop(0.68, "rgba(0,0,0,0.2)");
      g.addColorStop(0.86, "rgba(0,0,0,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      // 注意：必须让边缘真正透明，不能垫一层不透明底，否则贴到地面上是一个黑方块
      ctx2.clearRect(0, 0, s, s);
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s);
    });
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

  /* =========================================================================
   *  几何工具：顶点色合并（把 70+ 个零件压成 ~20 个网格）
   * ========================================================================= */

  var _m4a = new Matrix4();
  var _quat = new Quaternion();
  var _eul = new Euler();
  var _v3p = new Vector3();
  var _v3s = new Vector3();
  var _nrmM = new Matrix3();

  // 组装零件矩阵：位置 + 欧拉角 + 缩放
  function partM(x, y, z, rx, ry, rz, sx, sy, sz) {
    _eul.set(rx || 0, ry || 0, rz || 0);
    _quat.setFromEuler(_eul);
    _v3p.set(x || 0, y || 0, z || 0);
    _v3s.set(
      sx === void 0 ? 1 : sx,
      sy === void 0 ? 1 : sy,
      sz === void 0 ? 1 : sz
    );
    return new Matrix4().compose(_v3p, _quat, _v3s);
  }

  // 把若干零件（各自带局部矩阵和颜色）合并成一个带顶点色的 BufferGeometry
  function mergeParts(parts) {
    // 入参兼容 {geo,color,m} 与 [geo,color,m] 两种写法；坏零件直接跳过，
    // 绝不允许一个零件构造失败就把整个角色（乃至开机流程）带崩
    const list = [];
    for (const p of parts) {
      if (!p) continue;
      const geo = p.geo !== void 0 ? p.geo : p[0];
      if (!geo || !geo.attributes || !geo.attributes.position) continue;
      list.push({
        geo,
        color: p.color !== void 0 ? p.color : p[1],
        m: p.m !== void 0 ? p.m : p[2]
      });
    }
    let vN = 0, iN = 0;
    for (const p of list) {
      vN += p.geo.attributes.position.count;
      iN += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
    }
    const pos = new Float32Array(vN * 3);
    const nrm = new Float32Array(vN * 3);
    const uvs = new Float32Array(vN * 2);
    const col = new Float32Array(vN * 3);
    const idx = vN > 65000 ? new Uint32Array(iN) : new Uint16Array(iN);
    let vo = 0, io = 0;
    const v = new Vector3(), n = new Vector3(), c = new Color();
    for (const p of list) {
      const g = p.geo;
      const gp = g.attributes.position;
      const gn = g.attributes.normal;
      const gu = g.attributes.uv;
      const m = p.m;
      if (m) _nrmM.getNormalMatrix(m);
      c.setHex(p.color === void 0 ? 16777215 : p.color);
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i);
        if (m) v.applyMatrix4(m);
        pos[(vo + i) * 3] = v.x;
        pos[(vo + i) * 3 + 1] = v.y;
        pos[(vo + i) * 3 + 2] = v.z;
        if (gn) {
          n.fromBufferAttribute(gn, i);
          if (m) n.applyMatrix3(_nrmM).normalize();
          nrm[(vo + i) * 3] = n.x;
          nrm[(vo + i) * 3 + 1] = n.y;
          nrm[(vo + i) * 3 + 2] = n.z;
        }
        if (gu) {
          uvs[(vo + i) * 2] = gu.getX(i);
          uvs[(vo + i) * 2 + 1] = gu.getY(i);
        }
        col[(vo + i) * 3] = c.r;
        col[(vo + i) * 3 + 1] = c.g;
        col[(vo + i) * 3 + 2] = c.b;
      }
      if (g.index) {
        const gi = g.index;
        for (let i = 0; i < gi.count; i++) idx[io + i] = gi.getX(i) + vo;
        io += gi.count;
      } else {
        for (let i = 0; i < gp.count; i++) idx[io + i] = vo + i;
        io += gp.count;
      }
      vo += gp.count;
    }
    const out = new BufferGeometry();
    if (vN === 0) return out;
    out.setAttribute("position", new BufferAttribute(pos, 3));
    out.setAttribute("normal", new BufferAttribute(nrm, 3));
    out.setAttribute("uv", new BufferAttribute(uvs, 2));
    out.setAttribute("color", new BufferAttribute(col, 3));
    out.setIndex(new BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  // 椭球：低模但圆润，用于头/肩/关节
  function blobGeo(w, h, d, q) {
    const g = new SphereGeometry(0.5, q.radial, Math.max(4, q.seg + 2));
    g.scale(w, h, d);
    return g;
  }

  // 锥台肢体：上端在 y=0，向下延伸 len，两端带圆头，中段可选隆起（肌肉感）
  function limbY(rTop, rBot, len, q, bulge) {
    const b = bulge === void 0 ? 1 : bulge;
    const cap = q.seg >= 6 ? 2 : 1;
    const pts = [];
    // 两端做浅圆角而不是收成尖点：相邻肢段互相咬合，关节处不会"掐腰"成一串珠子
    for (let i = 0; i <= cap; i++) {
      const th = i / cap * Math.PI * 0.5;
      pts.push([-len + rBot * 0.24 * (1 - Math.cos(th)), rBot * (0.66 + 0.34 * Math.sin(th))]);
    }
    pts.push([-len * 0.58, (rTop + rBot) * 0.5 * b]);
    for (let i = 0; i <= cap; i++) {
      const ps = (cap - i) / cap * Math.PI * 0.5;
      pts.push([-rTop * 0.24 * (1 - Math.cos(ps)), rTop * (0.66 + 0.34 * Math.sin(ps))]);
    }
    const v = pts.map((p) => new Vector2(Math.max(1e-3, p[1]), p[0]));
    return new LatheGeometry(v, q.radial);
  }

  // 竖向旋转体：pts = [[y, r], ...]（y 从低到高）
  function latheY(pts, q, closeTop, closeBottom) {
    const list = [];
    if (closeBottom) list.push([pts[0][0] - pts[0][1] * 0.5, 1e-3]);
    for (const p of pts) list.push([p[0], p[1]]);
    if (closeTop) list.push([pts[pts.length - 1][0] + pts[pts.length - 1][1] * 0.5, 1e-3]);
    return new LatheGeometry(list.map((p) => new Vector2(Math.max(1e-3, p[1]), p[0])), q.radial);
  }

  // 球面贴片：贴在球（椭球）表面的一小块，用来做脸/第二对眼
  function spherePatch(r, phiCenter, phiLen, thetaStart, thetaLen, q, wSeg, hSeg) {
    return new SphereGeometry(
      r,
      Math.max(6, wSeg || q.radial),
      Math.max(4, hSeg || q.seg * 2),
      phiCenter - phiLen * 0.5,
      phiLen,
      thetaStart,
      thetaLen
    );
  }

  // 细长条：纹身线/装饰条
  function stripGeo(len, w, th) {
    return new BoxGeometry(w, len, th);
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
  #include <color_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform vec3 uEmissive;
  uniform vec3 uInk;
  uniform vec3 uLightDir;
  uniform vec3 uAmbient;
  uniform vec3 uLightColor;
  uniform vec3 uFill;
  uniform float uBands;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform float uEmissiveI;
  uniform float uInkAmount;
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
    float ndv = clamp( dot( N, V ), 0.0, 1.0 );
    float fres = pow( 1.0 - ndv, max( uRimPower, 0.35 ) );

    // ---- 反壳描边：只输出一圈深色，套在角色外层，保证任何背景上剪影都清楚 ----
    if ( uOutline > 0.0 ) {
      // uRimStrength 平时是淡淡的一层色，开术式时会被拉到 1 → 整个轮廓亮成咒力色
      vec3 oc = mix( uInk, uRim, clamp( uRimStrength, 0.0, 1.0 ) * ( 0.18 + 0.62 * smoothstep( 0.05, 1.0, fres ) ) );
      gl_FragColor = vec4( oc, uAlpha * uOpacity );
      #include <colorspace_fragment>
      #include <fog_fragment>
      return;
    }

    vec3 base = uColor;
    #ifdef USE_COLOR
      base *= vColor;
    #endif
    float mapA = 1.0;
    #ifdef USE_MAP
      vec4 tex4 = texture2D( uMap, vUv2 * uUvScale );
      base = mix( base, base * tex4.rgb * 1.12, uUseMap );
      // 贴图自带 alpha 时用它做柔边（眼睛辉光那种"硬边一块"就是这么解决的）
      mapA = mix( 1.0, tex4.a, uUseMap );
    #endif

    // ---- 三段色阶（固定方向光，不依赖 scene 真实光源）----
    float ndl = dot( N, uLightDir );
    float bands = max( uBands, 1.0 );
    float litHard = floor( clamp( ndl * 0.5 + 0.5, 0.0, 0.9999 ) * bands ) / ( bands - 1.0 + 1e-4 );
    // 硬色阶里掺一点平滑：保留卡通味，但脸上不会出现一道生硬的分界线
    float lit = clamp( mix( litHard, clamp( ndl * 0.5 + 0.5, 0.0, 1.0 ), 0.3 ), 0.0, 1.0 );
    vec3 col = base * mix( uAmbient, uLightColor, lit );
    // 半球补光：让暗部保留形体而不是死黑
    col += base * uFill * ( N.y * 0.5 + 0.5 );
    // 背光面补一点冷色，形体不至于塌掉
    col += base * 0.055 * ( 1.0 - lit );

    // ---- 边缘压深：只在真正贴边的位置压一条墨线（用高次菲涅尔，避免把头顶压成黑锅盖）----
    float inkFres = pow( 1.0 - ndv, 3.2 );
    float ink = smoothstep( 0.45, 1.0, inkFres ) * uInkAmount;
    col = mix( col, uInk, ink );

    // ---- 边缘光（角色咒力色）叠在最外层 ----
    col += uRim * fres * uRimStrength;

    // ---- 自发光 ----
    col += uEmissive * uEmissiveI;

    // ---- 受击闪白：保留明暗结构，避免整体糊成白剪影 ----
    if ( uFlash > 0.0 ) {
      // 受击闪白：只在轮廓和亮部爆亮，暗部（制服/裤子）保留本色，
      // 否则整个角色会糊成一块白剪影 —— 这是基线最刺眼的问题之一
      float f = clamp( uFlash, 0.0, 1.0 );
      vec3 flashCol = mix( base * 1.25 + uEmissive * 0.4, vec3( 1.0 ), 0.3 );
      col = mix( col, flashCol, f * ( 0.62 + 0.38 * fres ) );
      col += uRim * f * fres * 0.65;
    }

    if ( uGlowOnly > 0.0 ) {
      col += uColor * fres * uGlowOnly;
    }
    // 压回合理亮度区间：整体过曝会丢形体
    float over = max( 0.0, max( max( col.r, col.g ), col.b ) - 1.35 );
    col = col / ( 1.0 + over * 0.85 );
    gl_FragColor = vec4( col, uAlpha * uOpacity * mapA );
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
  `
  );
  var AMBIENT = new Color(2239554);
  var LIGHT_COLOR = new Color(11058909);
  var FILL = new Color(1317162);
  // 角色主光：从左上前方打过来（城市里是背光月光，但角色必须让玩家看清正脸，
  // 格斗游戏的角色用"肖像光"是业界惯例），背后再用边缘光勾剪影
  var SUN_DIR = new Vector3(-0.42, 0.62, 0.66).normalize();
  var LIGHT_DIR = SUN_DIR.clone().negate().normalize();
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
    // 贴地的极淡光池：深色路面上光靠黑影看不出来，加一层加法光池才"落地"
    src.mat.shadowGlow = new MeshBasicMaterial({
      map: src.tex.glowSmall,
      color: src.rim,
      transparent: true,
      opacity: 0.13,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide
    });
    src.mat.outline = M(src.ink, { outline: true, rim: src.rim, rimPower: 1.5, rimStrength: 0.22, transparent: true, opacity: 0.95, side: BackSide });
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
      shadowBase: 0.8,
      tex: {
        faceBlind: texGojoFaceBlind(q.tex),
        faceEyes: texGojoFaceEyes(q.tex),
        blindfold: texGojoBlindfold(q.tex),
        runes: texRunes(q.tex, "#5ff0ff", "#2b86ff"),
        glow: texGlow2(q.tex, "#ffffff", "#5ff0ff"),
        glowSmall: texGlow2(64, "#ffffff", "#bfe9ff"),
        shadow: texContactShadow(q.tex > 256 ? 256 : q.tex)
      }
    };
    const M = (c, o) => toonMat(src, c, o);
    const vc = { vc: true, bands: 3 };
    src.mat = {
      // ---- 本体：顶点色，一张材质画完制服 / 裤子 / 靴子 / 头发 ----
      body: M(16777215, Object.assign({ rim: C.NEON_CYAN, rimStrength: 0.22, ink: 657930, inkAmount: 0.52 }, vc)),
      skin: M(16777215, Object.assign({ rim: 16770773, rimPower: 2.6, rimStrength: 0.16, ink: 526600, inkAmount: 0.34 }, vc)),
      hair: M(16777215, Object.assign({ rim: C.CYAN, rimStrength: 0.62, rimPower: 1.5, emissive: C.AZURE, emissiveI: 0.05, ink: 1184538, inkAmount: 0.4 }, vc)),
      // ---- 脸：两张球面贴片（眼罩态 / 六眼态），切换零成本 ----
      face: M(16777215, { map: src.tex.faceBlind, bands: 3, rim: 16770773, rimPower: 2.6, rimStrength: 0.14, inkAmount: 0.28, decal: true }),
      faceEyes: M(16777215, { map: src.tex.faceEyes, bands: 3, rim: 16770773, rimPower: 2.6, rimStrength: 0.14, emissive: 1507327, emissiveI: 0.05, inkAmount: 0.28, decal: true }),
      blindfold: M(16777215, { map: src.tex.blindfold, uvScale: 1, rim: 2767450, rimStrength: 0.42, rimPower: 2.2, ink: 657930, inkAmount: 0.3, decal: true }),
      eye: M(C.CYAN, { rim: C.CYAN, rimStrength: 0.7, emissive: C.NEON_CYAN, emissiveI: 2.2, bands: 1 }),
      eyeGlow: M(C.CYAN, { map: src.tex.glow, transparent: true, opacity: 0.85, blending: AdditiveBlending, glowOnly: 0.8, rim: C.GOLD, side: DoubleSide }),
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
      shadowBase: 0.7,
      tex: {
        face: texSukunaFace(q.tex),
        eyePair: texSukunaEyePair(q.tex),
        kimono: texSukunaKimono(q.tex),
        runes: texRunes(q.tex, "#ff2b2b", "#8c0b1e"),
        glow: texGlow2(q.tex, "#ffd0d0", "#ff1f3d"),
        glowSmall: texGlow2(64, "#ffffff", "#ffc0b0"),
        shadow: texContactShadow(q.tex > 256 ? 256 : q.tex)
      }
    };
    const M = (c, o) => toonMat(src, c, o);
    const vc = { vc: true, bands: 3 };
    src.mat = {
      body: M(16777215, Object.assign({ rim: C.CRIMSON, rimStrength: 0.22, ink: 590343, inkAmount: 0.54 }, vc)),
      skin: M(16777215, Object.assign({ rim: 16763328, rimPower: 2.4, rimStrength: 0.17, ink: 590343, inkAmount: 0.34 }, vc)),
      // 和服布面：白底墨纹
      robe: M(16777215, Object.assign({ map: src.tex.kimono, uvScale: 1.6, rim: C.CRIMSON, rimStrength: 0.26, ink: 590343, inkAmount: 0.5 }, vc)),
      hair: M(16777215, Object.assign({ rim: C.CRIMSON, rimStrength: 0.58, rimPower: 1.5, emissive: 3802896, emissiveI: 0.08, ink: 1184538, inkAmount: 0.4 }, vc)),
      face: M(16777215, { map: src.tex.face, bands: 3, rim: 16763328, rimPower: 2.4, rimStrength: 0.16, inkAmount: 0.3, decal: true }),
      // 真身：额上的第二对眼（觉醒态才显示）
      eyePair: M(16777215, { map: src.tex.eyePair, bands: 2, emissive: 458752, emissiveI: 0.5, inkAmount: 0.3, decal: true }),
      eye: M(C.CRIMSON, { rim: C.SCARLET, rimStrength: 0.85, emissive: C.SCARLET, emissiveI: 2, bands: 1 }),
      eye2: M(C.BLOOD, { rim: C.CRIMSON, rimStrength: 0.7, emissive: C.CRIMSON, emissiveI: 0, bands: 1 }),
      eyeGlow: M(C.CRIMSON, { map: src.tex.glow, transparent: true, opacity: 0.8, blending: AdditiveBlending, glowOnly: 1, side: DoubleSide }),
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
    const root = new Group();
    root.name = who;
    const bones = {};
    const meshBag = [];
    const cloth = [];
    const hairTips = [];
    const outlineMeshes = [];
    const buckets = new Map();

    /* ---------------- 骨骼：名字与层级是对外契约，禁止改动 ---------------- */
    const mk = (name, parent, x, y, z, order) => {
      const g = new Group();
      g.name = name;
      g.position.set(x, y, z);
      g.rotation.order = order || "ZYX";
      parent.add(g);
      bones[name] = g;
      return g;
    };

    // 身高：五条悟 190cm 清瘦 / 宿傩 188cm 壮实
    const HIP_Y = isGojo ? 1.0 : 0.995;   // 原版是 1.06：脚因此悬空 6cm，这里直接降 6cm 修掉
    const shoulders = isGojo ? 0.187 : 0.198;  // 肩点横向距离（与原版一致，姿态库按它调过）
    const hipX = 0.105;

    const hips = mk("hips", root, 0, HIP_Y, 0);
    // 以下偏移量与原版完全一致 —— POSE_LIB 的所有角度都是按这套长度调出来的，
    // 擅自加长肢体 = 所有动作错位（这就是上一版"走路像融化"的根因）
    const core = mk("core", hips, 0, 0.1, 0);
    const chest = mk("chest", core, 0, 0.15, 0);
    const neck = mk("neck", chest, 0, 0.235, 0);
    const head = mk("head", neck, 0, 0.085, 0);

    const mkArm = (side, tag) => {
      const s = side;
      const sh = mk("shoulder" + tag, chest, s * shoulders, 0.19, 0);
      const ua = mk("upperArm" + tag, sh, 0, -0.035, 0);
      const fa = mk("foreArm" + tag, ua, 0, -0.295, 0);
      const hd = mk("hand" + tag, fa, 0, -0.275, 0);
      const gp = new Object3D();
      gp.name = "grip" + tag;
      gp.position.set(0, -0.055, 0);
      hd.add(gp);
      return { sh, ua, fa, hd, gp };
    };
    const armL = mkArm(1, "L");
    const armR = mkArm(-1, "R");
    // 第二对手臂的骨骼两个角色都建（五条悟不使用，但 update 里不会空引用）
    mk("arm2L1", chest, 0.152, -0.055, -0.05);
    mk("arm2L2", bones.arm2L1, 0, -0.29, 0);
    mk("arm2R1", chest, -0.152, -0.055, -0.05);
    mk("arm2R2", bones.arm2R1, 0, -0.29, 0);

    const mkLeg = (side, tag) => {
      const s = side;
      const th = mk("thigh" + tag, hips, s * hipX, -0.1, 0);
      const sn = mk("shin" + tag, th, 0, -0.425, 0);
      const ft = mk("foot" + tag, sn, 0, -0.418, 0);
      return { th, sn, ft };
    };
    const legL = mkLeg(1, "L");
    const legR = mkLeg(-1, "R");

    /* ---------------- 零件桶：同骨骼同材质最后合并成一个网格 ---------------- */
    const put = (boneName, matKey, geo, color, m, opt) => {
      const key = boneName + "|" + matKey;
      let b = buckets.get(key);
      if (!b) {
        b = { bone: boneName, matKey, parts: [], outline: false };
        buckets.set(key, b);
      }
      // 防御：零件构造失败时只警告不崩 —— 一个零件坏掉不能让整个游戏开不了机
      if (!geo || !geo.attributes || !geo.attributes.position) {
        console.warn("[fighters] put() 收到非法 geo", boneName, matKey, color);
        return b;
      }
      b.parts.push({ geo, color, m });
      if (opt && opt.main) b.outline = true;
      return b;
    };
    const putMany = (boneName, matKey, list, opt) => {
      for (const it of list) put(boneName, matKey, it[0], it[1], it[2], opt);
    };

    // 可切换部件的句柄：在 if 块外声明，最后统一返回
    let bfMesh = null;
    let faceBlind = null;
    let faceEyes = null;
    let glowMesh = null;
    let faceMesh = null;
    let eyePair = null;

    /* ======================= 五条悟 ======================= */
    if (isGojo) {
      const C_COAT = 2171957;      // 高专制服 藏青
      const C_COAT_D = 1316369;    // 制服暗面
      const C_COLLAR = 2895673;    // 立领
      const C_PANTS = 1645346;
      const C_BOOT = 657930;
      const C_BELT = 4344142;
      const C_SKIN = 15652278;

      /* ---- 躯干：制服（肩宽腰窄的人形剪影）---- */
      // 骨盆 → 腰：裤子
      putMany("hips", "body", [
        [latheY([[-0.13, 0.135], [-0.05, 0.152], [0.02, 0.158], [0.06, 0.152]], q, false, true), C_PANTS,
          partM(0, 0.0, 0, 0, 0, 0, 1, 1, 0.82), { main: true }],
        [boxGeo(0.3, 0.045, 0.24), C_BELT, partM(0, 0.045, 0, 0, 0, 0, 1, 1, 1)]
      ]);
      // 腹部 → 胸：制服本体，上宽下窄
      put("core", "body", latheY([[-0.12, 0.138], [-0.03, 0.146], [0.05, 0.152]], q, false, false), C_COAT,
        partM(0, 0, 0, 0, 0, 0, 1, 1, 0.74), { main: true });
      put("chest", "body", latheY([[-0.115, 0.152], [0.02, 0.176], [0.14, 0.196], [0.175, 0.17]], q, true, false), C_COAT,
        partM(0, 0, 0, 0, 0, 0, 1, 1, 0.72), { main: true });
      // 前襟与拉链：一条竖的暗色条，读起来就是"制服"
      put("core", "body", stripGeo(0.3, 0.03, 0.02), C_COLLAR, partM(0, 0.0, 0.112, 0, 0, 0, 1, 1, 1));
      put("chest", "body", stripGeo(0.26, 0.032, 0.02), C_COLLAR, partM(0, 0.03, 0.125, 0, 0, 0, 1, 1, 1));
      // 立领：高专制服的标志
      put("chest", "body", new CylinderGeometry(0.068, 0.082, 0.13, q.radial, 1, true), C_COLLAR,
        partM(0, 0.222, -0.006), { main: true });
      put("chest", "body", new CylinderGeometry(0.062, 0.07, 0.075, q.radial, 1), C_COAT_D,
        partM(0, 0.192, -0.006), { main: false });
      // 背后下摆稍长一点，剪影更像外套
      put("hips", "body", boxGeo(0.28, 0.14, 0.06), C_COAT, partM(0, -0.06, -0.12, 0.12, 0, 0, 1, 1, 1));

      /* ---- 头 ---- */
      const HR = 0.104;                        // 颅骨半径
      const HC = 0.116;                        // 颅骨中心相对 head 骨骼
      const HS = [1.0, 1.16, 1.05];            // 颅骨椭球缩放
      const HEAD_R = [HR * HS[0], HR * HS[1], HR * HS[2]];
      // 颅骨 + 颧骨 + 下颌：三段椭球叠出人头的体积
      put("head", "body", blobC(HR * 2, HR * 2, HR * 2, q), C_SKIN, partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2]), { main: true });
      put("head", "body", blobC(0.19, 0.128, 0.174, q), C_SKIN, partM(0, HC - 0.024, 0.004, 0, 0, 0, 1, 1, 1));
      put("head", "body", blobC(0.16, 0.146, 0.156, q), C_SKIN, partM(0, HC - 0.06, -0.002, 0, 0, 0, 1, 1, 1));
      for (const s of [1, -1]) {
        put("head", "body", blobC(0.032, 0.058, 0.046, q), C_SKIN, partM(s * 0.099, HC - 0.014, -0.012, 0, 0, 0, 1, 1, 1));
      }
      put("neck", "body", new CylinderGeometry(0.05, 0.06, 0.11, q.radial, 1), C_SKIN, partM(0, -0.02, 0, 0, 0, 0, 1, 1, 0.92), { main: true });

      /* ---- 脸：两张球面贴片（戴眼罩 / 六眼），切换只换可见性 ---- */
      const FACE_PHI = 2.6;    // 覆盖整个正面，贴片边缘藏到耳侧
      const FACE_TH0 = 0.74;
      const FACE_THL = 1.72;
      const faceGeo = spherePatch(HR * 1.055, Math.PI / 2, FACE_PHI, FACE_TH0, FACE_THL, q, q.radial * 2, q.seg * 2 + 6);
      const mkFace = (mat, name) => {
        const fm = new Mesh(faceGeo, mat);
        fm.position.set(0, HC, -0.006);
        fm.scale.set(HS[0], HS[1], HS[2]);
        fm.name = name;
        head.add(fm);
        meshBag.push(fm);
        return fm;
      };
      faceBlind = mkFace(M.face, "faceBlind");
      faceEyes = mkFace(M.faceEyes, "faceEyes");
      faceEyes.visible = false;
      // 眼罩：一条盖住额头到眼下的黑布（五条悟标志物）
      // 眼罩是一条"带"：上沿留在发际线以下，头顶要留给白发
      bfMesh = new Mesh(spherePatch(HR * 1.09, Math.PI / 2, Math.PI * 2, 0.9, 0.86, q, q.radial + 6), M.blindfold);
      bfMesh.position.set(0, HC, -0.006);
      bfMesh.scale.set(HS[0], HS[1], HS[2]);
      bfMesh.name = "blindfoldMesh";
      head.add(bfMesh);
      meshBag.push(bfMesh);
      // 脑后的布结与两条飘带
      put("head", "body", blobC(0.062, 0.062, 0.05, q), 1315860, partM(0, HC + 0.012, -0.113, 0, 0, 0, 1, 1, 1));
      for (const s of [1, -1]) {
        put("head", "body", boxGeo(0.026, 0.13, 0.012), 1315860, partM(s * 0.036, HC - 0.035, -0.118, 0.25, 0, s * 0.22));
      }
      // 六眼辉光：用两片正对镜头的小面片 + 径向渐变贴图（球面贴片会画成一块硬边矩形）
      const TH_EYE = 1.33;
      const EYE_Y = HC + HR * HS[1] * Math.cos(TH_EYE) * 1.0;
      const EYE_Z = 0.010 + HR * HS[2] * Math.sin(TH_EYE) * 0.97;
      const glowParts = [];
      for (const s of [1, -1]) {
        glowParts.push([new PlaneGeometry(0.105, 0.086), C.CYAN,
          partM(s * 0.05, EYE_Y, EYE_Z, 0, -s * 0.36, 0)]);
      }
      glowMesh = new Mesh(mergeParts(glowParts), M.eyeGlow);
      glowMesh.name = "eyeHalo";
      glowMesh.visible = false;
      glowMesh.renderOrder = 4;
      head.add(glowMesh);
      meshBag.push(glowMesh);

      /* ---- 头发：三层白发，全部向上收拢，做出蓬松的发冠而不是尖帽子 ---- */
      const hairGroup = new Group();
      hairGroup.name = "hair";
      head.add(hairGroup);
      bones.hair = hairGroup;   // 注册进骨骼表，零件桶才知道往哪儿挂
      const hairParts = [];
      // 发根：盖住颅骨上部的壳 + 后脑的发团
      hairParts.push([spherePatch(HR * 1.075, Math.PI / 2, Math.PI * 2, 0.0, 1.06, q, q.radial + 2), 16777215,
        partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2])]);
      hairParts.push([blobC(0.238, 0.19, 0.234, q), 15921906, partM(0, HC + 0.036, -0.03, 0, 0, 0, 1, 1, 1)]);
      const hairCol = [16777215, 16777215, 15856113];
      const nHair = q.hair;
      // 三层：外圈压低盖住两侧，内圈立起，顶层收拢 → 蓬松且有方向
      const rings = [
        { n: Math.round(nHair * 0.44), rr: 0.08, py: HC + 0.03, len: 0.095, rad: 0.054, tilt: 0.72, lean: 0.04 },
        { n: Math.round(nHair * 0.34), rr: 0.055, py: HC + 0.088, len: 0.105, rad: 0.05, tilt: 0.36, lean: 0.1 },
        { n: Math.round(nHair * 0.22), rr: 0.024, py: HC + 0.126, len: 0.1, rad: 0.044, tilt: 0.12, lean: 0.16 }
      ];
      let hi = 0;
      for (let ri = 0; ri < rings.length; ri++) {
        const R2 = rings[ri];
        for (let i = 0; i < R2.n; i++) {
          const a = (i / R2.n) * Math.PI * 2 + ri * 0.5;
          const jitter = ((hi * 37) % 11) / 22;
          const len = R2.len * (0.82 + jitter * 0.55);
          const px = Math.sin(a) * R2.rr;
          const pz = Math.cos(a) * R2.rr * 0.95 - 0.008;
          hairParts.push([new ConeGeometry(R2.rad * (0.85 + jitter * 0.5), len, q.seg > 6 ? 5 : 4, 1), hairCol[ri],
            partM(px, R2.py, pz, R2.lean + Math.cos(a) * R2.tilt, 0, -Math.sin(a) * R2.tilt)]);
          hi++;
        }
      }
      // 前刘海：额前一排短刺，压住发际线（五条悟的头发是往前上方立的）
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.34;
        hairParts.push([new ConeGeometry(0.042, 0.095, 5, 1), 16777215,
          partM(Math.sin(a) * 0.066, HC + 0.06, Math.cos(a) * 0.066 - 0.006, 0.5, 0, -Math.sin(a) * 0.24)]);
      }
      // 鬓角
      for (const s of [1, -1]) {
        hairParts.push([new ConeGeometry(0.024, 0.085, 4, 1), 15790320, partM(s * 0.094, HC + 0.026, 0.028, 0.42, 0, s * 0.3)]);
        hairParts.push([new ConeGeometry(0.022, 0.075, 4, 1), 15066597, partM(s * 0.088, HC + 0.028, -0.05, -0.3, 0, s * 0.35)]);
      }
      for (const it of hairParts) put("hair", "hair", it[0], it[1], it[2], { main: true });
      hairTips.push({ mesh: hairGroup, base: hairGroup.rotation.clone(), lag: 1 });

      /* ---- 手臂 ---- */
      for (const tag of ["L", "R"]) {
        const s = tag === "L" ? 1 : -1;
        put("shoulder" + tag, "body", blobC(0.142, 0.152, 0.152, q), C_COAT, partM(-s * 0.012, -0.004, 0, 0, 0, s * 0.12), { main: true });
        put("upperArm" + tag, "body", limbC(0.07, 0.058, 0.295, q, 1.02), C_COAT, partM(0, 0, 0), { main: true });
        put("foreArm" + tag, "body", limbC(0.06, 0.047, 0.275, q, 0.98), C_COAT, partM(0, 0, 0), { main: true });
        put("foreArm" + tag, "body", new CylinderGeometry(0.055, 0.049, 0.05, q.radial, 1), C_COLLAR, partM(0, -0.245, 0));
        put("hand" + tag, "body", blobC(0.075, 0.098, 0.052, q), C_SKIN, partM(0, -0.05, 0.004));
        put("hand" + tag, "body", blobC(0.066, 0.05, 0.048, q), C_SKIN, partM(0, -0.095, 0.008));
      }

      /* ---- 腿：长裤 + 战术靴 ---- */
      for (const tag of ["L", "R"]) {
        put("thigh" + tag, "body", limbC(0.098, 0.076, 0.425, q, 1.04), C_PANTS, partM(0, 0, 0), { main: true });
        put("shin" + tag, "body", limbC(0.078, 0.058, 0.418, q, 1.0), C_PANTS, partM(0, 0, 0), { main: true });
        // 靴筒
        put("shin" + tag, "body", limbC(0.079, 0.072, 0.19, q, 1.0), C_BOOT, partM(0, -0.1, 0), { main: true });
        put("shin" + tag, "body", new CylinderGeometry(0.082, 0.079, 0.03, q.radial, 1), 2895673, partM(0, -0.19, 0));
        // 靴子：方头 + 圆跟
        put("foot" + tag, "body", boxGeo(0.1, 0.075, 0.235), C_BOOT, partM(0, -0.032, 0.04), { main: true });
        put("foot" + tag, "body", blobC(0.1, 0.07, 0.1, q), C_BOOT, partM(0, -0.032, 0.15));
        put("foot" + tag, "body", boxGeo(0.098, 0.03, 0.24), 1973790, partM(0, -0.062, 0.042));
      }
    }

    /* ======================= 宿傩 ======================= */
    if (!isGojo) {
      const C_SKIN = 15126696;
      const C_ROBE = 15790034;      // 白和服
      const C_ROBE_D = 1973806;     // 黑襟 / 内衬
      const C_SASH = 1644585;       // 腰带
      const C_TAT = 657930;         // 纹身
      const C_HAIR = 15315597;      // 樱色
      const C_SANDAL = 2564382;

      /* ---- 躯干：白和服 + 交叠衣襟 ---- */
      putMany("hips", "body", [
        [latheY([[-0.12, 0.142], [-0.04, 0.158], [0.03, 0.163], [0.07, 0.155]], q, false, true), C_ROBE,
          partM(0, 0, 0, 0, 0, 0, 1, 1, 0.84), { main: true }]
      ]);
      // 腰带：宽而厚的黑带 + 侧结
      put("hips", "body", new CylinderGeometry(0.168, 0.162, 0.115, q.radial, 1), C_SASH,
        partM(0, 0.045, 0, 0, 0, 0, 1, 1, 0.86), { main: true });
      put("hips", "body", boxGeo(0.09, 0.075, 0.07), C_ROBE_D, partM(0, 0.05, -0.145));
      put("hips", "body", boxGeo(0.055, 0.17, 0.04), C_SASH, partM(-0.07, -0.04, -0.15, 0.1, 0, 0.12));
      put("core", "body", latheY([[-0.11, 0.145], [-0.02, 0.152], [0.06, 0.158]], q, false, false), C_ROBE,
        partM(0, 0, 0, 0, 0, 0, 1, 1, 0.76), { main: true });
      put("chest", "body", latheY([[-0.115, 0.158], [0.02, 0.185], [0.13, 0.205], [0.17, 0.178]], q, true, false), C_ROBE,
        partM(0, 0, 0, 0, 0, 0, 1, 1, 0.74), { main: true });
      // 交叠的衣襟：细 V 领线 + 白色前襟，读到"和服"靠的是这条 V
      put("chest", "body", boxGeo(0.155, 0.4, 0.028), C_ROBE, partM(-0.05, -0.03, 0.125, 0.05, 0, 0.34));
      put("chest", "body", boxGeo(0.155, 0.4, 0.028), C_ROBE, partM(0.05, -0.03, 0.125, 0.05, 0, -0.34));
      put("chest", "body", boxGeo(0.032, 0.4, 0.02), C_ROBE_D, partM(-0.115, -0.02, 0.108, 0.05, 0, 0.34));
      put("chest", "body", boxGeo(0.032, 0.4, 0.02), C_ROBE_D, partM(0.115, -0.02, 0.108, 0.05, 0, -0.34));
      // 后领
      put("chest", "body", new CylinderGeometry(0.074, 0.088, 0.09, q.radial, 1, true), C_ROBE,
        partM(0, 0.208, -0.008, 0, 0, 0), { main: true });
      // 锁骨下的横纹（宿傩纹身）：细一点，别做成黑块
      put("chest", "body", stripGeo(0.012, 0.19, 0.01), C_TAT, partM(0, -0.02, 0.155));

      /* ---- 头 ---- */
      const HR = 0.106;
      const HC = 0.118;
      const HS = [1.0, 1.15, 1.05];
      put("head", "body", blobC(HR * 2, HR * 2, HR * 2, q), C_SKIN, partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2]), { main: true });
      put("head", "body", blobC(0.196, 0.13, 0.176, q), C_SKIN, partM(0, HC - 0.024, 0.004, 0, 0, 0, 1, 1, 1));
      put("head", "body", blobC(0.165, 0.148, 0.158, q), C_SKIN, partM(0, HC - 0.06, -0.002, 0, 0, 0, 1, 1, 1));
      for (const s of [1, -1]) {
        put("head", "body", blobC(0.034, 0.06, 0.048, q), C_SKIN, partM(s * 0.101, HC - 0.014, -0.012, 0, 0, 0, 1, 1, 1));
      }
      // 颊侧的纹身线（贴着下颌走，不能飘在脸外面）
      for (const s of [1, -1]) {
        put("head", "body", stripGeo(0.05, 0.013, 0.01), C_TAT, partM(s * 0.062, HC - 0.05, 0.076, 0.35, 0, s * 0.3));
      }
      put("neck", "body", new CylinderGeometry(0.052, 0.062, 0.135, q.radial, 1), C_SKIN, partM(0, 0.005, 0, 0, 0, 0, 1, 1, 0.92), { main: true });

      /* ---- 脸：一张球面贴片（含猩红眼与面纹）---- */
      const FACE_PHI = 2.6;    // 覆盖整个正面
      const FACE_TH0 = 0.7;
      const FACE_THL = 1.76;
      faceMesh = new Mesh(spherePatch(HR * 1.055, Math.PI / 2, FACE_PHI, FACE_TH0, FACE_THL, q, q.radial * 2, q.seg * 2 + 6), M.face);
      faceMesh.position.set(0, HC, -0.006);
      faceMesh.scale.set(HS[0], HS[1], HS[2]);
      faceMesh.name = "faceBlind";
      head.add(faceMesh);
      meshBag.push(faceMesh);
      // 真身额上的第二对眼：一整块球面贴片，纹理里画了两只眼
      eyePair = new Mesh(spherePatch(HR * 1.075, Math.PI / 2, 1.5, 0.86, 0.44, q, q.radial + 4), M.eyePair);
      eyePair.position.set(0, HC, -0.006);
      eyePair.scale.set(HS[0], HS[1], HS[2]);
      eyePair.name = "eyePair";
      eyePair.visible = false;
      eyePair.renderOrder = 3;
      head.add(eyePair);
      meshBag.push(eyePair);

      /* ---- 头发：樱色短发，向后倒伏，做出分头与尖角 ---- */
      const hairGroup = new Group();
      hairGroup.name = "hair";
      head.add(hairGroup);
      bones.hair = hairGroup;   // 注册进骨骼表，零件桶才知道往哪儿挂
      const hairParts = [];
      hairParts.push([spherePatch(HR * 1.05, Math.PI / 2, Math.PI * 2, 0.0, 0.94, q, q.radial + 2), C_HAIR,
        partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2])]);
      hairParts.push([blobC(0.228, 0.172, 0.224, q), 14648766, partM(0, HC + 0.03, -0.036, 0, 0, 0, 1, 1, 1)]);
      const nHair = q.hair;
      const rings = [
        { n: Math.round(nHair * 0.44), rr: 0.078, py: HC + 0.032, len: 0.1, rad: 0.052, tilt: 0.66, lean: -0.24 },
        { n: Math.round(nHair * 0.34), rr: 0.054, py: HC + 0.09, len: 0.11, rad: 0.048, tilt: 0.32, lean: -0.36 },
        { n: Math.round(nHair * 0.22), rr: 0.026, py: HC + 0.126, len: 0.104, rad: 0.042, tilt: 0.1, lean: -0.44 }
      ];
      let hi = 0;
      for (let ri = 0; ri < rings.length; ri++) {
        const R2 = rings[ri];
        for (let i = 0; i < R2.n; i++) {
          const a = (i / R2.n) * Math.PI * 2 + ri * 0.4;
          const jitter = ((hi * 53) % 11) / 22;
          const len = R2.len * (0.82 + jitter * 0.6);
          // 后脑的发束更长
          const back = Math.max(0, -Math.cos(a));
          hairParts.push([new ConeGeometry(R2.rad * (0.85 + jitter * 0.5), len * (1 + back * 0.35), q.seg > 6 ? 5 : 4, 1),
            hi % 3 === 0 ? 13076391 : C_HAIR,
            partM(Math.sin(a) * R2.rr, R2.py, Math.cos(a) * R2.rr * 0.95 - 0.01,
              R2.lean + Math.cos(a) * R2.tilt, 0, -Math.sin(a) * R2.tilt)]);
          hi++;
        }
      }
      // 额前的分头尖：一撮向前下压的刘海
      for (let i = -1; i <= 1; i++) {
        const a = i * 0.32;
        hairParts.push([new ConeGeometry(0.036, 0.075, 5, 1), C_HAIR,
          partM(Math.sin(a) * 0.062, HC + 0.068, Math.cos(a) * 0.062 - 0.006, 0.8, 0, -Math.sin(a) * 0.26)]);
      }
      for (const s of [1, -1]) {
        hairParts.push([new ConeGeometry(0.03, 0.085, 4, 1), 13076391, partM(s * 0.094, HC + 0.03, 0.03, 0.3, 0, s * 0.28)]);
        hairParts.push([new ConeGeometry(0.028, 0.09, 4, 1), C_HAIR, partM(s * 0.088, HC + 0.028, -0.05, -0.5, 0, s * 0.3)]);
      }
      for (const it of hairParts) put("hair", "hair", it[0], it[1], it[2], { main: true });
      hairTips.push({ mesh: hairGroup, base: hairGroup.rotation.clone(), lag: 1 });

      /* ---- 手臂：裸露 + 黑色纹身环 ---- */
      for (const tag of ["L", "R"]) {
        const s = tag === "L" ? 1 : -1;
        put("shoulder" + tag, "body", blobC(0.156, 0.164, 0.164, q), C_ROBE, partM(-s * 0.012, -0.004, 0, 0, 0, s * 0.12), { main: true });
        // 短袖和服袖 + 露出的小臂皮肤
        put("upperArm" + tag, "body", limbC(0.08, 0.064, 0.17, q, 1.05), C_ROBE, partM(0, 0, 0, 0, 0, 0), { main: true });
        put("upperArm" + tag, "body", limbC(0.066, 0.058, 0.17, q, 1.0), C_SKIN, partM(0, -0.14, 0, 0, 0, 0));
        put("foreArm" + tag, "body", limbC(0.064, 0.05, 0.275, q, 1.0), C_SKIN, partM(0, 0, 0), { main: true });
        // 纹身环：两道
        put("upperArm" + tag, "body", new CylinderGeometry(0.0665, 0.0665, 0.022, q.radial, 1), C_TAT, partM(0, -0.2, 0));
        put("foreArm" + tag, "body", new CylinderGeometry(0.0625, 0.0605, 0.02, q.radial, 1), C_TAT, partM(0, -0.06, 0));
        put("foreArm" + tag, "body", new CylinderGeometry(0.058, 0.056, 0.018, q.radial, 1), C_TAT, partM(0, -0.17, 0));
        // 手：黑指甲
        put("hand" + tag, "body", blobC(0.082, 0.105, 0.056, q), C_SKIN, partM(0, -0.05, 0.004));
        put("hand" + tag, "body", blobC(0.072, 0.052, 0.05, q), C_SKIN, partM(0, -0.097, 0.008));
        put("hand" + tag, "body", boxGeo(0.068, 0.016, 0.03), C_TAT, partM(0, -0.118, 0.014));
      }

      /* ---- 腿：和服下摆遮住大腿，露小腿 + 草鞋 ---- */
      for (const tag of ["L", "R"]) {
        put("thigh" + tag, "body", limbC(0.104, 0.08, 0.425, q, 1.05), C_SKIN, partM(0, 0, 0), { main: true });
        put("shin" + tag, "body", limbC(0.082, 0.06, 0.418, q, 1.0), C_SKIN, partM(0, 0, 0), { main: true });
        put("shin" + tag, "body", new CylinderGeometry(0.071, 0.069, 0.02, q.radial, 1), C_TAT, partM(0, -0.36, 0));
        put("foot" + tag, "body", blobC(0.1, 0.072, 0.235, q), C_SKIN, partM(0, -0.036, 0.045), { main: true });
        put("foot" + tag, "body", boxGeo(0.104, 0.022, 0.245), C_SANDAL, partM(0, -0.062, 0.048));
      }

      /* ---- 真身·第二对手臂（觉醒态显示）---- */
      const arms2 = {};
      for (const tag of ["L", "R"]) {
        const s = tag === "L" ? 1 : -1;
        const sh = mk("arm2" + tag + "1", chest, s * 0.152, -0.055, -0.05);
        const fa = mk("arm2" + tag + "2", sh, 0, -0.29, 0);
        put("arm2" + tag + "1", "body", blobC(0.14, 0.145, 0.145, q), C_SKIN, partM(0, 0.005, 0, 0, 0, s * 0.1));
        put("arm2" + tag + "1", "body", limbC(0.068, 0.056, 0.29, q, 1.03), C_SKIN, partM(0, 0, 0, 0, 0, 0));
        put("arm2" + tag + "1", "body", new CylinderGeometry(0.0695, 0.0675, 0.02, q.radial, 1), C_TAT, partM(0, -0.245, 0));
        put("arm2" + tag + "2", "body", limbC(0.058, 0.047, 0.28, q, 1.0), C_SKIN, partM(0, 0, 0, 0, 0, 0));
        put("arm2" + tag + "2", "body", new CylinderGeometry(0.0565, 0.0545, 0.018, q.radial, 1), C_TAT, partM(0, -0.13, 0));
        put("arm2" + tag + "2", "body", blobC(0.076, 0.098, 0.052, q), C_SKIN, partM(0, -0.275, 0.004));
        put("arm2" + tag + "2", "body", boxGeo(0.062, 0.015, 0.028), C_TAT, partM(0, -0.337, 0.012));
        const gp = new Object3D();
        gp.name = "grip2" + tag;
        gp.position.set(0, -0.32, 0);
        fa.add(gp);
        arms2[tag] = { sh, fa, gp };
      }
    }

    /* ---------------- 布料下摆：会跟着动作飘 ---------------- */
    const hemCount = isGojo ? (q.cloth ? 9 : 5) : (q.cloth ? 12 : 6);
    const HEM_A = isGojo ? 2171957 : 15790034;   // 正面布色
    const HEM_B = isGojo ? 1316369 : 1973806;    // 背面/内衬色
    for (let i = 0; i < hemCount; i++) {
      const a = i / hemCount * Math.PI * 2;
      const isGojoHem = isGojo;
      const pw = isGojoHem ? 0.21 : 0.22;   // 稍宽：相邻布片互相压住，不会看成一片片木条
      const ph = isGojoHem ? 0.3 : 0.5;
      const pg = new PlaneGeometry(pw, ph, 1, q.cloth ? 3 : 1);
      const p = new Mesh(pg, isGojo ? M.body : M.robe);
      const rIn = isGojoHem ? 0.15 : 0.175;
      p.position.set(Math.sin(a) * rIn, isGojoHem ? -0.14 : -0.27, Math.cos(a) * rIn * 0.86);
      p.rotation.y = a;
      // 衣服本体颜色靠顶点色给：与合并网格一套材质
      const cols = new Float32Array(pg.attributes.position.count * 3);
      const c = new Color(HEM_A).lerp(new Color(HEM_B), 0.18 + 0.22 * (i % 2));
      for (let k = 0; k < pg.attributes.position.count; k++) {
        cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
      }
      pg.setAttribute("color", new BufferAttribute(cols, 3));
      bones.hips.add(p);
      cloth.push({ mesh: p, base: p.rotation.clone(), basePos: p.position.clone(), amp: isGojo ? 0.18 : 0.3, axis: "x", phase: a });
      meshBag.push(p);
    }

    /* ---------------- 合并出网格（每个「骨骼|材质」一个网格）---------------- */
    for (const [key, b] of buckets) {
      const geo = mergeParts(b.parts);
      const mat = M[b.matKey];
      if (!mat) continue;
      const mesh = new Mesh(geo, mat);
      mesh.name = key.split("|")[0] + ":" + b.matKey;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const parent = bones[b.bone] || root;
      parent.add(mesh);
      meshBag.push(mesh);
      // 反壳描边：套一层放大 BackSide，保证剪影不糊
      if (q.outline && (q.outlineAll || b.outline)) {
        const om = new Mesh(geo, M.outline);
        om.name = mesh.name + ":ink";
        // 必须绕几何自身中心放大：绕骨骼原点放大会让壳偏心、从模型里穿出来（表现为身上一道虚线）
        const oc = geo.boundingSphere ? geo.boundingSphere.center : null;
        const os = b.outline ? 1.055 : 1.07;
        om.scale.setScalar(os);
        if (oc) om.position.set(oc.x * (1 - os), oc.y * (1 - os), oc.z * (1 - os));
        om.renderOrder = -1;
        parent.add(om);
        outlineMeshes.push(om);
        meshBag.push(om);
      }
    }

    /* ---------------- 对外句柄 ---------------- */
    const handR = new Object3D();
    handR.name = "handR";
    const handL = new Object3D();
    handL.name = "handL";
    const chestPoint = new Object3D();
    chestPoint.name = "chest";
    handR.position.set(0, -0.055, 0);
    handL.position.set(0, -0.055, 0);
    chestPoint.position.set(0, 0.02, 0.12);
    bones.handR.add(handR);
    bones.handL.add(handL);
    bones.chest.add(chestPoint);

    const handR2 = new Object3D();
    handR2.name = "handR2";
    const handL2 = new Object3D();
    handL2.name = "handL2";
    root.add(handR2);
    root.add(handL2);

    const arms2 = isGojo ? { L: null, R: null } : bones.arm2L1 ? {
      L: { sh: bones.arm2L1, fa: bones.arm2L2, gp: null },
      R: { sh: bones.arm2R1, fa: bones.arm2R2, gp: null }
    } : { L: null, R: null };
    if (!isGojo) {
      for (const k of ["L", "R"]) {
        arms2[k].sh.visible = false;
        arms2[k].sh.scale.setScalar(0.01);
        // 找 grip2
        arms2[k].fa.children.forEach((ch) => { if (ch.name === "grip2" + k) arms2[k].gp = ch; });
      }
    }

    /* ---------------- 领域纹样 ----------------
     * 注意：这里刻意不建"罩住全身的半透明胶囊"——那东西看着像泡在福尔马林里。
     * 术式状态改为：描边壳整体转成咒力色发光 + 脚下光环放大，保留空间感又不糊脸。 */
    const shellMesh = null;
    const runes = [];
    if (q.shell) {
      const spots = [
        [chest, 0, 0, 0.125, 0.22],
        [core, 0, -0.02, 0.115, 0.18],
        [bones.upperArmL, 0, -0.16, 0.065, 0.12],
        [bones.upperArmR, 0, -0.16, 0.065, 0.12],
        [bones.thighL, 0, -0.26, 0.095, 0.15],
        [bones.thighR, 0, -0.26, 0.095, 0.15]
      ];
      for (const [parent, x, y, z, sz] of spots) {
        const m = new Mesh(new PlaneGeometry(sz, sz), M.runes);
        m.name = "runesMesh";
        m.position.set(x, y, z);
        m.visible = false;
        m.renderOrder = 6;
        parent.add(m);
        runes.push(m);
      }
    }

    /* ---------------- 落地阴影：让角色有重量 ---------------- */
    let shadowMesh = null;
    let shadowGlow = null;
    if (q.shadow !== false) {
      shadowMesh = new Mesh(new PlaneGeometry(1.4, 1.08), M.shadow);
      shadowMesh.name = "contactShadow";
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, 0.012, 0.02);
      shadowMesh.renderOrder = 1;
      root.add(shadowMesh);
      // 脚下的光池：黑影在深色沥青上看不见，这层加法光才是"踩在地上"的观感来源
      shadowGlow = new Mesh(new PlaneGeometry(0.66, 0.52), M.shadowGlow);
      shadowGlow.name = "contactGlow";
      shadowGlow.rotation.x = -Math.PI / 2;
      shadowGlow.position.set(0, 0.016, 0.03);
      shadowGlow.renderOrder = 2;
      root.add(shadowGlow);
    }

    const rigGrips = { L: armL.gp, R: armR.gp };
    const sync2 = () => {
      if (arms2.L && arms2.L.gp) arms2.L.gp.getWorldPosition(handL2.position);
      else rigGrips.L.getWorldPosition(handL2.position);
      if (arms2.R && arms2.R.gp) arms2.R.gp.getWorldPosition(handR2.position);
      else rigGrips.R.getWorldPosition(handR2.position);
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
      outlines: outlineMeshes,
      meshes: meshBag,
      sync2,
      syncFallback,
      sk: isGojo ? 1 : 0.985,
      isGojo,
      shadow: shadowMesh,
      shadowGlow: shadowGlow,
      // 可切换部件的句柄
      blindfoldMesh: isGojo ? bfMesh : null,
      faceBlind: isGojo ? faceBlind : faceMesh,
      faceEyes: isGojo ? faceEyes : null,
      eyeHalo: isGojo ? glowMesh : null,
      eyePair: isGojo ? null : eyePair
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
  // 播完必须保持末帧的动作（倒地 / 胜负姿势）。其余一次性动作播完要自动回到基础动作，
  // 否则调用方在攻击 / 受击 / 技能之后没有接手新动作时，角色会永远僵在最后一帧。
  var HOLD_AFTER_END = { down: 1, defeat: 1, victory: 1 };
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
  /* 步态夸张系数（编译期作用在 walk/run 的关键帧上）
   * 相机拉远后角色只占屏高 ~16%（1600x900 下约 130px），腿只有 ~50px，
   * 按近景调的原始摆幅在小尺寸下几乎读不出来 —— 用户反馈"移动时腿根本不摆动"。
   * 这里把腿部/摆臂/躯干扭转按 1.3~1.6 倍放大，冲刺比走路再大一档。
   * 系数只作用在**显式写了值的骨骼**上，不碰采样器的补帧逻辑。 */
  var GAIT_AMP = {
    walk: {
      ry: 1.7,
      thighL: [1.55, 1, 1.25], thighR: [1.55, 1, 1.25],
      shinL: [1.45, 1, 1], shinR: [1.45, 1, 1],
      footL: [1.3, 1, 1], footR: [1.3, 1, 1],
      upperArmL: [1.5, 1, 1.2], upperArmR: [1.5, 1, 1.2],
      foreArmL: [1.3, 1, 1], foreArmR: [1.3, 1, 1],
      hips: [1.2, 1.5, 1.6], core: [1.3, 1.4, 1.6], chest: [1.3, 1.4, 1.6]
    },
    run: {
      ry: 1.8,
      thighL: [1.6, 1, 1.3], thighR: [1.6, 1, 1.3],
      shinL: [1.5, 1, 1], shinR: [1.5, 1, 1],
      footL: [1.35, 1, 1], footR: [1.35, 1, 1],
      upperArmL: [1.55, 1, 1.25], upperArmR: [1.55, 1, 1.25],
      foreArmL: [1.35, 1, 1], foreArmR: [1.35, 1, 1],
      hips: [1.25, 1.6, 1.7], core: [1.35, 1.5, 1.7], chest: [1.35, 1.5, 1.7]
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
      // 步态夸张（只放大作者显式写过的骨骼通道）
      const amp = GAIT_AMP[name];
      if (amp) {
        for (const f of frames) {
          if (amp.ry) f.ry *= amp.ry;
          for (const bn of BONES) {
            const s = amp[bn];
            const v = f.pose[bn];
            if (!s || !v) continue;
            f.pose[bn] = [v[0] * s[0], v[1] * s[1], v[2] * s[2]];
          }
        }
      }
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
    /* ---------------- 手感状态（操作感的核心） ----------------
     * 位移不再"按键=全速、松手=钉死"，而是走速度插值：
     * 按下去有起步、松手有惯性滑行；转身走角速度限幅 + 平滑。 */
    let vX = 0, vZ = 0;            // 当前水平速度 m/s
    let prevSpd = 0;               // 上一帧速率（算加速度 → 前后倾）
    let cmdMove = false;           // 本帧是否收到移动指令
    let turnVel = 0;               // 转身角速度 rad/s
    let leanRoll = 0;              // 转弯侧倾
    let leanPitch = 0;             // 加减速前后倾
    /* 姿态交叉淡入：切换动作时从"上一帧真正贴上去的姿态"过渡到新动作，
     * 不再是一帧硬切（原先 run→punch 单帧跳变 2.54 弧度） */
    const appliedPose = {};
    for (const bb of BONES) appliedPose[bb] = [0, 0, 0];
    let appliedRootY = 0;
    let blendT = 1;
    let blendDur = 0.18;
    const setFlash = (v) => {
      flash = clamp5(v, 0, 1);
      for (const m of toonMats) m.uniforms.uFlash.value = flash;
    };
    let glowBoost = 1;
    const applyAuraMats = () => {
      const on = domained || auraOn || guardOn;
      const boost = domained ? 1.9 : auraOn ? 1.35 : guardOn ? 1.5 : 1;
      const rimCol = on ? src.auraColor : src.rim;
      for (const m of toonMats) {
        const base = m.userData.base;
        m.uniforms.uRimStrength.value = base.rimStrength * boost;
        m.uniforms.uEmissiveI.value = base.emissiveI * (domained ? 2 : auraOn ? 1.3 : 1) + (domained ? 0.38 : auraOn ? 0.16 : guardOn ? 0.22 : 0);
        m.uniforms.uRim.value.setHex(rimCol);
      }
      // 术式的视觉表达：轮廓整体亮成咒力色（空间系被"包住"的感觉来自边缘光，不是壳）
      const om = src.mat.outline;
      if (om && om.uniforms) {
        om.uniforms.uRim.value.setHex(rimCol);
        om.uniforms.uRimStrength.value = domained ? 1.0 : auraOn ? 0.74 : guardOn ? 0.84 : 0.22;
      }
      // 脚下光环随状态放大
      glowBoost = domained ? 3.4 : auraOn ? 2.3 : guardOn ? 2.6 : 1;
      if (rig.shadowGlow) rig.shadowGlow.material.color.setHex(on ? src.auraColor : src.rim);
      for (const r of rig.runes) r.visible = domained && q.shell;
    };
    const update2 = (dt) => {
      const d = Math.min(Math.max(dt || 0, 0), 0.1);
      tGlobal += d;
      state2.animT = curT;
      const clip = sampler.get(curName);
      const dur = clip ? clip.dur : 1;
      // 步频跟随实际速度：脚不打滑（脚滑是"玩起来不像 3D 游戏"的最大来源之一）。
      // 走/跑时用真实速度除以该动作的额定速度，冲刺时步频自然加快。
      let strideScale = 1;
      if (curName === "walk" || curName === "run") {
        const spNow0 = Math.hypot(vX, vZ);
        const ref = curName === "run" ? RUN_SPEED : WALK_SPEED;
        strideScale = clamp5(spNow0 / Math.max(ref, 0.01), 0.5, 1.75);
      }
      curT += d * curSpeed * strideScale;
      if (curLoop) {
        if (dur > 0) curT = curT % dur;
      } else if (curT >= dur) {
        curT = dur;
        if (!ended) {
          ended = true;
          const finishedName = curName;
          const cb = onEndCb;
          onEndCb = null;
          if (cb) {
            try {
              cb();
            } catch (e) {
            }
          }
          // 关键兜底：回调里没有人接手新动作时，主动回到 idle。
          // 攻击 / 技能 / 受击的调用方经常直接 return（不等 onEnd），
          // 缺了这一步角色就会一直卡在出拳或受击的最后一帧：
          // 表现为"打完之后僵住不动""移动时腿不摆动像个木偶"。
          if (curName === finishedName && !HOLD_AFTER_END[curName]) {
            play2("idle", { loop: true });
          }
        }
      }
      if (!sampler.sample(curName, curT, poseBuf)) return;
      // ---- 交叉淡入：从切换瞬间的姿态平滑过渡到新动作 ----
      if (blendT < 1) {
        blendT = Math.min(1, blendT + d / blendDur);
        // 用 smoothstep 而不是 easeOut：easeOut 第一帧就吃掉 40%，
        // 那一帧本身就是一次大跳变（实测 1.0 弧度），smoothstep 首帧只走 7%
        const bk = blendT * blendT * (3 - 2 * blendT);
        for (const b of BONES) {
          const o = poseBuf[b], p = appliedPose[b];
          o[0] = p[0] + (o[0] - p[0]) * bk;
          o[1] = p[1] + (o[1] - p[1]) * bk;
          o[2] = p[2] + (o[2] - p[2]) * bk;
        }
        poseBuf.__rootY = appliedRootY + (poseBuf.__rootY - appliedRootY) * bk;
        // 过渡期间再加一道单帧限幅：掉帧时（一帧 50ms）也不会"啪"一下跳半个动作
        for (const b of BONES) {
          const o = poseBuf[b], p = appliedPose[b];
          for (let i = 0; i < 3; i++) {
            const dd = o[i] - p[i];
            if (dd > 0.6) o[i] = p[i] + 0.6;
            else if (dd < -0.6) o[i] = p[i] - 0.6;
          }
        }
      }
      for (const b of BONES) {
        const node = bones[b];
        const v = poseBuf[b];
        node.rotation.set(v[0], v[1], v[2]);
      }
      bones.hips.position.y = hipsRestY + poseBuf.__rootY;
      // ---- 加减速的前后倾：加速时上半身前压、急停时后仰，这是"有质量"的观感来源 ----
      {
        const spNow = Math.hypot(vX, vZ);
        const acc = (spNow - prevSpd) / Math.max(d, 1e-4);
        prevSpd = spNow;
        const pitchTarget = clamp5(acc * 0.012, -0.13, 0.17);
        leanPitch += (pitchTarget - leanPitch) * Math.min(1, d * 7);
        bones.core.rotation.x += leanPitch;
        bones.hips.rotation.x += leanPitch * 0.35;
      }
      if (q.secondary) {
        const breath = Math.sin(tGlobal * 1.75) * 0.026;
        const sway = Math.sin(tGlobal * 0.62) * 0.02;
        const sway2 = Math.cos(tGlobal * 0.48) * 0.016;
        bones.chest.rotation.x += breath;
        bones.core.rotation.z += sway;
        bones.hips.rotation.z += sway2;
        bones.neck.rotation.y += Math.sin(tGlobal * 0.37 + 1.1) * 0.05;
        bones.head.rotation.z += Math.sin(tGlobal * 0.9) * 0.02;
        // ---- 程序化行走层：让"走"是全身的事，而不是上半身刚体平移 ----
        {
          const spNow = Math.hypot(vX, vZ);
          const amp = clamp5(spNow / 5.2, 0, 1.3);
          if (amp > 0.08) {
            const cad = spNow > 4.2 ? 9.4 : 6.6;    // 步频跟着速度走
            // 走/跑时相位直接取自动作剪辑（curT/dur），骨盆起伏与脚步严格同相；
            // 其它状态（冲刺/被击退等）退回自由相位
            const ph = (curName === "walk" || curName === "run") && dur > 0
              ? (curT / dur) * Math.PI * 2
              : tGlobal * cad;
            const s = Math.sin(ph), a2 = Math.abs(s);
            // 幅度按"角色只占屏高 16%"来定：小尺寸下动作必须夸张一点才读得出来。
            // 骨盆起伏只往下沉（不抬高），保证脚不离地，同时每次落脚都有"压一下"的重量。
            bones.hips.position.y -= a2 * 0.062 * amp;
            bones.hips.rotation.z += s * 0.115 * amp;             // 骨盆左右倾
            bones.hips.rotation.y += s * 0.19 * amp;              // 骨盆旋转
            bones.chest.rotation.y -= s * 0.26 * amp;             // 肩带反向扭转
            bones.chest.rotation.z -= s * 0.075 * amp;
            bones.upperArmL.rotation.x += s * 0.38 * amp;         // 摆臂幅度随速度
            bones.upperArmR.rotation.x -= s * 0.38 * amp;
            // 冲刺前倾：速度越快上身越压，小尺寸下一眼就能看出"在跑"
            const fwd = clamp5((spNow - 4.0) * 0.05, 0, 0.34);
            bones.core.rotation.x += fwd;
            bones.chest.rotation.x += fwd * 0.45;
            bones.neck.rotation.x -= fwd * 0.55;
          }
          // 头部稳定：抵消躯干扭转与侧倾，头不会跟着"摇"（人眼/前庭会自动保持水平）
          bones.head.rotation.y -= bones.chest.rotation.y * 0.6;
          bones.head.rotation.z -= (bones.core.rotation.z + bones.hips.rotation.z) * 0.45;
          bones.head.rotation.x -= (bones.core.rotation.x + bones.chest.rotation.x) * 0.28;
        }
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
      if (rig.shadow) {
        // 起跳时影子缩小变淡、落地时压回原样 —— 重量感全靠这个
        const lift = Math.max(0, poseBuf.__rootY || 0);
        const k = clamp5(1 - lift * 1.15, 0.45, 1);
        rig.shadow.scale.set(k, k, 1);
        rig.shadow.material.opacity = src.shadowBase * (0.4 + 0.6 * k);
        if (rig.shadowGlow) {
          const gs = (k * 0.9 + 0.1) * (0.85 + 0.15 * glowBoost);
          rig.shadowGlow.scale.set(gs, gs, 1);
          rig.shadowGlow.material.opacity = clamp5(0.13 * glowBoost, 0.04, 0.5) * (0.35 + 0.65 * k);
        }
      }
      if (flash > 0) setFlash(Math.max(0, flash - d * flashDecay));
      // ---- 松手惯性：不再"立刻钉死"，而是指数衰减滑一小段（约 20~30cm）----
      if (!cmdMove) {
        const dec = Math.exp(-d / 0.062);
        vX *= dec; vZ *= dec;
        const spNow = Math.hypot(vX, vZ);
        if (spNow < 0.45) { vX = 0; vZ = 0; }
        else { root.position.x += vX * d; root.position.z += vZ * d; }
        /**
         * 松手必须把步态动画收掉。
         * 缺了这一步的后果：玩家一松开方向键，move() 就不再被调用，
         * curName 永远停在 walk/run，角色**站着不动、双腿却定格在迈步的中间帧**，
         * 看起来像个人偶。同理，一次性动作播完了也没人接管时一并回收。
         */
        if (spNow < 0.9 && (curName === "walk" || curName === "run" || (!curLoop && ended && !HOLD_AFTER_END[curName]))) {
          play2("idle", { loop: true });
        }
      }
      cmdMove = false;
      // ---- 转身：角速度做限幅 + 平滑（有加速减速），不再是"瞬间对齐" ----
      if (targetYaw !== null) {
        const diff = angleDelta(root.rotation.y, targetYaw);
        const want = clamp5(diff * 8.5, -10, 10);
        turnVel += (want - turnVel) * Math.min(1, d * 16);
        root.rotation.y += turnVel * d;
        if (Math.abs(diff) < 3e-3 && Math.abs(turnVel) < 0.08) {
          root.rotation.y = targetYaw;
          targetYaw = null;
          turnVel = 0;
        }
      } else {
        turnVel *= Math.max(0, 1 - d * 10);
      }
      // 转弯时上半身先压肩侧倾（人体转身的自然动作）
      {
        const rollTarget = clamp5(-turnVel * 0.04, -0.26, 0.26);
        leanRoll += (rollTarget - leanRoll) * Math.min(1, d * 9);
        bones.core.rotation.z += leanRoll;
        // 头再补偿一次侧倾（这段在头部稳定之后执行，所以要单独补）
        if (q.secondary) bones.head.rotation.z -= leanRoll * 0.5;
      }
      {
        const canShow = !rig.isGojo;
        const on = canShow && mode === "awakened";
        awakenedT += ((on ? 1 : 0) - awakenedT) * Math.min(1, d * 6.5);
        const k = awakenedT;
        for (const tag of ["L", "R"]) {
          const a2 = rig.arms2[tag];
          if (!a2 || !a2.sh) continue;
          a2.sh.visible = k > 0.02;
          if (!a2.sh.visible) continue;
          const pop = 1 - k;
          const sgn = tag === "L" ? 1 : -1;
          a2.sh.scale.setScalar(0.04 + 0.96 * easeOut2(k));
          const mainU = bones["upperArm" + tag];
          const mainF = bones["foreArm" + tag];
          // 第二对手臂：比主臂更外扩、略微朝前，四手轮廓才读得出来
          a2.sh.rotation.set(
            0.2 + mainU.rotation.x * 0.55,
            mainU.rotation.y * 0.6,
            sgn * (0.66 + mainU.rotation.z * 0.35)
          );
          a2.fa.rotation.set(
            0.14 + mainF.rotation.x * 0.62,
            mainF.rotation.y * 0.6,
            sgn * 0.34 + mainF.rotation.z * 0.5
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
      // 攻击起手要快、位移动作可以柔一点：淡入时长按动作类型给
      blendT = 0;
      blendDur = ONESHOT[name] ? 0.16 : (name === "walk" || name === "run" || name === "idle" ? 0.2 : 0.16);
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
      moveDir.set(dx / len, 0, dz / len);
      const want = Math.max(0, speed);
      // 起步不再瞬间到全速：指数逼近，冲刺跟手更快、走位更有重量
      const tau = want > 6.5 ? 0.055 : 0.085;
      const k = 1 - Math.exp(-Math.max(dt, 1e-4) / tau);
      vX += (moveDir.x * want - vX) * k;
      vZ += (moveDir.z * want - vZ) * k;
      const sp = Math.hypot(vX, vZ);
      const step = Math.min(len, sp * Math.max(dt, 1e-4));
      if (sp > 1e-5) {
        root.position.x += (vX / sp) * step;
        root.position.z += (vZ / sp) * step;
      }
      faceTo(x, z, false);
      cmdMove = true;
      // 一次性动作已经播完（且不是需要保持末帧的姿势）时也要允许接管，
      // 否则 move() 会因为 curName 仍是 punch/hit_light 而拒绝切回走跑，
      // 于是"边走边滑、腿一步不摆"。
      const oneShotDone = !curLoop && ended && !HOLD_AFTER_END[curName];
      if (curName === "idle" || curName === "walk" || curName === "run" || oneShotDone) {
        // 用"实际速度"驱动动画，起步时会自然经过 idle → walk → run
        const spd = Math.max(sp, want * 0.55);
        const wantAnim = spd >= RUN_SPEED * 0.8 ? "run" : spd >= WALK_SPEED * 0.5 ? "walk" : "idle";
        if (wantAnim !== curName) play2(wantAnim, { loop: true });
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
      if (mode === "awakened" && side === "gojo") setBlindfold(false);
      // 宿傩真身：额上第二对眼打开
      if (rig.eyePair) rig.eyePair.visible = mode === "awakened";
      setDomained(domained);
    };
    const setBlindfold = (on) => {
      blindfoldOn = !!on;
      if (side !== "gojo") return;
      // 眼罩态：眼罩 + 无眼的脸贴片；六眼态：露出眼睛与青光
      if (rig.blindfoldMesh) rig.blindfoldMesh.visible = blindfoldOn;
      if (rig.faceBlind) rig.faceBlind.visible = blindfoldOn;
      if (rig.faceEyes) rig.faceEyes.visible = !blindfoldOn;
      if (rig.eyeHalo) rig.eyeHalo.visible = !blindfoldOn;
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
      vX = 0; vZ = 0; prevSpd = 0; cmdMove = false;
      turnVel = 0; leanRoll = 0; leanPitch = 0;
      blendT = 1;
      for (const b of BONES) { const a = appliedPose[b]; a[0] = 0; a[1] = 0; a[2] = 0; }
      appliedRootY = 0;
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
      if (rig.eyePair) rig.eyePair.visible = false;
      if (rig.shadow) {
        rig.shadow.scale.set(1, 1, 1);
        rig.shadow.material.opacity = src.shadowBase;
      }
      if (rig.shadowGlow) rig.shadowGlow.material.opacity = 0.13;
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
