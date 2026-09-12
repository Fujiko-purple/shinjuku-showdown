/**
 * probe-voidring2.mjs —— 快速定位领域里的白色圆环（在特效还活着的时候，逐层隐藏后立刻量）
 * 顺序：基线 → 藏 renderOrder=2（地面环） → 再藏 renderOrder=6（冲击波） → 再藏 renderOrder>=9（数字/文字）
 */
import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9689, width: 1280, height: 720 });
const shot = async (tag) => { const p = 'shots/RING2-' + tag + '.png'; await b.screenshot(p); return p; };
const measure = async () => {
  const cap = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: 720, scale: 0.25 }, captureBeyondViewport: false });
  const uri = 'data:image/png;base64,' + cap.data;
  return await b.evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(uri)}; await img.decode();
    const CW = 320, CH = 180; const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0, CW, CH);
    const d = c2.getImageData(0, 0, CW, CH).data;
    const x0 = Math.floor(CW*0.28), x1 = Math.floor(CW*0.72), y0 = Math.floor(CH*0.28), y1 = Math.floor(CH*0.72);
    let s = 0, n = 0, white = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y*CW+x)*4; const l = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; s += l; n++; if (l > 200) white++; }
    return { avg: +(s/n).toFixed(1), white: +(white/n*100).toFixed(2) };
  })()`);
};
const setRO = async (expr) => b.evaluate(`(() => { let c = 0; window.__SS.scene.traverse((o) => {
  if (!(o.isMesh || o.isPoints || o.isSprite)) return;
  if (!o.userData.__origRO && o.userData.__origRO !== 0) o.userData.__origRO = o.renderOrder;
  o.visible = !(${expr});
  if (${expr}) c++;
}); return c; })()`);
const restore = async () => b.evaluate('(() => { window.__SS.scene.traverse((o) => { o.visible = true; }); return 1; })()');
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(13000);
  await b.evaluate("document.getElementById('btn-skip-cine').click(); true");
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(1200);
  await b.evaluate('window.__SS.combat.setInvincible("gojo", true); true');
  await b.evaluate('window.__SS.combat.forceSkill("void","gojo"); true');
  await sleep(820);
  const rows = [];
  rows.push({ tag: 'base', ...(await measure()), p: await shot('base') });
  await setRO('o.renderOrder === 2'); rows.push({ tag: 'hide-RO2', ...(await measure()), p: await shot('ro2') });
  await restore(); await setRO('o.renderOrder === 6'); rows.push({ tag: 'hide-RO6', ...(await measure()), p: await shot('ro6') });
  await restore(); await setRO('o.renderOrder >= 9'); rows.push({ tag: 'hide-RO9+', ...(await measure()), p: await shot('ro9') });
  await restore(); await setRO('!o.userData.__origRO && !o.userData.__origRO !== true ? (o.material && o.material.blending === 2) : false'); rows.push({ tag: 'hide-additive', ...(await measure()), p: await shot('add') });
  await restore();
  console.log(JSON.stringify(rows, null, 1));
} catch (e) { console.log('FATAL ' + String(e).slice(0, 300)); }
finally { await b.close(); }
