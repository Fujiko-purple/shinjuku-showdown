import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const R = process.cwd();
const F = join(R, 'src', 'fighters.js');
let src = readFileSync(F, 'utf8');
const text = readFileSync(join(R, '_tools', '_gen', 'blk1b-textures.js'), 'utf8');
const a = '  // 眼白 + 虹膜 + 睫毛：写在贴图上，靠球面贴片天然贴合头型';
const b = '  // 落地阴影：中心实、外圈迅速衰减的椭圆软影';
const i = src.indexOf(a), j = src.indexOf(b, i);
if (i < 0 || j < 0) { console.error('锚点失败', i, j); process.exit(1); }
src = src.slice(0, i) + text + src.slice(j);
writeFileSync(F, src);
console.log('替换完成，删除', j - i, '写入', text.length);
