import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9681, width: 900, height: 520 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  for (const k of ['KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 50); await sleep(200); }
  await sleep(2500);

  const snap = () => b.evaluate(`(() => {
    const g = window.__SS.gojo, c = window.__SS.activeCamera, s = window.__SS.snap;
    return { gx:g.root.position.x, gz:g.root.position.z, cx:c.position.x, cz:c.position.z,
             anim:s.gojo.anim, phase:s.gojo.phase, hp:+s.gojo.hp.toFixed(0) };
  })()`);

  // 1) 移动方向：用「位移向量 · 远离相机方向」判定
  const a = await snap();
  await b.keyDown('KeyW'); await sleep(800); await b.keyUp('KeyW'); await sleep(300);
  const c1 = await snap();
  const awayX = a.gx - a.cx, awayZ = a.gz - a.cz;
  const awayLen = Math.hypot(awayX, awayZ) || 1;
  const mvX = c1.gx - a.gx, mvZ = c1.gz - a.gz;
  const mvLen = Math.hypot(mvX, mvZ) || 1e-6;
  const dotAway = (mvX * (awayX/awayLen) + mvZ * (awayZ/awayLen));
  console.log('按 W  位移 ' + mvLen.toFixed(2) + 'm   与「远离相机」方向点积 ' + dotAway.toFixed(3));
  console.log('      ' + (dotAway > 0.3 ? '✅ 前进正确（远离相机）' : dotAway < -0.3 ? '❌ 前进反了（靠近相机）' : '⚠️ 侧向或没动'));

  // 2) 技能后是否卡姿态：放技能，然后连续采样 anim/phase
  await b.pressKey('KeyU');   // 苍
  const t0 = Date.now();
  const samples = [];
  for (let i = 0; i < 16; i++) {
    await sleep(250);
    const s = await snap();
    samples.push({ t: ((Date.now()-t0)/1000).toFixed(1), anim: s.anim, phase: s.phase });
  }
  console.log('放「苍」后的 anim/phase 序列:');
  console.log('  ' + samples.map(s => s.t + 's ' + s.anim + '/' + s.phase).join('  |  '));
  const stuck = samples.slice(-6).every(s => s.phase !== 'idle' && s.phase !== 'move');
  console.log('  ' + (stuck ? '❌ 4 秒后仍未回到 idle/move —— 卡住' : '✅ 恢复正常'));
  console.log('错误: ' + b.errors.length);
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
