import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const b = new Browser({ port: 9361, width: 900, height: 500 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve('dist/新宿决战.html').replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(2500);
const dump = async (label) => {
  const d = await b.evaluate('(() => { const g = window.__SS.gojo; const B = g.bones; const r = (n) => { const o = B[n]; return o ? [+o.rotation.x.toFixed(3), +o.rotation.y.toFixed(3), +o.rotation.z.toFixed(3)] : null; }; return { anim: g.state.anim, animT: +g.state.animT.toFixed(2), rootRot: [+g.root.rotation.x.toFixed(3), +g.root.rotation.y.toFixed(3), +g.root.rotation.z.toFixed(3)], rootPos: [+g.root.position.x.toFixed(2), +g.root.position.y.toFixed(2), +g.root.position.z.toFixed(2)], rootScale: +g.root.scale.x.toFixed(3), hipsY: +B.hips.position.y.toFixed(3), hips: r("hips"), core: r("core"), upperArmL: r("upperArmL"), foreArmL: r("foreArmL"), thighL: r("thighL"), shinL: r("shinL") }; })()');
  console.log(label, JSON.stringify(d));
};
await dump('idle');
// 走一段
await b.keyDown('KeyW'); await sleep(1200); await dump('walk'); await b.keyUp('KeyW');
await sleep(400);
await b.pressKey('KeyJ', 60); await sleep(120); await dump('punch-a');
await sleep(120); await dump('punch-b');
await sleep(400); await dump('after');
console.log('errs', JSON.stringify(b.errors.slice(0,3)));
await b.close();
