/**
 * probe-ground-decal-ab.mjs —— 地面贴片可见性二分定位
 *
 *  Lead 报的两个观测：
 *   A) 路面上有硬边黑色矩形板
 *   B) 路面上有细长绿色发光条纹（像 z-fighting 贴片）
 *  方法：固定机位（路口），逐个把 city.group 里的地面图层 visible=false 后截图，二分确定归属。
 *
 * 用法：node _tools/probe-ground-decal-ab.mjs --out shots/wc-decal
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'shots/wc-decal');
const file = resolve(arg('file', 'dist/新宿决战.html'));
const gx = parseFloat(arg('gx', '2')), gz = parseFloat(arg('gz', '10')), pitch = parseFloat(arg('pitch', '0.32'));
const W = 1280, H = 720;

const b = new Browser({ port: parseInt(arg('port', '9686'), 10), width: W, height: H });
const report = { out, shots: [] };
try {
  await b.launch(); await b.newPage();
  const BS = String.fromCharCode(92);
  const url = 'file:///' + file.split(BS).join('/').split('/').map(encodeURIComponent).join('/');
  await b.send('Page.navigate', { url });
  await sleep(13000);
  await b.evaluate("document.getElementById('btn-skip-cine')?.click(); true");
  for (let i = 0; i < 60; i++) { await sleep(500); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(1200);
  await b.evaluate(`(() => {
    const S = window.__SS;
    if (S.gojo && S.gojo.setPos) S.gojo.setPos(${gx}, 0, ${gz});
    if (S.sukuna && S.sukuna.setPos) S.sukuna.setPos(${gx}, 0, ${gz - 7});
    window.__FORCE = ${pitch};
    if (!window.__FT) window.__FT = setInterval(() => { const c = S.cam; if (window.__FORCE != null) c.pitch = window.__FORCE; }, 16);
    try { S.combat.setAiEnabled(false); } catch (e) {}
    window.__HIDE = (names, on) => {
      let n = 0;
      S.city.group.traverse((o) => { if (names.indexOf(o.name) >= 0) { o.visible = !!on; n++; } });
      return n;
    };
    return 1;
  })()`);
  await sleep(2500);
  const LAYERS = ['building-ao', 'road-patches', 'crack-decals', 'light-pools', 'slabs', 'debris', 'rebar', 'manholes'];
  const cases = [
    { tag: 'all-on', off: [] },
    { tag: 'no-building-ao', off: ['building-ao'] },
    { tag: 'no-road-patches', off: ['road-patches'] },
    { tag: 'no-crack-decals', off: ['crack-decals'] },
    { tag: 'no-light-pools', off: ['light-pools'] },
    { tag: 'no-all-decals', off: ['building-ao', 'road-patches', 'crack-decals'] }
  ];
  for (const c of cases) {
    await b.evaluate('window.__HIDE(' + JSON.stringify(LAYERS) + ', true)');
    if (c.off.length) await b.evaluate('window.__HIDE(' + JSON.stringify(c.off) + ', false)');
    await sleep(450);
    const p = out + '-' + c.tag + '.png';
    await b.screenshot(p);
    report.shots.push(p);
  }
  report.visible = await b.evaluate('(() => { const o = {}; window.__SS.city.group.traverse((m) => { if (m.name) o[m.name] = m.visible; }); return o; })()');
} catch (e) { report.fatal = String((e && e.stack) || e); }
finally { await b.close(); }
console.log(JSON.stringify({ shots: report.shots, fatal: report.fatal || null }, null, 1));
