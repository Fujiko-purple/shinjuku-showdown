import { Browser, sleep } from './cdp.mjs';
const NEW = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9717, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: NEW });
  await sleep(14000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(800);
  await b.evaluate(`(() => { window.__A = []; const tick = () => { const S = window.__SS; window.__A.push({ t:+performance.now().toFixed(0), a:S.snap.gojo.anim, th:+S.gojo.bones.thighL.rotation.x.toFixed(3), x:+S.gojo.root.position.x.toFixed(2), z:+S.gojo.root.position.z.toFixed(2) }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__CLR=()=>{window.__A.length=0;}; return true; })()`);
  const clip = async (tag, waitMs) => {
    await sleep(waitMs);
    const rows = await b.evaluate('window.__A.slice()');
    const last = rows.length ? rows[rows.length-1].a : '-';
    log(tag + ' 末 anim=' + last + '  序列=' + JSON.stringify([...new Set(rows.map(r=>r.a))]));
    return last;
  };
  // 1) 狂点轻击 12 次
  await b.evaluate('window.__CLR(); true');
  for (let i = 0; i < 12; i++) { await b.pressKey('KeyJ', 40); await sleep(150); }
  await clip('1) 连点轻击×12 之后', 1800);
  // 2) 狂点重击 8 次
  await b.evaluate('window.__CLR(); true');
  for (let i = 0; i < 8; i++) { await b.pressKey('KeyK', 40); await sleep(200); }
  await clip('2) 连点重击×8 之后', 1800);
  // 3) 三连轻击 + 重击收招（连段）
  await b.evaluate('window.__CLR(); true');
  for (const k of ['KeyJ','KeyJ','KeyJ','KeyK']) { await b.pressKey(k, 40); await sleep(300); }
  await clip('3) 三连轻击+重击 之后', 1800);
  // 4) 攻击后立刻移动
  await b.evaluate('window.__CLR(); true');
  await b.pressKey('KeyJ', 40); await sleep(250);
  await b.keyDown('KeyW'); await sleep(1600); await b.keyUp('KeyW');
  const rows = await b.evaluate('window.__A.slice()');
  const th = rows.map(r=>r.th);
  log('4) 出拳后立刻前进 末 anim=' + (rows.length?rows[rows.length-1].a:'-') + ' 大腿摆幅=' + (Math.max(...th)-Math.min(...th)).toFixed(3) + ' 序列=' + JSON.stringify([...new Set(rows.map(r=>r.a))]));
  // 5) 狂点 轻+重 交替 20 次
  await b.evaluate('window.__CLR(); true');
  for (let i = 0; i < 20; i++) { await b.pressKey(i % 2 ? 'KeyK' : 'KeyJ', 35); await sleep(120); }
  await clip('5) 轻重交替狂点×20 之后', 2000);
  // 6) 最后移动检查
  await b.evaluate('window.__CLR(); true');
  await b.keyDown('KeyW'); await sleep(1500); await b.keyUp('KeyW');
  const rows2 = await b.evaluate('window.__A.slice()');
  const th2 = rows2.map(r=>r.th);
  log('6) 全部之后前进 末 anim=' + (rows2.length?rows2[rows2.length-1].a:'-') + ' 大腿摆幅=' + (Math.max(...th2)-Math.min(...th2)).toFixed(3));
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
