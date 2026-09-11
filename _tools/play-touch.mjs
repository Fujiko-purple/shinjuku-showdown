/**
 * play-touch.mjs —— 触屏试玩 / 截图 / 布局体检 / 帧率探针（mobile-ship 专用工具）
 * ----------------------------------------------------------------------------
 * 为什么不用 play.mjs：play.mjs 只有键鼠动作，三个 teammate 同时在用，不能改。
 * 本文件独立存在，复用 _tools/cdp.mjs 的 CDP 客户端，只做「触屏」这一件事。
 *
 * 用法
 *   node _tools/play-touch.mjs --out shots/mobile [--url http://127.0.0.1:8173/ | --file dist/site/index.html]
 *        [--w 844] [--h 390] [--dpr 2] [--mobile 1] [--port 9341] [--action "wait:6000,start,..."]
 *
 * 动作（逗号分隔，按顺序执行）
 *   wait:<ms>                     等待
 *   shot:<name>                   截图 -> <out>-<name>.png
 *   start / skip                  点标题页「开战」/「直接进入战斗」
 *   tap:<选择器>                  点一下触屏控件（如 tap:[data-act=light]）
 *   tapxy:<x>:<y>                 点屏幕坐标
 *   hold:<选择器>:<ms>            按住不放
 *   stick:<dx>:<dy>:<ms>          推动虚拟摇杆（相对摇杆中心）
 *   drag:<x1>:<y1>:<x2>:<y2>:<ms> 单指拖拽（转镜头）
 *   pinch:<倍率>:<ms>             双指捏合（>1 放大 / <1 缩小）
 *   multi:<selA>|<selB>:<ms>      两指同时按两个控件（验证多点触控不冲突）
 *   tdown:<id>:<选择器>           底层：指定手指编号按下
 *   tmove:<id>:<dx>:<dy>          底层：指定手指移动
 *   tup:<id>                      底层：指定手指抬起
 *   audit                         布局体检（__MOBILE.audit()，输出重叠/越界/遮挡）
 *   probe                         状态 + 帧率 + 触屏层信息
 *   fps:<ms>                      采样一段时间内的帧率
 *   orient:portrait|landscape     切换模拟方向
 *   eval:<js>                     页面内求值（避免出现逗号）
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const outPrefix = arg('out', 'shots/touch');
const W = parseInt(arg('w', '844'), 10);
const H = parseInt(arg('h', '390'), 10);
const DPR = parseFloat(arg('dpr', '2'));
const PORT = parseInt(arg('port', '9341'), 10);
const fileArg = arg('file', 'dist/site/index.html');
const urlArg = arg('url', '');
const actions = arg('action',
  'wait:9000,skip,wait:4000,audit,shot:01-battle,tap:[data-act=light],wait:600,shot:02-hit,fps:2500,probe').split(',').filter(Boolean);

const query = arg('query', '');   // 追加到 URL 后面的查询串，如 "touch=1&mdebug=1"
function fileUrl(p) {
  const abs = resolve(p).replace(/\\/g, '/');
  return 'file:///' + abs.split('/').map(encodeURIComponent).join('/');
}
const url = (urlArg || fileUrl(fileArg)) + (query ? (query.startsWith('?') ? query : '?' + query) : '');
if (!urlArg && !existsSync(resolve(fileArg))) { console.error('找不到文件: ' + fileArg); process.exit(1); }
mkdirSync(dirname(resolve(outPrefix + '-x.png')), { recursive: true });

const b = new Browser({ port: PORT, width: W, height: H });
const report = { url, viewport: { W, H, DPR }, actions: [], shots: [], audit: [], probes: [], fps: [], errors: [], logs: [] };

/* ---------------- 触摸状态管理 ---------------- */
const touches = new Map();   // id -> {x,y}
let seq = 0;

async function flush(type) {
  const points = [...touches.entries()].map(([id, p]) => ({
    x: Math.round(p.x), y: Math.round(p.y), radiusX: 12, radiusY: 12, force: 1, id,
  }));
  await b.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}
