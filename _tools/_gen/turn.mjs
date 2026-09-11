/**
 * turn.mjs —— 转身过程量化（直接调 faceTo 掉头 180°，逐帧记录 yaw）
 * 用法：node _tools/_gen/turn.mjs <tag> [html路径]
 */
import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const tag = process.argv[2] || 'x';
const file = process.argv[3] || 'dist/新宿决战.html';
const b = new Browser({ port: 9385, width: 800, height: 450 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve(file).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(3000);
const res = await b.evaluate(`(async () => {
  const g = window.__SS.gojo;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  // 先站定朝向 +Z
  g.faceTo(g.root.position.x, g.root.position.z + 5, true);
  for (let i = 0; i < 6; i++) await frame();
  const y0 = g.root.rotation.y;
  // 掉头 180°（目标放在反方向）
  g.faceTo(g.root.position.x, g.root.position.z - 5);
  const ys = [];
  for (let i = 0; i < 45; i++) { await frame(); ys.push(g.root.rotation.y); }
  const norm = (a) => { let v = a % (Math.PI * 2); if (v > Math.PI) v -= Math.PI * 2; if (v < -Math.PI) v += Math.PI * 2; return v; };
  const deltas = [];
  for (let i = 1; i < ys.length; i++) deltas.push(Math.abs(norm(ys[i] - ys[i - 1])));
  const total = Math.abs(norm(ys[ys.length - 1] - y0));
  let acc = 0, t90 = -1;
  for (let i = 0; i < deltas.length; i++) { acc += deltas[i]; if (t90 < 0 && acc >= total * 0.9) t90 = i + 1; }
  return {
    totalTurnDeg: +(total * 180 / Math.PI).toFixed(1),
    framesTo90pct: t90,
    maxDegPerFrame: +(Math.max(...deltas) * 180 / Math.PI).toFixed(1),
    first5FrameDeltasDeg: deltas.slice(0, 5).map((d) => +(d * 180 / Math.PI).toFixed(1)),
    last5FrameDeltasDeg: deltas.slice(-5).map((d) => +(d * 180 / Math.PI).toFixed(1))
  };
})()`);
console.log(tag, JSON.stringify(res));
await b.close();
