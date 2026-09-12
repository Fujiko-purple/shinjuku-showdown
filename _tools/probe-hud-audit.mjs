/**
 * probe-hud-audit.mjs —— HUD 审计探针（camera-ui / task-9）
 * ---------------------------------------------------------------------------
 * 把「HUD 有没有重叠 / 字够不够大 / 对比度够不够」变成可复跑的数据。
 *
 * 用法：
 *   node _tools/probe-hud-audit.mjs --w 1280 --h 720 --out shots/hud-audit-1280
 *   node _tools/probe-hud-audit.mjs --w 390 --h 844 --mobile 1 --out shots/hud-audit-390
 * 可选参数：--phases fight,combo,clash,lowhp,pause,result,cine --file dist/新宿决战.html
 *
 * 每个 phase：
 *   1) 枚举全部可见元素（含 result 结算层 / clash / ability-bar / 提示 / banner / 连击 / 伤害数字）
 *   2) Rect 两两求交（排除祖先-后代：那是有意包含）
 *   3) 截一张全屏图 → 页面内解码成 canvas → 对含文字元素采样像素，算「文字色 vs 背景中位亮度」对比度
 * 输出：<out>-report.json + 控制台摘要
 * ---------------------------------------------------------------------------
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const outPrefix = arg('out', 'shots/hud-audit');
const W = parseInt(arg('w', '1280'), 10);
const H = parseInt(arg('h', '720'), 10);
const mobile = arg('mobile', '') === '1';
const port = parseInt(arg('port', '9701'), 10);
const phases = arg('phases', 'fight,combo,clash,lowhp,pause,result').split(',').filter(Boolean);
if (!existsSync(file)) { console.error('找不到文件: ' + file); process.exit(1); }

/** 页面内：枚举所有可见元素 + 父子关系 */
function collectInPage() {
  var SKIP = { HTML: 1, BODY: 1, SCRIPT: 1, STYLE: 1, CANVAS: 1, BR: 1, AUDIO: 1, SOURCE: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1 };
  var DECO = { gl: 1, flash: 1, lowhp: 1, bgm: 1, 'title-bg-grid': 1, 'touch-ui': 1 };
  /**
   * 覆盖层优先：暂停/结算/崩溃这类全屏层是不透明背板，被它盖住的 HUD 元素
   * 玩家根本看不见 —— 对它们做对比度采样只会得到误报（实测 pause/result 下
   * 技能键帽的对比度会算成 1.01）。所以有覆盖层时只审计覆盖层内部。
   */
  var overlay = null;
  var screens = document.querySelectorAll('.screen');
  for (var s0 = 0; s0 < screens.length; s0++) {
    if (screens[s0].classList.contains('hidden')) continue;
    var csS = getComputedStyle(screens[s0]);
    if (csS.display === 'none' || parseFloat(csS.opacity) < 0.1) continue;
    overlay = screens[s0];
    break;
  }
  var rootEl = overlay || document.body;
  var out = [];
  var all = rootEl.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (SKIP[e.tagName]) continue;
    if (e.id && DECO[e.id]) continue;
    if (e.classList.contains('screen') || e.classList.contains('bar') || e.classList.contains('spin')) continue;
    if (e.classList.contains('title-bg-grid')) continue; // 标题的装饰网格（背景图案，非 UI）
    var vis = true;
    var n = e;
    while (n && n.nodeType === 1) {
      var cs0 = getComputedStyle(n);
      if (cs0.display === 'none' || cs0.visibility === 'hidden') { vis = false; break; }
      if (parseFloat(cs0.opacity) < 0.1) { vis = false; break; }
      n = n.parentElement;
    }
    if (!vis) continue;
    var r = e.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
    var cs = getComputedStyle(e);
    var leaf = e.childElementCount === 0;
    var node = {
      i: out.length,
      id: e.id || null,
      cls: (typeof e.className === 'string' ? e.className : '').slice(0, 44),
      tag: e.tagName,
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      fs: parseFloat(cs.fontSize), color: cs.color, bg: cs.backgroundColor, bgi: cs.backgroundImage, op: cs.opacity,
      txt: leaf ? (e.textContent || '').trim().slice(0, 20) : '',
      leaf: leaf, parent: -1
    };
    out.push(node);
    out[out.length - 1]._el = e;
    var p = e.parentElement;
    while (p && p !== document.body) {
      var found = -1;
      for (var k = 0; k < out.length; k++) { if (out[k]._el === p) { found = k; break; } }
      if (found >= 0) { node.parent = found; break; }
      p = p.parentElement;
    }
  }
  for (var m = 0; m < out.length; m++) delete out[m]._el;
  return { overlay: overlay ? overlay.id : null, els: out };
}

