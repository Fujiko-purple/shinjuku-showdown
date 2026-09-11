import { Browser, sleep } from './cdp.mjs';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9727, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: NEW });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(900);
  const info = await b.evaluate(`(() => {
    const S = window.__SS;
    const C = S.combat;
    const out = { ssGojoName: S.gojo && S.gojo.animNames ? S.gojo.animNames.length : null,
      combatKeys: Object.keys(C || {}).slice(0, 40),
      hasGetSnapshot: typeof C.getSnapshot };
    try { const snap = C.getSnapshot(); out.snapAnim = snap.gojo.anim; } catch (e) { out.snapErr = String(e).slice(0,80); }
    return out;
  })()`);
  log(JSON.stringify(info));
  const id = await b.evaluate(`(() => {
    const S = window.__SS;
    const a = S.gojo;
    const C = S.combat;
    // 找出 combat 内部持有的 gojo ctrl：尝试常见字段
    const cands = [];
    for (const k of ['gojo','g','player','ctrl','root']) { if (C && C[k]) cands.push(k); }
    const res = { sameAsCombatGojo: C && C.gojo === a, cands };
    if (C && C.gojo) res.combatGojoHasDbg = !!C.gojo.dbg;
    return res;
  })()`);
  log('identity: ' + JSON.stringify(id));
  // 触发移动，同时看两个对象的 dbg
  await b.keyDown('KeyW'); await sleep(700);
  const both = await b.evaluate(`(() => { const S = window.__SS; return { ss: S.gojo.dbg, snapAnim: S.snap.gojo.anim }; })()`);
  log('移动中: ' + JSON.stringify(both));
  await b.keyUp('KeyW');
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
