import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const b = new Browser({ port: 9362, width: 900, height: 500 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve('dist/新宿决战.html').replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(2500);
const dump = async (label, who) => {
  const d = await b.evaluate('(() => { const g = window.__SS.' + who + '; const B = g.bones; const r = (n) => { const o = B[n]; return o ? [+o.rotation.x.toFixed(3), +o.rotation.y.toFixed(3), +o.rotation.z.toFixed(3)] : null; }; return { anim: g.state.anim, upperArmL: r("upperArmL"), upperArmR: r("upperArmR"), foreArmL: r("foreArmL"), thighL: r("thighL"), shinL: r("shinL"), hipsY: +B.hips.position.y.toFixed(3) }; })()');
  console.log(label, who, JSON.stringify(d));
};
await dump('idle', 'sukuna'); await dump('idle', 'gojo');
console.log('errs', JSON.stringify(b.errors.slice(0,3)));
await b.close();
