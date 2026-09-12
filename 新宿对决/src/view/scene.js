/**
 * view/scene.js —— 表现层（three.js）
 * ----------------------------------------------------------------------------
 * 铁律 1：这里只读 sim 的 state 与事件，绝不反过来改逻辑。
 * M0 的外观是"能读懂战斗"优先：胶囊人 + 朝向锥 + 命中火花 + 可读机位。
 */
function createSceneView(canvas) {
  var renderer = new WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setClearColor(0x070a12, 1);
  var scene = new Scene();
  scene.fog = new Fog(0x070a12, 22, 70);
  var camera = new PerspectiveCamera(46, 16 / 9, 0.1, 400);

  var hemi = new HemisphereLight(0x9fc6ff, 0x1a1f2e, 0.75);
  scene.add(hemi);
  var key = new DirectionalLight(0xffe6c8, 1.1);
  key.position.set(6, 12, 8);
  scene.add(key);
  var rim = new DirectionalLight(0x5ff0ff, 0.5);
  rim.position.set(-8, 6, -10);
  scene.add(rim);

  var ground = new Mesh(new PlaneGeometry(160, 160), new MeshStandardMaterial({ color: 0x161a24, roughness: 0.95, metalness: 0.05 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  var grid = new GridHelper(160, 80, 0x2a3550, 0x1b2233);
  grid.position.y = 0.01;
  scene.add(grid);
  /** 12m 资源线：让"距离即资源"变成看得见的东西 */
  var ring = new Mesh(new RingGeometry(11.7, 12, 96), new MeshBasicMaterial({ color: 0x2b4a6b, transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  function makeFigure(color) {
    var g = new Group();
    var body = new Mesh(new CapsuleGeometry(0.42, 1.0, 6, 16), new MeshStandardMaterial({ color: color, roughness: 0.45, metalness: 0.1 }));
    body.position.y = 0.95;
    g.add(body);
    var head = new Mesh(new SphereGeometry(0.26, 18, 14), new MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.4 }));
    head.position.y = 1.78;
    g.add(head);
    var nose = new Mesh(new ConeGeometry(0.12, 0.4, 10), new MeshBasicMaterial({ color: color }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.35, 0.42);
    g.add(nose);
    var shadow = new Mesh(new CircleGeometry(0.6, 20), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    g.add(shadow);
    scene.add(g);
    return { group: g, body: body, nose: nose };
  }
  var figs = { gojo: makeFigure(CHARACTERS.gojo.color), sukuna: makeFigure(CHARACTERS.sukuna.color) };
  var facing = { gojo: Math.PI / 2, sukuna: -Math.PI / 2 };

  /** 命中火花 / 招架护盾：表现层自己池化，逻辑层不关心 */
  var sparks = [];
  var sparkGeo = new SphereGeometry(0.16, 10, 8);
  for (var i = 0; i < 24; i++) {
    var m = new Mesh(sparkGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    sparks.push({ mesh: m, t: 0 });
  }
  var sparkAt = 0;
  function burst(x, y, z, color, count, power) {
    for (var i = 0; i < count; i++) {
      var s = sparks[sparkAt = (sparkAt + 1) % sparks.length];
      s.mesh.visible = true;
      s.mesh.position.set(x, y, z);
      s.mesh.material.color.setHex(color);
      s.mesh.material.opacity = 1;
      s.vx = (Math.random() - 0.5) * power;
      s.vy = Math.random() * power * 0.6;
      s.vz = (Math.random() - 0.5) * power;
      s.t = 0.45;
    }
  }
  function tickSparks(dt) {
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      if (s.t <= 0) { if (s.mesh.visible) s.mesh.visible = false; continue; }
      s.t -= dt;
      s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt; s.mesh.position.z += s.vz * dt;
      s.vy -= 9 * dt;
      s.mesh.material.opacity = Math.max(0, s.t / 0.45);
      if (s.t <= 0) s.mesh.visible = false;
    }
  }

  var shake = 0;
  function onEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], d = e.data;
      if (e.type === "hit") {
        var f = d.by === "gojo" ? figs.gojo : figs.sukuna;
        var p = (d.by === "gojo" ? stateRef[0].x + stateRef[1].x : stateRef[0].x + stateRef[1].x) / 2;
        burst((d.by === "gojo" ? stateRef[1].x : stateRef[0].x), 1.2, (d.by === "gojo" ? stateRef[1].z : stateRef[0].z), 0xffd873, d.heavy ? 10 : 5, d.heavy ? 6 : 4);
        shake = Math.min(0.5, shake + (d.heavy ? 0.3 : 0.12));
      } else if (e.type === "parry") {
        burst((d.by === "gojo" ? stateRef[0].x : stateRef[1].x), 1.2, 0, 0x5ff0ff, 12, 5);
        shake = Math.min(0.6, shake + 0.25);
      } else if (e.type === "dodged") {
        burst(d.by === "gojo" ? stateRef[0].x : stateRef[1].x, 0.7, 0, 0x9aa8c0, 4, 3);
      }
    }
  }

  var stateRef = [null, null];
  function update(st, evs, dt) {
    stateRef = st.fighters;
    onEvents(evs);
    var f0 = st.fighters[0], f1 = st.fighters[1];
    figs[f0.id].group.position.set(f0.x, 0, f0.z);
    figs[f1.id].group.position.set(f1.x, 0, f1.z);
    // 朝向：逻辑给的是弧度（0 = +z），three 的 rotation.y 需要 +PI 补偿
    figs[f0.id].group.rotation.y = f0.facing + Math.PI;
    figs[f1.id].group.rotation.y = f1.facing + Math.PI;
    // 出招的可读提示：起手阶段鼻锥变长（这是"预警"最便宜的实现）
    [[figs[f0.id], f0], [figs[f1.id], f1]].forEach(function (pair) {
      var fig = pair[0], fs = pair[1];
      var s = fs.phase === "startup" ? 1 + fs.t * 0.06 : fs.phase === "active" ? 1.6 : 1;
      fig.nose.scale.set(s, s, s);
      fig.body.material.emissive = fig.body.material.emissive || new Color(0x000000);
      fig.body.material.emissive.setHex(fs.hitstun > 0 ? 0x552222 : 0x000000);
    });
    tickSparks(dt);
    // 机位：从斜侧方看两人中点（可读机位，M0 不做演出机位）
    var mx = (f0.x + f1.x) / 2, mz = (f0.z + f1.z) / 2;
    var dist = Math.max(11, Math.abs(f0.x - f1.x) * 0.9 + 9);
    var sx = mx + (Math.random() - 0.5) * shake, sz = mz + dist;
    camera.position.set(sx, 5.4 + dist * 0.14, sz);
    camera.lookAt(mx, 1.1, mz);
    shake = Math.max(0, shake - dt * 2.2);
  }
  function resize(w, h) {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function render() { renderer.render(scene, camera); }
  return { update: update, resize: resize, render: render, renderer: renderer };
}
