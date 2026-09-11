import { Browser, sleep } from './cdp.mjs';
const OLD = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9721, width: 960, height: 560 });
const log = (...a) => console.log(...a);
async function run(url, tag) {
  await b.send('Page.navigate', { url });
  await sleep(15000);
  const ok = await b.evaluate(`(() => { const e = document.getElementById('btn-skip-cine'); if (!e) return false; e.click(); return true; })()`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(900);
  await b.evaluate(`(() => {
    window.__C = []; window.__MX = 0;
    const tick = () => { const S = window.__SS; const c = S.activeCamera; if (c) window.__C.push({ x:c.position.x, y:c.position.y, z:c.position.z });
      if (S.fx && S.fx.screenState) window.__MX = Math.max(window.__MX, S.fx.screenState.shake || 0);
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window.__CLR2 = () => { window.__C.length = 0; window.__MX = 0; }; return true;
  })()`);
  await b.evaluate(`(() => { const S = window.__SS; const sp = S.sukuna.root.position; S.gojo.setPos(sp.x, 0, sp.z + 1.5); S.gojo.faceTo(sp.x, sp.z, true); return true; })()`);
  await sleep(400);
  await b.evaluate('window.__CLR2(); true');
  for (const k of ['KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 45); await sleep(450); }
  await sleep(800);
  const C = await b.evaluate('window.__C.slice()');
  const mx = await b.evaluate('+window.__MX.toFixed(3)');
  // 相机相邻帧位移的抖动（去趋势：与 5 帧滑动平均比较）
  let peak = 0, sum = 0, n = 0;
  for (let i = 6; i < C.length; i++) {
    const avg = { x: 0, y: 0, z: 0 };
    for (let j = i - 5; j < i; j++) { avg.x += C[j].x; avg.y += C[j].y; avg.z += C[j].z; }
    avg.x /= 5; avg.y /= 5; avg.z /= 5;
    const dev = Math.hypot(C[i].x - avg.x, C[i].y - avg.y, C[i].z - avg.z);
    peak = Math.max(peak, dev); sum += dev; n++;
  }
  log(tag + ' screenState.shake 峰值=' + mx + '  相机抖动(去趋势) 峰值=' + peak.toFixed(4) + ' 均值=' + (n ? (sum/n).toFixed(4) : '-') + '  帧数=' + C.length);
}
try {
  await b.launch(); await b.newPage();
  await run(OLD, '原版');
  await run(NEW, '新版');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
