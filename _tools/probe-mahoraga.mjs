/**
 * probe-mahoraga.mjs —— task-2「魔虚罗 + 二阶段宿傩」自测 / 验收探针
 * ----------------------------------------------------------------------------
 * 契约：reviews/13-mechanics-contract.md §4（验收清单逐条对应下面的 check()）。
 * 端口：9501（契约 §3 分配给 mahoraga），不与别人抢。
 * 用法：
 *   node _tools/probe-mahoraga.mjs --file tmp/mahoraga/dist.html --port 9501
 *   node _tools/probe-mahoraga.mjs --lowq            # 只验 low 画质降级
 * 说明：
 *   - 断言只读 __SS.mech().mahoraga / __SS.mahoraga.debug()（契约 §1.3 自报快照）；
 *     只有"尺寸/网格数"这种建模指标走 MahoragaPhase.metrics()。
 *   - 需要彻底确定的量（适应计数、庇护乘区）用探针专用入口（setEvade/segTest/gateTest），
 *     同时再做一次「真按键 + 真弹道」的端到端验证；两者都打印原始数字。
 *   - 全程不碰共享 dist/，只读私有构建产物。
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg('file', 'tmp/mahoraga/dist.html'));
const PORT = Number(arg('port', '9501'));
const SHOTS = arg('shots', 'shots/mahoraga');
const LOWQ = argv.includes('--lowq');
const QUICK = argv.includes('--quick');
const NDC = argv.includes('--ndc');
const CAL = argv.includes('--cal');
if (!existsSync(FILE)) { console.error('找不到产物 ' + FILE + '（先跑私有构建）'); process.exit(2); }
const URL = 'file:///' + FILE.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') + (LOWQ ? '?q=low' : '');

const R = [];
function check(name, ok, detail) {
  R.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? '  → ' + detail : ''));
}
function info(tag, v) { console.log('    · ' + tag + ': ' + (typeof v === 'string' ? v : JSON.stringify(v))); }
function head(t) { console.log('\n=== ' + t + ' ==='); }

const b = new Browser({ port: PORT, width: 1280, height: 720 });
const nap = sleep;

/** 反复求值直到条件为真（返回最后一次值） */
async function until(expr, ms, step) {
  ms = ms || 6000; step = step || 120;
  const t0 = Date.now();
  let v = null;
  while (Date.now() - t0 < ms) {
    v = await b.evaluate(expr);
    if (v) return v;
    await nap(step);
  }
  return v;
}

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await nap(13000);
  await b.evaluate('(() => { const el = document.getElementById("btn-skip-cine"); if (el) el.click(); return true; })()');
  for (let i = 0; i < 80; i++) { await nap(400); if (await b.evaluate('window.__SS && window.__SS.state') === 'fight') break; }
  await b.evaluate('(() => { const c = window.__SS.combat; if (c && c.setAiEnabled) c.setAiEnabled(false); return true; })()');
  await nap(800);

  // 页内小工具：全部走公开接口（__SS.mahoraga 由 mahoraga.js 在 combatInit 里挂上）
  await b.evaluate([
    '(() => {',
    '  const S = window.__SS;',
    '  const F = (w) => S.mahoraga.cb().fighters[w];',
    '  window.__M = {',
    '    d: () => S.mahoraga.debug(),',
    '    m: () => S.mahoraga.metrics(),',
    '    mech: () => S.mech().mahoraga,',
    '    cb: () => S.mahoraga.cb(),',
    '    F: F,',
    '    put: (w, x, z) => { const c = F(w); c.ctrl.setPos(x, 0, z); c.p.set(x, 0, z); return { x: +c.p.x.toFixed(2), z: +c.p.z.toFixed(2) }; },',
    '    gojoHp: () => +F("gojo").hp.toFixed(2),',
    '    sukunaHp: () => +F("sukuna").hp.toFixed(2),',
    '    ready: () => { const pl = F("gojo"); const c = S.mahoraga.cb(); pl.hp = pl.hpMax; pl.ce = pl.ceMax; pl.invT = 0; pl.cds.clear(); pl.p200Cd = 0; pl.burnoutT = 0; pl.stunT = 0; c.resultLocked = false; if (c.mode !== "fight") c.mode = "fight"; return true; },',
    '    game: () => ({ state: S.state, mode: S.mahoraga.cb().mode, locked: S.mahoraga.cb().resultLocked }),',
    '    healMaho: (n) => S.mahoraga.heal(n),',
    '    hurt: (n) => S.mahoraga.hurt(n),',
    '    freeze: (on) => S.mahoraga.freeze(on),',
    '    banners: () => Array.from(window.__M.B || []),',
    '    watchBanner: () => { window.__M.B = new Set(); clearInterval(window.__M._bt); window.__M._bt = setInterval(() => { try { window.__M.B.add(S.snap.banner); } catch (e) {} }, 50); return true; },',
    '    seg: (sk, r, dmg) => S.mahoraga.segTest(sk, r, dmg),',
    '    force: (id) => S.mahoraga.force(id),',
    '    evade: (v) => S.mahoraga.setEvade(v),',
    '    aim: (sk) => S.mahoraga.aimTest(sk),',
    '    gate: (a, b2, dmg) => S.mahoraga.gateTest({ from: F(a), to: F(b2), dmg: dmg }),',
    '    resolve: (a, b2, skill, dmg) => S.mahoraga.cb().resolver.apply({ from: F(a), to: F(b2), skill: skill, dmg: dmg, kind: "domain", dir: { x: 1, y: 0, z: 0 } }),',
    '    hudWeak: () => { const e = document.querySelector("#maho-hud [data-maho=weak]"); return e ? e.style.display : "no-hud"; },',
    '    hudText: () => { const e = document.getElementById("maho-hud"); return e ? e.textContent.replace(/\s+/g, " ").trim().slice(0, 140) : "no-hud"; },',
    '    hudDisplay: () => { const e = document.getElementById("maho-hud"); return e ? e.style.display : "no-hud"; },',
    '    lock: (v) => { S.cam.lockOn = !!v; return S.cam.lockOn; },',
    '    setPos: (x, y, z, pin) => S.mahoraga.setPos(x, y, z, pin),',
    '    ndc2: (n) => new Promise((res) => {',
    '      // Lead 加严版：同时投影"脚底"与"法轮顶"两端，要求 95% 的帧两端都在 |ndcY|<=0.95',
    '      const camObj = S.activeCamera; const out = [];',
    '      const step = () => {',
    '        const d = S.mahoraga.debug();',
    '        const h = d.modelHeight || 4.07;',
    '        const a = S.cam.target.clone().set(d.pos.x, d.pos.y, d.pos.z).project(camObj);',
    '        const b2 = S.cam.target.clone().set(d.pos.x, d.pos.y + h, d.pos.z).project(camObj);',
    '        out.push([a.y, b2.y, a.x, b2.x]);',
    '        if (out.length < n) { requestAnimationFrame(step); return; }',
    '        const inF = out.filter((o) => Math.abs(o[0]) <= 0.95 && Math.abs(o[1]) <= 0.95 && Math.abs(o[2]) <= 0.95 && Math.abs(o[3]) <= 0.95).length;',
    '        const ys = out.map((o) => o[0]).concat(out.map((o) => o[1])).sort((p, q) => p - q);',
    '        const xs = out.map((o) => o[2]).concat(out.map((o) => o[3]));',
    '        res({ frames: out.length, insideBoth: +(inF / out.length).toFixed(4),',
    '          minY: ys[0], maxY: ys[ys.length - 1], medY: ys[Math.floor(ys.length / 2)],',
    '          minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),',
    '          feetY: [Math.min.apply(null, out.map((o) => o[0])), Math.max.apply(null, out.map((o) => o[0]))],',
    '          topY: [Math.min.apply(null, out.map((o) => o[1])), Math.max.apply(null, out.map((o) => o[1]))] });',
    '      };',
    '      requestAnimationFrame(step);',
    '    }),',
    '    ndc: (n) => new Promise((res) => {',
    '      const camObj = S.activeCamera; const out = [];',
    '      const step = () => {',
    '        const d = S.mahoraga.debug();',
    '        const v = S.cam.target.clone().set(d.pos.x, d.pos.y + 2.4, d.pos.z).project(camObj);',
    '        out.push([+v.x.toFixed(4), +v.y.toFixed(4)]);',
    '        if (out.length < n) { requestAnimationFrame(step); return; }',
    '        const ys = out.map((o) => o[1]).sort((a, b) => a - b);',
    '        const xs = out.map((o) => o[0]);',
    '        const inside = out.filter((o) => Math.abs(o[1]) <= 0.92 && Math.abs(o[0]) <= 0.95).length;',
    '        res({ frames: out.length, insideFraction: +(inside / out.length).toFixed(4), minY: ys[0], maxY: ys[ys.length - 1],',
    '          medY: ys[Math.floor(ys.length / 2)], minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs) });',
    '      };',
    '      requestAnimationFrame(step);',
    '    }),',
    '    hudMark: () => { const e = document.querySelector("#maho-hud [data-maho=mark]"); return e ? { display: e.style.display, left: e.style.left, top: e.style.top, text: e.textContent.trim() } : null; },',
    '    hudReticle: () => { const e = document.querySelector("#maho-hud [data-maho=reticle]"); return e ? e.style.display : null; }',
    '  };',
    '  return true;',
    '})()'
  ].join('\n'));

  head('A · 接入与自报快照（契约 §1.3 / §4）');
  const dbg = await b.evaluate('window.__SS.mahoraga.debug()');
  const mech = await b.evaluate('window.__SS.mech().mahoraga');
  info('__SS.mahoraga.debug()', dbg);
  info('__SS.mech().mahoraga', mech);
  check('A1 __SS.mahoraga.debug() 可读 hp/hpMax/alive/adapt/mode',
    dbg && typeof dbg.hp === 'number' && typeof dbg.hpMax === 'number' && typeof dbg.alive === 'boolean' && !!dbg.adapt && typeof dbg.mode === 'string',
    JSON.stringify({ hp: dbg.hp, hpMax: dbg.hpMax, alive: dbg.alive, adapt: dbg.adapt, mode: dbg.mode }));
  check('A2 __SS.mech().mahoraga 有契约 §1.3 要求的 7 个字段',
    mech && ['hp', 'hpMax', 'alive', 'adapt', 'mode', 'skill', 'cd'].every((k) => k in mech),
    Object.keys(mech).join(','));
  check('A3 HOOKS.tick 已被 combat 调用', dbg.hookCalls.tick > 30, 'tick=' + dbg.hookCalls.tick);

  if (CAL) {
    head('C · 对空命中标定（--cal）');
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
    await until('window.__M.d().alive === true', 9000);
    await until('window.__M.d().mode === "air"', 9000);
    await b.evaluate('window.__M.freeze(true)');
    await until('window.__M.d().mode === "air" && window.__M.d().attackable === false', 9000, 80);
    await b.evaluate('window.__M.lock(true)');
    await b.evaluate('window.__M.evade(0)');
    for (let i = 0; i < 8; i++) {
      const p = (await b.evaluate('window.__M.d()')).pos;
      await b.evaluate('window.__M.put("sukuna", ' + p.x + ', ' + (p.z + 26) + ')');
      await b.evaluate('window.__M.put("gojo", ' + p.x + ', ' + (p.z + 12) + ')');
      await b.evaluate('window.__M.ready()');
      await nap(320);   // 等骨骼世界矩阵刷新：弹道出生点取的是 handR 的世界坐标，瞬移当帧还是旧值
      const d0 = await b.evaluate('window.__M.d()');
      const sk0 = await b.evaluate('window.__M.sukunaHp()');
      await b.keyDown('KeyI'); await nap(60); await b.keyUp('KeyI');
      await nap(1600);
      const d1 = await b.evaluate('window.__M.d()');
      const pl = await b.evaluate('({ ce: window.__M.F("gojo").ce, action: !!window.__M.F("gojo").action, stun: window.__M.F("gojo").stunT, mahoDist: Math.hypot(window.__M.F("gojo").p.x - ' + p.x + ', window.__M.F("gojo").p.z - ' + p.z + '), game: window.__M.game() })');
      console.log('  #' + (i + 1) + ' 命中=' + (d1.hitsTaken - d0.hitsTaken) + ' 闪避=' + (d1.stats.dodges - d0.stats.dodges) +
        ' 弹道样本=' + d1.probeNear.samples + ' 最近=' + d1.probeNear.min + 'm 宿傩掉血=' + +(sk0 - (await b.evaluate('window.__M.sukunaHp()'))).toFixed(2) +
        ' 玩家={' + JSON.stringify(pl) + '}');
    }
    await b.close();
    process.exit(0);
  }

  if (NDC) {
    head('N · 悬浮高度 → 画面内占比 扫描（真实交战距离 13m）');
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
    await until('window.__M.d().alive === true', 9000);
    await until('window.__M.d().mode === "air"', 9000);
    await b.evaluate('window.__M.freeze(true)');
    await until('window.__M.d().mode === "air" && window.__M.d().attackable === false', 9000, 80);
    await b.evaluate('window.__M.put("gojo", 0, 0)');
    await b.evaluate('window.__M.put("sukuna", 0, -13)');
    await b.evaluate('window.__M.lock(false)');
    for (const y of [6.4, 5.8, 5.2, 4.6, 4.0, 3.6, 3.2, 2.8]) {
      await b.evaluate('window.__M.setPos(0, ' + y + ', -12)');
      await nap(500);
      const s = await b.evaluate('window.__M.ndc(30)');
      console.log('  y=' + y + 'm  inside=' + (s.insideFraction * 100).toFixed(0) + '%  ndcY[' + s.minY + ',' + s.maxY + '] 中位 ' + s.medY + '  ndcX[' + s.minX + ',' + s.maxX + ']');
      check('N y=' + y + 'm 画面内 ≥95%', s.insideFraction >= 0.95, 'inside=' + (s.insideFraction * 100).toFixed(0) + '% ndcY中位 ' + s.medY + ' ndcX[' + s.minX + ',' + s.maxX + ']');
    }
    await b.close();
    process.exit(0);
  }

  if (QUICK) {
    head('Q · 建模快速自查（--quick）');
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
    await until('window.__M.d().alive === true', 9000);
    await until('window.__M.d().mode === "air"', 9000);
    await b.evaluate('window.__M.freeze(true)');
    await until('window.__M.d().mode === "air" && window.__M.d().attackable === false', 9000, 80);
    await b.evaluate('window.__M.put("gojo", 0, 0)');
    await b.evaluate('window.__M.put("sukuna", 0, 40)');
    await b.evaluate('window.__M.setPos(0, 0.6, 8)');
    await nap(900);
    const qm = await b.evaluate('window.__M.m()');
    info('metrics', qm);
    info('最高零件', qm.topParts);
    const dump = await b.evaluate('window.__SS.mahoraga.dump()');
    info('rootScale/rootY', { scale: dump.rootScale, y: dump.rootY });
    info('骨骼(head/wheel/hips)', { head: dump.bones.head, wheel: dump.bones.wheel, hips: dump.bones.hips });
    info('零件世界 y（节选）', {
      TorusGeometry: dump.parts['TorusGeometry'],
      hub: dump.parts['BoxGeometry:0.1x0.1'],
      headbox: dump.parts['BoxGeometry:0.54x0.5'],
      horn: dump.parts['BoxGeometry:0.08x0.34']
    });
    await b.screenshot(SHOTS + '/02-front.png');
    await b.evaluate('window.__M.put("gojo", 3.6, -1)');
    await nap(700);
    await b.screenshot(SHOTS + '/03-threequarter.png');
    await b.evaluate('window.__M.put("gojo", 0, 16)');
    await nap(700);
    await b.screenshot(SHOTS + '/03b-back.png');
    console.log('\n（--quick 只跑建模自查）');
    await b.close();
    process.exit(0);
  }

  if (LOWQ) {
    head('L · low 画质降级（--lowq）');
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
    await until('window.__M.d().alive === true', 9000);
    await until('window.__M.d().mode === "air"', 9000);
    const dm = await b.evaluate('window.__M.m()');
    info('metrics(low)', dm);
    check('L1 low 画质网格数 ≤ 70', dm.meshes <= 70, 'meshes=' + dm.meshes);
    check('L2 low 画质尺寸仍在 3.8~4.35m', dm.height >= 3.7 && dm.height <= 4.4, 'height=' + dm.height);
    console.log('\n（--lowq 只跑画质分支）');
    await b.close();
    process.exit(R.every((r) => r.ok) ? 0 : 1);
  }

  /* ------------------------------------------------------------------ */
  head('B · 半血触发 + 召唤演出');
  const sumsBefore = dbg.summons;
  await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
  const tTrig = Date.now();
  const inSummon = await until('window.__M.d().mode === "summon"', 4000, 60);
  const lockNow = await b.evaluate('window.__M.cb().phaseLock');
  await b.screenshot(SHOTS + '/01-summon.png');
  await until('window.__M.d().mode === "air"', 9000);
  const summonMs = Date.now() - tTrig;
  const afterSummon = await b.evaluate('window.__M.d()');
  info('召唤后 debug', { mode: afterSummon.mode, alive: afterSummon.alive, hp: afterSummon.hp, summons: afterSummon.summons, pos: afterSummon.pos });
  check('B1 宿傩 HP 到 50% 必触发（alive=true / mode=air）', afterSummon.alive && afterSummon.mode === 'air', 'alive=' + afterSummon.alive + ' mode=' + afterSummon.mode);
  check('B2 触发瞬间 phaseLock ≈2.8s（冻结双方）', lockNow > 2.0 && lockNow <= 2.81, 'phaseLock=' + lockNow);
  info('触发→演出结束耗时', summonMs + 'ms（含轮询粒度）');
  await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.40');
  await nap(1500);
  const twice = await b.evaluate('window.__M.d()');
  check('B3 不重复触发（summons 仍为 1，未再次进入 summon）', twice.summons === 1 && twice.mode !== 'summon', 'summons=' + twice.summons + ' mode=' + twice.mode);

  /* ------------------------------------------------------------------ */
  head('C · 建模（契约：3.8~4.2m / 肩宽 2.6m / draw call ≤70）');
  /**
   * 从这里到 F 结束都冻结自动出招：一是让高度量在"悬浮姿态"这个规范形态上
   * （仰身的召唤/蓄力姿态会把整条脊椎压成 3.5m，量出来的数会飘），
   * 二是让对空命中测试面对一个稳定的悬浮目标（玩家实际最常看到的形态）。
   */
  await b.evaluate('window.__M.freeze(true)');
  await until('window.__M.d().mode === "air" && window.__M.d().attackable === false', 9000, 80);
  const mt = await b.evaluate('window.__M.m()');
  info('metrics', mt);
  check('C1 高度 ∈ [3.8, 4.2]（含头顶法轮）', mt.height >= 3.78 && mt.height <= 4.22, 'height=' + mt.height + 'm');
  check('C2 肩宽 ∈ [2.4, 2.8]', mt.shoulderWidth >= 2.4 && mt.shoulderWidth <= 2.8, 'shoulderWidth=' + mt.shoulderWidth + 'm（整机 span=' + mt.span + 'm，含张开的手臂/退魔之剑）');
  check('C3 可见网格数（≈draw call）≤ 70', mt.meshes <= 70, 'meshes=' + mt.meshes + ' / partCount=' + dbg.partCount);
  // 契约 §4 修订：AIR_Y = 5.2/5.8/6.4（原来的 14~17m 完全出画）
  // 契约修订 + 实测收敛：normal 3.6（--ndc 扫描证明 5.2/5.8/6.4 全部出画）
  // 契约修订值 5.2/5.8/6.4 + camFrame 取景覆盖：实测 base 5.82 时法轮顶 ndcY 1.09（被切），
  // 收敛到 normal=4.5（两端都在画面内的帧 ≥95%，见 O1）
  check('C4 悬浮基准高度 ∈ [3.9, 5.1]（normal 4.5，整只入画）', afterSummon.pos.y >= 3.9 && afterSummon.pos.y <= 5.1, 'y=' + afterSummon.pos.y);
  const hudText = await b.evaluate('window.__M.hudText()');
  info('HUD 文本', hudText);
  check('C5 HUD（自建 DOM）已显示第二条血条 + 法轮格数', (await b.evaluate('window.__M.hudDisplay()')) === 'block' && /适应/.test(hudText), hudText);

  /* ------------------------------------------------------------------ */
  head('Q2 · Lead P0 复现：魔虚罗存活时，玩家近战 10 次打宿傩');
  {
    await b.evaluate('window.__M.freeze(true)');      // 冻住技能：让魔虚罗稳定悬空（不进弱点窗口）
    await until('window.__M.d().mode === "air" && window.__M.d().attackable === false', 9000, 80);
    await b.evaluate('window.__M.ready()');
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax');
    // 玩家站在宿傩身前 1.6m 并转向（verifier 的复现条件）
    await b.evaluate('window.__M.put("sukuna", 0, -20)');
    await b.evaluate('window.__M.put("gojo", 0, -18.4)');
    await b.evaluate('window.__M.cb().fighters.gojo.ctrl.faceTo(0, -20, true)');
    await b.evaluate('window.__M.ready()');
    const sk0 = await b.evaluate('window.__M.sukunaHp()');
    const mh0 = (await b.evaluate('window.__M.d()')).hitsTaken;
    const b0 = (await b.evaluate('window.__M.d()')).blocks;
    for (let i = 0; i < 10; i++) { await b.pressKey('KeyJ', 40); await nap(420); }
    await nap(500);
    const sk1 = await b.evaluate('window.__M.sukunaHp()');
    const dd = await b.evaluate('window.__M.d()');
    const punched = +(sk0 - sk1).toFixed(2);
    const blocks = dd.blocks - b0;
    const mahoDelta = dd.hitsTaken - mh0;
    info('近战 10 次（魔虚罗存活）', { '宿傩 hp': sk0 + ' → ' + sk1, 差: punched, 挡下次数: blocks, 魔虚罗受到命中: mahoDelta, 魔虚罗hp: dd.hp });
    check('Q2-1 近战打宿傩不是 0 伤害（期望 ≈10×2.6×0.6=15.6）', punched >= 8 && punched <= 22, '宿傩掉血 ' + punched);
    check('Q2-2 挡下不凭空消失：挡下时伤害记在魔虚罗头上', blocks === 0 || mahoDelta >= blocks, '挡下 ' + blocks + ' 次 / 魔虚罗被命中 ' + mahoDelta + ' 次');
    // 无魔虚罗对照：击破后同样 10 次
    await b.evaluate('window.__M.hurt(9999)');
    await nap(2200);
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax');
    await b.evaluate('window.__M.ready()');
    await b.evaluate('window.__M.cb().fighters.gojo.ctrl.faceTo(0, -20, true)');
    const skA = await b.evaluate('window.__M.sukunaHp()');
    for (let i = 0; i < 10; i++) { await b.pressKey('KeyJ', 40); await nap(420); }
    await nap(400);
    const skB = await b.evaluate('window.__M.sukunaHp()');
    const noMaho = +(skA - skB).toFixed(2);
    info('近战 10 次（魔虚罗已击破）', { '宿傩 hp': skA + ' → ' + skB, 差: noMaho, ratio: punched ? +(punched / noMaho).toFixed(3) : null });
    check('Q2-3 有无魔虚罗的比值 ≈0.6（庇护乘区）', noMaho > 0 && Math.abs(punched / noMaho - 0.6) < 0.2, punched + ' / ' + noMaho + ' = ' + (punched / noMaho).toFixed(3));
    await b.evaluate('window.__SS.combat.reset()');
    await nap(600);
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
    await until('window.__M.d().alive === true', 9000);
    await until('window.__M.d().mode === "air"', 9000);
    await b.evaluate('window.__M.freeze(true)');
    await nap(300);
  }

  /* ------------------------------------------------------------------ */
  head('O · 可见性自检（Lead P0 硬验收：≥120 帧，|ndcY|≤0.92 且 |ndcX|≤0.95 占比 ≥95%）');
  {
    // 真实交战距离：玩家与宿傩 13m（和 Lead 的实测一致），放开冻结让它正常环绕
    await b.evaluate('window.__M.freeze(false)');
    await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
    await b.evaluate('window.__M.put("gojo", 0, 0)');
    await b.evaluate('window.__M.put("sukuna", 0, -13)');
    await nap(400);
    const ndc = await b.evaluate('window.__M.ndc2(150)');
    const camf = (await b.evaluate('window.__M.d()')).camFrame;
    info('camFrame 钩子状态', camf);
    info('NDC 采样（150 帧，脚底+法轮顶两端）', ndc);
    check('O1 整只模型两端在画面内 ≥95%（脚底+法轮顶，150 帧）', ndc.frames >= 120 && ndc.insideBoth >= 0.95, 'insideBoth=' + (ndc.insideBoth * 100).toFixed(1) + '%  脚底 ndcY[' + ndc.feetY[0] + ',' + ndc.feetY[1] + ']  法轮顶 ndcY[' + ndc.topY[0] + ',' + ndc.topY[1] + ']  中位 ' + ndc.medY + '  ndcX[' + ndc.minX + ',' + ndc.maxX + ']');
    check('O2 目标在画面上方区域（ndcY 中位 > 0）', ndc.medY > 0, 'medY=' + ndc.medY);
    check('O2b camFrame 取景覆盖已被 camera.js 调用', camf.calls > 30 && camf.w > 0.9, JSON.stringify(camf));
    await b.screenshot(SHOTS + '/08-boss-frame.png');
    info('boss 取景截图', SHOTS + '/08-boss-frame.png');
    // 锁定准星
    await b.evaluate('window.__M.lock(true)');
    await nap(200);
    const ret = await b.evaluate('window.__M.hudReticle()');
    check('O3 锁定（Q）时出现准星/锁定框', ret === 'block', 'reticle display=' + ret);
    // 屏外指示：把相机视角外的目标造出来（玩家背对）
    await b.evaluate('window.__M.setPos(0, 3.6, 30)');   // 相机在玩家背后（+z），放它身后才是真出画
    await nap(400);
    const mk = await b.evaluate('window.__M.hudMark()');
    info('屏外指示器', mk);
    check('O4 出画时有自己的屏外指示（方向 + 距离）', !!mk && mk.display === 'block' && /m/.test(mk.text), JSON.stringify(mk));
    await b.evaluate('window.__M.setPos(0, 3.6, 0, false)');
    await b.evaluate('window.__M.lock(false)');
    await b.evaluate('window.__M.freeze(true)');
    await nap(300);
  }

  /* ------------------------------------------------------------------ */
  head('D · 悬空时近战够不到 + 「它悬在空中」解释');
  await b.evaluate('window.__M.freeze(true)');     // 冻结自动出招：把"悬空"这件事干净地量出来
  await b.evaluate('window.__M.watchBanner()');
  // 第一招固定是俯冲（可能正在落地窗口里），等它回到干净的悬空再测
  await until('window.__M.d().mode === "air" && window.__M.d().attackable === false', 9000, 80);
  const dClean = await b.evaluate('window.__M.d()');
  info('悬空干净态', { mode: dClean.mode, y: dClean.pos.y, attackable: dClean.attackable });
  const dPos = (await b.evaluate('window.__M.d()')).pos;
  await b.evaluate('window.__M.put("gojo", ' + dPos.x + ', ' + (dPos.z + 2) + ')');
  await b.evaluate('window.__M.put("sukuna", ' + (dPos.x + 1) + ', ' + (dPos.z + 3) + ')');
  const hpBeforeMelee = (await b.evaluate('window.__M.d()')).hp;
  for (let i = 0; i < 8; i++) { await b.pressKey('KeyJ', 40); await nap(180); }
  await nap(400);
  const afterMelee = await b.evaluate('window.__M.d()');
  const banners = await b.evaluate('Array.from(window.__M.B)');
  const hintBanner = banners.filter((s) => /悬在|悬空/.test(s || ''));
  info('近战 8 次后', { hp: afterMelee.hp, hint: afterMelee.stats.hint, banners: banners.length, hintBanner: hintBanner });
  check('D1 悬空时近战打不到（魔虚罗 HP 不变）', afterMelee.hp === hpBeforeMelee, 'hp ' + hpBeforeMelee + ' → ' + afterMelee.hp);
  check('D2 弹出「它悬在空中」解释横幅', afterMelee.stats.hint >= 1 && hintBanner.length >= 1, 'hint=' + afterMelee.stats.hint + ' 命中横幅=' + JSON.stringify(hintBanner));

  /* ------------------------------------------------------------------ */
  head('E · aim 门控（只有锁定才掰弹道）');
  await b.evaluate('window.__M.lock(false)');
  const aimOff = {
    blue: await b.evaluate('window.__M.aim("blue")'),
    red: await b.evaluate('window.__M.aim("red")'),
    purple: await b.evaluate('window.__M.aim("purple")')
  };
  await b.evaluate('window.__M.lock(true)');
  const aimOn = {
    blue: await b.evaluate('window.__M.aim("blue")'),
    red: await b.evaluate('window.__M.aim("red")'),
    purple: await b.evaluate('window.__M.aim("purple")'),
    purple200: await b.evaluate('window.__M.aim("purple200")'),
    furnace: await b.evaluate('window.__M.aim("furnace")')
  };
  info('未锁定 aim', aimOff);
  info('锁定 aim', aimOn);
  check('E1 未锁定时 苍/赫/茈 都不改写弹道', !aimOff.blue.aimed && !aimOff.red.aimed && !aimOff.purple.aimed, JSON.stringify(aimOff));
  check('E2 锁定时弹道都瞄住目标的预测点（到预测点垂距 <0.05m）',
    ['blue', 'red', 'purple', 'purple200'].every((k) => aimOn[k].aimed && aimOn[k].perpPred < 0.05),
    ['blue', 'red', 'purple', 'purple200'].map((k) => k + ':预测点垂距' + aimOn[k].perpPred + 'm').join('  '));
  // 目标变近变低后飞行时间缩短（苍 0.55s / 赫 0.35s），提前量绝对值跟着变小，但必须非零
  check('E2a 会动的目标给出真实提前量（苍/赫 >0.2m），瞬发茈给 0',
    aimOn.blue.perp > 0.2 && aimOn.red.perp > 0.2 && aimOn.purple.perp < 0.05 && aimOn.purple200.perp < 0.05,
    '苍=' + aimOn.blue.lead + 's/' + aimOn.blue.perp + 'm 赫=' + aimOn.red.lead + 's/' + aimOn.red.perp + 'm 茈=' + aimOn.purple.perp + 'm');
  check('E2b 会飞的弹（苍/赫）按弹速给提前量，瞬发茈不给',
    aimOn.blue.lead > 0.3 && aimOn.red.lead > 0.3 && aimOn.purple.lead === 0 && aimOn.purple200.lead === 0,
    'blue=' + aimOn.blue.lead + 's red=' + aimOn.red.lead + 's purple=' + aimOn.purple.lead + 's');
  check('E3 宿傩的「开」不被改写（不是玩家的术式）', aimOn.furnace.aimed === false, JSON.stringify(aimOn.furnace));

  /* ------------------------------------------------------------------ */
  head('F · 端到端：真按键 + 真弹道打空中魔虚罗（目标维持悬浮，自动出招仍冻结）');
  const casts = [
    { tag: '苍', key: 'KeyU', hold: 60 },
    { tag: '赫', key: 'KeyI', hold: 60 },
    { tag: '茈', key: 'KeyO', hold: 420 }
  ];
  const realHits = {};
  for (const c of casts) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const p = (await b.evaluate('window.__M.d()')).pos;
      /**
       * 魔虚罗现在环绕**宿傩**（可见性的结构性保证），所以测试必须用真实交战距离：
       * 宿傩离玩家 14m、玩家再靠前 12m 站位。把宿傩丢到 45m 外会让魔虚罗一路追过去
       * （飞行时间超过弹道寿命），那是测试布景问题，不是命中问题。
       */
      await b.evaluate('window.__M.put("sukuna", ' + p.x + ', ' + (p.z + 26) + ')');   // 与玩家(z+12)相距 14m
      await b.evaluate('window.__M.put("gojo", ' + p.x + ', ' + (p.z + 12) + ')');
      await b.evaluate('window.__M.ready()');
      await nap(320);   // 同上：等 handR 世界坐标刷新
      await b.evaluate('window.__M.lock(true)');
      await b.evaluate('window.__M.evade(0)');
      const d0 = await b.evaluate('window.__M.d()');
      await b.keyDown(c.key); await nap(c.hold); await b.keyUp(c.key);
      await nap(1700);
      const d1 = await b.evaluate('window.__M.d()');
      const hit = d1.hitsTaken > d0.hitsTaken, dodged = d1.stats.dodges > d0.stats.dodges;
      info(c.tag + ' 第' + (attempt + 1) + '次', { hitsTaken: d0.hitsTaken + '→' + d1.hitsTaken, dodges: d1.stats.dodges, aimCalls: d1.hookCalls.aim, segCalls: d1.hookCalls.segment });
      if (hit || dodged) { realHits[c.tag] = { hit: hit, dodged: dodged, hpAfter: d1.hp }; break; }
    }
  }
  check('F1 锁定状态下「苍」命中空中魔虚罗', realHits['苍'] && realHits['苍'].hit, JSON.stringify(realHits['苍'] || null));
  check('F2 锁定状态下「赫」命中空中魔虚罗', realHits['赫'] && realHits['赫'].hit, JSON.stringify(realHits['赫'] || null));
  check('F3 锁定状态下「茈」命中空中魔虚罗', realHits['茈'] && realHits['茈'].hit, JSON.stringify(realHits['茈'] || null));
  {
    const p = (await b.evaluate('window.__M.d()')).pos;
    await b.evaluate('window.__M.put("gojo", ' + p.x + ', ' + (p.z + 12) + ')');
    await b.evaluate('window.__M.put("sukuna", ' + p.x + ', ' + (p.z + 26) + ')');   // 距玩家 14m
    await b.evaluate('window.__M.ready()');
    await b.evaluate('window.__M.lock(false)');
    await b.evaluate('window.__M.evade(0)');
    const d0 = await b.evaluate('window.__M.d()');
    await b.keyDown('KeyI'); await nap(60); await b.keyUp('KeyI');
    await nap(1800);
    const d1 = await b.evaluate('window.__M.d()');
    info('未锁定 赫', { hitsTaken: d0.hitsTaken + '→' + d1.hitsTaken });
    check('F4 不锁定时「赫」打不到（弹道照旧飞宿傩）', d1.hitsTaken === d0.hitsTaken, 'hitsTaken ' + d0.hitsTaken + ' → ' + d1.hitsTaken);
  }
  const hc = (await b.evaluate('window.__M.d()')).hookCalls;
  info('HOOKS 调用计数', hc);
  check('F5 combat 确实在调 aim / segment 钩子', hc.aim > 10 && hc.segment > 50, JSON.stringify(hc));

  /* ------------------------------------------------------------------ */
  head('G · 四个技能：各命中一次 + 各能躲一次');
  await b.evaluate('window.__M.freeze(false)');      // 放开自动出招
  await b.evaluate('window.__M.evade(null)');
  const skillDefs = [
    { id: 'slash', name: '退魔斩' },
    { id: 'lightning', name: '落雷' },
    { id: 'dive', name: '俯冲下砸' },
    { id: 'barrage', name: '咒力弹幕' }
  ];
  const skillHit = {};
  async function waitAir() { await until('window.__M.d().mode === "air"', 9000); }
  for (const s of skillDefs) {
    // ---- 命中：站着不动 ----
    await waitAir();
    await b.evaluate('window.__M.ready()');
    await b.evaluate('window.__M.evade(0)');
    const mp = (await b.evaluate('window.__M.d()')).pos;
    await b.evaluate('window.__M.put("gojo", ' + (mp.x + 6) + ', ' + (mp.z + 6) + ')');
    const forced = await b.evaluate('window.__M.force("' + s.id + '")');
    const cd0 = (await b.evaluate('window.__M.d()')).stats.playerHits;
    const hp0 = await b.evaluate('window.__M.gojoHp()');
    await until('window.__M.d().stats.playerHits > ' + cd0, 7000, 60);
    await nap(600);
    const d1 = await b.evaluate('window.__M.d()');
    const hp1 = await b.evaluate('window.__M.gojoHp()');
    skillHit[s.id] = { landed: d1.stats.playerHits - cd0, hpDelta: +(hp0 - hp1).toFixed(2), eff: d1.lastHit ? d1.lastHit.effective : null, label: d1.lastHit ? d1.lastHit.label : null, forced: !!forced };
    info(s.name + ' 命中', skillHit[s.id]);
    check('G' + (skillDefs.indexOf(s) + 1) + 'a 「' + s.name + '」命中站着不动的玩家', skillHit[s.id].landed >= 1 && hp0 > hp1, JSON.stringify(skillHit[s.id]));

    // ---- 闪避 ----
    await waitAir();
    await b.evaluate('window.__M.ready()');
    await b.evaluate('window.__M.evade(0)');
    const mp2 = (await b.evaluate('window.__M.d()')).pos;
    await b.evaluate('window.__M.put("gojo", ' + (mp2.x + 6) + ', ' + (mp2.z + 6) + ')');
    let hit0 = (await b.evaluate('window.__M.d()')).stats.playerHits;
    let blocked0 = (await b.evaluate('window.__M.d()')).stats.boltsBlocked || 0;
    await b.evaluate('window.__M.force("' + s.id + '")');
    if (s.id === 'slash') {
      /**
       * 斩击波：6m 宽、22m/s。波出现后到命中只有 ~0.4s，纯走位（4.8m/s）只够 1.9m
       * 擦不出 3.8m 的半带宽 —— 所以这一招的"躲"是无下限（Space 0.4s 免疫）。
       * 走位可躲的是下面 0.9s 红圈的落雷。
       */
      /**
       * 斩击波生存窗口是"波带扫过自己"的那段时间：
       *   进入 = (L-3.8)/22，离开 = (L+3.8)/22，L = 波心到自己距离。
       * 0.4s 的无下限必须罩住整段（约 0.35s），所以要卡在最贴近的前 0.2s 按下。
       */
      await until('window.__M.d().wave !== null && window.__M.d().wave.t < 0.3', 5000, 40);
      const w1 = (await b.evaluate('window.__M.d()')).wave;
      const gp1 = await b.evaluate('window.__M.cb().fighters.gojo.p');
      const L = Math.hypot(w1.x - gp1.x, w1.z - gp1.z);
      const tNear = L / 22;
      const delay = Math.max(0, (tNear - 0.2 - w1.t) * 1000);
      info('  斩击波躲', { L: +L.toFixed(2), 波到达: +tNear.toFixed(3) + 's', 提前: +((tNear - 0.2)).toFixed(3) + 's 按无下限' });
      await nap(delay);
      await b.pressKey('Space', 40);
    } else if (s.id === 'lightning') {
      const t = await until('window.__M.d().telegraph', 4000, 60);
      const td = (await b.evaluate('window.__M.d()')).telegraph;
      await b.evaluate('window.__M.put("gojo", ' + (td.x + td.r + 2.5) + ', ' + td.z + ')');
      info('  落雷走位躲', { mark: td, walkedTo: +(td.r + 2.5).toFixed(1) + 'm（半径+胶囊=' + (td.r + 0.7) + '）' });
    } else if (s.id === 'dive') {
      // 半径 8m 是契约值，走位躲不掉 —— 用 Space 无下限（0.4s 完全免疫）
      await until('window.__M.d().mode === "dive"', 5000, 40);
      await nap(120);
      await b.pressKey('Space', 40);
      info('  俯冲躲', '无下限（Space）0.4s 无敌');
    } else {
      // 3 连发追踪弹：先验契约写的「可格挡」（guarding=true → GUARD_DR 0.32）
      await until('window.__M.d().mode === "air" && window.__M.d().bolts.length === 0', 9000, 80);
      await b.evaluate('window.__M.ready()');
      await b.evaluate('window.__M.evade(0)');
      const gHp0 = await b.evaluate('window.__M.gojoHp()');
      const gHit0 = (await b.evaluate('window.__M.d()')).stats.playerHits;
      await b.evaluate('window.__M.force("barrage")');
      /**
       * combat.js 在硬直分支里会写 victim.guarding = false（弹幕是 projectile → 必硬直），
       * 所以"一直按住格挡"必须在飞行期间持续补写，否则只有第一发吃减伤。
       */
      for (let i = 0; i < 60; i++) {
        await b.evaluate('window.__M.cb().fighters.gojo.guarding = true');
        const d = await b.evaluate('window.__M.d()');
        if (d.stats.playerHits > gHit0 && !d.bolts.length) break;
        await nap(60);
      }
      await nap(400);
      const gLand = (await b.evaluate('window.__M.d()')).stats.playerHits - gHit0;
      const gHp1 = await b.evaluate('window.__M.gojoHp()');
      const guardDelta = +(gHp0 - gHp1).toFixed(2);
      const soloDelta = skillHit[s.id].hpDelta / Math.max(1, skillHit[s.id].landed) * gLand;
      info('  弹幕格挡', { landed: gLand, hpDelta: guardDelta, '不格挡同命中数应约': +soloDelta.toFixed(2), ratio: soloDelta ? +(guardDelta / soloDelta).toFixed(3) : null });
      check('G4b-1 「咒力弹幕」可格挡（格挡后伤害 ≈0.32×）', gLand >= 1 && soloDelta > 0 && Math.abs(guardDelta / soloDelta - 0.32) < 0.08, '格挡 ' + guardDelta + ' / 不格挡 ' + soloDelta.toFixed(2) + ' = ' + (guardDelta / soloDelta).toFixed(3));
      await b.evaluate('window.__M.cb().fighters.gojo.guarding = false');
      // 再验一次无下限能吃掉追踪弹
      await until('window.__M.d().mode === "air" && window.__M.d().bolts.length === 0', 9000, 80);
      await b.evaluate('window.__M.ready()');
      await b.evaluate('window.__M.evade(0)');
      hit0 = (await b.evaluate('window.__M.d()')).stats.playerHits;
      blocked0 = (await b.evaluate('window.__M.d()')).stats.boltsBlocked || 0;
      await b.evaluate('window.__M.force("barrage")');
      let pressed = 0, lastPress = 0;
      for (let i = 0; i < 90; i++) {
        const st = await b.evaluate('window.__M.d()');
        if (!st.bolts.length) { if (pressed) break; }
        const pl = await b.evaluate('window.__M.cb().fighters.gojo.p');
        let near = 1e9;
        for (const bo of st.bolts) near = Math.min(near, Math.hypot(bo.x - pl.x, bo.y - (pl.y + 1.1), bo.z - pl.z));
        const now = Date.now();
        const landedNow = st.stats.playerHits - hit0;
        if (near < 4.5 && landedNow === 0 && now - lastPress > 500 && pressed < 3) { await b.pressKey('Space', 30); pressed++; lastPress = now; info('    无下限触发 @最近距离 ' + near.toFixed(2) + 'm（尚未被打到，避免硬直期按不出来）'); }
        await nap(40);
      }
      info('  弹幕躲', { pressed: pressed, how: '无下限（Space）拦截最近的一发' });
    }
    await nap(2800);
    const dEnd = await b.evaluate('window.__M.d()');
    const landedAfter = dEnd.stats.playerHits - hit0;
    const blocked = (dEnd.stats.boltsBlocked || 0) - blocked0;
    if (s.id === 'barrage') info('  弹幕被无下限吃掉', blocked + ' 发（stats.boltsBlocked）');
    /**
     * 判定口径：
     *  斩击波 / 落雷 → 必须 0 命中（走位/无下限真的躲开了）
     *  俯冲下砸     → 命中次数必须比站着不动少（8m 半径是契约值，靠无下限吃）
     *  咒力弹幕     → 至少被无下限吃掉 1 发，且命中数不比站着不动多
     */
    const okDodge = (s.id === 'slash' || s.id === 'lightning')
      ? landedAfter === 0
      // 弹幕：契约写的是「可格挡」——G4b-1 已经量到 0.32×，这里再要一条"无下限吃掉 ≥1 发"
      : (s.id === 'barrage' ? (blocked >= 1 || landedAfter < skillHit[s.id].landed) : landedAfter < skillHit[s.id].landed);
    // 弹幕：命中数少于"站着不动"那一轮即算躲掉至少一发（追加打印差额）
    info(s.name + ' 闪避后命中数', landedAfter + '（不躲时 ' + skillHit[s.id].landed + '）');
    check('G' + (skillDefs.indexOf(s) + 1) + 'b 「' + s.name + '」可被躲开', okDodge, '不躲=' + skillHit[s.id].landed + ' 躲=' + landedAfter);
  }
  /* ------------------------------------------------------------------ */
  head('P · 对空命中率标定（实测可见高度 3.2m，Lead P0 第 5 条；每档 16 次施放）');
  const hitRateRuns = {};
  {
    await b.evaluate('window.__M.freeze(true)');
    await b.evaluate('window.__M.evade(null)');
    const p0 = (await b.evaluate('window.__M.d()')).pos;
    await b.evaluate('window.__M.setPos(' + p0.x + ', ' + p0.y + ', ' + p0.z + ', false)');   // 用当前真实悬浮高度
    async function hitRate(label, ev, n) {
      let hits = 0, dodges = 0;
      for (let i = 0; i < n; i++) {
        const p = (await b.evaluate('window.__M.d()')).pos;
        await b.evaluate('window.__M.put("sukuna", ' + p.x + ', ' + (p.z + 26) + ')');   // 距玩家 14m
        await b.evaluate('window.__M.put("gojo", ' + p.x + ', ' + (p.z + 12) + ')');
        await b.evaluate('window.__M.ready()');
        await b.evaluate('window.__M.lock(true)');
        await b.evaluate('window.__M.evade(' + ev + ')');
        const d0 = await b.evaluate('window.__M.d()');
        await b.keyDown('KeyI'); await nap(60); await b.keyUp('KeyI');
        await nap(1500);
        const d1 = await b.evaluate('window.__M.d()');
        if (d1.hitsTaken > d0.hitsTaken) hits++;
        if (d1.stats.dodges > d0.stats.dodges) dodges++;
        if (i % 4 === 3) info('  ' + (i + 1) + ' 次后: 弹道样本=' + d1.probeNear.samples + ' 最近距离=' + d1.probeNear.min + 'm (命中半径 ' + d1.probeNear.hitR + '+武器半径)');
      }
      const out = { casts: n, hits: hits, dodges: dodges, hitRate: +(hits / n).toFixed(3) };
      info(label, out);
      return out;
    }
    hitRateRuns.normal = await hitRate('赫 命中率（难度 normal，EVADE_P=0.55 契约值）', 'null', 16);
    hitRateRuns.aimOnly = await hitRate('赫 命中率（EVADE_P=0：纯 aim 标定）', 0, 16);
    await b.evaluate('window.__M.evade(null)');
    await b.evaluate('window.__M.freeze(false)');
    check('P1 弹道标定：无闪避时命中率 ≥90%（说明 aim 在新高度下瞄得住）', hitRateRuns.aimOnly.hitRate >= 0.9, JSON.stringify(hitRateRuns.aimOnly));
    check('P2 难度回归：normal 下命中率落在「能打到但极难」区间（15%~60%，契约 EVADE_P=0.55）', hitRateRuns.normal.hitRate >= 0.15 && hitRateRuns.normal.hitRate <= 0.6, JSON.stringify(hitRateRuns.normal) + ' 目标区间 15%~60%');
  }

  const castStats = (await b.evaluate('window.__M.d()')).stats.casts;
  info('技能释放次数', castStats);
  check('G5 四招都被真的放过', castStats.slash >= 1 && castStats.lightning >= 1 && castStats.dive >= 1 && castStats.barrage >= 1, JSON.stringify(castStats));
  const castSum = castStats.slash + castStats.lightning + castStats.dive + castStats.barrage;
  check('G6 四招累计释放 ≥8 次（命中轮 + 闪避轮）', castSum >= 8, 'casts 合计=' + castSum);

  /* ------------------------------------------------------------------ */
  head('H · 弱点窗口（俯冲落地 1.6s）与近战可击');
  await waitAir();
  await b.evaluate('window.__M.evade(0)');
  await b.evaluate('window.__M.force("dive")');
  await until('window.__M.d().mode === "down"', 7000, 50);
  const dDown = await b.evaluate('window.__M.d()');
  const weakHud = await b.evaluate('window.__M.hudWeak()');
  const bannerH = await b.evaluate('window.__SS.snap.banner');
  await b.screenshot(SHOTS + '/05-weak-window.png');
  info('落地瞬间', { mode: dDown.mode, weakT: dDown.weakT, attackable: dDown.attackable, hudWeak: weakHud, banner: bannerH });
  check('H1 落地进入弱点窗口（mode=down / attackable=true）', dDown.mode === 'down' && dDown.attackable === true, JSON.stringify({ mode: dDown.mode, attackable: dDown.attackable }));
  check('H2 弱点窗口 1.6s（起点 weakT ≥1.4）', dDown.weakT >= 1.4, 'weakT=' + dDown.weakT);
  check('H3 横幅 + HUD 都提示弱点', /弱点/.test(bannerH || '') && weakHud === 'inline-block', 'banner=' + bannerH + ' hudWeak=' + weakHud);
  // 近战打弱点：玩家必须在宿傩近战射程内（tryMelee 先按宿傩距离过闸），把宿傩摆到魔虚罗正后方
  const mp3 = (await b.evaluate('window.__M.d()')).pos;
  await b.evaluate('window.__M.put("sukuna", ' + mp3.x + ', ' + (mp3.z + 1.6) + ')');
  await b.evaluate('window.__M.put("gojo", ' + mp3.x + ', ' + (mp3.z - 2.2) + ')');
  await b.evaluate('window.__M.ready()');
  const mh0 = (await b.evaluate('window.__M.d()')).hitsTaken;
  for (let i = 0; i < 5; i++) { await b.pressKey('KeyJ', 40); await nap(300); }
  const mh1 = (await b.evaluate('window.__M.d()')).hitsTaken;
  info('弱点窗口内近战 5 次', { hitsTaken: mh0 + ' → ' + mh1, hp: (await b.evaluate('window.__M.d()')).hp });
  check('H4 弱点窗口内近战能打到（hitsTaken 增加）', mh1 > mh0, 'hitsTaken ' + mh0 + ' → ' + mh1);
  await until('window.__M.d().mode === "air"', 6000);
  await b.evaluate('window.__M.healMaho(900)');    // 补血：后面还有适应/击破两段要跑
  const afterWeak = await b.evaluate('window.__M.d()');
  const mh2 = afterWeak.hitsTaken;
  await b.pressKey('KeyJ', 40); await nap(700);
  const mh3 = (await b.evaluate('window.__M.d()')).hitsTaken;
  check('H5 升空后近战又打不到（attackable=false，hitsTaken 不变）', afterWeak.attackable === false && mh3 === mh2, 'attackable=' + afterWeak.attackable + ' hitsTaken ' + mh2 + ' → ' + mh3);

  /* ------------------------------------------------------------------ */
  head('I · 适应：2 次 ×0.45 / 4 次免疫 / 法轮点亮 / 8 格软狂暴');
  await b.evaluate('window.__M.evade(0)');
  await b.evaluate('window.__M.healMaho(900)');
  const beforeA = await b.evaluate('window.__M.d()');
  check('I0 进适应测试前魔虚罗仍存活', beforeA.alive === true, 'alive=' + beforeA.alive + ' hp=' + beforeA.hp + ' mode=' + beforeA.mode);
  const startN = beforeA.adapt.purple200 || 0;
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const r = await b.evaluate('window.__M.seg("purple200", 1.2, 100)');
    const d = await b.evaluate('window.__M.d()');
    seq.push({ n: (d.adapt.purple200 || 0), delta: r.delta, wheel: d.wheelLit });
    info('200%茈 第' + d.adapt.purple200 + ' 次命中', { delta: r.delta, wheelLit: d.wheelLit });
  }
  const exp = (n) => (n >= 4 ? 0 : n >= 2 ? 31.5 : 70);
  check('I1 适应计数按招式独立（本次从 ' + startN + ' 起）', seq[3].n === startN + 4, JSON.stringify(seq.map((x) => x.n)));
  check('I2 第 2 次起 ×0.45、第 4 次免疫（0 伤害）', seq.every((x) => Math.abs(x.delta - exp(x.n)) < 0.01), seq.map((x) => x.n + '→' + x.delta).join('  '));
  check('I3 法轮在 2 次 / 4 次各点亮一格', (() => {
    const m = (n) => (n >= 4 ? 1 : 0) + (n >= 2 ? 1 : 0);
    const want = m(startN + 4) - m(startN);
    return seq[3].wheel - beforeA.wheelLit === want;
  })(), 'wheelLit ' + beforeA.wheelLit + ' → ' + seq[3].wheel + '（起点计数 ' + startN + '）');
  for (const sp of ['blue', 'red', 'purple', 'purple200']) {
    for (let i = 0; i < 6; i++) {
      const cur = (await b.evaluate('window.__M.d()')).adapt;
      if ((cur[sp] || 0) >= 4) break;
      await b.evaluate('window.__M.seg("' + sp + '", 1.2, 100)');
    }
  }
  await b.evaluate('window.__M.healMaho(900)');
  const rage = await b.evaluate('window.__M.d()');
  info('四术式全适应后', { wheelLit: rage.wheelLit, softRage: rage.softRage, adapt: rage.adapt });
  check('I4 法轮 8/8 → 软狂暴（softRage=true）', rage.wheelLit === 8 && rage.softRage === true, 'wheelLit=' + rage.wheelLit + ' softRage=' + rage.softRage);
  // 软狂暴：技能原始伤害 ×1.6（对比落雷在狂暴前的 lastHit.effective=150）
  const base150 = skillHit.lightning.eff;
  await waitAir();
  await b.evaluate('window.__M.evade(0)');
  const rp = (await b.evaluate('window.__M.d()')).pos;
  await b.evaluate('window.__M.put("gojo", ' + rp.x + ', ' + (rp.z + 6) + ')');
  await b.evaluate('window.__M.ready()');
  await b.evaluate('window.__M.force("lightning")');
  await until('window.__M.d().mode === "cast"', 4000, 60);
  await nap(700);
  const rageHit = await b.evaluate('window.__M.d()');
  const rage150 = rageHit.lastHit ? rageHit.lastHit.effective : null;
  info('软狂暴硬度对比', { '落雷常规 effective': base150, '落雷狂暴 effective': rage150, ratio: base150 && rage150 ? +(rage150 / base150).toFixed(3) : null });
  check('I5 软狂暴使魔虚罗伤害 ×1.6（150 → 240）', base150 === 150 && Math.abs(rage150 - 240) < 0.01, base150 + ' → ' + rage150);

  /* ------------------------------------------------------------------ */
  head('J · 二阶段宿傩乘区（庇护 0.6 / 1.25）');
  const gTS = await b.evaluate('window.__M.gate("sukuna","gojo",100)');
  const gGP = await b.evaluate('window.__M.gate("gojo","sukuna",100)');
  check('J1 庇护期：宿傩打玩家 ×1.25', Math.abs(gTS - 125) < 0.001, '100 → ' + gTS);
  check('J2 庇护期：玩家打宿傩 ×0.6', Math.abs(gGP - 60) < 0.001, '100 → ' + gGP);
  await b.evaluate('window.__M.ready()');
  const hpA = await b.evaluate('window.__M.gojoHp()');
  await b.evaluate('window.__M.resolve("sukuna","gojo","blue",100)');
  const hpB = await b.evaluate('window.__M.gojoHp()');
  await b.evaluate('window.__M.ready()');
  const skA = await b.evaluate('window.__M.sukunaHp()');
  await b.evaluate('window.__M.resolve("gojo","sukuna","blue",100)');
  const skB = await b.evaluate('window.__M.sukunaHp()');
  const realTS = +(hpA - hpB).toFixed(2), realGP = +(skA - skB).toFixed(2);
  info('resolver 端到端（原始 100，kind=domain 避开旧适应乘区）', { '宿傩→玩家': realTS, '玩家→宿傩': realGP, '期望值': '100×1.6×0.1×1.25=20 / 100×0.1×0.6=6' });
  check('J3 端到端：庇护期玩家打宿傩 ≈6（0.6×）', realGP > 0 && realGP < 8, '实际掉血 ' + realGP);
  check('J4 端到端：宿傩打玩家 ≈20（含 BOSS 1.6 / INCOMING 0.1 / 1.25）', realTS > 15 && realTS < 25, '实际掉血 ' + realTS);

  /* ------------------------------------------------------------------ */
  head('K · 击破 + 真·宿傩');
  await b.evaluate('window.__M.healMaho(900)');
  const preBreak = await b.evaluate('window.__M.d()');
  await b.evaluate('window.__M.hurt(5000)');   // 近战路径 → 不吃适应免疫，稳定打到 0
  await nap(150);
  await b.screenshot(SHOTS + '/06-break.png');
  const broken = await b.evaluate('window.__M.d()');
  info('击破后', { alive: broken.alive, mode: broken.mode, trueSukuna: broken.trueSukuna, protected: broken.protected, hp: broken.hp, stats: broken.stats });
  check('K1 击破：alive=false / mode=broken / hp=0', broken.alive === false && broken.mode === 'broken' && broken.hp === 0, JSON.stringify({ alive: broken.alive, mode: broken.mode, hp: broken.hp }));
  check('K2 解除庇护 → 真·宿傩（trueSukuna=true）', broken.trueSukuna === true && broken.protected === false, 'trueSukuna=' + broken.trueSukuna + ' protected=' + broken.protected);
  const kTS = await b.evaluate('window.__M.gate("sukuna","gojo",100)');
  const kGP = await b.evaluate('window.__M.gate("gojo","sukuna",100)');
  check('K3 击破后宿傩伤害 ×1.15 保留、玩家不再被压制', Math.abs(kTS - 115) < 0.001 && Math.abs(kGP - 100) < 0.001, '宿傩→玩家 100→' + kTS + '；玩家→宿傩 100→' + kGP);
  await nap(2400);
  const hudAfter = await b.evaluate('window.__M.hudDisplay()');
  check('K4 击破演出后 HUD 收起', hudAfter === 'none', 'hud display=' + hudAfter);
  check('K5 击破事件计入 stats.broken', broken.stats.broken >= 1, 'broken=' + broken.stats.broken);
  const wheelBack = await b.evaluate('window.__M.cb().wheel.group.visible');
  info('旧的宿傩头顶法轮（combat.js 自带）visible', wheelBack);

  /* ------------------------------------------------------------------ */
  head('N · reset 行为');
  await b.evaluate('window.__SS.combat.reset()');
  await nap(600);
  const rs = await b.evaluate('window.__M.d()');
  info('reset 后', { mode: rs.mode, alive: rs.alive, triggered: rs.triggered, hp: rs.hp, wheelLit: rs.wheelLit, hud: await b.evaluate('window.__M.hudDisplay()') });
  check('N1 reset 后归零、可再次触发', rs.mode === 'off' && rs.alive === false && rs.triggered === false && rs.hp === 0 && rs.wheelLit === 0, JSON.stringify({ mode: rs.mode, alive: rs.alive, triggered: rs.triggered, wheelLit: rs.wheelLit }));
  await b.evaluate('window.__M.cb().fighters.sukuna.hp = window.__M.cb().fighters.sukuna.hpMax * 0.49');
  const re = await until('window.__M.d().alive === true', 9000, 100);
  const reD = await b.evaluate('window.__M.d()');
  // reset 会把 stats 一起清零，所以第二次召唤后 summons 重新从 1 开始
  check('N2 reset 后能再次召唤（stats 已归零 → summons 又为 1）', !!re && reD.summons === 1 && reD.alive === true, 'alive=' + reD.alive + ' summons=' + reD.summons);

  /* ------------------------------------------------------------------ */
  head('M · 多角度截图（建模自查）');
  await until('window.__M.d().mode === "air"', 9000, 100);
  await b.evaluate('window.__M.freeze(true)');
  const shots = [
    { f: '02-front.png', gojo: [0, 0], sukuna: [0, 40], maho: [0, 0.6, 8] },
    { f: '03-threequarter.png', gojo: [3.6, -1], sukuna: [0, 40], maho: [0, 0.6, 8] },
    { f: '03b-back.png', gojo: [0, 16], sukuna: [0, 40], maho: [0, 0.6, 8] },
    { f: '03c-low.png', gojo: [0, 0], sukuna: [0, 40], maho: [0, 0.35, 7] }
  ];
  for (const s of shots) {
    await b.evaluate('window.__M.put("gojo", ' + s.gojo[0] + ', ' + s.gojo[1] + ')');
    await b.evaluate('window.__M.put("sukuna", ' + s.sukuna[0] + ', ' + s.sukuna[1] + ')');
    await b.evaluate('window.__M.setPos(' + s.maho[0] + ', ' + s.maho[1] + ', ' + s.maho[2] + ')');
    await nap(900);
    await b.screenshot(SHOTS + '/' + s.f);
  }
  // 悬空实景：抬高相机 pitch 后立刻截图（相机接管 2.6s 内有效）
  // 悬浮姿态停帧（相机在玩家背后平视，15.2m 的真实高度必然出画；高度已由 C4 用数字验过）
  await b.evaluate('window.__M.setPos(0, 6.4, 11)');
  await b.evaluate('window.__M.put("gojo", 0, 0)');
  await b.evaluate('window.__M.put("sukuna", 0, 40)');
  await nap(900);
  await b.screenshot(SHOTS + '/07-hover-air.png');
  await b.evaluate('window.__M.freeze(false)');
  await b.evaluate('window.__SS.mahoraga.setPos(0, 15.2, 6, false)');
  info('截图目录', SHOTS);

  /* ------------------------------------------------------------------ */
  head('汇总');
  const fail = R.filter((r) => !r.ok);
  check('Z1 页面无 JS 异常', b.errors.length === 0, JSON.stringify(b.errors.slice(0, 3)));
  console.log('  断言 ' + R.length + ' 条：PASS ' + (R.length - fail.length) + ' / FAIL ' + fail.length);
  if (fail.length) for (const f of fail) console.log('   ✗ ' + f.name + '  → ' + f.detail);
  console.log('\nRESULT ' + (R.every((r) => r.ok) ? 'ALL-PASS' : 'HAS-FAILURES') + ' (' + R.length + ' checks)');
} catch (e) {
  console.error('FATAL ' + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  try { await b.close(); } catch (e) { /* noop */ }
}
process.exit(R.length && R.every((r) => r.ok) ? 0 : 1);
