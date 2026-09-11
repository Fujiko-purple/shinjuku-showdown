import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9703, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(1200);
  await b.evaluate(`(() => {
    window.__F = [];
    const tick = () => { const S = window.__SS, g = S.gojo;
      window.__F.push({ t:+performance.now().toFixed(0), a:S.snap.gojo.anim,
        th:+g.bones.thighL.rotation.x.toFixed(3), k:+g.bones.shinL.rotation.x.toFixed(3),
        x:+g.root.position.x.toFixed(3), z:+g.root.position.z.toFixed(3), hp:+S.snap.gojo.hp.toFixed(0) });
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick); window.__CLR = () => { window.__F.length = 0; }; return true;
  })()`);
  const keys = ['KeyW','KeyA','KeyS','KeyD'];
  const acts = ['KeyJ','KeyJ','KeyK','KeyU','KeyI','Space','KeyH'];
  const t0 = Date.now();
  let held = null;
  while (Date.now() - t0 < 55000) {
    if (held) { await b.keyUp(held); held = null; }
    const r = Math.random();
    if (r < 0.18) { await b.keyDown('ShiftLeft'); await sleep(800 + Math.random()*900); await b.keyUp('ShiftLeft'); }
    else {
      const k = keys[Math.floor(Math.random()*keys.length)];
      await b.keyDown(k); held = k;
      await sleep(400 + Math.random()*900);
      if (Math.random() < 0.7) { await b.pressKey(acts[Math.floor(Math.random()*acts.length)], 55); }
      if (Math.random() < 0.35) { await b.keyDown('ShiftLeft'); await sleep(300+Math.random()*500); await b.keyUp('ShiftLeft'); }
      await b.keyUp(k); held = null;
      await sleep(200);
    }
  }
  await sleep(1500);
  const rows = await b.evaluate('window.__F.slice()');
  log('采样 ' + rows.length + ' 帧，' + ((rows[rows.length-1].t - rows[0].t)/1000).toFixed(1) + ' s');
  // 滑行检测：0.5s 窗口内位移 > 0.8m 但大腿摆幅 < 0.25rad ⇒ 僵硬滑行
  const W = 0.5;
  let bad = [], cur = null;
  for (let i = 0; i < rows.length; i++) {
    while (rows[i].t - rows[Math.max(0,i)].t > 0) break;
  }
  let j = 0;
  for (let i = 0; i < rows.length; i++) {
    while (rows[i].t - rows[j].t > W*1000) j++;
    const win = rows.slice(j, i+1);
    if (win[win.length-1].t - win[0].t < 250) continue;
    const dist = Math.hypot(win[win.length-1].x - win[0].x, win[win.length-1].z - win[0].z);
    const th = win.map(w => w.th); const range = Math.max(...th) - Math.min(...th);
    const an = [...new Set(win.map(w => w.a))];
    const legit = an.every(a => ['punch','punch2','kick','upper','combo_finish','dash','backstep','air_spin','hit_light','hit_heavy','knockback','down','getup','cast_point','cast_charge','cast_release','chant','heal','domain_expand','jump','land','defeat','victory','guard_infinity','block','block_hit','taunt'].includes(a));
    if (dist > 1.0 && range < 0.25 && !legit) {
      if (!cur || i - cur.end > 12) { cur = { start: i, end: i, anims: new Set(an), dist, range }; bad.push(cur); }
      else { cur.end = i; cur.dist = Math.max(cur.dist, dist); cur.range = Math.min(cur.range, range); an.forEach(a=>cur.anims.add(a)); }
    }
  }
  log('僵硬滑行窗口数: ' + bad.length);
  for (const w of bad.slice(0, 12)) {
    const dur = ((rows[w.end].t - rows[w.start].t)/1000).toFixed(2);
    log('  ' + dur + 's  anim=' + JSON.stringify([...w.anims]) + '  位移=' + w.dist.toFixed(2) + 'm  摆幅=' + w.range.toFixed(3));
  }
  // 最终静止检查
  await sleep(2000);
  const last = await b.evaluate('window.__SS.snap.gojo.anim');
  log('全部输入松开 2s 后 anim=' + last);
  log('错误 ' + JSON.stringify(b.errors.slice(0,5)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }