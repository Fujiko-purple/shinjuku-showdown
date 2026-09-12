/**
 * probe-mobile-prewarm.mjs —— 启动长任务修法的对照实验（task-10）
 * ----------------------------------------------------------------------------
 * 目的：验证「1.2 秒长任务」到底能不能从 mobile.js 侧消除，用对照实验而不是猜。
 * 四个模式：
 *   none  —— 什么都不做（对照组，等于当前官方产物）
 *   quiet —— 只把 renderer.debug.checkShaderErrors 关掉（three.js 里它会同步
 *            getProgramParameter(LINK_STATUS)，也就是主线程干等驱动）
 *   async —— 只在 loading 阶段提前 renderer.compileAsync()（three.js 官方异步 API）
 *   both  —— 两个一起上
 *
 * 注入时机必须在 navigate 之前（Page.addScriptToEvaluateOnNewDocument），
 * 并且在页面里轮询等 renderer 出现，才能拿到「启动期」的效果。
 *
 * 用法：node _tools/probe-mobile-prewarm.mjs --mode both [--w 844 --h 390 --dpr 2]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const W = parseInt(arg('w', '844'), 10), H = parseInt(arg('h', '390'), 10), DPR = parseFloat(arg('dpr', '2'));
const MODE = arg('mode', 'none');
const WAIT = parseInt(arg('wait', '22000'), 10);
const PORT = parseInt(arg('port', '9530'), 10);
const fileArg = arg('file', 'dist/新宿决战.html');
const url = 'file:///' + resolve(fileArg).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

const INJECT = '(' + function (MODE2) {
  const P = window.__PW = { longtasks: [], steps: [], mode: MODE2, passes: 0, checkShaderErrors: null, err: null };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ entryTypes: ['longtask'] });
  } catch (e) { P.ltErr = String(e); }
  let boot;
  try {
    Object.defineProperty(window, '__BOOT', {
      configurable: true,
      get() { return boot; },
      set(v) {
        boot = v;
        try {
          let cur = v.step;
          Object.defineProperty(v, 'step', { configurable: true, get() { return cur; }, set(nv) { cur = nv; P.steps.push({ t: Math.round(performance.now()), step: nv }); } });
        } catch (e) {}
      },
    });
  } catch (e) {}
  // 轮询等 renderer / 场景，然后在 loading 阶段做实验处理
  let active = false, lastN = -1, lastT = 0, restored = false;
  const timer = setInterval(() => {
    const SS = window.__SS;
    if (!SS || !SS.render || !SS.render.renderer || !SS.scene || !SS.godCam) return;
    const r = SS.render.renderer;
    if ((MODE2 === 'quiet' || MODE2 === 'both' || MODE2 === 'renderquiet') && !restored) {
      P.checkShaderErrors = r.debug.checkShaderErrors;
      r.debug.checkShaderErrors = false;
    }
    const st = SS.state;
    if (st !== 'loading') {
      // 载入结束：把诊断开关还回去，避免影响后续 shader 报错排查
      if ((MODE2 === 'quiet' || MODE2 === 'both' || MODE2 === 'renderquiet') && !restored) { r.debug.checkShaderErrors = P.checkShaderErrors; restored = true; }
      return;
    }
    const now = performance.now();
    const n = SS.scene.children.length;
    if (n < 1) return;
    if (MODE2 === 'asyncquiet') {
      // 关掉诊断（不阻塞地建 program）+ 每次场景增长都补一轮 compileAsync（允许并发）
      if (n === lastN && now - lastT < 200) return;
      lastN = n; lastT = now; P.passes++;
      try { r.compileAsync(SS.scene, SS.godCam); } catch (e) { P.err = String(e); }
      return;
    }
    if (MODE2 === 'async' || MODE2 === 'both') {
      if (active) return;
      if (n === lastN && now - lastT < 400) return;
      lastN = n; lastT = now; active = true; P.passes++;
      try {
        const pr = r.compileAsync(SS.scene, SS.godCam);
        if (pr && pr.then) pr.then(() => { active = false; }, () => { active = false; });
        else active = false;
      } catch (e) { active = false; P.err = String(e); }
      return;
    }
    if (MODE2 === 'full') {
      // 走 render.js 的完整管线（含 bloom/composite），把后处理 program 也提前解析掉
      if (n === lastN && now - lastT < 350) return;
      if (P.passes >= 10) return;
      lastN = n; lastT = now; P.passes++;
      try { SS.render.render(SS.scene, SS.godCam, 1 / 60); } catch (e) { P.err = String(e); }
      return;
    }
    if (MODE2 === 'render' || MODE2 === 'renderquiet') {
      // 分帧预热：场景每长一块就自己渲染一帧（等价于把 main.js warmUp 的三帧拆开，
      // 而且提前到 loading 早期开始），看最终「预热」那一步会不会变小
      if (n === lastN) return;
      lastN = n; P.passes++;
      try { r.render(SS.scene, SS.godCam); } catch (e) { P.err = String(e); }
    }
  }, 16);
  setTimeout(() => clearInterval(timer), 60000);
}.toString() + ')(' + JSON.stringify(MODE) + ')';

const b = new Browser({ port: PORT, width: W, height: H });
try {
  await b.launch();
  await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  await b.send('Page.navigate', { url });
  await sleep(WAIT);
  const P = await b.evaluate('window.__PW');
  const steps = P.steps || [];
  const lt = (P.longtasks || []).slice().sort((a, c) => c.d - a.d);
  console.log('mode=' + MODE + '  视口 ' + W + 'x' + H);
  console.log('  步骤: ' + steps.map((s, i) => s.step + '@' + s.t + (steps[i + 1] ? '(+' + (steps[i + 1].t - s.t) + ')' : '')).join(' → '));
  console.log('  最大长任务: ' + (lt[0] ? lt[0].t + 'ms 持续 ' + lt[0].d + 'ms' : '无'));
  console.log('  >100ms 长任务: ' + lt.filter((x) => x.d >= 100).map((x) => x.t + '/' + x.d).join(', '));
  console.log('  长任务合计: ' + lt.reduce((s, x) => s + x.d, 0) + 'ms  (≥50ms 数量 ' + lt.length + ')');
  console.log('  compileAsync 次数=' + P.passes + '  checkShaderErrors 原值=' + P.checkShaderErrors + (P.err ? ' err=' + P.err : ''));
  console.log('  预览: ' + JSON.stringify(steps.slice(-3)));
} finally { await b.close(); }
