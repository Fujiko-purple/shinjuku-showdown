/**
 * verify-lib.mjs —— 独立验证（task-6 / verifier）共用脚手架
 * ----------------------------------------------------------------------------
 * 设计原则（来自 reviews/13-mechanics-contract.md §2 与 verifier 任务书）：
 *   1. **只看可观测行为**：window.__SS、DOM、截图、键盘输入。
 *      验证者不去读实现代码判断对错，也不修改 src/** 任何一个字节。
 *   2. **帧精度**：CDP 的 Input.dispatchKeyEvent 到不了「±1 帧」精度，
 *      所以按键走「页面内 rAF 里 window.dispatchEvent(new KeyboardEvent(...))」。
 *      src/mobile.js:274 本来就是这套写法（合成键盘事件），main.js:81 在 window 上
 *      监听且只读 e.code，所以这条路是被生产代码验证过的。
 *   3. **零依赖**：只用 _tools/cdp.mjs + Node 22 内置模块。
 *
 * 页面内 agent（window.__V）：
 *   - V.t        每个 rAF +1 的帧计数（≈ 游戏帧；agent 的 rAF 在游戏 rAF 之后注册，
 *                所以同一帧里「游戏先更新、我再采样」——采样到的是本帧结束状态）
 *   - V.watch(s) 每帧把表达式结果推进 samples（表达式里可用 S=window.__SS、V=window.__V）
 *   - V.events   包一层 combat.getSnapshot()，把 snap.events 原样抄一份（不吞事件）
 *   - V.sched / V.mash / V.hold / V.release   帧调度按键
 *   - V.scanMotion(frames,cb)   DOM 运动扫描：找出 style 在动/值在变的元素（找自建 HUD 用）
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve, dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';

export { sleep };

export function arg(name, dflt) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}
export function flag(name) {
  return process.argv.slice(2).includes('--' + name);
}

export const DEFAULT_FILE = 'dist/新宿决战.html';
export const ASSET_DIR = '_tools/verify-assets';
export const SHOT_DIR = 'shots/verifier';

/** 页面内 agent 源码。装一次，幂等。 */
const AGENT_SRC = String.raw`(() => {
  if (window.__V && window.__V.v === 3) return 'exists';
  var V = {
    v: 3,
    t: 0,
    samples: [],
    events: [],
    acts: [],
    watchFn: null,
    watchSrc: null,
    maxSamples: 120000,
    maxEvents: 8000,
    errs: [],
    tap: 'none'
  };
  // ---- 1) 事件流 tap：包一层 getSnapshot，把 snap.events 抄一份，绝不清空/不拦截 ----
  // 注意：snap.events 其实就是 cb.events 这个活数组的引用，一帧内可能被 getSnapshot 读多次
  // （main.js 每帧一次 + 探针的 S.snap 也一次），所以必须按「帧号 + 已抄长度」去重，
  // 否则同一个事件会被抄成 2 份，看起来像游戏在双重触发。
  try {
    var api = window.__SS && window.__SS.combat;
    if (api && typeof api.getSnapshot === 'function' && !api.__vTapped) {
      var orig = api.getSnapshot;
      var evFrame = -1, evCopied = 0;
      api.getSnapshot = function () {
        var s = orig.apply(this, arguments);
        try {
          var cf = api.frame === undefined ? -1 : api.frame;
          if (cf !== evFrame) { evFrame = cf; evCopied = 0; }
          if (s && s.events && s.events.length > evCopied && V.events.length < V.maxEvents) {
            for (var i = evCopied; i < s.events.length; i++) {
              var e = s.events[i];
              V.events.push({ ft: V.t, f: cf, type: e.type, skill: e.skill, amount: e.amount,
                side: e.side, target: e.target, heavy: e.heavy, guarded: e.guarded,
                blackFlash: e.blackFlash, winner: e.winner, tug: e.tug });
            }
            evCopied = s.events.length;
          }
        } catch (e2) { /* 抄事件失败不能影响游戏 */ }
        return s;
      };
      api.__vTapped = true;
      V.tap = 'getSnapshot';
    }
  } catch (e) { V.tap = 'err:' + String(e); }

  // ---- 2) 按键注入（合成 KeyboardEvent，和 mobile.js 同一套路） ----
  V.kd = function (code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: code, key: code, bubbles: true, cancelable: true }));
  };
  V.ku = function (code) {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: code, key: code, bubbles: true, cancelable: true }));
  };
  V.press = function (code) { V.kd(code); V.ku(code); };
  /** 契约里写的 __INJECT 若存在就用它；不存在就走合成事件（并记录用了哪条路） */
  V.pressAny = function (code) {
    var inj = window.__INJECT;
    if (inj && typeof inj.press === 'function') { inj.press(code); if (inj.release) inj.release(code); V.tapKey = 'inject'; return 'inject'; }
    V.press(code); V.tapKey = 'synth'; return 'synth';
  };

  // ---- 3) 帧调度 ----
  V.sched = function (at, code, kind) { V.acts.push({ at: at, code: code, kind: kind || 'press', done: false }); };
  V.mash = function (code, from, to) { V.acts.push({ at: from, until: to, code: code, kind: 'press', every: 1, done: false }); };
  V.hold = function (code) { V.acts.push({ at: V.t, code: code, kind: 'down', done: false }); };
  V.release = function (code) { V.acts.push({ at: V.t, code: code, kind: 'up', done: false }); };
  V.clearActs = function () { V.acts.length = 0; };
  /** 成批按键：offsets 是相对当前帧的偏移数组（随机时刻乱按用） */
  V.burst = function (code, offsets) {
    var t = V.t;
    for (var i = 0; i < offsets.length; i++) V.acts.push({ at: t + offsets[i], code: code, kind: 'press', done: false });
    return t;
  };

  // ---- 4) 采样 ----
  V.watch = function (src) {
    V.watchSrc = src;
    V.watchFn = src ? new Function('S', 'V', 'return (' + src + ');') : null;
    return 'ok';
  };
  V.reset = function (keepT) {
    V.samples.length = 0; V.events.length = 0; V.acts.length = 0; V.errs.length = 0;
    if (!keepT) V.t = 0;
    return V.t;
  };
  V.take = function () {
    return { t: V.t, samples: V.samples.splice(0, V.samples.length), events: V.events.splice(0, V.events.length), errs: V.errs };
  };

  // ---- 5) DOM 运动扫描：找出「style 在动」的元素（自建 HUD 的指针/窗口/血条） ----
  V.scanMotion = function (frames, cb) {
    var all = Array.prototype.slice.call(document.querySelectorAll('*'));
    var before = all.map(function (el) {
      var cs = getComputedStyle(el);
      return { el: el, style: el.getAttribute('style') || '', w: cs.width, x: cs.left, tf: cs.transform, op: cs.opacity };
    });
    var n = 0;
    var step = function () {
      n++;
      if (n < frames) { requestAnimationFrame(step); return; }
      var out = [];
      for (var i = 0; i < before.length; i++) {
        var b = before[i], el = b.el;
        var cs2 = getComputedStyle(el);
        var raw = el.getAttribute('style') || '';
        if (raw !== b.style || cs2.width !== b.w || cs2.left !== b.x || cs2.transform !== b.tf || cs2.opacity !== b.op) {
          out.push({
            tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 80),
            text: String(el.textContent || '').slice(0, 40), style: raw.slice(0, 200),
            now: (cs2.transform + '|' + cs2.width + '|' + cs2.opacity).slice(0, 160)
          });
        }
      }
      cb(out);
    };
    requestAnimationFrame(step);
    return all.length;
  };
  /** 找出所有叶子元素里含指定文字的（模块自建 DOM 的定位方式） */
  V.findByText = function (needle) {
    var all = document.querySelectorAll('*');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length) continue;
      var tx = (el.textContent || '').trim();
      if (tx && tx.indexOf(needle) >= 0) {
        var r = el.getBoundingClientRect();
        out.push({ tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 60), text: tx.slice(0, 40),
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
      }
    }
    return out;
  };
  /** 契约 §1.3 的 mech 出口兼容层：实现是 getter（对象）还是方法都能读 */
  V.mech = function () {
    try { var m = window.__SS.mech; return typeof m === 'function' ? m() : (m || {}); }
    catch (e) { return {}; }
  };
  /** 列出所有 id（DOM 体检用） */
  V.ids = function () {
    var out = [];
    var all = document.querySelectorAll('[id]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      out.push({ id: el.id, tag: el.tagName, vis: r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' });
    }
    return out;
  };

  // ---- 6) 主循环：先采样/按键，再排下一帧 ----
  var loop = function () {
    V.t++;
    if (V.watchFn && V.samples.length < V.maxSamples) {
      try { V.samples.push(Object.assign({ t: V.t }, V.watchFn(window.__SS, V))); }
      catch (e) { if (V.errs.length < 20) V.errs.push('watch:' + String(e).slice(0, 200)); }
    }
    for (var i = 0; i < V.acts.length; i++) {
      var a = V.acts[i];
      if (a.done) continue;
      if (a.every) {
        if (V.t >= a.at && V.t <= a.until) V.press(a.code);
        else if (V.t > a.until) a.done = true;
      } else if (V.t >= a.at) {
        if (a.kind === 'press') V.press(a.code); else if (a.kind === 'down') V.kd(a.code); else V.ku(a.code);
        a.done = true;
      }
    }
    requestAnimationFrame(loop);
  };
  window.__V = V;
  requestAnimationFrame(loop);
  return 'ok';
})()`;

