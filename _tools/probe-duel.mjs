/**
 * probe-duel.mjs —— 领域对决「术式同步」验收探针（domainduel 写域）
 *
 * 用法：
 *   node _tools/probe-duel.mjs                       # 默认 tmp/domainduel/dist.html，端口 9502
 *   node _tools/probe-duel.mjs --file tmp/domainduel/dist.html --port 9502 --trials 30 --no-shot
 *
 * 覆盖契约 §5 的全部验收项：
 *   0) 接线自检：__SS.duel 是模块实例、__SS.mech.duel 字段齐全、HOOKS.clash 已注册
 *   1) 窗口难度曲线：每回合周期 / 窗宽 / 停留时间(ms)
 *   2) 纯逻辑统计（暂停后固定 dt=1/60 直接驱动真例，真判定、真结算）
 *        · 无脑连点（每帧 light）→ 必须 30/30 输
 *        · 精确对齐（needle 在窗口内才按）→ 必须 >=28/30 赢
 *        · 早按 / 迟按 / 站着不动 → 必须输（对齐才是唯一赢法）
 *   3) 12s 上限分支：用 d.tune 临时把窗口收到 0（指针永远扫不到），覆盖
 *        |tug| >= 0.35 判负 与 |tug| < 0.35 双崩 两条分支
 *   4) 端到端（真实帧 + 真实按键注入 __INJECT.press）：
 *        双方 forceSkill 展开领域 → 对撞 → 连点输 / 精确赢 / 静止输
 *        并核对：败者扣血 CLASH_WIN_DMG*INCOMING_SCALE、burnoutT>0、state 回到 fight
 *   5) HUD 截图（1280x720 桌面 + 844x390 触屏低画质）+ DOM 读数
 *
 * 只读 __SS / __SS.mech / __SS.duel（模块自报），不读别的模块实现。
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes('--' + n);
const FILE = resolve(arg('file', 'tmp/domainduel/dist.html'));
const PORT = parseInt(arg('port', '9502'), 10);
const TRIALS = parseInt(arg('trials', '30'), 10);
const SHOT = !has('no-shot');
const URL = 'file:///' + FILE.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const OUT = { ok: false, checks: [], sections: {} };
const log = (...a) => console.log(...a);
function check(name, pass, detail) {
  OUT.checks.push({ name, pass: !!pass, detail });
  log((pass ? '  [PASS] ' : '  [FAIL] ') + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)));
}

// ---------------------------------------------------------------- 页面内脚本

/** 纯逻辑驱动：暂停后用固定 dt 直接推 __SS.duel（真例、真判定、真结算） */
const HARNESS = `((spec) => {
  const api = window.__SS.combat;
  const d = (window.__SS.duel || window.__DUEL);
  const DT = 1 / 60;
  const rows = [];
  // 探针侧的三角波预测（和模块同一套运动学；只用来做"早按"对照）
  function needleAt(s, ahead) {
    const v = 4 / s.period;
    let x = s.needle, dir = s.dir, remain = Math.max(0, ahead - (s.freeze > 0 ? s.freeze : 0));
    for (let g = 0; g < 12 && remain > 1e-6; g++) {
      const target = dir > 0 ? 1 : -1;
      const tHit = Math.abs(target - x) / v;
      if (tHit > remain) { x += dir * v * remain; remain = 0; }
      else { x = target; dir = -dir; remain -= tHit; }
    }
    return x;
  }
  for (let i = 0; i < spec.trials; i++) {
    api.reset();
    d.setSeed(spec.seed + i);
    d.begin();
    // 暂停态下主循环不再刷新 getSnapshot（它从 rig.state 拷贝），所以扣血证据读模块自报的实时 hp
    const s0 = d.debug();
    const hp0 = { gojo: s0.hp.gojo, sukuna: s0.hp.sukuna };
    let wasInside = false;
    let f = 0;
    let pressTotal = 0;
    const maxF = Math.ceil(12 * 60) + 60;
    while (d.active && f < maxF) {
      const s = d.debug();
      let press = false;
      if (spec.mode === 'mash') press = true;
      else if (spec.mode === 'perfect') press = s.needle >= s.lo && s.needle <= s.hi;
      else if (spec.mode === 'early') { const p = needleAt(s, spec.k * DT); press = p >= s.lo && p <= s.hi; }
      else if (spec.mode === 'late') press = wasInside && !(s.needle >= s.lo && s.needle <= s.hi);
      if (press) pressTotal++;
      wasInside = s.needle >= s.lo && s.needle <= s.hi;
      d.update(DT, { light: press, heavy: false, mouse: false });
      f++;
    }
    const s1 = d.debug();
    let reason = 'unknown';
    if (s1.sync >= 5) reason = 'sync5';
    else if (s1.miss >= 3) reason = 'miss3';
    else if (s1.tug >= 1) reason = 'tug+';
    else if (s1.tug <= -1) reason = 'tug-';
    else if (!d.active && s1.elapsed >= 11.9) reason = 'timeout';
    rows.push({
      i, winner: s1.winner, sync: s1.sync, miss: s1.miss, ignored: s1.ignored,
      elapsed: +s1.elapsed.toFixed(2), tug: +s1.tug.toFixed(3), frames: f,
      presses: pressTotal, reason,
      windowSeq: s1.windowSeq,
      hpDelta: { gojo: +(hp0.gojo - s1.hp.gojo).toFixed(1), sukuna: +(hp0.sukuna - s1.hp.sukuna).toFixed(1) },
      burnout: { gojo: +s1.burnout.gojo.toFixed(2), sukuna: +s1.burnout.sukuna.toFixed(2) }
    });
  }
  return { rows };
})`;

