/**
 * leg-pixels.mjs —— 量"步态在小尺寸下到底看不看得见"（开发工具）
 * 只测腿相对髋关节的运动（投影到相机平面），与相机跟随/位移无关；
 * 再按"角色 130 像素高"折算成像素，回答"大腿摆动映射到屏幕几像素"。
 * 用法：node _tools/_gen/leg-pixels.mjs <tag> [html路径] [速度]
 */
import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const tag = process.argv[2] || 'x';
const file = process.argv[3] || 'dist/新宿决战.html';
const spd = Number(process.argv[4] || '5.2');
const b = new Browser({ port: 9387, width: 1600, height: 900 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve(file).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(3000);
const SRC = `(async () => {
  const g = window.__SS.gojo;
  const cam = window.__SS.activeCamera || window.__SS.cam;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const V = g.root.position.constructor;
  const w = () => new V();
  const rel2cam = (a, b2) => {
    const d = w().copy(a).sub(b2);
    // 相机右/上基向量（只取旋转部分）
    const e = cam.matrixWorld.elements;
    const right = new V(e[0], e[1], e[2]);
    const up = new V(e[4], e[5], e[6]);
    return [d.dot(right), d.dot(up)];
  };
  for (let i = 0; i < 6; i++) await frame();
  const kneeX = [], kneeY = [], ankX = [], ankY = [], hipsY = [], headY = [];
  let thMin = 9, thMax = -9, shMin = 9, shMax = -9;
  let z0 = g.root.position.z;
  for (let i = 0; i < 170; i++) {
    g.moveTowards(g.root.position.x, g.root.position.z - 14, @SPDVAL@, 1 / 60);
    await frame();
    if (i > 25) {
      const hip = g.bones.thighL.getWorldPosition(w());
      const knee = g.bones.shinL.getWorldPosition(w());
      const ank = g.bones.footL.getWorldPosition(w());
      const k = rel2cam(knee, hip);
      const a = rel2cam(ank, knee);
      kneeX.push(k[0]); kneeY.push(k[1]);
      ankX.push(a[0]); ankY.push(a[1]);
      const hp = g.bones.hips.getWorldPosition(w()); const hd = g.bones.head.getWorldPosition(w());
      hipsY.push(hp.y); headY.push(hd.y);
      thMin = Math.min(thMin, g.bones.thighL.rotation.x); thMax = Math.max(thMax, g.bones.thighL.rotation.x);
      shMin = Math.min(shMin, g.bones.shinL.rotation.x); shMax = Math.max(shMax, g.bones.shinL.rotation.x);
    }
  }
  const rng = (arr) => Math.max(...arr) - Math.min(...arr);
  const dist2 = (xa, ya) => { let m = 0; for (let i = 0; i < xa.length; i++) for (let j = 0; j < xa.length; j++) m = Math.max(m, Math.hypot(xa[i] - xa[j], ya[i] - ya[j])); return m; };
  const bodyH = Math.max(...headY) - Math.min(...hipsY) + 0.95;  // 头到脚（髋到脚按 ~0.95m）
  const kneeExc = dist2(kneeX, kneeY);
  const ankExc = dist2(ankX, ankY);
  const bob = rng(hipsY);
  return {
    anim: g.state.anim,
    zTravel: +(z0 - g.root.position.z).toFixed(2),
    thighRangeRad: +(thMax - thMin).toFixed(3),
    shinRangeRad: +(shMax - shMin).toFixed(3),
    kneeExcursionM: +kneeExc.toFixed(3),
    ankleExcursionM: +ankExc.toFixed(3),
    pelvisBobM: +bob.toFixed(3),
    // 折算到"角色 130 像素高"时，膝盖在屏幕上的位移像素
    kneePxAt130: +(kneeExc * (130 / 1.88)).toFixed(1),
    anklePxAt130: +(ankExc * (130 / 1.88)).toFixed(1),
    bobPxAt130: +(bob * (130 / 1.88)).toFixed(1)
  };
})()`;
const res = await b.evaluate(SRC.split('@SPDVAL@').join(String(spd)));
console.log(tag, JSON.stringify(res));
await b.close();