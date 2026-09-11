import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9675, width: 1280, height: 720 });
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const OLD = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';

const measure = `(() => {
  const S = window.__SS; if (!S || !S.gojo) return { err: 'no __SS' };
  const g = S.gojo, cam = S.activeCamera;
  const v = g.root.position.clone(); v.y += 1.78;
  const feet = g.root.position.clone();
  const hp = v.project(cam), fp = feet.project(cam);
  const frac = Math.abs(hp.y - fp.y) / 2;
  const dx = cam.position.x - g.root.position.x, dz = cam.position.z - g.root.position.z;
  return { frac: +frac.toFixed(3), dist: +Math.hypot(dx,dz).toFixed(2), camY: +cam.position.y.toFixed(2),
           fov: +cam.fov.toFixed(1), state: S.state, phase: S.snap ? S.snap.gojo.phase : null, anim: S.snap ? S.snap.gojo.anim : null };
})()`;

async function shot(url, tag) {
  await b.send('Page.navigate', { url });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine') && document.getElementById('btn-skip-cine').click(); true`);
  // 等真正进入 fight
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const st = await b.evaluate('window.__SS && window.__SS.state');
    if (st === 'fight') break;
  }
  await sleep(3000);
  console.log(tag + ' 状态 ' + JSON.stringify(await b.evaluate(measure)));
  await b.screenshot('shots/AB2-' + tag + '-idle.png');
  await b.keyDown('KeyW'); await sleep(1600);
  console.log(tag + ' 行走 ' + JSON.stringify(await b.evaluate(measure)));
  await b.screenshot('shots/AB2-' + tag + '-walk.png');
  await b.keyUp('KeyW'); await sleep(500);
  for (const k of ['KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 60); await sleep(300); }
  await sleep(300);
  console.log(tag + ' 出招 ' + JSON.stringify(await b.evaluate(measure)));
  await b.screenshot('shots/AB2-' + tag + '-atk.png');
}
try {
  await b.launch(); await b.newPage();
  await shot(OLD, 'old');
  await shot(NEW, 'new');
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
