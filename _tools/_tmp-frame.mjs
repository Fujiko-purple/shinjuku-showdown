import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const file = resolve('tmp/lead/dist.html');
const b = new Browser({ port: 9484, width: 1600, height: 900 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(4000);
  // 让玩家朝宿傩走近一点，形成典型交战距离
  await b.keyDown('KeyW'); await sleep(700); await b.keyUp('KeyW'); await sleep(600);
  const out = await ev(`(() => {
    const S = window.__SS, cam = S.activeCamera, V = S.scene.position.constructor;
    const gp = S.snap ? S.gojo.getPos() : null;
    const px = gp.x, pz = gp.z;
    const res = [];
    for (const y of [2, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18]) {
      const q = new V(px, y, pz); q.project(cam);
      const onScreen = Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z <= 1;
      res.push({ y, ndcY: +q.y.toFixed(2), onScreen });
    }
    return { camPos: [ +cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1) ],
             fov: cam.fov, player: [ +px.toFixed(1), +pz.toFixed(1) ], profile: res };
  })()`);
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
