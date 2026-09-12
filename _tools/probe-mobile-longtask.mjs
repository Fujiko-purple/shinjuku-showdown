/**
 * probe-mobile-longtask.mjs —— 启动期长任务归因探针（task-10）
 * ----------------------------------------------------------------------------
 * 关键点：Long Task 观察器必须在 **navigate 之前** 用
 * Page.addScriptToEvaluateOnNewDocument 注入，否则抓不到启动期的长任务。
 * 同时劫持 window.__BOOT.step 的赋值，把 main.js 的载入步骤时间线打出来，
 * 这样每个长任务能直接对上是哪一步。
 *
 * 用法：node _tools/probe-mobile-longtask.mjs [--mobile 1] [--w 844] [--h 390] [--dpr 2]
 *        [--file dist/新宿决战.html] [--url ...] [--wait 20000] [--json]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const W = parseInt(arg('w', '844'), 10);
const H = parseInt(arg('h', '390'), 10);
const DPR = parseFloat(arg('dpr', '2'));
const MOBILE = arg('mobile', '1') === '1';
const WAIT = parseInt(arg('wait', '20000'), 10);
const PORT = parseInt(arg('port', '9510'), 10);
const urlArg = arg('url', '');
const fileArg = arg('file', 'dist/新宿决战.html');
const query = arg('query', '');
const url = (urlArg || ('file:///' + resolve(fileArg).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')))
  + (query ? (query.startsWith('?') ? query : '?' + query) : '');

/** 必须在 navigate 之前注入 */
const INJECT = `
(() => {
  const P = window.__LTP = { longtasks: [], steps: [], firstPaint: {}, errors: [], frames: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        P.longtasks.push({
          t: Math.round(e.startTime), d: Math.round(e.duration), name: e.name,
          attrib: (e.attribution || []).map((a) => a.name + (a.containerType ? ':' + a.containerType : '')).join(','),
        });
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch (err) { P.ltErr = String(err); }

  // 劫持 __BOOT 的赋值：body.html 的看门狗会先建它，main.js 再往里写 step
  let boot;
  try {
    Object.defineProperty(window, '__BOOT', {
      configurable: true,
      get() { return boot; },
      set(v) {
        boot = v;
        try {
          let cur = v.step;
          Object.defineProperty(v, 'step', {
            configurable: true,
            get() { return cur; },
            set(nv) { cur = nv; P.steps.push({ t: Math.round(performance.now()), step: nv }); },
          });
        } catch (e) { P.bootHookErr = String(e); }
      },
    });
  } catch (e) { P.bootHookErr2 = String(e); }

  // 帧时间线：抓出启动期的卡顿发生在哪一帧
  (function frame() {
    const t = performance.now();
    P.frames.push(Math.round(t));
    if (P.frames.length > 4000) P.frames.shift();
    requestAnimationFrame(frame);
  })();

  addEventListener('DOMContentLoaded', () => { P.firstPaint.domContentLoaded = Math.round(performance.now()); });
  addEventListener('load', () => { P.firstPaint.load = Math.round(performance.now()); });

  // WebGL 着色器编译/链接计时：启动期 1.2s 长任务的头号嫌疑
  try {
    const gl = { compileShader: 0, linkProgram: 0, nCompile: 0, nLink: 0, calls: [] };
    P.gl = gl;
    const protos = [];
    if (window.WebGLRenderingContext) protos.push(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) protos.push(WebGL2RenderingContext.prototype);
    for (const proto of protos) {
      for (const fn of ['compileShader', 'linkProgram']) {
        const orig = proto[fn];
        if (!orig) continue;
        proto[fn] = function () {
          const t0 = performance.now();
          const r = orig.apply(this, arguments);
          const dt = performance.now() - t0;
          if (fn === 'compileShader') { gl.compileShader += dt; gl.nCompile++; }
          else { gl.linkProgram += dt; gl.nLink++; }
          if (dt > 3) gl.calls.push({ f: fn, at: Math.round(t0), ms: +dt.toFixed(1) });
          return r;
        };
      }
    }
  } catch (e) { P.glErr = String(e); }
})();
`;

