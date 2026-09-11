import { Browser, sleep } from './cdp.mjs';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9723, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: NEW });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(900);
  await b.evaluate(`(() => {
    window.__FX = []; window.__MX = 0; window.__PX = 0; window.__PZ = 0;
    const fx = window.__SS.fx;
    for (const k of ['screen','hitSpark','damageNumber','shockwave']) {
      if (typeof fx[k] !== 'function') continue;
      const o = fx[k].bind(fx);
      fx[k] = function (a) { try { window.__FX.push({ k, shake:(a&&a.shake), count:(a&&a.count), amount:(a&&a.amount), crit:!!(a&&a.crit), maxRadius:(a&&a.maxRadius), freeze:(a&&a.freeze) }); } catch(e){} return o(a); };
    }
    const cam = window.__SS.cam;
    const tick = () => { if (fx.screenState) window.__MX = Math.max(window.__MX, fx.screenState.shake||0);
      if (window.__SS.cam) { window.__PX = window.__SS.cam.panX; window.__PZ = window.__SS.cam.panZ; window.__PMAX = Math.max(window.__PMAX||0, Math.hypot(window.__SS.cam.panX, window.__SS.cam.panZ)); }
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window.__CLR3 = () => { window.__FX.length = 0; window.__MX = 0; window.__PMAX = 0; }; return true;
  })()`);
  await b.evaluate(`(() => { const S = window.__SS; const sp = S.sukuna.root.position; S.gojo.setPos(sp.x, 0, sp.z + 1.5); S.gojo.faceTo(sp.x, sp.z, true); return true; })()`);
  await sleep(400);
  const hp0 = await b.evaluate('+window.__SS.snap.sukuna.hp.toFixed(0)');
  await b.evaluate('window.__CLR3(); true');
  await b.pressKey('KeyJ', 45); await sleep(800);
  let F = await b.evaluate('window.__FX.slice()');
  log('轻击: shake=' + await b.evaluate('+window.__MX.toFixed(3)') + ' cam kick 峰值=' + await b.evaluate('+(window.__PMAX||0).toFixed(3)'));
  log('   ' + JSON.stringify(F.map(x => x.k + ':' + JSON.stringify([x.count ?? x.shake ?? x.maxRadius ?? x.amount, x.crit])).join(' ')));
  await b.evaluate('window.__CLR3(); true');
  await b.pressKey('KeyK', 45); await sleep(900);
  F = await b.evaluate('window.__FX.slice()');
  log('重击: shake=' + await b.evaluate('+window.__MX.toFixed(3)') + ' cam kick 峰值=' + await b.evaluate('+(window.__PMAX||0).toFixed(3)'));
  log('   ' + JSON.stringify(F.map(x => x.k + ':' + JSON.stringify([x.count ?? x.shake ?? x.maxRadius ?? x.amount, x.crit])).join(' ')));
  const hp1 = await b.evaluate('+window.__SS.snap.sukuna.hp.toFixed(0)');
  log('伤害 ' + hp0 + ' -> ' + hp1);
  log('错误 ' + JSON.stringify(b.errors.slice(0,5)));
  await b.screenshot('shots/IMPACT-heavy.png');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
