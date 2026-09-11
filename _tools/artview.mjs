/**
 * artview.mjs —— 角色近景观测台驱动（开发工具，不参与交付打包）
 *
 * 用法：
 *   node _tools/artview.mjs --cfg <shots.json> [--out shots/art-fighters] [--w 1280] [--h 720]
 *
 * 工作方式：
 *   1) 现场把 src/vendor.three.js + src/contract.js + src/fighters.js + _tools/artview-app.js
 *      拼成一个临时页面 _tools/_gen/artview.html（始终反映最新的 src/fighters.js）
 *   2) 用 CDP 硬件渲染打开，按 cfg 列表逐条设置观测视角并截图
 *
 * cfg 条目字段：
 *   name 截图名 / who gojo|sukuna|both / quality low|medium|high / anim 动作名 / t 姿势时间
 *   az el dist ty fov 机位 / bg dark|city|bright|white|black / sil 剪影模式
 *   aura domained guard awaken blindfold flash scale
 */
import { Browser, sleep } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const cfgPath = arg('cfg');
if (!cfgPath) { console.error('需要 --cfg <shots.json>'); process.exit(1); }
const outPrefix = arg('out', 'shots/art-fighters');
const W = parseInt(arg('w', '1280'), 10);
const H = parseInt(arg('h', '720'), 10);
const shots = JSON.parse(readFileSync(resolve(cfgPath), 'utf8'));

const ROOT = process.cwd();
const genDir = join(ROOT, '_tools', '_gen');
mkdirSync(genDir, { recursive: true });
const html = [
  '<!doctype html><html><head><meta charset="utf-8"><style>',
  'html,body{margin:0;padding:0;overflow:hidden;background:#000}canvas{display:block;width:100vw;height:100vh}',
  '</style></head><body><canvas id="v"></canvas><script>',
  readFileSync(join(ROOT, 'src', '_script-prefix.js'), 'utf8'),
  readFileSync(join(ROOT, 'src', 'vendor.three.js'), 'utf8'),
  '\n// ---- src/contract.js ----\n', readFileSync(join(ROOT, 'src', 'contract.js'), 'utf8'),
  '\n// ---- src/fighters.js ----\n', readFileSync(join(ROOT, 'src', 'fighters.js'), 'utf8'),
  '\n// ---- _tools/artview-app.js ----\n', readFileSync(join(ROOT, '_tools', 'artview-app.js'), 'utf8'),
  '})();',
  '</script></body></html>',
].join('\n');
const pagePath = join(genDir, 'artview.html');
writeFileSync(pagePath, html);

const b = new Browser({ port: parseInt(arg('port', '9341'), 10), width: W, height: H });
const report = { shots: [], errors: [] };
try {
  await b.launch();
  await b.newPage();
  const url = 'file:///' + pagePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  await b.send('Page.navigate', { url });
  await sleep(2500);
  const ok = await b.evaluate('typeof window.VIEW === "object"');
  if (!ok) throw new Error('VIEW 未就绪（页面报错？）');
  for (const s of shots) {
    const info = await b.evaluate('window.VIEW.apply(' + JSON.stringify(s) + ')');
    await sleep(120);
    const p = outPrefix + '-' + s.name + '.png';
    await b.screenshot(resolve(p));
    report.shots.push({ name: s.name, path: p, ...(info || {}) });
  }
  report.errors = b.errors.slice(0, 10);
  if (b.logs.length) report.logs = b.logs.slice(0, 10);
} catch (e) {
  report.fatal = String(e && e.stack || e);
} finally {
  await b.close();
}
console.log(JSON.stringify(report, null, 2));
