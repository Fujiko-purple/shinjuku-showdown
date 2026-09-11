/**
 * artview-app.js —— 角色近景查看器（开发工具，不参与交付打包）
 * 说明：本文件会被 _tools/artview.mjs 拼到「three.js + contract.js + fighters.js」之后，
 *      与 fighters.js 处于同一层 IIFE 内，因此可以直接使用顶层的 createFighter / C 等符号。
 * 用途：给角色美术提供一个可复现的观测台 —— 固定机位、固定姿势、可控光照背景、
 *      剪影模式、比例标尺，用于逐轮挑刺。
 */
(function () {
  var canvas = document.getElementById("v");
  var renderer = new WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = SRGBColorSpace;

  var scene = new Scene();
  scene.background = new Color(0x0a0d12);
  var camera = new PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 400);

  // 地面 + 0.5m 网格 + 1.8m 身高标尺：判断头身比例是否失真
  var ground = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial({ color: 0x1a2130 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  var gridMat = new MeshBasicMaterial({ color: 0x2f4055 });
  for (var gi = -20; gi <= 20; gi++) {
    var gx = new Mesh(new PlaneGeometry(80, 0.012), gridMat);
    gx.rotation.x = -Math.PI / 2; gx.position.set(0, 0.002, gi * 0.5); scene.add(gx);
    var gz = new Mesh(new PlaneGeometry(0.012, 80), gridMat);
    gz.rotation.x = -Math.PI / 2; gz.position.set(gi * 0.5, 0.002, 0); scene.add(gz);
  }
  var rulerMat = new MeshBasicMaterial({ color: 0x4a5a70 });
  var ruler = new Mesh(new BoxGeometry(0.03, 1.8, 0.03), rulerMat);
  ruler.position.set(1.6, 0.9, 0); scene.add(ruler);
  var ruler2 = new Mesh(new BoxGeometry(0.03, 1.6, 0.03), new MeshBasicMaterial({ color: 0x3a4658 }));
  ruler2.position.set(1.8, 0.8, 0); scene.add(ruler2);

  var fighters = {};
  var curCfg = {};
  var quality = "high";

  function disposeFighters() {
    for (var k in fighters) {
      var f = fighters[k];
      if (!f) continue;
      if (f.root.parent) f.root.parent.remove(f.root);
      try { f.dispose(); } catch (e) {}
    }
    fighters = {};
  }

  function step(f, seconds) {
    var left = seconds;
    var guard = 0;
    while (left > 1e-4 && guard++ < 6000) {
      var d = Math.min(1 / 60, left);
      f.update(d);
      left -= d;
    }
  }

  function applyPose(f, anim, t) {
    if (!anim) return;
    f.play(anim, { loop: false, speed: 1 });
    step(f, t || 0);
  }

  var BGS = {
    dark: 0x0a0d12,
    night: 0x141b28,
    city: 0x2b3648,
    bright: 0xdde6f2,
    white: 0xffffff,
    black: 0x000000,
    neon: 0x2a1030
  };

  function place(f, x, z, faceX, faceZ) {
    f.setPos(x, 0, z);
    f.faceTo(faceX, faceZ, true);
  }

  window.VIEW = {
    apply: function (cfg) {
      curCfg = cfg || {};
      var q = curCfg.quality || "high";
      if (q !== quality) quality = q;
      disposeFighters();
      scene.background = new Color(BGS[curCfg.bg || "dark"] !== undefined ? BGS[curCfg.bg || "dark"] : 0x0a0d12);
      var who = curCfg.who || "gojo";
      var list = who === "both" ? ["gojo", "sukuna"] : [who];
      for (var i = 0; i < list.length; i++) {
        var id = list[i];
        var f = createFighter(id, { quality: quality });
        fighters[id] = f;
        scene.add(f.root);
      }
      if (who === "both") {
        if (curCfg.face === "each") {
          place(fighters.gojo, -0.85, 0, 1.2, 0);
          place(fighters.sukuna, 0.85, 0, -1.2, 0);
        } else {
          place(fighters.gojo, -0.85, 0, -0.85, 5);
          place(fighters.sukuna, 0.85, 0, 0.85, 5);
        }
      } else {
        place(fighters[who], 0, 0, 0, 5);
      }
      var each = function (fn) { for (var k in fighters) if (fighters[k]) fn(fighters[k], k); };
      each(function (f) {
        if (curCfg.domained) f.setDomained(true);
        if (curCfg.aura) f.setAura(true);
        if (curCfg.guard) f.setGuard(true);
        if (curCfg.awaken) f.setMode("awakened");
        if (curCfg.blindfold === false) f.setBlindfold(false);
        if (curCfg.blindfold === true) f.setBlindfold(true);
        if (curCfg.scale) f.setScale(curCfg.scale);
      });
      each(function (f) { applyPose(f, curCfg.anim || "idle", curCfg.t === undefined ? 0.4 : curCfg.t); });
      each(function (f) { if (curCfg.flash) f.hitFlash(curCfg.flash); });
      // 调试开关：分别关掉描边壳 / 脸贴片 / 阴影，定位穿模来源
      each(function (f) {
        f.root.traverse(function (o) {
          var n = o.name || "";
          if (curCfg.noOutline && n.indexOf(":ink") > 0) o.visible = false;
          if (curCfg.noFace && (n === "faceBlind" || n === "faceEyes")) o.visible = false;
          if (curCfg.noShadow && (n === "contactShadow" || n === "contactGlow")) o.visible = false;
          if (curCfg.noHalo && n === "eyeHalo") o.visible = false;
          if (curCfg.noBlind && n === "blindfoldMesh") o.visible = false;
        });
      });
      // 机位：az 为绕 Y 角度（0 = 从正前方看）
      var az = (curCfg.az || 0) * Math.PI / 180;
      var el = (curCfg.el === undefined ? 8 : curCfg.el) * Math.PI / 180;
      var dist = curCfg.dist || 3.4;
      var ty = curCfg.ty === undefined ? 1.0 : curCfg.ty;
      var tx = curCfg.tx || 0;
      camera.fov = curCfg.fov || 35;
      camera.position.set(
        tx + Math.sin(az) * Math.cos(el) * dist,
        ty + Math.sin(el) * dist,
        Math.cos(az) * Math.cos(el) * dist
      );
      camera.lookAt(new Vector3(tx, ty, 0));
      camera.updateProjectionMatrix();
      scene.overrideMaterial = curCfg.sil ? new MeshBasicMaterial({ color: 0x000000 }) : null;
      renderer.render(scene, camera);
      if (curCfg.sil) {
        // 剪影模式：纯黑角色 + 白底，检查轮廓可辨识度
        scene.background = new Color(0xffffff);
        scene.overrideMaterial = new MeshBasicMaterial({ color: 0x111111 });
        renderer.render(scene, camera);
      }
      return window.VIEW.info();
    },
    info: function () {
      var r = renderer.info.render;
      var meshes = 0, tris = 0;
      var box = new Box3();
      var ext = null;
      for (var kk in fighters) if (fighters[kk]) {
        var rt = fighters[kk].root;
        rt.updateMatrixWorld(true);
        box.makeEmpty();
        rt.traverse(function (o) {
          if (!o.isMesh || !o.geometry) return;
          var n = o.name || "";
          if (n.indexOf("contactShadow") === 0 || n.indexOf("runes") === 0 || n.indexOf("shell") === 0 || n.indexOf(":ink") > 0) return;
          o.geometry.computeBoundingBox();
          var bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
          box.union(bb);
        });
        var b = box;
        var rec = [];
        rt.traverse(function (o) {
          if (!o.isMesh || !o.geometry) return;
          var n2 = o.name || "";
          if (n2.indexOf("contactShadow") === 0 || n2.indexOf("runes") === 0 || n2.indexOf("shell") === 0 || n2.indexOf(":ink") > 0) return;
          o.geometry.computeBoundingBox();
          var bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
          rec.push({ n: (o.name || "(无名)") + "#" + o.id, lo: +bb.min.y.toFixed(3), hi: +bb.max.y.toFixed(3) });
        });
        rec.sort(function (p, q2) { return p.lo - q2.lo; });
        rec.sort(function (p, q2) { return p.lo - q2.lo; });
        var recH = rec.slice().sort(function (p, q2) { return q2.hi - p.hi; });
        window.__EXT = { low: rec.slice(0, 3), high: recH.slice(0, 3) };
        if (!ext) ext = { minY: b.min.y, maxY: b.max.y, w: b.max.x - b.min.x, d: b.max.z - b.min.z };
        else {
          ext.minY = Math.min(ext.minY, b.min.y);
          ext.maxY = Math.max(ext.maxY, b.max.y);
          ext.w = Math.max(ext.w, b.max.x - b.min.x);
          ext.d = Math.max(ext.d, b.max.z - b.min.z);
        }
      }
      for (var k in fighters) if (fighters[k]) {
        fighters[k].root.traverse(function (o) {
          if (o.isMesh) {
            meshes++;
            var g = o.geometry;
            if (g && g.index) tris += g.index.count / 3;
            else if (g && g.attributes && g.attributes.position) tris += g.attributes.position.count / 3;
          }
        });
      }
      return {
        calls: r.calls, renderTris: r.triangles, charMeshes: meshes, charTris: Math.round(tris),
        ext: window.__EXT || null,
        minY: ext ? +ext.minY.toFixed(3) : null,
        height: ext ? +(ext.maxY - ext.minY).toFixed(3) : null,
        width: ext ? +ext.w.toFixed(3) : null,
        depth: ext ? +ext.d.toFixed(3) : null
      };
    },
    mat: function (who) {
      var f = fighters[who || "gojo"];
      if (!f) return null;
      var out = {};
      var ms = f.materials;
      for (var k in ms) {
        var m = ms[k];
        out[k] = m && m.uniforms ? { map: !!m.uniforms.uMap, vc: !!m.vertexColors, tw: m.uniforms.uMap ? 1 : 0 } : (m ? "basic" : "null");
      }
      return out;
    },
    // 把所有程序化贴图铺开成一张"贴图台"，用来直接检查脸上的画
    texSheet: function (who) {
      var f = fighters[who || "gojo"];
      if (!f) return "no fighter";
      var tex = (f.palette && f.palette.tex) || {};
      var keys = Object.keys(tex);
      var old = document.getElementById("sheets");
      if (old) old.remove();
      var box = document.createElement("div");
      box.id = "sheets";
      box.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;background:#101418;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;box-sizing:border-box;z-index:99";
      for (var i = 0; i < keys.length; i++) {
        var t = tex[keys[i]];
        var cv = t && t.image ? t.image : null;
        var wrap = document.createElement("div");
        wrap.style.cssText = "color:#9fb;font:12px monospace;text-align:center";
        var lab = document.createElement("div");
        lab.textContent = who + "." + keys[i];
        wrap.appendChild(lab);
        if (cv) {
          var c2 = document.createElement("canvas");
          c2.width = 240; c2.height = 240;
          c2.style.cssText = "width:240px;height:240px";
          var x2 = c2.getContext("2d");
          x2.imageSmoothingEnabled = true;
          x2.drawImage(cv, 0, 0, 240, 240);
          wrap.appendChild(c2);
        }
        box.appendChild(wrap);
      }
      document.body.appendChild(box);
      return "ok";
    },
    hideSheet: function () { var e = document.getElementById("sheets"); if (e) e.remove(); return "ok"; },
    shot: function (name) { return name; },
    list: function () { return ANIM_NAMES.slice(); }
  };
  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.render(scene, camera);
  });
  window.VIEW.apply({});
})();
