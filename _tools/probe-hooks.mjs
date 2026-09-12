/**
 * probe-hooks.mjs —— 钩子总线自检（Lead 用）
 * ----------------------------------------------------------------------------
 * 四个机制模块全部依赖 HOOKS 的挂点。挂点没触发 = 队友会白干几小时。
 * 这个探针往每个钩子上挂一个计数假钩子，然后用**真实输入**驱动游戏，
 * 验证每个钩子真的被调到、且参数形状正确。
 *
 * 用法：node _tools/probe-hooks.mjs [--file dist/新宿决战.html] [--port 9470]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
if (!existsSync(file)) { console.error('找不到 ' + file); process.exit(1); }

const b = new Browser({ port: parseInt(arg('port', '9470'), 10), width: 1280, height: 720 });
const R = { file, calls: {}, shapes: {}, notes: [], errors: [] };
const ev = (x) => b.evaluate(x);

const INSTALL = `(() => {
  const H = window.__SS.hooks;
  if (!H) return { ok: false, why: '没有 __SS.hooks' };
  const C = {}; window.__HC = C;
  const add = (name, fn) => { C[name] = 0; H[name].push(function () { C[name]++; return fn && fn.apply(null, arguments); }); };
  const keys = Object.keys(H);
  for (const k of keys) { C[k] = 0; }
  add('tick', () => { const a = arguments; });
  H.tick[H.tick.length - 1] = function (cb, dt, t) { C.tick++; C._tickArgs = [typeof cb, typeof dt, typeof t]; };
  for (const k of ['hud','move','locomotion','segment','aim','damageGate','onHitDone','beforeCast','blackFlash','reset']) {
    H[k].push(function () {
      C[k]++;
      const a = Array.prototype.slice.call(arguments);
      C['_' + k + 'Args'] = a.map((v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v));
      C['_' + k + 'Len'] = a.length;
      return undefined;
    });
  }
  return { ok: true, names: keys, lengths: keys.map((k) => k + ':' + H[k].length) };
})()`;

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000);
  await b.pressKey('Space');
  await sleep(3000);
  R.install = await ev(INSTALL);

  // 先测四个术式的 aim/segment（此刻必定还活着）
  R.stateBeforeSkills = await ev('__SS.state');
  await b.pressKey('KeyU'); await sleep(700);
  await b.pressKey('KeyI'); await sleep(900);
  await b.pressKey('KeyO', 1400); await sleep(2200);
  const afterSkills = await ev('window.__HC');
  R.stateAfterSkills = await ev('(() => ({ state: __SS.state, fields: __SS.combat.fields.map(f => f.kind) }))()');
  // 再走到宿傩身边打一套（近战 segment / damageGate / blackFlash）
  await b.keyDown('KeyW'); await sleep(900); await b.keyUp('KeyW');
  await sleep(300);
  for (let i = 0; i < 10; i++) { await b.pressKey('KeyJ', 40); await sleep(180); }
  await b.pressKey('KeyK', 60); await sleep(300);
  R.stateAfterMelee = await ev('(() => ({ state: __SS.state, gHp: Math.round(__SS.snap.gojo.hp), sHp: Math.round(__SS.snap.sukuna.hp) }))()');
  R.calls = await ev('window.__HC');
  // 领域（beforeCast 走的是 SkillRunner.start）
  await ev('__SS.combat.forceSkill("void","gojo")');
  await sleep(1500);
  R.calls = await ev('window.__HC');
  R.afterSkills = afterSkills;
  R.domain = await ev('(() => ({ mode: __SS.snap.mode, domainG: Math.round(__SS.snap.gojo.domain), clash: !!__SS.snap.clashActive }))()');
  // reset
  const before = await ev('window.__HC.reset');
  await ev('__SS.combat.reset()');
  await sleep(500);
  R.resetDelta = (await ev('window.__HC.reset')) - before;
  R.final = await ev('window.__HC');
  R.mech = await ev('(() => { try { return Object.keys(__SS.mech()); } catch (e) { return String(e); } })()');
  R.errors.push(...b.errors.slice(0, 8).map(e => e.text || String(e)));
} catch (e) { R.fatal = String(e && e.stack || e); }
finally { await b.close(); }
console.log(JSON.stringify(R, null, 2));