/** 页面内：把 CDP 截图解码进 canvas */
function decodeInPage(b64) {
  return new Promise(function (res) {
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      window.__HUDCTX = ctx;
      res({ w: img.width, h: img.height });
    };
    img.onerror = function () { res({ w: 0, h: 0, err: 'decode failed' }); };
    img.src = 'data:image/png;base64,' + b64;
  });
}

/** 页面内：逐元素采样像素算背景亮度与对比度 */
function sampleInPage(list) {
  var ctx = window.__HUDCTX;
  if (!ctx) return null;
  var vw = innerWidth, vh = innerHeight;
  var sx = ctx.canvas.width / vw, sy = ctx.canvas.height / vh;
  var f = function (c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var lum = function (r, g, b) { return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  var parse = function (s) {
    if (!s) return null;
    var a = s.indexOf('(');
    if (a < 0) return null;
    var b2 = s.indexOf(')');
    var p = s.slice(a + 1, b2 < 0 ? s.length : b2).split(',').map(parseFloat);
    if (!p.length || isNaN(p[0])) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    // 背景估计要往外扩 6px：小字号元素的 rect 里几乎全是字，直接取中位会把"文字本身"
    // 当成背景（实测标题页的 <b> 键位标签因此被误判为对比度 2.6）。
    // 自带渐变底的元素（技能键帽是金色渐变）不扩边：扩了会把邻里像素当背景
    var pad = (e.bgi && e.bgi.indexOf('gradient') >= 0) ? 0 : 6;
    var x = Math.max(0, Math.round((e.x - pad) * sx)), y = Math.max(0, Math.round((e.y - pad) * sy));
    var w = Math.max(1, Math.min(ctx.canvas.width - x, Math.round((e.w + pad * 2) * sx)));
    var h = Math.max(1, Math.min(ctx.canvas.height - y, Math.round((e.h + pad * 2) * sy)));
    if (w < 2 || h < 2) continue;
    var d = null;
    try { d = ctx.getImageData(x, y, w, h).data; } catch (err) { continue; }
    var hist = new Array(256);
    for (var q = 0; q < 256; q++) hist[q] = 0;
    var count = 0;
    for (var k = 0; k < d.length; k += 4) {
      var L = Math.round(0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]);
      hist[L]++; count++;
    }
    if (!count) continue;
    var acc = 0, med = 0;
    for (var L2 = 0; L2 < 256; L2++) { acc += hist[L2]; if (acc >= count * 0.5) { med = L2; break; } }
    var tc = parse(e.color) || { r: 255, g: 255, b: 255 };
    var tl = lum(tc.r, tc.g, tc.b);
    var bl;
    var own = parse(e.bg);
    if (own && own.a > 0.5) {
      // 元素自带不透明底（例如技能格的键帽金底）：背景就是它自己，
      // 不能拿外扩采样的邻里像素当背景，否则会误判成"深色字配深色底"。
      var mix = own.a >= 1 ? 1 : own.a;
      var rr = own.r * mix + med * (1 - mix);
      var gg = own.g * mix + med * (1 - mix);
      var bb2 = own.b * mix + med * (1 - mix);
      bl = lum(rr, gg, bb2);
    } else {
      bl = lum(med, med, med);
    }
    var hi = Math.max(tl, bl), lo = Math.min(tl, bl);
    out.push({ i: e.i, medLum: med, textLum: +tl.toFixed(3), bgLum: +bl.toFixed(3), contrast: +(((hi + 0.05) / (lo + 0.05))).toFixed(2) });
  }
  return out;
}

/**
 * 修复前的样式快照：用来在**同一次运行、同一帧**里复现"修复前"的样子，
 * 便于产出可比的 before/after（否则只能拿两次不同的构建结果对比，环境噪声大）。
 * 只回溯本轮我改过的声明，不改别的东西。
 */
const REVERT_CSS = [
  '.fp-name .en{font-size:9px!important;letter-spacing:.28em!important;color:rgba(232,230,223,.45)!important}',
  '.fp-side{font-size:9px!important;letter-spacing:.22em!important;color:rgba(255,216,115,.65)!important}',
  '.stat-label{font-size:9px!important;letter-spacing:.18em!important;color:rgba(232,230,223,.5)!important;text-shadow:none!important}',
  '.stat-num{font-size:11.5px!important;color:rgba(255,255,255,.92)!important;text-shadow:0 1px 3px #000!important}',
  '.stat-row{background:none!important;padding:0!important}',
  '.burnout{font-size:10px!important}',
  '.wheel{font-size:9px!important}',
  '.phase-tag,.focus-dist{font-size:10px!important;padding:2px 8px!important}',
  '.ab .ab-name{font-size:9.5px!important}',
  '.ab .ab-glyph{inset:12px 8px 18px!important}',
  '.banner{top:74px!important}',
  '.hint{font-size:11.5px!important}',
  '.cine-skip{font-size:11px!important}',
  '.cap-sub{font-size:clamp(10px,1vw,13px)!important}',
  '.audio-panel label{font-size:10px!important}',
  '.title-kicker{font-size:11px!important}',
  '.t-en{font-size:clamp(9px,1.15vw,14px)!important}',
  '.btn .btn-sub{font-size:10px!important}',
  '.cg-col p{font-size:11.5px!important}',
  '.title-foot{font-size:10px!important}',
  '.pause-note{font-size:11px!important}',
  '.loading-step{font-size:11px!important}',
  '#crash-msg{font-size:11.5px!important}'
].join('');

const COLLECT = '(' + collectInPage.toString() + ')()';

function boxList(els) {
  return els.map(function (e) { return { i: e.i, x: e.x, y: e.y, w: e.w, h: e.h, color: e.color, bg: e.bg, bgi: e.bgi, id: e.id, cls: e.cls, txt: e.txt, fs: e.fs, leaf: e.leaf }; });
}

/** 成对求交（排除祖先-后代） */
function overlaps(list) {
  const res = [];
  const byI = {};
  for (const e of list) byI[e.i] = e;
  const isAnc = (A, B) => {
    let p = B.parent;
    let guard = 0;
    while (p !== undefined && p >= 0 && guard++ < 64) {
      if (p === A.i) return true;
      const pe = byI[p];
      if (!pe) break;
      p = pe.parent;
    }
    return false;
  };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      if (isAnc(A, B) || isAnc(B, A)) continue;
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (ox <= 0.5 || oy <= 0.5) continue;
      res.push({ a: A.id || A.cls || A.tag, b: B.id || B.cls || B.tag, aRect: [A.x, A.y, A.w, A.h], bRect: [B.x, B.y, B.w, B.h], ox: +ox.toFixed(1), oy: +oy.toFixed(1), area: +(ox * oy).toFixed(0), aTxt: A.txt, bTxt: B.txt });
    }
  }
  return res.sort((p, q) => q.area - p.area);
}

