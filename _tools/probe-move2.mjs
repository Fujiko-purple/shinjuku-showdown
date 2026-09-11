import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9665, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(800);

  const snap = () => b.evaluate(`(() => {
    const g = window.__SS.gojo, c = window.__SS.activeCamera, s = window.__SS.snap;
    return { gx:+g.root.position.x.toFixed(3), gz:+g.root.position.z.toFixed(3),
             cx:+c.position.x.toFixed(3), cz:+c.position.z.toFixed(3),
             anim:s.gojo.anim, phase:s.gojo.phase, st:+window.__SS.state };
  })()`);

  const before = await snap();
  log('起始 ' + JSON.stringify(before));
  await b.keyDown('KeyW');
  const track = [];
  for (let i = 0; i < 12; i++) { await sleep(200); track.push(await snap()); }
  await b.keyUp('KeyW');
  await sleep(300);
  const after = await snap();
  const dx = after.gx - before.gx, dz = after.gz - before.gz;
  log('按 W 2.4s 总位移 ' + Math.hypot(dx,dz).toFixed(2) + 'm  (' + dx.toFixed(2) + ', ' + dz.toFixed(2) + ')');
  log('轨迹: ' + track.map(t=>t.gx.toFixed(1)+','+t.gz.toFixed(1)+'['+t.anim+']').join(' '));
  const ax = before.gx - before.cx, az = before.gz - before.cz;
  const al = Math.hypot(ax,az)||1;
  log('与「远离相机」点积 ' + ((dx*(ax/al) + dz*(az/al))).toFixed(2) + ' (位移长度归一后 ' + ((dx*(ax/al)+dz*(az/al))/(Math.hypot(dx,dz)||1e-6)).toFixed(3) + ')');

  // 反向：按 S 应该靠近相机
  const b2 = await snap();
  await b.keyDown('KeyS'); await sleep(1500); await b.keyUp('KeyS'); await sleep(300);
  const a2 = await snap();
  const dx2 = a2.gx - b2.gx, dz2 = a2.gz - b2.gz;
  const ax2 = b2.gx - b2.cx, az2 = b2.gz - b2.cz; const al2 = Math.hypot(ax2,az2)||1;
  log('按 S 1.5s 位移 ' + Math.hypot(dx2,dz2).toFixed(2) + 'm, 归一化点积(应≈-1) ' + ((dx2*(ax2/al2)+dz2*(az2/al2))/(Math.hypot(dx2,dz2)||1e-6)).toFixed(3));

  // 打斗之后再测一次（用户报的「打完之后变反」）
  for (const k of ['KeyJ','KeyJ','KeyK','KeyU']) { await b.pressKey(k, 60); await sleep(400); }
  await sleep(2500);
  const b3 = await snap();
  await b.keyDown('KeyW'); await sleep(1500); await b.keyUp('KeyW'); await sleep(300);
  const a3 = await snap();
  const dx3 = a3.gx - b3.gx, dz3 = a3.gz - b3.gz;
  const ax3 = b3.gx - b3.cx, az3 = b3.gz - b3.cz; const al3 = Math.hypot(ax3,az3)||1;
  log('打斗后按 W 1.5s 位移 ' + Math.hypot(dx3,dz3).toFixed(2) + 'm, 归一化点积(应≈+1) ' + ((dx3*(ax3/al3)+dz3*(az3/al3))/(Math.hypot(dx3,dz3)||1e-6)).toFixed(3));
  log('打斗后 anim=' + a3.anim + ' phase=' + a3.phase);
  log('错误 ' + b.errors.length);
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
