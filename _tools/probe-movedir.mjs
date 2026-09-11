import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9671, width: 900, height: 520 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  // 打一会儿让相机转向（模拟用户说的"打斗之后"）
  for (const k of ['KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 50); await sleep(200); }
  await sleep(2500);
  const before = await b.evaluate(`(() => { const g = window.__SS.gojo, c = window.__SS.activeCamera; return { gx:+g.root.position.x.toFixed(2), gz:+g.root.position.z.toFixed(2), cx:+c.position.x.toFixed(2), cz:+c.position.z.toFixed(2) }; })()`);
  // 按 W 前进：角色应该"远离相机"
  await b.keyDown('KeyW'); await sleep(900); await b.keyUp('KeyW');
  await sleep(400);
  const after = await b.evaluate(`(() => { const g = window.__SS.gojo, c = window.__SS.activeCamera; return { gx:+g.root.position.x.toFixed(2), gz:+g.root.position.z.toFixed(2), cx:+c.position.x.toFixed(2), cz:+c.position.z.toFixed(2) }; })()`);
  const dBefore = Math.hypot(before.gx - before.cx, before.gz - before.cz);
  const dAfter = Math.hypot(after.gx - after.cx, after.gz - after.cz);
  console.log('按 W 前  角色→相机距离 ' + dBefore.toFixed(2) + ' m');
  console.log('按 W 后  角色→相机距离 ' + dAfter.toFixed(2) + ' m');
  console.log((dAfter > dBefore + 0.3) ? '✅ 正确：按前进角色远离相机' : '❌ 仍然相反或没动（Δ=' + (dAfter-dBefore).toFixed(2) + '）');
  // 再按 S 后退
  await b.keyDown('KeyS'); await sleep(900); await b.keyUp('KeyS');
  await sleep(400);
  const after2 = await b.evaluate(`(() => { const g = window.__SS.gojo, c = window.__SS.activeCamera; return { gx:+g.root.position.x.toFixed(2), gz:+g.root.position.z.toFixed(2), cx:+c.position.x.toFixed(2), cz:+c.position.z.toFixed(2) }; })()`);
  const dAfter2 = Math.hypot(after2.gx - after2.cx, after2.gz - after2.cz);
  console.log('再按 S   角色→相机距离 ' + dAfter2.toFixed(2) + ' m');
  console.log((dAfter2 < dAfter - 0.3) ? '✅ 正确：按后退角色靠近相机' : '❌ 后退方向不对');
  console.log('错误: ' + b.errors.length);
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
