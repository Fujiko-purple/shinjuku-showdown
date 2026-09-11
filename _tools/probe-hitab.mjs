import { Browser, sleep } from './cdp.mjs';
const OLD = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9713, width: 960, height: 560 });
const log = (...a) => console.log(...a);
async function run(url, tag) {
  await b.send('Page.navigate', { url });
  await sleep(14000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(1000);
  // 记录所有 hit 事件 + hitstop 峰值
  await b.evaluate(`(() => {
    window.__H = []; window.__HS = 0;
    const c = window.__SS.combat;
    if (c && c.pushEvent) { const o = c.pushEvent.bind(c); c.pushEvent = function(e){ if (e && (e.type==='hit'||e.type==='blackflash')) window.__H.push(e); return o(e); }; }
    const tick = () => { const h = window.__SS.combat && window.__SS.combat.hitstop; if (h && h > window.__HS) window.__HS = h; requestAnimationFrame(tick); };
    requestAnimationFrame(tick); return true;
  })()`);
  await b.evaluate(`(() => { const S = window.__SS; const sp = S.sukuna.root.position;
    S.gojo.setPos(sp.x, 0, sp.z + 1.5); S.gojo.faceTo(sp.x, sp.z, true);
    return true; })()`);
  await sleep(500);
  const hp0 = await b.evaluate('+window.__SS.snap.sukuna.hp.toFixed(0)');
  // 三连轻击 + 重击
  for (const k of ['KeyJ','KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 50); await sleep(420); }
  await sleep(1600);
  const hp1 = await b.evaluate('+window.__SS.snap.sukuna.hp.toFixed(0)');
  const H = await b.evaluate('window.__H.slice()');
  const HS = await b.evaluate('+window.__HS.toFixed(3)');
  const anim = await b.evaluate('window.__SS.snap.gojo.anim');
  const dmgList = H.filter(e => e.side === 'gojo' || e.side === 'GOJO' || e.side === 0).map(e => e.amount);
  log(tag + ' 宿傩HP ' + hp0 + ' -> ' + hp1 + ' (Δ' + (hp0-hp1) + ')');
  log('   事件 ' + JSON.stringify(H.slice(0,8)));
  log('   hitstop 峰值=' + HS + '  结束 anim=' + anim + '  伤害序列=' + JSON.stringify(dmgList));
}
try {
  await b.launch(); await b.newPage();
  await run(OLD, '原版');
  await run(NEW, '新版');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }