import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9741, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const issues = [], ok = [];
function chk(c, m) { (c ? ok : issues).push(m); log((c ? '  OK   ' : '  BUG  ') + m); }
const st = () => b.evaluate('window.__SS && window.__SS.state');
const near = () => b.evaluate(`(() => { const S = window.__SS; const sp = S.sukuna.root.position; S.gojo.setPos(sp.x, 0, sp.z + 1.3); S.gojo.faceTo(sp.x, sp.z, true); return true; })()`);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await st()) === 'fight') break; }
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setAiEnabled(false); d.setInvincible("gojo", true); return true; })()`);
  await sleep(1500);

  log('=== A. 三连段伤害递进 ===');
  await near(); await sleep(400);
  const hits = [];
  await b.evaluate(`(() => { window.__SS.stats.hits = 0; window.__SS.stats.dmgDealt = 0; return true; })()`);
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < 3; i++) { await b.pressKey('KeyJ', 45); await sleep(300); }
    await sleep(900);
    await near(); await sleep(300);
  }
  const hitCount = await b.evaluate('window.__SS.stats.hits');
  const dmg = await b.evaluate('window.__SS.stats.dmgDealt');
  chk(hitCount > 6, '近身三连段能命中 (' + hitCount + ' 次, 总伤害 ' + Math.round(dmg) + ')');
  const chain = await b.evaluate('window.__SS.snap.combo');
  log('  连击计数 ' + chain);

  log('=== B. 黑闪 ===');
  await b.evaluate('window.__H.length = 0; true');
  const bf0 = await b.evaluate('window.__SS.stats.blackFlash');
  let bfHit = 0;
  for (let i = 0; i < 10; i++) {
    await near();
    await b.pressKey('KeyJ', 40); await sleep(140);   // 先命中一次，开黑闪窗口
    await b.pressKey('KeyK', 40); await sleep(800);   // 窗口内重击
    const n = await b.evaluate('window.__SS.stats.blackFlash');
    if (n > bf0) { bfHit = i + 1; break; }
  }
  const bf1 = await b.evaluate('window.__SS.stats.blackFlash');
  log('  黑闪 ' + bf0 + ' -> ' + bf1 + '（第 ' + bfHit + ' 轮触发）');
  chk(bf1 > bf0, '黑闪可以触发（' + bf1 + ' 次）');
  await b.screenshot('shots/AUD5-01-blackflash.png');

  log('=== C. 伤害数字与打击反馈 ===');
  await b.evaluate(`(() => { window.__FX = []; const fx = window.__SS.fx; for (const k of ['screen','hitSpark','damageNumber','shockwave']) { if (typeof fx[k] !== 'function') continue; const o = fx[k].bind(fx); fx[k] = function(a){ window.__FX.push({k, a: a && { shake:a.shake, count:a.count, amount:a.amount, crit:a.crit, maxRadius:a.maxRadius }}); return o(a); }; } return true; })()`);
  await near();
  await b.pressKey('KeyJ', 45); await sleep(900);
  const FX = await b.evaluate('window.__FX.slice()');
  log('  ' + JSON.stringify(FX));
  chk(FX.some(x => x.k === 'damageNumber'), '命中产生伤害数字');
  chk(FX.some(x => x.k === 'hitSpark'), '命中产生火花');
  chk(FX.some(x => x.k === 'screen' && (x.a.shake||0) > 0.4), '命中产生屏幕震动');

  log('=== D. 连击/连段是否被 HUD 正确显示 ===');
  await near();
  for (let i = 0; i < 4; i++) { await b.pressKey('KeyJ', 40); await sleep(220); }
  await sleep(200);
  const comboUI = await b.evaluate(`(() => { const e = document.getElementById('combo'); if (!e) return 'missing'; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { txt: (e.textContent||'').replace(/\\s+/g,' ').trim(), w: Math.round(r.width), visible: cs.display !== 'none' && +cs.opacity > 0.05 }; })()`);
  log('  连击 HUD: ' + JSON.stringify(comboUI));
  await b.screenshot('shots/AUD5-02-combo.png');
  log('页面错误 ' + JSON.stringify(b.errors.slice(0, 6)));
  log('\n通过 ' + ok.length + ' 项，问题 ' + issues.length + ' 项');
  for (const i of issues) log('  ✗ ' + i);
} catch (e) { log('FATAL ' + String(e).slice(0, 400)); }
finally { await b.close(); }