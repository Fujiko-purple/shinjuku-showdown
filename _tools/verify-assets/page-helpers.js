/**
 * page-helpers.js —— 独立验证用的「页面侧」工具集（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 为什么单独成文件：探针脚本里把大段页面代码塞进字符串数组，转义地狱而且极易写错；
 * 这里就是普通 JS，由探针用 Rig.loadHelpers() 一次性注入页面。
 *
 * 全部只做只读观测 + 通过 __INJECT / 合成键盘事件驱动，不改游戏逻辑。
 * 依赖：window.__V（verify-lib.mjs 装的 rAF agent）、window.__SS。
 */
(() => {
  if (window.__PH === 3) return 'exists';

  /** 契约 §1.3 的 mech 出口：getter（对象）或方法都能读 */
  window.__V.mech = window.__V.mech || function () {
    try {
      var m = window.__SS.mech;
      return typeof m === 'function' ? m() : (m || {});
    } catch (e) { return {}; }
  };

  window.__MA = function () {
    try { return window.__V.mech().mahoraga || {}; } catch (e) { return { err: String(e) }; }
  };
  window.__SP = function () {
    try { return window.__V.mech().sprint || {}; } catch (e) { return { err: String(e) }; }
  };
  window.__BF = function () {
    try { return window.__V.mech().blackFlash || {}; } catch (e) { return { err: String(e) }; }
  };
  window.__D = function () {
    try { return window.__V.mech().duel || {}; } catch (e) { return { err: String(e) }; }
  };

  /** 渲染调用数（renderer.info.autoReset=false，所以这是自上次 reset 起的累计值） */
  window.__CALLS = function () {
    try {
      var r = window.__SS.render;
      var i = r.renderer ? r.renderer.info.render : r.info.render;
      return { calls: i.calls, tris: i.triangles, frame: i.frame };
    } catch (e) { return { err: String(e) }; }
  };

  /** 直接结算伤害（驱动用，走 combat 的调试入口 applyDamage） */
  window.__DMGTO = function (side, amount) {
    window.__SS.combat.applyDamage(side, amount);
    return true;
  };

  /** 把玩家摆到宿傩前方 dz / 右方 dx，并转向宿傩 */
  window.__PUT = function (dz, dx) {
    var S = window.__SS, sk = S.sukuna, g = S.gojo;
    var sp = sk.root.position;
    g.root.position.set(sp.x + (dx || 0), 0, sp.z + dz);
    g.faceTo(sp.x, sp.z, true);
    return { gx: +g.root.position.x.toFixed(2), gz: +g.root.position.z.toFixed(2) };
  };

  /**
   * 场景扫描：找出「自己的世界 Y > ymin、父节点不满足」的顶层悬浮节点，算它们的世界 AABB。
   * 用来独立量魔虚罗的模型尺寸/悬浮高度（不看建模代码）。
   */
  window.__SCAN = function (ymin) {
    var S = window.__SS, scene = S.scene, V3 = scene.position.constructor;
    var found = [];
    var walk = function (o, parentHigh) {
      var wp = new V3(); o.getWorldPosition(wp);
      var high = wp.y > ymin;
      if (high && !parentHigh) {
        var bb = { minx: 1e9, miny: 1e9, minz: 1e9, maxx: -1e9, maxy: -1e9, maxz: -1e9, meshes: 0 };
        o.updateWorldMatrix(true, true);
        o.traverse(function (m) {
          if (!m.isMesh || !m.geometry) return;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          var b = m.geometry.boundingBox; if (!b) return;
          bb.meshes++;
          var xs = [b.min.x, b.max.x], ys = [b.min.y, b.max.y], zs = [b.min.z, b.max.z];
          for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) for (var k = 0; k < 2; k++) {
            var v = new V3(xs[i], ys[j], zs[k]).applyMatrix4(m.matrixWorld);
            if (v.x < bb.minx) bb.minx = v.x; if (v.x > bb.maxx) bb.maxx = v.x;
            if (v.y < bb.miny) bb.miny = v.y; if (v.y > bb.maxy) bb.maxy = v.y;
            if (v.z < bb.minz) bb.minz = v.z; if (v.z > bb.maxz) bb.maxz = v.z;
          }
        });
        found.push({ name: o.name || o.type, y: +wp.y.toFixed(2), x: +wp.x.toFixed(2), z: +wp.z.toFixed(2),
          h: +(bb.maxy - bb.miny).toFixed(2), w: +(bb.maxx - bb.minx).toFixed(2), d: +(bb.maxz - bb.minz).toFixed(2),
          miny: +bb.miny.toFixed(2), maxy: +bb.maxy.toFixed(2), meshes: bb.meshes, visible: o.visible });
      }
      var ch = o.children || [];
      for (var i = 0; i < ch.length; i++) walk(ch[i], high);
    };
    for (var i = 0; i < scene.children.length; i++) walk(scene.children[i], false);
    return found;
  };

  /**
   * 定点量测：名字匹配 nameRe 的节点，分「全部子节点」与「世界 Y > ymin 的子节点」两套 AABB。
   * 契约要的是「魔虚罗本体 3.8~4.2m 高、悬浮在 y≈14~17」——allH 会把延伸到地面/法阵的
   * 辅助部件算进去，bodyH 才是飞在天上的那部分，两个数都报出来。
   */
  window.__BODY = function (nameRe, ymin) {
    var S = window.__SS, scene = S.scene, V3 = scene.position.constructor;
    var node = null;
    var re = new RegExp(nameRe);
    scene.traverse(function (o) { if (node) return; if (o.name && re.test(o.name)) node = o; });
    if (!node) return null;
    node.updateWorldMatrix(true, true);
    var meshes = 0;
    var bb0 = { minx: 1e9, miny: 1e9, minz: 1e9, maxx: -1e9, maxy: -1e9, maxz: -1e9 };
    var bb1 = { minx: 1e9, miny: 1e9, minz: 1e9, maxx: -1e9, maxy: -1e9, maxz: -1e9 };
    node.traverse(function (m) {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      var b = m.geometry.boundingBox; if (!b) return;
      meshes++;
      var c = new V3(); m.getWorldPosition(c);
      var inBody = c.y > ymin;
      var xs = [b.min.x, b.max.x], ys = [b.min.y, b.max.y], zs = [b.min.z, b.max.z];
      for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) for (var k = 0; k < 2; k++) {
        var v = new V3(xs[i], ys[j], zs[k]).applyMatrix4(m.matrixWorld);
        if (v.x < bb0.minx) bb0.minx = v.x; if (v.x > bb0.maxx) bb0.maxx = v.x;
        if (v.y < bb0.miny) bb0.miny = v.y; if (v.y > bb0.maxy) bb0.maxy = v.y;
        if (v.z < bb0.minz) bb0.minz = v.z; if (v.z > bb0.maxz) bb0.maxz = v.z;
        if (inBody) {
          if (v.x < bb1.minx) bb1.minx = v.x; if (v.x > bb1.maxx) bb1.maxx = v.x;
          if (v.y < bb1.miny) bb1.miny = v.y; if (v.y > bb1.maxy) bb1.maxy = v.y;
          if (v.z < bb1.minz) bb1.minz = v.z; if (v.z > bb1.maxz) bb1.maxz = v.z;
        }
      }
    });
    var wp = new V3(); node.getWorldPosition(wp);
    return {
      name: node.name || '', visible: node.visible, meshes: meshes,
      anchorY: +wp.y.toFixed(2),
      allH: +(bb0.maxy - bb0.miny).toFixed(2), allMinY: +bb0.miny.toFixed(2), allMaxY: +bb0.maxy.toFixed(2),
      bodyH: +(bb1.maxy - bb1.miny).toFixed(2), bodyMinY: +bb1.miny.toFixed(2), bodyMaxY: +bb1.maxy.toFixed(2),
    };
  };

  /* ---------------- HUD 文本体检 ---------------- */

  window.__HUDTEXT = function () {
    var keys = ['魔虚罗', '八握剑', '适应', '同步', '裂纹', '咒'];
    var out = [];
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length) continue;
      var tx = (el.textContent || '').trim();
      if (!tx) continue;
      var hit = false;
      for (var k = 0; k < keys.length; k++) if (tx.indexOf(keys[k]) >= 0) hit = true;
      if (!hit) continue;
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      out.push({ text: tx.slice(0, 30), id: el.id || '', cls: String(el.className || '').slice(0, 40),
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        color: cs.color, fs: cs.fontSize,
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' });
    }
    return out;
  };
  window.__HUDOVERLAP = function (list) {
    var bad = [];
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j];
      var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      var oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 4 && oy > 4) bad.push({ a: a.text, b: b.text, ox: ox, oy: oy });
    }
    return bad;
  };
  window.__OFFSCREEN = function (list) {
    var W = innerWidth, H = innerHeight, bad = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.visible) continue;
      if (r.x < -2 || r.y < -2 || r.x + r.w > W + 2 || r.y + r.h > H + 2) bad.push(r);
    }
    return bad;
  };

  window.__PH = 3;
  return 'ok';
})()