const b = new Browser({ port, width: W, height: H });
const report = { file, viewport: W + 'x' + H, mobile, phases: {}, errors: [] };
try {
  await b.launch();
  await b.newPage();
  if (mobile) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  await b.send('Page.navigate', { url });
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    let ok = false;
    try { ok = await b.evaluate('!!(window.__SS && window.__SS.gojo && window.__SS.sukuna)'); } catch (e) { ok = false; }
    if (ok) break;
  }
  await sleep(1500);

  const auditPhase = async (name) => {
    const collected = await b.evaluate(COLLECT);
    const els = collected.els;
    const cap = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const size = await b.evaluate('(' + decodeInPage.toString() + ')(' + JSON.stringify(cap.data) + ')');
    const sampled = (await b.evaluate('(' + sampleInPage.toString() + ')(' + JSON.stringify(boxList(els)) + ')')) || [];
    const byI = {};
    for (const s of sampled) byI[s.i] = s;
    const merged = els.map((e) => Object.assign({}, e, byI[e.i] ? { contrast: byI[e.i].contrast, medLum: byI[e.i].medLum, textLum: byI[e.i].textLum, bgLum: byI[e.i].bgLum } : {}));
    // 有意重叠：血条/幽灵条同层叠放、#hud 这类全屏容器与其子元素
    const INTENT = (o) => {
      const both = (o.a + ' ' + o.b);
      if (/ghost/.test(both)) return true;
      if (o.a === 'hud' || o.b === 'hud') return true;
      return false;
    };
    const realOverlaps = overlaps(merged).filter((o) => !INTENT(o));
    report.phases[name] = {
      size: size,
      overlay: collected.overlay || null,
      count: merged.length,
      elements: merged,
      overlaps: realOverlaps,
      rawOverlaps: overlaps(merged),
      small: merged.filter((e) => e.leaf && e.txt && e.h < 12),
      smallFont: merged.filter((e) => e.leaf && e.txt && e.fs < 12),
      lowContrast: merged.filter((e) => e.leaf && e.txt && e.contrast !== undefined && e.contrast < 3)
    };
    await b.screenshot(outPrefix + '-' + name + '.png');
  };

  const toFight = async () => {
    await b.evaluate('document.getElementById("btn-skip-cine").click(); true');
    for (let i = 0; i < 60; i++) { await sleep(500); const st = await b.evaluate('window.__SS.state'); if (st === 'fight' || st === 'clash') return; }
  };
  const runCombo = async (n) => {
    for (let i = 0; i < n; i++) { await b.pressKey('KeyJ', 55); await sleep(220); }
    await b.pressKey('KeyK', 60);
    await sleep(400);
  };

  // ---- "修复前"对照：注入回溯样式，复现本轮修复前的字号/内边距/位置 ----
  const revertOn = async () => {
    await b.evaluate('(function(){ var s = document.createElement("style"); s.id = "__revert"; s.textContent = ' + JSON.stringify(REVERT_CSS) + '; document.head.appendChild(s); return 1; })()');
    await sleep(400);
  };
  const revertOff = async () => {
    await b.evaluate('(function(){ var s = document.getElementById("__revert"); if (s) s.remove(); return 1; })()');
    await sleep(400);
  };

  if (phases.includes('title')) await auditPhase('title');
  if (phases.includes('cine')) {
    await b.evaluate('document.getElementById("btn-start").click(); true');
    await sleep(4500);
    await auditPhase('cine');
  }
  if (phases.includes('fight') || phases.includes('combo') || phases.includes('clash') || phases.includes('lowhp') || phases.includes('pause') || phases.includes('result') || phases.includes('domain')) {
    await toFight();
    await sleep(1500);
  }
  if (phases.includes('fight_before')) { await revertOn(); await auditPhase('fight_before'); await revertOff(); }
  if (phases.includes('fight')) await auditPhase('fight');
  if (phases.includes('combo')) { await runCombo(4); await auditPhase('combo'); }
  if (phases.includes('combobanner')) {
    // 连击与 banner 同时在场：先把连击打出来，再手动放一条 banner（5 秒），立刻审计
    await runCombo(3);
    await b.evaluate('window.__SS.combat.banner("黑闪！", 5); true');
    await sleep(180);
    await auditPhase('combobanner');
  }
  if (phases.includes('domain')) {
    await b.evaluate('window.__SS.combat.forceSkill("void","gojo"); true');
    await sleep(1400);
    await auditPhase('domain');
    await sleep(2600);
  }
  if (phases.includes('clash')) {
    await b.evaluate('window.__SS.combat.forceSkill("shrine","sukuna"); true');
    await sleep(1600);
    await auditPhase('clash');
    await sleep(1600);
  }
  if (phases.includes('lowhp')) {
    await b.evaluate('(function(){var o={};o.silent=true;window.__SS.combat.applyDamage("gojo",1100,o);return 1})()');
    await sleep(700);
    await auditPhase('lowhp');
  }
  if (phases.includes('pause')) {
    await b.pressKey('KeyP');
    await sleep(900);
    await auditPhase('pause');
    await b.pressKey('KeyP');
    await sleep(700);
  }
  if (phases.includes('result')) {
    await b.evaluate('(function(){var o={};o.silent=true;window.__SS.combat.applyDamage("sukuna",99999,o);return 1})()');
    await sleep(5200);
    await auditPhase('result');
  }
  report.errors = b.errors.slice(0, 20);
} catch (e) { report.fatal = String(e && e.stack || e).slice(0, 500); }
finally { await b.close(); }

