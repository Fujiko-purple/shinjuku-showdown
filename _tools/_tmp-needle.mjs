import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const file = resolve('tmp/lead/dist.html');
const b = new Browser({ port: 9487, width: 1600, height: 900 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  // 页内高频采样 needle
  await ev(`(() => { window.__S = []; window.__STOP = false;
    (function l(){ if (window.__STOP) return; const d = (__SS.mech().duel)||null;
      if (d) { window.__S.push([performance.now(), d.needle, d.lo, d.hi, d.period||0, d.width||0, d.active ? 1 : 0]);
        if (d.active && d.needle >= d.lo && d.needle <= d.hi) { __INJECT.press('KeyJ'); setTimeout(() => __INJECT.release('KeyJ'), 12); } }
      requestAnimationFrame(l); })();
    return true; })()`);
  await ev('__SS.combat.forceSkill("void","gojo"); __SS.combat.forceSkill("shrine","sukuna");');
  await sleep(9000);
  await ev('window.__STOP = true');
  const S = await ev('window.__S');
  const Active = S.filter((x) => x[6] === 1);
  const revs = [];
  { let dir = 0; for (let i = 1; i < Active.length; i++) { const dv = Active[i][1] - Active[i-1][1]; if (Math.abs(dv) < 1e-6) continue; const nd = dv > 0 ? 1 : -1; if (dir !== 0 && nd !== dir) revs.push(Active[i][0]); dir = nd; } }
  const halfPeriods = [];
  for (let i = 1; i < revs.length; i++) halfPeriods.push((revs[i] - revs[i-1]) / 1000);
  console.log('ACTIVE_ONLY', JSON.stringify({ activeSamples: Active.length, reversals: revs.length,
    halfPeriodSec: halfPeriods.map(v => +v.toFixed(2)).slice(0, 10),
    roundTripSec: halfPeriods.length ? +(2 * halfPeriods.reduce((a, b) => a + b, 0) / halfPeriods.length).toFixed(2) : null,
    dwellsMs: (() => { const D = []; let t0 = null; for (const s of Active) { const ins = s[1] >= s[2] && s[1] <= s[3]; if (ins && t0 === null) t0 = s[0]; if (!ins && t0 !== null) { D.push(Math.round(s[0] - t0)); t0 = null; } } return D.slice(0, 12); })() }));
  const n = S.length;
  // 速度：|Δneedle|/Δt 的中位数；窗口停留：连续在 [lo,hi] 内的时长
  const sp = [], dwells = [];
  let inT0 = null;
  for (let i = 1; i < n; i++) {
    const dt = (S[i][0] - S[i-1][0]) / 1000;
    if (dt > 0 && dt < 0.1) sp.push(Math.abs(S[i][1] - S[i-1][1]) / dt);
    const inside = S[i][1] >= S[i][2] && S[i][1] <= S[i][3];
    if (inside && inT0 === null) inT0 = S[i][0];
    if (!inside && inT0 !== null) { dwells.push(S[i][0] - inT0); inT0 = null; }
  }
  sp.sort((a, b) => a - b);
  const med = sp[sp.length >> 1] || 0;
  const winSeq = [];
  for (let i = 1; i < n; i++) if (Math.abs(S[i][2] - S[i-1][2]) > 1e-6) winSeq.push(+((S[i][0] - 0) / 1000).toFixed(2));
  console.log(JSON.stringify({ samples: n, spanSec: n ? +((S[n-1][0] - S[0][0]) / 1000).toFixed(2) : 0,
    needleSpeedMedian: +med.toFixed(3), impliedRoundTripSec: med > 0.01 ? +(4 / med).toFixed(2) : null,
    dwellsMs: dwells.map(d => Math.round(d)).slice(0, 12),
    windowChanges: winSeq.length, windowChangeTimes: winSeq.slice(0, 10),
    lastPeriod: S[n-1][4], lastWidth: S[n-1][5],
    sample: S.slice(0, 3).map(x => [x[1].toFixed(3), x[2].toFixed(3), x[3].toFixed(3)]) }, null, 1));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
