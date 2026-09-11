import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9693, width: 960, height: 560 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 80; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await b.evaluate(`(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()`);
  await sleep(1200);
  // 页内采样器：anim / curT / thighL
  await b.evaluate(`(() => {
    window.__R2 = [];
    const tick = () => {
      const S = window.__SS; const g = S.gojo;
      window.__R2.push({ t: +performance.now().toFixed(0), a: S.snap.gojo.anim, ph: S.snap.gojo.phase,
        th: +g.bones.thighL.rotation.x.toFixed(3), y: +g.root.position.y.toFixed(3) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`);

  async function run(tag, setup, holdMs, tailMs) {
    await b.evaluate('window.__R2.length = 0; true');
    await setup();
    await sleep(holdMs);
    await setupRelease();
    await sleep(tailMs);
    const rows = await b.evaluate('window.__R2.slice()');
    const seq = [];
    for (const r of rows) { if (!seq.length || seq[seq.length-1].a !== r.a) seq.push({ a: r.a, t: r.t }); }
    const ths = rows.map(r => r.th);
    const range = ths.length ? (Math.max(...ths) - Math.min(...ths)).toFixed(3) : '-';
    log(tag + ': 末 anim=' + (rows.length ? rows[rows.length-1].a : '-') + '  thigh 摆幅=' + range +
        '  序列=' + JSON.stringify(seq.map(s => s.a).slice(0, 24)));
    const tail = rows.slice(-40).map(r => r.a);
    log('   末 40 帧 anim: ' + JSON.stringify([...new Set(tail)]));
  }
  let setupRelease = async () => {};
  await run('Shift+W 疾跑(1.5s)松手', async () => { await b.keyDown('ShiftLeft'); await b.keyDown('KeyW'); }, 1500, 1500);
  setupRelease = async () => { await b.keyUp('KeyW'); await b.keyUp('ShiftLeft'); };
  await run('Shift+W 疾跑(1.5s)松手', async () => { await b.keyDown('ShiftLeft'); await b.keyDown('KeyW'); }, 1500, 1500);
  await run('空格 闪避', async () => { await b.keyDown('Space'); setTimeout(() => b.keyUp('Space'), 60); }, 1500, 2000);
  await run('W 走(1s)松手', async () => { await b.keyDown('KeyW'); }, 1000, 1500);
  // 连续疾跑-停止 3 次
  for (let i = 0; i < 3; i++) { await b.keyDown('ShiftLeft'); await b.keyDown('KeyW'); await sleep(900); await b.keyUp('KeyW'); await b.keyUp('ShiftLeft'); await sleep(700); }
  await sleep(800);
  log('三次疾跑后 anim=' + await b.evaluate('window.__SS.snap.gojo.anim'));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
