/**
 * world-city-build.mjs —— world-city 专用「容忍缺失模块」的临时构建
 * 团队重构期间 src/manifest.json 会列出尚未落盘的模块（如 hud.js），
 * 官方 build/build.mjs 会直接报错。这个脚本跳过缺失模块，
 * 把可运行的单文件版本写到 _tools/.wc-build/test.html，仅用于自查截图。
 * 官方构建恢复后请优先用 node build/build.mjs。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, '_tools', '.wc-build');
const read = (p) => readFileSync(p, 'utf8');
const manifest = JSON.parse(read(join(SRC, 'manifest.json')));
const skipped = [];
const code = [];
for (const name of manifest.modules) {
  const p = join(SRC, name);
  if (!existsSync(p)) { skipped.push(name); continue; }
  code.push('  // src/' + name + '\n' + read(p));
}
const parts = [
  read(join(SRC, 'head.html')).trimEnd(),
  '<style>\n' + read(join(SRC, 'styles.css')) + '\n</style>',
  read(join(SRC, 'after-style.html')).trimEnd(),
  read(join(SRC, 'body.html')).trimEnd(),
  '',
  '<script>\n' + [read(join(SRC, '_script-prefix.js')), read(join(SRC, 'vendor.three.js')), code.join('\n')].join('\n') + '\n\n</script>',
  '</body>',
  '</html>',
  ''
];
mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, 'test.html');
writeFileSync(out, parts.join('\n'));
console.log(JSON.stringify({ out, skipped, modules: manifest.modules.length - skipped.length }));
