/**
 * patch-fighters.mjs —— 把 _tools/_gen/blk*.js 的分块代码替换进 src/fighters.js
 * 只在美术重写阶段用；替换靠唯一锚点定位，锚点数量必须为 1，否则报错退出。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const R = process.cwd();
const F = join(R, 'src', 'fighters.js');
const GEN = join(R, '_tools', '_gen');
if (!existsSync(join(GEN, 'fighters.orig.js'))) copyFileSync(F, join(GEN, 'fighters.orig.js'));

let src = readFileSync(F, 'utf8');
const blk = (n) => readFileSync(join(GEN, n), 'utf8');

function splice(src, startAnchor, endAnchor, text, label) {
  const i = src.indexOf(startAnchor);
  if (i < 0) throw new Error('找不到起点锚点: ' + label);
  if (src.indexOf(startAnchor, i + 1) >= 0) throw new Error('起点锚点不唯一: ' + label);
  const j = src.indexOf(endAnchor, i);
  if (j < 0) throw new Error('找不到终点锚点: ' + label);
  const out = src.slice(0, i) + text + src.slice(j);
  console.log('  ✓ ' + label + '  删除 ' + (j - i) + ' 字节，写入 ' + text.length + ' 字节');
  return out;
}

src = splice(src, '  function texGojoFace(size) {', '  var TOON_VERT = (', blk('blk1-textures.js'), 'P1 贴图与几何工具');
src = splice(src, '  var TOON_FRAG = (', '  var AMBIENT = new Color(2239554);', blk('blk2-shader.js'), 'P2 卡通着色器');
src = splice(src, '  var AMBIENT = new Color(2239554);', '  var BONES = [', blk('blk3-palette.js'), 'P3 材质与配色');
src = splice(src, '  function buildRig(who, src, q) {', '  var P = (x, y, z) => [x || 0, y || 0, z || 0];', blk('blk4-rig.js'), 'P4 骨骼装配');

// 质量档：新增 outlineAll / shadow
const qOld = '  var QUALITY3 = {\n    low: { seg: 4, radial: 8, hair: 9, secondary: false, cloth: false, shell: false, outline: false, tatooDetail: 6, tex: 128 },\n    medium: { seg: 6, radial: 12, hair: 14, secondary: true, cloth: true, shell: true, outline: false, tatooDetail: 10, tex: 256 },\n    high: { seg: 8, radial: 16, hair: 20, secondary: true, cloth: true, shell: true, outline: true, tatooDetail: 14, tex: 512 }\n  };';
if (src.indexOf(qOld) < 0) throw new Error('质量档原文不匹配');
const qNew = [
'  var QUALITY3 = {',
'    // shadow 常开：接触阴影是重量感的关键，低配也只降分辨率不关它',
'    low: { seg: 4, radial: 7, hair: 9, secondary: false, cloth: false, shell: false, outline: false, outlineAll: false, tex: 128, shadow: true, nails: false, tatooDetail: 6 },',
'    medium: { seg: 6, radial: 10, hair: 13, secondary: true, cloth: true, shell: true, outline: true, outlineAll: false, tex: 256, shadow: true, nails: true, tatooDetail: 10 },',
'    high: { seg: 8, radial: 14, hair: 18, secondary: true, cloth: true, shell: true, outline: true, outlineAll: true, tex: 512, shadow: true, nails: true, tatooDetail: 14 }',
'  };'
].join('\n');
src = src.replace(qOld, qNew);
console.log('  ✓ P5 质量档');

writeFileSync(F, src);
console.log('fighters.js 行数: ' + src.split('\n').length);

// 语法自检：按 build.mjs 的拼装方式拼一遍再 --check
const manifest = JSON.parse(readFileSync(join(R, 'src', 'manifest.json'), 'utf8'));
let body = readFileSync(join(R, 'src', '_script-prefix.js'), 'utf8') + '\n' + readFileSync(join(R, 'src', 'vendor.three.js'), 'utf8') + '\n';
for (const m of manifest.modules) body += readFileSync(join(R, 'src', m), 'utf8') + '\n';
const chkFile = join(GEN, 'check-all.js');
writeFileSync(chkFile, body);
try {
  execFileSync(process.execPath, ['--check', chkFile], { stdio: 'pipe' });
  console.log('  ✓ 语法自检通过');
} catch (e) {
  console.log('  ✗ 语法自检失败:\n' + String(e.stderr || e.message).slice(0, 1500));
  process.exitCode = 1;
}
