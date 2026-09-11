/**
 * diag.mjs —— 深度运行时诊断：渲染器能力 / 相机 / 场景 / 角色屏幕占比 / 帧率
 */
import { Browser, sleep } from './cdp.mjs';
const port = 9336;
const b = new Browser({ port, width: 1600, height: 900 });
const file = 'C:\\Users\\Administrator\\Desktop\\dsh\\新宿对决\\新宿决战.html';
const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url });
  await sleep(6000);
  // 注入帧率探针
  await b.evaluate(`(() => {
    window.__PROBE = { frames: 0, t0: performance.now(), last: performance.now(), dts: [] };
    const loop = () => {
      const n = performance.now();
      window.__PROBE.dts.push(n - window.__PROBE.last);
      window.__PROBE.last = n; window.__PROBE.frames++;
      if (window.__PROBE.dts.length > 600) window.__PROBE.dts.shift();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })()`);
  await b.evaluate(`document.getElementById('btn-skip-cine').click()`);
  await sleep(15000);
  const info = await b.evaluate(`(() => {
    const SS = window.__SS;
    const r = SS.render;
    const rend = r && (r.renderer || r.getRenderer && r.getRenderer());
    const gl = rend && rend.getContext && rend.getContext();
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const cam = SS.activeCamera;
    // 角色屏幕占比
    const proj = (obj) => {
      if (!obj || !obj.root) return null;
      const THREE = SS.THREE;
      return null;
    };
    let pStats = null;
    try { pStats = { calls: rend.info.render.calls, tris: rend.info.render.triangles, programs: rend.info.programs ? rend.info.programs.length : -1, geoms: rend.info.memory.geometries, texs: rend.info.memory.textures }; } catch(e){ pStats = String(e); }
    return {
      devicePixelRatio: window.devicePixelRatio,
      canvasSize: (()=>{const c=document.getElementById('gl'); return c ? [c.width, c.height, c.clientWidth, c.clientHeight] : null;})(),
      glVersion: gl ? gl.getParameter(gl.VERSION) : null,
      glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : null),
      glVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      maxTexSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : null,
      extFloatLinear: gl ? !!gl.getExtension('OES_texture_float_linear') : null,
      extHalfFloat: gl ? !!gl.getExtension('OES_texture_half_float_linear') : null,
      renderInfo: pStats,
      camera: cam ? { fov: cam.fov, near: cam.near, far: cam.far, pos: cam.position.toArray().map(n=>+n.toFixed(2)), type: cam.type } : null,
      quality: SS.quality ? JSON.parse(JSON.stringify(SS.quality)) : null,
      sceneChildren: SS.scene ? SS.scene.children.length : null,
      state: SS.state ? { phase: SS.state.phase, mode: SS.state.mode, hp: SS.state.hp } : null,
      snap: SS.snap ? JSON.parse(JSON.stringify(SS.snap)) : null,
      fps: (() => { const p = window.__PROBE; if (!p || p.dts.length < 10) return null; const s = p.dts.slice(-120).sort((a,b)=>a-b); const avg = s.reduce((a,b)=>a+b,0)/s.length; return { avgMs: +avg.toFixed(2), avgFps: +(1000/avg).toFixed(1), p95Ms: +s[Math.floor(s.length*0.95)].toFixed(2), frames: p.frames }; })(),
      bootSteps: window.__BOOT ? { ok: window.__BOOT.ok, step: window.__BOOT.step, err: window.__BOOT.err } : null,
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  console.log('ERRORS', JSON.stringify(b.errors.slice(0,10), null, 2));
  console.log('WARNLOGS', JSON.stringify(b.logs.filter(l=>l.type==='warning'||l.type==='error').slice(0,20), null, 2));
} finally { await b.close(); }
