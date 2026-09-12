/**
 * verify-art.mjs —— 机制画面主观审查 + HUD 可读性体检（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 四个机制都是「看得见」的交付物，光有数字不算过。本脚本负责：
 *   1. 把四个机制各自最关键的瞬间截图到 shots/verifier/art/（人工看图给 pass/fail）
 *   2. 自建 HUD（魔虚罗血条 / 同步轴 / 咒按钮）做 DOM 体检：
 *      是否存在、是否在视口内、是否和其它 HUD 元素重叠、文字是否能读到
 * 用法：node _tools/verify-art.mjs [--file dist/新宿决战.html] [--port 9518] [--mobile] [--parts fight,sprint,bf,summon,duel]
 */
import { Rig, arg, flag, sleep, DEFAULT_FILE } from './verify-lib.mjs';

const file = arg('file', DEFAULT_FILE);
const port = parseInt(arg('port', '9518'), 10);
const mobile = flag('mobile');
const parts = (arg('parts', 'fight,sprint,bf,summon,duel')).split(',');
const rig = new Rig({ port, file, name: 'art' + (mobile ? '-mobile' : ''), mobile, shots: 'shots/verifier/art' });
const has = (p) => parts.includes(p);

const CODE_HELP = [
  'window.__MECH2 = function () { try { var m = window.__SS.mech; return typeof m === "function" ? m() : (m || {}); } catch (e) { return {}; } };',
  'window.__HUDTEXT = function () {',
  '  var keys = ["魔虚罗", "八握剑", "适应", "同步", "裂纹", "咒"];',
  '  var out = [];',
  '  var all = document.querySelectorAll("*");',
  '  for (var i = 0; i < all.length; i++) {',
  '    var el = all[i];',
  '    if (el.children.length) continue;',
  '    var tx = (el.textContent || "").trim();',
  '    if (!tx) continue;',
  '    var hit = false;',
  '    for (var k = 0; k < keys.length; k++) if (tx.indexOf(keys[k]) >= 0) hit = true;',
  '    if (!hit) continue;',
  '    var r = el.getBoundingClientRect();',
  '    var cs = getComputedStyle(el);',
  '    out.push({ text: tx.slice(0, 30), id: el.id || "", cls: String(el.className || "").slice(0, 40),',
  '      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),',
  '      color: cs.color, fs: cs.fontSize,',
  '      visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0" });',
  '  }',
  '  return out;',
  '};',
  'window.__HUDOVERLAP = function (list) {',
  '  var bad = [];',
  '  for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {',
  '    var a = list[i], b = list[j];',
  '    var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);',
  '    var oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);',
  '    if (ox > 4 && oy > 4) bad.push({ a: a.text, b: b.text, ox: ox, oy: oy });',
  '  }',
  '  return bad;',
  '};',
  'window.__OFFSCREEN = function (list) {',
  '  var W = innerWidth, H = innerHeight, bad = [];',
  '  for (var i = 0; i < list.length; i++) {',
  '    var r = list[i];',
  '    if (!r.visible) continue;',
  '    if (r.x < -2 || r.y < -2 || r.x + r.w > W + 2 || r.y + r.h > H + 2) bad.push(r);',
  '  }',
  '  return bad;',
  '};',
  'true',
].join('\n');

async function hudAudit(tag) {
  const list = await rig.ev('window.__HUDTEXT()');
  const ov = await rig.ev('window.__HUDOVERLAP(window.__HUDTEXT())');
  const off = await rig.ev('window.__OFFSCREEN(window.__HUDTEXT())');
  console.log('[' + tag + '] HUD 关键文字元素 ' + list.length + ' 个: ' + JSON.stringify(list.slice(0, 14)));
  console.log('[' + tag + '] 相互重叠 ' + ov.length + ' 组: ' + JSON.stringify(ov.slice(0, 6)));
  console.log('[' + tag + '] 越出视口 ' + off.length + ' 个: ' + JSON.stringify(off.slice(0, 6)));
  return { list, ov, off };
}

