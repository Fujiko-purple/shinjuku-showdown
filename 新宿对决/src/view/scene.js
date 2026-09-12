/**
 * view/scene.js —— 表现层（three.js）：角色外观 / 术式 / 领域 / 特效 / 机位
 * ----------------------------------------------------------------------------
 * 铁律 1：只读 sim 的 state 与事件，绝不反过来改逻辑。
 * 外观按 research/E-manga-art-refs.md 的"剪影特征"拼：
 *   五条：尖刺外翘白发 + 眼部黑横带 + 黑色高立领 + 超长腿
 *   宿傩：短刺发 + 脸上交叉黑纹 + 眼下第二对眼 + 黑指甲 + 深色和服
 *   魔虚罗：头顶金色法轮(8 辐条 + 8 圆珠) + 无眼 + 四枚长角 + 宽肩窄腰 + 黑下装 + 长尾
 */
function createSceneView(canvas) {
  var renderer = new WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setClearColor(0x05070d, 1);
  var scene = new Scene();
  scene.fog = new Fog(0x05070d, 26, 90);
  var camera = new PerspectiveCamera(44, 16 / 9, 0.1, 400);

  scene.add(new HemisphereLight(0x9fc6ff, 0x141a26, 0.7));
  var key = new DirectionalLight(0xfff0dd, 1.15); key.position.set(7, 14, 9); scene.add(key);
  var rimL = new DirectionalLight(0x5ff0ff, 0.95); rimL.position.set(-9, 6, -8); scene.add(rimL);
  var rimR = new DirectionalLight(0xff3b52, 0.8); rimR.position.set(9, 5, -8); scene.add(rimR);
  var fill = new DirectionalLight(0xbcd2ff, 0.4); fill.position.set(0, 3, 12); scene.add(fill);

  var ground = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: 0x12161f, roughness: 0.96, metalness: 0.04 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  var grid = new GridHelper(200, 100, 0x243049, 0x161d2b); grid.position.y = 0.01; scene.add(grid);
  var ring = new Mesh(new RingGeometry(11.6, 12, 128), new MeshBasicMaterial({ color: 0x2b4a6b, transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
  /** 场地道具：给距离感与纵深（没有参照物的空地对动作游戏是灾难） */
  for (var pi = 0; pi < 10; pi++) {
    var ang0 = (pi / 10) * Math.PI * 2 + 0.3;
    var rr = 15 + (pi % 3) * 3.5;
    var hh = 5 + (pi % 4) * 2.4;
    var pil = new Mesh(new BoxGeometry(1.4 + (pi % 3) * 0.6, hh, 1.4 + (pi % 2) * 0.8), new MeshStandardMaterial({ color: 0x1b2130, roughness: 0.9, metalness: 0.06 }));
    pil.position.set(Math.cos(ang0) * rr, hh / 2, Math.sin(ang0) * rr);
    scene.add(pil);
    var cap = new Mesh(new BoxGeometry(2.0, 0.22, 2.0), new MeshBasicMaterial({ color: pi % 2 ? 0x2b86ff : 0xff2b3a, transparent: true, opacity: 0.5 }));
    cap.position.y = hh / 2 + 0.2; pil.add(cap);
  }

  /* ---------------- 材质工具 ---------------- */
  function mat(color, emissive, emiIntensity) {
    var m = new MeshStandardMaterial({ color: color, roughness: 0.52, metalness: 0.12 });
    if (emissive !== undefined) { m.emissive = new Color(emissive); m.emissiveIntensity = emiIntensity === undefined ? 0.6 : emiIntensity; }
    return m;
  }
  function boxMesh(w, h, d, m) { var x = new Mesh(new BoxGeometry(w, h, d), m); return x; }
  function sphere(r, m, seg) { return new Mesh(new SphereGeometry(r, seg || 16, seg ? seg - 2 : 14), m); }
  function capsule(r, len, m) { return new Mesh(new CapsuleGeometry(r, len, 6, 14), m); }

  /* ---------------- 五条悟 ---------------- */
  function buildGojo() {
    var g = new Group();
    var skin = mat(0xe6c9b4), cloth = mat(0x232a36), accent = mat(0x11141a);
    var torso = capsule(0.3, 0.5, cloth); torso.position.y = 1.25; g.add(torso);
    var collar = boxMesh(0.56, 0.34, 0.4, cloth); collar.position.y = 1.66; g.add(collar);   // 又高又厚的立领
    var hips = boxMesh(0.46, 0.3, 0.34, cloth); hips.position.y = 0.98; g.add(hips);
    var legs = new Group();
    var lL = capsule(0.11, 0.72, cloth); lL.position.set(-0.15, 0.52, 0); legs.add(lL);
    var lR = capsule(0.11, 0.72, cloth); lR.position.set(0.15, 0.52, 0); legs.add(lR);
    g.add(legs);
    var arms = new Group();
    function gojoArm(side) {
      var pivot = new Group(); pivot.position.set(side * 0.42, 1.52, 0);
      var upper = capsule(0.085, 0.5, cloth); upper.position.y = -0.26; pivot.add(upper);
      var hand = sphere(0.09, skin); hand.position.y = -0.55; pivot.add(hand);
      arms.add(pivot); return pivot;
    }
    var armL = gojoArm(-1), armR = gojoArm(1);
    g.add(arms);
    var head = sphere(0.19, skin); head.position.y = 1.98; g.add(head);
    var hair = new Group();
    for (var i = 0; i < 9; i++) {
      var spike = new Mesh(new ConeGeometry(0.07, 0.34, 6), mat(0xf4f7ff));
      var ang = (i / 9) * Math.PI * 2;
      spike.position.set(Math.cos(ang) * 0.13, 2.16 + (i % 2) * 0.03, Math.sin(ang) * 0.13);
      spike.rotation.set(Math.cos(ang) * 0.55, 0, -Math.sin(ang) * 0.55);
      hair.add(spike);
    }
    var cap = sphere(0.17, mat(0xeef3ff)); cap.position.y = 2.06; hair.add(cap);
    g.add(hair);
    var blind = boxMesh(0.42, 0.1, 0.06, mat(0x0a0b10)); blind.position.set(0, 2.0, 0.17); g.add(blind);   // 眼罩横带
    var aura = new Mesh(new SphereGeometry(0.62, 16, 12), new MeshBasicMaterial({ color: 0x5ff0ff, transparent: true, opacity: 0.07 }));
    aura.position.y = 1.3; g.add(aura);
    return { group: g, torso: torso, arms: arms, armL: armL, armR: armR, legs: legs, head: head, blind: blind, aura: aura, hair: hair };
  }
  /* ---------------- 两面宿傩 ---------------- */
  function buildSukuna() {
    var g = new Group();
    var skin = mat(0xc99a7c), cloth = mat(0x2a1420), accent = mat(0x0a0a0f);
    var torso = capsule(0.32, 0.5, cloth); torso.position.y = 1.24; g.add(torso);
    var kimono = boxMesh(0.74, 0.88, 0.44, cloth); kimono.position.y = 1.14; g.add(kimono);
    var sash = boxMesh(0.76, 0.16, 0.46, mat(0x7a1220)); sash.position.y = 1.0; g.add(sash);   // 腰带
    var hips = boxMesh(0.5, 0.3, 0.36, cloth); hips.position.y = 0.96; g.add(hips);
    var legs = new Group();
    var lL = capsule(0.115, 0.72, cloth); lL.position.set(-0.16, 0.5, 0); legs.add(lL);
    var lR = capsule(0.115, 0.72, cloth); lR.position.set(0.16, 0.5, 0); legs.add(lR);
    g.add(legs);
    var arms = new Group();
    function sukunaArm(side) {
      var pivot = new Group(); pivot.position.set(side * 0.44, 1.5, 0);
      var upper = capsule(0.095, 0.5, skin); upper.position.y = -0.26; pivot.add(upper);
      var hand = sphere(0.1, accent); hand.position.y = -0.56; pivot.add(hand);   // 黑指甲
      arms.add(pivot); return pivot;
    }
    var armL = sukunaArm(-1), armR = sukunaArm(1);
    g.add(arms);
    var head = sphere(0.2, skin); head.position.y = 1.97; g.add(head);
    var hair2 = new Group();
    for (var i = 0; i < 8; i++) {
      var sp = new Mesh(new ConeGeometry(0.07, 0.24, 6), mat(0xd97b86));
      var a2 = (i / 8) * Math.PI * 2;
      sp.position.set(Math.cos(a2) * 0.14, 2.12, Math.sin(a2) * 0.14);
      sp.rotation.set(Math.cos(a2) * 0.7, 0, -Math.sin(a2) * 0.7);
      hair2.add(sp);
    }
    g.add(hair2);
    // 脸上交叉黑纹 + 眼下第二对眼
    var t1 = boxMesh(0.035, 0.26, 0.03, accent); t1.position.set(-0.08, 1.99, 0.17); t1.rotation.z = 0.4; g.add(t1);
    var t2 = boxMesh(0.035, 0.26, 0.03, accent); t2.position.set(0.08, 1.99, 0.17); t2.rotation.z = -0.4; g.add(t2);
    var e1 = boxMesh(0.09, 0.045, 0.03, mat(0xff2b3a, 0xff2b3a, 1.1)); e1.position.set(-0.07, 2.03, 0.18); g.add(e1);
    var e2 = boxMesh(0.09, 0.045, 0.03, mat(0xff2b3a, 0xff2b3a, 1.1)); e2.position.set(0.07, 2.03, 0.18); g.add(e2);
    var e3 = boxMesh(0.07, 0.035, 0.03, mat(0xff6a52, 0xff6a52, 1.0)); e3.position.set(-0.1, 1.96, 0.19); g.add(e3);
    var e4 = boxMesh(0.07, 0.035, 0.03, mat(0xff6a52, 0xff6a52, 1.0)); e4.position.set(0.1, 1.96, 0.19); g.add(e4);
    var aura = new Mesh(new SphereGeometry(0.66, 16, 12), new MeshBasicMaterial({ color: 0xff1f3d, transparent: true, opacity: 0.06 }));
    aura.position.y = 1.3; g.add(aura);
    return { group: g, torso: torso, arms: arms, armL: armL, armR: armR, legs: legs, head: head, aura: aura, hair: hair2 };
  }

  var figures = { gojo: buildGojo(), sukuna: buildSukuna() };
  /** 脚下彩色圆盘：同屏两个角色的第一识别手段 */
  function footDisc(color) {
    var d = new Mesh(new RingGeometry(0.52, 0.8, 32), new MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6, side: 2 }));
    d.rotation.x = -Math.PI / 2; d.position.y = 0.03; scene.add(d); return d;
  }
  figures.gojo.disc = footDisc(0x5ff0ff);
  figures.sukuna.disc = footDisc(0xff1f3d);
  figures.gojo.group.scale.setScalar(1.12);
  figures.sukuna.group.scale.setScalar(1.12);
  scene.add(figures.gojo.group); scene.add(figures.sukuna.group);

  /* ---------------- 魔虚罗（无血条怪：法轮 / 四角 / 马步 / 长尾） ---------------- */
  var maho = null;
  function buildMahoraga() {
    var g = new Group();
    var bone = mat(0xe9eae2), dark = mat(0x101014), gold = mat(0xd9a441, 0xd9a441, 0.35);
    var torso = capsule(0.46, 0.72, bone); torso.position.y = 2.25; g.add(torso);
    var shoulder = boxMesh(1.5, 0.34, 0.6, bone); shoulder.position.y = 2.78; g.add(shoulder);
    var hips = boxMesh(0.72, 0.44, 0.5, bone); hips.position.y = 1.72; g.add(hips);
    var skirt = new Mesh(new CylinderGeometry(0.62, 0.9, 0.8, 8, 1, true), dark); skirt.position.y = 1.25; g.add(skirt);
    var legs = new Group();
    var lL = capsule(0.16, 0.72, bone); lL.position.set(-0.34, 0.62, 0); legs.add(lL);
    var lR = capsule(0.16, 0.72, bone); lR.position.set(0.34, 0.62, 0); legs.add(lR);
    g.add(legs);
    var head = sphere(0.3, bone); head.position.y = 3.28; g.add(head);
    var jaw = boxMesh(0.42, 0.12, 0.3, bone); jaw.position.set(0, 3.13, 0.12); g.add(jaw);
    for (var t = 0; t < 4; t++) {
      var horn = new Mesh(new ConeGeometry(0.075, t < 2 ? 2.1 : 1.0, 6), bone);
      var side = t % 2 === 0 ? -1 : 1;
      horn.position.set(side * 0.24, 3.5 + (t < 2 ? 0.9 : 0.35), (t < 2 ? -0.05 : 0.12));
      horn.rotation.z = side * (t < 2 ? 0.42 : 0.9);
      g.add(horn);
    }
    var wheel = new Group();
    var rim = new Mesh(new TorusGeometry(0.62, 0.06, 8, 28), gold); rim.rotation.x = Math.PI / 2; wheel.add(rim);
    for (var s = 0; s < 8; s++) {
      var ang2 = (s / 8) * Math.PI * 2;
      var spoke = boxMesh(0.06, 0.06, 1.2, gold); spoke.rotation.y = ang2; wheel.add(spoke);
      var orb = sphere(0.11, gold, 10); orb.position.set(Math.cos(ang2) * 0.72, 0, Math.sin(ang2) * 0.72); wheel.add(orb);
    }
    wheel.position.y = 4.34; g.add(wheel);
    var tail = capsule(0.08, 1.1, bone); tail.position.set(0, 1.2, -0.7); tail.rotation.x = 1.1; g.add(tail);
    var sword = boxMesh(0.06, 0.06, 2.5, mat(0xd8dde6, 0xd8dde6, 0.25)); sword.position.set(0.72, 1.4, 0.5); sword.rotation.x = 1.35; g.add(sword);
    g.visible = false;
    scene.add(g);
    return { group: g, wheel: wheel, legs: legs };
  }

  /* ---------------- 弹道 / 领域 / 火花 ---------------- */
  var projPool = [];
  function getProj(i) {
    if (projPool[i]) return projPool[i];
    var m = sphere(0.5, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), 14);
    var halo = sphere(0.85, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }), 12);
    var g = new Group(); g.add(m); g.add(halo); g.visible = false; scene.add(g);
    projPool[i] = { group: g, core: m, halo: halo };
    return projPool[i];
  }
  var domainMesh = { sphere: null, shrine: null, anchors: [] };
  function ensureDomain() {
    if (!domainMesh.sphere) {
      domainMesh.sphere = new Mesh(new SphereGeometry(1, 24, 18), new MeshBasicMaterial({ color: 0x0b1030, transparent: true, opacity: 0.55, side: 1 }));
      domainMesh.sphere.visible = false; scene.add(domainMesh.sphere);
      /** 边界：没有这层线框，黑球在夜景里根本看不见（截图实测） */
      domainMesh.rim = new Mesh(new SphereGeometry(1.005, 18, 12), new MeshBasicMaterial({ color: 0x7fb0ff, wireframe: true, transparent: true, opacity: 0.28 }));
      domainMesh.rim.visible = false; scene.add(domainMesh.rim);
      var shrine = new Group();
      for (var i = 0; i < 3; i++) {
        /** 锚点必须"隔着半个场地也能一眼看到"：亮红柱 + 白骨山 + 底部光环 + 数字提示 */
        var pillar = new Group();
        var shaft = boxMesh(0.9, 9, 0.9, new MeshStandardMaterial({ color: 0x8c1220, roughness: 0.6, emissive: new Color(0x5a0710), emissiveIntensity: 0.9 }));
        shaft.position.y = 4.5; pillar.add(shaft);
        var cowl = boxMesh(2.4, 1.0, 2.4, new MeshStandardMaterial({ color: 0x2a0a0e, roughness: 0.8 }));
        cowl.position.y = 9.2; pillar.add(cowl);
        var bone = sphere(1.15, new MeshBasicMaterial({ color: 0xe8e2d4, transparent: true, opacity: 0.92 }), 10);
        bone.position.y = 10.2; pillar.add(bone);
        var halo = new Mesh(new RingGeometry(1.8, 2.6, 28), new MeshBasicMaterial({ color: 0xff3b52, transparent: true, opacity: 0.75, side: 2 }));
        halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; pillar.add(halo);
        shrine.add(pillar);
        domainMesh.anchors.push(pillar);
      }
      /** 开放领域的作用范围：地面染红 + 外沿红环（没有这个，玩家不知道"外沿"在哪） */
      var floor = new Mesh(new CircleGeometry(1, 48), new MeshBasicMaterial({ color: 0x5a0710, transparent: true, opacity: 0.5 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.04; shrine.add(floor);
      var edge = new Mesh(new RingGeometry(0.975, 1, 64), new MeshBasicMaterial({ color: 0xff3b52, transparent: true, opacity: 0.9, side: 2 }));
      edge.rotation.x = -Math.PI / 2; edge.position.y = 0.05; shrine.add(edge);
      shrine.visible = false; scene.add(shrine);
      domainMesh.shrine = shrine; domainMesh.shrineFloor = floor; domainMesh.shrineEdge = edge;
    }
  }
  var sparks = [], sparkGeo = new SphereGeometry(0.13, 8, 6);
  for (var si = 0; si < 64; si++) {
    var sm = new Mesh(sparkGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    sm.visible = false; scene.add(sm); sparks.push({ mesh: sm, t: 0, vx: 0, vy: 0, vz: 0 });
  }
  var sparkAt = 0;
  function burst(x, y, z, color, count, power, up) {
    for (var i = 0; i < count; i++) {
      var s = sparks[(sparkAt = (sparkAt + 1) % sparks.length)];
      s.mesh.visible = true; s.mesh.position.set(x, y, z);
      s.mesh.material.color.setHex(color); s.mesh.material.opacity = 1;
      s.vx = (Math.random() - 0.5) * power; s.vy = (up || 0.4) * power * Math.random(); s.vz = (Math.random() - 0.5) * power;
      s.t = 0.5; s.max = 0.5;
    }
  }
  var shake = 0, shakeMax = 0;
  function onEvents(evs, st) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], d = e.data || {};
      if (e.type === "hit") {
        burst(d.x, d.heavy ? 1.35 : 1.15, d.z, d.bf ? 0x1a1a1a : 0xffd873, d.heavy ? 14 : 7, d.heavy ? 7 : 4.5);
        if (d.bf) burst(d.x, 1.2, d.z, 0xff2b3a, 18, 9);
        shake = Math.min(0.8, shake + (d.heavy ? 0.4 : 0.16)); shakeMax = 0.8;
      } else if (e.type === "parry") { burst(d.x, 1.25, d.z, 0x5ff0ff, 18, 6); shake = Math.min(0.9, shake + 0.35); }
      else if (e.type === "broken") { burst(d.x, 1.3, d.z, 0xffd873, 22, 7); shake = Math.min(1, shake + 0.5); }
      else if (e.type === "execute") { burst(d.x, 1.3, d.z, 0xff1f3d, 30, 10); shake = 1; }
      else if (e.type === "blackflash") { shake = 1; }
      else if (e.type === "domain") { shake = 0.9; }
      else if (e.type === "mahodead") { burst(d.x, 2.5, d.z, 0xffd873, 40, 12); shake = 1; }
      else if (e.type === "mahoint") { burst(d.x, 3, d.z, 0x5ff0ff, 20, 8); shake = 0.6; }
      else if (e.type === "dodged") { burst(d.x, 0.8, d.z, 0x9aa8c0, 5, 3); }
      else if (e.type === "explode") { burst(d.x, 1, d.z, 0xff8a3d, 24, 9); shake = 0.7; }
    }
  }

  /* ---------------- 每帧 ---------------- */
  var t0 = 0;
  function update(st, evs, dt) {
    t0 += dt;
    onEvents(evs, st);
    var f0 = st.fighters[0], f1 = st.fighters[1];
    [f0, f1].forEach(function (f) {
      var fig = figures[f.id];
      if (!fig) return;
      fig.group.position.set(f.x, 0, f.z);
      fig.group.rotation.y = f.facing + Math.PI;
      // 受击/架势崩坏/冻结的姿态
      var lean = f.hitstun > 0 ? -0.28 : f.broken > 0 ? 0.5 : 0;
      fig.torso.rotation.x = fig.torso.rotation.x * 0.7 + lean * 0.3;
      fig.head.rotation.x = fig.head.rotation.x * 0.7 + lean * 0.4;
      if (f.broken > 0) fig.group.position.y = -0.35;
      // 出招动画：起手抬臂 / 判定挥出 / 后摇回收
      /** 挥击：绕"肩关节"转（绕身体中心转会把手臂甩出去 —— 截图里手脚飞出体外的那个 bug） */
      var punch = 0;
      var melee = f.move === "light1" || f.move === "light2" || f.move === "light3" || f.move === "heavy" || f.move === "cleave";
      if (melee) punch = f.phase === "startup" ? -0.9 * Math.min(1, f.t / 9) : f.phase === "active" ? 1.25 : Math.max(0, 1.05 - f.t / 18);
      else if (f.move) punch = f.phase === "startup" ? -0.55 : 0.6;
      if (fig.armR) {
        fig.armR.rotation.x = fig.armR.rotation.x * 0.55 + punch * 0.45;
        fig.armL.rotation.x = fig.armL.rotation.x * 0.55 - punch * 0.16;
        fig.arms.position.z = fig.arms.position.z * 0.6 + Math.max(0, punch) * 0.2;
      }
      var bob = Math.sin(t0 * 3 + (f.side ? 1.5 : 0)) * 0.02;
      fig.group.scale.setScalar(1);
      fig.group.position.y += bob + (f.broken > 0 ? 0 : 0);
      fig.aura.material.opacity = (f.zoneT > 0 ? 0.2 : 0.07) + (f.iframes > 0 ? 0.12 : 0);
      fig.aura.material.color.setHex(f.zoneT > 0 ? 0xffd873 : 0x5ff0ff);
    });
    // 弹道
    for (var i = 0; i < projPool.length; i++) if (projPool[i]) projPool[i].group.visible = false;
    for (var j = 0; j < st.projectiles; j++) { /* 数量由 sim 给，位置由下面的详细状态补 */ }
    var simProj = (MAIN && MAIN.world && MAIN.world.projectiles) ? MAIN.world.projectiles() : [];
    for (var k = 0; k < simProj.length; k++) {
      var p = simProj[k], pv = getProj(k);
      pv.group.visible = true;
      pv.group.position.set(p.x, p.y, p.z);
      pv.core.material.color.setHex(p.color);
      pv.halo.material.color.setHex(p.color);
      var sc = p.radius / 0.5;
      pv.group.scale.setScalar(sc);
    }
    // 领域
    ensureDomain();
    var doms = st.domains || [];
    domainMesh.sphere.visible = false;
    if (domainMesh.rim) domainMesh.rim.visible = false;
    var shrineDom = null;
    for (var di = 0; di < doms.length; di++) {
      var d = doms[di];
      if (d.kind === "void") {
        var owner = d.owner === 0 ? f0 : f1;
        domainMesh.sphere.visible = true;
        domainMesh.sphere.position.set(owner.x, 3.2, owner.z);
        domainMesh.sphere.scale.setScalar(d.radius);
        domainMesh.rim.visible = true;
        domainMesh.rim.position.copy(domainMesh.sphere.position);
        domainMesh.rim.scale.setScalar(d.radius * (1 + Math.sin(t0 * 2) * 0.004));
      } else shrineDom = d;
    }
    if (shrineDom) {
      var owner2 = shrineDom.owner === 0 ? f0 : f1;
      domainMesh.shrine.visible = true;
      domainMesh.shrine.position.set(owner2.x, 0, owner2.z);
      domainMesh.shrineFloor.scale.setScalar(shrineDom.radius);
      domainMesh.shrineEdge.scale.setScalar(shrineDom.radius);
      var pulse = 1 + Math.sin(t0 * 3) * 0.01;
      domainMesh.shrineEdge.scale.setScalar(shrineDom.radius * pulse);
      for (var ai = 0; ai < domainMesh.anchors.length; ai++) {
        var an = domainMesh.anchors[ai];
        var alive = ai < shrineDom.anchors;
        an.visible = true;                       // 打掉的锚点保留"残骸"（变暗），玩家才知道打掉了一个
        var a3 = (ai / domainMesh.anchors.length) * Math.PI * 2 + 0.5;
        an.position.set(Math.cos(a3) * shrineDom.radius * 0.82, 0, Math.sin(a3) * shrineDom.radius * 0.82);
        an.scale.setScalar(alive ? 1 : 0.55);
        an.traverse(function (o) { if (o.isMesh && o.material && o.material.opacity !== undefined) { if (!alive && o.material.transparent) o.material.opacity = 0.12; } });
      }
    } else if (domainMesh.shrine) domainMesh.shrine.visible = false;
    // 魔虚罗
    if (st.maho && st.maho.alive) {
      if (!maho) maho = buildMahoraga();
      maho.group.visible = true;
      maho.group.position.set(st.maho.x, 0, st.maho.z);
      maho.wheel.rotation.y += dt * (1.2 + st.maho.adapt.melee * 4);
      var hover = st.maho.state === "down" ? 0 : st.maho.y;
      maho.group.position.y = st.maho.state === "down" ? 0 : (st.maho.y - 4.5) * 0.0 + (st.maho.state === "air" || st.maho.state === "adapting" ? Math.sin(t0 * 1.5) * 0.15 : 0);
      maho.group.rotation.y = Math.atan2(f0.x - st.maho.x, f0.z - st.maho.z) + Math.PI;
      maho.group.scale.setScalar(st.maho.state === "down" ? 0.86 : 1);
    } else if (maho) maho.group.visible = false;

    for (var s2 = 0; s2 < sparks.length; s2++) {
      var sp2 = sparks[s2];
      if (sp2.t <= 0) { if (sp2.mesh.visible) sp2.mesh.visible = false; continue; }
      sp2.t -= dt;
      sp2.mesh.position.x += sp2.vx * dt; sp2.mesh.position.y += sp2.vy * dt; sp2.mesh.position.z += sp2.vz * dt;
      sp2.vy -= 11 * dt;
      sp2.mesh.material.opacity = Math.max(0, sp2.t / (sp2.max || 0.5));
      if (sp2.t <= 0) sp2.mesh.visible = false;
    }
    // 机位：从斜侧看两人中点，按距离拉远（可读优先）
    var mx = (f0.x + f1.x) / 2, mz = (f0.z + f1.z) / 2;
    var dd = Math.hypot(f0.x - f1.x, f0.z - f1.z);
    /** 机位：下限收紧到 6.8 —— 角色必须占住画面足够高度才看得清动作 */
    var camDist = 6.8 + dd * 0.5;
    var sx = mx + camDist * 0.42 + (Math.random() - 0.5) * shake * 0.4, sz = mz + camDist * 0.9;
    camera.position.lerp(new Vector3(sx, 2.6 + camDist * 0.2, sz), 0.12);
    camera.lookAt(mx, 1.15, mz);
    shake = Math.max(0, shake - dt * 2.6);
    ring.position.set(f0.x, 0.02, f0.z);
    figures.gojo.disc.position.set(f0.x, 0.03, f0.z);
    figures.sukuna.disc.position.set(f1.x, 0.03, f1.z);
    figures.gojo.disc.material.opacity = 0.42 + (f0.zoneT > 0 ? 0.4 : 0);
    figures.sukuna.disc.material.opacity = 0.42 + (f1.zoneT > 0 ? 0.4 : 0);
  }
  function resize(w, h) {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function render() { renderer.render(scene, camera); }
  return { update: update, resize: resize, render: render, renderer: renderer };
}
