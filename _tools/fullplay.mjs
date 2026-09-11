/**
 * fullplay.mjs —— 打完整一局（Lead 的"实际游玩"工具）
 *
 * play.mjs 是"抽帧看画面"，fullplay 是"把一局打完"：
 * 持续进攻 + 合理闪避 + 按冷却放技能，直到一方死亡，然后走结算流程。
 * 用来暴露只有长局才会出现的问题：卡死、AI 摆烂、结算不触发、重开残留等。
 *
 * 用法：node _tools/fullplay.mjs [--file dist/新宿决战.html] [--max 300] [--out shots/full]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const maxSec = parseInt(arg('max', '240'), 10);
const outPrefix = arg('out', 'shots/full');
if (!existsSync(file)) { console.error('找不到 ' + file); process.exit(1); }

const b = new Browser({ port: parseInt(arg('port', '9421'), 10), width: 1600, height: 900 });
const log = [];
const rec = { file, events: [], timeline: [], errors: [], result: null };

const read = () => b.evaluate(`(() => {
  const SS = window.__SS;
  const s = SS && SS.snap;
  if (!s) return null;
  return { gHp: +s.gojo.hp.toFixed(0), gMax: s.gojo.hpMax, sHp: +s.sukuna.hp.toFixed(0), sMax: s.sukuna.hpMax,
           gDead: s.gojo.dead, sDead: s.sukuna.dead, combo: s.combo, mode: s.mode, phase: s.phase,
           domG: +s.gojo.domain.toFixed(0), domS: +s.sukuna.domain.toFixed(0), clash: !!s.clashActive,
           dist: +s.distance.toFixed(1), ce: +s.gojo.ce.toFixed(0),
           skills: s.skills.map(k => ({ s: k.skill, ready: k.ready, cd: +k.cd.toFixed(1), cost: k.cost })),
           banner: s.banner };
})()`);

try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);

  const crash = await b.evaluate(`(() => { const c = document.getElementById('crash'); return c && !c.classList.contains('hidden') ? (document.getElementById('crash-msg')||{}).textContent : null; })()`);
  if (crash) { rec.fatal = '启动即崩溃: ' + crash; throw new Error(rec.fatal); }

  // 走完整流程：点「开战」→ 播片 → 空格跳过 → 战斗
  await b.evaluate(`document.getElementById('btn-start')?.click()`);
  await sleep(4000);
  await b.pressKey('Space');
  await sleep(3000);
  let st = await read();
  rec.timeline.push({ t: 0, mode: st && st.mode, note: '进入战斗' });

  const t0 = Date.now();
  let lastCombo = 0, lastPhase = '';
  const shots = [];
  let i = 0;
  while (Date.now() - t0 < maxSec * 1000) {
    i++;
    st = await read();
    if (!st) { rec.errors.push('快照为 null'); break; }
    if (st.sDead || st.gDead) { rec.events.push({ t: ((Date.now()-t0)/1000).toFixed(1), type: 'KO', detail: st.sDead ? '宿傩倒下' : '五条倒下' }); break; }

    // 战斗决策：接近 → 连段 → 技能
    try {
      await b.keyDown('KeyW'); await sleep(160); await b.keyUp('KeyW');
      for (const k of ['KeyJ','KeyJ','KeyJ']) { await b.pressKey(k, 45); await sleep(150); }
      await b.pressKey('KeyK', 55); await sleep(120);

      const ready = st.skills.filter(k => k.ready && k.cost <= st.ce);
      if (st.domG >= 100) { await b.pressKey('KeyG'); await sleep(400); rec.events.push({ t: ((Date.now()-t0)/1000).toFixed(1), type: 'DOMAIN' }); }
      else if (ready.some(k => k.s === 'purple') && i % 7 === 0) { await b.pressKey('KeyO', 900); await sleep(600); rec.events.push({ t: ((Date.now()-t0)/1000).toFixed(1), type: 'PURPLE' }); }
      else if (ready.some(k => k.s === 'red') && i % 5 === 0) { await b.pressKey('KeyI'); await sleep(300); rec.events.push({ t: ((Date.now()-t0)/1000).toFixed(1), type: 'RED' }); }
      else if (ready.some(k => k.s === 'blue') && i % 4 === 0) { await b.pressKey('KeyU'); await sleep(250); rec.events.push({ t: ((Date.now()-t0)/1000).toFixed(1), type: 'BLUE' }); }
      else if (st.gHp < st.gMax * 0.5 && st.ce > 45 && i % 9 === 0) { await b.pressKey('KeyH'); await sleep(250); }
      else { await b.pressKey('Space', 35); await sleep(80); }

      if (st.phase !== lastPhase) { lastPhase = st.phase; rec.timeline.push({ t: ((Date.now()-t0)/1000).toFixed(1), phase: st.phase }); }
      if (st.combo > lastCombo + 4) { lastCombo = st.combo; rec.timeline.push({ t: ((Date.now()-t0)/1000).toFixed(1), combo: st.combo }); }
      if (st.clash && !rec.timeline.some(x => x.clash)) { rec.timeline.push({ t: ((Date.now()-t0)/1000).toFixed(1), clash: true }); }
    } catch (e) { rec.errors.push('输入失败: ' + String(e).slice(0,120)); }

    if (i % 20 === 0) {
      const p = `${outPrefix}-${String(i/20|0).padStart(2,'0')}.png`;
      await b.screenshot(p); shots.push(p);
      rec.timeline.push({ t: ((Date.now()-t0)/1000).toFixed(1), hp: `${st.gHp}/${st.sHp}`, combo: st.combo });
    }
  }
  rec.elapsedSec = +((Date.now() - t0) / 1000).toFixed(1);
  rec.shots = shots;
  rec.final = await read();

  // 结算流程：看 result 面板是否出现、能否重开
  await sleep(6000);
  rec.result = await b.evaluate(`(() => {
    const r = document.getElementById('result');
    const vis = r && !r.classList.contains('hidden');
    return { resultVisible: !!vis, title: (document.getElementById('result-title')||{}).textContent,
             mark: (document.getElementById('result-mark')||{}).textContent,
             stats: (document.getElementById('result-stats')||{}).textContent,
             sub: (document.getElementById('result-sub')||{}).textContent };
  })()`);
  await b.screenshot(outPrefix + '-99-result.png');
  rec.shots.push(outPrefix + '-99-result.png');

  // 重开是否干净
  if (rec.result.resultVisible) {
    await b.evaluate(`document.getElementById('btn-again')?.click()`);
    await sleep(4000);
    const after = await read();
    rec.restart = { hp: after && `${after.gHp}/${after.sHp}`, mode: after && after.mode, clean: !!(after && after.gHp === after.gMax && after.sHp === after.sMax) };
    await b.screenshot(outPrefix + '-98-restart.png');
    rec.shots.push(outPrefix + '-98-restart.png');
  }

  rec.errors.push(...b.errors.slice(0, 20).map(e => e.text || String(e)));
} catch (e) {
  rec.fatal = String(e && e.stack || e);
} finally { await b.close(); }
console.log(JSON.stringify(rec, null, 2));
