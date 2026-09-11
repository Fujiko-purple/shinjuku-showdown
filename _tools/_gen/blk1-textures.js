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

  // 眼白 + 虹膜 + 睫毛：写在贴图上，靠球面贴片天然贴合头型
  function paintEye(ctx2, s, cx, cy, rx, ry, iris, irisDark, glow) {
    ctx2.save();
    // 眼白
    ctx2.fillStyle = "#f4f2f0";
    ctx2.beginPath();
    ctx2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx2.fill();
    // 上眼睑投影
    ctx2.fillStyle = "rgba(40,28,30,0.42)";
    ctx2.beginPath();
    ctx2.ellipse(cx, cy - ry * 0.52, rx * 0.98, ry * 0.62, 0, 0, Math.PI * 2);
    ctx2.fill();
    // 虹膜
    const ir = Math.min(rx, ry) * 1.12;
    const g = ctx2.createRadialGradient(cx, cy, ir * 0.15, cx, cy, ir);
    g.addColorStop(0, iris);
    g.addColorStop(0.62, iris);
    g.addColorStop(1, irisDark);
    ctx2.fillStyle = g;
    ctx2.beginPath();
    ctx2.arc(cx, cy, ir, 0, Math.PI * 2);
    ctx2.fill();
    // 瞳孔
    ctx2.fillStyle = "rgba(6,8,14,0.92)";
    ctx2.beginPath();
    ctx2.arc(cx, cy, ir * 0.36, 0, Math.PI * 2);
    ctx2.fill();
    // 高光
    if (glow) {
      ctx2.fillStyle = "rgba(255,255,255,0.85)";
      ctx2.beginPath();
      ctx2.arc(cx - ir * 0.34, cy - ir * 0.38, ir * 0.24, 0, Math.PI * 2);
      ctx2.fill();
    }
    // 上睫毛线
    ctx2.strokeStyle = "rgba(16,14,20,0.9)";
    ctx2.lineWidth = Math.max(1, s * 0.008);
    ctx2.beginPath();
    ctx2.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.03, Math.PI * 1.97);
    ctx2.stroke();
    ctx2.restore();
  }

  // 五条悟面部（眼罩态）：无眼，只有眉骨暗部/鼻/嘴/下巴
  function texGojoFaceBlind(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#edd6c2";
      ctx2.fillRect(0, 0, s, s);
      edgeShade(ctx2, s, 0.5);
      // 眉骨与眼窝的暗部（眼罩下面透出的一点阴影，让脸不至于像面具）
      ctx2.fillStyle = "rgba(120,84,80,0.30)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.29, s * 0.2, s * 0.17, s * 0.075, -0.06, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.ellipse(s * 0.71, s * 0.2, s * 0.17, s * 0.075, 0.06, 0, Math.PI * 2);
      ctx2.fill();
      // 鼻：一竖一横的暗部 + 鼻尖高光
      ctx2.strokeStyle = "rgba(150,104,96,0.55)";
      ctx2.lineWidth = Math.max(1, s * 0.012);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.5, s * 0.34);
      ctx2.lineTo(s * 0.5, s * 0.52);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(126,86,80,0.42)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.55, s * 0.055, s * 0.028, 0, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "rgba(255,246,240,0.5)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.5, s * 0.022, s * 0.05, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 嘴：薄而平，嘴角略下垂（五条悟的冷淡表情）
      ctx2.strokeStyle = "rgba(120,62,58,0.8)";
      ctx2.lineWidth = Math.max(1, s * 0.014);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.38, s * 0.75);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.785, s * 0.62, s * 0.75);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(150,96,92,0.28)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.88, s * 0.09, s * 0.03, 0, 0, Math.PI * 2);
      ctx2.fill();
      fineNoise(ctx2, s, 220, 0.05, true);
    });
  }

  // 五条悟面部（六眼态）：青色六眼 + 冷白睫毛
  function texGojoFaceEyes(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#edd6c2";
      ctx2.fillRect(0, 0, s, s);
      edgeShade(ctx2, s, 0.5);
      // 眼窝阴影
      ctx2.fillStyle = "rgba(116,80,78,0.34)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.29, s * 0.27, s * 0.18, s * 0.085, -0.06, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.ellipse(s * 0.71, s * 0.27, s * 0.18, s * 0.085, 0.06, 0, Math.PI * 2);
      ctx2.fill();
      paintEye(ctx2, s, s * 0.29, s * 0.27, s * 0.085, s * 0.052, "#7ff0ff", "#0d5c86", true);
      paintEye(ctx2, s, s * 0.71, s * 0.27, s * 0.085, s * 0.052, "#7ff0ff", "#0d5c86", true);
      // 白眉（细而挑）
      ctx2.strokeStyle = "rgba(250,252,255,0.92)";
      ctx2.lineWidth = Math.max(1, s * 0.016);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.19, s * 0.16);
      ctx2.quadraticCurveTo(s * 0.29, s * 0.125, s * 0.39, s * 0.155);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.81, s * 0.16);
      ctx2.quadraticCurveTo(s * 0.71, s * 0.125, s * 0.61, s * 0.155);
      ctx2.stroke();
      // 鼻
      ctx2.strokeStyle = "rgba(150,104,96,0.5)";
      ctx2.lineWidth = Math.max(1, s * 0.011);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.5, s * 0.4);
      ctx2.lineTo(s * 0.5, s * 0.56);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(126,86,80,0.4)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.58, s * 0.05, s * 0.026, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 嘴：淡淡的一点弧度
      ctx2.strokeStyle = "rgba(120,62,58,0.75)";
      ctx2.lineWidth = Math.max(1, s * 0.013);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.39, s * 0.76);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.79, s * 0.61, s * 0.76);
      ctx2.stroke();
      fineNoise(ctx2, s, 220, 0.05, true);
    });
  }

  // 眼罩：黑布 + 中央压光 + 上下缝线（五条悟标志物）
  function texGojoBlindfold(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#0b0d16";
      ctx2.fillRect(0, 0, s, s);
      // 布的走向：沿 u 方向的暗纹
      for (let i = 0; i < 26; i++) {
        ctx2.fillStyle = i % 2 ? "rgba(255,255,255,0.022)" : "rgba(0,0,0,0.25)";
        ctx2.fillRect(0, (i / 26) * s, s, s / 26);
      }
      // 中段压光：一块很淡的冷色反光，让眼罩不是死黑
      const g = ctx2.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "rgba(160,190,230,0.05)");
      g.addColorStop(0.32, "rgba(190,215,255,0.16)");
      g.addColorStop(0.5, "rgba(120,150,190,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s);
      // 上下缝线
      ctx2.strokeStyle = "rgba(150,170,200,0.35)";
      ctx2.lineWidth = Math.max(1, s * 0.008);
      ctx2.beginPath();
      ctx2.moveTo(0, s * 0.08);
      ctx2.lineTo(s, s * 0.08);
      ctx2.moveTo(0, s * 0.92);
      ctx2.lineTo(s, s * 0.92);
      ctx2.stroke();
      // 缝线针脚
      ctx2.strokeStyle = "rgba(190,210,240,0.22)";
      ctx2.lineWidth = Math.max(1, s * 0.006);
      for (let i = 0; i < 22; i++) {
        const x = (i + 0.5) / 22 * s;
        ctx2.beginPath();
        ctx2.moveTo(x, s * 0.055);
        ctx2.lineTo(x, s * 0.105);
        ctx2.moveTo(x, s * 0.895);
        ctx2.lineTo(x, s * 0.945);
        ctx2.stroke();
      }
      // 一侧的结（五条悟把眼罩在脑后打结，正面露出一点点褶皱）
      ctx2.fillStyle = "rgba(0,0,0,0.55)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.5, s * 0.16, s * 0.05, 0, 0, Math.PI * 2);
      ctx2.fill();
      fineNoise(ctx2, s, 320, 0.07, false);
    });
  }

  // 宿傩面部：黑纹面 + 猩红眼 + 眼下弧线
  function texSukunaFace(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#e9cbb4";
      ctx2.fillRect(0, 0, s, s);
      edgeShade(ctx2, s, 0.55);
      // 眼窝加深
      ctx2.fillStyle = "rgba(96,60,58,0.42)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.29, s * 0.27, s * 0.19, s * 0.09, -0.05, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.ellipse(s * 0.71, s * 0.27, s * 0.19, s * 0.09, 0.05, 0, Math.PI * 2);
      ctx2.fill();
      paintEye(ctx2, s, s * 0.29, s * 0.27, s * 0.09, s * 0.05, "#ff3b25", "#5c0a0c", true);
      paintEye(ctx2, s, s * 0.71, s * 0.27, s * 0.09, s * 0.05, "#ff3b25", "#5c0a0c", true);
      // ---- 面部纹身（宿傩的记号）----
      ctx2.strokeStyle = "rgba(12,10,14,0.95)";
      ctx2.lineCap = "round";
      ctx2.lineWidth = Math.max(1, s * 0.019);
      // 额上的两道纵纹
      ctx2.beginPath();
      ctx2.moveTo(s * 0.42, s * 0.06);
      ctx2.lineTo(s * 0.42, s * 0.17);
      ctx2.moveTo(s * 0.58, s * 0.06);
      ctx2.lineTo(s * 0.58, s * 0.17);
      ctx2.stroke();
      // 眉上的横纹
      ctx2.lineWidth = Math.max(1, s * 0.015);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.16, s * 0.15);
      ctx2.lineTo(s * 0.38, s * 0.1);
      ctx2.moveTo(s * 0.84, s * 0.15);
      ctx2.lineTo(s * 0.62, s * 0.1);
      ctx2.stroke();
      // 眼下弧线（左右各一条，向外挑）
      ctx2.lineWidth = Math.max(1, s * 0.016);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.2, s * 0.38);
      ctx2.quadraticCurveTo(s * 0.29, s * 0.48, s * 0.4, s * 0.42);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.8, s * 0.38);
      ctx2.quadraticCurveTo(s * 0.71, s * 0.48, s * 0.6, s * 0.42);
      ctx2.stroke();
      // 颊侧竖纹
      ctx2.lineWidth = Math.max(1, s * 0.013);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.1, s * 0.3);
      ctx2.lineTo(s * 0.12, s * 0.62);
      ctx2.moveTo(s * 0.9, s * 0.3);
      ctx2.lineTo(s * 0.88, s * 0.62);
      ctx2.stroke();
      // 下颌的曲纹
      ctx2.lineWidth = Math.max(1, s * 0.017);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.31, s * 0.72);
      ctx2.quadraticCurveTo(s * 0.39, s * 0.95, s * 0.5, s * 0.97);
      ctx2.quadraticCurveTo(s * 0.61, s * 0.95, s * 0.69, s * 0.72);
      ctx2.stroke();
      // 鼻与嘴
      ctx2.strokeStyle = "rgba(122,70,64,0.55)";
      ctx2.lineWidth = Math.max(1, s * 0.011);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.5, s * 0.42);
      ctx2.lineTo(s * 0.5, s * 0.55);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(112,58,54,0.42)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.57, s * 0.05, s * 0.026, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 冷笑：一边嘴角上扬
      ctx2.strokeStyle = "rgba(96,40,38,0.85)";
      ctx2.lineWidth = Math.max(1, s * 0.015);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.4, s * 0.76);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.78, s * 0.62, s * 0.71);
      ctx2.stroke();
      fineNoise(ctx2, s, 220, 0.05, true);
    });
  }

  // 宿傩·真身额头眼（第二对眼的贴片纹理）
  function texSukunaEyePair(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#d9b79f";
      ctx2.fillRect(0, 0, s, s);
      // 贴片上排两个眼，横向铺满 → 画布上均匀排布
      paintEye(ctx2, s, s * 0.14, s * 0.5, s * 0.085, s * 0.048, "#ff5a2a", "#6b0d0a", true);
      paintEye(ctx2, s, s * 0.86, s * 0.5, s * 0.085, s * 0.048, "#ff5a2a", "#6b0d0a", true);
      fineNoise(ctx2, s, 120, 0.05, true);
    });
  }

  // 和服：白底 + 黑色线纹 + 织物颗粒（宿傩）
  function texSukunaKimono(size) {
    return paintTexture(size, (ctx2, s) => {
      ctx2.fillStyle = "#f4efe4";
      ctx2.fillRect(0, 0, s, s);
      // 布纹：细密的斜纹
      ctx2.globalAlpha = 0.07;
      ctx2.strokeStyle = "#6b6152";
      ctx2.lineWidth = 1;
      for (let i = -s; i < s * 2; i += Math.max(3, s * 0.02)) {
        ctx2.beginPath();
        ctx2.moveTo(i, 0);
        ctx2.lineTo(i + s, s);
        ctx2.stroke();
      }
      ctx2.globalAlpha = 1;
      // 宿傩和服上的墨色纹样：粗竖条 + 细横条
      ctx2.strokeStyle = "#141419";
      ctx2.lineWidth = Math.max(1, s * 0.018);
      for (let i = 0; i < 3; i++) {
        const x = s * (0.16 + i * 0.34);
        ctx2.beginPath();
        ctx2.moveTo(x, -s * 0.1);
        ctx2.lineTo(x + s * 0.09, s * 1.1);
        ctx2.stroke();
      }
      ctx2.lineWidth = Math.max(1, s * 0.01);
      for (let i = 0; i < 4; i++) {
        const y = s * (0.14 + i * 0.26);
        ctx2.beginPath();
        ctx2.moveTo(0, y);
        ctx2.lineTo(s, y);
        ctx2.stroke();
      }
      // 织物颗粒
      fineNoise(ctx2, s, 420, 0.06, true);
      fineNoise(ctx2, s, 260, 0.05, false);
    }, { repeat: [2, 2] });
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
      ctx2.fillStyle = "#000000";
      ctx2.fillRect(0, 0, s, s);
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
    let vN = 0, iN = 0;
    for (const p of parts) {
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
    for (const p of parts) {
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
    for (let i = cap; i >= 0; i--) {
      const a = i / cap * Math.PI * 0.5;
      pts.push([-len - Math.sin(a) * rBot * 0.6, Math.cos(a) * rBot]);
    }
    pts.push([-len * 0.58, (rTop + rBot) * 0.5 * b]);
    for (let i = 0; i <= cap; i++) {
      const a = i / cap * Math.PI * 0.5;
      pts.push([Math.sin(a) * rTop * 0.45, Math.cos(a) * rTop]);
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
  function spherePatch(r, phiCenter, phiLen, thetaStart, thetaLen, q, wSeg) {
    return new SphereGeometry(
      r,
      Math.max(6, wSeg || q.radial),
      Math.max(4, q.seg * 2),
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
