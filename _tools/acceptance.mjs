/**
 * acceptance.mjs —— Lead 的自动化验收探针
 *
 * 目的：把「靠肉眼看截图」变成「可量化、可复现」的检查，覆盖：
 *   1. 运行期错误 / 未捕获异常 / 资源加载失败
 *   2. 帧率（均值 + 1% low）—— 卡顿是最劝退的体验问题
 *   3. HUD 几何体检：元素是否零尺寸、是否溢出视口、是否互相重叠、文字对比度是否过低
 *   4. 角色屏幕占比 —— 格斗游戏角色看不清就是致命伤
 *   5. 分状态截图留档
 *
 * 用法：
 *   node _tools/acceptance.mjs                      # 验收构建产物 dist/新宿决战.html
 *   node _tools/acceptance.mjs --w 390 --h 844 --mobile 1 --out shots/acc-mobile
 */
import { Browser, sleep } from './cdp.mjs';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const file = resolve(arg('file', 'dist/新宿决战.html'));
const outPrefix = arg('out', 'shots/acc');
const W = parseInt(arg('w', '1600'), 10);
const H = parseInt(arg('h', '900'), 10);
const mobile = arg('mobile', '0') === '1';
const port = parseInt(arg('port', '9401'), 10);

if (!existsSync(file)) { console.error('找不到文件: ' + file); process.exit(1); }
mkdirSync('shots', { recursive: true });

const b = new Browser({ port, width: W, height: H });
const report = { file, viewport: `${W}x${H}`, mobile, errors: [], shots: [], hud: {}, perf: {}, states: {}, warnings: [] };

