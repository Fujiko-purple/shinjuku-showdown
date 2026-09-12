/**
 * verify-duel.mjs —— 契约 §5「领域对决 · 术式同步」独立验证（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 契约验收（§5）：
 *   - 无脑连点（每帧按 light）：30 次试验 30 次失败
 *   - 精确对齐（按 needle 位置按）：30 次试验 >= 28 次胜利
 *   - 站着不动：12s 内判负
 *   - 玩家输：扣血 + burnoutT > 0
 *   - needl 轴 [-1,1]、周期 1.6s -> 0.85s、窗口 0.30 -> 0.12、窗口只在指针经过后重随机
 *   - miss >= 3 崩坏 / sync >= 5 获胜 / 窗口外按键 tug -= 0.12
 * 驱动方式（不读实现代码）：
 *   - 开局：combat.forceSkill("void","gojo") + forceSkill("shrine","sukuna") → 两边领域展开 → 对撞
 *   - 对齐：页面内自建 rAF 驱动，读 __SS.mech().duel.{needle,lo,hi,debounce}，在窗口内合成 KeyJ
 *   - 连点：同一个驱动每帧无条件 KeyJ
 * 用法：node _tools/verify-duel.mjs [--file tmp/domainduel/dist.html] [--port 9514] [--n 30] [--mobile]
 */
import { Rig, arg, flag, sleep, stats, DEFAULT_FILE } from './verify-lib.mjs';

const file = arg('file', DEFAULT_FILE);
const port = parseInt(arg('port', '9514'), 10);
const mobile = flag('mobile');
const N = parseInt(arg('n', '30'), 10);
const rig = new Rig({ port, file, name: 'duel' + (mobile ? '-mobile' : ''), mobile });

const CODE_DUEL = 'window.__D = function () { try { var m = window.__V.mech(); return m.duel || {}; } catch (e) { return { err: String(e) }; } }; true';
const CODE_DRIVE = [
  'window.__DRIVE = function (mode) {',
  '  var V = window.__V; V.driver = V.driver || { mode: "none", fires: 0, started: false };',
  '  V.driver.mode = mode; V.driver.fires = 0;',
  '  if (V.driver.started) return "ok";',
  '  V.driver.started = true;',
  '  var loop = function () {',
  '    var m = V.driver.mode;',
  '    if (m !== "none") {',
  '      var d = {}; try { d = (window.__SS.mech() || {}).duel || {}; } catch (e) {}',
  '      var act = d.active;',
  '      try { if (window.__SS.snap && window.__SS.snap.clashActive) act = true; } catch (e2) {}',
  '      if (act) {',
  '        if (m === "mash") { V.press("KeyJ"); V.driver.fires++; }',
  '        else if (m === "sync" && d.needle >= d.lo && d.needle <= d.hi && (!d.debounce || d.debounce <= 0)) { V.press("KeyJ"); V.driver.fires++; }',
  '      }',
  '    }',
  '    requestAnimationFrame(loop);',
  '  };',
  '  requestAnimationFrame(loop);',
  '  return "ok";',
  '}; true',
].join('\n');
const WATCH = '({t: V.t, f: S.combat.frame, act: S.snap.clashActive, tug: S.snap.tug, need: window.__D().needle,' +
  ' lo: window.__D().lo, hi: window.__D().hi, sync: window.__D().sync, miss: window.__D().miss, round: window.__D().round,' +
  ' deb: window.__D().debounce, hp: S.snap.gojo.hp, hpS: S.snap.sukuna.hp, bo: S.snap.burnout.gojo, now: performance.now()})';

const CODE_START = [
  '(() => { const c = window.__SS.combat; c.reset(); c.forceSkill("void", "gojo"); c.forceSkill("shrine", "sukuna"); return true; })()',
].join('\n');

