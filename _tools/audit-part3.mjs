import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9737, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
const issues = [], ok = [];
function chk(c, m) { (c ? ok : issues).push(m); log((c ? '  OK   ' : '  BUG  ') + m); }
const st = () => b.evaluate('window.__SS && window.__SS.state');
const crash = () => b.evaluate(`(() => { const e = document.getElementById('crash'); return e && !e.classList.contains('hidden') ? (document.getElementById('crash-msg')||{}).textContent : null; })()`);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await st()) === 'fight') break; }
  await sleep(2000);

  log('=== A. 音量面板 ===');
  const dock = await b.evaluate(`(() => { const d = document.querySelector('.audio-dock'); const t = document.querySelector('.audio-toggle'); if (!d || !t) return 'missing'; t.click(); return d.classList.contains('open'); })()`);
  await sleep(400);
  const sliders = await b.evaluate(`(() => { const out = {}; for (const id of ['vol-master','vol-music','vol-sfx']) { const e = document.getElementById(id); if (!e) { out[id]='missing'; continue; } const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); out[id] = { w: Math.round(r.width), h: Math.round(r.height), disp: cs.display }; } return out; })()`);
  log('  展开音量面板后: ' + JSON.stringify(sliders));
  chk(Object.values(sliders).every(s => s.w > 20), '音量滑块可交互 ' + JSON.stringify(sliders));

  log('=== B. 重开 HP 是否立刻复位 ===');
  await b.evaluate(`(() => { window.__SS.combat.setAiEnabled(false); return true; })()`);
  await b.pressKey('KeyR', 60);
  await sleep(700);
  const hpR = await b.evaluate('window.__SS.snap.gojo.hp.toFixed(0) + "/" + window.__SS.snap.sukuna.hp.toFixed(0)');
  log('  R 键重开后 0.7s: ' + hpR);
  chk(hpR === '1500/1800', 'R 重开立刻满血 ' + hpR);
  const pos = await b.evaluate('window.__SS.gojo.root.position.x.toFixed(1) + "," + window.__SS.gojo.root.position.z.toFixed(1)');
  log('  出生位置: ' + pos);

  log('=== C. forceSkill 全技能逐个 ===');
  const skills = await b.evaluate(`(() => { try { return Object.keys(window.__SS.combat.forceSkill ? {} : {}); } catch (e) { return []; } })()`);
  const names = ['PUNCH','KICK','UPPER','BLUE','RED','PURPLE','PURPLE_200','DISMANTLE','WORLD_SLASH','FURNACE','HEAL','INFINITY','DOMAIN','RUSH','BLACK_FLASH'];
  const before3 = await b.evaluate('({g: window.__SS.snap.gojo.hp, s: window.__SS.snap.sukuna.hp})');
  let bad = [];
  for (const n of names) {
    const r = await b.evaluate('(() => { try { window.__SS.combat.forceSkill("gojo","' + n + '"); return "ok"; } catch (e) { return "throw: " + String(e).slice(0,60); } })()');
    await sleep(1400);
    const c = await crash();
    if (c) { bad.push(n + ' 崩溃'); break; }
    const anim = await b.evaluate('window.__SS.snap.gojo.anim');
    log('  ' + n + ': ' + r + ' anim=' + anim);
  }
  chk(bad.length === 0, '全部 forceSkill 无崩溃 ' + JSON.stringify(bad));
  await b.screenshot('shots/AUD3-01-skills.png');

  log('=== D. 领域展开 + 对撞 ===');
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setInvincible && d.setInvincible("gojo", true); return true; })()`);
  const domTry = await b.evaluate('(() => { try { window.__SS.combat.forceSkill("gojo","DOMAIN"); return "ok"; } catch(e) { return String(e).slice(0,80); } })()');
  await sleep(3500);
  const domState = await b.evaluate('({ dom: window.__SS.snap.gojoDomain, mode: window.__SS.snap.mode, anim: window.__SS.snap.gojo.anim })');
  log('  五条领域: ' + domTry + ' ' + JSON.stringify(domState));
  await b.screenshot('shots/AUD3-02-domain.png');
  await sleep(3000);
  const domState2 = await b.evaluate('({ dom: window.__SS.snap.gojoDomain, mode: window.__SS.snap.mode })');
  log('  3s 后: ' + JSON.stringify(domState2));
  const clashTry = await b.evaluate('(() => { try { window.__SS.combat.forceSkill("sukuna","DOMAIN"); return "ok"; } catch(e) { return String(e).slice(0,80); } })()');
  await sleep(3500);
  const clash = await b.evaluate('({ clash: window.__SS.snap.clashActive, mode: window.__SS.snap.mode })');
  log('  宿傩领域(对撞): ' + clashTry + ' ' + JSON.stringify(clash));
  await b.screenshot('shots/AUD3-03-clash.png');
  await sleep(5000);
  const clash2 = await b.evaluate('({ clash: window.__SS.snap.clashActive, mode: window.__SS.snap.mode, g: window.__SS.snap.gojo.hp.toFixed(0), s: window.__SS.snap.sukuna.hp.toFixed(0) })');
  log('  对撞 5s 后: ' + JSON.stringify(clash2));
  await b.screenshot('shots/AUD3-04-clash-end.png');
  chk(!(await crash()), '领域/对撞无崩溃');

  log('=== E. 性能（领域期间帧率）===');
  await b.evaluate(`(() => { window.__FPS = []; let last = performance.now(); const tick = () => { const n = performance.now(); window.__FPS.push(n - last); last = n; if (window.__FPS.length > 3000) window.__FPS.shift(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`);
  await sleep(6000);
  const fps = await b.evaluate(`(() => { const a = window.__FPS.slice(); if (a.length < 10) return null; const avg = a.reduce((p,c)=>p+c,0)/a.length; const sorted = a.slice().sort((x,y)=>x-y); return { n:a.length, avgFps:+(1000/avg).toFixed(1), p95ms:+sorted[Math.floor(sorted.length*0.95)].toFixed(1), worstMs:+sorted[sorted.length-1].toFixed(1), longFrames: a.filter(x=>x>33).length }; })()`);
  log('  ' + JSON.stringify(fps));
  chk(fps && fps.avgFps > 40, '领域期间平均帧率 > 40 (' + (fps?fps.avgFps:'-') + ')');
  chk(fps && fps.longFrames < 20, '长帧数 < 20 (' + (fps?fps.longFrames:'-') + ')');
  log('页面错误 ' + JSON.stringify(b.errors.slice(0, 6)));
  log('\n通过 ' + ok.length + ' 项，问题 ' + issues.length + ' 项');
  for (const i of issues) log('  ✗ ' + i);
} catch (e) { log('FATAL ' + String(e).slice(0, 400)); }
finally { await b.close(); }
