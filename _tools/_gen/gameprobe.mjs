import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const b = new Browser({ port: 9358, width: 1600, height: 900 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve('dist/新宿决战.html').replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
// 跳过播片进战斗
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(3000);
const info = await b.evaluate('(() => { const r = window.__SS.render; const rr = r && r.renderer; const rd = rr && rr.info.render; return { calls: rd && rd.calls, tris: rd && rd.triangles, fps: window.__FPS, q: window.__SS.quality, progs: rr && rr.info.programs ? rr.info.programs.length : null }; })()');
console.log('render info:', JSON.stringify(info));
const tri = await b.evaluate('(() => { let n = 0, m = 0; const r = window.__SS.gojo.root; r.traverse(o => { if (o.isMesh) { m++; const g = o.geometry; n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } }); return { gojoMeshes: m, gojoTris: Math.round(n) }; })()');
console.log('gojo:', JSON.stringify(tri));
const tri2 = await b.evaluate('(() => { let n = 0, m = 0; const r = window.__SS.sukuna.root; r.traverse(o => { if (o.isMesh) { m++; const g = o.geometry; n += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } }); return { sukunaMeshes: m, sukunaTris: Math.round(n) }; })()');
console.log('sukuna:', JSON.stringify(tri2));
await b.screenshot(resolve('shots/art-final-in1.png'));
await b.close();
