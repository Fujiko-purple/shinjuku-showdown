  var clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  var lerp4 = (a, b, t) => a + (b - a) * t;
  var smoother = (t) => (t = clamp01(t), t * t * t * (t * (t * 6 - 15) + 10));
  var easeOut3 = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  var easeIn = (t) => Math.pow(clamp01(t), 3);
  function makeRng2(seed) {
    let s = seed >>> 0;
    return () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }
  var V = (x, y, z) => new Vector3(x, y, z);
  var SHOTS = [
    {
      id: "aerial",
      dur: 3.4,
      pos: [V(58, 96, 128), V(30, 54, 74), V(6, 20, 42)],
      tgt: [V(-2, 30, 10), V(0, 14, 14), V(0, 3.2, 30)],
      fov: [44, 62],
      posEase: "in",
      tgtEase: "in",
      shake: 0.05,
      caption: "二〇一八年十二月二十四日",
      captionSub: "新宿 · 废墟"
    },
    {
      id: "behind",
      dur: 3.2,
      pos: [V(-9, 2.3, 52.5), V(-3.4, 2, 46), V(2.6, 1.85, 39.5)],
      tgt: [V(0, 1.6, 30), V(0, 1.7, 30), V(0, 1.85, 30)],
      fov: [36, 30],
      posEase: "out",
      shake: 0.06,
      caption: "五条悟",
      captionSub: "GOJO SATORU"
    },
    {
      id: "hands",
      dur: 3.6,
      follow: "handMid",
      pos: [V(-1.5, 1.7, 31.2), V(0.9, 1.5, 30.7), V(-0.5, 1.44, 30.9)],
      tgt: [V(-0.3, 1.34, 30.1), V(0.05, 1.3, 30.05), V(-0.2, 1.36, 30.1)],
      fov: [26, 21],
      shake: 0.09
    },
    {
      id: "eyes",
      dur: 2.4,
      pos: [V(0.5, 1.9, 28.4), V(0.8, 1.95, 28.1), V(0.3, 2, 27.9)],
      tgt: [V(0, 1.86, 30), V(0, 1.88, 30), V(0, 1.9, 30)],
      fov: [22, 17],
      posEase: "out",
      shake: 0.11,
      roll0: 0,
      roll1: -0.07
      // 特写带一点点倾斜，别太正
    },
    {
      // 环绕蓄力：相机必须拉到 10m 开外。早先只有 4.5m，而茈球半径会长到 2.8m，
      // 结果镜头等于贴在球体内侧，画面被糊成一片白。
      id: "charge",
      dur: 4.6,
      pos: [V(-7, 2.6, 22), V(-9.5, 4.2, 18.5), V(-7.5, 6.6, 24), V(-3.5, 8.2, 33)],
      tgt: [V(0, 1.6, 29.4), V(0, 1.85, 29.2), V(0, 2.15, 29), V(0, 2.35, 29)],
      fov: [34, 40],
      tgtEase: "in",
      shake: 0.16,
      caption: "虚式「茈」",
      captionSub: "HOLLOW PURPLE — 200%"
    },
    {
      id: "rise",
      dur: 2.8,
      pos: [V(0.8, 1.15, 20), V(0.4, 2.6, 21.5), V(0, 3.4, 19)],
      tgt: [V(0, 2.2, 29), V(0, 2.4, 29), V(0, 2.5, 29.2)],
      fov: [44, 76],
      posEase: "out",
      tgtEase: "out",
      roll0: 0,
      roll1: 0.12,
      shake: 0.34
    },
    {
      id: "sukuna",
      dur: 2,
      pos: [V(-3.6, 2, -36.6), V(-2.2, 1.9, -35.6), V(-1, 1.86, -34.9)],
      tgt: [V(0, 1.7, -32), V(0, 1.72, -32), V(0, 1.74, -32)],
      fov: [38, 26],
      posEase: "out",
      shake: 0.07
    },
    {
      id: "fire",
      dur: 1.9,
      /**
       * 机位必须站在街道内、又在光束辉光之外。
       * 两个边界都试过：
       *   x=11.5~13 → 相机落在辉光内部，画面被白光糊满（shots/beam-22_8）
       *   x=19~21   → 撞进沿街建筑里（city.js 的临街立面齐平 ±18m），画面变成墙面特写（shots/beam-22_2）
       * 街宽 ±18、光束辉光半径约 4.5 ⇒ x=11.5~13 是正确区间，过曝靠收细 glowWidth 解决而不是挪相机。
       */
      pos: [V(11.5, 3, 30), V(13, 3.6, 20), V(12, 4.4, 8)],
      tgt: [V(0, 2.6, 28), V(0, 2.9, 12), V(0, 3, -6)],
      fov: [62, 74],
      posEase: "out",
      roll0: -0.1,
      roll1: 0.16,
      shake: 0.95
    },
    {
      id: "travel",
      dur: 2.6,
      // 同上：与光束并行跟拍，站街道内（±18m）且保持在辉光之外
      pos: [V(15, 4.2, 22), V(15.6, 3.6, 4), V(14.4, 3.2, -14)],
      tgt: [V(0, 2.8, 14), V(0, 2.6, -4), V(0, 2.5, -20)],
      fov: [64, 70],
      shake: 0.55
    },
    {
      id: "impact",
      dur: 2.6,
      pos: [V(13, 5, -14), V(15, 6, -22), V(17.5, 8, -33)],
      tgt: [V(0, 2.2, -28), V(0, 2.6, -31), V(0, 3.2, -32)],
      fov: [56, 72],
      posEase: "out",
      shake: 1
    },
    {
      id: "shock",
      dur: 3,
      pos: [V(28, 16, -10), V(40, 30, 14), V(52, 44, 36)],
      tgt: [V(0, 6, -26), V(0, 10, -14), V(0, 14, -2)],
      fov: [72, 80],
      tgtEase: "in",
      shake: 0.7
    },
    {
      id: "settle",
      dur: 3.4,
      pos: [V(52, 40, 40), V(62, 54, 66), V(74, 68, 96), V(82, 78, 118)],
      tgt: [V(0, 12, -4), V(0, 16, 4), V(-2, 18, 14), V(-4, 16, 22)],
      fov: [80, 62],
      tgtEase: "out",
      shake: 0.05
    }
  ];
  var TOTAL_DUR = SHOTS.reduce((s, x) => s + x.dur, 0);
  var GOJO_POS = V(0, 0, 30);
  var SUKUNA_POS = V(0, 0, -32);
  var BEAM_Y = 2.35;
  var BEAM_FROM = V(0, BEAM_Y, 29.4);
  var BEAM_TO = V(0, BEAM_Y, -31);
  var CHARGE_POINT = V(0, 2.1, 29);
  function createCutscene(deps) {
    const { scene: scene2, city: city2, gojo: gojo2, sukuna: sukuna2, fx: fx2, weapons: weapons2, audio: audio2, onEvent } = deps;
    const quality2 = deps.quality || "high";
    const rng = makeRng2(6221086);
    const camera = new PerspectiveCamera(45, deps.aspect || 16 / 9, 0.2, 6e3);
    camera.up.set(0, 1, 0);
    let slot = 0;
    let slotT = 0;
    let time = 0;
    let finished = false;
    let skipped = false;
    let eventIdx = 0;
    let caption = "";
    let captionSub = "";
    const controlled = {
      blue: null,
      red: null,
      purple: null,
      beam: null,
      deadBuildings: /* @__PURE__ */ new Set()
    };
    let lastFlashT = -1;
    const shakeOff = new Vector3();
    const shakeSeed = 2654435769;
    const _pos = new Vector3();
    const _prev = new Vector3();
    const _tgt = new Vector3();
    const _tmp = new Vector3();
    const TIMELINE = [
      /* --- 1. 蓄力（6.0s ~ 15.6s） --- */
      {
        t: 6,
        name: "charge_start",
        run() {
          gojo2.play("chant", { loop: true });
          audio2?.play?.("purple_charge");
          audio2?.duck?.();
          fx2?.screen?.({ vignette: 0.35, chroma: 0.6, life: 1.2 });
          emit("charge_start");
        }
      },
      {
        t: 7.6,
        name: "blue",
        run() {
          controlled.blue = weapons2?.blue?.({
            pos: V(0.62, 1.42, 30.9),
            dir: V(0, 0, -1).normalize(),
            life: 8
          }) || null;
          fx2?.callout?.({ text: "术式顺转", sub: "苍", pos: V(0, 3.6, 30.4), color: C.CYAN, color2: C.AZURE, size: 0.62, life: 2 });
          audio2?.play?.("blue_charge");
        }
      },
      {
        t: 9.2,
        name: "red",
        run() {
          controlled.red = weapons2?.red?.({
            pos: V(-0.62, 1.42, 30.9),
            dir: V(0, 0, -1).normalize(),
            power: 0.9,
            life: 6.4
          }) || null;
          fx2?.callout?.({ text: "术式反转", sub: "赫", pos: V(0, 3, 30.4), color: C.SCARLET, color2: C.CRIMSON, size: 0.62, life: 2 });
          audio2?.play?.("red_charge");
        }
      },
      {
        t: 10.9,
        name: "merge",
        run() {
          gojo2.play("cast_charge", { loop: true });
          controlled.blue?.kill?.();
          controlled.red?.kill?.();
          controlled.blue = null;
          controlled.red = null;
          controlled.purple = weapons2?.purple?.({
            from: V(0.35, 2, 29.35),
            to: V(-0.35, 2, 29.35),
            mode: "orb",
            power: 0.25,
            life: 5.2
          }) || null;
          fx2?.sphere?.({
            pos: V(0, 2.02, 29.3),
            radius: 0.5,
            color: C.VIOLET,
            coreColor: 1179672,
            life: 5,
            charge: 0,
            distort: 0.2,
            pulse: 6
          });
          audio2?.play?.("purple_fire", { volume: 0.18 });
          emit("merge");
        }
      },
      {
        t: 11.6,
        name: "charge_grow_1",
        run() {
          gojo2.play("cast_charge", { loop: true });
          fx2?.screen?.({ radialBlur: 0.16, chroma: 0.8, life: 1.6 });
          emit("charge_grow");
        }
      },
      {
        t: 13,
        name: "charge_grow_2",
        run() {
          gojo2.setAura?.(true);
          fx2?.aura?.({ target: gojo2.root, color: C.VIOLET, scale: 2.3, life: 3.2, kind: "cursed", intensity: 1.5 });
          fx2?.groundRing?.({ pos: V(0, 0, 29.6), color: C.VIOLET, color2: C.CYAN, maxRadius: 16, life: 1.6, thickness: 0.7 });
          fx2?.lightning?.({ from: V(0.4, 3.2, 29.4), to: V(-0.3, 0.4, 30.2), color: C.VIOLET, color2: C.WHITE, branches: 4, life: 0.3 });
          emit("charge_grow");
        }
      },
      {
        t: 14.4,
        name: "charge_full",
        run() {
          gojo2.play("cast_point", { loop: true });
          audio2?.play?.("charge_ready");
          fx2?.callout?.({ text: "虚式「茈」", sub: "200%", pos: V(0, 4.8, 30), color: C.VIOLET, color2: C.WHITE, size: 1.25, life: 2.6 });
          fx2?.screen?.({ flash: 0.5, color: C.VIOLET, chroma: 1.4, radialBlur: 0.3, shake: 0.5, life: 1 });
          audio2?.duck?.();
          emit("charge_full");
        }
      },
      /**
       * --- 2. 发射 ---
       * ⚠ 时间轴必须与镜头对齐，否则会出现"播片里看不到茈的光束"。
       * 实测镜头表（shots/tl-*.png 采样）：charge 12.6-17.2 / rise 17.2-20.0 /
       * sukuna 20.0-22.0 / fire（侧向机位）22.0-23.9 / travel 23.9-26.5 / impact 26.5-29.1。
       * charge 与 rise 都是**正对五条悟**的机位，而光束朝 -z 射出、正好在镜头背后 —— 
       * 原来 release 放在 15.6，光束全程落在镜头背面，观众只能看到五条悟的背影。
       * 现在放到 20.3：宿傩镜头看它飞来 → fire 侧看它贯穿 → travel 跟着它飞 → impact 命中。
       */
      {
        t: 20.3,
        name: "release",
        run() {
          gojo2.play("cast_release", { loop: false });
          controlled.purple?.kill?.();
          controlled.purple = null;
          controlled.beam = weapons2?.purple?.({
            from: BEAM_FROM.clone(),
            to: BEAM_TO.clone(),
            mode: "line",
            power: 1.5,
            onImpact: () => emit("beam_reach")
          }) || null;
          fx2?.beam?.({
            from: BEAM_FROM.clone(),
            to: BEAM_TO.clone(),
            color: C.VIOLET,
            color2: C.WHITE,
            /**
             * 光束粗细：glowWidth 是辉光直径。
             * 原来 15 —— 在宿傩机位（距离 40~50m、fov 26~38，视野宽约 34m）里
             * 等于把整个画面填成均匀的紫白色，看不到光束的核心与边缘（shots/beam-21_4 那版）。
             * 收到 9 之后核心/辉光/背景三层能分开，压迫感还在但不糊屏。
             */
            coreWidth: 2.4,
            glowWidth: 9,
            // 寿命必须覆盖 20.3(发射) → 26.5(命中)，否则光束在 travel 镜头里就断了
            life: 6.4,
            grow: 220,
            helix: 1.4
          });
          fx2?.screen?.({ flash: 1, color: 15784191, shake: 1.6, radialBlur: 0.55, chroma: 2.2, life: 1.4 });
          audio2?.play?.("purple200_fire");
          emit("release");
        }
      },
      /* --- 3. 飞行途中一路摧毁（21.2s ~ 25.4s，分布在 sukuna / fire / travel 三个镜头里） --- */
      ...[21.2, 22.4, 24.0, 25.4].map((t, i) => ({
        t,
        name: "beam_thrash_" + i,
        run() {
          const z = lerp4(24, -18, i / 3);
          thrashCity(V(0, 0, z), 17);
          fx2?.shockwave?.({
            pos: V(0, BEAM_Y, z),
            maxRadius: 26,
            life: 0.8,
            color: C.VIOLET,
            color2: C.CRIMSON,
            thickness: 2.6,
            segments: quality2 === "low" ? 16 : 40
          });
          fx2?.debris?.({
            pos: V((rng() - 0.5) * 26, 2 + rng() * 14, z),
            color: C.CONCRETE2,
            count: quality2 === "low" ? 14 : 40,
            power: 16,
            size: 0.8,
            life: 2.4,
            up: 9
          });
          fx2?.lightning?.({
            from: V(0, BEAM_Y + 1, z),
            to: V((rng() - 0.5) * 30, 16 + rng() * 22, z - 6),
            color: C.VIOLET,
            color2: C.WHITE,
            branches: 3,
            life: 0.22
          });
          audio2?.play?.("dismantle", { volume: 0.35, rate: 0.7 });
          emit("city_thrash", { z });
        }
      })),
      /* --- 4. 命中宿傩（26.5s，对齐 impact 镜头起点） --- */
      {
        t: 26.5,
        name: "impact",
        run() {
          sukuna2.play("hit_heavy", { loop: false, speed: 0.7 });
          fx2?.screen?.({ flash: 1, color: 16777215, shake: 2.6, radialBlur: 0.8, chroma: 3, life: 1.3 });
          fx2?.shockwave?.({ pos: V(0, BEAM_Y, -31), maxRadius: 58, life: 1.5, color: C.CRIMSON, color2: 16765144, thickness: 4, segments: 48, ringCount: 3 });
          fx2?.hitSpark?.({ pos: V(0, 2.4, -31), color: 16777215, color2: C.CRIMSON, size: 4.2, count: quality2 === "low" ? 90 : 260, life: 0.9, speed: 42, spread: 1, gravity: -8 });
          fx2?.lightning?.({ from: V(0, 2.4, -31), to: V(6, 34, -22), color: C.CRIMSON, color2: C.WHITE, branches: 7, life: 0.5, width: 0.6 });
          fx2?.lightning?.({ from: V(0, 2.4, -31), to: V(-9, 26, -40), color: C.VIOLET, color2: C.WHITE, branches: 5, life: 0.5, width: 0.6 });
          fx2?.damageNumber?.({ pos: V(0, 5, -31), amount: 900, color: C.GOLD, crit: true, prefix: "200% 茈 ", life: 2.4 });
          audio2?.play?.("hit_heavy");
          audio2?.play?.("ko");
          emit("impact");
          emit("sukuna_arm_lost");
        }
      },
      /* --- 5. 二次爆散，整片街区垮塌（27.3s） --- */
      {
        t: 27.3,
        name: "city_collapse",
        run() {
          collapseArea(V(0, 0, -31), 118);
          fx2?.shockwave?.({ pos: V(0, 0.6, -31), maxRadius: 240, life: 3, color: C.CRIMSON, color2: 16769184, thickness: 6, normal: V(0, 1, 0), segments: 56, ringCount: 4 });
          fx2?.debris?.({ pos: V(0, 4, -31), color: C.CONCRETE, count: quality2 === "low" ? 90 : 320, power: 46, size: 1.3, life: 4, up: 26 });
          fx2?.groundRing?.({ pos: V(0, 0, -31), color: C.CRIMSON, color2: C.NEON_AMBER, maxRadius: 200, life: 2.6, thickness: 9 });
          fx2?.screen?.({ flash: 0.7, color: 16756848, shake: 1.8, radialBlur: 0.34, life: 2 });
          audio2?.play?.("purple200_fire", { volume: 0.75, rate: 0.75 });
          audio2?.play?.("domain_shrine", { volume: 0.3 });
          emit("city_collapse");
        }
      },
      {
        t: 30.2,
        name: "settle",
        run() {
          fx2?.screen?.({ desaturate: 0.35, vignette: 0.5, life: 2.5 });
          emit("dust_settle");
        }
      },
      {
        t: 33.2,
        name: "final_look",
        run() {
          sukuna2.play("getup", { loop: false, speed: 0.55 });
          gojo2.setAura?.(true);
          fx2?.aura?.({ target: gojo2.root, color: C.CYAN, scale: 1.8, life: 4, kind: "infinity", intensity: 0.9 });
          emit("final_look");
        }
      },
      { t: TOTAL_DUR - 0.25, name: "end", run() {
        emit("end");
      } }
    ];
    function emit(name, data) {
      if (typeof onEvent === "function") onEvent(name, data);
    }
    function thrashCity(center, radius) {
      if (!city2 || !Array.isArray(city2.buildings)) return;
      const r2 = radius * radius;
      for (let i = 0; i < city2.buildings.length; i++) {
        const b = city2.buildings[i];
        if (!b || b.destroyed) continue;
        const p = b.mesh ? b.mesh.position : b.position;
        if (!p) continue;
        const dx = p.x - center.x, dz = p.z - center.z;
        if (dx * dx + dz * dz < r2) {
          controlled.deadBuildings.add(i);
        }
      }
    }
    function collapseArea(center, radius) {
      if (!city2 || !Array.isArray(city2.buildings)) return;
      const r2 = radius * radius;
      for (let i = 0; i < city2.buildings.length; i++) {
        const b = city2.buildings[i];
        if (!b || b.destroyed) continue;
        const p = b.mesh ? b.mesh.position : b.position;
        if (!p) continue;
        const dx = p.x - center.x, dz = p.z - center.z;
        if (dx * dx + dz * dz < r2) controlled.deadBuildings.add(i);
      }
    }
    function evalPath(keys2, u) {
      if (!keys2 || keys2.length === 0) return _pos.set(0, 0, 0);
      if (keys2.length === 1) return _pos.copy(keys2[0]);
      if (keys2.length === 2) return _pos.copy(keys2[0]).lerp(keys2[1], clamp01(u));
      const n = keys2.length;
      const x = clamp01(u) * (n - 1);
      let i = Math.floor(x);
      if (i > n - 2) i = n - 2;
      const t = x - i, t2 = t * t, t3 = t2 * t;
      const p1 = keys2[i], p2 = keys2[i + 1];
      const p0 = keys2[i - 1] || p1;
      const p3 = keys2[i + 2] || p2;
      _pos.set(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      );
      return _pos;
    }
    function ease(kind, u) {
      if (kind === "in") return easeIn(u);
      if (kind === "out") return easeOut3(u);
      return smoother(u);
    }
    function update2(dt) {
      if (finished) return;
      const step = Math.min(dt, 1 / 10);
      time += step;
      slotT += step;
      const shot = SHOTS[slot];
      if (shot && slotT >= shot.dur && slot < SHOTS.length - 1) {
        slot++;
        slotT = 0;
        const next = SHOTS[slot];
        caption = next.caption || "";
        captionSub = next.captionSub || "";
        if (next.caption) emit("caption", { text: caption, sub: captionSub });
        if (typeof next.onEnter === "function") next.onEnter({ face: (yaw, fov2) => {
          camera.fov = fov2 ?? camera.fov;
        } });
      }
      while (eventIdx < TIMELINE.length && TIMELINE[eventIdx].t <= time) {
        const ev = TIMELINE[eventIdx++];
        try {
          ev.run();
        } catch (err) {
          console.warn("[cutscene] event failed:", ev.name, err);
        }
      }
      const cur = SHOTS[slot];
      if (cur) {
        const u = clamp01(slotT / cur.dur);
        const ue = ease(cur.posEase, u);
        const ut = ease(cur.tgtEase, u);
        evalPath(cur.pos, ue);
        camera.position.copy(_pos);
        if (cur.follow && gojo2) {
          const anchor = cur.follow === "handMid" ? gojo2.chest || gojo2.handR : gojo2.handR;
          if (anchor && anchor.getWorldPosition) {
            anchor.getWorldPosition(_tmp);
            if (!cur._base) {
              cur._base = _tmp.clone();
              cur._baseCam = camera.position.clone();
            }
            _tmp.sub(cur._base);
            camera.position.add(_tmp);
          }
        }
        evalPath(cur.tgt, ut);
        camera.up.set(0, 1, 0);
        const sway = (cur.shake || 0) * 0.5;
        if (sway > 1e-3) {
          const st = time;
          camera.position.x += Math.sin(st * 1.7) * sway * 0.25;
          camera.position.y += Math.sin(st * 2.3 + 0.9) * sway * 0.18;
          _tgt.x += Math.sin(st * 1.1 + 2) * sway * 0.5;
          _tgt.y += Math.sin(st * 1.9 + 0.4) * sway * 0.3;
        }
        camera.lookAt(_tgt);
        const shakeAmt = (cur.shake || 0) * (1 + (cur._impactBoost || 0));
        if (shakeAmt > 1e-3) {
          const st = time * 13;
          shakeOff.set(
            Math.sin(st * 3.7 + shakeSeed) * 0.5 + Math.sin(st * 9.1) * 0.28,
            Math.sin(st * 4.9 + 1.3) * 0.36 + Math.sin(st * 11.3) * 0.2,
            Math.sin(st * 2.9 + 2.7) * 0.4
          ).multiplyScalar(shakeAmt * 0.4);
          camera.position.add(shakeOff);
          _tgt.addScaledVector(shakeOff, 0.35);
          camera.lookAt(_tgt);
        }
        if (cur.roll !== void 0 || cur.roll1 !== void 0) {
          const r0 = cur.roll0 ?? 0;
          const r1 = cur.roll1 ?? 0;
          camera.rotateZ(lerp4(r0, r1, easeOut3(u)));
        }
        const f0 = cur.fov[0], f1 = cur.fov[1];
        camera.fov = lerp4(f0, f1, ue);
        camera.updateProjectionMatrix();
      }
      if (controlled.purple) {
        const p = clamp01((time - 10.9) / 4.7);
        const r = 0.35 + Math.pow(p, 1.7) * 2.45;
        const px2 = Math.sin(time * 9) * 0.05 * p;
        const py2 = 2.02 + Math.sin(time * 7.3) * 0.06 * p;
        controlled.purple.setPos?.(V(px2, py2, 29.3));
      }
      if (time > 11.2 && time < 15.6) {
        const p = clamp01((time - 11.2) / 4.4);
        if (rng() < 0.35 + p * 0.6) {
          const a = rng() * Math.PI * 2;
          const rr2 = 1.2 + rng() * 4.5 * (1 - p * 0.5);
          fx2?.hitSpark?.({
            pos: V(Math.cos(a) * rr2, 0.4 + rng() * 3.4, 29.3 + Math.sin(a) * rr2 * 0.8),
            color: rng() < 0.5 ? C.VIOLET : C.CYAN,
            color2: C.WHITE,
            size: 0.5 + p * 1.1,
            count: 5,
            life: 0.5,
            speed: 7,
            spread: 1,
            gravity: 3
          });
        }
        if (p > 0.45 && rng() < 0.5) {
          fx2?.debris?.({
            pos: V((rng() - 0.5) * 14, 0.2, 29.3 + (rng() - 0.5) * 10),
            color: C.CONCRETE,
            count: 3,
            power: 4 + p * 8,
            size: 0.5,
            life: 1,
            up: 5 + p * 9
          });
        }
      }
      if (time > 15.6 && time < 17.8) {
        const p = clamp01((time - 15.6) / 2.1);
        const z = lerp4(24, -26, p);
        if (Math.floor(time * 12) !== lastFlashT) {
          lastFlashT = Math.floor(time * 12);
          fx2?.hitSpark?.({
            pos: V((rng() - 0.5) * 6, BEAM_Y + (rng() - 0.5) * 5, z),
            color: C.VIOLET,
            color2: C.WHITE,
            size: 1.4,
            count: 10,
            life: 0.4,
            speed: 14,
            spread: 1
          });
        }
      }
      if (time >= TOTAL_DUR) {
        finished = true;
        emit("end");
      }
      if (skipped) finished = true;
    }
    function skip() {
      if (finished) return;
      skipped = true;
      finished = true;
      controlled.blue?.kill?.();
      controlled.red?.kill?.();
      controlled.purple?.kill?.();
      controlled.beam?.kill?.();
      controlled.blue = controlled.red = controlled.purple = controlled.beam = null;
      fx2?.clear?.();
      emit("skip");
      emit("end");
    }
    function reset() {
      slot = 0;
      slotT = 0;
      time = 0;
      finished = false;
      skipped = false;
      eventIdx = 0;
      lastFlashT = -1;
      caption = "";
      captionSub = "";
      controlled.deadBuildings.clear();
      controlled.blue?.kill?.();
      controlled.red?.kill?.();
      controlled.purple?.kill?.();
      controlled.beam?.kill?.();
      controlled.blue = controlled.red = controlled.purple = controlled.beam = null;
    }
    function getDeadBuildings() {
      return Array.from(controlled.deadBuildings);
    }
    function dispose() {
      reset();
    }
    caption = SHOTS[0].caption || "";
    captionSub = SHOTS[0].captionSub || "";
    return {
      camera,
      update: update2,
      skip,
      reset,
      dispose,
      getDeadBuildings,
      get finished() {
        return finished;
      },
      get skippable() {
        return !finished;
      },
      get time() {
        return time;
      },
      get duration() {
        return TOTAL_DUR;
      },
      get caption() {
        return caption;
      },
      get captionSub() {
        return captionSub;
      },
      get shotId() {
        return SHOTS[slot] ? SHOTS[slot].id : "end";
      },
      get progress() {
        return clamp01(time / TOTAL_DUR);
      }
    };
  }

  // vendor/examples/jsm/shaders/CopyShader.js
  var CopyShader = {
    name: "CopyShader",
    uniforms: {
      "tDiffuse": { value: null },
      "opacity": { value: 1 }
    },
    vertexShader: (
      /* glsl */
      `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`
    ),
    fragmentShader: (
      /* glsl */
      `

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`
    )
  };

  // vendor/examples/jsm/postprocessing/Pass.js
  var Pass = class {
    constructor() {
      this.isPass = true;
      this.enabled = true;
      this.needsSwap = true;
      this.clear = false;
      this.renderToScreen = false;
    }
    setSize() {
    }
    render() {
      console.error("THREE.Pass: .render() must be implemented in derived pass.");
    }
    dispose() {
    }
  };
  var _camera2 = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var FullscreenTriangleGeometry = class extends BufferGeometry {
    constructor() {
      super();
      this.setAttribute("position", new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
      this.setAttribute("uv", new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    }
  };
  var _geometry2 = new FullscreenTriangleGeometry();
  var FullScreenQuad = class {
    constructor(material) {
      this._mesh = new Mesh(_geometry2, material);
    }
    dispose() {
      this._mesh.geometry.dispose();
    }
    render(renderer) {
      renderer.render(this._mesh, _camera2);
    }
    get material() {
      return this._mesh.material;
    }
    set material(value) {
      this._mesh.material = value;
    }
  };

  // vendor/examples/jsm/postprocessing/ShaderPass.js
  var ShaderPass = class extends Pass {
    constructor(shader, textureID) {
      super();
      this.textureID = textureID !== void 0 ? textureID : "tDiffuse";
      if (shader instanceof ShaderMaterial) {
        this.uniforms = shader.uniforms;
        this.material = shader;
      } else if (shader) {
        this.uniforms = UniformsUtils.clone(shader.uniforms);
        this.material = new ShaderMaterial({
          name: shader.name !== void 0 ? shader.name : "unspecified",
          defines: Object.assign({}, shader.defines),
          uniforms: this.uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader
        });
      }
      this.fsQuad = new FullScreenQuad(this.material);
    }
    render(renderer, writeBuffer, readBuffer) {
      if (this.uniforms[this.textureID]) {
        this.uniforms[this.textureID].value = readBuffer.texture;
      }
      this.fsQuad.material = this.material;
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
        this.fsQuad.render(renderer);
      } else {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
        this.fsQuad.render(renderer);
      }
    }
    dispose() {
      this.material.dispose();
      this.fsQuad.dispose();
    }
  };

  // vendor/examples/jsm/postprocessing/MaskPass.js
  var MaskPass = class extends Pass {
    constructor(scene2, camera) {
      super();
      this.scene = scene2;
      this.camera = camera;
      this.clear = true;
      this.needsSwap = false;
      this.inverse = false;
    }
    render(renderer, writeBuffer, readBuffer) {
      const context = renderer.getContext();
      const state2 = renderer.state;
      state2.buffers.color.setMask(false);
      state2.buffers.depth.setMask(false);
      state2.buffers.color.setLocked(true);
      state2.buffers.depth.setLocked(true);
      let writeValue, clearValue;
      if (this.inverse) {
        writeValue = 0;
        clearValue = 1;
      } else {
        writeValue = 1;
        clearValue = 0;
      }
      state2.buffers.stencil.setTest(true);
      state2.buffers.stencil.setOp(context.REPLACE, context.REPLACE, context.REPLACE);
      state2.buffers.stencil.setFunc(context.ALWAYS, writeValue, 4294967295);
      state2.buffers.stencil.setClear(clearValue);
      state2.buffers.stencil.setLocked(true);
      renderer.setRenderTarget(readBuffer);
      if (this.clear) renderer.clear();
      renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      renderer.render(this.scene, this.camera);
      state2.buffers.color.setLocked(false);
      state2.buffers.depth.setLocked(false);
      state2.buffers.color.setMask(true);
      state2.buffers.depth.setMask(true);
      state2.buffers.stencil.setLocked(false);
      state2.buffers.stencil.setFunc(context.EQUAL, 1, 4294967295);
      state2.buffers.stencil.setOp(context.KEEP, context.KEEP, context.KEEP);
      state2.buffers.stencil.setLocked(true);
    }
  };
  var ClearMaskPass = class extends Pass {
    constructor() {
      super();
      this.needsSwap = false;
    }
    render(renderer) {
      renderer.state.buffers.stencil.setLocked(false);
      renderer.state.buffers.stencil.setTest(false);
    }
  };

  // vendor/examples/jsm/postprocessing/EffectComposer.js
  var EffectComposer = class {
    constructor(renderer, renderTarget) {
      this.renderer = renderer;
      this._pixelRatio = renderer.getPixelRatio();
      if (renderTarget === void 0) {
        const size = renderer.getSize(new Vector2());
        this._width = size.width;
        this._height = size.height;
        renderTarget = new WebGLRenderTarget(this._width * this._pixelRatio, this._height * this._pixelRatio, { type: HalfFloatType });
        renderTarget.texture.name = "EffectComposer.rt1";
      } else {
        this._width = renderTarget.width;
        this._height = renderTarget.height;
      }
      this.renderTarget1 = renderTarget;
      this.renderTarget2 = renderTarget.clone();
      this.renderTarget2.texture.name = "EffectComposer.rt2";
      this.writeBuffer = this.renderTarget1;
      this.readBuffer = this.renderTarget2;
      this.renderToScreen = true;
      this.passes = [];
      this.copyPass = new ShaderPass(CopyShader);
      this.copyPass.material.blending = NoBlending;
      this.clock = new Clock();
    }
    swapBuffers() {
      const tmp2 = this.readBuffer;
      this.readBuffer = this.writeBuffer;
      this.writeBuffer = tmp2;
    }
    addPass(pass) {
      this.passes.push(pass);
      pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
    }
    insertPass(pass, index) {
      this.passes.splice(index, 0, pass);
      pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
    }
    removePass(pass) {
      const index = this.passes.indexOf(pass);
      if (index !== -1) {
        this.passes.splice(index, 1);
      }
    }
    isLastEnabledPass(passIndex) {
      for (let i = passIndex + 1; i < this.passes.length; i++) {
        if (this.passes[i].enabled) {
          return false;
        }
      }
      return true;
    }
    render(deltaTime) {
      if (deltaTime === void 0) {
        deltaTime = this.clock.getDelta();
      }
      const currentRenderTarget = this.renderer.getRenderTarget();
      let maskActive = false;
      for (let i = 0, il = this.passes.length; i < il; i++) {
        const pass = this.passes[i];
        if (pass.enabled === false) continue;
        pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
        pass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime, maskActive);
        if (pass.needsSwap) {
          if (maskActive) {
            const context = this.renderer.getContext();
            const stencil = this.renderer.state.buffers.stencil;
            stencil.setFunc(context.NOTEQUAL, 1, 4294967295);
            this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime);
            stencil.setFunc(context.EQUAL, 1, 4294967295);
          }
          this.swapBuffers();
        }
        if (MaskPass !== void 0) {
          if (pass instanceof MaskPass) {
            maskActive = true;
          } else if (pass instanceof ClearMaskPass) {
            maskActive = false;
          }
        }
      }
      this.renderer.setRenderTarget(currentRenderTarget);
    }
    reset(renderTarget) {
      if (renderTarget === void 0) {
        const size = this.renderer.getSize(new Vector2());
        this._pixelRatio = this.renderer.getPixelRatio();
        this._width = size.width;
        this._height = size.height;
        renderTarget = this.renderTarget1.clone();
        renderTarget.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
      }
      this.renderTarget1.dispose();
      this.renderTarget2.dispose();
      this.renderTarget1 = renderTarget;
      this.renderTarget2 = renderTarget.clone();
      this.writeBuffer = this.renderTarget1;
      this.readBuffer = this.renderTarget2;
    }
    setSize(width, height) {
      this._width = width;
      this._height = height;
      const effectiveWidth = this._width * this._pixelRatio;
      const effectiveHeight = this._height * this._pixelRatio;
      this.renderTarget1.setSize(effectiveWidth, effectiveHeight);
      this.renderTarget2.setSize(effectiveWidth, effectiveHeight);
      for (let i = 0; i < this.passes.length; i++) {
        this.passes[i].setSize(effectiveWidth, effectiveHeight);
      }
    }
    setPixelRatio(pixelRatio) {
      this._pixelRatio = pixelRatio;
      this.setSize(this._width, this._height);
    }
    dispose() {
      this.renderTarget1.dispose();
      this.renderTarget2.dispose();
      this.copyPass.dispose();
    }
  };

  // vendor/examples/jsm/postprocessing/RenderPass.js
  var RenderPass = class extends Pass {
    constructor(scene2, camera, overrideMaterial = null, clearColor = null, clearAlpha = null) {
      super();
      this.scene = scene2;
      this.camera = camera;
      this.overrideMaterial = overrideMaterial;
      this.clearColor = clearColor;
      this.clearAlpha = clearAlpha;
      this.clear = true;
      this.clearDepth = false;
      this.needsSwap = false;
      this._oldClearColor = new Color();
    }
    render(renderer, writeBuffer, readBuffer) {
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      let oldClearAlpha, oldOverrideMaterial;
      if (this.overrideMaterial !== null) {
        oldOverrideMaterial = this.scene.overrideMaterial;
        this.scene.overrideMaterial = this.overrideMaterial;
      }
      if (this.clearColor !== null) {
        renderer.getClearColor(this._oldClearColor);
        renderer.setClearColor(this.clearColor);
      }
      if (this.clearAlpha !== null) {
        oldClearAlpha = renderer.getClearAlpha();
        renderer.setClearAlpha(this.clearAlpha);
      }
      if (this.clearDepth == true) {
        renderer.clearDepth();
      }
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      if (this.clear === true) {
        renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      }
      renderer.render(this.scene, this.camera);
      if (this.clearColor !== null) {
        renderer.setClearColor(this._oldClearColor);
      }
      if (this.clearAlpha !== null) {
        renderer.setClearAlpha(oldClearAlpha);
      }
      if (this.overrideMaterial !== null) {
        this.scene.overrideMaterial = oldOverrideMaterial;
      }
      renderer.autoClear = oldAutoClear;
    }
  };

  // vendor/examples/jsm/shaders/OutputShader.js
  var OutputShader = {
    name: "OutputShader",
    uniforms: {
      "tDiffuse": { value: null },
      "toneMappingExposure": { value: 1 }
    },
    vertexShader: (
      /* glsl */
      `
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`
    ),
    fragmentShader: (
      /* glsl */
      `
	
		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = OptimizedCineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`
    )
  };

  // vendor/examples/jsm/postprocessing/OutputPass.js
  var OutputPass = class extends Pass {
    constructor() {
      super();
      const shader = OutputShader;
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.material = new RawShaderMaterial({
        name: shader.name,
        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader
      });
      this.fsQuad = new FullScreenQuad(this.material);
      this._outputColorSpace = null;
      this._toneMapping = null;
    }
    render(renderer, writeBuffer, readBuffer) {
      this.uniforms["tDiffuse"].value = readBuffer.texture;
      this.uniforms["toneMappingExposure"].value = renderer.toneMappingExposure;
      if (this._outputColorSpace !== renderer.outputColorSpace || this._toneMapping !== renderer.toneMapping) {
        this._outputColorSpace = renderer.outputColorSpace;
        this._toneMapping = renderer.toneMapping;
        this.material.defines = {};
        if (ColorManagement.getTransfer(this._outputColorSpace) === SRGBTransfer) this.material.defines.SRGB_TRANSFER = "";
        if (this._toneMapping === LinearToneMapping) this.material.defines.LINEAR_TONE_MAPPING = "";
        else if (this._toneMapping === ReinhardToneMapping) this.material.defines.REINHARD_TONE_MAPPING = "";
        else if (this._toneMapping === CineonToneMapping) this.material.defines.CINEON_TONE_MAPPING = "";
        else if (this._toneMapping === ACESFilmicToneMapping) this.material.defines.ACES_FILMIC_TONE_MAPPING = "";
        else if (this._toneMapping === AgXToneMapping) this.material.defines.AGX_TONE_MAPPING = "";
        this.material.needsUpdate = true;
      }
      if (this.renderToScreen === true) {
        renderer.setRenderTarget(null);
        this.fsQuad.render(renderer);
      } else {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
        this.fsQuad.render(renderer);
      }
    }
    dispose() {
      this.material.dispose();
      this.fsQuad.dispose();
    }
  };