async function tDown(id, x, y) {
  touches.set(id, { x, y });
  await b.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12, force: 1, id }],
  });
}
async function tMove(id, x, y) {
  const p = touches.get(id);
  if (!p) return;
  p.x = x; p.y = y;
  await flush('touchMove');
}
async function tUp(id) {
  touches.delete(id);
  await flush('touchEnd');
}
async function tapAt(x, y, holdMs = 70) {
  const id = ++seq;
  await tDown(id, x, y);
  await sleep(holdMs);
  await tUp(id);
}
async function rectOf(sel) {
  return b.evaluate('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if(!e) return null; const r = e.getBoundingClientRect(); if (r.width < 1) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()');
}
function need(r, sel) { if (!r) throw new Error('找不到可点元素: ' + sel); return r; }

/* ---------------- 帧率探针 ---------------- */
async function startFpsProbe() {
  await b.evaluate('(() => { if (window.__PROBE2) return; const P = window.__PROBE2 = { dts: [], last: performance.now() }; const loop = () => { const n = performance.now(); P.dts.push(n - P.last); P.last = n; if (P.dts.length > 900) P.dts.shift(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); })()');
}
async function fpsOver(ms) {
  await sleep(ms);
  return b.evaluate('(() => { const P = window.__PROBE2; if (!P || P.dts.length < 8) return null; const s = P.dts.slice(-Math.min(P.dts.length, Math.round(' + ms + '/16))).sort((a,b)=>a-b); const avg = s.reduce((a,b)=>a+b,0)/s.length; return { frames: s.length, avgMs: +avg.toFixed(2), avgFps: +(1000/avg).toFixed(1), p95Ms: +s[Math.floor(s.length*0.95)].toFixed(2), minFps: +(1000/s[s.length-1]).toFixed(1) }; })()');
}

