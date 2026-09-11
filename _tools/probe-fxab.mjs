import { Browser, sleep } from './cdp.mjs';
const OLD = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9715, width: 960, height: 560 });
const log = (...a) => console.log(...a);
async function run(url, tag) {
  await b.send('Page.navigate', { url });
  await sleep(14000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(1000);
  const ok = await b.evaluate(`(() => {
    window.__FX = [];
    const fx = window.__SS.fx;
    if (!fx) return 'no fx';
    for (const k of ['screen','hitSpark','damageNumber','shockwave','impact']) {
      if (typeof fx[k] !== 'function') continue;
      const o = fx[k].bind(fx);
      fx[k] = function (a) { try { window.__FX.push({ k, a: JSON.parse(JSON.stringify(a && a.pos ? Object.assign({}, a, { pos: 'v' }) : (a || {}))) }); } catch (e) { window.__FX.push({ k, a: 'x' }); } return o(a); };
    }
    return Object.keys(fx).join(',');
  })()`);
  log(tag + ' fx keys: ' + String(ok).slice(0, 200));
  await b.evaluate(`(() => { const S = window.__SS; const sp = S.sukuna.root.position; S.gojo.setPos(sp.x, 0, sp.z + 1.5); S.gojo.faceTo(sp.x, sp.z, true); return true; })()`);
  await sleep(500);
  await b.evaluate('window.__FX.length = 0; true');
  const hp0 = await b.evaluate('+window.__SS.snap.sukuna.hp.toFixed(0)');
  for (const k of ['KeyJ','KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 50); await sleep(420); }
  await sleep(1400);
  const hp1 = await b.evaluate('+window.__SS.snap.sukuna.hp.toFixed(0)');
  const F = await b.evaluate('window.__FX.slice()');
  const screens = F.filter(x => x.k === 'screen');
  const sparks = F.filter(x => x.k === 'hitSpark');
  const nums = F.filter(x => x.k === 'damageNumber');
  log(tag + ' 伤害 Δ' + (hp0 - hp1) + '；hitSpark=' + sparks.length + ' damageNumber=' + nums.length + ' screen=' + screens.length);
  log('   screen 参数: ' + JSON.stringify(screens.map(s => s.a)));
  log('   damageNumber 金额: ' + JSON.stringify(nums.map(n => n.a.amount)));
  log('   hitSpark count: ' + JSON.stringify(sparks.map(s => s.a.count)));
}
try {
  await b.launch(); await b.newPage();
  await run(OLD, '原版');
  await run(NEW, '新版');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