const b = new Browser({ port: PORT, width: W, height: H });
const out = { url, viewport: { W, H, DPR, mobile: MOBILE } };
try {
  await b.launch();
  await b.newPage();
  if (MOBILE) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true, screenOrientation: { type: H > W ? 'portraitPrimary' : 'landscapePrimary', angle: H > W ? 0 : 90 } });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else {
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  }
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await b.send('Page.navigate', { url });
  await sleep(WAIT);
  out.data = await b.evaluate('window.__LTP');
  out.boot = await b.evaluate('window.__BOOT ? { ok: window.__BOOT.ok, step: window.__BOOT.step } : null');
  out.errors = b.errors.slice(0, 5);
} catch (e) {
  out.fatal = String(e && e.stack || e).slice(0, 400);
} finally {
  await b.close();
}

/* ---------- 报告 ---------- */
const P = out.data || {};
const LT = (P.longtasks || []).slice().sort((a, b2) => b2.d - a.d);
const steps = P.steps || [];
console.log('URL ' + url + '  视口 ' + W + 'x' + H + ' @' + DPR + (MOBILE ? ' (mobile)' : ''));
console.log('DOMContentLoaded ' + (P.firstPaint && P.firstPaint.domContentLoaded) + 'ms   load ' + (P.firstPaint && P.firstPaint.load) + 'ms');
console.log('\n== 载入步骤时间线 ==');
let t0 = steps.length ? steps[0].t : 0;
steps.forEach((s, i) => {
  const next = steps[i + 1] ? steps[i + 1].t : null;
  const dur = next === null ? null : next - s.t;
  console.log('  ' + String(s.t).padStart(7) + 'ms  ' + (dur === null ? '   ?  ' : String(dur).padStart(6) + 'ms') + '  ' + s.step);
});
console.log('\n== 长任务（>100ms，按耗时降序）==');
if (!LT.length) console.log('  （无）' + (P.ltErr ? ' 观察器错误: ' + P.ltErr : ''));
const big = LT.filter((x) => x.d >= 100);
big.forEach((x) => {
  // 落到哪一步
  let step = '(载入前)';
  for (const s of steps) if (s.t <= x.t + x.d) step = s.step;
  console.log('  ' + String(x.t).padStart(7) + 'ms  持续 ' + String(x.d).padStart(5) + 'ms  步骤=' + step + (x.attrib ? '  attrib=' + x.attrib : ''));
});
const over50 = LT.filter((x) => x.d >= 50 && x.d < 100);
console.log('  50~100ms 的还有 ' + over50.length + ' 个: ' + over50.map((x) => x.t + 'ms/' + x.d + 'ms').join(', '));
const sumLt = LT.reduce((s, x) => s + x.d, 0);
const sum = sumLt;
console.log('  长任务合计 ' + sum + 'ms（' + LT.length + ' 个 ≥50ms）');
console.log('\n== 启动期帧间隔（前 40 个间隔 > 50ms 的）==');
const fr = P.frames || [];
const gaps = [];
for (let i = 1; i < fr.length; i++) gaps.push({ t: fr[i], g: fr[i] - fr[i - 1] });
gaps.filter((x) => x.g > 50).slice(0, 40).forEach((x) => console.log('  ' + String(x.t).padStart(7) + 'ms  帧间隔 ' + x.g + 'ms'));
/* 关键指标一行汇总：最大长任务 / 预热步骤耗时 / 合计 */
{
  const warm = steps.find((s) => s.step === "预热");
  const done = steps.find((s) => s.step === "完成");
  const warmMs = warm && done ? done.t - warm.t : null;
  const maxLt = LT[0] || null;
  console.log('\n★ 关键指标: 最大长任务 ' + (maxLt ? maxLt.d + 'ms@' + maxLt.t : '无') +
    ' | 预热步骤 ' + warmMs + 'ms | 完成@' + (done ? done.t : '?') + 'ms | 长任务合计 ' + Math.round(sumLt) + 'ms');
}
const g = P.gl || {};
console.log('\n== WebGL 着色器编译 ==');
console.log('  compileShader 调用 ' + (g.nCompile || 0) + ' 次，合计 ' + Math.round(g.compileShader || 0) + 'ms；linkProgram ' + (g.nLink || 0) + ' 次，合计 ' + Math.round(g.linkProgram || 0) + 'ms');
(g.calls || []).slice(0, 12).forEach((c) => console.log('    t=' + c.at + 'ms ' + c.f + ' ' + c.ms + 'ms'));
console.log('\n页面错误: ' + JSON.stringify(out.errors));
if (process.argv.includes('--json')) console.log('\n' + JSON.stringify(out, null, 1));
