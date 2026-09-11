/**
 * zoomshots.mjs —— 跟着角色抓"放大特写帧"：用 CDP 的 clip+scale 直接截取角色周围区域
 * 用法：node _tools/_gen/zoomshots.mjs <tag> <阶段> [who]
 *   阶段：walk | punch | cast | idle
 */
import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const tag = process.argv[2] || 'z';
const phase = process.argv[3] || 'idle';
const who = process.argv[4] || 'gojo';
const b = new Browser({ port: 9371, width: 1600, height: 900 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve('dist/新宿决战.html').replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(2600);
const clipFor = async () => {
  const p = await b.evaluate('(() => { const f = window.__SS.' + who + '; const v = f.chest.getWorldPosition(new f.root.position.constructor()); const c = window.__SS.activeCamera || window.__SS.cam; v.project(c); const w = window.innerWidth, h = window.innerHeight; return { x: Math.round((v.x * 0.5 + 0.5) * w), y: Math.round((-v.y * 0.5 + 0.5) * h), w, h }; })()');
  const size = 320;
  return { x: Math.max(0, Math.min(p.w - size, p.x - size / 2)), y: Math.max(0, Math.min(p.h - size, p.y - size / 2 - 40)), width: size, height: size, scale: 3 };
};
const grab = async (name) => {
  const clip = await clipFor();
  await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
  const r = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(resolve('shots/zoom-' + tag + '-' + name + '.png'), Buffer.from(r.data, 'base64'));
  const st = await b.evaluate('(() => { const f = window.__SS.' + who + '; return { anim: f.state.anim, t: +f.state.animT.toFixed(2), hips: +f.bones.hips.position.y.toFixed(3), uaL: [+f.bones.upperArmL.rotation.x.toFixed(2), +f.bones.upperArmL.rotation.z.toFixed(2)], thL: [+f.bones.thighL.rotation.x.toFixed(2)], shL: [+f.bones.shinL.rotation.x.toFixed(2)] }; })()');
  console.log(name, JSON.stringify(st));
};
if (phase === 'walk') {
  await b.keyDown('KeyW');
  for (let i = 0; i < 4; i++) { await sleep(120); await grab('walk' + i); }
  await b.keyUp('KeyW');
} else if (phase === 'punch') {
  for (let i = 0; i < 4; i++) { await b.pressKey('KeyJ', 40); await sleep(90); await grab('punch' + i); }
} else if (phase === 'cast') {
  await b.pressKey('KeyU', 60);
  for (let i = 0; i < 4; i++) { await sleep(150); await grab('cast' + i); }
} else {
  for (let i = 0; i < 3; i++) { await sleep(400); await grab('idle' + i); }
}
console.log('errors', b.errors.length);
await b.close();