/* ---------------- 主流程 ---------------- */
try {
  await b.launch();
  await b.newPage();
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: DPR, mobile: true,
    screenOrientation: { type: H > W ? 'portraitPrimary' : 'landscapePrimary', angle: H > W ? 0 : 90 },
  });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await b.send('Page.navigate', { url });
  await sleep(2500);
  await startFpsProbe();
  report.title = await b.evaluate('document.title');

  for (const act of actions) {
    const parts = act.split(':');
    const cmd = parts[0];
    const t0 = Date.now();
    try {
      switch (cmd) {
        case 'wait': await sleep(parseInt(parts[1], 10)); break;
        case 'waitfor': {
          // waitfor:<js 表达式>:<超时 ms> —— 表达式里不要出现逗号（动作是按逗号切的）
          const expr = parts.slice(1, parts.length - 1).join(':');
          const timeout = parseInt(parts[parts.length - 1], 10) || 30000;
          const t0 = Date.now();
          let hit = false;
          while (Date.now() - t0 < timeout) {
            try { if (await b.evaluate(expr)) { hit = true; break; } } catch (e) { /* 页面切换中，继续等 */ }
            await sleep(500);
          }
          report.waitfor = report.waitfor || [];
          report.waitfor.push({ expr, hit, ms: Date.now() - t0 });
          break;
        }
        case 'shot': {
          const p = outPrefix + '-' + (parts[1] || String(report.shots.length + 1).padStart(2, '0')) + '.png';
          await b.screenshot(p);
          report.shots.push(p);
          break;
        }
        case 'skipcine': {
          const r2 = need(await rectOf('#t-skip'), '#t-skip');
          await tapAt(r2.x, r2.y);
          break;
        }
        case 'start': case 'skip': {
          const id = cmd === 'start' ? '#btn-start' : '#btn-skip-cine';
          const r = need(await rectOf(id), id);
          await tapAt(r.x, r.y);
          break;
        }
        case 'tap': {
          const r = need(await rectOf(parts[1]), parts[1]);
          await tapAt(r.x, r.y);
          break;
        }
        case 'tapxy': await tapAt(parseFloat(parts[1]), parseFloat(parts[2])); break;
        case 'hold': {
          const r = need(await rectOf(parts[1]), parts[1]);
          const ms = parseInt(parts[2], 10) || 500;
          const id = ++seq;
          await tDown(id, r.x, r.y);
          await sleep(ms);
          await tUp(id);
          break;
        }
        case 'stick': {
          const dx = parseFloat(parts[1]) || 0, dy = parseFloat(parts[2]) || 0, ms = parseInt(parts[3], 10) || 600;
          const r = need(await rectOf('#t-joy'), '#t-joy');
          const cx = r.x, cy = r.y;
          const id = ++seq;
          const steps = Math.max(2, Math.round(ms / 40));
          await tDown(id, cx, cy);
          for (let i = 1; i <= steps; i++) { await tMove(id, cx + dx * i / steps, cy + dy * i / steps); await sleep(40); }
          if (parts[4] === 'keep') { /* 保持按住，交给后续 tup */ } else { await tUp(id); }
          break;
        }
        case 'drag': {
          const x1 = parseFloat(parts[1]), y1 = parseFloat(parts[2]), x2 = parseFloat(parts[3]), y2 = parseFloat(parts[4]);
          const ms = parseInt(parts[5], 10) || 400;
          const id = ++seq;
          const steps = Math.max(2, Math.round(ms / 30));
          await tDown(id, x1, y1);
          for (let i = 1; i <= steps; i++) { await tMove(id, x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps); await sleep(30); }
          await tUp(id);
          break;
        }
        case 'pinch': {
          const f = parseFloat(parts[1]) || 1.2, ms = parseInt(parts[2], 10) || 400;
          const cx = W / 2, cy = H / 2, d0 = Math.min(W, H) * 0.22, d1 = d0 * f;
          const a = ++seq, c = ++seq;
          await tDown(a, cx - d0, cy); await tDown(c, cx + d0, cy);
          const steps = Math.max(2, Math.round(ms / 30));
          for (let i = 1; i <= steps; i++) {
            await tMove(a, cx - (d0 + (d1 - d0) * i / steps), cy);
            await tMove(c, cx + (d0 + (d1 - d0) * i / steps), cy);
            await sleep(30);
          }
          await tUp(a); await tUp(c);
          break;
        }
        case 'multi': {
          const sels = parts[1].split('|');
          const ms = parseInt(parts[2], 10) || 300;
          const ids = [];
          for (const s of sels) {
            const r = need(await rectOf(s), s);
            const id = ++seq;
            ids.push(id);
            await tDown(id, r.x, r.y);
            await sleep(30);
          }
          await sleep(ms);
          for (const id of ids) { await tUp(id); await sleep(30); }
          break;
        }
        case 'release': { for (const id of [...touches.keys()]) await tUp(id); break; }
        case 'tdown': { const r = need(await rectOf(parts[2]), parts[2]); await tDown(parseInt(parts[1], 10), r.x, r.y); break; }
        case 'tmove': await tMove(parseInt(parts[1], 10), parseFloat(parts[2]), parseFloat(parts[3])); break;
        case 'tup': await tUp(parseInt(parts[1], 10)); break;
        case 'audit': {
          const a = await b.evaluate('window.__MOBILE ? window.__MOBILE.audit() : null');
          report.audit.push(a);
          break;
        }
        case 'probe': {
          const p = await b.evaluate('(() => { const M = window.__MOBILE, S = window.__SS; const rects = {}; for (const id of ["t-joy","t-acts","t-util","ability-bar","hp-gojo","hp-sukuna","timer"]) { const e = document.getElementById(id); if (e) { const r = e.getBoundingClientRect(); rects[id] = [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]; } } return { state: S ? S.state : null, quality: S ? S.quality : null, mobile: M ? M.perf : null, touch: M ? M.touch : null, tier: M ? M.tier : null, env: M ? M.env : null, stick: M ? M.stick : null, touchUI: (() => { const e = document.getElementById("touch-ui"); return e ? e.className : null; })(), rects, banner: (() => { const e = document.getElementById("banner"); return e ? e.textContent.trim().slice(0, 60) : null; })(), bgmLazy: window.__BGM_LAZY ? { loaded: window.__BGM_LAZY.loaded, playing: window.__BGM_LAZY.playing } : null, bgmSrc: (() => { const e = document.getElementById("bgm"); return e ? (e.getAttribute("src") || "").slice(0, 40) : null; })(), stats: S ? S.stats : null, snapshot: (() => { const s = S && S.snap; return s ? { gojoHp: Math.round(s.gojo.hp), sukunaHp: Math.round(s.sukuna.hp), combo: s.combo, phase: s.phase, mode: s.mode, clash: !!s.clashActive } : null; })() }; })()');
          const extra = await b.evaluate('(() => { const b = document.getElementById("banner"); const h = document.getElementById("hints"); return { banner: b ? b.textContent.trim().slice(0, 80) : null, hints: h ? h.textContent.replace(/\\s+/g, " ").trim().slice(0, 120) : null }; })()');
          if (extra) Object.assign(p, extra);
          report.probes.push(p);
          break;
        }
        case 'fps': report.fps.push(await fpsOver(parseInt(parts[1], 10) || 2500)); break;
        case 'orient': {
          const portrait = parts[1] === 'portrait';
          const w2 = portrait ? Math.min(W, H) : Math.max(W, H);
          const h2 = portrait ? Math.max(W, H) : Math.min(W, H);
          await b.send('Emulation.setDeviceMetricsOverride', {
            width: w2, height: h2, deviceScaleFactor: DPR, mobile: true,
            screenOrientation: { type: portrait ? 'portraitPrimary' : 'landscapePrimary', angle: portrait ? 0 : 90 },
          });
          await sleep(900);
          break;
        }
        case 'eval': report.actions.push({ act, value: await b.evaluate(parts.slice(1).join(':')) }); break;
        default: console.error('未知动作: ' + act);
      }
    } catch (e) {
      report.actions.push({ act, error: String(e && e.message || e) });
    }
    report.actions.push({ act, ms: Date.now() - t0 });
  }

  report.errors = b.errors.slice(0, 20);
  report.logs = b.logs.filter((l) => l.type === 'error' || l.type === 'warning').slice(0, 25);
} catch (e) {
  report.fatal = String(e && e.stack || e);
} finally {
  await b.close();
}