try {
  await b.launch();
  await b.newPage();
  if (mobile) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  await b.send('Page.navigate', { url });
  await sleep(2500);

  // 帧率探针
  await b.evaluate(`(() => {
    window.__ACC = { dts: [], last: performance.now(), raf: 0 };
    const loop = () => { const n = performance.now(); window.__ACC.dts.push(n - window.__ACC.last); window.__ACC.last = n; window.__ACC.raf++;
      if (window.__ACC.dts.length > 4000) window.__ACC.dts.shift(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })()`);

  /**
   * 点击按钮。
   *
   * ⚠️ 踩过的坑：手机档开了 setTouchEmulationEnabled 之后，CDP 的鼠标事件会被浏览器吞掉，
   * 表现成"点了没反应"。曾经因此把「竖屏引导层挡住标题按钮 → 一直停在标题态」
   * 误判成「相机把角色拍出了视野」。所以 **mobile 档一律走 JS click**，desktop 档保留真实鼠标事件。
   */
  const clickId = async (id) => {
    if (mobile) {
      await b.evaluate(`(() => { const e = document.getElementById('${id}'); if (e) { e.click(); return true; } return false; })()`);
      return;
    }
    const box = await b.evaluate(`(() => { const e = document.getElementById('${id}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2, vis: r.width > 0 && r.height > 0 }; })()`);
    if (box && box.vis) await b.click(box.x, box.y);
    else await b.evaluate(`document.getElementById('${id}')?.click()`);
  };
  const shot = async (name) => { const p = `${outPrefix}-${name}.png`; await b.screenshot(p); report.shots.push(p); };

  /** 截一张 160x90 缩略图，回传页面解码，统计平均亮度 / 高光占比 / 纯黑占比 */
  const measureLuminance = async (tag) => {
    try {
      const cap = await b.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: W, height: H, scale: 0.1 },
        captureBeyondViewport: false,
      });
      const uri = 'data:image/png;base64,' + cap.data;
      return await b.evaluate(`(async () => {
        try {
          const img = new Image();
          img.src = ${JSON.stringify(uri)};
          await img.decode();
          const cv = document.createElement("canvas");
          const CW = 160, CH = 90;
          cv.width = CW; cv.height = CH;
          const ctx = cv.getContext("2d");
          ctx.drawImage(img, 0, 0, CW, CH);
          const d = ctx.getImageData(0, 0, CW, CH).data;
          let sum = 0, blown = 0, dark = 0; const n = CW * CH;
          for (let i = 0; i < d.length; i += 4) {
            const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            sum += l; if (l > 245) blown++; if (l < 12) dark++;
          }
          return { avgLum: +(sum / n).toFixed(1), blownPct: +(blown / n * 100).toFixed(1), darkPct: +(dark / n * 100).toFixed(1) };
        } catch (e) { return { error: String(e).slice(0, 100) }; }
      })()`);
    } catch (e) { return { error: String(e).slice(0, 100) }; }
  };

  // ---- 0) 标题界面 ----
  await sleep(5000);
  await shot('00-title');
  report.states.title = await b.evaluate(`(() => ({ screens: [...document.querySelectorAll('.screen')].filter(e=>!e.classList.contains('hidden')).map(e=>e.id) }))()`);

  // ---- 1) 进入战斗 ----
  // 手机档：mobile.js 在竖屏会先弹一层「横屏更爽」引导，它盖住标题按钮，
  // 必须先关掉，否则后面量到的全是标题镜头的假数据。
  if (mobile) {
    const hadGate = await b.evaluate(`(() => { const e = document.querySelector('[data-act="rotate-skip"]') || document.querySelector('[data-act="rotate-go"]'); if (e) { e.click(); return true; } return false; })()`);
    report.gateDismissed = hadGate;
    await sleep(900);
  }
  await clickId('btn-skip-cine');
  await sleep(10000);
  // 进战斗断言：没进去的话后面的角色占比/亮度数据都不可信，要明确标出来而不是当成游戏 bug
  const enterState = await b.evaluate(`window.__SS ? window.__SS.state : null`);
  report.enterState = enterState;
  if (enterState !== 'fight' && enterState !== 'clash') {
    report.warnings.push('未能进入战斗（__SS.state=' + enterState + '）—— 该次运行的角色占比/亮度数据不可信，请先查 harness');
  }
  await shot('01-fight');
  report.hud = await b.evaluate(`(() => {
    const VW = innerWidth, VH = innerHeight;
    const visible = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.02) return false;
      const r = e.getBoundingClientRect(); return r.width > 0.5 && r.height > 0.5; };
    const hud = document.getElementById('hud');
    const nodes = hud ? [...hud.querySelectorAll('*')].filter(visible) : [];
    const zeroSize = [], outOfView = [], tiny = [];
    for (const e of nodes) {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) { zeroSize.push(e.id || e.className); continue; }
      if (r.right < -2 || r.bottom < -2 || r.left > VW + 2 || r.top > VH + 2) outOfView.push({ sel: e.id || String(e.className).slice(0,30), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
      if (r.height < 12 && (e.textContent || '').trim().length > 2 && e.children.length === 0) tiny.push({ sel: e.id || String(e.className).slice(0,30), h: +r.height.toFixed(1), text: e.textContent.trim().slice(0,20) });
    }
    // 关键元素体检
    const key = {};
    for (const id of ['hp-gojo','hp-sukuna','hp-gojo-ghost','dom-gojo','dom-sukuna','timer','phase-tag','combo','banner','ability-bar','clash','lowhp','wheel','burnout-gojo']) {
      const e = document.getElementById(id);
      if (!e) { key[id] = 'MISSING'; continue; }
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      key[id] = { vis: visible(e), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bg: s.backgroundColor, color: s.color, opacity: s.opacity, z: s.zIndex };
    }
    // #flash 是否会盖住 HUD（基线里的已知问题）
    const flash = document.getElementById('flash');
    const flashZ = flash ? +getComputedStyle(flash).zIndex || 0 : null;
    const hudZ = hud ? +getComputedStyle(hud).zIndex || 0 : null;
    return { vw: VW, vh: VH, nodeCount: nodes.length, zeroSize, outOfView, tiny, key, flashZ, hudZ, flashCoversHud: flashZ !== null && hudZ !== null && flashZ > hudZ };
  })()`);

  // ---- 2) 角色屏幕占比 ----
  report.charRatio = await b.evaluate(`(() => {
    const SS = window.__SS;
    if (!SS || !SS.gojo || !SS.sukuna) return { error: 'no __SS' };
    const cam = SS.activeCamera;
    const measure = (f) => {
      if (!f || !f.root) return null;
      const THREE = f.root.constructor;
      let box;
      try {
        // 用骨骼/网格的世界坐标粗略包围盒投影到屏幕
        const pts = [];
        f.root.updateWorldMatrix(true, true);
        f.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.geometry && o.geometry.computeBoundingBox && o.geometry.computeBoundingBox(); if (o.geometry && o.geometry.boundingBox) {
          const bb = o.geometry.boundingBox; for (const k of [0,1,2,3,4,5,6,7]) { const v = new (o.position.constructor)(k&1?bb.max.x:bb.min.x, k&2?bb.max.y:bb.min.y, k&4?bb.max.z:bb.min.z); o.localToWorld(v); pts.push(v); } } } });
        if (!pts.length) return null;
        let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,anyIn=false;
        for (const p of pts) { const q = p.clone().project(cam); if (!isFinite(q.x)) continue;
          minX=Math.min(minX,q.x); maxX=Math.max(maxX,q.x); minY=Math.min(minY,q.y); maxY=Math.max(maxY,q.y);
          if (Math.abs(q.x)<1 && Math.abs(q.y)<1) anyIn = true; }
        if (!anyIn) return { onScreen: false };
        const hRatio = (maxY - minY) / 2, wRatio = (maxX - minX) / 2;
        return { onScreen: true, heightPct: +(hRatio*100).toFixed(1), widthPct: +(wRatio*100).toFixed(1),
                 screenX: +(((minX+maxX)/2)).toFixed(2), screenY: +(((minY+maxY)/2)).toFixed(2) };
      } catch (e) { return { error: String(e).slice(0,120) }; }
    };
    const camPos = cam.position.toArray().map(n=>+n.toFixed(1));
    return { gojo: measure(SS.gojo), sukuna: measure(SS.sukuna), camPos, camDist: +Math.hypot(cam.position.x-(SS.gojo.root.position.x), cam.position.y-SS.gojo.root.position.y, cam.position.z-SS.gojo.root.position.z).toFixed(1) };
  })()`);

  // ---- 3) 各技能状态截图 ----
  const seq = [
    ['melee', async () => { await b.keyDown('KeyW'); await sleep(300); await b.keyUp('KeyW'); for (const k of ['KeyJ','KeyJ','KeyJ']) { await b.pressKey(k, 50); await sleep(170); } await b.pressKey('KeyK', 60); await sleep(400); }],
    ['blue',  async () => { await b.pressKey('KeyU'); await sleep(900); }],
    ['red',   async () => { await b.pressKey('KeyI'); await sleep(900); }],
    ['purple',async () => { await b.pressKey('KeyO', 1400); await sleep(1600); }],
    ['domain',async () => { await b.pressKey('KeyG'); await sleep(3000); }],
  ];
  for (const [name, fn] of seq) {
    try { await fn(); } catch (e) { report.warnings.push(`动作 ${name} 失败: ${e}`); }
    await shot('02-' + name);
    /**
     * 抓这一帧的过曝程度。
     * 注意：不能直接 gl.readPixels —— 渲染器没开 preserveDrawingBuffer，异步读会拿到
     * GL_INVALID_OPERATION 和全 0 数据（我踩过这个坑）。改用 CDP 截一张缩略图，
     * 传回页面用 Image + canvas 解码后统计亮度分布。缩略图只有 ~3KB，开销可忽略。
     */
    const lum = await measureLuminance(name);
    report.states[name] = lum;
  }

  await b.pressKey('KeyR'); await sleep(1500);

  // ---- 4) 性能 ----
  report.perf = await b.evaluate(`(() => {
    const p = window.__ACC; if (!p || p.dts.length < 30) return { error: 'samples too few', n: p ? p.dts.length : 0 };
    const d = p.dts.slice(-1500).sort((a,b)=>a-b);
    const avg = d.reduce((a,b)=>a+b,0)/d.length;
    return { frames: p.raf, avgMs: +avg.toFixed(2), avgFps: +(1000/avg).toFixed(1),
             p50: +d[Math.floor(d.length*0.5)].toFixed(2), p95: +d[Math.floor(d.length*0.95)].toFixed(2), p99: +d[Math.floor(d.length*0.99)].toFixed(2),
             worstFps: +(1000/d[d.length-1]).toFixed(1) };
  })()`);

  report.renderInfo = await b.evaluate(`(() => {
    const r = window.__SS && window.__SS.render; if (!r || !r.renderer) return null;
    const i = r.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, geoms: i.memory.geometries, texs: i.memory.textures, programs: i.programs ? i.programs.length : -1 };
  })()`);

  report.errors = b.errors.slice(0, 40);
  const badLogs = b.logs.filter(l => l.type === 'error' || l.type === 'warning');
  report.consoleIssues = badLogs.slice(0, 40);
  report.failedRequests = b.failedRequests.slice(0, 10);
} catch (e) {
  report.fatal = String(e && e.stack || e);
} finally {
  await b.close();
}

