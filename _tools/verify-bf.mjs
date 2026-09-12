/**
 * verify-bf.mjs —— 契约 §6「黑闪」独立验证（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 契约验收（§6）：随机按 V 500 次 → 0；每帧按 V → 0；命中帧按 V → 成功；±1 成功；±3 失败；
 *   一次黑闪伤害 >= 同招普通命中的 2.4 倍；ce 扣 8；失败不打断操作。
 * 本脚本的判定只用可观测数据：
 *   - __SS.stats.blackFlash（主循环计数）
 *   - __SS.mech().blackFlash（契约 §1.3 的 {F,P,delta,ok,ce,chaos,streak,mul,hits,fails}）
 *   - 事件流（tap）：hit 事件的 amount / blackFlash 字段
 *   - hp 掉血所在帧
 * 帧精度：按键在页面内 rAF 里合成（main.js 监听 window，read e.code）。
 *   实测「第 t 帧 rAF 里 dispatch → 第 t+1 帧 gameFrame 读到」，见 verify-boot.mjs 输出。
 * 用法：node _tools/verify-bf.mjs [--file tmp/blackflash/dist.html] [--port 9513] [--mobile]
 */
import { Rig, arg, flag, sleep, DEFAULT_FILE } from './verify-lib.mjs';

const file = arg('file', DEFAULT_FILE);
const port = parseInt(arg('port', '9513'), 10);
const mobile = flag('mobile');
const rig = new Rig({ port, file, name: 'blackflash' + (mobile ? '-mobile' : ''), mobile });

const CODE_BF = [
  'window.__BF = function () { try { var m = window.__V.mech(); return m.blackFlash || {}; } catch (e) { return { err: String(e) }; } }; true',
].join('\n');
const WATCH = '({f: S.combat.frame, hp: S.snap.sukuna.hp, ce: S.snap.gojo.ce,' +
  ' pv: S.combat.pressFrame.v, pl: S.combat.pressFrame.light, now: performance.now(), bf: window.__BF()})';
const CODE_STAND = [
  '(() => { const S = window.__SS; const g = S.gojo; const sk = S.sukuna;',
  '  const sp = sk.root.position; g.root.position.set(sp.x, 0, sp.z + 1.6); g.faceTo(sp.x, sp.z, true);',
  '  return { gz: +g.root.position.z.toFixed(2) }; })()',
].join('\n');

/** 一次「出拳 + 在某帧按 V」的试验。offJ 相对当前帧的出拳帧，offV=null 表示不按 V */
async function trial(offJ, offV) {
  await rig.reset(true);
  await rig.watch(WATCH);
  const t0 = await rig.ev('(() => { const t = window.__V.t;' +
    ' window.__V.sched(t + ' + offJ + ', "KeyJ");' +
    (offV === null ? '' : ' window.__V.sched(t + ' + offV + ', "KeyV");') +
    ' return t; })()');
  await sleep(950);
  const r = await rig.take();
  const s = r.samples;
  const hp0 = s.length ? s[0].hp : null;
  const hitIdx = s.findIndex(x => hp0 !== null && x.hp < hp0 - 0.5);
  const hit = hitIdx > 0 ? s[hitIdx] : null;
  const hitEv = r.events.filter(e => e.type === 'hit');
  const bf = await rig.ev('window.__BF()');
  return {
    t0, hitTick: hit ? hit.t : null, hitFrame: hit ? hit.f : null,
    hpBefore: hp0, hpAfter: hit ? hit.hp : null,
    amount: hitEv.length ? hitEv[0].amount : null,
    isBFEvent: hitEv.length ? !!hitEv[0].blackFlash : null,
    ceBefore: s.length ? s[0].ce : null, ceAfter: hit ? hit.ce : null,
    bf, events: r.events, errs: r.errs, samples: s.length,
  };
}

