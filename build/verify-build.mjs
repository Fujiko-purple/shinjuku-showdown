/**
 * verify-build.mjs —— 构建保真自检
 * ----------------------------------------------------------------------------
 * 语义（Lead 2026-09-11 重新定义）：
 *   不再拿「原始 baseline」比对 —— 我们本来就在有意改 src，那个比对必然 DIFF。
 *   现在验证的是**构建保真**：dist 产物里每个模块的代码，必须与 src/ 下对应文件
 *   逐字节一致（规范化行尾与行尾空白后比哈希）。
 *   同时校验样式块 = styles.css + mobile.css。
 *
 * 用法：node build/verify-build.mjs   （退出码 0 = 通过）
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = process.cwd();
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
/** 与 build.mjs 保持一致：剥掉模块文件自带的首行 "// src/xxx.js"（构建器已另插分隔注释） */
function stripSelfMarker(name, code) {
  const re = new RegExp('^[ \\t]*//[ \\t]*src/' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*\\r?\\n');
  return code.replace(re, '');
}

/** 从一段拼好的代码里按 "// src/xxx.js" 注释切出各模块 */
function splitModules(raw) {
  const lines = raw.split(/\r?\n/);
  const marks = [];
  lines.forEach((l, i) => {
    const m = l.match(/^\s*\/\/\s*src\/([\w.\-\/]+)\.js\s*$/);
    if (m) marks.push({ name: m[1] + '.js', i });
  });
  const out = new Map();
  for (let i = 0; i < marks.length; i++) {
    const from = marks[i].i + 1;
    const to = i + 1 < marks.length ? marks[i + 1].i : lines.length;
    let body = lines.slice(from, to).join('\n');
    // 拼装时模块之间留了一个空行，末尾的 </script> 也已切掉；这里只保留模块体
    body = body.replace(/\n\n$/, '');
    out.set(marks[i].name, norm(body));
  }
  return out;
}

/* ---- 1. game.js（站点版）---- */
const siteGame = join(ROOT, 'dist', 'site', 'assets', 'game.js');
const single = join(ROOT, 'dist', '新宿决战.html');
const rows = [];
let bad = 0;

if (existsSync(siteGame)) {
  const got = splitModules(readFileSync(siteGame, 'utf8'));
  for (const [name, code] of got) {
    const srcPath = join(ROOT, 'src', name);
    if (!existsSync(srcPath)) { rows.push({ name, ok: false, note: 'dist 里有但 src 里没有' }); bad++; continue; }
    const want = norm(stripSelfMarker(name, readFileSync(srcPath, 'utf8')));
    const ok = sha(want) === sha(code);
    if (!ok) bad++;
    rows.push({ name, ok, srcHash: sha(want), distHash: sha(code), lines: want.split('\n').length });
  }
} else {
  rows.push({ name: '(dist/site/assets/game.js 不存在)', ok: false });
  bad++;
}

/* ---- 2. manifest 里的模块必须全都出现在产物里 ---- */
const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'manifest.json'), 'utf8'));
const names = new Set(rows.map((r) => r.name));
for (const n of manifest.modules) if (!names.has(n)) { rows.push({ name: n, ok: false, note: 'manifest 声明了但产物缺失' }); bad++; }
if (existsSync(join(ROOT, 'src', 'mobile.js')) && !names.has('mobile.js')) {
  rows.push({ name: 'mobile.js', ok: false, note: '存在 mobile.js 但没被打进产物' }); bad++;
}

/* ---- 3. 样式块 = styles.css + mobile.css ---- */
let styleOk = null;
if (existsSync(single)) {
  const html = readFileSync(single, 'utf8');
  const m = html.match(/<style>\n([\s\S]*?)\n<\/style>/);
  const styles = readFileSync(join(ROOT, 'src', 'styles.css'), 'utf8');
  const mobileCss = existsSync(join(ROOT, 'src', 'mobile.css')) ? readFileSync(join(ROOT, 'src', 'mobile.css'), 'utf8') : '';
  const want = norm(mobileCss ? styles + '\n' + mobileCss : styles);
  styleOk = !!m && sha(norm(m[1])) === sha(want);
  if (!styleOk) bad++;
}

const pad = (s, n) => String(s).padEnd(n);
console.log(rows.map((r) => (r.ok ? 'OK   ' : 'DIFF ') + pad(r.name, 14) +
  (r.ok ? pad(String(r.lines).padStart(4) + ' 行', 10) + r.srcHash : (r.note || (r.srcHash + ' -> ' + r.distHash)))).join('\n'));
console.log(styleOk === null ? 'SKIP  样式块（单文件产物不存在）' : (styleOk ? 'OK   样式块        = styles.css + mobile.css' : 'DIFF 样式块        与 src/styles.css(+mobile.css) 不一致'));
console.log(bad === 0
  ? '\n✅ 构建保真自检通过：' + rows.length + ' 个模块 + 样式块与 src/ 逐字节一致'
  : '\n❌ ' + bad + ' 项不一致 —— 产物与源码脱节了，重新 build');
process.exit(bad === 0 ? 0 : 1);