export class Rig {
  /**
   * @param {object} o
   *   port   CDP 端口（verifier 用 9510+，每个脚本错开）
   *   file   产物路径（默认 dist/新宿决战.html）
   *   name   报告名（决定 JSON 输出名）
   *   width/height  视口（mobile 默认 844x390）
   *   mobile 触摸模拟 + html.is-touch
   */
  constructor(o = {}) {
    this.port = o.port || 9510;
    this.file = o.file || DEFAULT_FILE;
    this.name = o.name || 'verify';
    this.width = o.width || (o.mobile ? 844 : 1280);
    this.height = o.height || (o.mobile ? 390 : 720);
    this.mobile = !!o.mobile;
    this.shots = o.shots || join(SHOT_DIR, this.name);
    this.url = fileUrl(this.file);
    this.b = null;
    this.results = [];
    this.t0 = Date.now();
    this.notes = [];
    this.bootInfo = null;
  }

  /** 结果收集：细节一律写字符串 + 数字，禁止「应该/大概」 */
  check(name, pass, detail) {
    const rec = { name, pass: !!pass, detail: String(detail === undefined ? '' : detail) };
    this.results.push(rec);
    console.log((rec.pass ? 'PASS ' : 'FAIL ') + name + (rec.detail ? '  | ' + rec.detail : ''));
    return rec.pass;
  }
  note(s) { this.notes.push(String(s)); console.log('NOTE ' + s); }

