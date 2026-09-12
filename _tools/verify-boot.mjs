/**
 * verify-boot.mjs —— 验证脚手架自检 + 可观测面盘点（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 这个脚本不评任何机制的成败，只回答四个工程问题：
 *   1. 私有产物能不能起来（state=fight、无页面错误）？
 *   2. 契约 §1.3 的 MECH_DEBUG 出口 / __SS.mech() / __SS.duel / __SS.hooks 到底存不存在？
 *   3. 「页面内 rAF 合成按键」的帧对齐偏移是多少（Lead 说是 +1 帧）？按键真能打出命中吗？
 *   4. 基线帧时间是多少（后面魔虚罗出场帧率对比要拿它当参照）？
 * 用法：
 *   node _tools/verify-boot.mjs [--file dist/新宿决战.html] [--port 9510] [--mobile]
 */
import { Rig, arg, flag, sleep, stats, DEFAULT_FILE } from './verify-lib.mjs';

const file = arg('file', DEFAULT_FILE);
const port = parseInt(arg('port', '9510'), 10);
const mobile = flag('mobile');
const rig = new Rig({ port, file, name: 'boot' + (mobile ? '-mobile' : ''), mobile });

/* 页面侧代码一律先拼成字符串（本文件里不写模板字面量，避免和生成器冲突） */
const CODE_STAND = [
  '(() => {',
  '  const S = window.__SS; const g = S.gojo; const sk = S.sukuna;',
  '  const sp = sk.root.position;',
  '  g.root.position.set(sp.x, 0, sp.z + 1.6);',
  '  g.faceTo(sp.x, sp.z, true);',
  '  return { gx: +g.root.position.x.toFixed(2), gz: +g.root.position.z.toFixed(2) };',
  '})()',
].join('\n');
const CODE_INV = [
  '(() => {',
  '  const S = window.__SS;',
  '  let mech = {}; try { mech = S.mech || {}; } catch (e) { mech = { err: String(e) }; }',
  '  let hooks = {}; try { const h = S.hooks || {}; for (const k in h) hooks[k] = h[k].length; } catch (e) { hooks = { err: String(e) }; }',
  '  let duel = null; try { const d = S.duel; if (d) duel = { ctor: d.constructor && d.constructor.name, keys: Object.keys(d), active: d.active, tug: d.tug, elapsed: d.elapsed }; } catch (e) { duel = { err: String(e) }; }',
  '  let mh = null; try { mh = S.mahoraga ? { type: typeof S.mahoraga, keys: Object.keys(S.mahoraga) } : null; } catch (e) { mh = { err: String(e) }; }',
  '  let bf = null; try { bf = S.blackFlash ? { type: typeof S.blackFlash, keys: Object.keys(S.blackFlash) } : null; } catch (e) { bf = { err: String(e) }; }',
  '  return { mechKeys: Object.keys(mech), mech: mech, hooks: hooks, duel: duel, mahoraga: mh, blackFlash: bf,',
  '    combatKeys: Object.keys(S.combat || {}), frame: S.combat && S.combat.frame, pressFrame: S.combat && S.combat.pressFrame,',
  '    textDuel: window.__V.findByText(String.fromCharCode(21516,27493)).length,',
  '    textMaho: window.__V.findByText(String.fromCharCode(39764,34394,32599)).length,',
  '    textV: window.__V.findByText(String.fromCharCode(21610)).length, idCount: window.__V.ids().length };',
  '})()',
].join('\n');

