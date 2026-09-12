/**
 * probe-fighters-audit.mjs —— task-8 的角色/动作审计探针（可复跑）
 *
 * 用法：node _tools/probe-fighters-audit.mjs <idle|hits|stress|clip> [html路径]
 *   idle   —— 待机 6 秒，量呼吸/重心微动的幅度（判断是不是雕像）
 *   hits   —— 逐个播放 hit_light / hit_heavy / knockback，量姿态幅度与回 idle 的单帧跳变
 *   stress —— 60 秒随机输入压测，用 __SS.gojo.dbg 找 blend 不收敛 / 动作卡住
 *   clip   —— 把两人贴到一起，量骨骼级最小间距与包围盒重叠（穿模深度）
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const mode = process.argv[2] || 'idle';
const file = process.argv[3] || 'dist/新宿决战.html';
const port = 9391 + Math.floor(Math.random() * 40);
const b = new Browser({ port, width: 1280, height: 720 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve(file).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(3000);

const ev = async (code, arg) => b.evaluate(code.split('@A@').join(typeof arg === 'undefined' ? '' : JSON.stringify(arg)));

if (mode === 'idle') {
  const res = await ev(`(async () => {
    const g = window.__SS.gojo;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const keys = ['hipsY', 'chestX', 'coreX', 'coreZ', 'headY', 'neckY', 'rootX', 'rootZ'];
    const cols = keys.map(() => []);
    for (let i = 0; i < 360; i++) {
      await frame();
      cols[0].push(g.bones.hips.position.y);
      cols[1].push(g.bones.chest.rotation.x);
      cols[2].push(g.bones.core.rotation.x);
      cols[3].push(g.bones.core.rotation.z);
      cols[4].push(g.bones.head.rotation.y);
      cols[5].push(g.bones.neck.rotation.y);
      cols[6].push(g.root.position.x);
      cols[7].push(g.root.position.z);
    }
    const rng = (a) => +(Math.max(...a) - Math.min(...a)).toFixed(5);
    const out = { anim: g.state.anim };
    keys.forEach((k, i) => { out[k + '_range'] = rng(cols[i]); });
    return out;
  })()`);
  console.log('IDLE ' + JSON.stringify(res));
} else if (mode === 'hits') {
  const res = await ev(`(async () => {
    const g = window.__SS.gojo;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const snap = () => ['hips', 'core', 'chest', 'neck', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'upperArmL', 'upperArmR']
      .map((n) => [g.bones[n].rotation.x, g.bones[n].rotation.y, g.bones[n].rotation.z]);
    const measure = async (name) => {
      g.play(name, { loop: false });
      let peak = 0;
      const prev = [];
      const rows = [];
      for (let i = 0; i < 70; i++) {
        await frame();
        const s = snap();
        rows.push(s);
        let mag = 0;
        for (const v of s) mag += Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
        if (mag > peak) peak = mag;
        prev.push({ name: g.state.anim, blend: g.dbg.blend });
      }
      // 回 idle 的最大单帧跳变
      const inClip = g.dbg.stepPeak;
      g.play('idle', { loop: true });
      let maxJump = 0;
      let last = snap();
      for (let i = 0; i < 40; i++) {
        await frame();
        const s = snap();
        for (let bi = 0; bi < s.length; bi++) for (let ci = 0; ci < 3; ci++) maxJump = Math.max(maxJump, Math.abs(s[bi][ci] - last[bi][ci]));
        last = s;
      }
      return { peakPoseMagnitude: +peak.toFixed(3), backToIdleMaxJumpRad: +maxJump.toFixed(3), inClipMaxStepRad: +inClip.toFixed(3), backToIdleMaxStepRad: +g.dbg.stepPeak.toFixed(3) };
    };
    for (let i = 0; i < 40; i++) await frame();
    const base = await (async () => { const s = snap(); let m = 0; for (const v of s) m += Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]); return +m.toFixed(3); })();
    const out = { idleBaseline: base };
    for (const n of ['hit_light', 'hit_heavy', 'knockback', 'down']) out[n] = await measure(n);
    return out;
  })()`);
  console.log('HITS ' + JSON.stringify(res, null, 1));
} else if (mode === 'stress') {
  // 60 秒采样跑在页面里，Node 侧只负责轮询 —— 单次 Runtime.evaluate 有 60s 上限，不能一口气跑完
  await ev(`(() => {
    window.__STRESS_DUR = ${process.env.DUR * 1000 || 62000};
    const g = window.__SS.gojo;
    window.__S = [];
    const ev2 = (t, k) => window.dispatchEvent(new KeyboardEvent(t, { code: k, key: k.replace('Key', '').toLowerCase(), bubbles: true }));
    const bones = ['hips', 'core', 'chest', 'neck', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR'];
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyU', 'KeyI', 'KeyO', 'KeyH'];
    let held = null, until = 0, last = bones.map((n) => g.bones[n].rotation.x);
    const t0 = performance.now();
    const tick = () => {
      const now = performance.now();
      if (held && now > until) { ev2('keyup', held); held = null; }
      if (!held && Math.random() < 0.07) { const k = keys[(Math.random() * keys.length) | 0]; ev2('keydown', k); held = k; until = now + 200 + Math.random() * 900; }
      const s = bones.map((n) => g.bones[n].rotation.x);
      let jump = 0;
      for (let i = 0; i < s.length; i++) jump = Math.max(jump, Math.abs(s[i] - last[i]));
      last = s;
      const d = g.dbg;
      window.__S.push([+(now - t0).toFixed(0), d.name, d.loop ? 1 : 0, d.ended ? 1 : 0, d.blend, +jump.toFixed(3), d.blending, d.blocked, +d.blendTime.toFixed(3), d.name !== window.__LASTNAME ? 1 : 0, d.dt]);
      window.__LASTNAME = d.name;
      if (now - t0 < (window.__DUR || 62000)) requestAnimationFrame(tick);
    };
    window.__DUR = window.__STRESS_DUR || 62000;
    requestAnimationFrame(tick);
    return true;
  })()`);
  const durS = Number(process.env.DUR || 64);
  await sleep(durS * 1000);
  const res = await ev(`(() => {
    const S = window.__S || [];
    let sameNameMax = 0, sameNameWhat = '', blendMax = 0, blendWhat = '';
    let i = 0;
    while (i < S.length) {
      let j = i;
      while (j + 1 < S.length && S[j + 1][1] === S[i][1]) j++;
      const dur = S[j][0] - S[i][0];
      if (dur > sameNameMax && S[i][1] !== 'idle') { sameNameMax = dur; sameNameWhat = S[i][1]; }
      i = j + 1;
    }
    for (let k = 1; k < S.length; k++) {
      if (S[k][1] !== S[k - 1][1]) {
        let j = k;
        while (j < S.length && S[j][4] < 1) j++;
        const dur = j < S.length ? S[j][0] - S[k][0] : 99999;
        if (dur > blendMax) { blendMax = dur; blendWhat = S[k][1]; }
      }
    }
    const names = {};
    for (const s of S) names[s[1]] = (names[s[1]] || 0) + 1;
    // 最长"卡在过渡中"的连续时长（这才是"动作僵硬"的直接指标）
    let blendRunMax = 0, blendRunWhat = '', cur = 0, curName2 = '';
    for (let k = 0; k < S.length; k++) {
      if (S[k][6] === 1) { cur++; curName2 = S[k][1]; if (k + 1 < S.length) { const dt2 = S[k + 1][0] - S[k][0]; if (cur * 16 > blendRunMax) { blendRunMax = cur * 16; blendRunWhat = curName2; } } }
      else cur = 0;
    }
    let maxBlendTime = 0, maxBlendTimeWhat = '';
    for (const s of S) { if (s[8] > maxBlendTime) { maxBlendTime = s[8]; maxBlendTimeWhat = s[1]; } }
    return {
      frames: S.length,
      maxSameNameMs: sameNameMax, maxSameNameWhat: sameNameWhat,
      maxBlendConvergeMs: blendMax, maxBlendConvergeWhat: blendWhat,
      maxStuckInBlendMs: blendRunMax, maxStuckInBlendWhat: blendRunWhat,
      maxBlendTimeS: maxBlendTime, maxBlendTimeWhat: maxBlendTimeWhat,
      maxBoneJumpPerFrameRad: +Math.max(...S.map((s) => s[5])).toFixed(3),
      maxJumpAtNameChange: +Math.max(...S.filter((s) => s[9] === 1).map((s) => s[5]), 0).toFixed(3),
      maxJumpInsideClip: +Math.max(...S.filter((s) => s[9] !== 1).map((s) => s[5]), 0).toFixed(3),
      stuckWindowSample: (() => { let best = 0, bi = 0, cur = 0, ci = 0; for (let k = 0; k < S.length; k++) { if (S[k][6] === 1) { if (cur === 0) ci = k; cur++; if (cur > best) { best = cur; bi = ci; } } else cur = 0; } return S.slice(bi, bi + 6).map((s) => ({ t: s[0], name: s[1], blend: s[4], blendTime: s[8], dt: s[10] })); })(),
      blockedTotal: S.length ? S[S.length - 1][7] : 0,
      nameHistogram: names
    };
  })()`);
  console.log('STRESS ' + JSON.stringify(res, null, 1));
} else if (mode === 'fight') {
  const res = await ev(`(async () => {
    const g = window.__SS.gojo, s = window.__SS.sukuna;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const ev2 = (t, k) => window.dispatchEvent(new KeyboardEvent(t, { code: k, key: k.replace('Key', '').toLowerCase(), bubbles: true }));
    const t0 = performance.now();
    const dists = [];
    let held = null, until = 0;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK'];
    while (performance.now() - t0 < 40000) {
      const now = performance.now();
      if (held && now > until) { ev2('keyup', held); held = null; }
      if (!held && Math.random() < 0.08) { const k = keys[(Math.random() * keys.length) | 0]; ev2('keydown', k); held = k; until = now + 150 + Math.random() * 500; }
      await frame();
      dists.push(+g.root.position.distanceTo(s.root.position).toFixed(3));
    }
    const sorted = dists.slice().sort((a, b) => a - b);
    const below = (v) => dists.filter((d) => d < v).length;
    return {
      frames: dists.length,
      minDistance: sorted[0],
      p05: sorted[Math.floor(sorted.length * 0.05)],
      median: sorted[Math.floor(sorted.length * 0.5)],
      framesBelow0_40: below(0.40),
      framesBelow0_35: below(0.35),
      framesBelow0_55: below(0.55),
      pctBelow0_40: +(below(0.40) / dists.length * 100).toFixed(1),
      pctBelow0_55: +(below(0.55) / dists.length * 100).toFixed(1)
    };
  })()`);
  console.log('FIGHT ' + JSON.stringify(res, null, 1));
} else if (mode === 'clip') {
  const res = await ev(`(async () => {
    const g = window.__SS.gojo, s = window.__SS.sukuna;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const V = g.root.position.constructor;
    const bones = ['hips', 'core', 'chest', 'neck', 'head', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'handL', 'handR'];
    const MESHKEYS = ['hips', 'core', 'chest', 'head', 'upperArmL', 'upperArmR', 'foreArmL', 'foreArmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
    const worldBones = (f) => bones.map((n) => f.bones[n].getWorldPosition(new V()));
    const gapData = [];
    // 从 1.2m 一路贴到 0.1m，记录每个间距下的骨骼级最小距离
    for (const dist of [0.9, 0.8, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35]) {
      g.setPos(0, 0, 6 - dist / 2); g.faceTo(0, 6 + dist, true);
      s.setPos(0, 0, 6 + dist / 2); s.faceTo(0, 6 - dist, true);
      for (let i = 0; i < 3; i++) await frame();
      const A = worldBones(g), B = worldBones(s);
      let min = 1e9, pair = '';
      for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
        const d = A[i].distanceTo(B[j]);
        if (d < min) { min = d; pair = bones[i] + '-' + bones[j]; }
      }
      // 躯干中心到中心的距离
      const cA = g.bones.chest.getWorldPosition(new V()), cB = s.bones.chest.getWorldPosition(new V());
      // ---- 真正的"穿模"判定：逐网格算包围盒间隙（负值 = 实体重叠）----
      const B3 = window.__SS.gojo.root.constructor === Object ? null : null;
      const boxOf = (f, key) => {
        let out = null;
        f.root.traverse((o) => {
          if (!o.isMesh) return;
          const n = o.name || '';
          if (n.indexOf(key) !== 0) return;
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
          out = out ? out.union(bb) : bb;
        });
        return out;
      };
      let meshGap = 1e9, meshPair = '';
      for (const ka of MESHKEYS) {
        for (const kb of MESHKEYS) {
          const ba = boxOf(g, ka), bb2 = boxOf(s, kb);
          if (!ba || !bb2) continue;
          const dx = Math.max(ba.min.x - bb2.max.x, bb2.min.x - ba.max.x);
          const dy = Math.max(ba.min.y - bb2.max.y, bb2.min.y - ba.max.y);
          const dz = Math.max(ba.min.z - bb2.max.z, bb2.min.z - ba.max.z);
          const gap = Math.max(dx, Math.max(dy, dz));   // 分离轴近似：三个轴都分离才不相交
          const dist2 = Math.max(0, dx) ** 2 + Math.max(0, dy) ** 2 + Math.max(0, dz) ** 2;
          const g2 = Math.sqrt(dist2);
          if (g2 < meshGap) { meshGap = g2; meshPair = ka + '-' + kb; }
        }
      }
      gapData.push({ setDistance: dist, minBoneGap: +min.toFixed(3), pair, chestGap: +cA.distanceTo(cB).toFixed(3), realDistance: +g.root.position.distanceTo(s.root.position).toFixed(3), meshGap: +meshGap.toFixed(3), meshPair });
    }
    return gapData;
  })()`);
  console.log('CLIP ' + JSON.stringify(res, null, 1));
}
await b.close();