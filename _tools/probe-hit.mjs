import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9711, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(1200);
  // 把玩家直接放到宿傩面前，确保范围足够
  const near = await b.evaluate(`(() => {
    const S = window.__SS; const g = S.gojo; const sk = S.sukuna;
    const sp = sk.root.position;
    g.root.position.set(sp.x, 0, sp.z + 1.4);
    g.faceTo(sp.x, sp.z, true);
    return { gx: +g.root.position.x.toFixed(2), gz: +g.root.position.z.toFixed(2), sx: +sp.x.toFixed(2), sz: +sp.z.toFixed(2) };
  })()`);
  log('站位 ' + JSON.stringify(near));
  await sleep(600);
  const hp = () => b.evaluate('+window.__SS.snap.sukuna.hp.toFixed(0)');
  const stats = () => b.evaluate(`(() => { const s = window.__SS.stats; return s ? { hits:s.hits, bf:s.blackFlash, dmg:s.dmgDealt, combo:s.maxCombo } : null; })()`);
  log('stats 接口: ' + JSON.stringify(await b.evaluate(`Object.keys(window.__SS).join(',')`)));
  const before = await hp(); log('宿傩 HP 起始 ' + before);
  let anims = [];
  for (let i = 0; i < 10; i++) {
    await b.pressKey('KeyJ', 50); await sleep(700);
    const a = await b.evaluate('window.__SS.snap.gojo.anim'); anims.push(a);
    const cur = await hp();
    if (i < 5) log('  第' + (i+1) + '次轻击后 HP=' + cur + ' (Δ' + (before - cur) + ') anim=' + a);
  }
  const after = await hp(); log('10 次轻击后 宿傩 HP=' + after + ' 总伤害=' + (before - after));
  await sleep(1200); log('轻击序列后 anim=' + await b.evaluate('window.__SS.snap.gojo.anim'));
  const b2 = await hp();
  for (let i = 0; i < 6; i++) { await b.pressKey('KeyK', 50); await sleep(900); }
  const a3 = await hp(); log('6 次重击后 宿傩 HP=' + a3 + ' 伤害=' + (b2 - a3) + ' anim=' + await b.evaluate('window.__SS.snap.gojo.anim'));
  await sleep(1500); log('全部结束后 anim=' + await b.evaluate('window.__SS.snap.gojo.anim'));
  log('帧耗时统计 ' + JSON.stringify(await b.evaluate(`(() => { const s = window.__SS.stats; return s || null; })()`)));
  await b.screenshot('shots/HIT-close.png');
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
