  // ============================================================================
  //  src/city.js —— 新宿 · 夜晚十字路口（战场城市）
  //  ---------------------------------------------------------------------------
  //  职责：
  //    1. 道路：十字路口 / 四向斑马线 / 停止线 / 车道线 / 中央黄线 / 导向箭头 / 路缘石
  //    2. 街区：沿街店铺楼群 + 街区内部塔楼 + 屋顶设备 + 招牌霓虹 + 大型广告屏
  //    3. 街道设施：路灯（含地面光池）/ 信号灯 / 护栏 / 系止柱 / 自动贩卖机 / 杂物 / 车辆
  //    4. 战损：碎石堆 / 钢筋 / 裂痕贴花 / 扬尘
  //    5. 大气：夜空穹顶 / 雾 / 远近两层天际线 / 环境浮尘
  //  对外接口（契约）：createCity(opts) -> { group, buildings, update(t,dt), dispose() }
  //  ---------------------------------------------------------------------------
  //  坐标约定：X 向东、Z 向北，十字路口位于原点；日本靠左行驶，
  //  因此 +Z 北向车流走 x<0 一侧，-Z 南向车流走 x>0 一侧。
  // ============================================================================
  var TAU = Math.PI * 2;
  var DEFAULT_SEED = 20240514;
  var GROUND_SIZE = 400;

  // ---- 道路尺度（米）----
  var ROAD_HALF = 12;                       // 车行道半宽：大道 24m = 双向 6 车道
  var WALK_W = 6.5;                         // 人行道宽
  var BLOCK_IN = ROAD_HALF + WALK_W;        // 18：街区临街立面起点
  var BLOCK_PITCH = 62;                     // 街区（含巷子）进深
  var BLOCK_GAP = 8;                        // 街区之间巷子宽
  var BLOCK_SPAN = BLOCK_PITCH - BLOCK_GAP; // 街区实体尺寸
  var BLOCK_ROWS = 3;                       // 每个象限 3×3 个街区
  var CROSS_W = 4.6;                        // 人行横道条带进深（沿行车方向）
  var CROSS_IN = ROAD_HALF + 1.2;           // 13.2：人行横道靠路口一侧
  var LANE_W = 4;                           // 单车道宽
  var CURB_H = 0.22;                        // 路缘石高
  var MARK_Y = 0.035;                       // 标线离地高度（避免与路面 z-fighting）
  var ASPHALT_TILE = 20;                    // 沥青贴图覆盖的实际尺寸（米）

  // ---- 建筑尺度（米）----
  var FACADE_BAYS = 4;                      // 立面贴图横向 4 开间
  var FACADE_FLOORS = 6;                    // 立面贴图纵向 6 层
  var BAY_W = 3.2;
  var FLOOR_H = 3.6;
  var FACADE_TILE_W = FACADE_BAYS * BAY_W;
  var FACADE_TILE_H = FACADE_FLOORS * FLOOR_H;
  var SHOP_H = 5.4;                         // 店铺层高（店铺贴图一格对应 5.4m）
  var SHOP_W = 8;                           // 店铺贴图一格对应 8m
  var COLLAPSE_TIME = 1.2;                  // 建筑倒塌动画时长（秒）

  var QUALITY = {
    low: {
      buildings: 54, neon: 46, lamps: 44, debris: 90,
      tex: 256, facadePx: 256, shopPx: 512, neonPx: 512,
      atlasCols: 4, atlasRows: 2,
      godray: false, skyline: false, screens: 1,
      ambientDust: 130, dustPool: 240, fogDensity: 34e-4,
      wires: 0, rebar: 18, rails: 34, cars: 5, decals: 12,
      vending: 4, clutter: 16, signals: true
    },
    medium: {
      buildings: 92, neon: 104, lamps: 76, debris: 240,
      tex: 512, facadePx: 512, shopPx: 1024, neonPx: 1024,
      atlasCols: 8, atlasRows: 4,
      godray: true, skyline: true, screens: 3,
      ambientDust: 220, dustPool: 420, fogDensity: 40e-4,
      wires: 90, rebar: 40, rails: 66, cars: 9, decals: 22,
      vending: 8, clutter: 30, signals: true
    },
    high: {
      buildings: 138, neon: 168, lamps: 108, debris: 430,
      tex: 512, facadePx: 512, shopPx: 1024, neonPx: 1024,
      atlasCols: 8, atlasRows: 4,
      godray: true, skyline: true, screens: 4,
      ambientDust: 320, dustPool: 620, fogDensity: 46e-4,
      wires: 140, rebar: 62, rails: 96, cars: 14, decals: 30,
      vending: 12, clutter: 44, signals: true
    }
  };

  // 霓虹配色（冷暖对比：粉 / 青 / 琥珀 / 紫 / 绯 / 白）
  var NEON_COLORS = [
    C.NEON_PINK, C.NEON_CYAN, C.NEON_AMBER, C.CRIMSON, C.AZURE,
    C.CYAN, C.SCARLET, C.VIOLET, C.GOLD, C.WHITE
  ];
  // 窗户灯光（偏暖，少量冷色）
  var WINDOW_COLORS = [C.NEON_AMBER, C.GOLD, 16769727, C.NEON_CYAN, C.WHITE, 16768256];
  // 招牌用词（日式街景词汇，保证一眼是日本街头）
  var SIGN_WORDS = [
    "新宿", "歌舞伎町", "ラーメン", "居酒屋", "焼肉", "カラオケ", "パチンコ", "喫茶",
    "寿司", "薬局", "二十四時間", "駐車場", "劇場", "酒", "麺", "龍",
    "神", "呪", "闇", "東京", "電脳", "大盛", "雀荘", "焼鳥",
    "牛丼", "天ぷら", "会館", "ビル", "地下", "歓楽街", "呪術", "領域",
    "宿儺", "五条", "SAKE", "RAMEN", "NEON", "CLUB", "TOKYO", "OPEN",
    "24H", "PACHINKO", "HOTEL", "BAR", "KARAOKE"
  ];
  // 店铺招牌短词（店铺层横幅用）
  var SHOP_NAMES = [
    "ラーメン 大盛", "居酒屋 呪", "カラオケ 24H", "喫茶 新宿", "焼肉 龍", "寿司 神",
    "パチンコ 東京", "薬局 地下", "雀荘 闇", "コインランドリー", "牛丼 早い安い", "焼鳥 煙",
    "BAR 深夜", "天ぷら 会館", "ネットカフェ", "定食 大衆", "うどん 讃岐", "そば 更科",
    "中華 獅子", "餃子 王", "海鮮 浜", "カレー 辛", "コーヒー 焙煎", "洋菓子 甘",
    "花屋 華", "書店 文", "質屋 銀", "模型 鉄", "湯 銭", "美容室 髪",
    "整体 骨", "歯科 白", "眼科 瞳", "不動産 家", "旅館 宿", "クラブ 華",
    "スナック 月", "喫茶 灯", "電器 光", "古書 頁"
  ];
  var BUCKET_KEYS = ["A", "B", "C", "D"];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = a + 1831565813 >>> 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const n = mulberry32(seed);
    return {
      next: n,
      range: (a, b) => a + (b - a) * n(),
      pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(n() * arr.length))],
      chance: (p) => n() < p,
      sign: () => n() < 0.5 ? -1 : 1
    };
  }
  var clamp2 = (v, a, b) => v < a ? a : v > b ? b : v;
  var lerp2 = (a, b, t) => a + (b - a) * t;
  function hex(n) {
    const s = (n >>> 0).toString(16);
    return "#" + "000000".slice(s.length) + s;
  }
  function rgba(n, a) {
    const r = n >> 16 & 255;
    const g = n >> 8 & 255;
    const b = n & 255;
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  // 平铺绘制：把画在边界上的内容同时画到对侧，保证贴图无缝
  function wrapAt(ctx2, w, h, x, y, margin, draw) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const px2 = x + ox * w;
        const py2 = y + oy * h;
        if (px2 < -margin || px2 > w + margin || py2 < -margin || py2 > h + margin) continue;
        ctx2.save();
        ctx2.translate(px2 - x, py2 - y);
        draw();
        ctx2.restore();
      }
    }
  }
  function paintAsphalt(ctx2, w, h, rng, baseColor, grain) {
    ctx2.fillStyle = hex(baseColor);
    ctx2.fillRect(0, 0, w, h);
    const grains = ["#0d0f16", "#1b1e29", "#22252f", "#101219"];
    for (let i = 0; i < grain; i++) {
      const x = rng.next() * w;
      const y = rng.next() * h;
      const r = 0.6 + rng.next() * 2.1;
      ctx2.fillStyle = grains[rng.next() * grains.length | 0];
      wrapAt(ctx2, w, h, x, y, r + 2, () => {
        ctx2.beginPath();
        ctx2.arc(x, y, r, 0, TAU);
        ctx2.fill();
      });
    }
  }
  function paintCracks(ctx2, w, h, rng, count, color, width) {
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width;
    ctx2.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const x0 = rng.next() * w;
      const y0 = rng.next() * h;
      let ang = rng.next() * TAU;
      const segs = 3 + (rng.next() * 5 | 0);
      const pts = [[x0, y0]];
      let cx = x0;
      let cy = y0;
      for (let s = 0; s < segs; s++) {
        ang += (rng.next() - 0.5) * 1.3;
        const len = 5 + rng.next() * 26;
        cx += Math.cos(ang) * len;
        cy += Math.sin(ang) * len;
        pts.push([cx, cy]);
      }
      wrapAt(ctx2, w, h, x0, y0, 140, () => {
        ctx2.beginPath();
        ctx2.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) ctx2.lineTo(pts[k][0], pts[k][1]);
        ctx2.stroke();
      });
    }
  }
  function paintOil(ctx2, w, h, rng, count) {
    for (let i = 0; i < count; i++) {
      const x = rng.next() * w;
      const y = rng.next() * h;
      const r = (2 + rng.next() * 5) * (w / 512) * 8;
      const g = ctx2.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(0.6, "rgba(0,0,0,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = g;
      wrapAt(ctx2, w, h, x, y, r + 2, () => ctx2.fillRect(x - r, y - r, r * 2, r * 2));
    }
  }
  function paintManhole(ctx2, x, y, r) {
    ctx2.fillStyle = "rgba(28,30,38,0.95)";
    ctx2.beginPath();
    ctx2.arc(x, y, r, 0, TAU);
    ctx2.fill();
    ctx2.strokeStyle = "rgba(120,128,150,0.35)";
    ctx2.lineWidth = Math.max(1, r * 0.12);
    ctx2.beginPath();
    ctx2.arc(x, y, r * 0.92, 0, TAU);
    ctx2.stroke();
    ctx2.beginPath();
    ctx2.arc(x, y, r * 0.55, 0, TAU);
    ctx2.stroke();
  }

  // ---------------------------------------------------------------------------
  //  沥青路面（可平铺）：底色比原先提亮一档，避免「纯黑占满屏幕」
  // ---------------------------------------------------------------------------
  function makeAsphaltTex(cv, px2, rng) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    paintAsphalt(ctx2, px2, px2, rng, 4343375, Math.round(px2 * 5));
    // 大块补丁：老路面修补后深浅不一
    for (let i = 0; i < 7; i++) {
      const w = rng.range(0.18, 0.5) * px2;
      const h = rng.range(0.14, 0.42) * px2;
      const x = rng.next() * px2;
      const y = rng.next() * px2;
      const v = rng.range(-0.24, 0.3);
      ctx2.fillStyle = v > 0 ? "rgba(150,156,176," + (v * 0.62).toFixed(3) + ")" : "rgba(0,0,0," + (-v * 0.7).toFixed(3) + ")";
      wrapAt(ctx2, px2, px2, x, y, 4, () => ctx2.fillRect(x, y, w, h));
      ctx2.strokeStyle = "rgba(8,9,14,0.6)";
      ctx2.lineWidth = Math.max(1, px2 * 0.004);
      wrapAt(ctx2, px2, px2, x, y, 4, () => ctx2.strokeRect(x, y, w, h));
    }
    // 细砂粒：给近景一点颗粒感
    for (let i = 0; i < px2 * 10; i++) {
      const x = rng.next() * px2;
      const y = rng.next() * px2;
      const s = 0.6 + rng.next() * 1.6;
      const v = rng.next();
      ctx2.fillStyle = v < 0.45 ? "rgba(168,174,196," + (0.1 + v * 0.3).toFixed(3) + ")" : "rgba(0,0,0," + (0.16 + rng.next() * 0.36).toFixed(3) + ")";
      wrapAt(ctx2, px2, px2, x, y, s + 2, () => ctx2.fillRect(x, y, s, s));
    }
    paintOil(ctx2, px2, px2, rng, 6);
    paintCracks(ctx2, px2, px2, rng, 26, "rgba(0,0,0,0.6)", Math.max(1, px2 * 0.005));
    paintCracks(ctx2, px2, px2, rng, 30, "rgba(122,130,152,0.13)", Math.max(1, px2 * 0.002));
    for (let i = 0; i < 2; i++) {
      paintManhole(ctx2, rng.next() * px2, rng.next() * px2, px2 * 0.028);
    }
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  人行道地砖（可平铺）：浅灰混凝土砖，和沥青拉开明度差
  // ---------------------------------------------------------------------------
  function makeWalkTex(cv, px2, rng) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    ctx2.fillStyle = "#494c55";
    ctx2.fillRect(0, 0, px2, px2);
    const tiles = 8;                 // 8 格 → 覆盖 8m，一格 1m
    const step = px2 / tiles;
    for (let i = 0; i < tiles; i++) {
      for (let j = 0; j < tiles; j++) {
        const v = rng.range(-0.055, 0.075);
        ctx2.fillStyle = v > 0 ? "rgba(255,250,240," + v.toFixed(3) + ")" : "rgba(0,0,0," + (-v).toFixed(3) + ")";
        ctx2.fillRect(i * step, j * step, step, step);
      }
    }
    ctx2.strokeStyle = "rgba(18,20,26,0.85)";
    ctx2.lineWidth = Math.max(1, px2 * 0.005);
    for (let i = 0; i <= tiles; i++) {
      ctx2.beginPath();
      ctx2.moveTo(i * step, 0);
      ctx2.lineTo(i * step, px2);
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(0, i * step);
      ctx2.lineTo(px2, i * step);
      ctx2.stroke();
    }
    for (let i = 0; i < px2 * 6; i++) {
      const x = rng.next() * px2;
      const y = rng.next() * px2;
      const v = rng.next();
      ctx2.fillStyle = v < 0.5 ? "rgba(0,0,0," + (0.04 + v * 0.16).toFixed(3) + ")" : "rgba(214,216,224," + (0.03 + v * 0.1).toFixed(3) + ")";
      const s = 1 + rng.next() * 2.2;
      wrapAt(ctx2, px2, px2, x, y, s + 2, () => ctx2.fillRect(x, y, s, s));
    }
    for (let i = 0; i < 5; i++) {
      const x = rng.next() * px2;
      const y = rng.next() * px2;
      const r = rng.range(0.06, 0.2) * px2;
      const g = ctx2.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,0.3)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = g;
      wrapAt(ctx2, px2, px2, x, y, r + 2, () => ctx2.fillRect(x - r, y - r, r * 2, r * 2));
    }
    paintCracks(ctx2, px2, px2, rng, 12, "rgba(20,22,30,0.5)", Math.max(1, px2 * 0.004));
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  路缘石贴图：浅色花岗岩带分缝
  // ---------------------------------------------------------------------------
  function makeCurbTex(cv, rng) {
    const canvas2 = cv(256, 64);
    const ctx2 = canvas2.getContext("2d");
    ctx2.fillStyle = "#6b6f78";
    ctx2.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 900; i++) {
      const v = rng.next();
      ctx2.fillStyle = v < 0.5 ? "rgba(255,255,255," + (v * 0.16).toFixed(3) + ")" : "rgba(0,0,0," + ((v - 0.5) * 0.4).toFixed(3) + ")";
      ctx2.fillRect(rng.next() * 256, rng.next() * 64, 1 + rng.next() * 3, 1 + rng.next() * 2);
    }
    ctx2.strokeStyle = "rgba(24,26,32,0.75)";
    ctx2.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx2.beginPath();
      ctx2.moveTo(i * 64, 0);
      ctx2.lineTo(i * 64, 64);
      ctx2.stroke();
    }
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  磨损噪点（标线乘法叠加用，避免「矢量图」般干净）
  // ---------------------------------------------------------------------------
  function makeGrungeTex(cv, px2, rng) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    ctx2.fillStyle = "#ededed";
    ctx2.fillRect(0, 0, px2, px2);
    for (let i = 0; i < px2 * 3; i++) {
      const a = rng.range(0.02, 0.3);
      ctx2.fillStyle = "rgba(0,0,0," + a.toFixed(3) + ")";
      const s = 1 + rng.next() * 6;
      const x = rng.next() * px2;
      const y = rng.next() * px2;
      wrapAt(ctx2, px2, px2, x, y, s + 2, () => ctx2.fillRect(x, y, s, s * (0.4 + rng.next())));
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * px2;
      const y = rng.next() * px2;
      const r = rng.range(0.05, 0.22) * px2;
      const g = ctx2.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0," + rng.range(0.1, 0.35).toFixed(2) + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2.fillStyle = g;
      wrapAt(ctx2, px2, px2, x, y, r + 2, () => ctx2.fillRect(x - r, y - r, r * 2, r * 2));
    }
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  沥青修补补丁贴花：路面上"挖补过"的深色方块，近景最能体现路面材质
  // ---------------------------------------------------------------------------
  function makePatchTexture(cv, px2, rng) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    ctx2.clearRect(0, 0, px2, px2);
    const w = px2 * 0.9;
    const h = px2 * 0.7;
    const x = (px2 - w) / 2;
    const y = (px2 - h) / 2;
    // 先画一块「挖补」再整体羽化：硬边矩形在夜里会读成"地上贴了黑纸"（Lead 报的硬边黑矩形）
    ctx2.fillStyle = "rgba(12,13,18,0.5)";
    ctx2.fillRect(x, y, w, h);
    for (let i = 0; i < px2 * 2.2; i++) {
      const px3 = x + rng.next() * w;
      const py3 = y + rng.next() * h;
      ctx2.fillStyle = rng.next() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
      ctx2.fillRect(px3, py3, 1 + rng.next() * 4, 1 + rng.next() * 3);
    }
    // 很淡的接缝（不再是硬黑描边）
    ctx2.strokeStyle = "rgba(0,0,0,0.18)";
    ctx2.lineWidth = Math.max(2, px2 * 0.012);
    ctx2.strokeRect(x, y, w, h);
    // 羽化：用 destination-in 乘一层径向 alpha，四角与四边全部渐隐
    ctx2.globalCompositeOperation = "destination-in";
    const feather = ctx2.createRadialGradient(px2 / 2, px2 / 2, 0, px2 / 2, px2 / 2, Math.max(w, h) * 0.62);
    feather.addColorStop(0, "rgba(255,255,255,1)");
    feather.addColorStop(0.62, "rgba(255,255,255,0.92)");
    feather.addColorStop(0.86, "rgba(255,255,255,0.35)");
    feather.addColorStop(1, "rgba(255,255,255,0)");
    ctx2.fillStyle = feather;
    ctx2.fillRect(0, 0, px2, px2);
    ctx2.globalCompositeOperation = "source-over";
    paintCracks(ctx2, px2, px2, rng, 10, "rgba(0,0,0,0.7)", Math.max(1, px2 * 0.006));
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  径向贴图：白色 RGB + 径向 alpha，靠材质 color 决定当接地阴影还是光晕
  // ---------------------------------------------------------------------------
  function makeAoTexture(cv, px2) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    const g = ctx2.createRadialGradient(px2 / 2, px2 / 2, 0, px2 / 2, px2 / 2, px2 / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.72)");
    g.addColorStop(0.78, "rgba(255,255,255,0.24)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, px2, px2);
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  建筑立面（albedo + 自发光两张）
  //  一张贴图 = 4 开间 × 6 层 = 12.8m × 21.6m，实例化时由着色器换算 UV 米数
  // ---------------------------------------------------------------------------
  function makeFacadePair(cv, px2, rng, opt) {
    const albedo = cv(px2, px2);
    const glow = cv(px2, px2);
    const a = albedo.getContext("2d");
    const g = glow.getContext("2d");
    const cw = px2 / FACADE_BAYS;
    const chh = px2 / FACADE_FLOORS;
    const tone = opt.shell;
    a.fillStyle = hex(tone);
    a.fillRect(0, 0, px2, px2);
    // 混凝土颗粒 / 竖向雨痕
    const grains = ["rgba(0,0,0,0.14)", "rgba(255,255,255,0.07)", "rgba(0,0,0,0.08)", "rgba(140,150,170,0.06)"];
    for (let i = 0; i < px2 * 4; i++) {
      a.fillStyle = grains[rng.next() * grains.length | 0];
      a.fillRect(rng.next() * px2, rng.next() * px2, 1 + rng.next() * 3, 1 + rng.next() * 2);
    }
    for (let i = 0; i < 30; i++) {
      const x = rng.next() * px2;
      a.fillStyle = "rgba(8,10,16," + (0.04 + rng.next() * 0.12).toFixed(3) + ")";
      a.fillRect(x, 0, 1 + rng.next() * 5, px2);
    }
    g.fillStyle = "#000000";
    g.fillRect(0, 0, px2, px2);
    const litCol = new Color();
    for (let f = 0; f < FACADE_FLOORS; f++) {
      const fy = f * chh;
      // 每层楼板：亮色混凝土压条 + 下方阴影缝
      a.fillStyle = hex(opt.band);
      a.fillRect(0, fy, px2, chh * 0.15);
      a.fillStyle = "rgba(255,255,255,0.06)";
      a.fillRect(0, fy, px2, chh * 0.022);
      a.fillStyle = "rgba(4,5,10,0.7)";
      a.fillRect(0, fy + chh * 0.15, px2, chh * 0.05);
      for (let bx = 0; bx < FACADE_BAYS; bx++) {
        const fx2 = bx * cw;
        // 竖向柱
        a.fillStyle = hex(opt.pier);
        a.fillRect(fx2, fy, cw * 0.13, chh);
        a.fillStyle = "rgba(255,255,255,0.05)";
        a.fillRect(fx2 + cw * 0.105, fy, cw * 0.02, chh);
        const wx = fx2 + cw * 0.23;
        const wy = fy + chh * 0.34;
        const ww = cw * 0.56;
        const wh = chh * 0.46;
        // 玻璃：下暗上亮，模拟夜天光反射
        const grad = a.createLinearGradient(0, wy, 0, wy + wh);
        grad.addColorStop(0, opt.glassTop);
        grad.addColorStop(0.55, opt.glassMid);
        grad.addColorStop(1, opt.glassBot);
        a.fillStyle = grad;
        a.fillRect(wx, wy, ww, wh);
        // 窗框
        a.strokeStyle = "rgba(12,14,20,0.9)";
        a.lineWidth = Math.max(1, px2 * 0.004);
        a.strokeRect(wx, wy, ww, wh);
        a.beginPath();
        a.moveTo(wx + ww * 0.5, wy);
        a.lineTo(wx + ww * 0.5, wy + wh);
        a.stroke();
        a.fillStyle = "rgba(0,0,0,0.5)";
        a.fillRect(wx, wy + wh, ww, chh * 0.06);
        const pick2 = rng.next();
        if (pick2 < opt.litRate) {
          // 亮灯：色温有暖有冷，亮度随机，少数窗户拉上窗帘
          const col = rng.pick(opt.windowColors);
          litCol.setHex(col);
          const bright = 0.3 + rng.next() * 0.42;
          const r = Math.round((litCol.r * 0.62 + 0.38) * 255 * bright);
          const gg = Math.round((litCol.g * 0.62 + 0.38) * 255 * bright);
          const bb = Math.round((litCol.b * 0.62 + 0.38) * 255 * bright);
          const core = "rgb(" + r + "," + gg + "," + bb + ")";
          g.fillStyle = "rgba(" + r + "," + gg + "," + bb + ",0.26)";
          g.fillRect(wx - ww * 0.3, wy - wh * 0.3, ww * 1.6, wh * 1.6);
          g.fillStyle = core;
          g.fillRect(wx, wy, ww, wh);
          if (rng.chance(0.35)) {
            g.fillStyle = "rgba(0,0,0,0.6)";
            const slats = 2 + (rng.next() * 3 | 0);
            for (let s = 0; s < slats; s++) {
              g.fillRect(wx, wy + wh / slats * s, ww, wh / slats * 0.44);
            }
          }
          if (rng.chance(0.18)) {
            // 室内人影：一条暗竖条
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(wx + ww * rng.range(0.2, 0.7), wy + wh * 0.35, ww * 0.12, wh * 0.65);
          }
        } else if (pick2 > 1 - opt.darkRate) {
          // 破窗 / 遮挡
          a.fillStyle = "#04060b";
          a.fillRect(wx, wy, ww, wh);
          a.fillStyle = "rgba(140,150,170,0.16)";
          for (let s = 0; s < 3; s++) {
            a.fillRect(wx + rng.next() * ww, wy + rng.next() * wh, ww * 0.2, wh * 0.16);
          }
        }
        if (opt.acRate > 0 && f > 0 && rng.chance(opt.acRate)) {
          // 空调外机
          const ax = wx + ww * rng.range(0.55, 0.75);
          const ay = wy + wh + chh * 0.02;
          a.fillStyle = "#5a6069";
          a.fillRect(ax, ay, ww * 0.3, chh * 0.12);
          a.fillStyle = "rgba(0,0,0,0.45)";
          a.fillRect(ax, ay, ww * 0.3, chh * 0.04);
        }
      }
    }
    // 顶部女儿墙 LED 灯带（新宿高层常见）
    if (opt.cornice) {
      g.fillStyle = rgba(opt.corniceColor, 0.85);
      g.fillRect(0, 0, px2, px2 * 0.012);
      g.fillStyle = rgba(opt.corniceColor, 0.25);
      g.fillRect(0, px2 * 0.012, px2, px2 * 0.02);
    }
    // 底部：店铺灯光溢出，让楼体下部不至于死黑
    const bottom = g.createLinearGradient(0, px2, 0, px2 * 0.78);
    bottom.addColorStop(0, "rgba(255,176,92,0.3)");
    bottom.addColorStop(1, "rgba(255,176,92,0)");
    g.fillStyle = bottom;
    g.fillRect(0, px2 * 0.78, px2, px2 * 0.22);
    // 战损：黑斑与缺口
    if (opt.damaged > 0) {
      a.fillStyle = "rgba(4,5,9,0.85)";
      for (let i = 0; i < Math.round(opt.damaged * 5); i++) {
        const x = rng.next() * px2;
        const y = rng.next() * px2;
        a.beginPath();
        a.moveTo(x, y);
        a.lineTo(x + rng.range(-cw * 0.7, cw * 0.7), y + rng.range(-chh * 0.5, chh * 0.5));
        a.lineTo(x + rng.range(-cw * 0.7, cw * 0.7), y + rng.range(-chh * 0.5, chh * 0.5));
        a.closePath();
        a.fill();
      }
    }
    return { albedo, glow };
  }

  // ---------------------------------------------------------------------------
  //  店铺层图集：一格 = 8m × 5.4m 的沿街店面（暖光内景 + 招牌横额）
  // ---------------------------------------------------------------------------
  function makeShopAtlas(cv, size, cols, rows, rng) {
    const canvas2 = cv(size, size);
    const ctx2 = canvas2.getContext("2d");
    ctx2.fillStyle = "#0a0b10";
    ctx2.fillRect(0, 0, size, size);
    const cw = size / cols;
    const chh = size / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = c * cw;
        const oy = r * chh;
        const kind = [0, 1, 2, 0, 3, 1, 4, 2, 0, 1, 2, 3, 0, 1, 4, 2][(r * cols + c) % 16];
        const warm = kind === 0 ? "#ffcf8a" : kind === 1 ? "#ffb066" : kind === 2 ? "#fff2d0" : kind === 3 ? "#ff7ab0" : "#a8e8ff";
        const dim = kind === 0 ? "#7a4418" : kind === 1 ? "#6b3410" : kind === 2 ? "#5a5a44" : kind === 3 ? "#5c1440" : "#12485c";
        ctx2.save();
        ctx2.translate(ox, oy);
        ctx2.fillStyle = "#15161c";
        ctx2.fillRect(0, 0, cw, chh);
        // 招牌横额
        const bandH = chh * 0.22;
        ctx2.fillStyle = "#0c0d12";
        ctx2.fillRect(0, 0, cw, bandH);
        ctx2.strokeStyle = dim;
        ctx2.lineWidth = Math.max(1.5, cw * 0.012);
        ctx2.strokeRect(cw * 0.03, bandH * 0.14, cw * 0.94, bandH * 0.72);
        const name = SHOP_NAMES[(r * cols * 5 + c * 3 + 7) % SHOP_NAMES.length];
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        const fs = Math.min(bandH * 0.52, cw * 0.9 / Math.max(3, name.length));
        ctx2.font = "bold " + fs.toFixed(1) + "px 'Noto Sans JP','Yu Gothic','Hiragino Kaku Gothic ProN',sans-serif";
        ctx2.shadowColor = warm;
        ctx2.shadowBlur = fs * 0.9;
        ctx2.fillStyle = warm;
        ctx2.fillText(name, cw / 2, bandH * 0.5);
        ctx2.shadowBlur = 0;
        ctx2.fillStyle = "rgba(255,255,255,0.85)";
        ctx2.fillText(name, cw / 2, bandH * 0.5);
        // 玻璃内景
        const gx = cw * 0.06;
        const gy = bandH * 1.06;
        const gw = cw * 0.88;
        const gh = chh - gy - chh * 0.05;
        const grad = ctx2.createLinearGradient(0, gy, 0, gy + gh);
        grad.addColorStop(0, warm);
        grad.addColorStop(0.35, dim);
        grad.addColorStop(1, "#0a0a10");
        ctx2.fillStyle = grad;
        ctx2.fillRect(gx, gy, gw, gh);
        // 内部剪影：货架 / 吧台 / 人影
        ctx2.fillStyle = "rgba(0,0,0,0.55)";
        for (let i = 0; i < 4; i++) {
          ctx2.fillRect(gx + gw * rng.range(0.02, 0.72), gy + gh * rng.range(0.35, 0.8), gw * rng.range(0.08, 0.22), gh * rng.range(0.12, 0.5));
        }
        ctx2.fillStyle = "rgba(0,0,0,0.7)";
        ctx2.fillRect(gx, gy + gh * 0.72, gw, gh * 0.1);
        for (let i = 0; i < 2; i++) {
          if (rng.chance(0.6)) {
            ctx2.fillStyle = "rgba(0,0,0,0.75)";
            const px3 = gx + gw * rng.range(0.1, 0.85);
            ctx2.fillRect(px3, gy + gh * 0.42, gw * 0.05, gh * 0.56);
            ctx2.beginPath();
            ctx2.arc(px3 + gw * 0.025, gy + gh * 0.4, gw * 0.03, 0, TAU);
            ctx2.fill();
          }
        }
        // 门
        ctx2.fillStyle = "#07080c";
        ctx2.fillRect(gx + gw * 0.78, gy + gh * 0.2, gw * 0.2, gh * 0.8);
        ctx2.fillStyle = rgba(C.NEON_CYAN, 0.5);
        ctx2.fillRect(gx + gw * 0.78, gy + gh * 0.2, gw * 0.2, gh * 0.02);
        // 遮阳篷
        if (rng.chance(0.45)) {
          ctx2.fillStyle = "rgba(0,0,0,0.85)";
          ctx2.fillRect(0, bandH * 0.98, cw, chh * 0.05);
          ctx2.fillStyle = rgba(rng.chance(0.5) ? C.CRIMSON : C.AZURE, 0.65);
          for (let i = 0; i < 8; i++) {
            ctx2.fillRect(i * cw / 8, bandH * 0.98, cw / 16, chh * 0.05);
          }
        }
        // 框架压暗
        ctx2.fillStyle = "rgba(0,0,0,0.55)";
        ctx2.fillRect(0, 0, cw * 0.03, chh);
        ctx2.fillRect(cw * 0.97, 0, cw * 0.03, chh);
        ctx2.restore();
      }
    }
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  霓虹招牌图集：竖排（竖招牌）与横排（横招牌）各一张
  // ---------------------------------------------------------------------------
  function makeNeonAtlas(cv, size, cols, rows, vertical, rng) {
    const canvas2 = cv(size, size);
    const ctx2 = canvas2.getContext("2d");
    ctx2.clearRect(0, 0, size, size);
    const cw = size / cols;
    const chh = size / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = c * cw;
        const oy = r * chh;
        const colorHex = rng.pick(NEON_COLORS);
        const color = hex(colorHex);
        const word = rng.pick(SIGN_WORDS);
        ctx2.save();
        ctx2.translate(ox, oy);
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        const pad = Math.min(cw, chh) * 0.06;
        ctx2.fillStyle = "rgba(10,11,16,0.82)";
        ctx2.fillRect(pad * 0.4, pad * 0.4, cw - pad * 0.8, chh - pad * 0.8);
        ctx2.lineWidth = Math.max(1.5, Math.min(cw, chh) * 0.04);
        ctx2.strokeStyle = rgba(colorHex, 0.35);
        ctx2.strokeRect(pad, pad, cw - pad * 2, chh - pad * 2);
        ctx2.lineWidth = Math.max(1, Math.min(cw, chh) * 0.018);
        ctx2.strokeStyle = color;
        ctx2.strokeRect(pad, pad, cw - pad * 2, chh - pad * 2);
        const chars = Array.from(word.trim());
        const n = Math.max(1, chars.length);
        ctx2.shadowColor = color;
        if (vertical) {
          const fs = Math.min(cw * 0.6, chh * 0.78 / n);
          ctx2.font = "bold " + fs.toFixed(1) + "px 'Noto Sans JP','Yu Gothic','Hiragino Kaku Gothic ProN',sans-serif";
          const total = fs * 1.06 * n;
          let y = chh / 2 - total / 2 + fs * 0.53;
          for (let i = 0; i < n; i++) {
            ctx2.shadowBlur = fs * 1.1;
            ctx2.fillStyle = color;
            ctx2.fillText(chars[i], cw / 2, y);
            ctx2.shadowBlur = 0;
            ctx2.fillStyle = "rgba(255,255,255,0.92)";
            ctx2.fillText(chars[i], cw / 2, y);
            y += fs * 1.06;
          }
        } else {
          const fs = Math.min(chh * 0.44, cw * 0.86 / n);
          ctx2.font = "bold " + fs.toFixed(1) + "px 'Noto Sans JP','Yu Gothic','Hiragino Kaku Gothic ProN',sans-serif";
          ctx2.shadowBlur = fs * 0.9;
          ctx2.fillStyle = color;
          ctx2.fillText(word, cw / 2, chh * 0.46);
          ctx2.shadowBlur = 0;
          ctx2.fillStyle = "rgba(255,255,255,0.9)";
          ctx2.fillText(word, cw / 2, chh * 0.46);
          ctx2.fillStyle = rgba(colorHex, 0.8);
          ctx2.font = "bold " + (fs * 0.3).toFixed(1) + "px 'Noto Sans JP',sans-serif";
          ctx2.fillText("新宿 · SHINJUKU", cw / 2, chh * 0.8);
        }
        ctx2.restore();
      }
    }
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  大型广告屏：4 帧循环（着色器切帧 + 扫描线）
  // ---------------------------------------------------------------------------
  function makeScreenTexture(cv, size, rng) {
    const frames = 4;
    const canvas2 = cv(size * frames, size);
    const ctx2 = canvas2.getContext("2d");
    const palette = [C.NEON_PINK, C.NEON_CYAN, C.VIOLET, C.CRIMSON, C.AZURE, C.GOLD];
    const words = ["新宿", "呪", "决战", "領域", "解", "茈", "無量空処", "伏魔御厨子"];
    ctx2.fillStyle = hex(C.INK);
    ctx2.fillRect(0, 0, size * frames, size);
    for (let f = 0; f < frames; f++) {
      const ox = f * size;
      const c0 = palette[(f * 2 + 1) % palette.length];
      const c1 = palette[(f * 2 + 4) % palette.length];
      ctx2.save();
      ctx2.translate(ox, 0);
      const grad = ctx2.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, rgba(c0, 0.95));
      grad.addColorStop(0.55, rgba(C.INK, 0.92));
      grad.addColorStop(1, rgba(c1, 0.85));
      ctx2.fillStyle = grad;
      ctx2.fillRect(0, 0, size, size);
      for (let i = 0; i < 8; i++) {
        ctx2.fillStyle = rgba(C.WHITE, 0.04 + rng.next() * 0.09);
        ctx2.fillRect(0, rng.next() * size, size, size * (8e-3 + rng.next() * 0.03));
      }
      const word = words[(f * 3 + 2) % words.length];
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      ctx2.font = "bold " + (size * 0.4).toFixed(1) + "px 'Noto Sans JP','Yu Gothic',sans-serif";
      ctx2.shadowColor = hex(c0);
      ctx2.shadowBlur = size * 0.14;
      ctx2.fillStyle = rgba(C.WHITE, 0.95);
      ctx2.fillText(word, size / 2, size * 0.46);
      ctx2.shadowBlur = 0;
      ctx2.font = "bold " + (size * 0.085).toFixed(1) + "px sans-serif";
      ctx2.fillStyle = rgba(c1, 0.95);
      ctx2.fillText("SHINJUKU — SHOWDOWN", size / 2, size * 0.83);
      ctx2.restore();
    }
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  自动贩卖机正面图集：夜色里最标志性的暖色方块
  // ---------------------------------------------------------------------------
  function makeVendAtlas(cv, size, cols, rows, rng) {
    const canvas2 = cv(size, size);
    const ctx2 = canvas2.getContext("2d");
    const cw = size / cols;
    const chh = size / rows;
    const brands = [
      ["#d01f2f", "#ffffff"], ["#1f6fd0", "#ffffff"], ["#f2b705", "#3a2000"],
      ["#1fae62", "#ffffff"], ["#e8e8ee", "#c01f2f"], ["#6a2fd0", "#ffffff"]
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = c * cw;
        const oy = r * chh;
        const b = brands[(r * cols + c) % brands.length];
        ctx2.save();
        ctx2.translate(ox, oy);
        ctx2.fillStyle = "#0d0e13";
        ctx2.fillRect(0, 0, cw, chh);
        ctx2.fillStyle = b[0];
        ctx2.fillRect(cw * 0.06, chh * 0.04, cw * 0.88, chh * 0.13);
        ctx2.fillStyle = b[1];
        ctx2.fillRect(cw * 0.12, chh * 0.09, cw * 0.3, chh * 0.035);
        const g0 = ctx2.createLinearGradient(0, chh * 0.2, 0, chh * 0.8);
        g0.addColorStop(0, "rgba(255,255,255,0.95)");
        g0.addColorStop(1, "rgba(255,236,200,0.35)");
        ctx2.fillStyle = g0;
        ctx2.fillRect(cw * 0.08, chh * 0.2, cw * 0.84, chh * 0.6);
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 5; j++) {
            ctx2.fillStyle = ["#e04b3a", "#3aa0e0", "#f0c419", "#4bc07a", "#e8e8f0", "#c04bd0"][(i * 5 + j + r) % 6];
            ctx2.fillRect(cw * (0.12 + j * 0.16), chh * (0.24 + i * 0.19), cw * 0.11, chh * 0.14);
            ctx2.fillStyle = "rgba(255,255,255,0.35)";
            ctx2.fillRect(cw * (0.12 + j * 0.16), chh * (0.24 + i * 0.19), cw * 0.11, chh * 0.03);
          }
        }
        ctx2.fillStyle = "#101116";
        ctx2.fillRect(cw * 0.08, chh * 0.82, cw * 0.84, chh * 0.14);
        ctx2.fillStyle = "rgba(255,255,255,0.5)";
        ctx2.fillRect(cw * 0.14, chh * 0.86, cw * 0.2, chh * 0.03);
        ctx2.restore();
      }
    }
    return canvas2;
  }

  function makeGlowTexture(cv, px2) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    const g = ctx2.createRadialGradient(px2 / 2, px2 / 2, 0, px2 / 2, px2 / 2, px2 / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.62)");
    g.addColorStop(0.55, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, px2, px2);
    return canvas2;
  }
  function makePoolTexture(cv, px2) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    const g = ctx2.createRadialGradient(px2 / 2, px2 / 2, 0, px2 / 2, px2 / 2, px2 / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.36)");
    g.addColorStop(0.55, "rgba(255,255,255,0.06)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, px2, px2);
    return canvas2;
  }
  function makeShaftTexture(cv, px2) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    ctx2.clearRect(0, 0, px2, px2);
    const rows = 56;
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows;
      const y = i / rows * px2;
      const h = px2 / rows + 1;
      // 沿街暖雾的元凶就是把「宽 + 亮」的圆锥一层层加法叠起来：
      // 这里把锥体收窄（0.455→0.30）、亮度按 (1-t)^1.8 快速衰减，
      // 只在灯头附近留一段真正像光锥的内容，底部基本归零。
      const halfW = (0.04 + 0.32 * t) * px2;
      const alpha = Math.pow(1 - t, 1.7) * 0.95;
      const grad = ctx2.createLinearGradient(px2 / 2 - halfW, 0, px2 / 2 + halfW, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255," + alpha.toFixed(3) + ")");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx2.fillStyle = grad;
      ctx2.fillRect(px2 / 2 - halfW, y, halfW * 2, h);
    }
    return canvas2;
  }
  function makeCrackDecalTexture(cv, px2, rng) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    ctx2.clearRect(0, 0, px2, px2);
    const g = ctx2.createRadialGradient(px2 / 2, px2 / 2, 0, px2 / 2, px2 / 2, px2 * 0.08);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx2.fillStyle = g;
    ctx2.fillRect(0, 0, px2, px2);
    paintCracks(ctx2, px2, px2, rng, 16, "rgba(0,0,0,0.8)", Math.max(1, px2 * 0.006));
    paintCracks(ctx2, px2, px2, rng, 34, "rgba(0,0,0,0.45)", Math.max(1, px2 * 0.0022));
    return canvas2;
  }
  function makeHelipadTexture(cv, px2) {
    const canvas2 = cv(px2, px2);
    const ctx2 = canvas2.getContext("2d");
    ctx2.clearRect(0, 0, px2, px2);
    ctx2.strokeStyle = rgba(C.GOLD, 0.85);
    ctx2.lineWidth = px2 * 0.06;
    ctx2.beginPath();
    ctx2.arc(px2 / 2, px2 / 2, px2 * 0.42, 0, TAU);
    ctx2.stroke();
    ctx2.fillStyle = rgba(C.WHITE, 0.8);
    ctx2.font = "bold " + (px2 * 0.5).toFixed(1) + "px sans-serif";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillText("H", px2 / 2, px2 / 2);
    return canvas2;
  }

  // ---------------------------------------------------------------------------
  //  材质工厂
  // ---------------------------------------------------------------------------
  function makeScreenMaterial(texture) {
    return new ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uFrames: { value: 4 },
        uFrame: { value: 0 },
        uTime: { value: 0 },
        uTint: { value: new Color(C.WHITE) }
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
      fragmentShader: `
      uniform sampler2D uMap;
      uniform float uFrames;
      uniform float uFrame;
      uniform float uTime;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        float f = floor( uFrame );
        vec2 uv = vec2( ( vUv.x + f ) / uFrames, vUv.y );
        vec3 col = texture2D( uMap, uv ).rgb;
        float scan = 0.84 + 0.16 * sin( vUv.y * 420.0 + uTime * 6.0 );
        float band = smoothstep( 0.0, 0.06, fract( vUv.y * 1.0 - uTime * 0.25 ) );
        col *= scan * ( 0.88 + 0.12 * band );
        float flick = 0.94 + 0.06 * sin( uTime * 37.0 );
        gl_FragColor = vec4( col * uTint * flick, 1.0 );
      }
    `,
      fog: false,
      side: DoubleSide,
      toneMapped: true
    });
  }
  function addWhiteColors(geom) {
    const n = geom.attributes.position.count;
    const arr = new Float32Array(n * 3).fill(1);
    geom.setAttribute("color", new Float32BufferAttribute(arr, 3));
    return geom;
  }
  function unitBox() {
    const g = new BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  }
  // 立面 UV：把「实例缩放后的米数」换算成贴图格数，避免为了 UV 正确而按尺寸分桶
  var FACADE_UV_FN = `
uniform vec2 uCityTile;
vec2 cityFacadeUv( vec2 auv, vec3 an ) {
  vec3 sc = vec3( 1.0 );
  #ifdef USE_INSTANCING
    sc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
  #endif
  vec3 aa = abs( an );
  vec2 mm;
  if ( aa.x >= aa.y && aa.x >= aa.z ) mm = vec2( auv.x * sc.z, auv.y * sc.y );
  else if ( aa.y >= aa.z ) mm = vec2( auv.x * sc.x, auv.y * sc.z );
  else mm = vec2( auv.x * sc.x, auv.y * sc.y );
  return mm / uCityTile;
}
`;
  function applyFacadeUv(mat, tw, th) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCityTile = { value: new Vector2(tw, th) };
      shader.vertexShader = FACADE_UV_FN + shader.vertexShader.replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\n\tvMapUv = cityFacadeUv( uv, normal );"
      );
    };
    mat.customProgramCacheKey = () => "city-facade-uv";
    return mat;
  }
  // 建筑：albedo 用 Lambert（受环境光影响），自发光窗户用 Basic 加法混合
  function makeFacadeMaterials(pair, tw, th) {
    const body = new MeshLambertMaterial({ map: pair.albedo, color: 16777215, vertexColors: true });
    applyFacadeUv(body, tw, th);
    const glow = new MeshBasicMaterial({
      map: pair.glow,
      color: 16777215,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      fog: true
    });
    applyFacadeUv(glow, tw, th);
    return { body, glow };
  }
  // ---------------------------------------------------------------------------
  //  湿路掠射反光：并入已有 Lambert 材质（不新增 draw call）
  //  原理：视线越掠射，湿沥青越像镜面，把天光与霓虹"糊"在路面上；
  //  用 (1 - |dot(视线, 法线)|) 的幂次当权重，叠一点偏暖的城市辉光色。
  //  low 档传 amt = 0：uniform 归零，仍是同一个 program，不增加任何开销。
  // ---------------------------------------------------------------------------
  function applyWetShader(mat, amt, tint) {
    const col = new Color(tint);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWetAmt = { value: amt };
      shader.uniforms.uWetColor = { value: col };
      shader.fragmentShader = "uniform float uWetAmt;\nuniform vec3 uWetColor;\n" + shader.fragmentShader.replace(
        "#include <tonemapping_fragment>",
        [
          "float wetGraze = 1.0 - abs( dot( normalize( vViewPosition ), normalize( vNormal ) ) );",
          "float wetSpec = pow( clamp( wetGraze, 0.0, 1.0 ), 3.2 ) * uWetAmt;",
          "gl_FragColor.rgb += uWetColor * wetSpec;",
          "#include <tonemapping_fragment>"
        ].join("\n")
      );
    };
    mat.customProgramCacheKey = () => "city-wet-" + amt.toFixed(2);
    return mat;
  }

  // ---------------------------------------------------------------------------
  //  加法图层随距离衰减：把「几十层加法叠成一片暖雾」的根源掐掉
  //  近处（≤near）保持完整，远处（≥far）完全消失 —— 近景光斑观感不变。
  //  low 档可以把 far 设得很小，直接等效关闭（仍然是同一个 mesh / draw call）。
  // ---------------------------------------------------------------------------
  function applyDistanceFade(mat, near, far) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFadeNear = { value: near };
      shader.uniforms.uFadeFar = { value: far };
      shader.vertexShader = "varying float vCityDist;\n" + shader.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n\tvCityDist = length( mvPosition.xyz );"
      );
      shader.fragmentShader = "uniform float uFadeNear;\nuniform float uFadeFar;\nvarying float vCityDist;\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n\tdiffuseColor.a *= 1.0 - smoothstep( uFadeNear, uFadeFar, vCityDist );"
      );
    };
    mat.customProgramCacheKey = () => "city-distfade-" + near + "-" + far;
    return mat;
  }

  // 图集材质：用实例属性 aCell 选格子（霓虹 / 店铺 / 贩卖机共用）
  function makeAtlasMaterial(map, cols, rows, opt) {
    const o = opt || {};
    const mat = new MeshBasicMaterial({
      map,
      transparent: o.transparent !== false,
      blending: o.additive ? AdditiveBlending : NormalBlending,
      depthWrite: o.depthWrite === void 0 ? false : o.depthWrite,
      side: DoubleSide,
      vertexColors: true,
      fog: true,
      alphaTest: o.alphaTest || 0
    });
    const cell = new Vector2(1 / cols, 1 / rows);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCellSize = { value: cell };
      shader.vertexShader = "uniform vec2 uCellSize;\nattribute vec2 aCell;\n" + shader.vertexShader.replace(
        "#include <uv_vertex>",
        "#ifdef USE_MAP\n\tvMapUv = ( uv + aCell ) * uCellSize;\n#endif"
      );
    };
    mat.customProgramCacheKey = () => "city-atlas";
    return mat;
  }
  function makeGlowInstancedMaterial(map, opt) {
    const o = opt || {};
    return new MeshBasicMaterial({
      map,
      transparent: true,
      blending: o.additive === false ? NormalBlending : AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      fog: true
    });
  }
  var BILLBOARD_CHUNK = `
vec4 bbCenter = vec4( 0.0, 0.0, 0.0, 1.0 );
vec3 bbScale = vec3( 1.0 );
#ifdef USE_INSTANCING
  bbCenter = instanceMatrix * bbCenter;
  bbScale = vec3(
    length( instanceMatrix[ 0 ].xyz ),
    length( instanceMatrix[ 1 ].xyz ),
    length( instanceMatrix[ 2 ].xyz )
  );
#endif
vec4 mvPosition = modelViewMatrix * bbCenter;
mvPosition.xy += position.xy * bbScale.xy;
vBillboardDist = length( mvPosition.xyz );
gl_Position = projectionMatrix * mvPosition;
`;
  function makeBillboardMaterial(map, color, opt) {
    const o = opt || {};
    const mat = new MeshBasicMaterial({
      map,
      color,
      transparent: true,
      blending: o.additive === false ? NormalBlending : AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: true
    });
    // 距离衰减：近处（≤fadeNear）保持完整观感，远处（≥fadeFar）完全消失。
    // 沿街平视时中段之所以糊成暖雾，就是几十个远处光锥叠在同一片像素上；
    // 近处那盏灯的光锥不受影响，所以"单灯光斑观感"不会变弱。
    const fadeNear = o.fadeNear === void 0 ? 18 : o.fadeNear;
    const fadeFar = o.fadeFar === void 0 ? 52 : o.fadeFar;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFadeNear = { value: fadeNear };
      shader.uniforms.uFadeFar = { value: fadeFar };
      shader.vertexShader = "varying float vBillboardDist;\n" + shader.vertexShader.replace("#include <project_vertex>", BILLBOARD_CHUNK);
      shader.fragmentShader = "uniform float uFadeNear;\nuniform float uFadeFar;\nvarying float vBillboardDist;\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n\tdiffuseColor.a *= 1.0 - smoothstep( uFadeNear, uFadeFar, vBillboardDist );"
      );
    };
    mat.customProgramCacheKey = () => "city-billboard-" + fadeNear + "-" + fadeFar;
    return mat;
  }

  // ---------------------------------------------------------------------------
  //  道路标线：全部用几何体绘制（一次 draw call、任意距离都锐利、永不与路面打架）
  //  —— 四向斑马线 / 停止线 / 车道虚线 / 中央双黄线 / 路面导向箭头 / 点字砖
  // ---------------------------------------------------------------------------
  function makeAccum() {
    return { pos: [], col: [], uv: [], idx: [], vi: 0 };
  }
  function accQuad(acc, pts, y, c, wear) {
    const i0 = acc.vi;
    for (let i = 0; i < 4; i++) {
      acc.pos.push(pts[i][0], y, pts[i][1]);
      acc.col.push(c[0] * wear, c[1] * wear, c[2] * wear);
      acc.uv.push(pts[i][0] * 0.25, pts[i][1] * 0.25);
    }
    acc.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    acc.vi += 4;
  }
  // 轴对齐矩形（中心 + 尺寸），wear 做「磨损不均」的明度抖动
  function accRect(acc, cx, cz, w, d, y, c, wear) {
    const hw = w / 2;
    const hd = d / 2;
    accQuad(acc, [
      [cx - hw, cz - hd],
      [cx - hw, cz + hd],
      [cx + hw, cz + hd],
      [cx + hw, cz - hd]
    ], y, c, wear);
  }
  function accTri(acc, a, b2, c2, y, c, wear) {
    const i0 = acc.vi;
    const pts = [a, b2, c2];
    for (let i = 0; i < 3; i++) {
      acc.pos.push(pts[i][0], y, pts[i][1]);
      acc.col.push(c[0] * wear, c[1] * wear, c[2] * wear);
      acc.uv.push(pts[i][0] * 0.25, pts[i][1] * 0.25);
    }
    acc.idx.push(i0, i0 + 1, i0 + 2);
    acc.vi += 3;
  }
  // 斑马线：横跨某条大道的整幅路宽，条纹方向与该大道车流方向一致（日本式）
  function accCrosswalk(acc, axis, side, rng, white) {
    const inner = ROAD_HALF + 1.2;
    const outer = inner + CROSS_W;
    const bandC = (inner + outer) / 2 * side;
    const barW = 0.46;
    const gap = 0.5;
    const span = ROAD_HALF - 0.2;
    if (axis === "z") {
      for (let u = -span; u <= span; u += barW + gap) {
        accRect(acc, u, bandC, barW, CROSS_W, MARK_Y, white, 0.86 + rng.next() * 0.14);
      }
    } else {
      for (let u = -span; u <= span; u += barW + gap) {
        accRect(acc, bandC, u, CROSS_W, barW, MARK_Y, white, 0.86 + rng.next() * 0.14);
      }
    }
  }
  // 导向箭头：kind = 'straight' | 'left'
  function accArrow(acc, x, z, rot, kind, white) {
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    const P = (u, v) => [x + u * ca - v * sa, z + u * sa + v * ca];
    const put = (pts, wear) => accQuad(acc, pts, MARK_Y, white, wear);
    // 杆
    put([P(-0.16, -1.6), P(-0.16, 0.9), P(0.16, 0.9), P(0.16, -1.6)], 0.95);
    put([P(-0.5, 0.75), P(-0.5, 1.1), P(0.5, 1.1), P(0.5, 0.75)], 0.95);
    accTri(acc, P(-0.62, 1.05), P(0.62, 1.05), P(0, 2.1), MARK_Y, white, 0.95);
    if (kind === "left") {
      put([P(0.16, 0.2), P(0.62, 0.2), P(0.62, 1.16), P(0.16, 1.16)], 0.95);
      put([P(0.5, 0.2), P(0.5, 0.62), P(1.03, 0.62), P(1.03, 0.2)], 0.95);
      accTri(acc, P(0.95, 0.02), P(0.95, 0.8), P(1.56, 0.41), MARK_Y, white, 0.95);
    }
  }
  function buildRoadMarkings(rng) {
    const acc = makeAccum();
    const white = [0.84, 0.84, 0.8];
    const yellow = [0.88, 0.68, 0.13];
    const walkC = [0.72, 0.62, 0.24];
    const edge = CROSS_IN + CROSS_W + 1.2;
    // ---- 四向斑马线（横跨哪条路，条纹就与那条路的车流同向）----
    accCrosswalk(acc, "z", 1, rng, white);
    accCrosswalk(acc, "z", -1, rng, white);
    accCrosswalk(acc, "x", 1, rng, white);
    accCrosswalk(acc, "x", -1, rng, white);
    // ---- 停止线：日本靠左行驶，南向车流走 x>0，停止线画在路口北侧 ----
    const sw = ROAD_HALF - 0.4;
    accRect(acc, sw / 2 + 0.2, edge, sw - 0.2, 0.45, MARK_Y, white, 0.95);
    accRect(acc, -(sw / 2 + 0.2), -edge, sw - 0.2, 0.45, MARK_Y, white, 0.95);
    accRect(acc, -edge, sw / 2 + 0.2, 0.45, sw - 0.2, MARK_Y, white, 0.95);
    accRect(acc, edge, -(sw / 2 + 0.2), 0.45, sw - 0.2, MARK_Y, white, 0.95);
    // ---- 中央双黄线 ----
    for (const s of [1, -1]) {
      for (const o of [-0.34, 0.34]) {
        accRect(acc, o, s * (edge + 95), 0.16, 190, MARK_Y, yellow, s > 0 ? 0.95 : 0.9);
        accRect(acc, s * (edge + 95), o, 190, 0.16, MARK_Y, yellow, s > 0 ? 0.95 : 0.9);
      }
    }
    // ---- 车道虚线（每侧 3 车道 → ±4 / ±8 处）----
    const dash = 4;
    const gap2 = 5;
    for (const s of [1, -1]) {
      for (const lane of [4, 8]) {
        for (const off of [lane, -lane]) {
          for (let u = edge; u < 196; u += dash + gap2) {
            const d2 = Math.min(dash, 196 - u);
            if (d2 < 1) break;
            accRect(acc, off, s * (u + d2 / 2), 0.15, d2, MARK_Y, white, 0.82);
            accRect(acc, s * (u + d2 / 2), off, d2, 0.15, MARK_Y, white, 0.82);
          }
        }
      }
      // ---- 路缘白实线 ----
      accRect(acc, s * (ROAD_HALF - 0.35), s * 107, 0.18, 176, MARK_Y, white, 0.8);
      accRect(acc, s * 107, s * (ROAD_HALF - 0.35), 176, 0.18, MARK_Y, white, 0.8);
    }
    // ---- 路面导向箭头：四条进口道（左转道在最外侧，符合靠左行驶）----
    for (const s of [1, -1]) {
      const z2 = -s * (edge + 4);
      accArrow(acc, 10, z2, 0, "left", white);
      accArrow(acc, 6, z2, 0, "straight", white);
      accArrow(acc, 2, z2, 0, "straight", white);
      accArrow(acc, -10, -z2, 0, "left", white);
      accArrow(acc, -6, -z2, 0, "straight", white);
      accArrow(acc, -2, -z2, 0, "straight", white);
      const x2 = -s * (edge + 4);
      accArrow(acc, x2, -2, 0, "straight", white);
      accArrow(acc, x2, -6, 0, "straight", white);
      accArrow(acc, x2, -10, 0, "left", white);
      accArrow(acc, -x2, 2, 0, "straight", white);
      accArrow(acc, -x2, 6, 0, "straight", white);
      accArrow(acc, -x2, 10, 0, "left", white);
    }
    // ---- 路口内的导流点线：四条进口道穿过路口的车道引导线 ----
    const guide = [0.62, 0.62, 0.6];
    for (const s of [1, -1]) {
      for (const lane of [2, 6, 10]) {
        for (let u = 12.4; u < ROAD_HALF + 1; u += 3.4) {
          accRect(acc, lane, s * u, 0.13, 1.8, MARK_Y, guide, 0.8);
          accRect(acc, -lane, s * u, 0.13, 1.8, MARK_Y, guide, 0.8);
          accRect(acc, s * u, lane, 1.8, 0.13, MARK_Y, guide, 0.8);
          accRect(acc, s * u, -lane, 1.8, 0.13, MARK_Y, guide, 0.8);
        }
      }
    }
    // ---- 点字砖（斑马线两端人行道上的黄色导盲砖）----
    const tY = CURB_H + 0.02;
    for (const s of [1, -1]) {
      for (const a of [-1, 1]) {
        for (const o of [1.4, 3.0, 4.6]) {
          accRect(acc, a * (ROAD_HALF + o), s * (CROSS_IN + CROSS_W / 2), 1.3, 0.7, tY, walkC, 0.9);
          accRect(acc, s * (CROSS_IN + CROSS_W / 2), a * (ROAD_HALF + o), 0.7, 1.3, tY, walkC, 0.9);
        }
      }
    }
    return acc;
  }

  // ---------------------------------------------------------------------------
  //  街区与建筑：沿街成排、立面齐平在 x/z = ±18 的临街面上，街区内部放高层塔楼
  //  —— 这样才能形成「街道峡谷」，而不是「漂浮的白盒子」
  // ---------------------------------------------------------------------------
  function buildBlocks(rng) {
    const specs = [];
    const push = (x, z, w, d, h, dirs, tag) => {
      specs.push({
        id: specs.length,
        x,
        z,
        w,
        d,
        h,
        rotY: 0,
        dirs,
        tag,
        dist: Math.hypot(x, z),
        litRate: rng.range(0.2, 0.5)
      });
    };
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        for (let bi = 0; bi < BLOCK_ROWS; bi++) {
          for (let bj = 0; bj < BLOCK_ROWS; bj++) {
            const K = BLOCK_IN + bi * BLOCK_PITCH;
            const M = BLOCK_IN + bj * BLOCK_PITCH;
            const S = BLOCK_SPAN;
            const near = bi === 0 && bj === 0;   // 路口四角街区最重要
            const mid = bi + bj === 1;
            const wx = (lx) => sx * (K + lx);
            const wz = (lz) => sz * (M + lz);
            // 本街区的占位表：同一街区内禁止任何两个足迹相交
            // （塔楼原本是随机落位，实测出现 31 对重叠、最大重叠面积 320m²）
            const placed = [];
            const fits = (lx0, lz0, lx1, lz1) => {
              for (let q = 0; q < placed.length; q++) {
                const p = placed[q];
                if (lx0 < p[2] && lx1 > p[0] && lz0 < p[3] && lz1 > p[1]) return false;
              }
              return true;
            };
            const mk = (lx0, lz0, lx1, lz1, h, tag) => {
              if (!fits(lx0, lz0, lx1, lz1)) return false;
              placed.push([lx0, lz0, lx1, lz1]);
              const w = lx1 - lx0;
              const d = lz1 - lz0;
              const dirs = [];
              if (lx0 === 0) dirs.push({ nx: -sx, nz: 0, avenue: bi === 0 });
              if (lx1 === S) dirs.push({ nx: sx, nz: 0, avenue: false });
              if (lz0 === 0) dirs.push({ nx: 0, nz: -sz, avenue: bj === 0 });
              if (lz1 === S) dirs.push({ nx: 0, nz: sz, avenue: false });
              if (!dirs.length) {
                // 街区内部的塔楼四面临空：四个方向都给，方便挂招牌
                dirs.push({ nx: sx, nz: 0, avenue: false }, { nx: -sx, nz: 0, avenue: false }, { nx: 0, nz: sz, avenue: false }, { nx: 0, nz: -sz, avenue: false });
              }
              push(wx((lx0 + lx1) / 2), wz((lz0 + lz1) / 2), w, d, h, dirs, tag);
              return true;
            };
            // ---- 转角楼：同时占两条临街面 ----
            const cornerW = rng.range(16, 22);
            const cornerD = rng.range(15, 21);
            const cornerH = near ? rng.range(26, 42) : mid ? rng.range(22, 36) : rng.range(16, 30);
            mk(0, 0, cornerW, cornerD, cornerH, "corner");
            // ---- 沿 x 临街面继续排 ----
            let lz = cornerD;
            while (lz < S - 8) {
              const w = Math.min(rng.range(12, 22), S - lz);
              if (w < 7) break;
              const d = rng.range(13, 19);
              const h = near ? rng.range(18, 34) : rng.range(14, 40);
              mk(0, lz, d, lz + w, h, "front");
              lz += w + rng.range(0, 2.5);
            }
            // ---- 沿 z 临街面继续排 ----
            let lx = cornerW;
            while (lx < S - 8) {
              const w = Math.min(rng.range(13, 24), S - lx);
              if (w < 7) break;
              const d = rng.range(13, 20);
              const h = rng.range(14, 38);
              mk(lx, 0, lx + w, d, h, "front");
              lx += w + rng.range(0, 2.5);
            }
            // ---- 街区内部：塔楼（越靠路口越高，形成天际线层次）----
            const towerCount = near ? 3 : (mid ? 3 : 2);
            for (let t = 0; t < towerCount; t++) {
              const falloff = Math.max(0.4, 1 - (bi + bj) * 0.2);
              let ok = false;
              for (let attempt = 0; attempt < 10 && !ok; attempt++) {
                const tw = rng.range(14, 24);
                const td = rng.range(14, 24);
                const lx0 = clamp2(rng.range(12, 32) + t * rng.range(0, 5), 10, S - tw - 2);
                const lz0 = clamp2(rng.range(12, 32) + t * rng.range(0, 7), 10, S - td - 2);
                const h = rng.range(42, 150) * falloff;
                ok = mk(lx0, lz0, lx0 + tw, lz0 + td, h, "tower");
              }
            }
          }
        }
      }
    }
    // 近的优先保留（限流时远处直接不建）
    specs.sort((a, b) => a.dist - b.dist);
    return specs;
  }

  // ---------------------------------------------------------------------------
  //  几何合并 / 地面拼装（three 核心包没有 BufferGeometryUtils，这里自带一份）
  // ---------------------------------------------------------------------------
  function mergeGeoms(list) {
    let pc = 0;
    let ic = 0;
    for (const g of list) {
      pc += g.attributes.position.count;
      ic += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(pc * 3);
    const nor = new Float32Array(pc * 3);
    const uv = new Float32Array(pc * 2);
    const idx = new Uint32Array(ic);
    let po = 0;
    let io = 0;
    for (const g of list) {
      const p = g.attributes.position;
      if (g.attributes.normal) nor.set(g.attributes.normal.array, po * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, po * 2);
      pos.set(p.array, po * 3);
      const gi = g.index ? g.index.array : null;
      const c = p.count;
      if (gi) {
        for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + po;
        io += gi.length;
      } else {
        for (let i = 0; i < c; i++) idx[io + i] = i + po;
        io += c;
      }
      po += c;
    }
    const out = new BufferGeometry();
    out.setAttribute("position", new BufferAttribute(pos, 3));
    out.setAttribute("normal", new BufferAttribute(nor, 3));
    out.setAttribute("uv", new BufferAttribute(uv, 2));
    out.setIndex(new BufferAttribute(idx, 1));
    return out;
  }
  // 把若干水平矩形拼成一个几何体（人行道 / 地面分块）
  function buildFloorGeom(rects, y, uvScale) {
    const pos = [];
    const uv = [];
    const nor = [];
    const idx = [];
    let vi = 0;
    for (const r of rects) {
      const x0 = r[0];
      const z0 = r[1];
      const x1 = r[2];
      const z1 = r[3];
      pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
      uv.push(x0 * uvScale, z0 * uvScale, x0 * uvScale, z1 * uvScale, x1 * uvScale, z1 * uvScale, x1 * uvScale, z0 * uvScale);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  function createCity(opts) {
    const o = opts || {};
    const quality2 = QUALITY[o.quality] ? o.quality : "high";
    const Q = QUALITY[quality2];
    const seed = typeof o.seed === "number" ? o.seed : DEFAULT_SEED;
    const rng = makeRng(seed);
    const cv = (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };
    const group = new Group();
    group.name = "shinjuku-city";
    const geometries = [];
    const materials = [];
    const textures = [];
    const track = (obj) => {
      if (obj.isBufferGeometry) geometries.push(obj);
      else if (obj.isMaterial) materials.push(obj);
      else if (obj.isTexture) textures.push(obj);
      return obj;
    };
    const tmpMat4 = new Matrix4();
    const tmpMat4b = new Matrix4();
    const tmpVec3 = new Vector3();
    const tmpQuat = new Quaternion();
    const tmpScale = new Vector3(1, 1, 1);
    const tmpEuler = new Euler();
    const tmpColor = new Color();
    const ONE = new Vector3(1, 1, 1);
    // 实例化散布工具（所有重复的街道设施都用它，控制 draw call）
    const scatterInstanced = (name, geom, mat, count, fn) => {
      if (count <= 0) return null;
      const mesh = new InstancedMesh(geom, mat, count);
      mesh.name = name;
      mesh.frustumCulled = false;
      group.add(mesh);
      for (let i = 0; i < count; i++) {
        fn(i, (px2, py2, pz2, ry, sx, sy, sz, rx, rz, color) => {
          tmpQuat.setFromEuler(tmpEuler.set(rx || 0, ry || 0, rz || 0));
          mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(px2, py2, pz2), tmpQuat, tmpScale.set(sx, sy, sz)));
          if (color !== void 0) mesh.setColorAt(i, tmpColor.setHex(color));
        });
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return mesh;
    };

    // ======================= 天空 / 雾 / 环境光 =======================
    const skyRadius = 1400;
    {
      const g = track(new SphereGeometry(skyRadius, 32, 20));
      const pos = g.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const top = new Color(329484);          // 天顶：近黑的深蓝
      const mid = new Color(1380396);         // 中段
      const hor = new Color(4866632);         // 地平线：紫灰
      const warm = new Color(10254650);       // 城市光污染：暖橙
      const c = new Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / skyRadius;
        const az = Math.atan2(pos.getZ(i), pos.getX(i));
        const lobe = 0.5 + 0.5 * Math.cos(az - 2.1);
        if (y <= 0) {
          c.copy(hor).lerp(warm, 0.62 * lobe).multiplyScalar(clamp2(1 + y * 2.2, 0.3, 1));
        } else if (y < 0.42) {
          c.copy(hor).lerp(warm, 0.62 * lobe * (1 - y / 0.42)).lerp(mid, Math.pow(y / 0.42, 1.4));
        } else {
          c.copy(mid).lerp(top, clamp2((y - 0.42) / 0.58, 0, 1));
        }
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new Float32BufferAttribute(col, 3));
      const m = track(new MeshBasicMaterial({
        vertexColors: true,
        side: BackSide,
        fog: false,
        depthWrite: false,
        toneMapped: true
      }));
      const sky = new Mesh(g, m);
      sky.name = "sky-dome";
      sky.renderOrder = -100;
      sky.frustumCulled = false;
      group.add(sky);
      group.userData.skyMaterial = m;
    }
    const fogColor = new Color(2304064);
    const fog = new FogExp2(fogColor.getHex(), Q.fogDensity);
    group.userData.fog = fog;
    group.addEventListener("added", () => {
      let p = group.parent;
      while (p && !p.isScene) p = p.parent;
      if (p && !p.fog) p.fog = fog;
    });
    {
      // 夜景照明：冷调环境 + 微弱月光，靠招牌自发光提供对比
      const hemi = new HemisphereLight(7502192, 2367523, 0.92);
      hemi.name = "city-hemi";
      group.add(hemi);
      const amb = new AmbientLight(3948870, 0.38);
      amb.name = "city-ambient";
      group.add(amb);
      const moon = new DirectionalLight(11979246, 0.5);
      moon.name = "city-moon";
      moon.position.set(-180, 240, -140);
      group.add(moon);
    }

    // ======================= 地面 / 人行道 / 路缘石 =======================
    const asphaltTex = track(new CanvasTexture(makeAsphaltTex(cv, Q.tex, rng)));
    asphaltTex.wrapS = RepeatWrapping;
    asphaltTex.wrapT = RepeatWrapping;
    asphaltTex.repeat.set(GROUND_SIZE / ASPHALT_TILE, GROUND_SIZE / ASPHALT_TILE);
    asphaltTex.colorSpace = SRGBColorSpace;
    asphaltTex.anisotropy = 8;
    asphaltTex.needsUpdate = true;
    {
      const g = track(new PlaneGeometry(GROUND_SIZE, GROUND_SIZE));
      g.rotateX(-Math.PI / 2);
      // 湿沥青：掠射角反光（中/高画质开启，low 档自动归零）
      const m = track(applyWetShader(
        new MeshLambertMaterial({ map: asphaltTex, color: 16777215 }),
        quality2 === "low" ? 0 : 0.8,
        new Color(fogColor).multiplyScalar(2.2).lerp(new Color(0.12, 0.075, 0.04), 0.45)
      ));
      const ground = new Mesh(g, m);
      ground.name = "ground";
      group.add(ground);
    }
    {
      // 人行道：四个象限各一块，抬到路缘石高度
      const walkTex = track(new CanvasTexture(makeWalkTex(cv, Q.tex, rng)));
      walkTex.wrapS = RepeatWrapping;
      walkTex.wrapT = RepeatWrapping;
      walkTex.colorSpace = SRGBColorSpace;
      walkTex.anisotropy = 4;
      walkTex.needsUpdate = true;
      const rects = [];
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          rects.push([
            sx > 0 ? ROAD_HALF : -GROUND_SIZE / 2,
            sz > 0 ? ROAD_HALF : -GROUND_SIZE / 2,
            sx > 0 ? GROUND_SIZE / 2 : -ROAD_HALF,
            sz > 0 ? GROUND_SIZE / 2 : -ROAD_HALF
          ]);
        }
      }
      const g = track(buildFloorGeom(rects, CURB_H, 1 / 8));
      const m = track(applyWetShader(
        new MeshLambertMaterial({ map: walkTex, color: 16777215 }),
        quality2 === "low" ? 0 : 0.55,
        new Color(fogColor).multiplyScalar(2.2).lerp(new Color(0.12, 0.08, 0.05), 0.4)
      ));
      const walk = new Mesh(g, m);
      walk.name = "sidewalk";
      group.add(walk);
    }
    {
      // 路缘石：沿四条街边各两段（路口不封）
      const curbTex = track(new CanvasTexture(makeCurbTex(cv, rng)));
      curbTex.wrapS = RepeatWrapping;
      curbTex.wrapT = RepeatWrapping;
      curbTex.colorSpace = SRGBColorSpace;
      curbTex.needsUpdate = true;
      const m = track(applyFacadeUv(new MeshLambertMaterial({ map: curbTex, color: 16777215 }), 3, 0.5));
      const geom = track(unitBox());
      const segs = [];
      const len = GROUND_SIZE / 2 - ROAD_HALF - 0.4;
      const mid = ROAD_HALF + 0.2 + len / 2;
      for (const s of [1, -1]) {
        segs.push({ x: s * (ROAD_HALF + 0.2), z: mid, w: 0.42, d: len });
        segs.push({ x: s * (ROAD_HALF + 0.2), z: -mid, w: 0.42, d: len });
        segs.push({ x: mid, z: s * (ROAD_HALF + 0.2), w: len, d: 0.42 });
        segs.push({ x: -mid, z: s * (ROAD_HALF + 0.2), w: len, d: 0.42 });
      }
      const mesh = new InstancedMesh(geom, m, segs.length);
      mesh.name = "curbs";
      mesh.frustumCulled = false;
      segs.forEach((s, i) => {
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(s.x, 0, s.z), tmpQuat.identity(), tmpScale.set(s.w, CURB_H + 0.04, s.d)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    {
      // 标线：一次 draw call 画完斑马线 / 停止线 / 车道线 / 箭头
      const acc = buildRoadMarkings(rng);
      const g = track(new BufferGeometry());
      g.setAttribute("position", new Float32BufferAttribute(acc.pos, 3));
      g.setAttribute("color", new Float32BufferAttribute(acc.col, 3));
      g.setAttribute("uv", new Float32BufferAttribute(acc.uv, 2));
      g.setIndex(acc.idx);
      g.computeVertexNormals();
      const grunge = track(new CanvasTexture(makeGrungeTex(cv, 256, rng)));
      grunge.wrapS = RepeatWrapping;
      grunge.wrapT = RepeatWrapping;
      grunge.colorSpace = SRGBColorSpace;
      grunge.needsUpdate = true;
      const m = track(new MeshLambertMaterial({
        map: grunge,
        vertexColors: true,
        emissive: 592137,
        side: DoubleSide
      }));
      const mesh = new Mesh(g, m);
      mesh.name = "road-markings";
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    // ======================= 建筑 =======================
    const allSpecs = buildBlocks(rng);
    const specs = allSpecs.slice(0, Q.buildings);
    const facadeVariants = [
      { shell: 6387828, band: 7237234, pier: 5593689, glassTop: "#2b3752", glassMid: "#151d33", glassBot: "#080b12", litRate: 0.19, darkRate: 0.2, acRate: 0.05, cornice: true, corniceColor: C.NEON_CYAN, windowColors: WINDOW_COLORS, damaged: 0.35 },
      { shell: 6044752, band: 6974068, pier: 5263958, glassTop: "#282836", glassMid: "#14141c", glassBot: "#07070b", litRate: 0.26, darkRate: 0.24, acRate: 0.16, cornice: false, corniceColor: C.NEON_AMBER, windowColors: WINDOW_COLORS, damaged: 0.6 },
      { shell: 5329234, band: 6184784, pier: 4737369, glassTop: "#222b3a", glassMid: "#111620", glassBot: "#06080d", litRate: 0.14, darkRate: 0.2, acRate: 0.08, cornice: true, corniceColor: C.NEON_AMBER, windowColors: WINDOW_COLORS, damaged: 0.3 }
    ].map((opt) => {
      const pair = makeFacadePair(cv, Q.facadePx, rng, opt);
      const map = track(new CanvasTexture(pair.albedo));
      map.wrapS = RepeatWrapping;
      map.wrapT = RepeatWrapping;
      map.colorSpace = SRGBColorSpace;
      map.anisotropy = 4;
      map.needsUpdate = true;
      const glowMap = track(new CanvasTexture(pair.glow));
      glowMap.wrapS = RepeatWrapping;
      glowMap.wrapT = RepeatWrapping;
      glowMap.colorSpace = SRGBColorSpace;
      glowMap.anisotropy = 4;
      glowMap.needsUpdate = true;
      return makeFacadeMaterials({ albedo: map, glow: glowMap }, FACADE_TILE_W, FACADE_TILE_H);
    });
    const buckets = [];
    for (let v = 0; v < facadeVariants.length; v++) {
      const list = specs.filter((s, i) => i % facadeVariants.length === v);
      if (!list.length) continue;
      const bodyMesh = new InstancedMesh(track(addWhiteColors(unitBox())), facadeVariants[v].body, list.length);
      bodyMesh.name = "bodies-" + v;
      bodyMesh.frustumCulled = false;
      bodyMesh.instanceMatrix.setUsage(DynamicDrawUsage);
      group.add(bodyMesh);
      const glowGeom = track(addWhiteColors(unitBox()));
      const glowMesh = new InstancedMesh(glowGeom, facadeVariants[v].glow, list.length);
      glowMesh.name = "windows-" + v;
      glowMesh.frustumCulled = false;
      glowMesh.instanceMatrix.setUsage(DynamicDrawUsage);
      group.add(glowMesh);
      buckets.push({ list, bodyMesh, glowMesh, cursor: 0, variant: v });
    }
    const buildings = [];
    for (const bkt of buckets) {
      for (const s of bkt.list) {
        const index = bkt.cursor++;
        const b = {
          id: s.id,
          mesh: new Object3D(),
          height: s.h,
          radius: Math.max(s.w, s.d) * 0.5,
          destroyed: false,
          destroy() {
            startCollapse(b);
          },
          reset() {
            resetBuilding(b);
          },
          _x: s.x,
          _z: s.z,
          _w: s.w,
          _d: s.d,
          _h: s.h,
          _bodyMesh: bkt.bodyMesh,
          _bodyIndex: index,
          _glowMesh: bkt.glowMesh,
          _glowIndex: index,
          _attached: [],
          _state: "alive",
          _t: 0,
          _syncKey: NaN,
          _lit: new Color(1, 1, 1)
        };
        b.mesh.position.set(s.x, 0, s.z);
        b.mesh.userData.building = b;
        group.add(b.mesh);
        buildings.push(b);
        s.building = b;
      }
    }
    // 屋顶附件 / 招牌 / 店铺的本地矩阵组装
    // 低画质（手机）跳过纯装饰层：每层都是一个 draw call，省下来给角色与特效
    const DETAIL = quality2 !== "low";
    // 店名格子洗牌袋：一屏之内尽量不出现两块一样的招牌
    let shopBag = [];
    const SHOP_CELLS = 32;
    const nextShopCell = () => {
      if (!shopBag.length) {
        shopBag = [];
        for (let i = 0; i < SHOP_CELLS; i++) shopBag.push(i);
        for (let i = shopBag.length - 1; i > 0; i--) {
          const j = Math.floor(rng.next() * (i + 1));
          const t = shopBag[i];
          shopBag[i] = shopBag[j];
          shopBag[j] = t;
        }
      }
      return shopBag.pop();
    };
    const makeLocal = (px2, py2, pz2, ry, sx, sy, sz, rx) => {
      const m = new Matrix4();
      tmpQuat.setFromEuler(tmpEuler.set(rx || 0, ry || 0, 0));
      m.compose(tmpVec3.set(px2, py2, pz2), tmpQuat, tmpScale.set(sx, sy, sz));
      return m;
    };
    const plan = { parapet: [], vent: [], tank: [], mast: [], warn: [], roofSign: [], neonV: [], neonH: [], shop: [], awning: [], glowPoint: [], ao: [], ledge: [], ac: [], pipe: [], bay: [], steps: [], bracket: [] };
    for (const s of specs) {
      const b = s.building;
      if (!b) continue;
      const h = s.h;
      const w = s.w;
      const d = s.d;
      const tall = h > 40;
      // 女儿墙
      plan.parapet.push({ b, m: makeLocal(0, h - 0.5, 0, 0, w + 0.6, 1, d + 0.6) });
      // 屋顶设备：空调机 / 水箱 / 桅杆
      if (rng.chance(0.7)) {
        plan.vent.push({ b, m: makeLocal(rng.range(-w * 0.3, w * 0.3), h - 0.1, rng.range(-d * 0.3, d * 0.3), rng.range(0, TAU), rng.range(1.8, 3.6), rng.range(0.7, 1.6), rng.range(1.8, 3.6)) });
      }
      if (h > 30 && rng.chance(0.6)) {
        const th = rng.range(2.6, 4.4);
        plan.tank.push({ b, m: makeLocal(rng.range(-w * 0.28, w * 0.28), h - 0.1, rng.range(-d * 0.28, d * 0.28), 0, rng.range(1.7, 2.5), th, rng.range(1.7, 2.5)) });
      }
      if (tall && rng.chance(0.72)) {
        const mh = rng.range(5, 16);
        const mx = rng.range(-w * 0.2, w * 0.2);
        const mz = rng.range(-d * 0.2, d * 0.2);
        plan.mast.push({ b, m: makeLocal(mx, h, mz, 0, 1, mh, 1) });
        plan.warn.push({ b, m: makeLocal(mx, h + mh, mz, 0, 1, 1, 1) });
      }
      // 楼顶广告牌（高楼上）
      if (h > 34 && rng.chance(0.5)) {
        const bw = Math.min(w * 0.86, 16);
        const bh = rng.range(2.6, 4.6);
        plan.roofSign.push({
          b,
          cell: (s.id * 7 + 3) % 32,
          m: makeLocal(0, h + 0.15, 0, rng.chance(0.5) ? 0 : Math.PI / 2, bw, bh, 1)
        });
      }
      // 接地阴影（把建筑「按」在地上）
      plan.ao.push({ b, x: s.x, z: s.z, w: w * 1.5, d: d * 1.5 });
      // ---- 店铺层：只给临街面 ----
      for (const dir of s.dirs) {
        if (!dir.avenue) continue;
        const along = dir.nx !== 0 ? d : w;
        const faceX = dir.nx !== 0 ? s.x + dir.nx * w / 2 : s.x;
        const faceZ = dir.nz !== 0 ? s.z + dir.nz * d / 2 : s.z;
        const ry = dir.nx > 0 ? Math.PI / 2 : dir.nx < 0 ? -Math.PI / 2 : dir.nz > 0 ? 0 : Math.PI;
        const count = Math.max(1, Math.round(along / SHOP_W));
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : (i + 0.5) / count;
          const off = (t - 0.5) * along;
          const ox = faceX + dir.nx * 0.12 + (dir.nx !== 0 ? 0 : off);
          const oz = faceZ + dir.nz * 0.12 + (dir.nz !== 0 ? 0 : off);
          plan.shop.push({
            b,
            cell: nextShopCell(),
            m: makeLocal(ox - s.x, SHOP_H / 2, oz - s.z, ry, along / count, SHOP_H, 1)
          });
          plan.glowPoint.push({
            x: ox + dir.nx * 1.6,
            y: rng.range(2.2, 4.4),
            z: oz + dir.nz * 1.6,
            color: rng.pick([C.NEON_AMBER, 16764057, C.GOLD, 16752722]),
            size: rng.range(3.4, 6.2)
          });
          // 店门口台阶：给首层一点立体进深
          if (DETAIL) {
            plan.steps.push({
              b,
              m: makeLocal(ox - s.x + dir.nx * 0.8, 0, oz - s.z + dir.nz * 0.8, ry, (along / count) * 0.9, CURB_H + 0.06, 1.5)
            });
          }
        }
        // 遮阳篷
        if (DETAIL) plan.awning.push({
          b,
          m: makeLocal(faceX - s.x + dir.nx * 0.6, SHOP_H - 0.4, faceZ - s.z + dir.nz * 0.6, ry, along * 0.92, 0.3, 1.25)
        });
        // ---- 立面几何细节：层间挑檐 / 空调外机 / 落水管 / 凸窗 ----
        const floors = Math.min(16, Math.max(1, Math.floor((h - SHOP_H - 0.5) / FLOOR_H)));
        const fstep = quality2 === "low" ? 2 : 1;
        for (let k = 1; k <= floors; k += fstep) {
          const fy = SHOP_H + k * FLOOR_H - 0.3;
          plan.ledge.push({ b, m: makeLocal(faceX - s.x + dir.nx * 0.08, fy, faceZ - s.z + dir.nz * 0.08, ry, along * 0.97, 0.26, 0.5) });
        }
        const detail = quality2 === "low" ? 1 : 3;
        for (let k = 0; k < (DETAIL ? detail : 1); k++) {
          const off2 = rng.range(-along * 0.42, along * 0.42);
          const ox2 = faceX + dir.nx * 0.34 + (dir.nx !== 0 ? 0 : off2);
          const oz2 = faceZ + dir.nz * 0.34 + (dir.nz !== 0 ? 0 : off2);
          const oy = rng.range(SHOP_H + 1.2, Math.max(SHOP_H + 2.6, h - 2.5));
          plan.ac.push({ b, m: makeLocal(ox2 - s.x, oy, oz2 - s.z, ry, 0.84, 0.62, 0.58) });
          if (DETAIL && rng.chance(0.4)) {
            plan.bay.push({ b, m: makeLocal(ox2 - s.x, oy + 1.1, oz2 - s.z, ry, 1.5, 2.4, 0.9) });
          }
          if (rng.chance(0.5)) {
            plan.pipe.push({ b, m: makeLocal(ox2 - s.x + dir.nx * 0.04, 0, oz2 - s.z + dir.nz * 0.04, 0, 0.24, h, 0.24) });
          }
        }
      }
      // ---- 霓虹招牌 ----
      const signCount = h > 80 ? 7 : h > 45 ? 6 : 4;
      for (let i = 0; i < signCount; i++) {
        if (!rng.chance(0.92)) continue;
        const dir = s.dirs[i % s.dirs.length];
        if (!dir) continue;
        const along = dir.nx !== 0 ? d : w;
        const off = rng.range(-along * 0.38, along * 0.38);
        const faceX = (dir.nx !== 0 ? s.x + dir.nx * w / 2 : s.x) + (dir.nx !== 0 ? 0 : off);
        const faceZ = (dir.nz !== 0 ? s.z + dir.nz * d / 2 : s.z) + (dir.nz !== 0 ? 0 : off);
        const vertical = rng.chance(0.66);
        const sw = vertical ? rng.range(1.4, 2.2) : rng.range(4.0, 7.2);
        const sh = vertical ? rng.range(5.0, 10.5) : rng.range(1.1, 1.9);
        const minY = SHOP_H + 1.4;
        const sy = rng.range(minY, Math.max(minY + 1, h - sh - 1.5));
        // 竖招牌垂直于立面挑出（袖看板）；横招牌贴着立面
        let ry;
        let lx;
        let lz;
        if (vertical) {
          ry = dir.nx !== 0 ? (dir.nx > 0 ? 0 : Math.PI) : (dir.nz > 0 ? Math.PI / 2 : -Math.PI / 2);
          lx = faceX - s.x + dir.nx * 0.75;
          lz = faceZ - s.z + dir.nz * 0.75;
        } else {
          ry = dir.nx > 0 ? Math.PI / 2 : dir.nx < 0 ? -Math.PI / 2 : dir.nz > 0 ? 0 : Math.PI;
          lx = faceX - s.x + dir.nx * 0.2;
          lz = faceZ - s.z + dir.nz * 0.2;
        }
        if (vertical && DETAIL) {
          // 袖看板的挑出支架：让招牌不是「浮在墙上」
          const faceRy = dir.nx > 0 ? Math.PI / 2 : dir.nx < 0 ? -Math.PI / 2 : dir.nz > 0 ? 0 : Math.PI;
          plan.bracket.push({
            b,
            m: makeLocal(faceX - s.x + dir.nx * 0.55, sy + sh * 0.42, faceZ - s.z + dir.nz * 0.55, faceRy, 0.13, 0.13, 1.2)
          });
        }
        const entry = {
          b,
          cell: (i * 5 + s.id) % 64,
          tint: 0.7 + rng.next() * 0.6,
          phase: rng.next() * TAU,
          speed: rng.range(1.4, 6.5),
          m: makeLocal(lx, sy, lz, ry, sw, sh, 1)
        };
        (vertical ? plan.neonV : plan.neonH).push(entry);
        plan.glowPoint.push({
          x: faceX + dir.nx * (vertical ? 0.9 : 0.6),
          y: sy,
          z: faceZ + dir.nz * (vertical ? 0.9 : 0.6),
          color: rng.pick(NEON_COLORS),
          size: rng.range(3.6, 7.5)
        });
      }
    }
    // 霓虹限流（保亮度高的）
    const neonAll = plan.neonV.concat(plan.neonH);
    neonAll.sort((a, b) => b.tint - a.tint);
    const keep = new Set(neonAll.slice(0, Q.neon));
    plan.neonV = plan.neonV.filter((e) => keep.has(e));
    plan.neonH = plan.neonH.filter((e) => keep.has(e));

    // ======================= 建筑附件 / 招牌 / 店铺 =======================
    const buildAttachments = (list, geom, mat, name) => {
      if (!list.length) return null;
      const mesh = new InstancedMesh(geom, mat, list.length);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      group.add(mesh);
      list.forEach((item, i) => {
        item.b._attached.push({ mesh, index: i, local: item.m });
      });
      return mesh;
    };
    // 图集实例网格（霓虹 / 店铺 / 贩卖机）：每实例一个格子号
    const buildCellMesh = (name, list, texCanvas, cols, rows, opt) => {
      if (!list.length) return null;
      const tex = track(new CanvasTexture(texCanvas));
      tex.colorSpace = SRGBColorSpace;
      tex.needsUpdate = true;
      const geom = track(new PlaneGeometry(1, 1));
      const cells = new Float32Array(list.length * 2);
      for (let i = 0; i < list.length; i++) {
        const cell = ((list[i].cell || 0) % (cols * rows) + cols * rows) % (cols * rows);
        cells[i * 2] = cell % cols / cols;
        cells[i * 2 + 1] = 1 - Math.floor(cell / cols) / rows - 1 / rows;
      }
      geom.setAttribute("aCell", new InstancedBufferAttribute(cells, 2));
      geom.setAttribute("color", new Float32BufferAttribute(new Float32Array(12).fill(1), 3));
      const mat = track(makeAtlasMaterial(tex, cols, rows, opt));
      const mesh = new InstancedMesh(geom, mat, list.length);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
      mesh.instanceColor.setUsage(DynamicDrawUsage);
      group.add(mesh);
      list.forEach((item, i) => {
        item.b._attached.push({ mesh, index: i, local: item.m });
        item.instanceMesh = mesh;
        item.instanceIndex = i;
      });
      return mesh;
    };
    {
      const parapetMat = track(new MeshLambertMaterial({ color: 6974066, vertexColors: true }));
      buildAttachments(plan.parapet, track(addWhiteColors(unitBox())), parapetMat, "roof-parapet");
      const ventMat = track(new MeshLambertMaterial({ color: 5921370, vertexColors: true }));
      buildAttachments(plan.vent, track(addWhiteColors(unitBox())), ventMat, "roof-vent");
      const tankMat = track(new MeshLambertMaterial({ color: 5197647, vertexColors: true }));
      if (DETAIL) buildAttachments(plan.tank, track(addWhiteColors(new CylinderGeometry(1, 1, 1, 8, 1, false))), tankMat, "roof-tank");
      const mastMat = track(new MeshLambertMaterial({ color: 7566195, vertexColors: true }));
      buildAttachments(plan.mast, track(addWhiteColors(new CylinderGeometry(0.14, 0.26, 1, 6, 1, true))), mastMat, "roof-mast");
      const helipadTex = track(new CanvasTexture(makeHelipadTexture(cv, 128)));
      helipadTex.colorSpace = SRGBColorSpace;
      const helipadMat = track(new MeshBasicMaterial({ map: helipadTex, transparent: true, vertexColors: true, fog: true, side: DoubleSide }));
      const helipadGeom = track(new CircleGeometry(1, 20));
      helipadGeom.rotateX(-Math.PI / 2);
      const pads = [];
      for (const s of specs) {
        if (s.h < 90 || !rng.chance(0.4)) continue;
        pads.push({
          b: s.building,
          m: makeLocal(rng.range(-s.w * 0.2, s.w * 0.2), s.h + 0.2, rng.range(-s.d * 0.2, s.d * 0.2), rng.range(0, TAU), rng.range(6, 9), 1, rng.range(6, 9))
        });
      }
      buildAttachments(pads, helipadGeom, helipadMat, "roof-helipad");
    }
    // 霓虹招牌（竖 / 横两张图集）
    const neonMeshes = [];
    {
      const cols = Q.atlasCols;
      const rows = Q.atlasRows;
      const vMesh = buildCellMesh("neon-v", plan.neonV, makeNeonAtlas(cv, Q.neonPx, cols, rows, true, rng), cols, rows, { additive: true, alphaTest: 0 });
      if (vMesh) neonMeshes.push({ mesh: vMesh, list: plan.neonV });
      const hMesh = buildCellMesh("neon-h", plan.neonH, makeNeonAtlas(cv, Q.neonPx, rows, cols, false, rng), rows, cols, { additive: true, alphaTest: 0 });
      if (hMesh) neonMeshes.push({ mesh: hMesh, list: plan.neonH });
      // 楼顶广告牌：复用横招牌图集，夜里远处也能看到发光字
      if (plan.roofSign.length) {
        buildCellMesh("roof-signs", plan.roofSign, makeNeonAtlas(cv, Q.neonPx, rows, cols, false, rng), rows, cols, { additive: true, alphaTest: 0 });
      }
    }
    // 店铺层（不透明、写深度，紧贴立面）
    {
      const cols = 8;
      const rows = 4;
      buildCellMesh("shopfronts", plan.shop, makeShopAtlas(cv, Q.shopPx, cols, rows, rng), cols, rows, { transparent: false, depthWrite: true, alphaTest: 0 });
    }
    // 遮阳篷
    {
      const mat = track(new MeshLambertMaterial({ color: 6316128, vertexColors: true, side: DoubleSide }));
      buildAttachments(plan.awning, track(addWhiteColors(unitBox())), mat, "awnings");
      // 立面几何细节（共用一份材质，控制 program 数量）
      const detailMat = track(new MeshLambertMaterial({ color: 7106928, vertexColors: true }));
      buildAttachments(plan.ledge, track(addWhiteColors(unitBox())), detailMat, "facade-ledges");
      buildAttachments(plan.ac, track(addWhiteColors(unitBox())), detailMat, "facade-ac");
      buildAttachments(plan.bay, track(addWhiteColors(unitBox())), detailMat, "facade-bays");
      buildAttachments(plan.steps, track(addWhiteColors(unitBox())), detailMat, "shop-steps");
      buildAttachments(plan.bracket, track(addWhiteColors(unitBox())), detailMat, "sign-brackets");
      const pipeGeom = track(addWhiteColors(new CylinderGeometry(0.5, 0.5, 1, 6)));
      pipeGeom.translate(0, 0.5, 0);
      if (DETAIL) buildAttachments(plan.pipe, pipeGeom, detailMat, "facade-pipes");
    }

    // ======================= 路灯 / 地面光池 / 光柱 =======================
    const lamps = [];
    {
      const L = ROAD_HALF + 1.35;
      for (const s of [1, -1]) {
        for (let u = 22; u <= 186; u += 25) {
          for (const sign of [1, -1]) {
            lamps.push({ x: s * L, z: sign * u, dx: -s, dz: 0 });
            lamps.push({ x: sign * u, z: s * L, dx: 0, dz: -s });
          }
        }
      }
    }
    const usedLamps = lamps.slice(0, Math.max(8, Q.lamps));
    {
      const poleH = 8.2;
      const pole = new CylinderGeometry(0.1, 0.15, poleH, 7, 1, true);
      pole.translate(0, poleH / 2, 0);
      // 灯臂长度直接决定 camProp 的等效半径（camera.js 用几何体包围盒算 r）：
      // 臂 1.7 + 灯头 0.7 → 半径 1.43m，落在相机「细杆不算糊脸」的 1.6m 阈值以内
      const arm = new BoxGeometry(1.7, 0.13, 0.17);
      arm.translate(-0.85, poleH - 0.16, 0);
      const head = new BoxGeometry(0.7, 0.16, 0.34);
      head.translate(-1.85, poleH - 0.24, 0);
      const geom = track(mergeGeoms([pole, arm, head]));
      pole.dispose();
      arm.dispose();
      head.dispose();
      const mat = track(new MeshLambertMaterial({ color: 3817514 }));
      const mesh = new InstancedMesh(geom, mat, usedLamps.length);
      mesh.name = "lamp-poles";
      mesh.frustumCulled = false;
      usedLamps.forEach((L, i) => {
        const rot = Math.atan2(L.dz, -L.dx);
        tmpQuat.setFromEuler(tmpEuler.set(0, rot, 0));
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(L.x, 0, L.z), tmpQuat, ONE));
        L.rot = rot;
        L.hx = L.x + L.dx * 1.85;
        L.hz = L.z + L.dz * 2.3;
        L.hy = poleH - 0.24;
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      // 灯头光晕
      const positions = new Float32Array(usedLamps.length * 3);
      const colors = new Float32Array(usedLamps.length * 3);
      const amber = new Color(16762959);
      for (let i = 0; i < usedLamps.length; i++) {
        const L = usedLamps[i];
        positions[i * 3] = L.hx;
        positions[i * 3 + 1] = L.hy;
        positions[i * 3 + 2] = L.hz;
        const warm = 0.85 + rng.next() * 0.3;
        colors[i * 3] = amber.r * warm;
        colors[i * 3 + 1] = amber.g * warm;
        colors[i * 3 + 2] = amber.b * warm;
      }
      const haloGeom = track(new BufferGeometry());
      haloGeom.setAttribute("position", new Float32BufferAttribute(positions, 3));
      haloGeom.setAttribute("color", new Float32BufferAttribute(colors, 3));
      const glowTex = track(new CanvasTexture(makeGlowTexture(cv, 128)));
      glowTex.colorSpace = SRGBColorSpace;
      const haloMat = track(new PointsMaterial({
        size: 7.4,
        map: glowTex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        vertexColors: true,
        fog: true
      }));
      const haloPoints = new Points(haloGeom, haloMat);
      haloPoints.name = "lamp-halos";
      haloPoints.frustumCulled = false;
      group.add(haloPoints);
      // 地面光池：夜里最关键的一层（暖色椭圆的灯光洒在路面上）
      const poolTex = track(new CanvasTexture(makePoolTexture(cv, 128)));
      poolTex.colorSpace = SRGBColorSpace;
      // 光池同样是加法层，几十个光池沿街叠起来就是那条"暖亮带"：
      // 近处光斑保持完整，25m 外的光池淡出（远处交给雾和霓虹自有层次）
      const poolMat = track(applyDistanceFade(new MeshBasicMaterial({
        map: poolTex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
        fog: true,
        side: DoubleSide
      }), quality2 === "low" ? 12 : 22, quality2 === "low" ? 34 : 62));
      // 全局再收一档：光池仍是地面主要的可读光源，但沿街叠出来的亮带压住
      poolMat.opacity = 0.75;
      const poolGeom = track(addWhiteColors(new PlaneGeometry(1, 1)));
      poolGeom.rotateX(-Math.PI / 2);
      // 光池列表：路灯 + 店铺外溢 + 路口补光（合成一个 draw call）
      const poolList = [];
      for (const L of usedLamps) {
        const c = rng.range(0.135, 0.185);
        poolList.push({ x: L.hx, z: L.hz, ry: L.rot, sx: 14, sz: 18, y: 0.12, r: c, g: c * 0.72, b: c * 0.44 });
      }
      const shopTint = [[1, 0.66, 0.3], [1, 0.5, 0.24], [0.95, 0.42, 0.55], [0.5, 0.85, 1], [1, 0.85, 0.55]];
      for (const s of [1, -1]) {
        for (let u = -166; u < 166; u += 16) {
          if (Math.abs(u) < 14) continue;
          const k0 = Math.round(u / 16);
          const t1 = shopTint[((k0 + 8) % shopTint.length + shopTint.length) % shopTint.length];
          const t2 = shopTint[((k0 + 11) % shopTint.length + shopTint.length) % shopTint.length];
          poolList.push({ x: s * 15.6, z: u + 8, ry: 0, sx: 11, sz: 17, y: CURB_H + 0.05, r: t1[0] * 0.05, g: t1[1] * 0.05, b: t1[2] * 0.05 });
          poolList.push({ x: u + 8, z: s * 15.6, ry: 0, sx: 17, sz: 11, y: CURB_H + 0.05, r: t2[0] * 0.05, g: t2[1] * 0.05, b: t2[2] * 0.05 });
        }
      }
      // 湿路反射拖影：把霓虹/灯箱的光沿街面拉成长条糊在路面上（同一网格，不新增 draw call）
      const wetStep = quality2 === "low" ? 46 : 23;
      const wetAmt = quality2 === "low" ? 0 : 1;
      for (const s of [1, -1]) {
        for (let u = -150; u < 150; u += wetStep) {
          if (Math.abs(u) < 15) continue;
          const k1 = Math.round(u / 23);
          const w1 = shopTint[((k1 + 5) % shopTint.length + shopTint.length) % shopTint.length];
          const w2 = shopTint[((k1 + 9) % shopTint.length + shopTint.length) % shopTint.length];
          const ka = rng.range(0.036, 0.07) * wetAmt;
          const kb = rng.range(0.03, 0.06) * wetAmt;
          poolList.push({
            x: s * rng.range(8.4, 10.8),
            z: u + wetStep * 0.5,
            ry: 0,
            sx: rng.range(5.0, 8.0),
            sz: wetStep * rng.range(0.95, 1.25),
            y: 0.045,
            r: w1[0] * ka, g: w1[1] * ka, b: w1[2] * ka
          });
          poolList.push({
            x: u + wetStep * 0.5,
            z: s * rng.range(8.4, 10.8),
            ry: Math.PI / 2,
            sx: rng.range(5.0, 8.0),
            sz: wetStep * rng.range(0.95, 1.25),
            y: 0.045,
            r: w2[0] * kb, g: w2[1] * kb, b: w2[2] * kb
          });
        }
      }
      // 信号灯在湿路上的反射（红/绿长条），位置跟着路口四角
      for (const a of [1, -1]) {
        for (const b3 of [1, -1]) {
          // 原来是 1.3×7.5 的强拉伸 → 读成"细长绿线"。改成宽而淡的软光斑。
          poolList.push({ x: a * 6.5, z: b3 * 10.5, ry: 0, sx: 5.5, sz: 9, y: 0.05, r: 0.016 * wetAmt, g: 0.055 * wetAmt, b: 0.03 * wetAmt });
          poolList.push({ x: a * 10.5, z: b3 * 6.5, ry: Math.PI / 2, sx: 9, sz: 5.5, y: 0.05, r: 0.016 * wetAmt, g: 0.055 * wetAmt, b: 0.03 * wetAmt });
        }
      }
      // 路口中心补光：不然格斗区就是一块黑
      poolList.push({ x: 0, z: 0, ry: 0, sx: 46, sz: 46, y: 0.1, r: 0.05, g: 0.048, b: 0.046 });
      for (const a of [1, -1]) {
        for (const b2 of [1, -1]) {
          poolList.push({ x: a * 8, z: b2 * 8, ry: 0, sx: 24, sz: 24, y: 0.1, r: 0.042, g: 0.04, b: 0.038 });
        }
      }
      const poolMesh = new InstancedMesh(poolGeom, poolMat, poolList.length);
      poolMesh.name = "light-pools";
      poolMesh.frustumCulled = false;
      poolMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(poolList.length * 3), 3);
      poolList.forEach((p, i) => {
        tmpQuat.setFromEuler(tmpEuler.set(0, p.ry, 0));
        poolMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(p.x, p.y, p.z), tmpQuat, tmpScale.set(p.sx, 1, p.sz)));
        poolMesh.setColorAt(i, tmpColor.setRGB(p.r, p.g, p.b));
      });
      poolMesh.instanceMatrix.needsUpdate = true;
      poolMesh.instanceColor.needsUpdate = true;
      group.add(poolMesh);
      // 灯光体积感（光柱）
      if (Q.godray) {
        const shaftTex = track(new CanvasTexture(makeShaftTexture(cv, 128)));
        shaftTex.colorSpace = SRGBColorSpace;
        // 不透明度按「最热的一次会话也要 <60」定档：跨会话实测同构建有 ±5 的场景状态浮动
        const shaftMat = track(makeBillboardMaterial(shaftTex, 16762959, { fadeNear: 12, fadeFar: 30 }));
        shaftMat.opacity = 0.07;
        const shaftGeom = track(new PlaneGeometry(1, 1));
        const shaftMesh = new InstancedMesh(shaftGeom, shaftMat, usedLamps.length);
        shaftMesh.name = "lamp-shafts";
        shaftMesh.frustumCulled = false;
        const shaftH = 7.6;
        for (let i = 0; i < usedLamps.length; i++) {
          const L = usedLamps[i];
          tmpQuat.identity();
          shaftMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(L.hx, L.hy - shaftH / 2, L.hz), tmpQuat, tmpScale.set(shaftH * 1.1, shaftH, 1)));
        }
        shaftMesh.instanceMatrix.needsUpdate = true;
        group.add(shaftMesh);
      }
    }

    // ======================= 信号灯（日本横式三灯）=======================
    let signalLens = null;
    let pedLens = null;
    if (Q.signals) {
      const R = ROAD_HALF + 1.9;
      // 悬臂长度 = camProp 等效半径的一半：原来 7.9m 悬臂让相机把每个路口角
      // 当成「半径 4.28m 的实心柱」，会误判遮挡。改成 1.5m（灯头挂在路缘上方），
      // 半径降到 1.46m，仍在路口一眼能认，但不再制造幻影遮挡体。
      const ARM = 1.5;
      const heads = [
        { px: R, pz: -R, dx: -1, dz: 0, hx: R - ARM, hz: -R, face: "z+", group: 0 },
        { px: -R, pz: R, dx: 1, dz: 0, hx: -(R - ARM), hz: R, face: "z-", group: 0 },
        { px: R, pz: R, dx: 0, dz: -1, hx: R, hz: R - ARM, face: "x-", group: 1 },
        { px: -R, pz: -R, dx: 0, dz: 1, hx: -R, hz: -(R - ARM), face: "x+", group: 1 }
      ];
      const poleH = 6.4;
      const armLen = Math.hypot(heads[0].hx - heads[0].px, heads[0].hz - heads[0].pz);
      const poleGeom = new CylinderGeometry(0.09, 0.13, poleH, 7, 1, true);
      poleGeom.translate(0, poleH / 2, 0);
      const armGeom = new BoxGeometry(armLen, 0.13, 0.16);
      armGeom.translate(armLen / 2, poleH - 0.22, 0);
      // 斜撑必须朝 -x（悬臂那侧），否则会把几何体包围盒顶到 +x，camProp 半径又变回去
      const braceGeom = new BoxGeometry(1.15, 0.08, 0.1);
      braceGeom.rotateZ(0.72);
      braceGeom.translate(-0.45, poleH - 0.85, 0);
      const sigGeom = track(mergeGeoms([poleGeom, armGeom, braceGeom]));
      const sigMat = track(new MeshLambertMaterial({ color: 4342851 }));
      const sigPoles = new InstancedMesh(sigGeom, sigMat, heads.length);
      sigPoles.name = "signal-poles";
      sigPoles.frustumCulled = false;
      const headGeom = track(new BoxGeometry(1.56, 0.5, 0.3));
      const headMat = track(new MeshLambertMaterial({ color: 3552822 }));
      const sigHeads = new InstancedMesh(headGeom, headMat, heads.length * 2);
      sigHeads.name = "signal-heads";
      sigHeads.frustumCulled = false;
      const lensGeom = track(addWhiteColors(new PlaneGeometry(1, 1)));
      const lensMat = track(new MeshBasicMaterial({
        map: track(new CanvasTexture(makeGlowTexture(cv, 64))),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
        fog: true,
        side: DoubleSide
      }));
      const lensList = [];
      const pedList = [];
      heads.forEach((h, i) => {
        const rot = Math.atan2(-h.dz, h.dx);
        tmpQuat.setFromEuler(tmpEuler.set(0, rot, 0));
        sigPoles.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(h.px, 0, h.pz), tmpQuat, ONE));
        // 灯头朝向来车
        const facing = h.face;
        const hry = facing === "z+" ? 0 : facing === "z-" ? Math.PI : facing === "x-" ? -Math.PI / 2 : Math.PI / 2;
        tmpQuat.setFromEuler(tmpEuler.set(0, hry, 0));
        sigHeads.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(h.hx, poleH - 0.5, h.hz), tmpQuat, ONE));
        // 三灯：右红 中黄 左绿（从司机视角）
        const tang = facing === "z+" || facing === "z-" ? [1, 0] : [0, 1];
        // 灯珠必须浮在灯头正面（面朝来车的方向），否则会埋在灯头几何体里看不见
        const fxo = facing === "x-" ? -0.26 : facing === "x+" ? 0.26 : 0;
        const fzo = facing === "z+" ? 0.26 : facing === "z-" ? -0.26 : 0;
        for (let k = 0; k < 3; k++) {
          const o = (k - 1) * 0.46;
          lensList.push({
            x: h.hx + tang[0] * o + fxo,
            y: poleH - 0.5,
            z: h.hz + tang[1] * o + fzo,
            ry: hry,
            kind: k === 2 ? "r" : k === 1 ? "y" : "g",
            group: h.group
          });
        }
        // 行人灯：挂在杆上，朝路口中心
        const nx2 = -h.px / Math.abs(h.px || 1);
        const nz2 = -h.pz / Math.abs(h.pz || 1);
        const pry = Math.atan2(nx2, nz2);
        sigHeads.setMatrixAt(heads.length + i, tmpMat4.compose(tmpVec3.set(h.px + nx2 * 0.2, 3.0, h.pz + nz2 * 0.2), tmpQuat.setFromEuler(tmpEuler.set(0, pry, 0)), tmpScale.set(0.46, 0.95, 0.26)));
        pedList.push({ x: h.px + nx2 * 0.34, y: 3.2, z: h.pz + nz2 * 0.34, ry: pry, kind: "p", group: h.group });
        pedList.push({ x: h.px + nx2 * 0.34, y: 2.72, z: h.pz + nz2 * 0.34, ry: pry, kind: "pg", group: h.group });
      });
      sigPoles.instanceMatrix.needsUpdate = true;
      sigHeads.instanceMatrix.needsUpdate = true;
      group.add(sigPoles);
      group.add(sigHeads);
      const mkLens = (list, name) => {
        const mesh = new InstancedMesh(lensGeom, lensMat, list.length);
        mesh.name = name;
        mesh.frustumCulled = false;
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        group.add(mesh);
        return mesh;
      };
      signalLens = { mesh: mkLens(lensList, "signal-lens"), list: lensList };
      pedLens = DETAIL ? { mesh: mkLens(pedList, "ped-lens"), list: pedList } : null;
      [signalLens, pedLens].filter(Boolean).forEach((o2) => {
        o2.list.forEach((L, i) => {
          tmpQuat.setFromEuler(tmpEuler.set(0, L.ry, 0));
          const sc = L.kind === "p" || L.kind === "pg" ? 0.3 : 0.56;
          o2.mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(L.x, L.y, L.z), tmpQuat, tmpScale.set(sc, sc, sc)));
        });
        o2.mesh.instanceMatrix.needsUpdate = true;
      });
    }

    // ======================= 护栏 / 系止柱 / 贩卖机 / 街边杂物 =======================
    {
      const post = new CylinderGeometry(0.06, 0.06, 0.9, 6);
      post.translate(0, 0.45, 0);
      const bar = new BoxGeometry(3.3, 0.15, 0.08);
      bar.translate(0, 0.82, 0);
      const bar2 = new BoxGeometry(3.3, 0.1, 0.06);
      bar2.translate(0, 0.44, 0);
      const railGeom = track(mergeGeoms([post, bar, bar2]));
      post.dispose();
      bar.dispose();
      bar2.dispose();
      const railMat = track(new MeshLambertMaterial({ color: 9079434 }));
      const railPts = [];
      const railLine = ROAD_HALF + 0.75;
      for (const s of [1, -1]) {
        for (const seg of [[22, 62], [-62, -22]]) {
          for (let u = seg[0]; u < seg[1]; u += 3.6) {
            railPts.push({ x: s * railLine, z: u + 1.7, ry: Math.PI / 2 });
            railPts.push({ x: u + 1.7, z: s * railLine, ry: 0 });
          }
        }
      }
      const rails = railPts.slice(0, Math.max(8, Q.rails));
      if (rails.length) {
        const mesh = new InstancedMesh(railGeom, railMat, rails.length);
        mesh.name = "guardrails";
        mesh.frustumCulled = false;
        rails.forEach((p, i) => {
          tmpQuat.setFromEuler(tmpEuler.set(0, p.ry, 0));
          mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(p.x, 0, p.z), tmpQuat, ONE));
        });
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
    }
    {
      // 系止柱：斑马线两端人行道口
      const geom = track(addWhiteColors(new CylinderGeometry(0.09, 0.11, 0.95, 8)));
      geom.translate(0, 0.475, 0);
      const mat = track(new MeshLambertMaterial({ color: 11184879, vertexColors: true }));
      const pts = [];
      const e0 = CROSS_IN + CROSS_W + 1.0;
      for (const a of [1, -1]) {
        for (const b of [1, -1]) {
          for (let j = 0; j < 4; j++) {
            pts.push({ x: a * (ROAD_HALF + 0.9 + j * 1.5), z: b * e0 });
            pts.push({ x: a * e0, z: b * (ROAD_HALF + 0.9 + j * 1.5) });
          }
        }
      }
      const mesh = new InstancedMesh(geom, mat, pts.length);
      mesh.name = "bollards";
      mesh.frustumCulled = false;
      pts.forEach((p, i) => {
        tmpQuat.identity();
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(p.x, 0, p.z), tmpQuat, ONE));
        mesh.setColorAt(i, tmpColor.setHex(rng.chance(0.4) ? 16777215 : 11842740));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
    {
      // 自动贩卖机：贴着临街立面，灯箱是夜里最抓眼的暖色块
      const cols = 3;
      const rows = 2;
      const bodyGeom = track(addWhiteColors(unitBox()));
      const bodyMat = track(new MeshLambertMaterial({ color: 2105376, vertexColors: true }));
      const frontTex = track(new CanvasTexture(makeVendAtlas(cv, 512, cols, rows, rng)));
      frontTex.colorSpace = SRGBColorSpace;
      frontTex.needsUpdate = true;
      const frontMat = track(makeAtlasMaterial(frontTex, cols, rows, { transparent: false, depthWrite: true }));
      const spots = [];
      for (const s of [1, -1]) {
        for (let k = 0; k < 4; k++) {
          const su = k % 2 === 0 ? 1 : -1;
          const u = su * (24 + k * 15 + rng.range(-3, 3));
          spots.push({ x: s * (BLOCK_IN - 0.6), z: u, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
          spots.push({ x: u, z: s * (BLOCK_IN - 0.6), ry: s > 0 ? Math.PI : 0 });
        }
      }
      const use = spots.slice(0, Math.max(2, Q.vending));
      const frontGeom = track(new PlaneGeometry(1, 1));
      const fCells = new Float32Array(use.length * 2);
      for (let i = 0; i < use.length; i++) {
        const cell = i % (cols * rows);
        fCells[i * 2] = cell % cols / cols;
        fCells[i * 2 + 1] = 1 - Math.floor(cell / cols) / rows - 1 / rows;
      }
      frontGeom.setAttribute("aCell", new InstancedBufferAttribute(fCells, 2));
      frontGeom.setAttribute("color", new Float32BufferAttribute(new Float32Array(12).fill(1), 3));
      const bMesh = new InstancedMesh(bodyGeom, bodyMat, use.length);
      bMesh.name = "vending-body";
      bMesh.frustumCulled = false;
      const fMesh = new InstancedMesh(frontGeom, frontMat, use.length);
      fMesh.name = "vending-front";
      fMesh.frustumCulled = false;
      use.forEach((p, i) => {
        tmpQuat.setFromEuler(tmpEuler.set(0, p.ry, 0));
        bMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(p.x, CURB_H, p.z), tmpQuat.setFromEuler(tmpEuler.set(0, p.ry, 0)), tmpScale.set(1.15, 1.9, 0.78)));
        bMesh.setColorAt(i, tmpColor.setHex(2105376));
        const fx2 = p.x + Math.sin(p.ry) * 0.42;
        const fz = p.z + Math.cos(p.ry) * 0.42;
        fMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(fx2, CURB_H + 0.98, fz), tmpQuat.setFromEuler(tmpEuler.set(0, p.ry, 0)), tmpScale.set(1.06, 1.82, 1)));
      });
      bMesh.instanceMatrix.needsUpdate = true;
      fMesh.instanceMatrix.needsUpdate = true;
      if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
      group.add(bMesh);
      group.add(fMesh);
    }
    {
      // 街边杂物：花坛 / 立牌 / 垃圾桶 / 路锥 / 自行车架
      const boxGeom = track(addWhiteColors(unitBox()));
      const boxMat = track(new MeshLambertMaterial({ vertexColors: true }));
      const cylGeom = track(addWhiteColors(new CylinderGeometry(0.5, 0.5, 1, 8)));
      cylGeom.translate(0, 0.5, 0);
      const cylMat = track(new MeshLambertMaterial({ vertexColors: true }));
      const coneGeom = track(addWhiteColors(new CylinderGeometry(0.03, 0.3, 0.72, 8)));
      coneGeom.translate(0, 0.36, 0);
      const items = [];
      for (const a of [1, -1]) {
        for (const b of [1, -1]) {
          for (let k = 0; k < 6; k++) {
            items.push({
              x: a * rng.range(12.9, 17.2),
              z: b * rng.range(12.9, 17.2),
              ry: rng.range(0, TAU),
              kind: rng.next() < 0.34 ? "planter" : rng.next() < 0.4 ? "board" : rng.next() < 0.55 ? "bin" : "cone"
            });
          }
        }
        for (let k = 0; k < 5; k++) {
          const u = a * rng.range(24, 80);
          const side = rng.sign();
          items.push({
            x: side > 0 ? u : side * (ROAD_HALF + rng.range(1.2, 4.6)),
            z: side > 0 ? side * (ROAD_HALF + rng.range(1.2, 4.6)) : u,
            ry: rng.range(0, TAU),
            kind: rng.next() < 0.4 ? "planter" : rng.next() < 0.6 ? "bin" : "board"
          });
        }
      }
      const use = items.slice(0, Math.max(6, Q.clutter));
      const boxes = use.filter((it) => it.kind !== "bin" && it.kind !== "cone");
      const cyls = use.filter((it) => it.kind === "bin");
      const cones = use.filter((it) => it.kind === "cone");
      const bMesh = new InstancedMesh(boxGeom, boxMat, Math.max(1, boxes.length));
      bMesh.name = "clutter-box";
      bMesh.frustumCulled = false;
      boxes.forEach((it, i) => {
        tmpQuat.setFromEuler(tmpEuler.set(0, it.ry, 0));
        if (it.kind === "planter") {
          bMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(it.x, CURB_H, it.z), tmpQuat, tmpScale.set(1.3, 0.62, 0.7)));
          bMesh.setColorAt(i, tmpColor.setHex(3487030));
        } else {
          bMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(it.x, CURB_H, it.z), tmpQuat, tmpScale.set(0.72, 1.05, 0.1)));
          bMesh.setColorAt(i, tmpColor.setHex(rng.chance(0.5) ? 16119285 : 16764057));
        }
      });
      bMesh.count = boxes.length;
      bMesh.instanceMatrix.needsUpdate = true;
      if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
      if (boxes.length) group.add(bMesh);
      if (cyls.length && DETAIL) {
        const m2 = new InstancedMesh(cylGeom, cylMat, cyls.length);
        m2.name = "clutter-bin";
        m2.frustumCulled = false;
        cyls.forEach((it, i) => {
          tmpQuat.setFromEuler(tmpEuler.set(0, it.ry, 0));
          m2.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(it.x, CURB_H, it.z), tmpQuat, tmpScale.set(0.62, 0.92, 0.62)));
          m2.setColorAt(i, tmpColor.setHex(4013373));
        });
        m2.instanceMatrix.needsUpdate = true;
        if (m2.instanceColor) m2.instanceColor.needsUpdate = true;
        group.add(m2);
      }
      if (cones.length && DETAIL) {
        const m3 = new InstancedMesh(coneGeom, cylMat, cones.length);
        m3.name = "clutter-cone";
        m3.frustumCulled = false;
        cones.forEach((it, i) => {
          tmpQuat.setFromEuler(tmpEuler.set(0, it.ry, 0));
          m3.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(it.x, CURB_H, it.z), tmpQuat, ONE));
          m3.setColorAt(i, tmpColor.setHex(16733440));
        });
        m3.instanceMatrix.needsUpdate = true;
        if (m3.instanceColor) m3.instanceColor.needsUpdate = true;
        group.add(m3);
      }
    }

    // ======================= 车辆（路边停放 / 事故车）=======================
    {
      const bodyGeom = track(addWhiteColors(unitBox()));
      const bodyMat = track(new MeshLambertMaterial({ vertexColors: true }));
      const cabinGeom = track(addWhiteColors(unitBox()));
      const cabinMat = track(new MeshLambertMaterial({ vertexColors: true }));
      const tireGeom = track(addWhiteColors(new CylinderGeometry(0.33, 0.33, 0.22, 9)));
      tireGeom.rotateZ(Math.PI / 2);
      const tireMat = track(new MeshLambertMaterial({ color: 1316381, vertexColors: true }));
      const cars = [];
      const lane = ROAD_HALF - 1.6;
      for (const s of [1, -1]) {
        for (let k = 0; k < 5; k++) {
          const u = 38 + k * 21 + rng.range(-5, 5);
          cars.push({ x: s * lane, z: u, ry: s > 0 ? 0 : Math.PI, w: 1.9, d: 4.5 });
          cars.push({ x: u, z: s * lane, ry: s > 0 ? Math.PI / 2 : -Math.PI / 2, w: 1.9, d: 4.5 });
        }
      }
      // 事故车：横在路口外
      cars.push({ x: 8.4, z: 33, ry: 0.5, w: 1.9, d: 4.5 });
      cars.push({ x: -7.2, z: -35, ry: -0.7, w: 1.9, d: 4.5 });
      const use = cars.slice(0, Math.max(3, Q.cars));
      const bodyMesh = new InstancedMesh(bodyGeom, bodyMat, use.length);
      bodyMesh.name = "car-body";
      bodyMesh.frustumCulled = false;
      const cabinMesh = new InstancedMesh(cabinGeom, cabinMat, use.length);
      cabinMesh.name = "car-cabin";
      cabinMesh.frustumCulled = false;
      const tireMesh = new InstancedMesh(tireGeom, tireMat, use.length * 4);
      tireMesh.name = "car-tires";
      tireMesh.frustumCulled = false;
      use.forEach((c, i) => {
        const col = rng.pick([15790320, 13619151, 3092271, 5329233, 8912913, 11184810]);
        tmpQuat.setFromEuler(tmpEuler.set(0, c.ry, 0));
        bodyMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(c.x, 0.42, c.z), tmpQuat, tmpScale.set(c.w, 0.72, c.d)));
        bodyMesh.setColorAt(i, tmpColor.setHex(col));
        cabinMesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(c.x - Math.sin(c.ry) * 0.25, 1.14, c.z - Math.cos(c.ry) * 0.25), tmpQuat, tmpScale.set(c.w * 0.88, 0.62, c.d * 0.5)));
        cabinMesh.setColorAt(i, tmpColor.setHex(1579032));
        for (let k = 0; k < 4; k++) {
          const sx = k % 2 === 0 ? 1 : -1;
          const sz = k < 2 ? 1 : -1;
          const cos = Math.cos(c.ry);
          const sin = Math.sin(c.ry);
          const tx = c.x + sx * c.w * 0.52 * cos + sz * c.d * 0.34 * sin;
          const tz = c.z - sx * c.w * 0.52 * sin + sz * c.d * 0.34 * cos;
          tireMesh.setMatrixAt(i * 4 + k, tmpMat4.compose(tmpVec3.set(tx, 0.33, tz), tmpQuat, ONE));
          tireMesh.setColorAt(i * 4 + k, tmpColor.setHex(2237743));
        }
      });
      bodyMesh.instanceMatrix.needsUpdate = true;
      cabinMesh.instanceMatrix.needsUpdate = true;
      tireMesh.instanceMatrix.needsUpdate = true;
      if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
      if (cabinMesh.instanceColor) cabinMesh.instanceColor.needsUpdate = true;
      if (tireMesh.instanceColor) tireMesh.instanceColor.needsUpdate = true;
      group.add(bodyMesh);
      group.add(cabinMesh);
      group.add(tireMesh);
    }

    // ======================= 碎石 / 裂痕 / 接地阴影 =======================
    const concreteTints = [13158597, 11119044, 9605773, 8487536, 11711196, 14211273];
    const roadPoint = () => {
      const onX = rng.chance(0.5);
      const along = rng.range(-190, 190);
      const across = (rng.chance(0.5) ? 1 : -1) * rng.range(0, ROAD_HALF - 1);
      return onX ? { x: across, z: along } : { x: along, z: across };
    };
    const piles = [];
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        piles.push({ x: sx * rng.range(14.5, 21), z: sz * rng.range(14.5, 21), r: rng.range(2.6, 4.8) });
        piles.push({ x: sx * rng.range(18, 25), z: sz * rng.range(30, 86), r: rng.range(1.6, 3.4) });
        piles.push({ x: sx * rng.range(30, 86), z: sz * rng.range(14, 22), r: rng.range(1.6, 3.4) });
      }
    }
    piles.push({ x: rng.range(-7, 7), z: rng.range(-7, 7), r: 1.8 });
    piles.push({ x: rng.range(-9, 9), z: rng.range(-9, 9), r: 1.5 });
    const pilePoint = () => {
      const p = rng.pick(piles);
      const a = rng.next() * TAU;
      const r = p.r * Math.sqrt(rng.next());
      return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
    };
    {
      const geom = track(addWhiteColors(new IcosahedronGeometry(1, quality2 === "low" ? 0 : 1)));
      const mat = track(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      scatterInstanced("debris", geom, mat, Q.debris, (i, set) => {
        const p = i % 5 === 0 ? roadPoint() : pilePoint();
        const s = rng.range(0.1, 0.5);
        set(
          p.x + rng.range(-1.2, 1.2),
          s * 0.62,
          p.z + rng.range(-1.2, 1.2),
          rng.range(0, TAU),
          s * rng.range(0.9, 1.6),
          s * rng.range(0.42, 0.8),
          s * rng.range(0.9, 1.6),
          rng.range(-0.5, 0.5),
          rng.range(-0.5, 0.5),
          rng.pick(concreteTints)
        );
      });
    }
    {
      const geom = track(addWhiteColors(new BoxGeometry(1, 0.16, 1)));
      const mat = track(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      const n = DETAIL ? Math.max(6, Math.round(Q.debris * 0.2)) : 0;
      scatterInstanced("slabs", geom, mat, n, (i, set) => {
        const p = i % 4 === 0 ? roadPoint() : pilePoint();
        const w = rng.range(0.7, 2.0);
        set(
          p.x + rng.range(-1.6, 1.6),
          0.08,
          p.z + rng.range(-1.6, 1.6),
          rng.range(0, TAU),
          w,
          1,
          w * rng.range(0.5, 1.1),
          rng.range(-0.26, 0.26),
          rng.range(-0.26, 0.26),
          rng.pick([7895160, 6908265, 9013641, 6250335])
        );
      });
    }
    {
      const geom = track(addWhiteColors(new CylinderGeometry(0.07, 0.07, 1, 4, 1, true)));
      const mat = track(new MeshLambertMaterial({ vertexColors: true }));
      scatterInstanced("rebar", geom, mat, Q.rebar, (i, set) => {
        const p = pilePoint();
        const len = rng.range(0.7, 2.2);
        set(
          p.x + rng.range(-1.2, 1.2),
          rng.range(0.3, 1.0),
          p.z + rng.range(-1.2, 1.2),
          rng.range(0, TAU),
          1,
          len,
          1,
          rng.range(-0.9, 0.9),
          rng.range(-0.9, 0.9),
          rng.pick([9013641, 8224125, 7368816])
        );
      });
    }
    {
      // 接地阴影：建筑底部一圈柔和暗影，把盒子「按」在路面上
      const aoTex = track(new CanvasTexture(makeAoTexture(cv, 128)));
      aoTex.colorSpace = SRGBColorSpace;
      const geom = track(new PlaneGeometry(1, 1));
      geom.rotateX(-Math.PI / 2);
      const mat = track(new MeshBasicMaterial({
        map: aoTex,
        color: 0,
        transparent: true,
        depthWrite: false,
        fog: true,
        side: DoubleSide
      }));
      const list = plan.ao.slice(0, Math.max(1, specs.length));
      const mesh = new InstancedMesh(geom, mat, list.length);
      mesh.name = "building-ao";
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      list.forEach((it, i) => {
        tmpQuat.identity();
        // 必须画在人行道面（y=CURB_H）之上：原来放 0.05 被人行道板整个盖住，等于没画
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(it.x, CURB_H + 0.02, it.z), tmpQuat, tmpScale.set(it.w, 1, it.d)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    {
      // 沥青修补补丁（挖补方块），近景靠它把路面"做旧"
      const patchTex = track(new CanvasTexture(makePatchTexture(cv, 256, rng)));
      patchTex.colorSpace = SRGBColorSpace;
      const geom = track(new PlaneGeometry(1, 1));
      geom.rotateX(-Math.PI / 2);
      const mat = track(new MeshBasicMaterial({
        map: patchTex,
        transparent: true,
        depthWrite: false,
        color: 16777215,
        fog: true
      }));
      const n = Math.max(8, Math.round(Q.decals * 2.4));
      const mesh = new InstancedMesh(geom, mat, n);
      mesh.name = "road-patches";
      mesh.count = DETAIL ? n : 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 0;
      group.add(mesh);
      for (let i = 0; i < n; i++) {
        const p = roadPoint();
        const s = rng.range(3.2, 7);
        tmpQuat.setFromEuler(tmpEuler.set(0, rng.chance(0.5) ? 0 : Math.PI / 2 + rng.range(-0.2, 0.2), 0));
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(p.x, 0.02, p.z), tmpQuat, tmpScale.set(s, 1, s * rng.range(0.6, 1.1))));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    {
      // 井盖（几何体版本）：路口与街上若干，近景能看出这是市政路面
      const geom = track(addWhiteColors(new CylinderGeometry(1, 1, 0.06, 18)));
      const mat = track(new MeshLambertMaterial({ color: 4539973, vertexColors: true }));
      const spots = [];
      spots.push({ x: 0, z: 0, s: 0.62 });
      for (const a of [1, -1]) {
        for (const b2 of [1, -1]) {
          spots.push({ x: a * rng.range(3, 9), z: b2 * rng.range(3, 9), s: rng.range(0.4, 0.5) });
        }
      }
      for (let i = 0; i < 26; i++) {
        const p = roadPoint();
        spots.push({ x: p.x, z: p.z, s: rng.range(0.38, 0.52) });
      }
      const mesh = new InstancedMesh(geom, mat, spots.length);
      mesh.name = "manholes";
      mesh.count = DETAIL ? spots.length : 0;
      mesh.frustumCulled = false;
      spots.forEach((p, i) => {
        tmpQuat.identity();
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(p.x, 0.03, p.z), tmpQuat, tmpScale.set(p.s, 1, p.s)));
        mesh.setColorAt(i, tmpColor.setHex(rng.chance(0.5) ? 4539973 : 3883343));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
    {
      // 路面裂痕贴花
      const decalTex = track(new CanvasTexture(makeCrackDecalTexture(cv, 256, rng)));
      decalTex.colorSpace = SRGBColorSpace;
      const geom = track(new PlaneGeometry(1, 1));
      geom.rotateX(-Math.PI / 2);
      const mat = track(new MeshBasicMaterial({
        map: decalTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
        color: 0,
        fog: true
      }));
      const mesh = new InstancedMesh(geom, mat, Q.decals);
      mesh.name = "crack-decals";
      mesh.count = DETAIL ? Q.decals : 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      group.add(mesh);
      for (let i = 0; i < Q.decals; i++) {
        const p = rng.chance(0.55) ? pilePoint() : roadPoint();
        const s = rng.range(5, 11);
        tmpQuat.setFromEuler(tmpEuler.set(0, rng.range(0, TAU), 0));
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(p.x, 0.07, p.z), tmpQuat, tmpScale.set(s, 1, s)));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    {
      // 电线（日本街头的横七竖八）
      const pts = [];
      for (let i = 0; i < Q.wires; i++) {
        const s = rng.chance(0.5) ? 1 : -1;
        const u = rng.range(-170, 170);
        const near = rng.chance(0.5);
        const a = near ? { x: s * rng.range(19, 30), z: u } : { x: u, z: s * rng.range(19, 30) };
        const len = rng.range(14, 26);
        const b = near ? { x: a.x + rng.range(-4, 16), z: a.z + len } : { x: a.x + len, z: a.z + rng.range(-4, 16) };
        const y0 = rng.range(8, 17);
        const sag = rng.range(1.2, 4);
        const segs = 5;
        let prev = null;
        for (let k = 0; k <= segs; k++) {
          const t = k / segs;
          const p = new Vector3(lerp2(a.x, b.x, t), y0 - Math.sin(t * Math.PI) * sag, lerp2(a.z, b.z, t));
          if (prev) pts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
          prev = p;
        }
      }
      if (pts.length) {
        const geom = track(new BufferGeometry());
        geom.setAttribute("position", new Float32BufferAttribute(pts, 3));
        const mat = track(new LineBasicMaterial({ color: 1579032, transparent: true, opacity: 0.85, fog: true }));
        const wires = new LineSegments(geom, mat);
        wires.name = "wires";
        wires.frustumCulled = false;
        group.add(wires);
      }
    }

    // ======================= 天际线（近中景 + 远景剪影）=======================
    if (Q.skyline) {
      const geom = track(addWhiteColors(unitBox()));
      const winTex = track(new CanvasTexture((() => {
        const c2 = cv(128, 128);
        const x2 = c2.getContext("2d");
        x2.fillStyle = "#0b0e16";
        x2.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 12; i++) {
          for (let j = 0; j < 16; j++) {
            if (rng.chance(0.42)) {
              x2.fillStyle = rng.chance(0.55) ? "rgba(255,196,120,0.95)" : "rgba(160,220,255,0.9)";
            } else {
              x2.fillStyle = "rgba(20,24,36,1)";
            }
            x2.fillRect(i * 10 + 2, j * 8 + 2, 6, 4);
          }
        }
        return c2;
      })()));
      winTex.wrapS = RepeatWrapping;
      winTex.wrapT = RepeatWrapping;
      winTex.repeat.set(3, 6);
      winTex.colorSpace = SRGBColorSpace;
      const mat = track(new MeshBasicMaterial({ map: winTex, vertexColors: true, fog: true }));
      const n = quality2 === "high" ? 74 : 44;
      const mesh = new InstancedMesh(geom, mat, n);
      mesh.name = "skyline-mid";
      mesh.frustumCulled = false;
      mesh.renderOrder = -50;
      group.add(mesh);
      const far = new Color(fogColor).lerp(new Color(C.BLOOD), 0.28);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rng.range(-0.04, 0.04);
        const r = rng.range(175, 330);
        const w = rng.range(20, 52);
        const h = rng.range(36, 150) * (r > 260 ? 1.25 : 1);
        const t = clamp2((r - 175) / 155, 0, 1);
        tmpColor.copy(new Color(6909065)).lerp(far, t);
        tmpQuat.setFromEuler(tmpEuler.set(0, rng.range(0, TAU), 0));
        mesh.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(Math.cos(a) * r, 0, Math.sin(a) * r), tmpQuat, tmpScale.set(w, h, w * rng.range(0.6, 1.4))));
        mesh.setColorAt(i, tmpColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // 远景剪影：不受雾影响，颜色贴着雾色，只做层次
      const gFar = track(addWhiteColors(unitBox()));
      const mFar = track(new MeshBasicMaterial({ vertexColors: true, fog: false }));
      const nFar = quality2 === "high" ? 60 : 30;
      const meshFar = new InstancedMesh(gFar, mFar, nFar);
      meshFar.name = "skyline-far";
      meshFar.frustumCulled = false;
      meshFar.renderOrder = -60;
      group.add(meshFar);
      for (let i = 0; i < nFar; i++) {
        const a = i / nFar * TAU + rng.range(-0.06, 0.06);
        const r = rng.range(360, 620);
        const w = rng.range(40, 110);
        const h = rng.range(70, 240);
        tmpColor.copy(far).multiplyScalar(rng.range(0.9, 1.25));
        tmpQuat.setFromEuler(tmpEuler.set(0, rng.range(0, TAU), 0));
        meshFar.setMatrixAt(i, tmpMat4.compose(tmpVec3.set(Math.cos(a) * r, 0, Math.sin(a) * r), tmpQuat, tmpScale.set(w, h, w * rng.range(0.6, 1.2))));
        meshFar.setColorAt(i, tmpColor);
      }
      meshFar.instanceMatrix.needsUpdate = true;
      if (meshFar.instanceColor) meshFar.instanceColor.needsUpdate = true;
    }

    // ======================= 广告屏 =======================
    const screenEntries = [];
    {
      const screenTex = track(new CanvasTexture(makeScreenTexture(cv, 256, rng)));
      screenTex.colorSpace = SRGBColorSpace;
      screenTex.needsUpdate = true;
      const geom = track(new PlaneGeometry(1, 1));
      const tall = buildings.filter((b) => b._h > 44).sort((a, b) => a.mesh.position.length() - b.mesh.position.length());
      const count = Math.min(Q.screens, tall.length);
      for (let i = 0; i < count && i < tall.length; i++) {
        const b = tall[i];
        const toC = Math.atan2(-b.mesh.position.x, -b.mesh.position.z);
        const dx = Math.sin(toC);
        const dz = Math.cos(toC);
        let offX = 0;
        let offZ = 0;
        let sry = 0;
        if (Math.abs(dx) >= Math.abs(dz)) {
          offX = Math.sign(dx) * (b._w / 2 + 0.55);
          sry = Math.sign(dx) > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          offZ = Math.sign(dz) * (b._d / 2 + 0.55);
          sry = Math.sign(dz) > 0 ? 0 : Math.PI;
        }
        const sw = rng.range(14, 22) * (i === 0 ? 1.15 : 1);
        const sh = sw * 0.5;
        const mat = track(makeScreenMaterial(screenTex));
        const mesh = new Mesh(geom, mat);
        mesh.name = "ad-screen-" + i;
        mesh.frustumCulled = false;
        group.add(mesh);
        const local = makeLocal(
          offX,
          rng.range(Math.min(28, b._h * 0.35), Math.max(30, b._h * 0.7)),
          offZ,
          sry,
          sw,
          sh,
          1
        );
        screenEntries.push({
          mesh,
          mat,
          b,
          local,
          frame: rng.next() * 4 | 0,
          next: rng.range(1.4, 3.2),
          tintA: new Color(rng.pick(NEON_COLORS)),
          tintB: new Color(rng.pick(NEON_COLORS))
        });
        tmpMat4.compose(b.mesh.position, b.mesh.quaternion, ONE);
        tmpMat4b.multiplyMatrices(tmpMat4, local);
        tmpMat4b.decompose(mesh.position, mesh.quaternion, mesh.scale);
      }
    }
    // ======================= 霓虹雾气光点 / 扫掠光晕 =======================
    {
      const pts = plan.glowPoint.slice(0, Math.max(8, Math.round(Q.neon * 0.9)));
      const pos = new Float32Array(pts.length * 3);
      const col = new Float32Array(pts.length * 3);
      const c3 = new Color();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        c3.setHex(p.color).multiplyScalar(rng.range(0.1, 0.22));
        col[i * 3] = c3.r;
        col[i * 3 + 1] = c3.g;
        col[i * 3 + 2] = c3.b;
      }
      const geom = track(new BufferGeometry());
      geom.setAttribute("position", new Float32BufferAttribute(pos, 3));
      geom.setAttribute("color", new Float32BufferAttribute(col, 3));
      const glowTex = track(new CanvasTexture(makeGlowTexture(cv, 64)));
      glowTex.colorSpace = SRGBColorSpace;
      const mat = track(new PointsMaterial({
        size: 9,
        map: glowTex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        vertexColors: true,
        fog: true
      }));
      const points = new Points(geom, mat);
      points.name = "neon-glow";
      points.frustumCulled = false;
      group.add(points);
    }
    let sweepMesh = null;
    let sweepPivot = null;
    {
      const tex = track(new CanvasTexture(makeGlowTexture(cv, 128)));
      tex.colorSpace = SRGBColorSpace;
      const mat = track(new MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        fog: false,
        color: C.NEON_PINK,
        opacity: 0.34
      }));
      const geom = track(new PlaneGeometry(760, 300));
      sweepMesh = new Mesh(geom, mat);
      sweepMesh.position.set(0, 180, -600);
      sweepMesh.renderOrder = -40;
      sweepMesh.frustumCulled = false;
      sweepPivot = new Object3D();
      sweepPivot.add(sweepMesh);
      group.add(sweepPivot);
    }

    // ======================= 扬尘 / 环境浮尘 =======================
    const dust = {
      count: Q.dustPool,
      pos: new Float32Array(Q.dustPool * 3),
      vel: new Float32Array(Q.dustPool * 3),
      col: new Float32Array(Q.dustPool * 3),
      base: new Float32Array(Q.dustPool * 3),
      life: new Float32Array(Q.dustPool),
      maxLife: new Float32Array(Q.dustPool),
      cursor: 0,
      mesh: null,
      geom: null
    };
    {
      const glowTex = track(new CanvasTexture(makeGlowTexture(cv, 64)));
      glowTex.colorSpace = SRGBColorSpace;
      dust.geom = track(new BufferGeometry());
      for (let i = 0; i < dust.count; i++) dust.pos[i * 3 + 1] = -1e3;
      dust.geom.setAttribute("position", new BufferAttribute(dust.pos, 3));
      dust.geom.setAttribute("color", new BufferAttribute(dust.col, 3));
      const mat = track(new PointsMaterial({
        size: 6.5,
        map: glowTex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        vertexColors: true,
        fog: true
      }));
      dust.mesh = new Points(dust.geom, mat);
      dust.mesh.name = "dust";
      dust.mesh.frustumCulled = false;
      group.add(dust.mesh);
    }
    let ambient = null;
    {
      const n = Q.ambientDust;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const base = new Color(C.NEON_CYAN).lerp(new Color(C.WHITE), 0.45);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = rng.range(-190, 190);
        pos[i * 3 + 1] = rng.range(1, 60);
        pos[i * 3 + 2] = rng.range(-190, 190);
        const k = rng.range(0.05, 0.2);
        col[i * 3] = base.r * k;
        col[i * 3 + 1] = base.g * k;
        col[i * 3 + 2] = base.b * k;
      }
      const geom = track(new BufferGeometry());
      geom.setAttribute("position", new BufferAttribute(pos, 3));
      geom.setAttribute("color", new BufferAttribute(col, 3));
      const glowTex2 = track(new CanvasTexture(makeGlowTexture(cv, 32)));
      glowTex2.colorSpace = SRGBColorSpace;
      const mat = track(new PointsMaterial({
        size: 0.85,
        map: glowTex2,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        vertexColors: true,
        fog: true
      }));
      const points = new Points(geom, mat);
      points.name = "ambient-dust";
      points.frustumCulled = false;
      group.add(points);
      ambient = { geom, base: pos.slice(0) };
    }
    let warnPoints = null;
    if (plan.warn.length) {
      const n = plan.warn.length;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos[i * 3 + 1] = -1e3;
      const geom = track(new BufferGeometry());
      geom.setAttribute("position", new BufferAttribute(pos, 3));
      geom.setAttribute("color", new BufferAttribute(col, 3));
      const glowTex3 = track(new CanvasTexture(makeGlowTexture(cv, 32)));
      glowTex3.colorSpace = SRGBColorSpace;
      const mat = track(new PointsMaterial({
        size: 2.6,
        map: glowTex3,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        vertexColors: true,
        fog: true
      }));
      warnPoints = new Points(geom, mat);
      warnPoints.name = "warning-lights";
      warnPoints.frustumCulled = false;
      group.add(warnPoints);
      plan.warn.forEach((item, i) => item.b._attached.push({ mesh: null, index: i, local: item.m, warnIndex: i }));
    }

    // ======================= 建筑同步 / 倒塌 =======================
    const rigidMat = new Matrix4();
    const fullMat = new Matrix4();
    function syncBuilding(b) {
      const m = b.mesh;
      rigidMat.compose(m.position, m.quaternion, ONE);
      fullMat.compose(m.position, m.quaternion, tmpScale.set(b._w, b._h, b._d));
      b._bodyMesh.setMatrixAt(b._bodyIndex, fullMat);
      b._bodyMesh.instanceMatrix.needsUpdate = true;
      b._glowMesh.setMatrixAt(b._glowIndex, fullMat);
      b._glowMesh.instanceMatrix.needsUpdate = true;
      for (const a of b._attached) {
        if (a.mesh) {
          tmpMat4b.multiplyMatrices(rigidMat, a.local);
          a.mesh.setMatrixAt(a.index, tmpMat4b);
          a.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      b._syncKey = m.position.x + m.position.y * 1.7 + m.position.z * 2.3 + m.quaternion.w * 3.1;
    }
    function setWindowsLit(b, lit) {
      b._lit.setScalar(lit ? 1 : 0);
      b._glowMesh.setColorAt(b._glowIndex, b._lit);
      b._glowMesh.instanceColor.needsUpdate = true;
    }
    function setBodyTint(b, v) {
      tmpColor.setScalar(v);
      b._bodyMesh.setColorAt(b._bodyIndex, tmpColor);
      b._bodyMesh.instanceColor.needsUpdate = true;
    }
    function spawnDust(b) {
      const n = Math.min(dust.count, Math.round(Q.dustPool * 0.08) + 14);
      const base = new Color(6971734);
      for (let i = 0; i < n; i++) {
        const k = dust.cursor;
        dust.cursor = (dust.cursor + 1) % dust.count;
        const a = rng.next() * TAU;
        const r = Math.max(2, b.radius * rng.range(0.4, 1.5));
        dust.pos[k * 3] = b.mesh.position.x + Math.cos(a) * r;
        dust.pos[k * 3 + 1] = rng.range(0.5, 4);
        dust.pos[k * 3 + 2] = b.mesh.position.z + Math.sin(a) * r;
        dust.vel[k * 3] = Math.cos(a) * rng.range(1.5, 7);
        dust.vel[k * 3 + 1] = rng.range(1.5, 6.5);
        dust.vel[k * 3 + 2] = Math.sin(a) * rng.range(1.5, 7);
        const s = rng.range(0.55, 1.25);
        dust.base[k * 3] = base.r * s;
        dust.base[k * 3 + 1] = base.g * s;
        dust.base[k * 3 + 2] = base.b * s;
        dust.col[k * 3] = dust.base[k * 3];
        dust.col[k * 3 + 1] = dust.base[k * 3 + 1];
        dust.col[k * 3 + 2] = dust.base[k * 3 + 2];
        dust.maxLife[k] = rng.range(1.4, 3.4);
        dust.life[k] = dust.maxLife[k];
      }
      dust.geom.attributes.position.needsUpdate = true;
      dust.geom.attributes.color.needsUpdate = true;
    }
    function startCollapse(b) {
      if (b._state !== "alive") return;
      b._state = "falling";
      b.destroyed = true;
      b._t = 0;
      setWindowsLit(b, false);
      spawnDust(b);
    }
    function resetBuilding(b) {
      b._state = "alive";
      b.destroyed = false;
      b._t = 0;
      b.mesh.position.set(b._x, 0, b._z);
      b.mesh.quaternion.identity();
      b.mesh.scale.set(1, 1, 1);
      setWindowsLit(b, true);
      setBodyTint(b, 1);
      syncBuilding(b);
    }
    for (const b of buildings) {
      b._bodyMesh.setColorAt(b._bodyIndex, tmpColor.setScalar(1));
      b._glowMesh.setColorAt(b._glowIndex, tmpColor.setScalar(1));
      syncBuilding(b);
    }
    for (const b of buildings) {
      b._bodyMesh.instanceColor.needsUpdate = true;
      b._glowMesh.instanceColor.needsUpdate = true;
    }
    let lastT = 0;
    function advanceCollapse(b, dt) {
      b._t += dt;
      const k = clamp2(b._t / COLLAPSE_TIME, 0, 1);
      let y;
      let tilt;
      if (k < 0.18) {
        const u = k / 0.18;
        const e = Math.sin(u * Math.PI * 0.5);
        y = 1.7 * e;
        tilt = 0.07 * e;
      } else {
        const u = (k - 0.18) / 0.82;
        const e = u * u * (3 - 2 * u);
        y = 1.7 - (b._h * 1.35 + 4.5) * (u * u * 0.35 + e * 0.65);
        tilt = 0.07 + 0.55 * e;
      }
      b.mesh.position.set(b._x, y, b._z);
      b.mesh.quaternion.setFromEuler(tmpEuler.set(tilt * 0.62, 0, tilt));
      setBodyTint(b, clamp2(1 - k * 0.92, 0.06, 1));
      if (k >= 1) {
        b._state = "down";
        b.mesh.position.set(b._x, -b._h * 1.4 - 6, b._z);
        b.mesh.quaternion.setFromEuler(tmpEuler.set(0.62, 0, 0.62));
        setBodyTint(b, 0.05);
      }
      syncBuilding(b);
    }
    // 信号灯配色
    const SIG_ON = {
      r: [1.0, 0.16, 0.08],
      y: [1.0, 0.66, 0.1],
      g: [0.14, 1.0, 0.55],
      p: [1.0, 0.3, 0.2],
      pg: [0.2, 1.0, 0.6]
    };
    const sigOff = [0.05, 0.05, 0.06];
    function update2(t, dt) {
      const step = clamp2(dt || 0, 0, 0.05);
      lastT = t || 0;
      for (const b of buildings) {
        if (b._state === "falling") {
          advanceCollapse(b, step);
        } else if (b._state === "alive") {
          const m = b.mesh;
          const key = m.position.x + m.position.y * 1.7 + m.position.z * 2.3 + m.quaternion.w * 3.1;
          if (key !== b._syncKey) syncBuilding(b);
        }
      }
      // 霓虹闪烁
      for (const entry of neonMeshes) {
        const { mesh, list } = entry;
        const arr = mesh.instanceColor.array;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          if (it.b.destroyed) {
            arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = 0;
            continue;
          }
          const w = Math.sin(lastT * it.speed + it.phase);
          const flick = w > 0.93 ? 0.25 : w < -0.97 ? 0.45 : 1;
          const v = it.tint * (0.72 + 0.28 * Math.sin(lastT * 1.7 + it.phase)) * flick;
          arr[i * 3] = v;
          arr[i * 3 + 1] = v;
          arr[i * 3 + 2] = v;
        }
        mesh.instanceColor.needsUpdate = true;
      }
      // 信号灯周期：南北放行 12s → 黄 2s → 全红 1s → 东西放行 12s → 黄 2s → 全红 1s
      {
        const p = lastT % 30;
        const nsG = p < 12;
        const nsY = p >= 12 && p < 14;
        const ewG = p >= 15 && p < 27;
        const ewY = p >= 27 && p < 29;
        const setLens = (o2, amber, green, groupGreen) => {
          const arr = o2.mesh.instanceColor.array;
          for (let i = 0; i < o2.list.length; i++) {
            const L = o2.list[i];
            const r3 = amber === "R" ? SIG_ON.r : sigOff;
            let col = r3;
            if (L.kind === "r") col = amber === "R" ? SIG_ON.r : sigOff;
            else if (L.kind === "y") col = amber === "Y" ? SIG_ON.y : sigOff;
            else if (L.kind === "g") col = amber === "G" ? SIG_ON.g : sigOff;
            else if (L.kind === "p") col = amber === "R" ? SIG_ON.p : sigOff;
            else col = amber === "R" ? sigOff : SIG_ON.pg;
            arr[i * 3] = col[0];
            arr[i * 3 + 1] = col[1];
            arr[i * 3 + 2] = col[2];
          }
          o2.mesh.instanceColor.needsUpdate = true;
        };
        if (signalLens) {
          const nsState = nsG ? "G" : nsY ? "Y" : "R";
          const ewState = ewG ? "G" : ewY ? "Y" : "R";
          // 同一张实例网格里按 group 区分两组灯
          const arr = signalLens.mesh.instanceColor.array;
          for (let i = 0; i < signalLens.list.length; i++) {
            const L = signalLens.list[i];
            const st = L.group === 0 ? nsState : ewState;
            let col = sigOff;
            if (L.kind === "r") col = st === "R" ? SIG_ON.r : sigOff;
            else if (L.kind === "y") col = st === "Y" ? SIG_ON.y : sigOff;
            else col = st === "G" ? SIG_ON.g : sigOff;
            arr[i * 3] = col[0];
            arr[i * 3 + 1] = col[1];
            arr[i * 3 + 2] = col[2];
          }
          signalLens.mesh.instanceColor.needsUpdate = true;
        }
        if (pedLens) {
          const arr = pedLens.mesh.instanceColor.array;
          for (let i = 0; i < pedLens.list.length; i++) {
            const L = pedLens.list[i];
            const walk = L.group === 0 ? !nsG && !nsY : !ewG && !ewY;
            const col = L.kind === "p" ? (walk ? sigOff : SIG_ON.p) : (walk ? SIG_ON.pg : sigOff);
            arr[i * 3] = col[0];
            arr[i * 3 + 1] = col[1];
            arr[i * 3 + 2] = col[2];
          }
          pedLens.mesh.instanceColor.needsUpdate = true;
        }
      }
      for (const s of screenEntries) {
        s.mat.uniforms.uTime.value = lastT;
        s.next -= step;
        if (s.next <= 0) {
          s.frame = (s.frame + 1 + (rng.next() * 2 | 0)) % 4;
          s.mat.uniforms.uFrame.value = s.frame;
          s.next = 1.2 + rng.next() * 2.6;
          s.mat.uniforms.uTint.value.copy(rng.chance(0.5) ? s.tintA : s.tintB);
        }
        if (s.b._state !== "alive") {
          rigidMat.compose(s.b.mesh.position, s.b.mesh.quaternion, ONE);
          tmpMat4b.multiplyMatrices(rigidMat, s.local);
          tmpMat4b.decompose(s.mesh.position, s.mesh.quaternion, s.mesh.scale);
        }
      }
      if (warnPoints) {
        const arr = warnPoints.geometry.attributes.color.array;
        const pos = warnPoints.geometry.attributes.position.array;
        let dirty = false;
        for (const b of buildings) {
          for (const a of b._attached) {
            if (a.warnIndex === void 0) continue;
            tmpMat4b.multiplyMatrices(rigidMat.compose(b.mesh.position, b.mesh.quaternion, ONE), a.local);
            tmpVec3.setFromMatrixPosition(tmpMat4b);
            pos[a.warnIndex * 3] = tmpVec3.x;
            pos[a.warnIndex * 3 + 1] = tmpVec3.y;
            pos[a.warnIndex * 3 + 2] = tmpVec3.z;
            const blink = 0.5 + 0.5 * Math.sin(lastT * 2.6 + a.warnIndex);
            const v = b.destroyed ? 0 : blink * blink * 1.6;
            arr[a.warnIndex * 3] = v;
            arr[a.warnIndex * 3 + 1] = v * 0.12;
            arr[a.warnIndex * 3 + 2] = v * 0.2;
            dirty = true;
          }
        }
        if (dirty) {
          warnPoints.geometry.attributes.position.needsUpdate = true;
          warnPoints.geometry.attributes.color.needsUpdate = true;
        }
      }
      {
        let any = false;
        for (let i = 0; i < dust.count; i++) {
          if (dust.life[i] <= 0) continue;
          any = true;
          dust.life[i] -= step;
          const k = clamp2(dust.life[i] / dust.maxLife[i], 0, 1);
          const drag = 1 - step * 0.9;
          dust.vel[i * 3] *= drag;
          dust.vel[i * 3 + 1] = dust.vel[i * 3 + 1] * drag - step * 2.4;
          dust.vel[i * 3 + 2] *= drag;
          dust.pos[i * 3] += dust.vel[i * 3] * step;
          dust.pos[i * 3 + 1] += dust.vel[i * 3 + 1] * step;
          dust.pos[i * 3 + 2] += dust.vel[i * 3 + 2] * step;
          if (dust.pos[i * 3 + 1] < 0.2) dust.pos[i * 3 + 1] = 0.2;
          if (dust.life[i] <= 0) {
            dust.pos[i * 3 + 1] = -1e3;
            dust.col[i * 3] = dust.col[i * 3 + 1] = dust.col[i * 3 + 2] = 0;
          } else {
            const f = k * k;
            dust.col[i * 3] = dust.base[i * 3] * f;
            dust.col[i * 3 + 1] = dust.base[i * 3 + 1] * f;
            dust.col[i * 3 + 2] = dust.base[i * 3 + 2] * f;
          }
        }
        if (any) {
          dust.geom.attributes.position.needsUpdate = true;
          dust.geom.attributes.color.needsUpdate = true;
        }
      }
      if (ambient) {
        const attr = ambient.geom.attributes.position;
        const arr = attr.array;
        const n = arr.length / 3;
        for (let i = 0; i < n; i++) {
          arr[i * 3] = ambient.base[i * 3] + Math.sin(lastT * 0.13 + i * 1.7) * 4.5;
          arr[i * 3 + 1] = ambient.base[i * 3 + 1] + Math.sin(lastT * 0.06 + i * 0.31) * 11 + Math.sin(lastT * 0.41 + i * 2.1) * 1.2;
          arr[i * 3 + 2] = ambient.base[i * 3 + 2] + Math.cos(lastT * 0.11 + i * 2.3) * 4.5;
        }
        attr.needsUpdate = true;
      }
      if (sweepPivot && sweepMesh) {
        sweepPivot.rotation.y = lastT * 0.04;
        const g2 = 0.5 + 0.5 * Math.sin(lastT * 0.21);
        sweepMesh.material.opacity = 0.16 + g2 * 0.26;
        sweepMesh.material.color.setHex(g2 > 0.6 ? C.NEON_PINK : C.VIOLET);
        sweepMesh.position.y = 165 + Math.sin(lastT * 0.13) * 24;
      }
      const skyMat = group.userData.skyMaterial;
      if (skyMat) {
        const k = 0.94 + 0.06 * Math.sin(lastT * 0.27);
        skyMat.color.setScalar(k);
      }
    }
    function dispose() {
      group.traverse((o2) => {
        if (o2.isInstancedMesh && typeof o2.dispose === "function") o2.dispose();
      });
      if (group.parent) group.parent.remove(group);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
      geometries.length = 0;
      materials.length = 0;
      textures.length = 0;
      buildings.length = 0;
      neonMeshes.length = 0;
      screenEntries.length = 0;
      plan.parapet.length = 0;
      plan.tank.length = 0;
      plan.mast.length = 0;
      plan.warn.length = 0;
      plan.neonV.length = 0;
      plan.neonH.length = 0;
      plan.shop.length = 0;
      dust.mesh = null;
      dust.geom = null;
      ambient = null;
      warnPoints = null;
      sweepMesh = null;
      sweepPivot = null;
    }
    // ------------------------------------------------------------------------
    //  建筑碰撞查询（供 combat.js 调用）
    //  现状：全项目没有任何「角色 vs 建筑」的移动解算 —— combat.js 里的 BuildingGrid
    //  只用于撞墙伤害与 AI 找掩体，角色可以直接走进楼里（probe-city-run 实测最深 6.3m）。
    //  这里只提供查询，不改变任何现有行为；移动解算在 combat.js 的积分步骤里调用即可：
    //      city.pushOut(c.p, CAPSULE_R);
    //  建筑都是轴对齐盒（rotY=0），所以用「AABB 最近点」推挤，角色能贴着墙面走。
    // ------------------------------------------------------------------------
    function pushOut(p, r) {
      let pushed = 0;
      const rad = r || 0.4;
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (b.destroyed) continue;
        const hx = b._w * 0.5;
        const hz = b._d * 0.5;
        const cx = clamp2(p.x, b._x - hx, b._x + hx);
        const cz = clamp2(p.z, b._z - hz, b._z + hz);
        let dx = p.x - cx;
        let dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > rad * rad) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const k = (rad - d) / d;
          p.x += dx * k;
          p.z += dz * k;
          pushed += rad - d;
        } else {
          // 圆心已经在盒子内部：沿最近的一面推出去
          const ox = hx - Math.abs(p.x - b._x);
          const oz = hz - Math.abs(p.z - b._z);
          if (ox < oz) {
            const s = p.x >= b._x ? 1 : -1;
            p.x = b._x + s * (hx + rad);
            pushed += ox + rad;
          } else {
            const s = p.z >= b._z ? 1 : -1;
            p.z = b._z + s * (hz + rad);
            pushed += oz + rad;
          }
        }
      }
      return pushed;
    }
    return {
      group,
      buildings,
      pushOut,
      groundSize: GROUND_SIZE,
      groundTexture: asphaltTex,
      update: update2,
      dispose,
      quality: quality2,
      seed,
      fog,
      stats: {
        buildings: buildings.length,
        buckets: buckets.length,
        neon: plan.neonV.length + plan.neonH.length,
        shops: plan.shop.length,
        lamps: usedLamps.length,
        debris: Q.debris,
        screens: screenEntries.length,
        draws: group.children.length
      }
    };
  }
