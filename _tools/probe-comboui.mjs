import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9743, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setAiEnabled(false); d.setInvincible("gojo", true); return true; })()`);
  await sleep(1200);
  await b.evaluate(`(() => { window.__C = []; const t = () => { const e = document.getElementById('combo'); const s = window.__SS.snap; window.__C.push({ t:+performance.now().toFixed(0), combo:s.combo, cls: e ? e.className : 'missing', op: e ? +getComputedStyle(e).opacity : -1, disp: e ? getComputedStyle(e).display : '-' }); requestAnimationFrame(t); }; requestAnimationFrame(t); return true; })()`);
  const near = () => b.evaluate(`(() => { const S = window.__SS; const sp = S.sukuna.root.position; S.gojo.setPos(sp.x, 0, sp.z + 1.3); S.gojo.faceTo(sp.x, sp.z, true); return true; })()`);
  for (let i = 0; i < 6; i++) { await near(); await b.pressKey('KeyJ', 40); await sleep(260); }
  await sleep(1500);
  const C = await b.evaluate('window.__C.slice()');
  const shown = C.filter(x => x.combo >= 2);
  console.log('连击>=2 的帧: ' + shown.length + '，其中带 show 类: ' + shown.filter(x => /show/.test(x.cls)).length + '，opacity>0.05: ' + shown.filter(x => x.op > 0.05).length);
  const seg = C.filter((_,i)=>i%12===0).map(x => x.combo + '|' + (/show/.test(x.cls)?'S':'-') + '|' + x.op.toFixed(1) + '|' + x.disp).slice(-22);
  console.log('序列: ' + JSON.stringify(seg));
  console.log('错误 ' + JSON.stringify(b.errors.slice(0,3)));
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
