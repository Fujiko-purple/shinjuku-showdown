/**
 * probe-voiddmg.mjs —— 领域白盘 / 伤害数字错位 的复现与验证（task-6）
 *
 *  1) forceSkill('void','gojo') → 等 0.8s 截图：检查领域底面是不是"纯白实心椭圆"
 *  2) 连打 + 连续受击 → 截图：检查伤害数字有没有横向错开
 *
 * 用法：node _tools/probe-voiddmg.mjs --out shots/VOIDDMG
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'shots/VOIDDMG');
const b = new Browser({ port: parseInt(arg('port', '9685'), 10), width: 1280, height: 720 });
const report = { out, shots: [], notes: {} };
try {
  await b.launch(); await b.newPage();
  const url = 'file:///' + resolve(arg('file', 'dist/新宿决战.html')).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  await b.send('Page.navigate', { url });
  await sleep(13000);
  await b.evaluate("document.getElementById('btn-skip-cine').click(); true");
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(1200);
  await b.evaluate('window.__SS.combat.setInvincible("gojo", true); true');
  // 1) 领域
  await b.evaluate('window.__SS.combat.forceSkill("void","gojo"); true');
  await sleep(800);
  const p1 = out + '-void.png'; await b.screenshot(p1); report.shots.push(p1);
  await sleep(1400);
  const p1b = out + '-void2.png'; await b.screenshot(p1b); report.shots.push(p1b);
  report.notes.domain = await b.evaluate("(() => ({ mode: window.__SS.snap.mode, dom: window.__SS.snap.gojoDomain }))()");
  // 反查"领域里那个白色圆盘/圆环"到底是谁画的
  report.notes.near = await b.evaluate(`(() => {
    const S = window.__SS;
    S.scene.updateMatrixWorld(true);
    const gp = S.gojo.root.position;
    const fxM = S.fx.debugMaterials ? S.fx.debugMaterials() : {};
    const wpM = S.weapons.debugMatUuids ? S.weapons.debugMatUuids() : {};
    const nameOf = (id) => {
      for (const k in fxM) {
        if (k === '__spheres' || k === '__auras') { if (fxM[k].indexOf(id) >= 0) return 'fx.' + k.slice(2) + '#' + fxM[k].indexOf(id); continue; }
        if (fxM[k] === id) return 'fx.' + k;
      }
      return wpM[id] ? 'weapons:' + wpM[id] : 'unknown';
    };
    const out = [];
    S.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints) || !o.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m) return;
      const e2 = o.matrixWorld.elements;
      const g2 = o.geometry;
      let r = g2 && g2.boundingSphere ? g2.boundingSphere.radius : 0;
      const sc = Math.max(Math.abs(o.scale.x), Math.abs(o.scale.y), Math.abs(o.scale.z));
      r *= sc;
      if (r <= 1.5 || r > 120) return;
      const d = Math.hypot(e2[12] - gp.x, e2[13] - gp.y, e2[14] - gp.z);
      if (d > 30) return;
      out.push({ owner: nameOf(m.uuid), geo: g2.type, r: +r.toFixed(1), d: +d.toFixed(1), add: m.blending === 2, op: m.opacity, col: m.color ? m.color.getHexString() : null, ro: o.renderOrder });
    });
    out.sort((a, b2) => b2.r - a.r);
    return out.slice(0, 12);
  })()`);
  await sleep(2500);
  // 2) 伤害数字：连续命中（同一目标、同一位置），看有没有错开
  await b.evaluate('window.__SS.combat.setInvincible("gojo", false); window.__SS.combat.setAiEnabled(false); true');
  await b.evaluate("window.__SS.combat.forceSkill('cleave','sukuna'); true");
  await sleep(180);
  await b.evaluate("window.__SS.combat.forceSkill('cleave','sukuna'); true");
  await sleep(160);
  await b.evaluate("window.__SS.combat.forceSkill('cleave','sukuna'); true");
  await sleep(160);
  const box = await b.evaluate(`(() => { const S = window.__SS, f = S.gojo, c = S.activeCamera;
    const p = f.root.position.clone(); p.y += 1.4; const q = p.project(c);
    return { x: (q.x * 0.5 + 0.5) * innerWidth, y: (-q.y * 0.5 + 0.5) * innerHeight }; })()`);
  const half = 150;
  const clip = { x: Math.max(0, Math.min(1280 - 2, box.x - half)), y: Math.max(0, Math.min(720 - 2, box.y - half)), width: half * 2, height: half * 2, scale: 2.4 };
  const p2 = out + '-combo.png';
  await b.screenshot(p2, { clip });
  report.shots.push(p2);
  const p2b = out + '-combo-wide.png';
  await b.screenshot(p2b);
  report.shots.push(p2b);
  report.notes.numbers = await b.evaluate("(() => { const p = window.__SS.fx.poolStats(); return p.damageNumber; })()");
  report.errors = b.errors.slice(0, 8);
} catch (e) { report.fatal = String(e && e.stack || e); }
finally { await b.close(); }
console.log(JSON.stringify(report, null, 1));