try {
  await rig.start();
  const bi = rig.bootInfo;
  console.log('产物 ' + file);
  console.log('启动 ' + JSON.stringify(bi));
  rig.check('产物可启动并进入 fight', !!(bi && (bi.state === 'fight' || bi.state === 'clash')), 'state=' + (bi && bi.state));
  rig.check('无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
  rig.check('契约 §1.2 __INJECT 存在', !!(bi && bi.hasInject), 'hasInject=' + (bi && bi.hasInject));
  rig.check('契约 §1.3 __SS.mech() 存在', !!(bi && bi.keys.includes('mech')), 'keys=' + (bi && bi.keys));
  rig.check('__SS.hooks 存在', !!(bi && bi.keys.includes('hooks')), '');
  rig.check('agent 事件 tap 已挂', !!(bi && bi.tap === 'getSnapshot'), 'tap=' + (bi && bi.tap));

  /* ---------- 1. 可观测面盘点 ---------- */
  const inv = await rig.ev(CODE_INV);
  console.log('盘点 ' + JSON.stringify(inv, null, 1).slice(0, 2200));
  rig.note('可观测面 ' + JSON.stringify(inv).slice(0, 1400));

  /* ---------- 2. 帧对齐 + 合成按键真的能命中 ---------- */
  const near = await rig.ev(CODE_STAND);
  rig.note('站位 ' + JSON.stringify(near));
  await sleep(800);
  const watch = '({f: S.combat.frame, pf: S.combat.pressFrame.light, hp: S.snap.sukuna.hp, now: performance.now()})';
  await rig.reset(true);
  await rig.watch(watch);
  const t0 = await rig.tick();
  await rig.sched(t0 + 20, 'KeyJ');
  await sleep(2500);
  const run = await rig.take();
  const s = run.samples;
  console.log('采样 ' + s.length + ' 帧, agent errs=' + JSON.stringify(run.errs).slice(0, 300));
  let pressAt = null;
  for (let i = 1; i < s.length; i++) { if (s[i].pf !== s[i - 1].pf && s[i].pf > 0) { pressAt = s[i]; break; } }
  const schedSample = s.find(x => x.t === t0 + 20) || null;
  const hitIdx = s.findIndex(x => x.hp < s[0].hp - 0.5);
  const hitSample = hitIdx > 0 ? s[hitIdx] : null;
  console.log('调度帧 t=' + (t0 + 20) + ' gameFrame=' + (schedSample && schedSample.f) +
    ' | 按下帧 P=' + (pressAt && pressAt.pf) + ' (采样 t=' + (pressAt && pressAt.t) + ', gameFrame=' + (pressAt && pressAt.f) + ')' +
    ' | 第一帧掉血 t=' + (hitSample && hitSample.t) + ' hp=' + (hitSample ? hitSample.hp.toFixed(1) : '-'));
  if (schedSample && pressAt) {
    rig.check('合成按键生效（pressFrame 被写入）', pressAt.pf > 0, 'P=' + pressAt.pf + ' gameFrame(P)=' + pressAt.f + ' gameFrame(调度)=' + schedSample.f + ' 帧偏移=' + (pressAt.f - schedSample.f));
  } else {
    rig.check('合成按键生效（pressFrame 被写入）', false, 'pressAt=' + JSON.stringify(pressAt));
  }
  rig.check('合成按键能造成真实伤害（轻击）', !!hitSample, hitSample ? '宿傩 hp ' + s[0].hp.toFixed(1) + ' -> ' + hitSample.hp.toFixed(1) + ' 在第 ' + hitSample.t + ' 帧' : '没有掉血');
  rig.check('事件 tap 收到 hit 事件', run.events.some(e => e.type === 'hit'), JSON.stringify(run.events.slice(0, 4)));

  /* ---------- 3. 基线帧时间 ---------- */
  const ft = await rig.sample('({now: performance.now(), f: S.combat.frame})', 6000);
  const d = [];
  for (let i = 1; i < ft.samples.length; i++) d.push(ft.samples[i].now - ft.samples[i - 1].now);
  const st = stats(d);
  const over33 = d.filter(x => x > 33.4).length;
  console.log('帧时间 ms: ' + JSON.stringify(st) + '  >33.4ms 帧数=' + over33 + '/' + d.length + ' (' + (100 * over33 / Math.max(1, d.length)).toFixed(1) + '%)');
  rig.note('基线帧时间 ' + JSON.stringify(st) + ' 超33.4ms=' + over33 + '/' + d.length);
  await rig.shot('00-baseline' + (mobile ? '-mobile' : ''));
  rig.check('基线无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
} catch (e) {
  console.log('FATAL ' + (e && e.stack || e));
  rig.check('脚本未抛错', false, String((e && e.message) || e));
} finally {
  await rig.finish();
}
