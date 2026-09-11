/**
 * drive.mjs —— 直接驱动角色移动来测"起步 / 惯性"（绕过战斗 AI 的干扰）
 * 用法：node _tools/_gen/drive.mjs <tag> [html路径]
 * 前 40 帧持续调用 moveTowards（模拟按住方向键），之后停手，观察是否滑行。
 */
import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const tag = process.argv[2] || 'x';
const file = process.argv[3] || 'dist/新宿决战.html';
const b = new Browser({ port: 9384, width: 800, height: 450 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve(file).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(3000);
const res = await b.evaluate(`(async () => {
  const g = window.__SS.gojo;
  const z0 = g.root.position.z;
  const rows = [];
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  // 先静置 5 帧
  for (let i = 0; i < 5; i++) { await frame(); rows.push([i, g.root.position.z - z0, g.state.anim]); }
  const t0 = performance.now();
  const marks = [];
  for (let i = 0; i < 40; i++) {
    g.moveTowards(g.root.position.x, g.root.position.z - 14, 5.2, 1 / 60);
    await frame();
    rows.push([i + 5, g.root.position.z - z0, g.state.anim]);
    if (i === 0) marks.push(['after1frame', g.root.position.z - z0]);
    if (i === 3) marks.push(['after4frames', g.root.position.z - z0]);
    if (i === 9) marks.push(['after10frames', g.root.position.z - z0]);
  }
  const atRelease = g.root.position.z - z0;
  for (let i = 0; i < 30; i++) { await frame(); }
  const afterStop = g.root.position.z - z0;
  return { dtMs: +(performance.now() - t0).toFixed(0), marks, atRelease: +atRelease.toFixed(4), slideAfterStop: +(afterStop - atRelease).toFixed(4), samples: rows.slice(0, 14).map((r) => +r[1].toFixed(4)) };
})()`);
console.log(tag, JSON.stringify(res));
await b.close();
