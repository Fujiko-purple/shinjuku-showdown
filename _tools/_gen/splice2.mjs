import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const R = process.cwd();
const F = join(R, 'src', 'fighters.js');
let src = readFileSync(F, 'utf8');
function cut(a, b, file, label) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i);
  if (i < 0 || j < 0) { console.error('锚点失败', label, i, j); process.exit(1); }
  const text = readFileSync(join(R, '_tools', '_gen', file), 'utf8');
  src = src.slice(0, i) + text + src.slice(j);
  console.log('✓ ' + label + ' 删除' + (j - i) + ' 写入' + text.length);
}
cut('      /* ---- 头 ---- */\n      const HR = 0.107;', '      /* ---- 手臂 ---- */', 'blk-gojo-head.js', 'P6 五条悟头部');
cut('      /* ---- 头 ---- */\n      const HR = 0.109;', '      /* ---- 手臂：裸露 + 黑色纹身环 ---- */', 'blk-sukuna-head.js', 'P7 宿傩头部');
writeFileSync(F, src);
