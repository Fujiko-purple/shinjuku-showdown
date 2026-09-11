import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9673, width: 1280, height: 720 });
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const OLD = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';

const measure = `(() => {
  const S = window.__SS; if (!S || !S.gojo) return { err: 'no __SS' };
  const g = S.gojo, cam = S.activeCamera;
  const box = document.getElementById('app') || document.body;
  const W = window.innerWidth, H = window.innerHeight;
  const v = g.root.position.clone(); v.y += 1.78;
  const feet = g.root.position.clone();
  const hp = v.project(cam), fp = feet.project(cam);
  const cy = window.__CAMUI ? (window.__CAMUI.fracNear||null) : null;
  // 屏幕上的角色高度占比
  const frac = Math.abs(hp.y - fp.y) / 2;
  // 相机水平距离
  const dx = cam.position.x - g.root.position.x, dz = cam.position.z - g.root.position.z;
  const dist = Math.hypot(dx, dz);
  const dy = cam.position.y - g.root.position.y;
  return { frac: +frac.toFixed(3), dist: +dist.toFixed(2), camY: +cam.position.y.toFixed(2), dy: +dy.toFixed(2),
           fov: cam.fov, rootY: +g.root.position.y.toFixed(2), W, H, fracNear: cy };
})()`;

async function shot(url, tag) {
  await b.send('Page.navigate', { url });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine') && document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.evaluate(`document.getElementById('btn-start') && document.getElementById('btn-start').click(); true`);
  await sleep(2500);
  const m = await b.evaluate(measure);
  await b.screenshot('shots/AB-' + tag + '-idle.png');
  // 移动中
  await b.keyDown('KeyW'); await sleep(1200);
  const m2 = await b.evaluate(measure);
  await b.screenshot('shots/AB-' + tag + '-walk.png');
  await b.keyUp('KeyW');
  await sleep(600);
  // 打斗中（AI 开）
  const m3 = await b.evaluate(measure);
  await b.screenshot('shots/AB-' + tag + '-fight.png');
  console.log(tag + ' 站立 ' + JSON.stringify(m));
  console.log(tag + ' 行走 ' + JSON.stringify(m2));
  console.log(tag + ' 战斗 ' + JSON.stringify(m3));
}
try {
  await b.launch(); await b.newPage();
  await shot(OLD, 'old');
  await shot(NEW, 'new');
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
