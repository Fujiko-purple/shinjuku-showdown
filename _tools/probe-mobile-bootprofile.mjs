/**
 * probe-mobile-bootprofile.mjs —— 启动期 CPU 采样剖析（task-10）
 * ----------------------------------------------------------------------------
 * 长任务探针只告诉我们「656ms→1866ms 有一个 1210ms 的长任务」，
 * 但那次实测里 WebGL 着色器编译合计 0ms —— 说明瓶颈不在编译。
 * 这个探针用 CDP Profiler 从 navigate 之前开始采样，把 1.2s 里的
 * 自耗时最多的函数直接排出来，避免「猜原因」。
 *
 * 用法：node _tools/probe-mobile-bootprofile.mjs [--mobile 1] [--w 844] [--h 390] [--dpr 2]
 *        [--wait 20000] [--top 25]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const W = parseInt(arg('w', '844'), 10), H = parseInt(arg('h', '390'), 10), DPR = parseFloat(arg('dpr', '2'));
const MOBILE = arg('mobile', '1') === '1';
const WAIT = parseInt(arg('wait', '20000'), 10);
const TOP = parseInt(arg('top', '25'), 10);
const PORT = parseInt(arg('port', '9512'), 10);
const fileArg = arg('file', 'dist/新宿决战.html');
const url = 'file:///' + resolve(fileArg).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

const b = new Browser({ port: PORT, width: W, height: H });
try {
  await b.launch();
  await b.newPage();
  if (MOBILE) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await b.send('Profiler.enable');
  await b.send('Profiler.setSamplingInterval', { interval: 200 });   // 200us 采样
  await b.send('Profiler.start');
  const tProfilerStart = Date.now();
  await b.send('Page.navigate', { url });
  // 页面 performance.now() 的原点 ≈ navigate 的时刻；profile 的时钟是另一套单调时钟，
  // 用 Node 侧两个时间戳之差就能把两者对齐（误差 ~十几毫秒，足够定位 1.2s 的长任务）。
  const navOffsetMs = Date.now() - tProfilerStart;
  await sleep(WAIT);
  const { profile } = await b.send('Profiler.stop');
  const timeOrigin = await b.evaluate('performance.timeOrigin').catch(() => 0);

  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  // 每个样本的绝对时间：profile.startTime(us) + 累积 timeDeltas
  const abs = [];
  let cur = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    abs.push((cur / 1000) - timeOrigin);          // 换算成页面 performance.now() 的毫秒
    cur += profile.timeDeltas[i] || 0;
  }
  const base = abs[0];                       // 第一个样本的「profile 相对时间」
  const pageAbs = abs.map((x) => +(x - base - navOffsetMs).toFixed(1));   // 换算成页面 performance.now()
  console.log('时钟校准: navigate 相对 Profiler.start 晚 ' + navOffsetMs + 'ms；样本覆盖页面时间 ' + pageAbs[0] + 'ms → ' + pageAbs[pageAbs.length - 1] + 'ms');
  const from = parseFloat(arg('from', '640'));
  const to = parseFloat(arg('to', '1900'));
  const self = new Map();
  let total = 0;
  const win = [];
  for (let i = 0; i < profile.samples.length; i++) {
    const t = pageAbs[i];
    if (!(t >= from && t <= to)) continue;
    const n = byId.get(profile.samples[i]);
    if (!n) continue;
    const f = n.callFrame;
    const key = (f.functionName || '(anonymous)') + ' @' + (f.url ? f.url.split('/').pop() : '') + ':' + f.lineNumber;
    self.set(key, (self.get(key) || 0) + 1);
    win.push({ t, key });
    total++;
  }
  const rows = [...self.entries()].map(([k, c]) => ({ k, ms: +(c * 0.2).toFixed(1), pct: +(c / total * 100).toFixed(1) }))
    .sort((a, b2) => b2.ms - a.ms).slice(0, TOP);
  console.log('分析窗口 performance.now() ∈ [' + from + ', ' + to + ']ms，命中 ' + total + ' 个样本（每样本 200us，约 ' + Math.round(total * 0.2) + 'ms CPU）');
  console.log('\n== 自耗时 TOP ' + TOP + ' ==');
  rows.forEach((r) => console.log('  ' + String(r.ms).padStart(8) + 'ms  ' + String(r.pct).padStart(5) + '%  ' + r.k));
  if (process.argv.includes('--timeline')) {
    console.log('\n== 时间轴（每 50ms 内的主函数）==');
    const buckets = new Map();
    for (const s of win) {
      const bk = Math.floor(s.t / 50) * 50;
      if (!buckets.has(bk)) buckets.set(bk, new Map());
      const m = buckets.get(bk);
      m.set(s.key, (m.get(s.key) || 0) + 1);
    }
    for (const bk of [...buckets.keys()].sort((a, b2) => a - b2)) {
      const m = buckets.get(bk);
      const top = [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 3)
        .map(([k, c]) => (k.split(' @')[0] || '?') + '(' + c + ')').join(' ');
      console.log('  ' + String(bk).padStart(6) + 'ms  ' + top);
    }
  }
} catch (e) {
  console.log('FATAL ' + String(e && e.stack || e).slice(0, 300));
} finally {
  await b.close();
}