  /** 启动 → 打开产物 → 跳过播片 → 等到 fight → 关 AI → 装 agent */
  async start() {
    if (!existsSync(resolve(this.file))) throw new Error('找不到产物 ' + this.file);
    const b = new Browser({ port: this.port, width: this.width, height: this.height });
    this.b = b;
    await b.launch();
    await b.newPage();
    if (this.mobile) {
      // 手机端：触摸模拟（mobile.js 判 ("ontouchstart" in window) || maxTouchPoints>0）
      await b.send('Emulation.setDeviceMetricsOverride', {
        width: this.width, height: this.height, deviceScaleFactor: 2, mobile: true,
        screenOrientation: { type: 'landscapePrimary', angle: 90 },
      });
      await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    await b.send('Page.navigate', { url: this.url });
    // 等 loading 结束（基线实测 9~13s，给 45s 余量）
    let loaded = false;
    for (let i = 0; i < 90; i++) {
      await sleep(500);
      const ld = await b.evaluate("(() => { const e = document.getElementById('loading'); return !!(e && e.classList.contains('hidden')); })()");
      if (ld) { loaded = true; break; }
    }
    this.loaded = loaded;
    // 跳过开场播片（有按钮且可见就点）
    await b.evaluate("(() => { const s = document.getElementById('btn-skip-cine'); if (s && s.offsetParent !== null) { s.click(); return 'clicked'; } return 'no-btn'; })()");
    await this.waitState(['fight', 'clash'], 90000);
    await this.safeAi(false);
    await this.agent();
    if (this.mobile) {
      // 契约要求手机端以 html.is-touch 为准；触摸模拟下 mobile.js 自己会加，这里兜底
      await b.evaluate("(() => { document.documentElement.classList.add('is-touch'); if (!window.__TOUCH) window.__TOUCH = { on: true, mx: 0, mz: 0, camX: 0, camY: 0 }; return true; })()");
    }
    this.bootInfo = await b.evaluate("(() => { const S = window.__SS || {}; return { state: S.state, hasSS: !!S, quality: S.quality, keys: Object.keys(S).join(','), isTouch: document.documentElement.classList.contains('is-touch'), hasInject: !!window.__INJECT, hasTouch: !!window.__TOUCH, ua: navigator.userAgent.slice(0, 60), w: innerWidth, h: innerHeight, tap: window.__V.tap }; })()");
    return this;
  }

  async safeAi(on) {
    try {
      await this.b.evaluate("(() => { const c = window.__SS && window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(" + (on ? 'true' : 'false') + "); return true; })()");
      return true;
    } catch (e) { return false; }
  }

  async waitState(list, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let st = null;
      try { st = await this.b.evaluate('window.__SS && window.__SS.state'); } catch (e) { /* 页面可能在忙 */ }
      if (list.includes(st)) return st;
      await sleep(300);
    }
    return null;
  }

  async agent() {
    const r = await this.b.evaluate(AGENT_SRC);
    if (r !== 'ok' && r !== 'exists') throw new Error('agent 安装失败: ' + r);
    return r;
  }

