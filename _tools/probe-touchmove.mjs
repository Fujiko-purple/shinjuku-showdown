import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1';
const b = new Browser({ port: 9695, width: 844, height: 390 });
const log = (...a) => console.log(...a);
let TOUCH = [];
async function flush(type) { await b.send('Input.dispatchTouchEvent', { type, touchPoints: TOUCH }); }
async function rect(sel) { return b.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), w: Math.round(r.width), h: Math.round(r.height) }; })()`); }
async function tap(sel) {
  const r = await rect(sel); if (!r) { log('no ' + sel); return; }
  TOUCH = [{ x: r.x, y: r.y, id: 11 }];
  await flush('touchStart'); await sleep(70); TOUCH = []; await flush('touchEnd'); await sleep(120);
}
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: URL });
  await sleep(14000);
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]'); if (e) e.click(); return true; })()`);
  await sleep(1000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(1000);
  await b.evaluate(`(() => { window.__M = []; const tick = () => { const S = window.__SS, g = S.gojo; window.__M.push({ t:+performance.now().toFixed(0), a:S.snap.gojo.anim, ph:S.snap.gojo.phase, th:+g.bones.thighL.rotation.x.toFixed(3), x:+g.root.position.x.toFixed(2), z:+g.root.position.z.toFixed(2) }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`);
  log('摇杆位置 ' + JSON.stringify(await rect('#t-joy')) + '  疾=' + JSON.stringify(await rect('[data-act="dash"]')) + '  閃=' + JSON.stringify(await rect('[data-act="dodge"]')));

  const joy = await rect('#t-joy');
  const dashBtn = await rect('[data-act="dash"]');
  const dodgeBtn = await rect('[data-act="dodge"]');

  // 场景 1：只推摇杆前进
  await b.evaluate('window.__M.length = 0; true');
  TOUCH = [{ x: joy.x, y: joy.y, id: 11 }];
  await flush('touchStart'); await sleep(60);
  TOUCH = [{ x: joy.x, y: joy.y - 40, id: 11 }];
  await flush('touchMove'); await sleep(1500);
  TOUCH = []; await flush('touchEnd'); await sleep(1200);
  let rows = await b.evaluate('window.__M.slice()');
  log('1) 摇杆前进: 序列=' + JSON.stringify([...new Set(rows.map(r=>r.a))]) + ' thigh摆幅=' + (Math.max(...rows.map(r=>r.th))-Math.min(...rows.map(r=>r.th))).toFixed(3) + ' 末=' + rows[rows.length-1].a);

  // 场景 2：点「疾」再推摇杆
  await tap('[data-act="dash"]');
  log('   疾走开关=' + await b.evaluate('window.__TOUCH ? JSON.stringify(window.__TOUCH) : "null"'));
  await b.evaluate('window.__M.length = 0; true');
  TOUCH = [{ x: joy.x, y: joy.y, id: 12 }];
  await flush('touchStart'); await sleep(60);
  TOUCH = [{ x: joy.x, y: joy.y - 40, id: 12 }];
  await flush('touchMove'); await sleep(1800);
  TOUCH = []; await flush('touchEnd'); await sleep(1500);
  rows = await b.evaluate('window.__M.slice()');
  const half = Math.floor(rows.length/2);
  log('2) 疾走+摇杆: 序列=' + JSON.stringify([...new Set(rows.map(r=>r.a))]) + ' thigh摆幅=' + (Math.max(...rows.map(r=>r.th))-Math.min(...rows.map(r=>r.th))).toFixed(3));
  log('   前半摆幅=' + (Math.max(...rows.slice(0,half).map(r=>r.th))-Math.min(...rows.slice(0,half).map(r=>r.th))).toFixed(3) + '  后半摆幅=' + (Math.max(...rows.slice(half).map(r=>r.th))-Math.min(...rows.slice(half).map(r=>r.th))).toFixed(3));
  log('   轨迹 ' + rows.filter((_,i)=>i%12===0).map(r=>r.x.toFixed(1)+','+r.z.toFixed(1)+'['+r.a+']').join(' '));

  // 场景 3：点「閃」闪避
  await b.evaluate('window.__M.length = 0; true');
  await tap('[data-act="dodge"]');
  await sleep(2500);
  rows = await b.evaluate('window.__M.slice()');
  log('3) 闪避: 序列=' + JSON.stringify([...new Set(rows.map(r=>r.a))]) + ' 末=' + rows[rows.length-1].a);

  // 场景 4：闪避后立刻推摇杆（用户报的组合）
  await b.evaluate('window.__M.length = 0; true');
  await tap('[data-act="dodge"]');
  await sleep(300);
  TOUCH = [{ x: joy.x, y: joy.y, id: 13 }];
  await flush('touchStart'); await sleep(60);
  TOUCH = [{ x: joy.x, y: joy.y - 40, id: 13 }];
  await flush('touchMove'); await sleep(1800);
  rows = await b.evaluate('window.__M.slice()');
  const h2 = Math.floor(rows.length/2);
  log('4) 闪避+立刻前进: 序列=' + JSON.stringify([...new Set(rows.map(r=>r.a))]) + ' 前半摆幅=' + (Math.max(...rows.slice(0,h2).map(r=>r.th))-Math.min(...rows.slice(0,h2).map(r=>r.th))).toFixed(3) + ' 后半摆幅=' + (Math.max(...rows.slice(h2).map(r=>r.th))-Math.min(...rows.slice(h2).map(r=>r.th))).toFixed(3));
  TOUCH = []; await flush('touchEnd');
  log('   轨迹 ' + rows.filter((_,i)=>i%12===0).map(r=>r.x.toFixed(1)+','+r.z.toFixed(1)+'['+r.a+']').join(' '));
  await b.screenshot('shots/TOUCH-dash.png');
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