/** 12s 上限分支：冻结指针 + 把窗口挪到 [-1,1] 之外 → 没有 sync / miss，12s 内只剩 AI 推搡 */
const TIMEOUT_HARNESS = `((spec) => {
  const api = window.__SS.combat;
  const d = (window.__SS.duel || window.__DUEL);
  const T = d.tune;
  const out = [];
  const bak = { P0: T.PERIOD_START, P1: T.PERIOD_MIN };
  // 注意：不要用 api.setDifficulty —— 它内部 clamp 到 [0.4, 2.5] 且 Number(0)||1 → 0 会变回 1。
  // 这里直接写 ai.difficulty（推搡强度 = 0.26 * difficulty），跑完 api.reset() 会自动复位。
  function run(diff, label) {
    api.reset();
    d.setSeed(4242);
    d.begin();
    d._debugWindow(2, 3);
    api.ai.difficulty = diff;
    const DT = 1 / 60;
    let f = 0;
    while (d.active && f < 12 * 60 + 240) { d.update(DT, { light: false, heavy: false, mouse: false }); f++; }
    const s = d.debug();
    out.push({ label, diff, winner: s.winner, elapsed: +s.elapsed.toFixed(2), tug: +s.tug.toFixed(3), sync: s.sync, miss: s.miss, frames: f });
  }
  T.PERIOD_START = 1e9; T.PERIOD_MIN = 1e9;
  run(0, 'push-0.00');
  run(0.1, 'push-0.026/s');
  run(0.2, 'push-0.052/s');
  run(1, 'push-0.26/s');
  T.PERIOD_START = bak.P0; T.PERIOD_MIN = bak.P1;
  api.ai.difficulty = 1;
  return { rows: out };
})`;

/** 端到端：真实帧 + __INJECT 按键注入。mode = mash / perfect / idle */
const E2E_DRIVER = `((mode) => {
  window.__E2E = { mode, on: true, presses: 0, frames: 0, log: [] };
  const E = window.__E2E;
  function frame() {
    if (!E.on) return;
    const d = (window.__SS.duel || window.__DUEL);
    E.frames++;
    if (d && d.active) {
      if (mode === 'mash') { window.__INJECT.press('KeyJ'); E.presses++; }
      else if (mode === 'perfect') {
        if (d.needle >= d.lo && d.needle <= d.hi && !(d.lockT > 0)) { window.__INJECT.press('KeyJ'); E.presses++; }
      }
    } else { E.done = true; return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return true;
})`;

