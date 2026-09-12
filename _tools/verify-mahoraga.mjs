/**
 * verify-mahoraga.mjs —— 契约 §4「魔虚罗 + 二阶段宿傩」独立验证（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 契约验收（§4）：
 *   - __SS.mech().mahoraga 读得到 hp/hpMax/alive/adapt/mode/skill/cd
 *   - 宿傩到 50% 必触发；不重复触发（phaseLock 召唤演出）
 *   - 模型：3.8~4.2m 高、悬浮 y≈14~17（用场景世界 AABB 独立量，不读建模代码）
 *   - draw call 增量 <= 70
 *   - 悬浮时近战打不到；俯冲落地窗口内近战能打到
 *   - 只有苍/赫/茈 能打到，且必须锁定（cam.lockOn）；不锁定打不到
 *   - 适应：同招 2 次 x0.45、4 次免疫
 *   - 二阶段：玩家打宿傩 x0.6；宿傩打玩家 x1.25（damageGate）
 *   - 帧率：出场前后帧时间对比
 * 用法：node _tools/verify-mahoraga.mjs [--file tmp/mahoraga/dist.html] [--port 9515] [--parts trigger,air,adapt,gate,perf] [--low]
 */
import { Rig, arg, flag, sleep, stats, DEFAULT_FILE } from './verify-lib.mjs';

const file = arg('file', DEFAULT_FILE);
const port = parseInt(arg('port', '9515'), 10);
const low = flag('low');
const parts = (arg('parts', 'trigger,air,adapt,gate,perf')).split(',');
const rig = new Rig({ port, file, name: 'mahoraga' + (low ? '-low' : ''), width: low ? 800 : 1280, height: low ? 450 : 720 });
const has = (p) => parts.includes(p);