  /** 注入共享页面工具集 _tools/verify-assets/page-helpers.js（幂等） */
  async loadHelpers() {
    const src = readFileSync(resolve(ASSET_DIR, 'page-helpers.js'), 'utf8');
    const r = await this.b.evaluate(src);
    if (r !== 'ok' && r !== 'exists') throw new Error('page-helpers 注入失败: ' + r);
    return r;
  }

  ev(expr) { return this.b.evaluate(expr); }
  keys(code, ms = 60) { return this.b.pressKey(code, ms); }

  /* ---- 帧调度封装（都走页面内 agent，帧精度） ---- */
  reset(keepT = false) { return this.b.evaluate('window.__V.reset(' + (keepT ? 'true' : 'false') + ')'); }
  watch(src) { return this.b.evaluate('window.__V.watch(' + JSON.stringify(src) + ')'); }
  sched(at, code, kind = 'press') { return this.b.evaluate('window.__V.sched(' + at + ',' + JSON.stringify(code) + ',' + JSON.stringify(kind) + ')'); }
  mash(code, from, to) { return this.b.evaluate('window.__V.mash(' + from + ',' + JSON.stringify(code) + ',' + to + ')'); }
  hold(code) { return this.b.evaluate('window.__V.hold(' + JSON.stringify(code) + ')'); }
  release(code) { return this.b.evaluate('window.__V.release(' + JSON.stringify(code) + ')'); }
  clearActs() { return this.b.evaluate('window.__V.clearActs()'); }
  take() { return this.b.evaluate('window.__V.take()'); }
  tick() { return this.b.evaluate('window.__V.t'); }

  /** 采样 ms 毫秒，返回 {t, samples, events, errs} */
  async sample(src, ms) {
    await this.reset(true);
    await this.watch(src);
    await sleep(ms);
    return this.take();
  }

  /** 等页面内表达式为真 */
  async waitFor(expr, timeoutMs = 15000, stepMs = 100) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let v = null;
      try { v = await this.b.evaluate(expr); } catch (e) { /* ignore */ }
      if (v) return v;
      await sleep(stepMs);
    }
    return null;
  }

  async shot(name) {
    const p = join(this.shots, name.endsWith('.png') ? name : name + '.png');
    mkdirSync(dirname(resolve(p)), { recursive: true });
    await this.b.screenshot(p);
    console.log('SHOT ' + p);
    return p;
  }

  errors() { return this.b ? this.b.errors.slice(0, 8) : []; }

  async finish() {
    const secs = ((Date.now() - this.t0) / 1000).toFixed(1);
    const pass = this.results.filter(r => r.pass).length;
    const fail = this.results.length - pass;
    console.log('');
    console.log('===== ' + this.name + ' 结果 ' + pass + '/' + this.results.length + ' PASS, ' + fail + ' FAIL (' + secs + 's) =====');
    for (const r of this.results) if (!r.pass) console.log('  FAIL ' + r.name + '  | ' + r.detail);
    const errs = this.errors();
    if (errs.length) console.log('页面错误: ' + JSON.stringify(errs));
    try {
      mkdirSync(ASSET_DIR, { recursive: true });
      writeFileSync(join(ASSET_DIR, this.name + '.json'), JSON.stringify({
        name: this.name, file: this.file, url: this.url, mobile: this.mobile,
        viewport: [this.width, this.height], boot: this.bootInfo,
        results: this.results, notes: this.notes, pageErrors: errs, seconds: Number(secs),
      }, null, 2));
    } catch (e) { console.log('写 JSON 失败 ' + e); }
    if (this.b) await this.b.close();
    return { pass, fail, results: this.results };
  }
}

/* ------------------------- 小工具：统计 ------------------------- */

export function stats(arr) {
  if (!arr.length) return { n: 0 };
  const a = arr.slice().sort((x, y) => x - y);
  const sum = a.reduce((s, v) => s + v, 0);
  const q = (p) => a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)))];
  return {
    n: a.length, min: +a[0].toFixed(3), max: +a[a.length - 1].toFixed(3),
    avg: +(sum / a.length).toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3),
    sum: +sum.toFixed(3),
  };
}
/** 相邻样本里某字段第一次变化的帧号（t 是 agent 帧计数） */
export function firstChangeAt(samples, key, from) {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1][key], b = samples[i][key];
    if (a !== undefined && b !== undefined && Math.abs(b - a) > 1e-9 && samples[i].t >= (from || 0)) return samples[i].t;
  }
  return null;
}
export { Browser };

export function fileUrl(p) {
  const abs = resolve(p).replace(/\\/g, '/');
  return 'file:///' + abs.split('/').map(encodeURIComponent).join('/');
}