writeFileSync(outPrefix + '-report.json', JSON.stringify(report, null, 2));
const lines = [];
for (const ph of Object.keys(report.phases)) {
  const p = report.phases[ph];
  lines.push('[' + ph + '] 元素 ' + p.count + ' | 重叠 ' + p.overlaps.length + ' | 小字(渲染高<12) ' + p.small.length + ' | 小字号(<12px) ' + p.smallFont.length + ' | 低对比(<3) ' + p.lowContrast.length);
  for (const o of p.overlaps.slice(0, 10)) lines.push('    OVERLAP ' + o.a + ' × ' + o.b + ' = ' + o.ox + 'x' + o.oy + ' (area ' + o.area + ')');
  for (const s of p.small.slice(0, 10)) lines.push('    SMALL ' + (s.id || s.cls) + ' h=' + s.h + ' fs=' + s.fs + ' [' + s.txt + ']');
  for (const s of p.smallFont.slice(0, 14)) lines.push('    SMALLFONT ' + (s.id || s.cls) + ' fs=' + s.fs + ' h=' + s.h + ' [' + s.txt + ']');
  for (const c of p.lowContrast.slice(0, 10)) lines.push('    LOWCONTRAST ' + (c.id || c.cls) + ' ratio=' + c.contrast + ' text=' + c.textLum + ' bg=' + c.bgLum + ' [' + c.txt + ']');
}
console.log('=== HUD AUDIT ' + report.viewport + (mobile ? ' mobile' : '') + ' ===');
console.log(lines.join('\n'));
console.log('fatal=' + (report.fatal || 'none') + ' errors=' + JSON.stringify(report.errors));
