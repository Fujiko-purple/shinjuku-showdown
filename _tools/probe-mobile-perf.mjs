/**
 * probe-mobile-perf.mjs —— 手机档 30 秒战斗性能采样（task-10）
 * ----------------------------------------------------------------------------
 * 采样每一帧耗时 → avgFps / p95 / worstFps / 长帧数（>33ms、>100ms）；
 * 同时把「近战 / 术式 / 领域」这些操作时刻打在时间轴上，
 * 掉帧到底集中在技能、领域还是平常帧，一眼能看出来。
 *
 * 用法：node _tools/probe-mobile-perf.mjs [--w 844 --h 390 --dpr 2] [--sec 30]
 *        [--file dist/新宿决战.html] [--out shots/perf]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const W = parseInt(arg('w', '844'), 10), H = parseInt(arg('h', '390'), 10), DPR = parseFloat(arg('dpr', '2'));
const SEC = parseInt(arg('sec', '30'), 10);
const PORT = parseInt(arg('port', '9620'), 10);
const OUT = arg('out', 'shots/m10-perf');
const fileArg = arg('file', 'dist/新宿决战.html');
const url = 'file:///' + resolve(fileArg).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

const INJECT = '(' + function () {
  const P = window.__PERF = { frames: [], marks: [] };
  let last = performance.now();
  (function loop() {
    const n = performance.now();
    P.frames.push([Math.round(n), +(n - last).toFixed(1)]);
    last = n;
    if (P.frames.length > 20000) P.frames.shift();
    requestAnimationFrame(loop);
  })();
  window.__mark = function (name) { P.marks.push([Math.round(performance.now()), name]); };
  window.__resetPerf = function () { P.frames.length = 0; P.marks.length = 0; };
}.toString() + ')()';

const b = new Browser({ port: PORT, width: W, height: H });
let seq = 0;
const touches = new Map();
async function touchStart(id, x, y) {
  touches.set(id, { x, y });
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), radiusX: 10, radiusY: 10, force: 1, id }] });
}
async function touchEnd(id) {
  touches.delete(id);
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...touches.entries()].map(([i, p]) => ({ x: Math.round(p.x), y: Math.round(p.y), radiusX: 10, radiusY: 10, force: 1, id: i })) });
}
async function rectOf(sel) {
  return b.evaluate('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return null; const r = e.getBoundingClientRect(); if (r.width < 2) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
}
async function tapSel(sel) {
  const r = await rectOf(sel);
  if (!r) return false;
  const id = ++seq;
  await touchStart(id, r.x, r.y);
  await sleep(45);
  await touchEnd(id);
  return true;
}
async function mark(name) { await b.evaluate('window.__mark && window.__mark(' + JSON.stringify(name) + ')'); }

try {
  await b.launch();
  await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await b.send('Page.navigate', { url });
  await sleep(20000);
  // 进战斗：先关掉竖屏引导卡片，再点「直接进入战斗」
  await tapSel('[data-act=rotate-skip]');
  await tapSel('#btn-skip-cine');
  await sleep(1500);
  await b.evaluate('window.__resetPerf && window.__resetPerf()');
  await mark('fight-start');

  const t0 = Date.now();
  let n = 0;
  while ((Date.now() - t0) / 1000 < SEC) {
    n++;
    await mark('melee');
    await tapSel('[data-act=light]');
    await sleep(230);
    if (n % 10 === 5) { await mark('skill-red'); await tapSel('.ab[data-skill=red]'); await sleep(400); }
    if (n % 17 === 7) { await mark('skill-blue'); await tapSel('.ab[data-skill=blue]'); await sleep(300); }
    if (n % 31 === 9) { await mark('domain'); await tapSel('.ab[data-skill=void]'); await sleep(600); }
  }
  await mark('end');
  await b.screenshot(OUT + '-30s.png');
  const P = await b.evaluate('window.__PERF');
  const S = await b.evaluate('(() => ({ pr: window.__PR_MAX, state: window.__SS && window.__SS.state, draws: window.__SS && window.__SS.render && window.__SS.render.renderer ? window.__SS.render.renderer.info.render.calls : null, tris: window.__SS && window.__SS.render && window.__SS.render.renderer ? window.__SS.render.renderer.info.render.triangles : null, prewarm: window.__MOBILE && window.__MOBILE.perf ? window.__MOBILE.perf.prewarm : null }))()');
  const fr = (P.frames || []).filter((f) => f[1] > 0);
  const dts = fr.map((f) => f[1]).sort((a, c) => a - c);
  const avg = dts.reduce((s, x) => s + x, 0) / dts.length;
  const p95 = dts[Math.floor(dts.length * 0.95)];
  const long33 = fr.filter((f) => f[1] > 33.3);
  const long100 = fr.filter((f) => f[1] > 100);
  const span = fr.length ? fr[fr.length - 1][0] - fr[0][0] : 1;
  console.log('=== 30s 战斗性能（' + W + 'x' + H + ' @DPR' + DPR + '）===');
  console.log('  帧数 ' + fr.length + '   时长 ' + (span / 1000).toFixed(1) + 's   操作次数 ' + n);
  console.log('  avgFps ' + (1000 / avg).toFixed(1) + '   avgFrame ' + avg.toFixed(1) + 'ms   p95 ' + p95.toFixed(1) + 'ms');
  console.log('  worstFps ' + (1000 / dts[dts.length - 1]).toFixed(1) + '  (单帧最长 ' + dts[dts.length - 1].toFixed(0) + 'ms)');
  console.log('  长帧 >33ms: ' + long33.length + ' 帧 (' + (long33.length / fr.length * 100).toFixed(1) + '%)   >100ms: ' + long100.length + ' 帧');
  console.log('  掉帧时刻(>100ms) 与最近的标记：');
  long100.slice(0, 20).forEach((f) => {
    let near = '(无)', best = 1e9;
    for (const m of (P.marks || [])) { const d = Math.abs(m[0] - f[0]); if (d < best && d < 800) { best = d; near = m[1] + '@' + m[0]; } }
    console.log('    t=' + f[0] + '  ' + f[1].toFixed(0) + 'ms   最近标记 ' + near);
  });
  console.log('  渲染: draws=' + S.draws + ' tris=' + S.tris + ' pr=' + S.pr + ' state=' + S.state);
  console.log('  预热: ' + JSON.stringify(S.prewarm));
  console.log('  页面错误: ' + JSON.stringify(b.errors.slice(0, 3)));
} catch (e) {
  console.log('FATAL ' + String(e && e.message || e).slice(0, 300));
} finally { await b.close(); }
