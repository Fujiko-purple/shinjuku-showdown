/**
 * world-city-probe.mjs —— world-city 专用诊断 + 自由相机截图
 * 用法：
 *   node _tools/world-city-probe.mjs [--file <html>] [--out shots/wc] [--only street-n,corner]
 *   node _tools/world-city-probe.mjs --destroy 3        # 摧毁 3 栋楼看战损
 * 说明：队内其他模块崩了进不了对局时，本脚本用 godCam 自建渲染循环直接拍城市，
 *       硬件 D3D11 渲染（绝不使用 SwiftShader）。
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
const outPrefix = arg('out', 'shots/wc');
const only = arg('only', '');
const port = parseInt(arg('port', '9340'), 10);
const doSkip = arg('skip', '1') === '1';

// 观察点：p=相机位置 t=看向的点
const VIEWS = [
  { n: 'street-n', p: [0, 5.5, 34], t: [0, 2.6, -26] },
  { n: 'street-s', p: [0, 5.5, -34], t: [0, 2.6, 26] },
  { n: 'street-e', p: [34, 5.5, 0], t: [-26, 2.6, 0] },
  { n: 'corner', p: [17.5, 3.2, 17.5], t: [-16, 3.5, -16] },
  { n: 'cross', p: [0, 7.5, 22], t: [0, 1.2, 4] },
  { n: 'low', p: [10.5, 1.7, 15], t: [-2, 3.2, -34] },
  { n: 'aerial', p: [46, 46, 62], t: [0, 0, -8] },
  { n: 'wide', p: [78, 26, 78], t: [0, 10, 0] },
  { n: 'up', p: [14, 2.0, 13], t: [8, 34, 6] },
  { n: 'signal', p: [3, 5.6, -2], t: [7, 5.7, -14] },
  { n: 'facade', p: [6, 4.6, 40], t: [19, 12, 26] },
  { n: 'plaza', p: [11, 2.6, 11], t: [-6, 3.4, -12] }
];

const b = new Browser({ port, width: 1600, height: 900 });
const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const out = { file, views: [] };
try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url });
  await sleep(7000);
  if (doSkip) await b.evaluate("(document.getElementById('btn-skip-cine')||{click(){}}).click()");
  await sleep(1500);
  // 接管渲染：隐藏加载层 + 自建相机循环
  const setup = await b.evaluate(`(() => {
    const SS = window.__SS;
    if (!SS || !SS.scene || !SS.render) return 'no-scene';
    for (const el of document.querySelectorAll('.screen, #loading, #hud, #cine-ui, #title')) {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
    const cam = SS.godCam;
    cam.near = 0.3;
    cam.far = 2600;
    window.__WC_VIEW = { p: [0, 5.5, 34], t: [0, 2.6, -26] };
    window.__WC_STATS = true;
    window.__WC_TIME = 0;
    window.__WC_HOOKS = [];
    window.__WC_FRAMES = 0;
    const loop = () => {
      const v = window.__WC_VIEW;
      cam.position.set(v.p[0], v.p[1], v.p[2]);
      cam.lookAt(v.t[0], v.t[1], v.t[2]);
      cam.updateProjectionMatrix();
      window.__WC_TIME += 1 / 60;
      if (SS.city && SS.city.update) {
        try { SS.city.update(window.__WC_TIME, 1 / 60); } catch (e) { window.__WC_ERR = String(e); }
      }
      for (const h of window.__WC_HOOKS) { try { h(window.__WC_TIME); } catch (e) { window.__WC_ERR2 = String(e); } }
      try { SS.render.render(SS.scene, cam, 1 / 60); } catch (e) { window.__WC_RERR = String(e); }
      if (window.__WC_STATS) {
        // 把 GL 画布缩到 160x90 统计亮度（不含 HUD/覆盖层）
        let cv2 = window.__WC_CV;
        if (!cv2) { cv2 = document.createElement('canvas'); cv2.width = 160; cv2.height = 90; window.__WC_CV = cv2; }
        const c2 = cv2.getContext('2d', { willReadFrequently: true });
        const gcv = document.getElementById('gl');
        if (gcv) {
          c2.drawImage(gcv, 0, 0, 160, 90);
          const d = c2.getImageData(0, 0, 160, 90).data;
          let sum = 0, dark = 0, blown = 0;
          const n = 160 * 90;
          for (let i = 0; i < n; i++) {
            const l = (d[i * 4] * 0.2126 + d[i * 4 + 1] * 0.7152 + d[i * 4 + 2] * 0.0722) / 255;
            sum += l;
            if (l < 0.18) dark++;
            if (l > 0.92) blown++;
          }
          window.__WC_LUM = { avg: +(sum / n * 100).toFixed(1), darkPct: +(dark / n * 100).toFixed(1), blownPct: +(blown / n * 100).toFixed(1) };
        }
      }
      window.__WC_FRAMES++;
      requestAnimationFrame(loop);
    };
    loop();
    return 'ok';
  })()`);
  out.setup = setup;
  const want = only ? only.split(',') : VIEWS.map((v) => v.n);
  for (const v of VIEWS) {
    if (want.indexOf(v.n) < 0) continue;
    await b.evaluate('window.__WC_VIEW = ' + JSON.stringify({ p: v.p, t: v.t }));
    await sleep(700);
    const p = outPrefix + '-' + v.n + '.png';
    await b.screenshot(p);
    out.views.push(p);
    const lv = await b.evaluate('window.__WC_LUM');
    out.lum = out.lum || {};
    out.lum[v.n] = lv;
  }
  const info = await b.evaluate(`(() => {
    const SS = window.__SS;
    const r = SS && SS.render;
    const rend = r && (r.renderer || (r.getRenderer && r.getRenderer()));
    const gl = rend && rend.getContext && rend.getContext();
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const city = SS && SS.city;
    return {
      glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
      frames: window.__WC_FRAMES,
      lum: (() => { const a = []; for (const v of (window.__WC_LUM_HIST || [])) a.push(v); return window.__WC_LUM || null; })(),
      err: window.__WC_ERR || null,
      rerr: window.__WC_RERR || null,
      hookErr: window.__WC_ERR2 || null,
      render: rend ? { calls: rend.info.render.calls, tris: rend.info.render.triangles, geoms: rend.info.memory.geometries, texs: rend.info.memory.textures, progs: rend.info.programs ? rend.info.programs.length : -1 } : null,
      cityStats: city && city.stats ? JSON.parse(JSON.stringify(city.stats)) : null,
      vcIssues: (() => {
        const bad = [];
        if (!city || !city.group) return bad;
        city.group.traverse((o) => {
          if (!o.isMesh && !o.isPoints && !o.isLineSegments) return;
          const m = o.material;
          if (!m) return;
          const mats = Array.isArray(m) ? m : [m];
          for (const mm of mats) {
            if (mm.vertexColors && o.geometry && !o.geometry.attributes.color) bad.push(o.name || o.type);
          }
          if (o.isInstancedMesh && !o.instanceColor) bad.push('NO-INSTANCECOLOR:' + (o.name || o.type));
        });
        return bad;
      })(),
      boot: window.__BOOT ? { ok: window.__BOOT.ok, step: window.__BOOT.step, err: window.__BOOT.err } : null
    };
  })()`);
  out.probe = info;
  if (arg('dump', '0') === '1') {
    out.dump = await b.evaluate(`(() => {
      const g = window.__SS.city.group;
      const rows = [];
      g.traverse((o) => {
        if (o === g) return;
        if (o.isMesh || o.isPoints || o.isLineSegments || o.isInstancedMesh) {
          rows.push({ n: o.name || o.type, c: o.count || 1, type: o.type, vis: o.visible });
        }
      });
      return rows;
    })()`);
  }
  out.errors = b.errors.slice(0, 6);
  out.warn = b.logs.filter((l) => l.type === 'error' || l.type === 'warning').slice(0, 6).map((l) => String(l.text).slice(0, 200));
} catch (e) {
  out.fatal = String((e && e.stack) || e);
} finally {
  await b.close();
}
console.log(JSON.stringify(out, null, 2));
