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
    const HIP_Y = isGojo ? 1.0 : 0.995;
    const shoulders = isGojo ? 0.2 : 0.212;   // 肩点横向距离
    const hipX = 0.105;

    const hips = mk("hips", root, 0, HIP_Y, 0);
    const core = mk("core", hips, 0, 0.12, 0);
    const chest = mk("chest", core, 0, 0.15, 0);
    const neck = mk("neck", chest, 0, 0.2, 0);
    const head = mk("head", neck, 0, 0.09, 0);

    const mkArm = (side, tag) => {
      const s = side;
      const sh = mk("shoulder" + tag, chest, s * shoulders, 0.155, 0);
      const ua = mk("upperArm" + tag, sh, 0, -0.02, 0);
      const fa = mk("foreArm" + tag, ua, 0, -0.3, 0);
      const hd = mk("hand" + tag, fa, 0, -0.285, 0);
      const gp = new Object3D();
      gp.name = "grip" + tag;
      gp.position.set(0, -0.055, 0);
      hd.add(gp);
      return { sh, ua, fa, hd, gp };
    };
    const armL = mkArm(1, "L");
    const armR = mkArm(-1, "R");

    const mkLeg = (side, tag) => {
      const s = side;
      const th = mk("thigh" + tag, hips, s * hipX, -0.055, 0);
      const sn = mk("shin" + tag, th, 0, -0.455, 0);
      const ft = mk("foot" + tag, sn, 0, -0.425, 0);
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
      b.parts.push({ geo, color, m });
      if (opt && opt.main) b.outline = true;
      return b;
    };
    const putMany = (boneName, matKey, list, opt) => {
      for (const it of list) put(boneName, matKey, it[0], it[1], it[2], opt);
    };

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
      put("chest", "body", new CylinderGeometry(0.079, 0.092, 0.13, q.radial, 1, true), C_COLLAR,
        partM(0, 0.225, -0.004), { main: true });
      put("chest", "body", new CylinderGeometry(0.056, 0.062, 0.1, q.radial, 1), C_COAT_D,
        partM(0, 0.2, -0.004), { main: false });
      // 背后下摆稍长一点，剪影更像外套
      put("hips", "body", boxGeo(0.28, 0.14, 0.06), C_COAT, partM(0, -0.06, -0.12, 0.12, 0, 0, 1, 1, 1));

      /* ---- 头 ---- */
      const HR = 0.107;
      const HC = 0.118;                        // 颅骨中心相对 head 骨骼
      const HS = [1.0, 1.15, 1.06];            // 颅骨椭球缩放
      put("head", "body", blobC(HR * 2, HR * 2, HR * 2, q), C_SKIN, partM(0, HC, -0.004, 0, 0, 0, HS[0], HS[1], HS[2]), { main: true });
      put("head", "body", blobC(0.176, 0.15, 0.2, q), C_SKIN, partM(0, HC - 0.062, 0.012, 0, 0, 0, 1, 1, 1));
      put("head", "body", blobC(0.198, 0.13, 0.176, q), C_SKIN, partM(0, HC - 0.026, 0.006, 0, 0, 0, 1, 1, 1));
      for (const s of [1, -1]) {
        put("head", "body", blobC(0.036, 0.062, 0.05, q), C_SKIN, partM(s * 0.102, HC - 0.012, -0.006, 0, 0, 0, 1, 1, 1));
      }
      put("neck", "body", new CylinderGeometry(0.05, 0.058, 0.13, q.radial, 1), C_SKIN, partM(0, 0.005, 0, 0, 0, 0, 1, 1, 0.9));

      /* ---- 头发：白色竖立的刺状短发，合并成一个网格 ---- */
      const hairGroup = new Group();
      hairGroup.name = "hair";
      head.add(hairGroup);
      const hairParts = [];
      // 发帽：盖住颅骨上部的壳
      hairParts.push([spherePatch(HR * 1.035, Math.PI / 2, Math.PI * 2, 0.0, 1.02, q, q.radial + 2), 16316671,
        partM(0, HC, -0.004, 0, 0, 0, HS[0] * 1.0, HS[1] * 1.0, HS[2] * 1.0)]);
      hairParts.push([blobC(0.2, 0.13, 0.2, q), 15198183, partM(0, HC + 0.035, -0.04, 0, 0, 0, 1, 1, 1)]);
      // 发刺：一圈向上炸开的锥体
      const nHair = q.hair;
      for (let i = 0; i < nHair; i++) {
        const a = (i / nHair) * Math.PI * 2 + 0.35;
        const ring = i % 2;
        const rr = ring ? 0.062 : 0.088;
        const len = (ring ? 0.115 : 0.15) * (0.85 + ((i * 37) % 11) / 22);
        const rad = ring ? 0.032 : 0.038;
        const px = Math.sin(a) * rr;
        const pz = Math.cos(a) * rr * 0.94 - 0.012;
        const py = HC + 0.1 + (ring ? 0.012 : -0.006);
        // 刺的方向：向外倾斜 + 略微前倾
        const tiltX = -Math.cos(a) * 0.42 - 0.1;
        const tiltZ = Math.sin(a) * 0.42;
        hairParts.push([new ConeGeometry(rad, len, q.seg > 6 ? 5 : 4, 1), 16777215,
          partM(px, py, pz, tiltX, 0, tiltZ, 1, 1, 1)]);
      }
      // 鬓角
      for (const s of [1, -1]) {
        hairParts.push([new ConeGeometry(0.026, 0.1, 4, 1), 15790320, partM(s * 0.098, HC + 0.02, 0.03, 0.5, 0, s * 0.35)]);
      }
      hairParts.push([new ConeGeometry(0.03, 0.12, 4, 1), 15790320, partM(0, HC + 0.03, -0.09, -0.9, 0, 0)]);
      for (const it of hairParts) put("hair", "hair", it[0], it[1], it[2], { main: true });
      hairTips.push({ mesh: hairGroup, base: hairGroup.rotation.clone(), lag: 1 });

      /* ---- 眼罩 / 六眼 ---- */
      // 眼罩：球面带，覆盖额头到眼下方
      const bfMesh = new Mesh(
        spherePatch(HR * 1.05, Math.PI / 2, Math.PI * 2, 0.28, 1.14, q, q.radial + 4),
        M.blindfold
      );
      bfMesh.position.set(0, HC, -0.004);
      bfMesh.scale.set(HS[0], HS[1], HS[2]);
      bfMesh.name = "blindfoldMesh";
      head.add(bfMesh);
      meshBag.push(bfMesh);
      // 脑后的布结
      put("head", "body", blobC(0.07, 0.07, 0.06, q), 1315860, partM(0, HC + 0.01, -0.115, 0, 0, 0, 1, 1, 1));
      // 六眼辉光：贴在眼睛位置的球面贴片（加法混合）
      const TH_EYE = 1.33;
      const glowParts = [];
      for (const s of [1, -1]) {
        const dphi = s * 0.41;
        glowParts.push([spherePatch(HR * 1.06, Math.PI / 2 + dphi, 0.46, TH_EYE - 0.16, 0.34, q, q.radial),
          C.CYAN, partM(0, HC, -0.004, 0, 0, 0, HS[0], HS[1], HS[2])]);
      }
      const glowMesh = new Mesh(mergeParts(glowParts), M.eyeGlow);
      glowMesh.name = "eyeHalo";
      glowMesh.visible = false;
      glowMesh.renderOrder = 4;
      head.add(glowMesh);
      meshBag.push(glowMesh);

      /* ---- 手臂 ---- */
      for (const tag of ["L", "R"]) {
        const s = tag === "L" ? 1 : -1;
        put("shoulder" + tag, "body", blobC(0.155, 0.16, 0.16, q), C_COAT, partM(0, 0.005, 0, 0, 0, s * 0.1), { main: true });
        put("upperArm" + tag, "body", limbC(0.07, 0.058, 0.305, q, 1.02), C_COAT, partM(0, -0.145, 0, 0, 0, 0), { main: true });
        put("foreArm" + tag, "body", limbC(0.06, 0.047, 0.29, q, 0.98), C_COAT, partM(0, -0.14, 0, 0, 0, 0), { main: true });
        put("foreArm" + tag, "body", new CylinderGeometry(0.055, 0.049, 0.05, q.radial, 1), C_COLLAR, partM(0, -0.245, 0));
        put("hand" + tag, "body", blobC(0.075, 0.098, 0.052, q), C_SKIN, partM(0, -0.05, 0.004));
        put("hand" + tag, "body", blobC(0.066, 0.05, 0.048, q), C_SKIN, partM(0, -0.095, 0.008));
      }

      /* ---- 腿：长裤 + 战术靴 ---- */
      for (const tag of ["L", "R"]) {
        put("thigh" + tag, "body", limbC(0.098, 0.076, 0.46, q, 1.04), C_PANTS, partM(0, -0.225, 0), { main: true });
        put("shin" + tag, "body", limbC(0.078, 0.058, 0.43, q, 1.0), C_PANTS, partM(0, -0.212, 0), { main: true });
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
      // 交叠的衣襟：左右各一片斜板，读到"和服"靠的就是它
      put("chest", "body", boxGeo(0.2, 0.42, 0.03), C_ROBE, partM(-0.045, -0.03, 0.128, 0.06, 0, 0.3));
      put("chest", "body", boxGeo(0.2, 0.42, 0.03), C_ROBE_D, partM(0.055, -0.035, 0.118, 0.06, 0, -0.32));
      put("chest", "body", boxGeo(0.22, 0.06, 0.04), C_ROBE_D, partM(0, 0.17, 0.1, 0.25, 0, 0));
      // 后领
      put("chest", "body", new CylinderGeometry(0.086, 0.1, 0.11, q.radial, 1, true), C_ROBE,
        partM(0, 0.215, -0.006, 0, 0, 0), { main: true });
      // 胸口的黑色纵纹（宿傩纹身）
      put("chest", "body", stripGeo(0.26, 0.02, 0.014), C_TAT, partM(0, -0.02, 0.145));
      put("chest", "body", stripGeo(0.02, 0.14, 0.014), C_TAT, partM(0.055, -0.06, 0.14, 0, 0, 0.25));
      put("core", "body", stripGeo(0.15, 0.018, 0.012), C_TAT, partM(0, 0.005, 0.128));

      /* ---- 头 ---- */
      const HR = 0.109;
      const HC = 0.12;
      const HS = [1.0, 1.14, 1.06];
      put("head", "body", blobC(HR * 2, HR * 2, HR * 2, q), C_SKIN, partM(0, HC, -0.004, 0, 0, 0, HS[0], HS[1], HS[2]), { main: true });
      put("head", "body", blobC(0.182, 0.15, 0.205, q), C_SKIN, partM(0, HC - 0.062, 0.014, 0, 0, 0, 1, 1, 1));
      put("head", "body", blobC(0.204, 0.13, 0.18, q), C_SKIN, partM(0, HC - 0.026, 0.008, 0, 0, 0, 1, 1, 1));
      for (const s of [1, -1]) {
        put("head", "body", blobC(0.038, 0.066, 0.052, q), C_SKIN, partM(s * 0.105, HC - 0.012, -0.006, 0, 0, 0, 1, 1, 1));
      }
      // 下颌与颊侧的纹身
      put("head", "body", stripGeo(0.05, 0.016, 0.012), C_TAT, partM(0, HC + 0.028, 0.104));
      put("neck", "body", new CylinderGeometry(0.054, 0.062, 0.135, q.radial, 1), C_SKIN, partM(0, 0.005, 0, 0, 0, 0, 1, 1, 0.9), { main: true });

      /* ---- 头发：樱色短发，向后扬 ---- */
      const hairGroup = new Group();
      hairGroup.name = "hair";
      head.add(hairGroup);
      const hairParts = [];
      hairParts.push([spherePatch(HR * 1.035, Math.PI / 2, Math.PI * 2, 0.0, 1.0, q, q.radial + 2), C_HAIR,
        partM(0, HC, -0.004, 0, 0, 0, HS[0], HS[1], HS[2])]);
      hairParts.push([blobC(0.208, 0.15, 0.212, q), C_HAIR, partM(0, HC + 0.028, -0.038, 0, 0, 0, 1, 1, 1)]);
      const nHair = q.hair;
      for (let i = 0; i < nHair; i++) {
        const a = (i / nHair) * Math.PI * 2 + 0.2;
        const ring = i % 2;
        const rr = ring ? 0.058 : 0.086;
        const len = (ring ? 0.1 : 0.135) * (0.85 + ((i * 53) % 11) / 22);
        const rad = ring ? 0.03 : 0.036;
        const px = Math.sin(a) * rr;
        const pz = Math.cos(a) * rr * 0.95 - 0.014;
        const py = HC + 0.105 + (ring ? 0.008 : -0.008);
        // 向后倒的发刺
        const tiltX = -Math.cos(a) * 0.5 - 0.35;
        const tiltZ = Math.sin(a) * 0.5;
        hairParts.push([new ConeGeometry(rad, len, q.seg > 6 ? 5 : 4, 1), i % 3 === 0 ? 12345776 : C_HAIR,
          partM(px, py, pz, tiltX, 0, tiltZ)]);
      }
      for (const it of hairParts) put("hair", "hair", it[0], it[1], it[2], { main: true });
      hairTips.push({ mesh: hairGroup, base: hairGroup.rotation.clone(), lag: 1 });

      // 真身额上的第二对眼
      const eyePairParts = [];
      for (const s of [1, -1]) {
        const dphi = s * 0.42;
        eyePairParts.push([spherePatch(HR * 1.045, Math.PI / 2 + dphi, 0.44, 0.92, 0.3, q, q.radial),
          C_SKIN, partM(0, HC, -0.004, 0, 0, 0, HS[0], HS[1], HS[2])]);
      }
      const eyePair = new Mesh(mergeParts(eyePairParts), M.eyePair);
      eyePair.name = "eyePair";
      eyePair.visible = false;
      eyePair.renderOrder = 3;
      head.add(eyePair);
      meshBag.push(eyePair);

      /* ---- 手臂：裸露 + 黑色纹身环 ---- */
      for (const tag of ["L", "R"]) {
        const s = tag === "L" ? 1 : -1;
        put("shoulder" + tag, "body", blobC(0.168, 0.17, 0.17, q), C_ROBE, partM(0, 0.005, 0, 0, 0, s * 0.1), { main: true });
        put("upperArm" + tag, "body", limbC(0.078, 0.062, 0.3, q, 1.05), C_ROBE, partM(0, -0.1, 0, 0, 0, 0), { main: true });
        put("upperArm" + tag, "body", limbC(0.066, 0.058, 0.12, q, 1.0), C_SKIN, partM(0, -0.24, 0, 0, 0, 0));
        put("foreArm" + tag, "body", limbC(0.064, 0.05, 0.29, q, 1.0), C_SKIN, partM(0, -0.14, 0, 0, 0, 0), { main: true });
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
        put("thigh" + tag, "body", limbC(0.104, 0.08, 0.46, q, 1.05), C_SKIN, partM(0, -0.225, 0), { main: true });
        put("shin" + tag, "body", limbC(0.082, 0.06, 0.43, q, 1.0), C_SKIN, partM(0, -0.212, 0), { main: true });
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
        put("arm2" + tag + "1", "body", limbC(0.068, 0.056, 0.29, q, 1.03), C_SKIN, partM(0, -0.14, 0, 0, 0, 0));
        put("arm2" + tag + "1", "body", new CylinderGeometry(0.0695, 0.0675, 0.02, q.radial, 1), C_TAT, partM(0, -0.245, 0));
        put("arm2" + tag + "2", "body", limbC(0.058, 0.047, 0.28, q, 1.0), C_SKIN, partM(0, -0.135, 0, 0, 0, 0));
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
    const hemCount = isGojo ? (q.cloth ? 8 : 4) : (q.cloth ? 10 : 5);
    const hemMat = isGojo ? "body" : "robe";
    for (let i = 0; i < hemCount; i++) {
      const a = i / hemCount * Math.PI * 2;
      const isGojoHem = isGojo;
      const pw = isGojoHem ? 0.19 : 0.2;
      const ph = isGojoHem ? 0.3 : 0.5;
      const pg = new PlaneGeometry(pw, ph, 1, q.cloth ? 3 : 1);
      const p = new Mesh(pg, isGojo ? M.body : M.robe);
      const rIn = isGojoHem ? 0.15 : 0.175;
      p.position.set(Math.sin(a) * rIn, isGojoHem ? -0.14 : -0.27, Math.cos(a) * rIn * 0.86);
      p.rotation.y = a;
      // 衣服本体颜色靠顶点色给：与合并网格一套材质
      const cols = new Float32Array(pg.attributes.position.count * 3);
      const c = new Color(isGojo ? (i % 2 ? 1316369 : 2171957) : C_ROBE);
      for (let k = 0; k < pg.attributes.position.count; k++) {
        cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
      }
      pg.setAttribute("color", new BufferAttribute(cols, 3));
      bones.hips.add(p);
      cloth.push({ mesh: p, base: p.rotation.clone(), basePos: p.position.clone(), amp: isGojo ? 0.18 : 0.3, axis: "x", phase: a });
      meshBag.push(p);
      void hemMat;
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
        om.scale.setScalar(b.outline ? 1.055 : 1.07);
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

    /* ---------------- 领域纹样 / 外壳 ---------------- */
    let shellMesh = null;
    if (q.shell) {
      const sg = new CapsuleGeometry(0.4, 0.82, q.seg, q.radial);
      const cols = new Float32Array(sg.attributes.position.count * 3);
      const pos = sg.attributes.position;
      const ca = new Color(0), cb = new Color(16777215), ct = new Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        ct.copy(ca).lerp(cb, clamp5((y + 0.5) / 1.0, 0, 1));
        cols[i * 3] = ct.r; cols[i * 3 + 1] = ct.g; cols[i * 3 + 2] = ct.b;
      }
      sg.setAttribute("color", new BufferAttribute(cols, 3));
      shellMesh = new Mesh(sg, M.shell);
      shellMesh.position.set(0, 0.62, 0);
      shellMesh.scale.set(1, 1, 0.72);
      shellMesh.visible = false;
      shellMesh.renderOrder = 5;
      root.add(shellMesh);
    }
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
        m.position.set(x, y, z);
        m.visible = false;
        m.renderOrder = 6;
        parent.add(m);
        runes.push(m);
      }
    }

    /* ---------------- 落地阴影：让角色有重量 ---------------- */
    let shadowMesh = null;
    if (q.shadow !== false) {
      const pgeo = new PlaneGeometry(1.42, 1.1);
      shadowMesh = new Mesh(pgeo, M.shadow);
      shadowMesh.name = "contactShadow";
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, 0.014, 0.02);
      shadowMesh.renderOrder = 1;
      root.add(shadowMesh);
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
      shadow: shadowMesh
    };
  }