try {
  await rig.start();
  console.log('产物 ' + file + '  启动 ' + JSON.stringify(rig.bootInfo));
  rig.check('产物可启动并进入 fight', rig.bootInfo.state === 'fight' || rig.bootInfo.state === 'clash', 'state=' + rig.bootInfo.state);
  await rig.ev(CODE_BF);
  const bf0 = await rig.ev('window.__BF()');
  console.log('mech.blackFlash 初始 = ' + JSON.stringify(bf0));
  rig.check('契约 §1.3 MECH_DEBUG.blackFlash 已注册', !!(bf0 && Object.keys(bf0).length), JSON.stringify(bf0));
  const need = ['F', 'P', 'delta', 'ok', 'ce', 'chaos', 'streak', 'mul', 'hits', 'fails'];
  const missing = need.filter(k => !(bf0 && k in bf0));
  rig.check('blackFlash 自报字段齐全（契约 §1.3）', missing.length === 0, '缺 ' + JSON.stringify(missing));
  if (!(bf0 && Object.keys(bf0).length)) { console.log('模块未落地，跳过后续'); }
  await rig.ev(CODE_STAND);
  await sleep(600);

  const statsBefore = await rig.ev('window.__SS.stats.blackFlash');

  /* ---------- 1. 校准：出拳 → 命中落在第几帧 ---------- */
  const cal = await trial(3, null);
  console.log('校准: 出拳帧=' + (cal.t0 + 3) + ' 命中帧(t)=' + cal.hitTick + ' 命中 gameFrame=' + cal.hitFrame + ' amount=' + cal.amount + ' hp ' + cal.hpBefore + '->' + (cal.hpAfter === null ? '-' : cal.hpAfter.toFixed(1)));
  const dtick = (cal.hitTick !== null) ? (cal.hitTick - (cal.t0 + 3)) : null;
  rig.check('校准：轻击能命中（拿到命中帧间距）', dtick !== null, 'Δ帧=' + dtick + ' amount=' + cal.amount);

  /* ---------- 2. 扫帧：V 按在命中帧前后 ---------- */
  const trials = [];
  if (dtick !== null) {
    for (const k of [-3, -2, -1, 0, 1, 2, 3]) {
      const offV = 3 + dtick - 1 + k;
      const tr = await trial(3, offV);
      trials.push({ k, offV, delta: tr.bf && tr.bf.delta, ok: tr.bf && tr.bf.ok, streak: tr.bf && tr.bf.streak,
        F: tr.bf && tr.bf.F, P: tr.bf && tr.bf.P, hitTick: tr.hitTick, hitFrame: tr.hitFrame,
        amount: tr.amount, isBFEvent: tr.isBFEvent, mul: tr.bf && tr.bf.mul, ce: tr.bf && tr.bf.ce,
        hp: [tr.hpBefore, tr.hpAfter], errs: tr.errs });
      console.log('  k=' + k + ' offV=' + offV + ' | 判定 F=' + (tr.bf && tr.bf.F) + ' P=' + (tr.bf && tr.bf.P) +
        ' delta=' + (tr.bf && tr.bf.delta) + ' ok=' + (tr.bf && tr.bf.ok) + ' streak=' + (tr.bf && tr.bf.streak) +
        ' mul=' + (tr.bf && tr.bf.mul) + ' ce=' + (tr.bf && tr.bf.ce) + ' | 命中 tick=' + tr.hitTick + ' f=' + tr.hitFrame + ' amount=' + tr.amount + ' bf事件=' + tr.isBFEvent);
      await sleep(tr.bf && tr.bf.ok ? 3400 : 1400);
    }
  }
  const judged = trials.filter(t => t.delta !== null && t.delta !== undefined);
  console.log('扫帧结果: ' + JSON.stringify(trials.map(t => ({ k: t.k, delta: t.delta, ok: t.ok, streak: t.streak }))));
  const okOnes = judged.filter(t => t.ok);
  const failOnes = judged.filter(t => !t.ok);
  rig.check('扫帧：至少一次同步成功（|delta| <= 1）', okOnes.some(t => Math.abs(t.delta) <= 1), '成功集合=' + JSON.stringify(okOnes.map(t => t.delta)));
  rig.check('扫帧：|delta| >= 3 必须失败', failOnes.filter(t => Math.abs(t.delta) >= 3).length === judged.filter(t => Math.abs(t.delta) >= 3).length,
    '|delta|>=3 的判定=' + JSON.stringify(judged.filter(t => Math.abs(t.delta) >= 3).map(t => ({ delta: t.delta, ok: t.ok, streak: t.streak }))));
  rig.check('扫帧：判定与 |delta| 自洽（ok 只出现在 |delta| <= 2）', okOnes.every(t => Math.abs(t.delta) <= 2), '成功的 delta 集合=' + JSON.stringify(okOnes.map(t => t.delta)));
  const succ = okOnes.find(t => t.hp && t.hp[0] !== null && t.hp[1] !== null);
  const norm = judged.find(t => !t.ok && t.hp && t.hp[0] !== null && t.hp[1] !== null);
  if (succ && norm) {
    // 事件里的 amount 是 Math.round 后的整数（普通 26×0.1=2.6 显示 3），倍率必须用 hp 真实差值算
    const dSucc = succ.hp[0] - succ.hp[1];
    const dNorm = norm.hp[0] - norm.hp[1];
    console.log('伤害（hp 真值）: 黑闪 ' + succ.hp[0] + '->' + succ.hp[1] + ' = ' + dSucc.toFixed(3) + ' | 普通 ' + norm.hp[0] + '->' + norm.hp[1] + ' = ' + dNorm.toFixed(3));
    console.log('伤害（事件取整）: 黑闪 amount=' + succ.amount + ' 普通 amount=' + norm.amount + ' 取整比值=' + (succ.amount / norm.amount).toFixed(2));
    rig.check('§6 黑闪伤害 >= 同招普通命中 2.4 倍（用 hp 真值）', dNorm > 0 && dSucc >= 2.4 * dNorm, '真值比=' + (dSucc / dNorm).toFixed(3) + ' (' + dSucc.toFixed(2) + '/' + dNorm.toFixed(2) + ')；取整后 ' + succ.amount + '/' + norm.amount + '=' + (succ.amount / norm.amount).toFixed(2));
  } else {
    rig.check('§6 黑闪伤害 >= 同招普通命中 2.4 倍（用 hp 真值）', false, '缺成功样本或普通样本 succ=' + JSON.stringify(succ && succ.hp) + ' norm=' + JSON.stringify(norm && norm.hp));
  }
  if (succ) {
    rig.check('§6 成功时事件流带 blackFlash 标记', succ.isBFEvent === true, 'hit 事件 blackFlash=' + succ.isBFEvent);
    rig.check('§6 黑闪命中后 stats.blackFlash +1', (await rig.ev('window.__SS.stats.blackFlash')) > statsBefore, 'before=' + statsBefore + ' after=' + await rig.ev('window.__SS.stats.blackFlash'));
  }

  /* ---------- 3. 反例：随机时刻乱按 V（不攻击）500 次 ---------- */
  const rnd = [];
  let seed = 12345;
  for (let i = 0; i < 500; i++) { seed = (seed * 1103515245 + 12345) % 2147483648; rnd.push(Math.floor(i * 1.9 + (seed % 3))); }
  const stA = await rig.ev('window.__SS.stats.blackFlash');
  await rig.reset(true);
  await rig.watch(WATCH);
  await rig.ev('window.__V.burst("KeyV", ' + JSON.stringify(rnd) + ')');
  await sleep(7200);
  const run1 = await rig.take();
  const stB = await rig.ev('window.__SS.stats.blackFlash');
  const bfB = await rig.ev('window.__BF()');
  console.log('随机乱按 500 次 V（不攻击）: stats.blackFlash ' + stA + ' -> ' + stB + ' | mech=' + JSON.stringify(bfB));
  rig.check('§6 随机按 V 500 次 → 黑闪 0 次', stB - stA === 0, 'stats delta=' + (stB - stA) + ' 采样帧=' + run1.samples.length);

  /* ---------- 4. 反例：每帧按 V（连点）同时连续出拳 ---------- */
  const stC = await rig.ev('window.__SS.stats.blackFlash');
  await rig.reset(true);
  await rig.watch(WATCH);
  const tf = await rig.tick();
  await rig.mash('KeyV', tf + 3, tf + 520);
  for (let i = 0; i < 25; i++) await rig.sched(tf + 6 + i * 20, 'KeyJ');
  await sleep(4200);
  const run2 = await rig.take();
  const stD = await rig.ev('window.__SS.stats.blackFlash');
  const hitCount = run2.events.filter(e => e.type === 'hit').length;
  const bfEvents = run2.events.filter(e => e.type === 'blackflash' || (e.type === 'hit' && e.blackFlash)).length;
  console.log('每帧按 V + 连续出拳: stats.blackFlash ' + stC + ' -> ' + stD + ' | 命中事件=' + hitCount + ' 黑闪标记=' + bfEvents);
  rig.check('§6 每帧按 V（连点）+ 连续攻击 → 黑闪 0 次', stD - stC === 0, 'stats delta=' + (stD - stC) + ' 命中=' + hitCount + ' 黑闪事件=' + bfEvents);
  rig.check('§6 连点期间仍然能打出普通命中（不打断操作）', hitCount > 0, '命中事件=' + hitCount);

  /* ---------- 5. 触屏：窗口放宽（mobile 才跑边界断言） ---------- */
  if (mobile) {
    console.log('触屏模式：本段断言 |delta| = 2 也应成功（契约 §6 触屏 +1 帧）');
    let okAt2 = null;
    if (dtick !== null) {
      for (const k of [-2, -1, 0, 1, 2]) {
        const tr = await trial(3, 3 + dtick - 1 + k);
        console.log('  触屏 k=' + k + ' delta=' + (tr.bf && tr.bf.delta) + ' ok=' + (tr.bf && tr.bf.ok) + ' streak=' + (tr.bf && tr.bf.streak));
        if (tr.bf && tr.bf.ok && Math.abs(tr.bf.delta) === 2) okAt2 = tr.bf;
        await sleep(tr.bf && tr.bf.ok ? 3400 : 1400);
      }
    }
    rig.check('§6 触屏窗口放宽（|delta|=2 也能同步）', !!okAt2, okAt2 ? 'delta=2 ok=true' : '没有采到 |delta|=2 的成功样本');
  }

  rig.check('全流程无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
} catch (e) {
  console.log('FATAL ' + (e && e.stack || e));
  rig.check('脚本未抛错', false, String((e && e.message) || e));
} finally {
  await rig.finish();
}