/**
 * flowtest.mjs —— 状态流转与 UI 流程测试
 *
 * 覆盖 acceptance 之外的流程面：暂停/继续、结算触发、再战、返回标题、重新开始。
 * 这些流程只有"玩到那一步"才会暴露问题，静态截图看不出来。
 *
 * 用法：node _tools/flowtest.mjs [--file dist/新宿决战.html]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const outPrefix = arg('out', 'shots/flow');
if (!existsSync(file)) { console.error('找不到 ' + file); process.exit(1); }

const b = new Browser({ port: parseInt(arg('port', '9431'), 10), width: 1600, height: 900 });
const rec = { steps: [], fails: [] };
const step = (name, ok, detail) => { rec.steps.push({ name, ok, detail }); if (!ok) rec.fails.push(name + ': ' + JSON.stringify(detail)); };

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);

  const vis = (id) => b.evaluate(`(() => { const e = document.getElementById('${id}'); if (!e) return null; const r = e.getBoundingClientRect(); return { hidden: e.classList.contains('hidden'), w: r.width, h: r.height }; })()`);
  const click = (id) => b.evaluate(`document.getElementById('${id}')?.click(); true`);
  // 注意：必须读 window.__SS.state（main.js 的游戏状态机），
  // 不能读 snap.mode —— 后者是 combat 的内部模式，标题界面下也一直是 'fight'，会误导断言。
  const mode = () => b.evaluate(`window.__SS ? window.__SS.state : null`);
  const hp = () => b.evaluate(`(() => { const s = window.__SS && window.__SS.snap; return s ? { g: +s.gojo.hp.toFixed(0), s: +s.sukuna.hp.toFixed(0), gd: s.gojo.dead, sd: s.sukuna.dead } : null; })()`);

  // 1) 标题界面
  step('标题界面显示', !!(await vis('title')) && !(await vis('title')).hidden, await vis('title'));

  // 2) 开战（走播片）
  await click('btn-start');
  await sleep(4000);
  const cineShown = await b.evaluate(`(() => { const c = document.getElementById('cine-ui'); return c && !c.classList.contains('hidden'); })()`);
  rec.cineAtStart = cineShown;
  await b.pressKey('Space'); await sleep(1800);
  step('空格可跳过播片', (await mode()) !== 'cutscene', await mode());
  step('进入战斗', (await mode()) === 'fight', await mode());

  // 3) 暂停 / 继续
  await b.pressKey('KeyP'); await sleep(900);
  const pausedVis = await vis('pause');
  step('P 可暂停', pausedVis && !pausedVis.hidden, pausedVis);
  const modePaused = await mode();
  step('暂停时状态为 paused', modePaused === 'paused', modePaused);
  await b.screenshot(outPrefix + '-pause.png');
  await click('btn-resume'); await sleep(900);
  step('可继续', (await mode()) === 'fight', await mode());

  // 4) 暂停 → 返回标题
  await b.pressKey('KeyP'); await sleep(700);
  await click('btn-totitle'); await sleep(1500);
  step('返回标题', !!(await vis('title')) && !(await vis('title')).hidden, await vis('title'));
  await b.screenshot(outPrefix + '-title.png');

  // 5) 直接进入战斗 → 打空宿傩血 → 触发结算
  await click('btn-skip-cine'); await sleep(4000);
  step('再次进入战斗', (await mode()) === 'fight', await mode());
  // 用调试接口直接压血，快速走到结算（避免为空血跑 4 分钟）
  const before = await hp();
  for (let i = 0; i < 12; i++) {
    await b.evaluate(`(() => { const c = window.__SS && window.__SS.combat; if (c && c.applyDamage) c.applyDamage('sukuna', 400); return true; })()`);
    await sleep(320);
  }
  await sleep(5000);
  const after = await hp();
  rec.hp = { before, after };
  const resVis = await vis('result');
  step('宿傩死亡触发结算', !!(resVis && !resVis.hidden), { after, resVis });
  await b.screenshot(outPrefix + '-result.png');
  rec.resultText = await b.evaluate(`(() => ({ title: (document.getElementById('result-title')||{}).textContent, mark: (document.getElementById('result-mark')||{}).textContent, sub: (document.getElementById('result-sub')||{}).textContent, stats: (document.getElementById('result-stats')||{}).textContent }))()`);

  // 6) 再战
  if (resVis && !resVis.hidden) {
    await click('btn-again'); await sleep(3500);
    const h2 = await hp();
    step('再战血条满血重置', !!(h2 && h2.g > 1400 && h2.s > 1700), h2);
    step('再战回到战斗状态', ['fight','clash'].includes(await mode()), await mode());
    await b.screenshot(outPrefix + '-again.png');
  }

  // 7) 反向：打空五条悟血 → 失败结算
  for (let i = 0; i < 12; i++) {
    await b.evaluate(`(() => { const c = window.__SS && window.__SS.combat; if (c && c.applyDamage) c.applyDamage('gojo', 400); return true; })()`);
    await sleep(320);
  }
  await sleep(5000);
  const resVis2 = await vis('result');
  rec.loseResult = await b.evaluate(`(() => ({ title: (document.getElementById('result-title')||{}).textContent, mark: (document.getElementById('result-mark')||{}).textContent }))()`);
  step('五条悟死亡触发结算', !!(resVis2 && !resVis2.hidden), resVis2);
  await b.screenshot(outPrefix + '-lose.png');

  // 8) 返回标题后再开一局，检查无残留
  await click('btn-back'); await sleep(1800);
  await click('btn-skip-cine'); await sleep(4000);
  const h3 = await hp();
  step('重开后状态干净', ['fight','clash'].includes(await mode()), await mode());
  rec.afterReopen = h3;
  await b.screenshot(outPrefix + '-reopen.png');

  rec.errors = b.errors.slice(0, 20);
  step('全程无运行期异常', rec.errors.length === 0, rec.errors.slice(0,3));
} catch (e) {
  rec.fatal = String(e && e.stack || e);
} finally { await b.close(); }
rec.pass = rec.fails.length === 0 && !rec.fatal;
console.log(JSON.stringify(rec, null, 2));
process.exit(rec.pass ? 0 : 1);