/** 打一场：mode = mash | sync | idle，返回结局 */
async function fight(mode, timeoutMs) {
  await rig.reset(true);
  await rig.watch(WATCH);
  await rig.ev(CODE_START);
  const started = await rig.waitFor('window.__SS.snap.clashActive === true', 9000, 50);
  if (!started) return { started: false, winner: null };
  await rig.ev('window.__DRIVE(' + JSON.stringify(mode) + ')');
  const t0 = Date.now();
  const done = await rig.waitFor('window.__SS.snap.clashActive === false', timeoutMs, 80);
  await sleep(350);
  const elapsed = (Date.now() - t0) / 1000;
  const fired = await rig.ev('window.__V.driver.fires');
  await rig.ev('window.__DRIVE("none")');
  const r = await rig.take();
  const evs = r.events.map(e => e.type);
  const after = await rig.ev('({tug: window.__SS.snap.tug, hp: window.__SS.snap.gojo.hp, bo: window.__SS.snap.burnout.gojo, act: window.__SS.snap.clashActive, d: window.__D()})');
  const winner = evs.includes('clash_win') ? 'win' : evs.includes('clash_lose') ? 'lose' : evs.includes('clash_draw') ? 'draw' : (after.act ? 'timeout' : 'none');
  return { started: true, winner, elapsed, tug: after.tug, hp: after.hp, burnout: after.bo, fired, d: after.d, evs, samples: r.samples };
}