/** 真实领域展开：走 public api.forceSkill（播片用的强出招口），不碰内部 cb */
const OPEN_DOMAINS = `(() => {
  const api = window.__SS.combat;
  api.forceSkill('void', 'gojo');
  api.forceSkill('shrine', 'sukuna');
  return true;
})()`;

const E2E_STATE = `(() => {
  const api = window.__SS.combat;
  const s = api.getSnapshot();
  const d = (window.__SS.duel || window.__DUEL);
  const dbg = d && d.debug ? d.debug() : null;
  return {
    state: window.__SS.state,
    clashActive: !!s.clashActive,
    mode: s.mode,
    g: { hp: +s.gojo.hp.toFixed(1), burnout: +s.burnout.gojo.toFixed(2), domain: +s.gojo.domain.toFixed(1) },
    k: { hp: +s.sukuna.hp.toFixed(1), burnout: +s.burnout.sukuna.toFixed(2), domain: +s.sukuna.domain.toFixed(1) },
    duel: dbg ? { active: dbg.active, winner: dbg.winner, sync: dbg.sync, miss: dbg.miss, elapsed: +dbg.elapsed.toFixed(2), tug: +dbg.tug.toFixed(3), needle: +dbg.needle.toFixed(3) } : null,
    e2e: window.__E2E ? { frames: window.__E2E.frames, presses: window.__E2E.presses, done: !!window.__E2E.done } : null,
    hud: (() => {
      const el = document.getElementById('duel-hud');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const ax = el.querySelector('.dh-axis').getBoundingClientRect();
      const nd = el.querySelector('.dh-needle').getBoundingClientRect();
      const wn = el.querySelector('.dh-win').getBoundingClientRect();
      return {
        visible: cs.display !== 'none' && +cs.opacity > 0.05,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        axis: { w: Math.round(ax.width), h: Math.round(ax.height) },
        needleX: Math.round(nd.x), winX: Math.round(wn.x), winW: Math.round(wn.width),
        sync: el.querySelector('.dh-sync').textContent,
        crack: el.querySelector('.dh-ck').textContent,
        titlePx: getComputedStyle(el.querySelector('.dh-title')).fontSize,
        hintPx: getComputedStyle(el.querySelector('.dh-hint')).fontSize,
        status: el.querySelector('.dh-status').textContent,
        // 与旧面板 / 触屏控件的重叠面积（必须为 0）
        overlap: (() => {
          const mine = el.getBoundingClientRect();
          const out = {};
          ['#hud .clash-title', '#hud .clash-track', '#hud .clash-hint', '#hud .clash', '#touch-ui .t-joy', '#touch-ui .t-acts', '#touch-ui .t-util'].forEach((s) => {
            const t = document.querySelector(s);
            if (!t) return;
            const r = t.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;
            const w2 = Math.max(0, Math.min(mine.right, r.right) - Math.max(mine.left, r.left));
            const h2 = Math.max(0, Math.min(mine.bottom, r.bottom) - Math.max(mine.top, r.top));
            out[s.replace('#hud .clash', 'old').replace('#touch-ui ', 't')] = Math.round(w2 * h2);
          });
          return out;
        })()
      };
    })(),
    hint: (() => { const h = document.querySelector('#hud .clash .clash-hint'); return h ? h.textContent.trim() : null; })()
  };
})()`;

// ---------------------------------------------------------------- 主流程

