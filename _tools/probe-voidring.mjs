/**
 * probe-voidring.mjs —— 定位"领域里的白色圆环"到底是谁画的（逐个隐藏 + 截图对比）
 */
import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9687, width: 1280, height: 720 });
const out = 'shots/VOIDRING';
const shots = [];
const hide = async (which) => {
  await b.evaluate(`(() => {
    const S = window.__SS;
    S.scene.traverse((o) => {
      if (!o.userData.__tag) return;
      o.visible = true;
    });
    if ('${which}' === 'all') return 1;
    S.scene.traverse((o) => {
      if (o.userData.__tag === '${which}') o.visible = false;
    });
    return 1;
  })()`);
};
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(13000);
  await b.evaluate("document.getElementById('btn-skip-cine').click(); true");
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(1200);
  await b.evaluate('window.__SS.combat.setInvincible("gojo", true); true');
  await b.evaluate('window.__SS.combat.forceSkill("void","gojo"); true');
  await sleep(900);
  // 给候选对象打标签
  const tags = await b.evaluate(`(() => {
    const S = window.__SS;
    S.scene.updateMatrixWorld(true);
    let n = 0;
    S.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints)) return;
      const g = o.geometry;
      let r = g && g.boundingSphere ? g.boundingSphere.radius : 0;
      const sc = Math.max(Math.abs(o.scale.x), Math.abs(o.scale.y), Math.abs(o.scale.z));
      r *= sc;
      eslint = 0;
      if (r > 1.5 && r < 120) {
        o.userData.__tag = (g.type || '?') + '@' + Math.round(r) + '#' + (n++);
      }
    });
    return S.scene.children.length;
  })()`);
  const list = await b.evaluate(`(() => {
    const S = window.__SS; const out = [];
    S.scene.traverse((o) => { if (o.userData.__tag) { const m = Array.isArray(o.material) ? o.material[0] : o.material;
      out.push({ tag: o.userData.__tag, add: m && m.blending === 2, op: m && m.opacity, ro: o.renderOrder, col: m && m.color ? m.color.getHexString() : null }); } });
    return out;
  })()`);
  const measureCenter = async () => {
    const cap = await b.send('Page.captureScreenshot', {
      format: 'png', clip: { x: 0, y: 0, width: 1280, height: 720, scale: 0.25 }, captureBeyondViewport: false,
    });
    const uri = 'data:image/png;base64,' + cap.data;
    return await b.evaluate(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(uri)}; await img.decode();
      const CW = 320, CH = 180;
      const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
      const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0, CW, CH);
      const d = c2.getImageData(0, 0, CW, CH).data;
      // 画面中心 40%x40% 区域
      const x0 = Math.floor(CW * 0.30), x1 = Math.floor(CW * 0.70), y0 = Math.floor(CH * 0.30), y1 = Math.floor(CH * 0.70);
      let s = 0, n = 0, white = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * CW + x) * 4;
        const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        s += l; n++; if (l > 200) white++;
      }
      return { centerAvg: +(s / n).toFixed(1), centerWhitePct: +(white / n * 100).toFixed(1) };
    })()`);
  };
  await hide('all');
  await sleep(400);
  const base = await measureCenter();
  const rows = [{ tag: 'none(全部可见)', ...base }];
  for (const item of list) {
    await hide(item.tag);
    await sleep(340);
    const m = await measureCenter();
    const p = out + '-' + item.tag.replace(/[^A-Za-z0-9@#]/g, '') + '.png';
    await b.screenshot(p);
    shots.push(p);
    rows.push({ tag: item.tag, col: item.col, add: item.add, ro: item.ro, ...m, dWhite: +(m.centerWhitePct - base.centerWhitePct).toFixed(1) });
  }
  rows.sort((a, b2) => (a.dWhite || 0) - (b2.dWhite || 0));
  console.log(JSON.stringify({ base, rows: rows.slice(0, 10), shots }, null, 1));
} catch (e) { console.log('FATAL ' + String(e).slice(0, 300)); }
finally { await b.close(); }