/* ---------------- 人看的总结 ---------------- */
console.log('URL: ' + report.url + '   视口: ' + W + 'x' + H + ' @' + DPR + 'x');
if (report.fatal) console.log('!! 致命错误: ' + report.fatal);
report.shots.forEach((s) => console.log('截图 ' + s));
report.audit.forEach((a, i) => {
  if (!a) { console.log('体检#' + (i + 1) + ': 未启用触屏层'); return; }
  console.log('体检#' + (i + 1) + ' [' + a.viewport.orientation + ' ' + a.viewport.w + 'x' + a.viewport.h + '] ' +
    (a.ok ? '✅ 无重叠/越界' : '❌ ' + a.issues.length + ' 个问题') +
    ' | 控件 ' + a.controls.length + ' 个, 遮挡 ' + a.coverPct + '%, 战场净空 ' + a.freeViewH + 'px');
  a.issues.forEach((s) => console.log('   · ' + s));
  if (process.argv.includes('--rects')) {
    console.log('   控件: ' + a.controls.map((c) => c.name + '[' + c.x + ',' + c.y + ' ' + c.w + 'x' + c.h + ']').join(' '));
    console.log('   HUD : ' + a.hud.map((h) => h.name + '[' + h.x + ',' + h.y + ' ' + h.w + 'x' + h.h + ']').join(' '));
  }
});
report.fps.forEach((f, i) => console.log('帧率#' + (i + 1) + ': ' + (f ? f.avgFps + ' FPS (p95 ' + f.p95Ms + 'ms, 最低 ' + f.minFps + ' FPS, n=' + f.frames + ')' : '无数据')));
if (report.probes.length) {
  const p = report.probes[report.probes.length - 1];
  console.log('状态: ' + JSON.stringify({ state: p.state, quality: p.quality, tier: p.tier && p.tier.name, pr: p.mobile && p.mobile.pr, ui: p.touchUI, stick: p.stick, snap: p.snapshot, bgm: p.bgmLazy }));
}
console.log('页面错误: ' + (report.errors.length ? JSON.stringify(report.errors.slice(0, 5)) : '无'));
console.log('控制台告警: ' + (report.logs.length ? JSON.stringify(report.logs.slice(0, 5)) : '无'));
console.log('\n--- JSON ---');
console.log(JSON.stringify({ ...report, actions: report.actions.slice(-40) }, null, 2));