/** 渲染调用数：连采 n 次取中位数（renderer.info 是累计值，且会被召唤 fx 抬高） */
async function callsMed(n) {
  const v = [];
  for (let i = 0; i < n; i++) { v.push((await rig.ev('window.__CALLS()')).calls); await sleep(400); }
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

const CODE_HELP = [
  'window.__MA = function () { try { var m = window.__V.mech(); return m.mahoraga || {}; } catch (e) { return { err: String(e) }; } };',
  'window.__SCAN = function (ymin) {',
  '  var S = window.__SS; var scene = S.scene; var V3 = scene.position.constructor;',
  '  var found = [];',
  '  var walk = function (o, parentHigh) {',
  '    var wp = new V3(); o.getWorldPosition(wp);',
  '    var high = wp.y > ymin;',
  '    if (high && !parentHigh) {',
  '      var bb = { minx: 1e9, miny: 1e9, minz: 1e9, maxx: -1e9, maxy: -1e9, maxz: -1e9, meshes: 0 };',
  '      o.updateWorldMatrix(true, true);',
  '      o.traverse(function (m) {',
  '        if (!m.isMesh || !m.geometry) return;',
  '        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();',
  '        var b = m.geometry.boundingBox; if (!b) return;',
  '        bb.meshes++;',
  '        var xs = [b.min.x, b.max.x], ys = [b.min.y, b.max.y], zs = [b.min.z, b.max.z];',
  '        for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) for (var k = 0; k < 2; k++) {',
  '          var v = new V3(xs[i], ys[j], zs[k]).applyMatrix4(m.matrixWorld);',
  '          if (v.x < bb.minx) bb.minx = v.x; if (v.x > bb.maxx) bb.maxx = v.x;',
  '          if (v.y < bb.miny) bb.miny = v.y; if (v.y > bb.maxy) bb.maxy = v.y;',
  '          if (v.z < bb.minz) bb.minz = v.z; if (v.z > bb.maxz) bb.maxz = v.z;',
  '        }',
  '      });',
  '      found.push({ name: o.name || o.type, y: +wp.y.toFixed(2), x: +wp.x.toFixed(2), z: +wp.z.toFixed(2),',
  '        h: +(bb.maxy - bb.miny).toFixed(2), w: +(bb.maxx - bb.minx).toFixed(2), d: +(bb.maxz - bb.minz).toFixed(2),',
  '        miny: +bb.miny.toFixed(2), maxy: +bb.maxy.toFixed(2), meshes: bb.meshes, visible: o.visible });',
  '    }',
  '    var ch = o.children || [];',
  '    for (var i = 0; i < ch.length; i++) walk(ch[i], high);',
  '  };',
  '  for (var i = 0; i < scene.children.length; i++) walk(scene.children[i], false);',
  '  return found;',
  '};',
  'window.__CALLS = function () { try { var r = window.__SS.render; var i = r.renderer ? r.renderer.info.render : r.info.render; return { calls: i.calls, tris: i.triangles, frame: i.frame }; } catch (e) { return { err: String(e) }; } };',
  'window.__DMGTO = function (side, amount) { var c = window.__SS.combat; c.applyDamage(side, amount); return true; };',
  'window.__PUT = function (dz, dx) { var S = window.__SS; var sk = S.sukuna; var g = S.gojo;',
  '  var sp = sk.root.position; g.root.position.set(sp.x + (dx || 0), 0, sp.z + dz); g.faceTo(sp.x, sp.z, true);',
  '  return { gx: +g.root.position.x.toFixed(2), gz: +g.root.position.z.toFixed(2) }; };',
  'true',
].join('\n');
const WATCH = '({t: V.t, f: S.combat.frame, hpS: S.snap.sukuna.hp, hpG: S.snap.gojo.hp,' +
  ' lock: !!S.cam.lockOn, pl: S.combat.phaseLock, ma: window.__MA(), calls: window.__CALLS().calls,' +
  ' gx: S.gojo.root.position.x, gz: S.gojo.root.position.z, now: performance.now()})';

async function summon(extra) {
  await rig.ev('window.__SS.combat.reset()');
  await sleep(300);
  await rig.ev('window.__DMGTO("sukuna", 899.5)');
  await sleep(2200);
  const before = await rig.ev('window.__MA()');
  const beforeAlive = await rig.ev('window.__MA().alive');
  await rig.ev('window.__DMGTO("sukuna", ' + (extra === undefined ? 0.5 : extra) + ')');
  const t0 = Date.now();
  const ok = await rig.waitFor('(window.__MA().alive === true)', 12000, 120);
  return { beforeHp: before && before.hp, beforeAlive, alive: !!ok, ms: Date.now() - t0, ma: await rig.ev('window.__MA()') };
}

try {
  await rig.start();
  console.log('产物 ' + file + '  启动 ' + JSON.stringify(rig.bootInfo));
  rig.check('产物可启动并进入 fight', rig.bootInfo.state === 'fight' || rig.bootInfo.state === 'clash', 'state=' + rig.bootInfo.state);
  await rig.loadHelpers();
  const ma0 = await rig.ev('window.__MA()');
  console.log('mech.mahoraga 初始 = ' + JSON.stringify(ma0));
  rig.check('契约 §1.3 MECH_DEBUG.mahoraga 已注册', !!(ma0 && Object.keys(ma0).length), JSON.stringify(ma0));
  const miss = ['hp', 'hpMax', 'alive', 'adapt', 'mode', 'skill', 'cd'].filter(k => !(ma0 && k in ma0));
  rig.check('mahoraga 自报字段齐全（契约 §1.3）', miss.length === 0, '缺 ' + JSON.stringify(miss));

  if (has('trigger')) {
    const s = await summon();
    console.log('触发：50% 前 hp=' + s.beforeHp + ' alive=' + s.alive + ' 等待 ' + s.ms + 'ms  hpMax=' + (s.ma && s.ma.hpMax) + ' hp=' + (s.ma && s.ma.hp));
    rig.check('§4 宿傩 hp=900.5（>50%）不触发', s.beforeAlive === false, 'beforeAlive=' + s.beforeAlive + '（第一次伤害后魔虚罗 hp=' + s.beforeHp + '，必须仍为 0）');
    rig.check('§4 宿傩 hp=900（正好 50%）必触发', s.alive, 'alive=' + s.alive + ' 用时 ' + s.ms + 'ms');
    rig.check('§4 魔虚罗 hpMax=900（契约 §4）', !!s.ma && Math.abs((s.ma.hpMax || 0) - 900) <= 1, 'hpMax=' + (s.ma && s.ma.hpMax));
    await rig.ev('window.__SS.combat.reset()');
    await sleep(200);
    await rig.reset(true); await rig.watch('({t: V.t, pl: S.combat.phaseLock, alive: window.__MA().alive, now: performance.now()})');
    await rig.ev('window.__DMGTO("sukuna", 900)');
    await sleep(4200);
    const pl = await rig.take();
    const maxPl = Math.max(...pl.samples.map(x => x.pl || 0));
    console.log('召唤演出 phaseLock 峰值=' + maxPl.toFixed(2) + '（契约 2.8）');
    rig.check('§4 召唤期间 phaseLock > 0（演出冻结）', maxPl > 0.5, 'phaseLock 峰值=' + maxPl.toFixed(2));
    await sleep(3000);
    const hp1 = await rig.ev('window.__MA().hp');
    await rig.ev('window.__DMGTO("sukuna", 700)');
    await rig.reset(true); await rig.watch('({t: V.t, pl: S.combat.phaseLock, hp: window.__MA().hp, now: performance.now()})');
    await sleep(4000);
    const rep = await rig.take();
    const maxPl2 = Math.max(...rep.samples.map(x => x.pl || 0));
    const hp2 = await rig.ev('window.__MA().hp');
    console.log('不重复触发：二次打残后 phaseLock 峰值=' + maxPl2.toFixed(2) + ' 魔虚罗 hp ' + hp1 + ' -> ' + hp2);
    rig.check('§4 不重复触发（二次打残无第二次召唤演出、HP 不重置）', maxPl2 < 0.5 && Math.abs((hp2 || 0) - (hp1 || 0)) < 1, 'phaseLock=' + maxPl2.toFixed(2) + ' hp=' + hp1 + '->' + hp2);
    await rig.shot('01-summon');
  }

  if (has('air')) {
    const scan = await rig.ev('window.__SCAN(8)');
    console.log('场景扫描（世界 Y > 8 的顶层节点）: ' + JSON.stringify(scan));
    // 场景里悬浮的顶层节点很多（月亮 / 广告牌 / 高楼），真正的判据是「叫 mahoraga 的那个节点」
    const named = (scan || []).filter(c => /mahoraga/i.test(c.name));
    const cand = (scan || []).filter(c => c.h >= 2 && c.h <= 25 && c.y >= 8 && c.y <= 25);
    console.log('悬浮候选（h 2~25 且 y 8~25）: ' + JSON.stringify(cand.map(c => ({ n: c.name, y: c.y, h: c.h }))));
    rig.check('§4 场景里存在名为 mahoraga 的悬浮节点', named.length > 0, JSON.stringify(named.map(c => ({ n: c.name, y: c.y, h: c.h, meshes: c.meshes, visible: c.visible }))));
    const bodyM = await rig.ev('window.__BODY("mahoraga", 8)');
    console.log('魔虚罗节点定点量测 = ' + JSON.stringify(bodyM));
    if (bodyM) {
      rig.check('§4 魔虚罗悬浮锚点 y 在 14~17（容差 12~19，实测 ' + bodyM.anchorY + '）', bodyM.anchorY >= 12 && bodyM.anchorY <= 19, 'anchorY=' + bodyM.anchorY);
      rig.check('§4 悬浮躯体高 3.8~4.2m 量级（实测 bodyH=' + bodyM.bodyH + 'm，容差 3.0~6.0）', bodyM.bodyH >= 3.0 && bodyM.bodyH <= 6.0, 'bodyH=' + bodyM.bodyH + ' bodyMinY=' + bodyM.bodyMinY + ' bodyMaxY=' + bodyM.bodyMaxY + ' allH=' + bodyM.allH + ' allMinY=' + bodyM.allMinY + ' meshes=' + bodyM.meshes);
      rig.check('§4 模型可见', bodyM.visible === true, 'visible=' + bodyM.visible + ' meshes=' + bodyM.meshes);
    } else {
      rig.check('§4 场景里存在名字含 mahoraga 的节点', false, '未找到');
    }
    await rig.ev('window.__SS.combat.reset()');
    await sleep(2200);
    const cLow = await callsMed(3);
    await rig.ev('window.__DMGTO("sukuna", 900)');
    const okSum = await rig.waitFor('window.__MA().alive === true', 12000, 100);
    await rig.waitFor('window.__SS.combat.phaseLock <= 0', 12000, 120);
    await sleep(3500);
    const cHi = await callsMed(3);
    console.log('draw calls: 未出场=' + JSON.stringify(cLow) + ' 出场后=' + JSON.stringify(cHi));
    rig.check('§4 魔虚罗模型 draw call 增量 <= 70', cHi !== null && cLow !== null && (cHi - cLow) <= 70, '增量=' + (cHi - cLow) + ' (未出场中位 ' + cLow + ' -> 出场后中位 ' + cHi + ')');

    await rig.ev('window.__PUT(-1.6, 0)');
    const hpM0 = await rig.ev('window.__MA().hp');
    for (let i = 0; i < 10; i++) { await rig.keys('KeyJ', 40); await sleep(260); }
    await sleep(800);
    const hpM1 = await rig.ev('window.__MA().hp');
    console.log('悬浮近战 10 次: 魔虚罗 hp ' + hpM0 + ' -> ' + hpM1);
    rig.check('§4 悬浮时近战打不到', Math.abs((hpM1 || 0) - (hpM0 || 0)) < 0.5, 'hp ' + hpM0 + ' -> ' + hpM1);

    let lock = await rig.ev('!!window.__SS.cam.lockOn');
    if (lock) { await rig.ev('window.__V.press("KeyQ")'); await sleep(400); lock = await rig.ev('!!window.__SS.cam.lockOn'); }
    console.log('锁状态（应为 false）=' + lock);
    const hpU0 = await rig.ev('window.__MA().hp');
    for (const sk of ['blue', 'red', 'purple']) { await rig.ev('window.__SS.combat.forceSkill(' + JSON.stringify(sk) + ',"gojo")'); await sleep(2200); }
    await sleep(1200);
    const hpU1 = await rig.ev('window.__MA().hp');
    console.log('未锁定 苍/赫/茈: 魔虚罗 hp ' + hpU0 + ' -> ' + hpU1);
    rig.check('§4 未锁定时弹道不会掰向魔虚罗（打不到）', Math.abs((hpU1 || 0) - (hpU0 || 0)) < 0.5, 'hp ' + hpU0 + ' -> ' + hpU1);

    await rig.ev('window.__V.press("KeyQ")');
    await sleep(500);
    const lock2 = await rig.ev('!!window.__SS.cam.lockOn');
    console.log('锁状态（应为 true）=' + lock2);
    rig.check('§4 锁定键 KeyQ 能进入 cam.lockOn', lock2 === true, 'lockOn=' + lock2);
    const hits = {};
    for (const sk of ['blue', 'red', 'purple']) {
      const a = await rig.ev('window.__MA().hp');
      await rig.ev('window.__SS.combat.forceSkill(' + JSON.stringify(sk) + ',"gojo")');
      await sleep(3000);
      const b = await rig.ev('window.__MA().hp');
      hits[sk] = { a, b, dmg: +(a - b).toFixed(2) };
      console.log('  锁定 ' + sk + ': hp ' + a + ' -> ' + b + ' 伤害=' + (a - b).toFixed(2));
    }
    rig.check('§4 锁定后 苍/赫/茈 各自至少命中一次', ['blue', 'red', 'purple'].every(k => hits[k] && hits[k].dmg > 0.2), JSON.stringify(hits));
  }

  if (has('adapt')) {
    if (!(await rig.ev('window.__MA().alive'))) { await summon(); }
    let lockOk = await rig.ev('!!window.__SS.cam.lockOn');
    if (!lockOk) { await rig.ev('window.__V.press("KeyQ")'); await sleep(500); }
    const seq = [];
    const adapt0 = await rig.ev('window.__MA().adapt');
    for (let i = 0; i < 16 && seq.filter(x => x.dmg > 0.01).length < 4; i++) {
      const a = await rig.ev('window.__MA().hp');
      await rig.ev('window.__SS.combat.forceSkill("blue","gojo")');
      await sleep(2600);
      const b = await rig.ev('window.__MA().hp');
      const d = +(a - b).toFixed(2);
      const ad = await rig.ev('window.__MA().adapt');
      seq.push({ i, dmg: d, adapt: ad, hpAfter: b });
      console.log('  适应试验#' + i + ' 伤害=' + d + ' 剩余hp=' + b + ' adapt=' + JSON.stringify(ad));
      if ((b || 0) <= 0) break;
    }
    const landed = seq.filter(x => x.dmg > 0.01);
    console.log('适应序列（只保留命中的）: ' + JSON.stringify(landed));
    if (landed.length >= 4) {
      rig.check('§4 适应：第 2 次同招命中伤害 <= 0.6 x 第 1 次', landed[1].dmg <= 0.6 * landed[0].dmg, 'd1=' + landed[0].dmg + ' d2=' + landed[1].dmg);
      rig.check('§4 适应：第 4 次同招命中免疫（伤害 ≈ 0）', landed[3].dmg < 0.05, 'd4=' + landed[3].dmg);
    } else {
      rig.check('§4 适应：同招命中 4 次的伤害序列', false, '只采到 ' + landed.length + ' 次命中: ' + JSON.stringify(landed));
    }
    const ad2 = await rig.ev('window.__MA().adapt');
    rig.check('§4 适应计数有推进', JSON.stringify(adapt0) !== JSON.stringify(ad2), 'adapt ' + JSON.stringify(adapt0) + ' -> ' + JSON.stringify(ad2));
  }

  if (has('gate')) {
    await rig.ev('window.__SS.combat.reset()');
    await sleep(1200);
    await rig.ev('window.__PUT(-1.6, 0)');
    await sleep(400);
    const g0 = await rig.ev('window.__SS.snap.sukuna.hp');
    await rig.keys('KeyJ', 40); await sleep(700);
    const g1 = await rig.ev('window.__SS.snap.sukuna.hp');
    const base = +(g0 - g1).toFixed(3);
    await summon();
    await rig.ev('window.__PUT(-1.6, 0)');
    await sleep(500);
    const g2 = await rig.ev('window.__SS.snap.sukuna.hp');
    await rig.keys('KeyJ', 40); await sleep(700);
    const g3 = await rig.ev('window.__SS.snap.sukuna.hp');
    const gated = +(g2 - g3).toFixed(3);
    console.log('damageGate 玩家打宿傩: 无魔虚罗=' + base + ' 有魔虚罗=' + gated + ' 比值=' + (base ? (gated / base).toFixed(3) : '-'));
    rig.check('§4 魔虚罗存活时玩家打宿傩 x0.6', base > 0 && Math.abs(gated / base - 0.6) <= 0.15, base + ' -> ' + gated + ' 比值=' + (base ? (gated / base).toFixed(3) : '-'));
    const dmgtake = async () => {
      await rig.ev('window.__PUT(-6, 0)');
      const a = await rig.ev('window.__SS.snap.gojo.hp');
      await rig.ev('window.__SS.combat.forceSkill("dismantle","sukuna")');
      await sleep(2600);
      const b = await rig.ev('window.__SS.snap.gojo.hp');
      return +(a - b).toFixed(3);
    };
    const t2 = await dmgtake();
    await rig.ev('window.__SS.combat.reset()');
    await sleep(1200);
    const t1 = await dmgtake();
    console.log('damageGate 宿傩打玩家(解): 无魔虚罗=' + t1 + ' 有魔虚罗=' + t2 + ' 比值=' + (t1 ? (t2 / t1).toFixed(3) : '-'));
    rig.check('§4 宿傩打玩家 x1.25', t1 > 0 && Math.abs(t2 / t1 - 1.25) <= 0.2, t1 + ' -> ' + t2 + ' 比值=' + (t1 ? (t2 / t1).toFixed(3) : '-'));
  }

  if (has('perf')) {
    await rig.ev('window.__SS.combat.reset()');
    await sleep(1500);
    const before = await rig.sample('({now: performance.now(), f: S.combat.frame})', 7000);
    await rig.ev('window.__DMGTO("sukuna", 900)');
    const ok = await rig.waitFor('window.__MA().alive === true', 12000, 100);
    await sleep(3500);
    const after = await rig.sample('({now: performance.now(), f: S.combat.frame})', 7000);
    const dt = (s) => { const d = []; for (let i = 1; i < s.samples.length; i++) d.push(s.samples[i].now - s.samples[i - 1].now); return d; };
    const db = dt(before), da = dt(after);
    const sb = stats(db), sa = stats(da);
    const ob = db.filter(x => x > 33.4).length, oa = da.filter(x => x > 33.4).length;
    console.log('帧时间 出场前 ' + JSON.stringify(sb) + ' 掉帧 ' + ob + '/' + db.length);
    console.log('帧时间 出场后 ' + JSON.stringify(sa) + ' 掉帧 ' + oa + '/' + da.length + ' alive=' + ok);
    rig.check('§4 魔虚罗出场后帧时间不明显变差（p95 <= max(1.35x, +4ms)）', sa.p95 <= Math.max(sb.p95 * 1.35, sb.p95 + 4), 'p95 ' + sb.p95 + ' -> ' + sa.p95 + ' ; p50 ' + sb.p50 + ' -> ' + sa.p50 + ' ; max ' + sb.max + ' -> ' + sa.max);
  }

  if (low) {
    const q = await rig.ev('window.__SS.quality');
    console.log('画质 = ' + q + ' 视口=' + rig.width + 'x' + rig.height);
    rig.check('低画质仍能召出魔虚罗', (await rig.ev('window.__MA().alive === true')) || (await rig.ev('window.__SCAN(8)')).length > 0, 'quality=' + q);
    await rig.shot('02-low');
  }
  rig.check('全流程无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
} catch (e) {
  console.log('FATAL ' + (e && e.stack || e));
  rig.check('脚本未抛错', false, String((e && e.message) || e));
} finally {
  await rig.finish();
}