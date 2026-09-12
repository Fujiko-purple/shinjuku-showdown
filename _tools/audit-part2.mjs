import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9735, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const issues = [], ok = [];
function chk(c, m) { (c ? ok : issues).push(m); log((c ? '  OK   ' : '  BUG  ') + m); }
const VIS = `(id) => { const e = document.getElementById(id); if (!e) return 'missing'; const s = getComputedStyle(e);
  let el = e, hidden = false;
  while (el) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity <= 0.05) { hidden = true; break; } el = el.parentElement; }
  const r = e.getBoundingClientRect();
  return { hidden, vis: !hidden, opacity: s.opacity, w: Math.round(r.width), h: Math.round(r.height) }; }`;
const vis = (id) => b.evaluate('(' + VIS + ')("' + id + '")');
const st = () => b.evaluate('window.__SS && window.__SS.state');
const crash = () => b.evaluate(`(() => { const e = document.getElementById('crash'); return e && !e.classList.contains('hidden') ? (document.getElementById('crash-msg')||{}).textContent : null; })()`);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await st()) === 'fight') break; }
  await sleep(2000);

  log('=== A. 暂停菜单 ===');
  await b.pressKey('Escape', 60); await sleep(1000);
  chk((await st()) === 'paused', '暂停 state=' + (await st()));
  for (const id of ['btn-resume','btn-restart','btn-totitle','vol-master','vol-music','vol-sfx']) {
    const v = await vis(id); chk(v.vis === true, '暂停菜单可见 #' + id + ' ' + JSON.stringify(v));
  }
  await b.screenshot('shots/AUD2-01-pause.png');
  // 音量滑块
  await b.evaluate(`(() => { const e = document.getElementById('vol-music'); if (!e) return false; e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(500);
  const bgm = await b.evaluate('window.__BGM_STATE ? window.__BGM_STATE() : null');
  log('  把音乐音量调到 30% 后 BGM 状态: ' + JSON.stringify(bgm));
  await b.evaluate(`(() => { const e = document.getElementById('vol-music'); if (e) { e.value = 70; e.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  await b.pressKey('Escape', 60); await sleep(800);
  chk((await st()) === 'fight', '继续游戏回到 fight');

  log('=== B. BGM 状态 ===');
  const bgm2 = await b.evaluate('window.__BGM_STATE ? window.__BGM_STATE() : null');
  log('  ' + JSON.stringify(bgm2));
  chk(bgm2 && bgm2.playing === true, '战斗中 BGM 正在播放 ' + JSON.stringify(bgm2));
  chk(!(await crash()), '无崩溃面板');

  log('=== C. 胜利路径（把宿傩打死）===');
  await b.evaluate(`(() => { window.__SS.combat.setAiEnabled(false); return true; })()`);
  await sleep(400);
  await b.evaluate(`(() => { const d = window.__SS.combat; for (let i = 0; i < 60; i++) d.applyDamage('sukuna', 200); return true; })()`);
  await sleep(3500);
  const sV = await st();
  log('  state=' + sV);
  chk(sV === 'victory', '击杀宿傩进入 victory state=' + sV);
  for (const id of ['result','btn-again','btn-back']) { const v = await vis(id); log('  #' + id + ' ' + JSON.stringify(v)); }
  const res = await vis('result');
  chk(res.vis === true, '结算层显示 #result ' + JSON.stringify(res));
  const title = await b.evaluate(`(() => { const e = document.getElementById('result'); return e ? (e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,120) : null; })()`);
  log('  结算文案: ' + title);
  await b.screenshot('shots/AUD2-02-victory.png');
  // 再战
  await b.evaluate(`(() => { const e = document.getElementById('btn-again'); if (e) e.click(); return true; })()`);
  await sleep(4000);
  const hp = await b.evaluate('window.__SS.snap.gojo.hp.toFixed(0) + "/" + window.__SS.snap.sukuna.hp.toFixed(0)');
  log('  再战后 HP: ' + hp + ' state=' + (await st()));
  chk((await st()) === 'fight', '再战进入 fight');
  chk(hp === '1500/1800', '再战 HP 已重置 ' + hp);

  log('=== D. 返回标题 ===');
  await b.pressKey('Escape', 60); await sleep(900);
  await b.evaluate(`(() => { const e = document.getElementById('btn-totitle'); if (e) e.click(); return true; })()`);
  await sleep(3000);
  const sT = await st();
  log('  state=' + sT);
  chk(sT === 'title' || sT === 'cutscene', '返回标题 state=' + sT);
  await b.screenshot('shots/AUD2-03-title.png');
  const start = await vis('btn-start');
  chk(start.vis === true, '标题界面回到可开始状态 ' + JSON.stringify(start));

  log('=== E. 标题 → 直接战斗 → 使用全部技能 ===');
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await st()) === 'fight') break; }
  await sleep(1500);
  const before = await b.evaluate('({ gojo: window.__SS.snap.gojo.hp, suku: window.__SS.snap.sukuna.hp })');
  for (const k of ['KeyU','KeyI','KeyO','KeyH','KeyJ','KeyJ','KeyK','Space','KeyG']) { await b.pressKey(k, 55); await sleep(1600); }
  await sleep(2500);
  const after = await b.evaluate('({ gojo: window.__SS.snap.gojo.hp, suku: window.__SS.snap.sukuna.hp, mode: window.__SS.snap.mode, dom: window.__SS.snap.gojo.domain })');
  log('  技能全放一遍: ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after));
  chk(!(await crash()), '全技能释放无崩溃');
  const dom = await b.evaluate('+(window.__SS.snap.gojo.domain||0)');
  log('  领域计量: ' + dom);
  await b.screenshot('shots/AUD2-04-allskills.png');
  const errs = await b.evaluate('window.__ERRORS ? window.__ERRORS.slice(0,5) : []').catch(()=>[]);
  log('页面错误 ' + JSON.stringify(b.errors.slice(0, 6)));
  log('\n通过 ' + ok.length + ' 项，问题 ' + issues.length + ' 项');
  for (const i of issues) log('  ✗ ' + i);
} catch (e) { log('FATAL ' + String(e).slice(0, 400)); }
finally { await b.close(); }
