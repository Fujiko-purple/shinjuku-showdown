import { Browser, sleep } from './cdp.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const file = process.argv[2] || 'dist/新宿决战.html';
const tag = process.argv[3] || 'new';
const b = new Browser({ port: parseInt(process.argv[4] || '9501', 10), width: 800, height: 450 });
try {
  await b.launch(); await b.newPage();
  const url = 'file:///' + require('node:path').resolve(file).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  await b.send('Page.navigate', { url });
  await sleep(11000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  // 行走：按住 W 连续抓帧
  await b.keyDown('KeyW');
  for (let i = 0; i < 5; i++) { await sleep(110); await b.screenshot('shots/anim-' + tag + '-walk' + i + '.png'); }
  await b.keyUp('KeyW');
  await sleep(600);
  // 轻击：连按 J，抓帧
  for (let i = 0; i < 5; i++) {
    await b.pressKey('KeyJ', 40);
    await sleep(90);
    await b.screenshot('shots/anim-' + tag + '-punch' + i + '.png');
  }
  await sleep(500);
  // 放术式：苍
  await b.pressKey('KeyU', 60);
  for (let i = 0; i < 4; i++) { await sleep(140); await b.screenshot('shots/anim-' + tag + '-cast' + i + '.png'); }
  const st = await b.evaluate(`(() => { const s = window.__SS && window.__SS.snap; return s ? { mode: s.mode, anim: s.gojo.anim, phase: s.gojo.phase } : null; })()`);
  console.log(tag + ' 状态: ' + JSON.stringify(st) + ' | 错误 ' + b.errors.length);
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
