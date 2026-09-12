import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const file = resolve('dist/新宿决战.html');
const b = new Browser({ port: 9473, width: 1280, height: 720 });
const ev = (x) => b.evaluate(x);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await ev("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  await ev(`(() => { const H = __SS.hooks; window.__A = { aim: [], seg: [] };
    H.aim.push(function(cb, owner, from, dir, skill){ window.__A.aim.push(skill); return undefined; });
    H.segment.push(function(cb, p0, p1, r, meta){ window.__A.seg.push(meta.skill); return undefined; });
    return true; })()`);
  const steps = [];
  const rec = async (label) => { const a = await ev('({ aim: window.__A.aim.slice(), seg: window.__A.seg.slice(), ce: Math.round(__SS.snap.gojo.ce), fields: __SS.combat.fields.map(f=>f.kind), state: __SS.state })'); steps.push({ label, aim: a.aim, segCounts: a.seg.reduce((m,s)=>(m[s]=(m[s]||0)+1,m),{}), ce: a.ce, fields: a.fields, state: a.state }); };
  // 走远一点，避免被打断
  await b.keyDown('KeyS'); await sleep(1200); await b.keyUp('KeyS'); await sleep(400);
  await b.pressKey('KeyU', 60); await sleep(900); await rec('after-blue');
  await b.pressKey('KeyI', 60); await sleep(1200); await rec('after-red');
  await b.pressKey('KeyO', 900); await sleep(2200); await rec('after-purple');
  const L = await ev("(() => ({ skill: __SS.snap.skills.map(s => s.skill + ':' + (s.ready ? 'R' : 'cd' + s.cd.toFixed(1))) }))()");
  console.log(JSON.stringify({ steps, L, errs: b.errors.slice(0,3).map(e=>e.text||String(e)) }, null, 1));
} catch(e) { console.log('FATAL', String(e).slice(0,500)); } finally { await b.close(); }
