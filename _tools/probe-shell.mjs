import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9452 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(11000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.pressKey('KeyU');   // 放「苍」
  await sleep(600);
  const res = await b.evaluate(`(() => {
    const SS = window.__SS; if (!SS) return { err: 'no __SS' };
    const gp = SS.gojo && SS.gojo.root ? SS.gojo.root.position : null;
    const hits = [];
    SS.scene.traverse((o) => {
      const m = o.material;
      if (!m || !o.isMesh) return;
      if (m.blending !== 2 /* AdditiveBlending */) return;
      if (!m.transparent) return;
      const geo = o.geometry;
      o.updateWorldMatrix(true, false);
      const wp = new (o.position.constructor)(); wp.setFromMatrixPosition(o.matrixWorld);
      const d = gp ? Math.hypot(wp.x-gp.x, wp.y-gp.y, wp.z-gp.z) : 999;
      if (d > 9) return;
      const scl = new (o.position.constructor)(); scl.setFromMatrixScale(o.matrixWorld);
      hits.push({
        geo: geo ? geo.type : '?', dist: +d.toFixed(2),
        worldScale: [+scl.x.toFixed(2), +scl.y.toFixed(2), +scl.z.toFixed(2)],
        rad: geo && geo.parameters && geo.parameters.radius !== undefined ? geo.parameters.radius : null,
        uAlpha: m.uniforms && m.uniforms.uAlpha ? m.uniforms.uAlpha.value : null,
        hasFrag: !!(m.fragmentShader && m.fragmentShader.indexOf('discard') >= 0),
        prog: m.program ? 'compiled' : 'none',
      });
    });
    return {
      phase: SS.snap && SS.snap.gojo.phase,
      weapons: SS.weapons && SS.weapons.stats ? SS.weapons.stats : null,
      fxAura: SS.fx && SS.fx.stats ? SS.fx.stats.aura : null,
      nearbyAdditive: hits.sort((a,b)=>a.dist-b.dist).slice(0, 12),
    };
  })()`);
  console.log(JSON.stringify(res, null, 1));
} finally { await b.close(); }
