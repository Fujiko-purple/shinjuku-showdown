import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9663, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(12000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(600);

  // 采样器：每 rAF 记录 anim / phase / thighL / 时间
  await b.evaluate(`(() => {
    window.__REC = [];
    const t0 = performance.now();
    window.__RECSTART = t0;
    const tick = () => {
      const f = window.__SS && window.__SS.gojo;
      const snap = window.__SS && window.__SS.snap;
      if (f && snap) window.__REC.push({
        t: +(performance.now() - window.__RECSTART).toFixed(1),
        anim: snap.gojo.anim, phase: snap.gojo.phase,
        thighL: +f.bones.thighL.rotation.x.toFixed(4),
        kneeL: +f.bones.shinL.rotation.x.toFixed(4)
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`);

  // --- 场景 A：站立出拳，看 anim 多久回到 idle ---
  await b.evaluate('window.__REC.length = 0; true');
  await b.keyDown('KeyJ'); await sleep(60); await b.keyUp('KeyJ');
  await sleep(2500);
  const A = await b.evaluate('window.__REC.slice()');
  const stuckA = A.filter(r => r.anim !== 'idle' && r.anim !== 'walk' && r.anim !== 'run');
  const lastStuckA = stuckA.length ? stuckA[stuckA.length - 1].t : 0;
  log('A 站立出拳: 采样 ' + A.length + ' 帧, 末帧 anim=' + (A.length ? A[A.length-1].anim : '-') + ', 非基础动作最长持续 ' + lastStuckA.toFixed(0) + ' ms');
  log('A anim 序列 ' + JSON.stringify([...new Set(A.map(r=>r.anim))]));

  // --- 场景 B：移动中出拳，检查腿是否还在摆 ---
  await b.evaluate('window.__REC.length = 0; true');
  await b.keyDown('KeyW');
  await sleep(400);
  await b.keyDown('KeyJ'); await sleep(60); await b.keyUp('KeyJ');
  await sleep(300);
  await b.keyDown('KeyK'); await sleep(60); await b.keyUp('KeyK');
  await sleep(2000);
  await b.keyUp('KeyW');
  await sleep(400);
  const B = await b.evaluate('window.__REC.slice()');
  const range = a => a.length ? +(Math.max(...a) - Math.min(...a)).toFixed(4) : 0;
  // 出拳之后的窗口
  const after = B.filter(r => r.t > 200);
  const walkFrames = after.filter(r => r.anim === 'walk' || r.anim === 'run');
  log('B 移动中出拳: 采样 ' + B.length + ' 帧, anim 序列 ' + JSON.stringify([...new Set(B.map(r=>r.anim))]));
  log('B 出拳后 thighL 摆幅 ' + range(after.map(r=>r.thighL)) + ' rad, kneeL 摆幅 ' + range(after.map(r=>r.kneeL)) + ' rad');
  log('B 出拳后处于 walk/run 的帧数 ' + walkFrames.length + '/' + after.length);
  const tail = after.slice(-30).map(r => r.anim);
  log('B 末尾 30 帧 anim ' + JSON.stringify(tail));

  // --- 场景 C：放技能（L = 紫/茈）后是否恢复 ---
  await b.evaluate('window.__REC.length = 0; true');
  await b.keyDown('KeyL'); await sleep(60); await b.keyUp('KeyL');
  await sleep(3500);
  const C = await b.evaluate('window.__REC.slice()');
  const stuckC = C.filter(r => r.anim !== 'idle' && r.anim !== 'walk' && r.anim !== 'run');
  log('C 放技能: anim 序列 ' + JSON.stringify([...new Set(C.map(r=>r.anim))]));
  log('C 末帧 anim=' + (C.length ? C[C.length-1].anim : '-') + ', 非基础动作最长持续 ' + (stuckC.length ? stuckC[stuckC.length-1].t.toFixed(0) : 0) + ' ms');
} catch (e) { log('FATAL ' + String(e).slice(0, 300)); }
finally { await b.close(); }