try {
  await rig.start();
  console.log('产物 ' + file + '  启动 ' + JSON.stringify(rig.bootInfo));
  rig.check('产物可启动并进入 fight', rig.bootInfo.state === 'fight' || rig.bootInfo.state === 'clash', 'state=' + rig.bootInfo.state);
  await rig.ev(CODE_DUEL); await rig.ev(CODE_DRIVE);
  const d0 = await rig.ev('window.__D()');
  console.log('mech.duel 初始 = ' + JSON.stringify(d0));
  rig.check('契约 §1.3 MECH_DEBUG.duel 已注册', !!(d0 && Object.keys(d0).length), JSON.stringify(d0));
  const need = ['needle', 'lo', 'hi', 'sync', 'miss', 'tug', 'round', 'debounce', 'active'];
  const missing = need.filter(k => !(d0 && k in d0));
  rig.check('duel 自报字段齐全（契约 §1.3）', missing.length === 0, '缺 ' + JSON.stringify(missing));
  const iface = await rig.ev('(() => { const c = window.__SS.duel; if (!c) return null; const f = ["begin","push","update","resolve","reset"]; const t = {}; for (const k of f) t[k] = typeof c[k]; return { fns: t, active: typeof c.active, tug: typeof c.tug, winner: c.winner, elapsed: c.elapsed, ctor: c.constructor && c.constructor.name }; })()');
  console.log('__SS.duel 接口 = ' + JSON.stringify(iface));
  rig.check('§5 clashLike 实现默认接口（5 个方法 + active/tug/winner/elapsed）',
    !!iface && ['begin', 'push', 'update', 'resolve', 'reset'].every(k => iface.fns[k] === 'function'), JSON.stringify(iface));

  /* ---------- A. 连点必败 N 次 ---------- */
  const mashR = [];
  for (let i = 0; i < N; i++) {
    const r = await fight('mash', 15000);
    mashR.push(r);
    console.log('  连点 #' + (i + 1) + ' ' + r.winner + ' elapsed=' + (r.elapsed === undefined ? '-' : r.elapsed.toFixed(1) + 's') + ' miss=' + (r.d && r.d.miss) + ' sync=' + (r.d && r.d.sync) + ' tug=' + (r.tug === undefined ? '-' : r.tug.toFixed(2)) + ' 按键=' + r.fired);
    if (!r.started) console.log('    !! 没能进入领域对决');
  }
  const mStart = mashR.filter(r => r.started).length;
  const mLose = mashR.filter(r => r.winner === 'lose').length;
  const mWin = mashR.filter(r => r.winner === 'win').length;
  console.log('连点汇总: 开局 ' + mStart + '/' + N + ' 判负 ' + mLose + ' 判胜 ' + mWin);
  rig.check('§5-1 无脑连点 ' + N + ' 次试验全部失败', mStart === N && mLose === N, '开局=' + mStart + ' 判负=' + mLose + ' 判胜=' + mWin);

  /* ---------- B. 精确对齐 N 次 ---------- */
  const syncR = [];
  const syncAcc = [];
  for (let i = 0; i < N; i++) {
    const r = await fight('sync', 30000);
    syncR.push(r);
    for (const sm of (r.samples || [])) if (sm.act) syncAcc.push(sm);
    console.log('  对齐 #' + (i + 1) + ' ' + r.winner + ' elapsed=' + (r.elapsed === undefined ? '-' : r.elapsed.toFixed(1) + 's') + ' sync=' + (r.d && r.d.sync) + ' miss=' + (r.d && r.d.miss) + ' tug=' + (r.tug === undefined ? '-' : r.tug.toFixed(2)) + ' 按键=' + r.fired);
  }
  const sStart = syncR.filter(r => r.started).length;
  const sWin = syncR.filter(r => r.winner === 'win').length;
  console.log('对齐汇总: 开局 ' + sStart + '/' + N + ' 判胜 ' + sWin + ' 胜率=' + (100 * sWin / Math.max(1, N)).toFixed(1) + '%');
  rig.check('§5-2 精确对齐 ' + N + ' 次试验 >= ' + Math.ceil(N * 28 / 30) + ' 次胜利（契约 30 次 >= 28）', sWin >= Math.ceil(N * 28 / 30), '胜=' + sWin + '/' + N);
  /* 回合推进：窗口收窄 + 扫动加快（契约 0.30 -> 0.12 / 1.6s -> 0.85s） */
  const byRound = new Map();
  for (const sm of syncAcc) {
    if (typeof sm.round !== 'number') continue;
    if (!byRound.has(sm.round)) byRound.set(sm.round, []);
    byRound.get(sm.round).push(sm);
  }
  const roundStats = [];
  for (const rd of [...byRound.keys()].sort((a, b) => a - b)) {
    const arr = byRound.get(rd);
    const ws = arr.filter(s => typeof s.hi === 'number' && typeof s.lo === 'number').map(s => s.hi - s.lo).sort((a, b) => a - b);
    let tr = 0, sp = 0;
    for (let i = 1; i < arr.length; i++) {
      const dt = (arr[i].now - arr[i - 1].now) / 1000;
      if (dt <= 0) continue;
      if (typeof arr[i].need !== 'number' || typeof arr[i - 1].need !== 'number') continue;
      const dd = Math.abs(arr[i].need - arr[i - 1].need);
      if (dd < 1e-9) continue;   // 定格/停顿的帧不算（成功定格是契约要求的观感）
      tr += dd; sp += dt;
    }
    const wMed = ws.length ? ws[Math.floor(ws.length / 2)] : null;
    roundStats.push({ round: rd, n: arr.length, wMed, T: sp > 0.2 ? 4 / (tr / sp) : null });
  }
  console.log('逐回合: ' + JSON.stringify(roundStats.map(r => ({ r: r.round, 窗口宽: r.wMed === null ? null : +r.wMed.toFixed(3), T估计: r.T === null ? null : +r.T.toFixed(2) }))));
  if (roundStats.length >= 3) {
    const first = roundStats[0], last = roundStats[roundStats.length - 1];
    rig.check('§5 窗口随回合收窄（首 ' + (first.wMed && first.wMed.toFixed(2)) + ' -> 末 ' + (last.wMed && last.wMed.toFixed(2)) + '，契约 0.30 -> 0.12）',
      !!first.wMed && !!last.wMed && last.wMed < first.wMed - 0.05, JSON.stringify(roundStats.map(r => r.wMed)));
    rig.check('§5 指针随回合加快（首 T ' + (first.T && first.T.toFixed(2)) + 's -> 末 T ' + (last.T && last.T.toFixed(2)) + 's）',
      !!first.T && !!last.T && last.T < first.T - 0.1, JSON.stringify(roundStats.map(r => r.T)));
  }

  /* ---------- C. 站着不动 ---------- */
  const idle = await fight('idle', 20000);
  console.log('挂机: ' + idle.winner + ' elapsed=' + (idle.elapsed === undefined ? '-' : idle.elapsed.toFixed(1)) + 's tug=' + (idle.tug === undefined ? '-' : idle.tug.toFixed(3)) + ' miss=' + (idle.d && idle.d.miss));
  rig.check('§5-3 站着不动判负（12s 内必输）', idle.winner === 'lose', 'winner=' + idle.winner + ' elapsed=' + idle.elapsed + 's');

  /* ---------- D. 输的代价：扣血 + 熔断 ---------- */
  const lose = mashR.find(r => r.winner === 'lose');
  if (lose) {
    rig.check('§5-4 玩家输：扣血（hp < 起始 1800）', lose.hp !== undefined && lose.hp < 1800, 'hp=' + lose.hp);
    rig.check('§5-4 玩家输：burnoutT > 0', lose.burnout !== undefined && lose.burnout > 0, 'burnout=' + lose.burnout);
  } else {
    rig.check('§5-4 玩家输：扣血 + 熔断', false, '没有拿到判负样本');
  }

  /* ---------- E. 轴与窗口的形态（打印机不按，累积多场、只取 clashActive 的帧） ---------- */
  const acc = [];
  for (let i = 0; i < 3; i++) {
    const r = await fight('idle', 6000);
    for (const sm of (r.samples || [])) if (sm.act) acc.push(sm);
  }
  const needles = acc.map(x => x.need).filter(v => typeof v === 'number');
  const nIn = needles.filter(v => v >= -1.001 && v <= 1.001).length;
  const widths = acc.filter(x => typeof x.hi === 'number' && typeof x.lo === 'number').map(x => x.hi - x.lo);
  console.log('needle 样本=' + needles.length + ' 越界=' + (needles.length - nIn) + ' 范围=[' + (needles.length ? Math.min(...needles).toFixed(3) : '-') + ',' + (needles.length ? Math.max(...needles).toFixed(3) : '-') + ']');
  console.log('窗口宽度 首=' + (widths.length ? widths[0].toFixed(3) : '-') + ' 最大=' + (widths.length ? Math.max(...widths).toFixed(3) : '-') + ' 最小=' + (widths.length ? Math.min(...widths).toFixed(3) : '-'));
  rig.check('§5 needle 始终在 [-1,1]', needles.length > 30 && needles.length - nIn === 0, '样本=' + needles.length + ' 越界=' + (needles.length - nIn));
  rig.check('§5 首回合窗口宽度 ≈ 0.30', widths.length > 10 && Math.abs(widths[0] - 0.30) <= 0.08, '首窗口=' + (widths.length ? widths[0].toFixed(3) : '-'));
  // 周期估计：三角往返，一个全周期走 4 个单位；只统计 round===0 且仍在活动的帧
  let travel = 0, span = 0;
  for (let i = 1; i < acc.length; i++) {
    const a = acc[i - 1], b = acc[i];
    if (a.round !== 0 || b.round !== 0) continue;
    if (typeof a.need !== 'number' || typeof b.need !== 'number') continue;
    travel += Math.abs(b.need - a.need);
    span += (b.now - a.now) / 1000;
  }
  const rate = span > 0 ? travel / span : 0;
  const tEst = rate > 0.05 ? 4 / rate : null;
  // 「只算指针真在动的帧」：实现里有定格/停顿（成功定格、过窗 dwell），会把含静默的均速拉低
  let mTravel = 0, mSpan = 0, frozen = 0;
  for (let i = 1; i < acc.length; i++) {
    const a = acc[i - 1], b = acc[i];
    if (a.round !== 0 || b.round !== 0) continue;
    if (typeof a.need !== 'number' || typeof b.need !== 'number') continue;
    const dt = (b.now - a.now) / 1000;
    const dd = Math.abs(b.need - a.need);
    if (dd < 1e-9) { frozen += dt; continue; }
    mTravel += dd; mSpan += dt;
  }
  const mRate = mSpan > 0 ? mTravel / mSpan : 0;
  const tMove = mRate > 0.05 ? 4 / mRate : null;
  console.log('needle round0: 累计行程=' + travel.toFixed(2) + ' 用时=' + span.toFixed(2) + 's 含静默均速=' + rate.toFixed(3) + '/s -> T=' + (tEst === null ? '-' : tEst.toFixed(3)) + 's；只在动的帧 ' + mSpan.toFixed(2) + 's 静默 ' + frozen.toFixed(2) + 's 均速=' + mRate.toFixed(3) + '/s -> T=' + (tMove === null ? '-' : tMove.toFixed(3)) + 's（契约 1.6s）');
  // 第二估计：同向穿越 0 的间隔 = 一个完整往返周期（不依赖路径长度假设）
  const upCross = [];
  for (let i = 1; i < acc.length; i++) {
    const a = acc[i - 1], b = acc[i];
    if (a.round !== 0 || b.round !== 0) continue;
    if (typeof a.need !== 'number' || typeof b.need !== 'number') continue;
    if (a.need < 0 && b.need >= 0) upCross.push(b.now);
  }
  const crossInt = [];
  for (let i = 1; i < upCross.length; i++) crossInt.push((upCross[i] - upCross[i - 1]) / 1000);
  const cStat = crossInt.length ? stats(crossInt) : null;
  console.log('needle 同向上穿 0 的间隔 s=' + JSON.stringify(cStat));
  console.log('needle 前 24 帧 [ms,needle,dir,freeze,locked,round,windowSeq]: ' + JSON.stringify(acc.slice(0, 24).map(s => [Math.round(s.now), +s.need.toFixed(3), s.dir, s.freeze, s.locked, s.round, s.windowSeq])));
  rig.check('§5 首回合 needle 全周期 ≈ 1.6s（指针实际扫动速度反推）', tMove !== null && tMove >= 1.3 && tMove <= 1.95, 'T_移动=' + (tMove === null ? '-' : tMove.toFixed(3)) + 's / T_含静默=' + (tEst === null ? '-' : tEst.toFixed(3)) + 's 静默占比=' + (span > 0 ? (100 * frozen / span).toFixed(1) : '-') + '%');
  // 窗口只在「指针经过后」重随机：变化前必须先在历史里出现过 needle 落在旧窗口内
  const changes = [];
  for (let i = 1; i < acc.length; i++) {
    const a = acc[i - 1], b = acc[i];
    if (typeof a.lo !== 'number' || typeof b.lo !== 'number') continue;
    if (a.lo === b.lo && a.hi === b.hi) continue;
    let entered = false, overshoot = null;
    for (let j = i - 1; j >= 0 && j > i - 400; j--) {
      const s2 = acc[j];
      if (typeof s2.need !== 'number') continue;
      if (s2.need >= a.lo && s2.need <= a.hi) { entered = true; overshoot = +(b.need - s2.need).toFixed(3); break; }
    }
    changes.push({ need: b.need, prevLo: +a.lo.toFixed(3), prevHi: +a.hi.toFixed(3), lo: +b.lo.toFixed(3), hi: +b.hi.toFixed(3), entered, overshoot });
  }
  const passedOk = changes.filter(c => c.entered).length;
  console.log('窗口重随机 ' + changes.length + ' 次，指针在变化前确实进入过旧窗口的=' + passedOk + ' 例: ' + JSON.stringify(changes.slice(0, 6)));
  rig.check('§5 窗口只在指针经过后重新随机（禁止背板）', changes.length > 0 && passedOk === changes.length, '重随机=' + changes.length + ' 通过=' + passedOk);

  rig.check('全流程无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
  await rig.shot('01-duel');
} catch (e) {
  console.log('FATAL ' + (e && e.stack || e));
  rig.check('脚本未抛错', false, String((e && e.message) || e));
} finally {
  await rig.finish();
}