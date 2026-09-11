      /* ---- 头 ---- */
      const HR = 0.104;                        // 颅骨半径
      const HC = 0.116;                        // 颅骨中心相对 head 骨骼
      const HS = [1.0, 1.16, 1.05];            // 颅骨椭球缩放
      const HEAD_R = [HR * HS[0], HR * HS[1], HR * HS[2]];
      // 颅骨 + 颧骨 + 下颌：三段椭球叠出人头的体积
      put("head", "body", blobC(HR * 2, HR * 2, HR * 2, q), C_SKIN, partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2]), { main: true });
      put("head", "body", blobC(0.19, 0.128, 0.174, q), C_SKIN, partM(0, HC - 0.024, 0.006, 0, 0, 0, 1, 1, 1));
      put("head", "body", blobC(0.163, 0.15, 0.192, q), C_SKIN, partM(0, HC - 0.062, 0.012, 0, 0, 0, 1, 1, 1));
      for (const s of [1, -1]) {
        put("head", "body", blobC(0.032, 0.058, 0.046, q), C_SKIN, partM(s * 0.099, HC - 0.014, -0.012, 0, 0, 0, 1, 1, 1));
      }
      put("neck", "body", new CylinderGeometry(0.048, 0.058, 0.13, q.radial, 1), C_SKIN, partM(0, 0.005, 0, 0, 0, 0, 1, 1, 0.92), { main: true });

      /* ---- 脸：两张球面贴片（戴眼罩 / 六眼），切换只换可见性 ---- */
      const FACE_PHI = 1.46;
      const FACE_TH0 = 0.76;
      const FACE_THL = 1.68;
      const faceGeo = spherePatch(HR * 1.018, Math.PI / 2, FACE_PHI, FACE_TH0, FACE_THL, q, q.radial + 2);
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
      bfMesh = new Mesh(spherePatch(HR * 1.05, Math.PI / 2, Math.PI * 2, 0.2, 1.24, q, q.radial + 4), M.blindfold);
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
      // 六眼辉光：贴在眼睛位置的球面贴片（加法混合）
      const TH_EYE = 1.33;
      const glowParts = [];
      for (const s of [1, -1]) {
        glowParts.push([spherePatch(HR * 1.055, Math.PI / 2 + s * 0.4, 0.44, TH_EYE - 0.15, 0.3, q, q.radial),
          C.CYAN, partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2])]);
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
      hairParts.push([spherePatch(HR * 1.03, Math.PI / 2, Math.PI * 2, 0.0, 0.86, q, q.radial + 2), 16777215,
        partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2])]);
      hairParts.push([blobC(0.2, 0.145, 0.2, q), 15790320, partM(0, HC + 0.022, -0.038, 0, 0, 0, 1, 1, 1)]);
      const hairCol = [16777215, 16777215, 15856113];
      const nHair = q.hair;
      const rings = [
        { n: Math.round(nHair * 0.42), rr: 0.072, py: HC + 0.072, len: 0.155, rad: 0.044, tilt: 0.5, lean: 0.1 },
        { n: Math.round(nHair * 0.36), rr: 0.05, py: HC + 0.108, len: 0.17, rad: 0.04, tilt: 0.34, lean: 0.16 },
        { n: Math.round(nHair * 0.22), rr: 0.022, py: HC + 0.128, len: 0.16, rad: 0.036, tilt: 0.16, lean: 0.2 }
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
      // 前刘海：额前一排短刺，压住发际线
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.36;
        hairParts.push([new ConeGeometry(0.034, 0.11, 5, 1), 16777215,
          partM(Math.sin(a) * 0.062, HC + 0.062, Math.cos(a) * 0.062 - 0.004, 0.62, 0, -Math.sin(a) * 0.3)]);
      }
      // 鬓角
      for (const s of [1, -1]) {
        hairParts.push([new ConeGeometry(0.024, 0.085, 4, 1), 15790320, partM(s * 0.094, HC + 0.026, 0.028, 0.42, 0, s * 0.3)]);
        hairParts.push([new ConeGeometry(0.022, 0.075, 4, 1), 15066597, partM(s * 0.088, HC + 0.028, -0.05, -0.3, 0, s * 0.35)]);
      }
      for (const it of hairParts) put("hair", "hair", it[0], it[1], it[2], { main: true });
      hairTips.push({ mesh: hairGroup, base: hairGroup.rotation.clone(), lag: 1 });

