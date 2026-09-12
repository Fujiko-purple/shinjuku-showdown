/**
 * probe-vfcaudit.mjs —— VFX 审计探针（task-6 专用）
 *
 * 一次跑完，产出三组可复跑的量化数据：
 *   1) 沿街机位（强制 cam.pitch=0.34）下画面中段 (y 30%~60%) 的平均亮度 / 暖色占比
 *      —— 用来量化「街灯体积光堆叠成一片暖色泛光」的严重程度
 *   2) 角色附近的放大截图（clip + scale）—— 用来肉眼检查刀光边缘是否软化、火花形状
 *   3) 可选：--post 0 走「保护直出（无泛光）」路径，用来判断泛光到底贡献了多少
 *
 * 用法：
 *   node _tools/probe-vfcaudit.mjs --out shots/AUDIT-before
 *   node _tools/probe-vfcaudit.mjs --out shots/AUDIT-before-post0 --post 0
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const out = arg('out', 'shots/AUDIT');
const post = arg('post', '1');
const pitch = parseFloat(arg('pitch', '0.34'));
const W = parseInt(arg('w', '1280'), 10);
const H = parseInt(arg('h', '720'), 10);
const file = resolve(arg('file', 'dist/新宿决战.html'));

const b = new Browser({ port: parseInt(arg('port', '9681'), 10), width: W, height: H });
const report = { out, post, pitch, shots: [], measures: {} };

/** 量当前帧：中段 (y 30%~60%) 与全帧的平均亮度、暖色占比 */
const measure = async (tag) => {
  const cap = await b.send('Page.captureScreenshot', {
    format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 0.25 }, captureBeyondViewport: false,
  });
  const uri = 'data:image/png;base64,' + cap.data;
  const m = await b.evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(uri)}; await img.decode();
    const CW = 320, CH = 180;
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0, CW, CH);
    const d = c2.getImageData(0, 0, CW, CH).data;
    const band = { sum: 0, n: 0, blown: 0, warm: 0 };
    const all = { sum: 0, n: 0, blown: 0, warm: 0 };
    const y0 = Math.floor(CH * 0.30), y1 = Math.floor(CH * 0.60);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const i = (y * CW + x) * 4;
        const r = d[i], g = d[i + 1], bl = d[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * bl;
        all.sum += l; all.n++; if (l > 245) all.blown++; if (r > bl * 1.25 && r > 40) all.warm++;
        if (y >= y0 && y < y1) { band.sum += l; band.n++; if (l > 245) band.blown++; if (r > bl * 1.25 && r > 40) band.warm++; }
      }
    }
    return {
      bandAvg: +(band.sum / band.n).toFixed(1),
      bandBlownPct: +(band.blown / band.n * 100).toFixed(1),
      bandWarmPct: +(band.warm / band.n * 100).toFixed(1),
      allAvg: +(all.sum / all.n).toFixed(1),
      allBlownPct: +(all.blown / all.n * 100).toFixed(1),
      allWarmPct: +(all.warm / all.n * 100).toFixed(1)
    };
  })()`);
  report.measures[tag] = m;
  return m;
};

/** 角色附近的放大截图（用来检查刀光边缘 / 火花形状） */
const zoomShot = async (tag, who, halfCss, scale) => {
  const box = await b.evaluate(`(() => {
    const S = window.__SS;
    const f = S['${who}'];
    const c = S.activeCamera;
    const p = f.root.position.clone(); p.y += 1.1;
    const q = p.project(c);
    return { x: (q.x * 0.5 + 0.5) * innerWidth, y: (-q.y * 0.5 + 0.5) * innerHeight };
  })()`);
  const half = halfCss || 150;
  const clip = {
    x: Math.max(0, Math.min(W - 2, box.x - half)),
    y: Math.max(0, Math.min(H - 2, box.y - half)),
    width: Math.min(half * 2, W),
    height: Math.min(half * 2, H),
    scale: scale || 3,
  };
  const p = `${out}-${tag}.png`;
  await b.screenshot(p, { clip });
  report.shots.push(p);
  return p;
};

try {
  await b.launch();
  await b.newPage();
  const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') + (post === '0' ? '?post=0' : '');
  await b.send('Page.navigate', { url });
  await sleep(13000);
  await b.evaluate("document.getElementById('btn-skip-cine')?.click(); true");
  for (let i = 0; i < 60; i++) { await sleep(500); const st = await b.evaluate('window.__SS && window.__SS.state'); if (st === 'fight') break; }
  await sleep(1500);
  // 持续强制 pitch（camUserHold 会回弹）
  await b.evaluate(`(() => {
    window.__FORCE = ${pitch};
    if (!window.__FT) window.__FT = setInterval(() => { const c = window.__SS.cam; if (window.__FORCE != null) c.pitch = window.__FORCE; if (window.__FORCEYAW != null) c.yaw = window.__FORCEYAW; }, 16);
    return true;
  })()`);
  await sleep(2000);

  // 1) 沿街机位空镜
  const p1 = `${out}-idle.png`;
  await b.screenshot(p1);
  report.shots.push(p1);
  report.measures.idleStreet = await measure('idleStreet');

  // 2) 中段亮度在不同俯角下的曲线（看问题是否只在某个机位出现）
  for (const pp of [0.54, 0.44, 0.34, 0.26]) {
    await b.evaluate('window.__FORCE = ' + pp + '; true');
    await sleep(1400);
    report.measures['band@' + pp] = await measure('band@' + pp);
  }
  await b.evaluate('window.__FORCE = ' + pitch + '; true');
  await sleep(1200);

  // 2b) 沿街位置扫描：把角色瞬移到街道不同位置，找「体积光锥叠成一片」的那个机位
  if (arg('sweep', '0') === '1') {
    for (const z of [44, 30, 16, 2, -14, -30]) {
      await b.evaluate(`(() => {
        const S = window.__SS;
        const g = S.combat && S.combat.gojo;
        if (g && g.p) g.p.set(0, 0, ${z});
        if (S.gojo && S.gojo.setPos) S.gojo.setPos(0, 0, ${z});
        const k = S.combat && S.combat.sukuna;
        if (k && k.p) k.p.set(0, 0, ${z - 8});
        if (S.sukuna && S.sukuna.setPos) S.sukuna.setPos(0, 0, ${z - 8});
        return 1;
      })()`);
      await sleep(1800);
      await b.evaluate('window.__FORCE = ' + pitch + '; true');
      const p = `${out}-street-z${z}.png`;
      await b.screenshot(p);
      report.shots.push(p);
      report.measures['streetZ' + z] = await measure('streetZ' + z);
    }
  }

  // 2b2) 网格扫描：镜头贴近街灯柱 / 走进光锥里才会出现"一整片暖光"
  if (arg('gridsweep', '0') === '1') {
    for (const [gx, gz] of [[-8, 16], [-4, 16], [4, 16], [8, 16], [-4, 2], [4, 2], [0, -8], [-6, -20]]) {
      await b.evaluate(`(() => {
        const S = window.__SS;
        const g = S.combat && S.combat.gojo;
        if (g && g.p) g.p.set(${gx}, 0, ${gz});
        if (S.gojo && S.gojo.setPos) S.gojo.setPos(${gx}, 0, ${gz});
        const k = S.combat && S.combat.sukuna;
        if (k && k.p) k.p.set(${gx}, 0, ${gz - 8});
        if (S.sukuna && S.sukuna.setPos) S.sukuna.setPos(${gx}, 0, ${gz - 8});
        return 1;
      })()`);
      await sleep(1700);
      await b.evaluate('window.__FORCE = ' + pitch + '; true');
      const tag = 'gx' + gx + '_gz' + gz;
      const p = `${out}-${tag}.png`;
      await b.screenshot(p);
      report.shots.push(p);
      report.measures[tag] = await measure(tag);
    }
  }

  // 2c) 偏航扫描：镜头「沿街看」时才可能把一排街灯的体积光锥叠起来
  if (arg('yawsweep', '0') === '1') {
    for (const yaw of [0, 0.5, 1.0, -0.5, -1.0, 1.57]) {
      await b.evaluate('window.__FORCEYAW = ' + yaw + '; true');
      await sleep(1600);
      const p = `${out}-yaw${String(yaw).replace('.', '')}.png`;
      await b.screenshot(p);
      report.shots.push(p);
      report.measures['yaw' + yaw] = await measure('yaw' + yaw);
    }
    await b.evaluate('window.__FORCEYAW = null; true');
    await sleep(800);
  }

  // 3) 刀光：宿傩的「捌」贴脸放大
  await b.evaluate("window.__SS.combat.forceSkill('cleave', 'sukuna'); true");
  await sleep(260);
  await zoomShot('blade', 'sukuna', 170, 3);
  await sleep(700);

  // 4) 火花：打一套 + 爆散，放大看形状
  await b.evaluate("window.__SS.combat.forceSkill('blackflash', 'gojo'); true");
  await sleep(120);
  await zoomShot('spark', 'sukuna', 170, 3);
  await sleep(400);
  await b.evaluate("window.__SS.combat.forceSkill('dismantle', 'sukuna'); true");
  await sleep(180);
  await zoomShot('spark2', 'gojo', 170, 3);

  report.state = await b.evaluate("(() => ({ fps: window.__SS.stats && window.__SS.stats.fps, state: window.__SS.state }))()");
  report.errors = b.errors.slice(0, 10);
} catch (e) {
  report.fatal = String(e && e.stack || e);
} finally {
  await b.close();
}
console.log(JSON.stringify(report, null, 1));
