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
  function paintEye(ctx2, s, cx, cy, rx, ry, iris, irisDark, glow) {
    ctx2.save();
    // 眼窝阴影
    ctx2.fillStyle = "rgba(88,56,58,0.34)";
    ctx2.beginPath();
    ctx2.ellipse(cx, cy - ry * 0.16, rx * 1.24, ry * 1.5, 0, 0, Math.PI * 2);
    ctx2.fill();
    // 眼白
    ctx2.fillStyle = "#f6f3f0";
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
      skinBase(ctx2, s, "#f2ddc8", "#d8b9a4");
      edgeShade(ctx2, s, 0.62);
      // 眼罩下沿的投影，让脸和布之间不是硬接缝
      const g = ctx2.createLinearGradient(0, s * 0.3, 0, s * 0.46);
      g.addColorStop(0, "rgba(40,28,34,0.55)");
      g.addColorStop(1, "rgba(40,28,34,0)");
      ctx2.fillStyle = g;
      ctx2.fillRect(0, 0, s, s * 0.46);
      // 鼻：中轴亮、两侧暗，鼻头一点高光
      ctx2.fillStyle = "rgba(255,250,244,0.28)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.5, s * 0.028, s * 0.085, 0, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "rgba(150,104,96,0.34)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.44, s * 0.545, s * 0.016, s * 0.03, 0.3, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.beginPath();
      ctx2.ellipse(s * 0.56, s * 0.545, s * 0.016, s * 0.03, -0.3, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "rgba(120,74,68,0.34)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.585, s * 0.05, s * 0.022, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 嘴：薄唇，嘴角略平（冷淡）
      ctx2.strokeStyle = "rgba(122,58,54,0.85)";
      ctx2.lineCap = "round";
      ctx2.lineWidth = Math.max(1, s * 0.016);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.4, s * 0.72);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.745, s * 0.6, s * 0.72);
      ctx2.stroke();
      ctx2.fillStyle = "rgba(160,96,92,0.22)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.855, s * 0.075, s * 0.028, 0, 0, Math.PI * 2);
      ctx2.fill();
      fineNoise(ctx2, s, 200, 0.045, true);
    });
  }

  // 五条悟面部（六眼）：青色六眼，眼神冷
  function texGojoFaceEyes(size) {
    return paintTexture(size, (ctx2, s) => {
      skinBase(ctx2, s, "#f2ddc8", "#d8b9a4");
      edgeShade(ctx2, s, 0.62);
      paintEye(ctx2, s, s * 0.285, s * 0.4, s * 0.095, s * 0.056, "#79e8ff", "#0a4f78", true);
      paintEye(ctx2, s, s * 0.715, s * 0.4, s * 0.095, s * 0.056, "#79e8ff", "#0a4f78", true);
      // 白眉：细、挑
      ctx2.strokeStyle = "rgba(252,253,255,0.95)";
      ctx2.lineCap = "round";
      ctx2.lineWidth = Math.max(1, s * 0.018);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.19, s * 0.3);
      ctx2.quadraticCurveTo(s * 0.29, s * 0.255, s * 0.39, s * 0.29);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.81, s * 0.3);
      ctx2.quadraticCurveTo(s * 0.71, s * 0.255, s * 0.61, s * 0.29);
      ctx2.stroke();
      // 鼻
      ctx2.fillStyle = "rgba(255,250,244,0.26)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.53, s * 0.026, s * 0.075, 0, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "rgba(126,86,80,0.32)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.6, s * 0.048, s * 0.02, 0, 0, Math.PI * 2);
      ctx2.fill();
      // 嘴
      ctx2.strokeStyle = "rgba(122,58,54,0.8)";
      ctx2.lineWidth = Math.max(1, s * 0.015);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.4, s * 0.73);
      ctx2.quadraticCurveTo(s * 0.5, s * 0.752, s * 0.6, s * 0.73);
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
      g.addColorStop(0, "rgba(120,150,200,0.10)");
      g.addColorStop(0.28, "rgba(190,215,255,0.30)");
      g.addColorStop(0.42, "rgba(150,180,230,0.10)");
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
      paintEye(ctx2, s, s * 0.285, s * 0.33, s * 0.092, s * 0.05, "#ff3a22", "#4d0808", true);
      paintEye(ctx2, s, s * 0.715, s * 0.33, s * 0.092, s * 0.05, "#ff3a22", "#4d0808", true);
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
      ctx2.lineWidth = Math.max(1, s * 0.016);
      ctx2.beginPath();
      ctx2.moveTo(s * 0.17, s * 0.44);
      ctx2.quadraticCurveTo(s * 0.28, s * 0.55, s * 0.41, s * 0.47);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(s * 0.83, s * 0.44);
      ctx2.quadraticCurveTo(s * 0.72, s * 0.55, s * 0.59, s * 0.47);
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
      ctx2.fillStyle = "rgba(112,58,54,0.34)";
      ctx2.beginPath();
      ctx2.ellipse(s * 0.5, s * 0.6, s * 0.046, s * 0.02, 0, 0, Math.PI * 2);
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
      paintEye(ctx2, s, s * 0.2, s * 0.5, s * 0.1, s * 0.055, "#ff5a2a", "#5c0a08", true);
      paintEye(ctx2, s, s * 0.8, s * 0.5, s * 0.1, s * 0.055, "#ff5a2a", "#5c0a08", true);
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
      ctx2.fillStyle = "rgba(20,20,26,0.85)";
      ctx2.fillRect(s * 0.5, 0, s * 0.055, s);
      ctx2.fillRect(0, s * 0.5, s, s * 0.028);
      ctx2.fillStyle = "rgba(20,20,26,0.35)";
      ctx2.fillRect(s * 0.16, 0, s * 0.02, s);
      ctx2.fillRect(s * 0.84, 0, s * 0.02, s);
      // 织物颗粒
      fineNoise(ctx2, s, 480, 0.05, true);
      fineNoise(ctx2, s, 300, 0.04, false);
    }, { repeat: [1, 1] });
  }