try {
  await rig.start();
  console.log('产物 ' + file + ' 视口 ' + rig.width + 'x' + rig.height + ' mobile=' + mobile);
  await rig.ev(CODE_HELP);

  if (has('fight')) {
    await sleep(1500);
    await rig.shot('00-fight');
    const a = await hudAudit('普通战斗');
    rig.check('普通战斗 HUD 无越界元素', a.off.length === 0, JSON.stringify(a.off.slice(0, 3)));
  }

  if (has('sprint')) {
    await rig.hold('ShiftLeft'); await rig.hold('KeyW');
    await sleep(900);
    await rig.shot('01-sprint-speedline');
    await sleep(600);
    await rig.shot('02-sprint-far');
    await rig.release('KeyW'); await rig.release('ShiftLeft');
    await sleep(900);
  }

  if (has('bf')) {
    await rig.ev('(() => { const S = window.__SS; const g = S.gojo; const sk = S.sukuna; const sp = sk.root.position; g.root.position.set(sp.x, 0, sp.z + 1.6); g.faceTo(sp.x, sp.z, true); return true; })()');
    await sleep(500);
    await rig.reset(true);
    await rig.watch('({pv: S.combat.pressFrame.v, pl: S.combat.pressFrame.light, f: S.combat.frame, now: performance.now()})');
    const t = await rig.tick();
    await rig.sched(t + 4, 'KeyJ');
    await rig.sched(t + 8, 'KeyV');
    await sleep(500);
    await rig.shot('03-bf-swing');
    await sleep(500);
    await rig.shot('04-bf-hitframe');
    const run = await rig.take();
    console.log('黑闪瞬间采样: ' + JSON.stringify(run.samples.slice(-8)));
    await sleep(1200);
    await rig.shot('05-bf-after');
  }

  if (has('summon')) {
    await rig.ev('window.__SS.combat.reset()');
    await sleep(600);
    await rig.ev('window.__SS.combat.applyDamage("sukuna", 900)');
    await sleep(500);
    await rig.shot('06-summon-early');
    await sleep(1200);
    await rig.shot('07-summon-mid');
    await sleep(2500);
    await rig.shot('08-mahoraga-steady');
    const a = await hudAudit('魔虚罗出场');
    rig.check('魔虚罗 HUD 血条/名字存在', a.list.some(l => l.text.indexOf('魔虚罗') >= 0 || l.text.indexOf('八握剑') >= 0), JSON.stringify(a.list.slice(0, 6)));
    rig.check('魔虚罗 HUD 无越界元素', a.off.length === 0, JSON.stringify(a.off.slice(0, 3)));
    await rig.ev('(() => { const c = window.__SS.cam; c.dist = Math.max(12, (c.dist || 30) * 0.55); return c.dist; })()');
    await sleep(900);
    await rig.shot('09-mahoraga-close');
  }

  if (has('duel')) {
    await rig.ev('(() => { const c = window.__SS.combat; c.reset(); c.forceSkill("void","gojo"); c.forceSkill("shrine","sukuna"); return true; })()');
    const ok = await rig.waitFor('window.__SS.snap.clashActive === true', 9000, 60);
    console.log('领域对决已开始=' + ok);
    await sleep(700);
    await rig.shot('10-clash-start');
    await rig.ev('window.__V.press("KeyJ")');
    await sleep(1400);
    await rig.shot('11-clash-sync');
    const a = await hudAudit('领域对决');
    rig.check('领域对决自建 HUD 存在（同步轴）', a.list.some(l => l.text.indexOf('同步') >= 0) || a.list.some(l => l.text.indexOf('裂纹') >= 0), JSON.stringify(a.list.slice(0, 8)));
    rig.check('领域对决 HUD 无越界元素', a.off.length === 0, JSON.stringify(a.off.slice(0, 3)));
  }

  await rig.shot('99-final');
  rig.check('全流程无页面错误', rig.errors().length === 0, JSON.stringify(rig.errors()));
} catch (e) {
  console.log('FATAL ' + (e && e.stack || e));
  rig.check('脚本未抛错', false, String((e && e.message) || e));
} finally {
  await rig.finish();
}
