/**
 * probe-city-run.mjs —— 可穿越性实测（只读驱动，不改游戏代码）
 *
 * 阶段1：把角色放回路口中心，沿 8 个方向各推 3 秒，记录位移 / 是否卡死 / 是否进入建筑体积
 * 阶段2：把角色放到 4 个贴着建筑的位置，正对着楼推 3 秒，检查是否穿进楼里
 * 判定：位移 < 0.6m 记 stuck；终点落在任一建筑足迹内（含 margin）记 insideBuilding
 *
 * 用法：node _tools/probe-city-run.mjs [--file dist/新宿决战.html] [--json out.json]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const outJson = arg('json', '');
const HOLD = parseInt(arg('hold', '3000'), 10);

const b = new Browser({ port: 9692, width: 1280, height: 720 });
const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const DIRS = [
  ['W', ['KeyW']], ['WD', ['KeyW', 'KeyD']], ['D', ['KeyD']], ['SD', ['KeyS', 'KeyD']],
  ['S', ['KeyS']], ['SA', ['KeyS', 'KeyA']], ['A', ['KeyA']], ['WA', ['KeyW', 'KeyA']]
];

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url });
  await sleep(11000);
  const crash = await b.evaluate("(() => { const c = document.getElementById('crash'); return c && !c.classList.contains('hidden') ? (document.getElementById('crash-msg')||{}).textContent : null; })()");
  if (crash) { console.log('FATAL 启动崩溃: ' + String(crash).slice(0, 200)); throw new Error('crash'); }
  await b.evaluate("document.getElementById('btn-skip-cine').click(); true");
  await sleep(6000);
  await b.evaluate("(window.__SS.combat && window.__SS.combat.setAiEnabled) ? window.__SS.combat.setAiEnabled(false) : null; window.__SS.sukuna.setPos(70, 0, 70); true");
  await sleep(800);

  const probe = () => b.evaluate(`(() => {
    const SS = window.__SS;
    const g = SS.gojo;
    const p = g.root.position;
    const bs = (SS.city && SS.city.buildings) || [];
    let inside = null, nearest = 1e9;
    for (const B of bs) {
      if (B.destroyed) continue;
      const dx = Math.abs(p.x - B.mesh.position.x) - B._w / 2;
      const dz = Math.abs(p.z - B.mesh.position.z) - B._d / 2;
      const d = Math.max(dx, dz);
      if (d < nearest) nearest = d;
      if (dx < -0.05 && dz < -0.05) inside = B.id;
    }
    return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2), inside, nearest: +nearest.toFixed(2), hp: +SS.snap.gojo.hp.toFixed(0) };
  })()`);
  const put = async (x, z) => { await b.evaluate('window.__SS.gojo.setPos(' + x + ', 0, ' + z + '); true'); await sleep(500); };

  const out = { file, phase1: [], phase2: [], phase3: [], keys: {}, hold: HOLD };
  // ---- 阶段0：标定 按键 → 世界方向（移动是相机相对的，先量出来）----
  for (const [kname, keys] of [['W', ['KeyW']], ['A', ['KeyA']], ['S', ['KeyS']], ['D', ['KeyD']]]) {
    await put(0, 40);
    const a0 = await probe();
    for (const k of keys) await b.keyDown(k);
    await sleep(900);
    for (const k of keys) await b.keyUp(k);
    await sleep(250);
    const a1 = await probe();
    out.keys[kname] = { dx: +(a1.x - a0.x).toFixed(2), dz: +(a1.z - a0.z).toFixed(2) };
  }
  // ---- 阶段1：路口中心 8 方向 ----
  for (const [name, keys] of DIRS) {
    await put(0, 10);
    const p0 = await probe();
    for (const k of keys) await b.keyDown(k);
    await sleep(HOLD);
    for (const k of keys) await b.keyUp(k);
    await sleep(250);
    const p1 = await probe();
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const dist = Math.hypot(dx, dz);
    out.phase1.push({
      dir: name, from: [p0.x, p0.z], to: [p1.x, p1.z],
      dist: +dist.toFixed(2), dx: +dx.toFixed(2), dz: +dz.toFixed(2),
      stuck: dist < 0.6, insideBuilding: p1.inside, nearestBuildingEdge: p1.nearest
    });
  }
  // ---- 阶段2：贴着楼面，四个方向分别推，记录最贴近楼体的深度 ----
  const WALL_HOLD = Math.min(HOLD, 2000);
  const spots = [[16.2, 30], [-16.2, -30], [30, 16.2], [-30, -16.2]];
  for (const [x, z] of spots) {
    for (const [kname, keys] of [['W', ['KeyW']], ['A', ['KeyA']], ['S', ['KeyS']], ['D', ['KeyD']]]) {
      await put(x, z);
      const p0 = await probe();
      let deepest = p0.nearest;
      let inside = p0.inside;
      for (const k of keys) await b.keyDown(k);
      const t0 = Date.now();
      while (Date.now() - t0 < WALL_HOLD) {
        await sleep(200);
        const s = await probe();
        if (s.nearest < deepest) deepest = s.nearest;
        if (s.inside !== null && inside === null) inside = s.inside;
      }
      for (const k of keys) await b.keyUp(k);
      await sleep(200);
      const p1 = await probe();
      out.phase2.push({
        spot: [x, z], key: kname, to: [p1.x, p1.z],
        dist: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2),
        deepestEdge: +deepest.toFixed(2), insideBuilding: inside
      });
    }
  }
  // ---- 阶段3：从马路上直接朝楼面走进去（不用瞬移，排除瞬移假象）----
  const plusX = Object.keys(out.keys).sort((p, q) => out.keys[q].dx - out.keys[p].dx)[0];
  const minusX = Object.keys(out.keys).sort((p, q) => out.keys[p].dx - out.keys[q].dx)[0];
  const plusZ = Object.keys(out.keys).sort((p, q) => out.keys[q].dz - out.keys[p].dz)[0];
  for (const [label, key, from] of [['+X', plusX, [0, 40]], ['-X', minusX, [0, -40]], ['+Z', plusZ, [0, -40]]]) {
    await put(from[0], from[1]);
    const p0 = await probe();
    let deepest = p0.nearest;
    let inside = null;
    await b.keyDown(key === 'W' ? 'KeyW' : key === 'A' ? 'KeyA' : key === 'S' ? 'KeyS' : 'KeyD');
    const t0 = Date.now();
    const track = [];
    while (Date.now() - t0 < 9000) {
      await sleep(300);
      const s = await probe();
      track.push([s.x, s.z, s.nearest]);
      if (s.nearest < deepest) deepest = s.nearest;
      if (s.inside !== null && inside === null) inside = s.inside;
    }
    await b.keyUp(key === 'W' ? 'KeyW' : key === 'A' ? 'KeyA' : key === 'S' ? 'KeyS' : 'KeyD');
    await sleep(200);
    const p1 = await probe();
    out.phase3.push({ label, key, from, to: [p1.x, p1.z], dist: +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2), deepestEdge: +deepest.toFixed(2), insideBuilding: inside, track: track.filter((t, i) => i % 5 === 0) });
  }
  // ---- 阶段4：把阶段3 的轨迹喂给 city.pushOut，量化「接上碰撞后会怎样」----
  for (const r3 of out.phase3) {
    const sim = await b.evaluate('(() => { const city = window.__SS.city; if (!city.pushOut) return { err: "no pushOut" }; const pts = ' + JSON.stringify(r3.track) + '; let worstRaw = 0, worstFixed = 0; const out2 = []; for (const t of pts) { const raw = t[2]; const p = { x: t[0], z: t[1] }; city.pushOut(p, 0.45); let fixed = 1e9; for (const B of window.__SS.city.buildings) { if (B.destroyed) continue; const dx = Math.abs(p.x - B.mesh.position.x) - B._w / 2; const dz = Math.abs(p.z - B.mesh.position.z) - B._d / 2; const d = Math.max(dx, dz); if (d < fixed) fixed = d; } if (raw < worstRaw) worstRaw = raw; if (fixed < worstFixed) worstFixed = fixed; out2.push([t[0], t[1], raw, +fixed.toFixed(2)]); } return { worstRaw: +worstRaw.toFixed(2), worstFixed: +worstFixed.toFixed(2), sample: out2.slice(-3) }; })()');
    out.phase4 = out.phase4 || [];
    out.phase4.push({ label: r3.label, ...sim });
  }
  if (outJson) writeFileSync(outJson, JSON.stringify(out, null, 2));
  console.log('== 阶段1：路口中心 8 方向各 ' + (HOLD / 1000) + 's ==');
  for (const r of out.phase1) {
    console.log('  ' + r.dir.padEnd(3) + ' 位移 ' + String(r.dist).padStart(5) + 'm  (' + r.from + ' → ' + r.to + ')  卡死=' + (r.stuck ? '❌是' : '否') + '  进入建筑=' + (r.insideBuilding === null ? '否' : '❌' + r.insideBuilding) + '  距楼边 ' + r.nearestBuildingEdge + 'm');
  }
  console.log('== 阶段2：贴楼面四向推挤（起点在楼前人行道）==');
  for (const r of out.phase2) {
    console.log('  起点 ' + r.spot + ' 按' + r.key + ' → ' + r.to + '  位移 ' + String(r.dist).padStart(5) + 'm  最深贴到楼边 ' + r.deepestEdge + 'm  进入建筑=' + (r.insideBuilding === null ? '否' : '❌' + r.insideBuilding));
  }
  console.log('== 阶段3：从马路走向楼面 9s（不用瞬移）==');
  console.log('  按键→世界方向标定: ' + JSON.stringify(out.keys));
  for (const r of out.phase3) {
    console.log('  朝 ' + r.label + ' 按' + r.key + '：' + JSON.stringify(r.from) + ' → ' + JSON.stringify(r.to) + '  位移 ' + r.dist + 'm  最深贴到楼边 ' + r.deepestEdge + 'm  进入建筑=' + (r.insideBuilding === null ? '否' : '❌#' + r.insideBuilding));
    console.log('     轨迹(x,z,距楼边): ' + r.track.map((t) => t.join('/')).join('  '));
  }
  console.log('== 阶段4：把轨迹喂给 city.pushOut（验证交给 combat 的碰撞解算）==');
  for (const r of out.phase4 || []) {
    console.log('  ' + r.label + '：原始最深穿透 ' + r.worstRaw + 'm  →  接上 pushOut 后 ' + r.worstFixed + 'm（负数=仍在楼里）  末三点=' + JSON.stringify(r.sample));
  }
  console.log('ERRORS ' + JSON.stringify(b.errors.slice(0, 3)));
} catch (e) {
  console.log('FATAL ' + String((e && e.stack) || e).slice(0, 300));
} finally { await b.close(); }
