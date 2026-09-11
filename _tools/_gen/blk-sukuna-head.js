      /* ---- 头 ---- */
      const HR = 0.106;
      const HC = 0.118;
      const HS = [1.0, 1.15, 1.05];
      put("head", "body", blobC(HR * 2, HR * 2, HR * 2, q), C_SKIN, partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2]), { main: true });
      put("head", "body", blobC(0.196, 0.13, 0.178, q), C_SKIN, partM(0, HC - 0.024, 0.006, 0, 0, 0, 1, 1, 1));
      put("head", "body", blobC(0.168, 0.152, 0.196, q), C_SKIN, partM(0, HC - 0.062, 0.012, 0, 0, 0, 1, 1, 1));
      for (const s of [1, -1]) {
        put("head", "body", blobC(0.034, 0.06, 0.048, q), C_SKIN, partM(s * 0.101, HC - 0.014, -0.012, 0, 0, 0, 1, 1, 1));
      }
      // 下颌与颊侧的纹身线
      put("head", "body", stripGeo(0.042, 0.015, 0.012), C_TAT, partM(0, HC - 0.052, 0.1));
      put("neck", "body", new CylinderGeometry(0.052, 0.062, 0.135, q.radial, 1), C_SKIN, partM(0, 0.005, 0, 0, 0, 0, 1, 1, 0.92), { main: true });

      /* ---- 脸：一张球面贴片（含猩红眼与面纹）---- */
      const FACE_PHI = 1.5;
      const FACE_TH0 = 0.72;
      const FACE_THL = 1.74;
      faceMesh = new Mesh(spherePatch(HR * 1.018, Math.PI / 2, FACE_PHI, FACE_TH0, FACE_THL, q, q.radial + 2), M.face);
      faceMesh.position.set(0, HC, -0.006);
      faceMesh.scale.set(HS[0], HS[1], HS[2]);
      faceMesh.name = "faceBlind";
      head.add(faceMesh);
      meshBag.push(faceMesh);
      // 真身额上的第二对眼：一整块球面贴片，纹理里画了两只眼
      eyePair = new Mesh(spherePatch(HR * 1.035, Math.PI / 2, 1.16, 0.88, 0.42, q, q.radial + 2), M.eyePair);
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
      hairParts.push([spherePatch(HR * 1.03, Math.PI / 2, Math.PI * 2, 0.0, 0.9, q, q.radial + 2), C_HAIR,
        partM(0, HC, -0.006, 0, 0, 0, HS[0], HS[1], HS[2])]);
      hairParts.push([blobC(0.204, 0.15, 0.206, q), C_HAIR, partM(0, HC + 0.024, -0.04, 0, 0, 0, 1, 1, 1)]);
      const nHair = q.hair;
      const rings = [
        { n: Math.round(nHair * 0.45), rr: 0.07, py: HC + 0.074, len: 0.16, rad: 0.042, tilt: 0.45, lean: -0.34 },
        { n: Math.round(nHair * 0.33), rr: 0.05, py: HC + 0.108, len: 0.17, rad: 0.038, tilt: 0.3, lean: -0.42 },
        { n: Math.round(nHair * 0.22), rr: 0.024, py: HC + 0.126, len: 0.15, rad: 0.034, tilt: 0.14, lean: -0.5 }
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
            hi % 3 === 0 ? 12345776 : C_HAIR,
            partM(Math.sin(a) * R2.rr, R2.py, Math.cos(a) * R2.rr * 0.95 - 0.01,
              R2.lean + Math.cos(a) * R2.tilt, 0, -Math.sin(a) * R2.tilt)]);
          hi++;
        }
      }
      // 额前的分头尖：一撮向前下压的刘海
      for (let i = -1; i <= 1; i++) {
        const a = i * 0.34;
        hairParts.push([new ConeGeometry(0.03, 0.085, 5, 1), C_HAIR,
          partM(Math.sin(a) * 0.06, HC + 0.07, Math.cos(a) * 0.06 - 0.004, 0.85, 0, -Math.sin(a) * 0.28)]);
      }
      for (const s of [1, -1]) {
        hairParts.push([new ConeGeometry(0.024, 0.09, 4, 1), 12345776, partM(s * 0.092, HC + 0.028, 0.03, 0.35, 0, s * 0.3)]);
        hairParts.push([new ConeGeometry(0.022, 0.1, 4, 1), C_HAIR, partM(s * 0.086, HC + 0.026, -0.048, -0.55, 0, s * 0.32)]);
      }
      for (const it of hairParts) put("hair", "hair", it[0], it[1], it[2], { main: true });
      hairTips.push({ mesh: hairGroup, base: hairGroup.rotation.clone(), lag: 1 });

