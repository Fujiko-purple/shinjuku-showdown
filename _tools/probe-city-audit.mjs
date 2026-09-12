/**
 * probe-city-audit.mjs —— 城市几何审计探针（只读，不改游戏）
 *
 * 1) 逐实例世界包围盒：悬空 / 扎进地面 / 完全埋进地面
 * 2) 建筑两两穿模 & 建筑侵入车行道
 * 3) 复刻 camera.js 的细高道具遮挡体表，找出「幻影遮挡体」（半径远大于实体）
 *
 * 用法：node _tools/probe-city-audit.mjs [--file dist/新宿决战.html] [--json out.json]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const outJson = arg('json', '');

const b = new Browser({ port: 9691, width: 1280, height: 720 });
const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url });
  await sleep(9000);
  const report = await b.evaluate(`(() => {
    const SS = window.__SS;
    const city = SS && SS.city;
    if (!city) return { error: 'no city' };
    const g = city.group;
    const THREE_V = null;
    // 几何体包围盒的 8 个角
    const corners = (bb) => {
      const out = [];
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) out.push([x, y, z]);
      return out;
    };
    const meshes = [];
    const ELEVATED = /^(roof-|neon-|shopfronts|awnings|facade-|ad-screen|building-ao|warning-lights|neon-glow|lamp-halos|lamp-shafts|signal-lens|ped-lens|dust|ambient-dust|sky-dome|wires|skyline)/;
    g.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const geo = o.geometry;
      if (!geo.boundingBox && geo.computeBoundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (!bb) return;
      const cs = corners(bb);
      const arr = o.instanceMatrix.array;
      let minY = Infinity, maxY = -Infinity, sunken = 0, floating = 0, deep = 0;
      const bad = [];
      const n = o.count;
      for (let i = 0; i < n; i++) {
        const off = i * 16;
        const m = arr.slice(off, off + 16);
        let iy0 = Infinity, iy1 = -Infinity, ix = 0, iz = 0;
        for (const c of cs) {
          const wx = m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12];
          const wy = m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13];
          const wz = m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14];
          if (wy < iy0) iy0 = wy;
          if (wy > iy1) iy1 = wy;
          ix = wx; iz = wz;
        }
        if (iy0 < minY) minY = iy0;
        if (iy1 > maxY) maxY = iy1;
        if (iy1 < 0.01) { sunken++; if (bad.length < 6) bad.push({ i, kind: 'buried', y0: +iy0.toFixed(2), x: +m[12].toFixed(1), z: +m[14].toFixed(1) }); }
        else if (iy0 < -0.06) { deep++; if (bad.length < 6) bad.push({ i, kind: 'deepBase', y0: +iy0.toFixed(2), x: +m[12].toFixed(1), z: +m[14].toFixed(1) }); }
        else if (iy0 > 0.35 && !ELEVATED.test(o.name || '')) { floating++; if (bad.length < 6) bad.push({ i, kind: 'float', y0: +iy0.toFixed(2), x: +m[12].toFixed(1), z: +m[14].toFixed(1) }); }
      }
      meshes.push({ name: o.name || o.type, count: n, minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), sunken, deep, floating, samples: bad });
    });
    // ---- 建筑两两穿模 / 侵入车行道 ----
    const bs = (city.buildings || []).filter((x) => !x.destroyed);
    const overlap = [];
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const A = bs[i], B = bs[j];
        const ax = A.mesh.position.x, az = A.mesh.position.z;
        const bx = B.mesh.position.x, bz = B.mesh.position.z;
        const ox = Math.min(ax + A._w / 2, bx + B._w / 2) - Math.max(ax - A._w / 2, bx - B._w / 2);
        const oz = Math.min(az + A._d / 2, bz + B._d / 2) - Math.max(az - A._d / 2, bz - B._d / 2);
        if (ox > 0.2 && oz > 0.2) {
          overlap.push({ a: A.id, b: B.id, area: +(ox * oz).toFixed(1), ox: +ox.toFixed(1), oz: +oz.toFixed(1), ax: +ax.toFixed(1), az: +az.toFixed(1), bx: +bx.toFixed(1), bz: +bz.toFixed(1) });
        }
      }
    }
    overlap.sort((p, q) => q.area - p.area);
    const inRoad = bs.filter((B) => {
      const x = B.mesh.position.x, z = B.mesh.position.z;
      const hitX = Math.abs(x) - B._w / 2 < 12;
      const hitZ = Math.abs(z) - B._d / 2 < 12;
      return hitX && hitZ;
    }).map((B) => ({ id: B.id, x: +B.mesh.position.x.toFixed(1), z: +B.mesh.position.z.toFixed(1), w: B._w, d: B._d, h: B._h }));
    // ---- 复刻 camera.js 的细高道具遮挡体 ----
    const want = { 'lamp-poles': 1, 'signal-poles': 1, 'signal-heads': 1 };
    const props = [];
    const stack = [g];
    while (stack.length) {
      const o = stack.pop();
      if (!o) continue;
      if (o.isInstancedMesh && want[o.name]) {
        const geo2 = o.geometry;
        if (!geo2.boundingBox && geo2.computeBoundingBox) geo2.computeBoundingBox();
        const bb2 = geo2.boundingBox;
        if (bb2) {
          const hh = bb2.max.y - bb2.min.y;
          const rr = Math.max(bb2.max.x - bb2.min.x, bb2.max.z - bb2.min.z) * 0.5;
          const arr2 = o.instanceMatrix.array;
          for (let i = 0; i < o.count; i++) {
            const off2 = i * 16;
            const sx = Math.sqrt(arr2[off2] * arr2[off2] + arr2[off2 + 1] * arr2[off2 + 1] + arr2[off2 + 2] * arr2[off2 + 2]);
            const sy = Math.sqrt(arr2[off2 + 4] * arr2[off2 + 4] + arr2[off2 + 5] * arr2[off2 + 5] + arr2[off2 + 6] * arr2[off2 + 6]);
            props.push({ mesh: o.name, i, x: +arr2[off2 + 12].toFixed(1), z: +arr2[off2 + 14].toFixed(1), r: +(Math.max(0.5, rr * sx) + 0.25).toFixed(2), h: +(Math.max(2, hh * sy)).toFixed(1), geoR: +rr.toFixed(2) });
          }
        }
      }
      const ch = o.children;
      if (ch) for (let k = 0; k < ch.length; k++) stack.push(ch[k]);
    }
    return {
      meshes: meshes.sort((p, q) => q.count - p.count),
      buildingOverlaps: overlap.slice(0, 12),
      buildingOverlapCount: overlap.length,
      buildingsInRoadway: inRoad,
      props,
      propsFat: props.filter((p) => p.r > 1.6).length,
      propsVeryFat: props.filter((p) => p.r > 2.5).length,
      stats: city.stats
    };
  })()`);
  if (outJson) writeFileSync(outJson, JSON.stringify(report, null, 2));
  // 控制台只打关键结论，避免刷屏
  if (report.error) { console.log('ERROR', report.error); }
  else {
    console.log('== 实例几何体检（只列有问题的）==');
    let issues = 0;
    for (const m of report.meshes) {
      if (m.sunken || m.deep || m.floating) {
        issues++;
        console.log('  ' + m.name.padEnd(18) + ' n=' + String(m.count).padStart(4) + '  buried=' + m.sunken + ' deepBase=' + m.deep + ' float=' + m.floating + '  yRange=[' + m.minY + ',' + m.maxY + ']');
        for (const s of m.samples) console.log('        sample ' + JSON.stringify(s));
      }
    }
    if (!issues) console.log('  （无）');
    console.log('== 建筑穿模 ==');
    console.log('  重叠对数=' + report.buildingOverlapCount);
    for (const o of report.buildingOverlaps.slice(0, 6)) console.log('    ' + JSON.stringify(o));
    console.log('== 建筑侵入车行道 ==');
    console.log('  数量=' + report.buildingsInRoadway.length + ' ' + JSON.stringify(report.buildingsInRoadway.slice(0, 5)));
    console.log('== camera camProp 幻影遮挡体 ==');
    console.log('  条目=' + report.props.length + '  r>1.6 的=' + report.propsFat + '  r>2.5 的=' + report.propsVeryFat);
    for (const p of report.props.filter((x) => x.r > 1.6).slice(0, 10)) console.log('    ' + JSON.stringify(p));
  }
  console.log('ERRORS ' + JSON.stringify(b.errors.slice(0, 3)));
} finally { await b.close(); }
