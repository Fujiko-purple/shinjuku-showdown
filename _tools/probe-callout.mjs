import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9691, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(2000);
  // 把镜头压到最低俯角，逼出"角色贴近画面上缘"的极端情形
  await b.evaluate(`(() => { window.__FORCE = 0.16; if (!window.__FT) window.__FT = setInterval(() => { if (window.__FORCE != null) window.__SS.cam.pitch = window.__FORCE; }, 16); return true; })()`);
  await sleep(1200);
  // 直接触发一个锚在角色胸口上方 1.2m 的黑闪大字（与 combat.js 1379 行同参数）
  const r = await b.evaluate(`(() => {
    const S = window.__SS;
    const p = S.gojo.chest.getWorldPosition(new (S.gojo.root.position.constructor)());
    p.y += 1.2;
    S.fx.callout({ text: '黑闪', sub: 'BLACK FLASH', pos: p, color: 16766720, color2: 394758, life: 3, size: 2.4, shake: 0.6, rise: 1.6 });
    return true;
  })()`);
  log('触发 callout ' + r);
  await sleep(500);
  const ndc = await b.evaluate(`(() => {
    const S = window.__SS, cam = S.activeCamera;
    const sprites = [];
    S.scene.traverse(o => { if (o.isSprite && o.renderOrder === 20 && o.visible && o.material && o.material.map) sprites.push(o); });
    const out = sprites.map(s => { const v = s.position.clone().project(cam); return { x: +v.x.toFixed(2), y: +v.y.toFixed(2) }; });
    const camUI = window.__CAMUI || {};
    return { n: sprites.length, ndc: out, camera: { pitch: camUI.usePitch, dist: camUI.dist } };
  })()`);
  log('callout NDC ' + JSON.stringify(ndc));
  await b.screenshot('shots/CALLOUT-safe.png');
  await b.evaluate('window.__FORCE = null; true');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
