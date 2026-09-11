import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const tag = process.argv[2] || 'x';
const file = process.argv[3] || 'dist/新宿决战.html';
const b = new Browser({ port: 9383, width: 1280, height: 720 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve(file).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(3000);
await b.evaluate(`(() => {
  window.__S = [];
  const g = window.__SS.gojo;
  const tick = () => {
    window.__S.push([performance.now(), g.root.position.x, g.root.position.z,
      g.bones.hips.position.y, g.bones.hips.rotation.z, g.bones.chest.rotation.y, g.bones.head.rotation.y,
      g.bones.upperArmL.rotation.x, g.state.anim]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`);
const grab = async () => JSON.parse(await b.evaluate('JSON.stringify(window.__S)'));
const pos = async () => await b.evaluate('(() => { const p = window.__SS.gojo.root.position; return [p.x, p.z]; })()');
await b.evaluate('window.__S.length = 0');
await sleep(200);
await b.keyDown('KeyW');
await sleep(700);
const pRelease = await pos();
await b.keyUp('KeyW');
await sleep(450);
const pAfter = await pos();
const acc = await grab();
const sp = []; for (let i = 1; i < acc.length; i++) { const dt = (acc[i][0] - acc[i - 1][0]) / 1000; sp.push(Math.hypot(acc[i][1] - acc[i - 1][1], acc[i][2] - acc[i - 1][2]) / Math.max(dt, 1e-3)); }
let i0 = sp.findIndex((v) => v > 0.5); if (i0 < 0) i0 = 0;
console.log('== ' + tag + ' (' + file + ') ==');
console.log('STARTUP speedPerFrame=' + JSON.stringify(sp.slice(i0, i0 + 8).map((v) => +v.toFixed(2))));
console.log('RELEASE slide_in_450ms=' + Math.hypot(pAfter[0] - pRelease[0], pAfter[1] - pRelease[1]).toFixed(3));
await b.evaluate('window.__S.length = 0');
await sleep(600);
await b.pressKey('KeyJ', 40);
await sleep(700);
const tr = await grab();
let maxCut = 0, cutAt = '', maxIn = 0, inAt = '', prev = null, prevAnim = '';
for (const r of tr) {
  if (prev) {
    const dd = Math.abs(r[7] - prev[7]);
    if (r[8] !== prevAnim) { if (dd > maxCut) { maxCut = dd; cutAt = prevAnim + '->' + r[8]; } }
    else if (dd > maxIn) { maxIn = dd; inAt = r[8]; }
  }
  prev = r; prevAnim = r[8];
}
console.log('CUT maxJumpAtClipBoundary=' + maxCut.toFixed(3) + ' (' + cutAt + ')   maxInsideClip=' + maxIn.toFixed(3) + ' (' + inAt + ')');
const wr = acc.filter((r) => r[8] === 'walk' || r[8] === 'run');
if (wr.length > 4) {
  const rng = (i) => { let lo = 1e9, hi = -1e9; for (const r of wr) { if (r[i] < lo) lo = r[i]; if (r[i] > hi) hi = r[i]; } return +(hi - lo).toFixed(4); };
  console.log('WALK frames=' + wr.length + '  hipsY=' + rng(3) + '  pelvisRoll=' + rng(4) + '  chestTwist=' + rng(5) + '  headYaw=' + rng(6) + '  armSwing=' + rng(7));
}
console.log('errors', b.errors.length);
await b.close();