const b = new Browser({ port: PORT, width: 1280, height: 720 });
try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(13000);
  const st0 = await b.evaluate('window.__SS && window.__SS.state');
  if (st0 !== 'fight') await b.evaluate('(() => { const e = document.getElementById("btn-skip-cine"); if (e) e.click(); return true; })()');
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight' || st === 'clash') break; }
  await b.evaluate('(() => { window.__SS.combat.setAiEnabled(false); return true; })()');
  await sleep(800);

  log('\n== 0. 接线自检 ==');
  const wiring = await b.evaluate(`(() => {
    const m = window.__SS.mech || {};
    const d = (window.__SS.duel || window.__DUEL);
    const need = ['needle', 'lo', 'hi', 'sync', 'miss', 'tug', 'round', 'debounce', 'active'];
    const dbg = d && d.debug ? d.debug() : null;
    return {
      state: window.__SS.state,
      quality: window.__SS.quality,
      hasDuel: !!d,
      isMine: !!(d && typeof d.debug === 'function' && dbg && typeof dbg.dwellMs === 'number'),
      iface: d ? ['active', 'tug', 'winner', 'elapsed', 'begin', 'push', 'update', 'resolve', 'reset'].filter(k => d[k] === undefined) : ['<no duel>'],
      mechKeys: Object.keys(m),
      duelFields: dbg ? need.filter(k => !(k in dbg)) : ['<no debug>'],
      clashHooks: (window.__SS.hooks && window.__SS.hooks.clash || []).length,
      hookCounts: window.__SS.hooks ? Object.keys(window.__SS.hooks).map(k => k + ':' + window.__SS.hooks[k].length).join(' ') : null
    };
  })()`);
  OUT.sections.wiring = wiring;
  log('  ' + JSON.stringify(wiring));
  check('__SS.duel 是 domainduel 实例', wiring.isMine, { hasDuel: wiring.hasDuel });
  check('DomainClash 接口齐全（缺项应为空）', wiring.iface.length === 0, wiring.iface);
  check('MECH_DEBUG.duel 字段齐全', wiring.duelFields.length === 0, wiring.duelFields);
  check('HOOKS.clash 已注册', wiring.clashHooks >= 1, wiring.clashHooks);

  log('\n== 1. 窗口难度曲线（Lead 决断：周期 1.6→1.12s，窗宽 0.30→0.18，末档停留 >=50ms）==');
  const curve = await b.evaluate(`(() => {
    const d = (window.__SS.duel || window.__DUEL);
    const rows = [];
    const bak = d.sync;
    for (let n = 0; n <= 5; n++) {
      d.sync = n;
      const period = d._period ? d._period() : null;
      const width = d._width ? d._width() : null;
      rows.push({ round: n, period: +period.toFixed(3), width: +width.toFixed(3), dwellMs: +d.dwellMs().toFixed(1), frames60: +(d.dwellMs() / 16.667).toFixed(2) });
    }
    d.sync = bak;
    return rows;
  })()`);
  OUT.sections.curve = curve;
  for (const r of curve) log('  round ' + r.round + ': period=' + r.period + 's width=' + r.width + ' 停留=' + r.dwellMs + 'ms (' + r.frames60 + ' 帧@60fps)');
  // 数值口径以 Lead 2026 决断为准：周期 1.6 → 1.12s、窗宽 0.30 → 0.18（末档停留 >= 50ms）
  check('周期 1.6 → 1.12s（Lead 批准的可玩性下限）', curve[0].period === 1.6 && curve[5].period === 1.12, { p0: curve[0].period, p5: curve[5].period });
  check('窗宽 0.30 → 0.18', curve[0].width === 0.3 && curve[5].width === 0.18, { w0: curve[0].width, w5: curve[5].width });
  check('首档停留 120ms 不变', Math.abs(curve[0].dwellMs - 120) < 0.5, curve[0].dwellMs);
  check('末档停留 >= 50ms（人类按点精度线之上）', curve[5].dwellMs >= 50, { dwellMs: curve[5].dwellMs, frames60: curve[5].frames60 });
  check('停留时间逐档单调收窄', curve.slice(0, 5).every((r, i, a) => i === 0 || r.dwellMs < a[i - 1].dwellMs), curve.slice(0, 5).map(r => r.dwellMs));

  log('\n== 2. 纯逻辑统计（暂停 + 固定 dt 直接驱动真例）==');
  await b.pressKey('Escape', 60);
  await sleep(700);
  const paused = await b.evaluate('window.__SS.state');
  check('游戏已暂停（主循环以 dt=0 空输入驱动，不干扰）', paused === 'paused', paused);

  const modes = [
    { name: 'MASH（每帧都按 light）', key: 'mash', mode: 'mash', trials: TRIALS, seed: 5000 },
    { name: 'PERFECT（指针在窗口内才按）', key: 'perfect', mode: 'perfect', trials: TRIALS, seed: 6000 },
    { name: 'IDLE（什么都不按）', key: 'idle', mode: 'idle', trials: TRIALS, seed: 7000 },
    { name: 'EARLY-1帧（提前 1 帧 = 同一帧内进位容差）', key: 'early1', mode: 'early', k: 1, trials: 10, seed: 8000 },
    { name: 'EARLY-2帧（提前 2 帧按）', key: 'early2', mode: 'early', k: 2, trials: 10, seed: 8050 },
    { name: 'EARLY-3帧（提前 3 帧按）', key: 'early3', mode: 'early', k: 3, trials: 10, seed: 8100 },
    { name: 'LATE-1帧（离开窗口后再按）', key: 'late', mode: 'late', trials: 10, seed: 8200 }
  ];
  OUT.sections.stats = {};
  for (const m of modes) {
    const spec = { mode: m.mode, trials: m.trials, seed: m.seed, k: m.k || 0 };
    const res = await b.evaluate(HARNESS + '(' + JSON.stringify(spec) + ')');
    const rows = res.rows;
    const wins = rows.filter(r => r.winner === 'gojo').length;
    const losses = rows.filter(r => r.winner === 'sukuna').length;
    const draws = rows.filter(r => r.winner === 'draw').length;
    const avg = (f) => +(rows.reduce((a, r) => a + f(r), 0) / rows.length).toFixed(2);
    const summary = {
      mode: m.mode, trials: rows.length, wins, losses, draws,
      avgSync: avg(r => r.sync), avgMiss: avg(r => r.miss), avgElapsed: avg(r => r.elapsed),
      avgTug: avg(r => r.tug), avgPresses: avg(r => r.presses), avgIgnored: avg(r => r.ignored),
      reasons: rows.reduce((a, r) => { a[r.reason] = (a[r.reason] || 0) + 1; return a; }, {}),
      sample: rows.slice(0, 3),
      firstHpDelta: rows[0].hpDelta, firstBurnout: rows[0].burnout
    };
    OUT.sections.stats[m.key] = summary;
    log('  ' + m.name + ' → 赢 ' + wins + ' / 输 ' + losses + ' / 双崩 ' + draws +
      '  avg(sync=' + summary.avgSync + ' miss=' + summary.avgMiss + ' elapsed=' + summary.avgElapsed + 's presses=' + summary.avgPresses + ' ignored=' + summary.avgIgnored + ')');
    log('      结算原因 ' + JSON.stringify(summary.reasons) + '  首局 hpΔ=' + JSON.stringify(rows[0].hpDelta) + ' burnout=' + JSON.stringify(rows[0].burnout));
  }
  const S = OUT.sections.stats;
  check('验收 · 连点 ' + TRIALS + '/' + TRIALS + ' 输（实测 ' + S.mash.losses + ' 输 / ' + S.mash.wins + ' 赢）', S.mash.losses === TRIALS && S.mash.wins === 0, S.mash.reasons);
  check('验收 · 精确 >=28/' + TRIALS + ' 赢（实测 ' + S.perfect.wins + ' 赢 / ' + S.perfect.losses + ' 输）', S.perfect.wins >= Math.min(28, TRIALS), { wins: S.perfect.wins, reasons: S.perfect.reasons });
  check('验收 · 静止必输（实测 ' + S.idle.losses + ' 输 / ' + S.idle.wins + ' 赢）', S.idle.losses === TRIALS, S.idle.reasons);
  check('容差 · 提前 1 帧（同一帧内进位）算对齐：全赢', S.early1.wins === 10, S.early1.reasons);
  check('对照 · 提前 2 帧按全输', S.early2.losses === 10 && S.early2.wins === 0, S.early2.reasons);
  check('对照 · 提前 3 帧按全输', S.early3.losses === 10 && S.early3.wins === 0, S.early3.reasons);
  check('对照 · 迟 1 帧按全输', S.late.losses === 10 && S.late.wins === 0, S.late.reasons);
  check('玩家输 = 扣血 + 熔断（连点样本）', S.mash.sample[0].hpDelta.gojo >= 32 && S.mash.sample[0].burnout.gojo > 0, { hpDelta: S.mash.sample[0].hpDelta, burnout: S.mash.sample[0].burnout });

  log('\n== 3. 12s 上限分支覆盖（临时把窗宽收到 0，只留 AI 推搡）==');
  const to = await b.evaluate(TIMEOUT_HARNESS + '({})');
  OUT.sections.timeout = to.rows;
  for (const r of to.rows) log('  ' + r.label + ' diff=' + r.diff + ' → winner=' + r.winner + ' elapsed=' + r.elapsed + 's tug=' + r.tug + ' sync=' + r.sync + ' miss=' + r.miss);
  const tDraw = to.rows.find(r => r.label === 'push-0.00');
  const tBand = to.rows.find(r => r.label === 'push-0.026/s');
  const tWeak = to.rows.find(r => r.label === 'push-0.052/s');
  const tStrong = to.rows.find(r => r.label === 'push-0.26/s');
  check('12s 上限 · 零推搡 → 双崩 resolve(null)', tDraw && tDraw.winner === 'draw' && tDraw.elapsed >= 11.9, tDraw);
  check('12s 上限 · |tug|<0.35（-0.31） → 双崩', tBand && tBand.winner === 'draw' && tBand.elapsed >= 11.9, tBand);
  check('12s 上限 · |tug|>=0.35（-0.62） → 判宿傩', tWeak && tWeak.winner === 'sukuna' && tWeak.elapsed >= 11.9, tWeak);
  check('12s 上限 · 强推搡 → 12s 前被推到底', tStrong && tStrong.winner === 'sukuna' && tStrong.elapsed < 12, tStrong);

  log('\n== 4. 端到端（真实帧 + __INJECT 真实按键）==');
  await b.pressKey('Escape', 60);
  await sleep(700);
  const resumed = await b.evaluate('window.__SS.state');
  check('已恢复战斗状态', resumed === 'fight' || resumed === 'clash', resumed);
  await b.evaluate('(() => { window.__SS.combat.setAiEnabled(false); return true; })()');

  OUT.sections.e2e = {};
  async function runE2E(name, mode, opts) {
    const o = opts || {};
    await b.evaluate('(() => { window.__E2E = null; return true; })()');
    await b.evaluate('(() => { window.__SS.combat.reset(); window.__SS.combat.setAiEnabled(false); return true; })()');
    await sleep(700);
    const before = await b.evaluate(E2E_STATE);
    await b.evaluate(OPEN_DOMAINS);
    let opened = null;
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const s = await b.evaluate(E2E_STATE);
      if (s.clashActive) { opened = s; break; }
    }
    if (!opened) {
      OUT.sections.e2e[name] = { error: '领域对撞没有开始', before };
      check(name + '：领域对撞已开始', false, before);
      return null;
    }
    log('  ' + name + '：对撞开始（' + JSON.stringify({ mode: opened.mode, gojoDomain: opened.g.domain, sukunaDomain: opened.k.domain }) + '）');
    await b.evaluate(E2E_DRIVER + '(' + JSON.stringify(mode) + ')');
    let shot = null;
    let mid = null;
    const t0 = Date.now();
    const maxMs = o.maxMs || 22000;
    while (Date.now() - t0 < maxMs) {
      await sleep(120);
      const s = await b.evaluate(E2E_STATE);
      if (!mid && s.duel && (s.duel.sync + s.duel.miss) >= 1) {
        mid = s;
        if (o.screenshot && SHOT) shot = await b.screenshot('shots/domainduel/' + o.screenshot);
      }
      if (!s.clashActive && s.duel && !s.duel.active) {
        await b.evaluate('(() => { if (window.__E2E) window.__E2E.on = false; return true; })()');
        await sleep(500);
        const after = await b.evaluate(E2E_STATE);
        const r = { before, opened, mid, after, ms: Date.now() - t0, screenshot: shot };
        OUT.sections.e2e[name] = r;
        log('  ' + name + ' 结算：' + JSON.stringify({ winner: after.duel.winner, sync: after.duel.sync, miss: after.duel.miss, elapsed: after.duel.elapsed, state: after.state, clashActive: after.clashActive, gojoHp: after.g.hp, sukunaHp: after.k.hp, gojoBurnout: after.g.burnout, sukunaBurnout: after.k.burnout, frames: after.e2e && after.e2e.frames, presses: after.e2e && after.e2e.presses }));
        if (o.expectWinner) check(name + ' → winner=' + o.expectWinner, after.duel.winner === o.expectWinner, { winner: after.duel.winner });
        return r;
      }
    }
    await b.evaluate('(() => { if (window.__E2E) window.__E2E.on = false; return true; })()');
    const after = await b.evaluate(E2E_STATE);
    OUT.sections.e2e[name] = { error: '超时未结算', after };
    check(name + '：' + maxMs + 'ms 内结算', false, after.duel);
    return null;
  }

  const e2eMash = await runE2E('e2e-mash', 'mash', { screenshot: 'duel-desktop-mash.png', expectWinner: 'sukuna', maxMs: 15000 });
  if (e2eMash) {
    const a = e2eMash.after;
    const dmg = +(e2eMash.before.g.hp - a.g.hp).toFixed(1);
    check('E2E 连点：玩家扣血 ' + dmg + ' / 熔断 ' + a.g.burnout + 's', dmg >= 30 && a.g.burnout > 0, { hp: [e2eMash.before.g.hp, a.g.hp], burnout: a.g.burnout });
    check('E2E 连点：state 回到 fight 且 clashActive=false', a.state !== 'clash' && a.clashActive === false, { state: a.state, clashActive: a.clashActive });
  }
  const e2ePerfect = await runE2E('e2e-perfect', 'perfect', { screenshot: 'duel-desktop-perfect.png', expectWinner: 'gojo', maxMs: 25000 });
  if (e2ePerfect) {
    const a = e2ePerfect.after;
    const dmg = +(e2ePerfect.before.k.hp - a.k.hp).toFixed(1);
    check('E2E 精确：宿傩扣血 ' + dmg + ' / 熔断 ' + a.k.burnout + 's', dmg >= 30 && a.k.burnout > 0, { hp: [e2ePerfect.before.k.hp, a.k.hp], burnout: a.k.burnout });
    check('E2E 精确：同步数 = 5', a.duel.sync === 5, a.duel);
  }
  const e2eIdle = await runE2E('e2e-idle', 'idle', { expectWinner: 'sukuna', maxMs: 20000 });
  if (e2eIdle) {
    check('E2E 静止：判负用时 ' + e2eIdle.after.duel.elapsed + 's（< 12s）', e2eIdle.after.duel.elapsed < 12, e2eIdle.after.duel);
  }
  const hudOk = await b.evaluate(E2E_STATE);
  OUT.sections.hud = hudOk.hud;
  if (hudOk.hud) {
    log('  HUD：' + JSON.stringify(hudOk.hud));
    check('HUD 有同步轴 / 同步计数 / 裂纹计数', /同步 ×\d/.test(hudOk.hud.sync) && /裂纹 \d\/3/.test(hudOk.hud.crack) && hudOk.hud.axis.w > 100, hudOk.hud);
    check('HUD 字号 >= 13px', parseFloat(hudOk.hud.titlePx) >= 13 && parseFloat(hudOk.hud.hintPx) >= 13, { title: hudOk.hud.titlePx, hint: hudOk.hud.hintPx });
    // 用「对撞进行中」那一帧量重叠（旧面板只在 clashActive 时可见）
    const midHud = OUT.sections.e2e['e2e-perfect'] && OUT.sections.e2e['e2e-perfect'].mid ? OUT.sections.e2e['e2e-perfect'].mid.hud : null;
    const doo = (midHud && midHud.overlap) || {};
    const dooBad = Object.keys(doo).filter(k => doo[k] > 0);
    check('桌面同步轴与旧「領域対決」面板零重叠', Object.keys(doo).length >= 3 && dooBad.length === 0, doo);
  } else {
    check('HUD DOM 存在', false, null);
  }
  // 这句文案现在由 body.html 维护（Lead 的写域），本模块不再运行时改写它
  const openedHint = OUT.sections.e2e['e2e-mash'] && OUT.sections.e2e['e2e-mash'].opened ? OUT.sections.e2e['e2e-mash'].opened.hint : null;
  check('开打时旧提示行文案已是新机制（不含"连点"）', !!openedHint && openedHint.indexOf('连点') < 0 && /亮窗|对齐/.test(openedHint), openedHint);

  // ---- 5. 手机档（844x390, low 画质, 触屏层）----
  log('\n== 5. 手机档 844x390 + ?touch=1（低画质）==');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await b.send('Page.navigate', { url: URL + '?touch=1' });
  await sleep(14000);
  const st2 = await b.evaluate('window.__SS && window.__SS.state');
  if (st2 !== 'fight') await b.evaluate('(() => { const e = document.getElementById("btn-skip-cine"); if (e) e.click(); return true; })()');
  for (let i = 0; i < 90; i++) { await sleep(400); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight' || st === 'clash') break; }
  const mobileQ = await b.evaluate('({ quality: window.__SS.quality, w: innerWidth, h: innerHeight, touch: document.documentElement.classList.contains("is-touch") })');
  OUT.sections.mobile = mobileQ;
  log('  ' + JSON.stringify(mobileQ));
  check('手机档画质降级为 low', mobileQ.quality === 'low', mobileQ);
  await b.evaluate('(() => { window.__SS.combat.setAiEnabled(false); window.__SS.combat.reset(); return true; })()');
  await sleep(700);
  await b.evaluate(OPEN_DOMAINS);
  let mOpen = false;
  for (let i = 0; i < 40; i++) { await sleep(150); const s = await b.evaluate('window.__SS.snap'); if (s.clashActive) { mOpen = true; break; } }
  check('手机档领域对撞已开始', mOpen, null);
  if (mOpen) {
    await b.evaluate(E2E_DRIVER + '("perfect")');
    for (let i = 0; i < 60; i++) {
      await sleep(120);
      const s = await b.evaluate(E2E_STATE);
      if (s.duel && s.duel.sync >= 1) break;
      if (s.duel && !s.duel.active) break;
    }
    await sleep(120);
    if (SHOT) await b.screenshot('shots/domainduel/duel-mobile-844x390.png');
    const mh = await b.evaluate(E2E_STATE);
    OUT.sections.mobileHud = mh.hud;
    log('  手机档 HUD：' + JSON.stringify(mh.hud));
    log('  手机档 duel：' + JSON.stringify(mh.duel));
    check('手机档 HUD 可见', !!mh.hud && mh.hud.visible && mh.hud.rect.h > 20, mh.hud && mh.hud.rect);
    check('手机档 HUD 字号 >= 13px', !!mh.hud && parseFloat(mh.hud.titlePx) >= 13 && parseFloat(mh.hud.hintPx) >= 13, mh.hud && { t: mh.hud.titlePx, h: mh.hud.hintPx });
    check('手机档同步轴宽度 >= 400px @844', !!mh.hud && mh.hud.axis.w >= 400, mh.hud && mh.hud.axis);
    const mo = (mh.hud && mh.hud.overlap) || {};
    const moBad = Object.keys(mo).filter(k => mo[k] > 0);
    check('手机档同步轴与旧面板/触屏控件零重叠', moBad.length === 0, mo);
    await b.evaluate('(() => { if (window.__E2E) window.__E2E.on = false; return true; })()');
  }

  OUT.errors = b.errors.slice(0, 8);
  const failed = OUT.checks.filter(c => !c.pass);
  OUT.ok = failed.length === 0 && OUT.errors.length === 0;
  log('\n== 汇总 ==');
  log('  检查项 ' + OUT.checks.length + ' 项，失败 ' + failed.length + ' 项' + (failed.length ? '：' + failed.map(f => f.name).join(' | ') : ''));
  log('  页面错误 ' + JSON.stringify(OUT.errors));
} catch (e) {
  log('FATAL ' + String(e && e.stack || e).slice(0, 900));
} finally {
  try { await b.close(); } catch (e) {}
}
log('\n__RESULT__' + JSON.stringify(OUT));
process.exit(OUT.ok ? 0 : 1);
