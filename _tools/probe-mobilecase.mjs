import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html?touch=1';
const b = new Browser({ port: 9705, width: 844, height: 390 });
const log = (...a) => console.log(...a);
const active = new Map();
const pts = () => [...active.entries()].map(([id, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), id }));
const ts = async (id,x,y) => { active.set(id,{x,y}); await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts()}); };
const tm = async (id,x,y) => { active.set(id,{x,y}); await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pts()}); };
const te = async (id) => { active.delete(id); await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:pts()}); };
const rect = (sel) => b.evaluate(`(() => { const e = document.querySelector('${sel}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) }; })()`);
async function tapPoint(p, id) { await ts(id,p.x,p.y); await sleep(70); await te(id); await sleep(150); }
async function report(tag) {
  const rows = await b.evaluate('window.__S.slice()');
  const th = rows.map(x => x.th);
  const mv = rows.length ? rows[rows.length-1].mv - rows[0].mv : 0;
  const dist = rows.length ? Math.hypot(rows[rows.length-1].x-rows[0].x, rows[rows.length-1].z-rows[0].z) : 0;
  log(tag + ': frames=' + rows.length + ' moveTowards=' + mv + ' 位移=' + dist.toFixed(2) + 'm 腿摆幅=' + (th.length?(Math.max(...th)-Math.min(...th)).toFixed(3):'-') + ' anim=' + JSON.stringify([...new Set(rows.map(x=>x.a))]) + ' 末端 anim=' + (rows.length?rows[rows.length-1].a:'-'));
}
try {
  await b.launch(); await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url: URL });
  await sleep(14000);
  await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]'); if (e) e.click(); return true; })()`);
  await sleep(900);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(900);
  await b.evaluate(`(() => { window.__MV=0; const g=window.__SS.gojo; const o=g.moveTowards; g.moveTowards=function(x,z,s,dt){window.__MV++; return o.call(g,x,z,s,dt);};
    window.__S=[]; const tick=()=>{const S=window.__SS,gg=S.gojo,T=window.__TOUCH||{}; window.__S.push({t:+performance.now().toFixed(0),a:S.snap.gojo.anim,th:+gg.bones.thighL.rotation.x.toFixed(3),mv:window.__MV,on:T.on,mz:T.mz,x:+gg.root.position.x.toFixed(2),z:+gg.root.position.z.toFixed(2)}); requestAnimationFrame(tick);}; requestAnimationFrame(tick); window.__CLR=()=>{window.__S.length=0;window.__MV=0;}; return true; })()`);
  const joy = await rect('#t-joy');
  const dodgeP = await rect('[data-act="dodge"]');
  const dashP = await rect('[data-act="dash"]');

  // 1) 闪避 -> 立刻推摇杆
  await b.evaluate('window.__CLR(); true');
  await tapPoint(dodgeP, 51);
  await ts(52, joy.x, joy.y); await sleep(80); await tm(52, joy.x, joy.y - 42);
  await sleep(1800);
  await report('1) 闪避后立刻前进');
  await te(52); await sleep(1500);

  // 2) 开疾走 -> 推摇杆
  await tapPoint(dashP, 53); await sleep(200);
  await b.evaluate('window.__CLR(); true');
  await ts(54, joy.x, joy.y); await sleep(80); await tm(54, joy.x, joy.y - 42);
  await sleep(1800);
  await report('2) 疾走+前进');
  await te(54); await sleep(1500);

  // 3) 疾走开着 + 攻击 + 前进
  await b.evaluate('window.__CLR(); true');
  await ts(55, joy.x, joy.y); await sleep(80); await tm(55, joy.x, joy.y - 42);
  const lightP = await rect('[data-act="light"]');
  await tapPoint(lightP, 56); await sleep(1600);
  await report('3) 疾走+轻击+前进');
  await te(55);
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
