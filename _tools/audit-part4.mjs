import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9739, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const issues = [], ok = [];
function chk(c, m) { (c ? ok : issues).push(m); log((c ? '  OK   ' : '  BUG  ') + m); }
const st = () => b.evaluate('window.__SS && window.__SS.state');
const crash = () => b.evaluate(`(() => { const e = document.getElementById('crash'); return e && !e.classList.contains('hidden') ? (document.getElementById('crash-msg')||{}).textContent : null; })()`);
const FS = (sk, side) => b.evaluate('(() => { try { window.__SS.combat.forceSkill("' + sk + '","' + side + '"); return "ok"; } catch (e) { return "throw:" + String(e).slice(0,80); } })()');
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await st()) === 'fight') break; }
  await sleep(2000);
  const sk = await b.evaluate(`Object.keys(window.__SS.gojo).length`);
  // 逐技能（正确的参数顺序）
  const list = ['punch','kick','blackflash','blue','red','purple','purple200','reverse','infinity','dismantle','cleave','furnace','worldslash','mahoraga','rush'];
  log('=== A. 五条技能逐个（正确参数序）===');
  for (const n of list) {
    await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible && d.setInvincible("gojo", true); return true; })()`);
    const r = await FS(n, 'gojo');
    await sleep(1500);
    const a = await b.evaluate('window.__SS.snap.gojo.anim');
    const hp = await b.evaluate('window.__SS.snap.sukuna.hp.toFixed(0)');
    log('  ' + n.padEnd(12) + ' ' + r + ' anim=' + a + ' 宿傩HP=' + hp);
    if (await crash()) { issues.push(n + ' 崩溃'); break; }
  }
  chk(!(await crash()), '五条全部技能无崩溃');
  await b.screenshot('shots/AUD4-01-skills.png');

  log('=== B. 五条领域展开 ===');
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible && d.setInvincible("gojo", true); d.setAiEnabled(false); return true; })()`);
  const r1 = await FS('void', 'gojo');
  let domSeen = null;
  for (let i = 0; i < 20; i++) { await sleep(400); const d = await b.evaluate('window.__SS.snap.gojoDomain'); if (d) { domSeen = { at: i*0.4, kind: d }; break; } }
  log('  ' + r1 + ' 领域出现: ' + JSON.stringify(domSeen));
  await b.screenshot('shots/AUD4-02-void.png');
  chk(domSeen !== null, '五条领域展开成功 ' + JSON.stringify(domSeen));
  await sleep(6000);
  const dom2 = await b.evaluate('window.__SS.snap.gojoDomain');
  log('  6s 后领域: ' + JSON.stringify(dom2));

  log('=== C. 领域对撞 ===');
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible && d.setInvincible("gojo", true); d.setInvincible && d.setInvincible("sukuna", true); return true; })()`);
  const r2 = await FS('shrine', 'sukuna');
  let clashed = false;
  for (let i = 0; i < 25; i++) { await sleep(400); const c = await b.evaluate('window.__SS.snap.clashActive'); if (c) { clashed = true; log('  对撞在第 ' + (i*0.4).toFixed(1) + 's 触发'); break; } }
  log('  ' + r2 + ' clashActive=' + clashed);
  await b.screenshot('shots/AUD4-03-clash.png');
  chk(clashed, '领域对撞触发');
  await sleep(6000);
  const c2 = await b.evaluate('({ clash: window.__SS.snap.clashActive, mode: window.__SS.snap.mode, tug: window.__SS.snap.tug })');
  log('  对撞 6s 后: ' + JSON.stringify(c2));
  await b.screenshot('shots/AUD4-04-clash2.png');

  log('=== D. 黑闪触发（命中窗口内重击收招）===');
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible && d.setInvincible("gojo", true); return true; })()`);
  const bf0 = await b.evaluate('window.__SS.stats.blackFlash');
  for (let i = 0; i < 12; i++) { await b.pressKey('KeyJ', 45); await sleep(330); if (i % 3 === 2) { await b.pressKey('KeyK', 45); await sleep(330); } }
  await sleep(2000);
  const bf1 = await b.evaluate('window.__SS.stats.blackFlash');
  log('  黑闪次数 ' + bf0 + ' -> ' + bf1);
  await b.screenshot('shots/AUD4-05-blackflash.png');
  log('页面错误 ' + JSON.stringify(b.errors.slice(0, 6)));
  log('\n通过 ' + ok.length + ' 项，问题 ' + issues.length + ' 项');
  for (const i of issues) log('  ✗ ' + i);
} catch (e) { log('FATAL ' + String(e).slice(0, 400)); }
finally { await b.close(); }
