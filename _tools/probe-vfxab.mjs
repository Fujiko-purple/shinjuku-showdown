/**
 * probe-vfxab.mjs —— 严格的 A/B 探针（task-6）
 *
 * 关键点：**同一帧内容**下切换后处理参数，避免"两次跑的场景不一样"污染结论。
 * 做法：把角色瞬移到街灯锥叠得最厉害的机位 → 固定 pitch/yaw → 暂停（画面冻住但继续渲染）
 *      → 在页面里直接改 render.composite.uniforms → 逐档截图 + 量中段 (y30%~60%) 亮度。
 *
 * 用法：node _tools/probe-vfxab.mjs --out shots/AB
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'shots/AB');
const W = 1280, H = 720;
const gx = parseFloat(arg('gx', '4')), gz = parseFloat(arg('gz', '16'));
const pitch = parseFloat(arg('pitch', '0.34'));
const file = resolve(arg('file', 'dist/新宿决战.html'));

const b = new Browser({ port: parseInt(arg('port', '9683'), 10), width: W, height: H });
const report = { out, gx, gz, pitch, rows: [], shots: [] };

const measure = async () => {
  const cap = await b.send('Page.captureScreenshot', {
    format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 0.25 }, captureBeyondViewport: false,
  });
  const uri = 'data:image/png;base64,' + cap.data;
  return await b.evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(uri)}; await img.decode();
    const CW = 320, CH = 180;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0, CW, CH);
    const d = c2.getImageData(0, 0, CW, CH).data;
    let sB = 0, nB = 0, wB = 0, sA = 0, nA = 0, warmA = 0, blownA = 0;
    const y0 = Math.floor(CH * 0.30), y1 = Math.floor(CH * 0.60);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const i = (y * CW + x) * 4;
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      sA += l; nA++; if (l > 245) blownA++; if (r > bl * 1.25 && r > 40) warmA++;
      if (y >= y0 && y < y1) { sB += l; nB++; if (r > bl * 1.25 && r > 40) wB++; }
    }
    return {
      bandAvg: +(sB / nB).toFixed(1), bandWarmPct: +(wB / nB * 100).toFixed(1),
      allAvg: +(sA / nA).toFixed(1), allWarmPct: +(warmA / nA * 100).toFixed(1),
      allBlownPct: +(blownA / nA * 100).toFixed(1)
    };
  })()`);
};

const setUniforms = async (u) => {
  await b.evaluate(`(() => { const U = window.__SS.render.composite.uniforms;
    if (${u.bloom !== undefined}) U.uBloom.value = ${u.bloom === undefined ? 0 : u.bloom};
    if (${u.floor !== undefined}) U.uBloomFloor.value = ${u.floor === undefined ? 0 : u.floor};
    if (${u.cap !== undefined}) U.uBloomCap.value = ${u.cap === undefined ? 0 : u.cap};
    if (${u.hazeK !== undefined}) U.uHazeK.value = ${u.hazeK === undefined ? 0 : u.hazeK};
    if (${u.hazeKnee !== undefined}) U.uHazeKnee.value = ${u.hazeKnee === undefined ? 0 : u.hazeKnee};
    return 1; })()`);
};

try {
  await b.launch(); await b.newPage();
  const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
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
    return 1;
  })()`);
  await sleep(2200);
  /* 不要用 Escape 暂停：暂停菜单会给整个画面加一层暗底，量出来的是菜单不是游戏。
   * 改用"关掉 AI + 清输入"来冻结画面内容：待机动作只有几像素的呼吸起伏，
   * 光照/泛光完全不变，足以做同帧 A/B。
   */
  await b.evaluate(`(() => {
    const S = window.__SS;
    try { S.combat.setAiEnabled(false); } catch (e) {}
    const g = S.combat && S.combat.gojo, k = S.combat && S.combat.sukuna;
    for (const c of [g, k]) if (c) { if (c.vel) c.vel.set(0, 0, 0); if (c.moveIntent) c.moveIntent.set(0, 0, 0); }
    return 1;
  })()`);
  await sleep(1600);
  report.paused = await b.evaluate("(() => ({ state: window.__SS.state, screens: [...document.querySelectorAll('.screen')].filter(e=>!e.classList.contains('hidden')).map(e=>e.id) }))()");

  const cases = [
    { tag: 'bloom-off-k0', bloom: 0, floor: 0.14, hazeK: 0, hazeKnee: 0.04 },
    { tag: 'before-k0', bloom: 0.62, floor: 0.14, hazeK: 0, hazeKnee: 0.04 },
    { tag: 'k6', bloom: 0.62, floor: 0.14, hazeK: 6, hazeKnee: 0.04 },
    { tag: 'k10', bloom: 0.62, floor: 0.14, hazeK: 10, hazeKnee: 0.04 },
    { tag: 'k14', bloom: 0.62, floor: 0.14, hazeK: 14, hazeKnee: 0.04 },
    { tag: 'k20', bloom: 0.62, floor: 0.14, hazeK: 20, hazeKnee: 0.04 },
  ];
  for (const c of cases) {
    await setUniforms({ bloom: c.bloom, floor: c.floor, hazeK: c.hazeK, hazeKnee: c.hazeKnee });
    await sleep(450);
    const p = `${out}-${c.tag}.png`;
    report.shots.push(p);
    await b.screenshot(p);
    report.rows.push({ tag: c.tag, bloom: c.bloom, floor: c.floor, ...(await measure()) });
  }
} catch (e) { report.fatal = String(e && e.stack || e); }
finally { await b.close(); }
console.log(JSON.stringify(report, null, 1));