// ---- 判定 ----
const fails = [];
if (report.fatal) fails.push('致命: ' + report.fatal);
if (report.errors?.length) fails.push(`运行期异常 ${report.errors.length} 条`);
if (report.hud?.flashCoversHud) fails.push('#flash 的 z-index 高于 #hud（会盖住 HUD）');
if (report.hud?.outOfView?.length) fails.push(`HUD 元素溢出视口 ${report.hud.outOfView.length} 个`);
if (report.hud?.tiny?.length) fails.push(`HUD 文字过小 ${report.hud.tiny.length} 个`);
/**
 * 角色屏幕占比。
 *
 * ⚠ 这条阈值我一开始写成「≥20%，理想 30-45%」，依据是"格斗游戏要看清楚角色"——
 *   **结果是错的，而且代价很大**：团队照这个指标把镜头一路推近到 37%，
 *   用户实测后反馈"太近了，人物建模缺陷一下子就都看到了，没有空旷感，屏幕都被人物占据"。
 *   这个项目要的是**看得见新宿街道的空间感**，不是怼脸看模型。
 *   所以放宽到 ≥10%，只守住"角色没跑出画面 / 没小到看不见"这条底线，
 *   具体远近交给用户的主观判断（他们随时可以让相机负责人步进调）。
 */
const gr = report.charRatio?.gojo;
if (gr && gr.onScreen && gr.heightPct < 10) fails.push(`角色屏幕占比仅 ${gr.heightPct}%（底线 10%，用于防"小到看不见"）`);
if (gr && gr.onScreen === false) fails.push('战斗中角色跑出视野');
if (report.perf?.avgFps && report.perf.avgFps < 55) fails.push(`平均帧率 ${report.perf.avgFps} < 55`);
const blownStates = Object.entries(report.states || {}).filter(([, v]) => v && v.blownPct > 25).map(([k, v]) => `${k}=${v.blownPct}%`);
if (blownStates.length) fails.push('画面过曝（高光占比 >25%）: ' + blownStates.join(', '));
report.verdict = fails.length ? { pass: false, fails } : { pass: true };

console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
