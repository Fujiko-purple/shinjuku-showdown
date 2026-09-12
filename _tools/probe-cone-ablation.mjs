/**
 * probe-cone-ablation.mjs —— 沿街「暖雾」逐层消融实验
 *
 * 复用 probe-vfxab.mjs 的机位与量法（同帧、固定 pitch、量 y30%~60% 中段亮度），
 * 逐个隐藏 city.group 里的加法混合图层，量化每一层对中段亮度的贡献。
 * 只改 visible 标志，不改游戏代码。
 *
 * 用法：node _tools/probe-cone-ablation.mjs --out shots/wc-cone-ab
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'shots/wc-cone-ab');
const file = resolve(arg('file', 'dist/新宿决战.html'));
const W = 1280, H = 720;
const gx = parseFloat(arg('gx', '4')), gz = parseFloat(arg('gz', '16')), pitch = parseFloat(arg('pitch', '0.34'));

const b = new Browser({ port: parseInt(arg('port', '9684'), 10), width: W, height: H });
const report = { out, rows: [], shots: [] };
const measure = async () => {
  const cap = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 0.25 }, captureBeyondViewport: false });
  const uri = 'data:image/png;base64,' + cap.data;
  return await b.evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(uri)}; await img.decode();
    const CW = 320, CH = 180;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0, CW, CH);
    const d = c2.getImageData(0, 0, CW, CH).data;
    let sB = 0, nB = 0, wB = 0, blown = 0;
    let sN = 0, nN = 0, wN = 0;
    const y0 = Math.floor(CH * 0.30), y1 = Math.floor(CH * 0.60);
    const y2 = Math.floor(CH * 0.62), y3 = Math.floor(CH * 0.88);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = (y * CW + x) * 4;
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      if (l > 245) blown++;
      if (y >= y0 && y < y1) { sB += l; nB++; if (r > bl * 1.25 && r > 40) wB++; }
      if (y >= y2 && y < y3) { sN += l; nN++; if (r > bl * 1.25 && r > 40) wN++; }
    }
    return { bandAvg: +(sB / nB).toFixed(1), bandWarmPct: +(wB / nB * 100).toFixed(1), nearAvg: +(sN / nN).toFixed(1), nearWarmPct: +(wN / nN * 100).toFixed(1), blownPct: +(blown / (CW * CH) * 100).toFixed(1) };
  })()`);
};
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
    const g = S.combat && S.combat.gojo;
    if (g && g.p) g.p.set(${gx}, 0, ${gz});
    if (S.gojo && S.gojo.setPos) S.gojo.setPos(${gx}, 0, ${gz});
    const k = S.combat && S.combat.sukuna;
    if (k && k.p) k.p.set(${gx}, 0, ${gz - 8});
    if (S.sukuna && S.sukuna.setPos) S.sukuna.setPos(${gx}, 0, ${gz - 8});
    window.__FORCE = ${pitch};
    if (!window.__FT) window.__FT = setInterval(() => { const c = S.cam; if (window.__FORCE != null) c.pitch = window.__FORCE; }, 16);
    try { S.combat.setAiEnabled(false); } catch (e) {}
    // 关掉 bloom 与 vfx 的局部色阶，只看城市自身
    const U = S.render.composite.uniforms;
    U.uBloom.value = 0;
    for (const key of ['uHazeK', 'uBloomFloor', 'uBloomCap']) if (U[key]) U[key].value = key === 'uBloomFloor' ? 0.14 : 0;
    window.__AB = (names, on) => { const g2 = S.city.group; g2.traverse((o) => { if (names.indexOf(o.name) >= 0) o.visible = !!on; }); return names.length; };
    return 1;
  })()`);
  await sleep(2000);
  const LAYERS = ['lamp-shafts', 'lamp-halos', 'light-pools', 'neon-glow', 'ambient-dust', 'dust', 'shopfronts', 'neon-v', 'neon-h', 'road-markings', 'sidewalk', 'ground', 'sky-dome', 'skyline-mid', 'skyline-far', 'ad-screen-0', 'ad-screen-1', 'roof-signs'];
  const CASE_NAMES = readLabels();
  function readLabels() { return LAYERS; }
  const cases = [{ tag: 'all-on', off: [] }];
  for (const L of LAYERS) cases.push({ tag: 'no-' + L, off: [L] });
  cases.push({ tag: 'no-light-pools-near', off: ['light-pools'] });
  cases.push({ tag: 'no-shafts+halos', off: ['lamp-shafts', 'lamp-halos'] });
  cases.push({ tag: 'no-shafts+pools+glow', off: ['lamp-shafts', 'light-pools', 'neon-glow'] });
  cases.push({ tag: 'no-all-additive', off: ['lamp-shafts', 'lamp-halos', 'light-pools', 'neon-glow', 'ambient-dust', 'dust'] });
  cases.push({ tag: 'no-shopfronts', off: ['shopfronts'] });
  cases.push({ tag: 'no-neon', off: ['neon-v', 'neon-h', 'roof-signs'] });
  cases.push({ tag: 'no-markings', off: ['road-markings'] });
  cases.push({ tag: 'no-buildings', off: ['bodies-0', 'bodies-1', 'bodies-2'] });
  for (const c of cases) {
    await b.evaluate('window.__AB(' + JSON.stringify(LAYERS) + ', true)');
    if (c.off.length) await b.evaluate('window.__AB(' + JSON.stringify(c.off) + ', false)');
    await sleep(500);
    const shot = out + '-' + c.tag + '.png';
    if (c.tag === 'all-on' || c.tag === 'no-shafts' || c.tag === 'no-shafts+halos') { await b.screenshot(shot); report.shots.push(shot); }
    report.rows.push({ tag: c.tag, ...(await measure()) });
  }
  // ---- 参数扫描：直接在页面里改材质 opacity，一次会话内扫完 ----
  await b.evaluate('window.__AB(' + JSON.stringify(LAYERS) + ', true)');
  const setOpacity = async (shaft, pool) => b.evaluate('(() => { const g = window.__SS.city.group; const s = g.getObjectByName("lamp-shafts"); const l = g.getObjectByName("light-pools"); if (s) s.material.opacity = ' + shaft + '; if (l) l.material.opacity = ' + pool + '; return 1; })()');
  report.sweep = [];
  for (const sh of [0.3, 0.22, 0.16, 0.1, 0.05]) {
    for (const pl of [1.0, 0.72]) {
      await setOpacity(sh, pl);
      await sleep(420);
      const m = await measure();
      report.sweep.push({ shaftOpacity: sh, poolOpacity: pl, bandAvg: m.bandAvg, nearAvg: m.nearAvg, nearWarmPct: m.nearWarmPct });
    }
  }
} catch (e) { report.fatal = String((e && e.stack) || e); }
finally { await b.close(); }
console.log(JSON.stringify(report, null, 1));
