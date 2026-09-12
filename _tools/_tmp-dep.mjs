import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const file = resolve('dist/新宿决战.html');
const b = new Browser({ port: 9471, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  await b.evaluate("document.getElementById('btn-start')?.click()");
  await sleep(4000); await b.pressKey('Space'); await sleep(3000);
  const pre = await b.evaluate("(() => ({ state: __SS.state, mode: __SS.combat.mode, ce: Math.round(__SS.snap.gojo.ce), fields: __SS.combat.fields.length, skills: __SS.snap.skills.map(s=>s.skill+':'+(s.ready?'R':'x')+s.cd.toFixed(1)).join(',') }))()");
  console.log('PRE', JSON.stringify(pre));
  await b.pressKey('KeyU', 60);
  await sleep(900);
  const post = await b.evaluate("(() => ({ ce: Math.round(__SS.snap.gojo.ce), fields: __SS.combat.fields.length, kinds: __SS.combat.fields.map(f=>f.kind), seq: __SS.combat.getSnapshot().banner }))()");
  console.log('POST-U', JSON.stringify(post));
  await b.pressKey('KeyI', 60); await sleep(1000);
  console.log('POST-I', JSON.stringify(await b.evaluate("(() => ({ fields: __SS.combat.fields.map(f=>f.kind), ce: Math.round(__SS.snap.gojo.ce) }))()")));
  await b.pressKey('KeyO', 1500); await sleep(2000);
  console.log('POST-O', JSON.stringify(await b.evaluate("(() => ({ fields: __SS.combat.fields.map(f=>f.kind), ce: Math.round(__SS.snap.gojo.ce) }))()")));
  const errs = b.errors.slice(0,5).map(e=>e.text||String(e));
  console.log('ERRORS', JSON.stringify(errs));
} catch(e) { console.log('FATAL', String(e).slice(0,600)); } finally { await b.close(); }
