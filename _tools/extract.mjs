/**
 * extract.mjs —— 一次性把单文件 HTML 拆成可维护的源码树
 * 产物：src/vendor.three.js, src/*.js, src/styles.css, src/body.html, src/head.html
 * 原则：字节级保真，不做任何改写，确保后续构建产物与原文件行为一致
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '新宿决战.html';
const raw = readFileSync(SRC, 'utf8');
const lines = raw.split(/\r?\n/);
const OUT = 'src';
mkdirSync(OUT, { recursive: true });

const lineAt = (n) => lines[n - 1];

// ---------- 1. head / body / styles ----------
const styleOpen = lines.findIndex(l => l.trim() === '<style>') + 1;   // 1-based
const styleClose = lines.findIndex((l, i) => i > styleOpen && l.trim() === '</style>') + 1;
const css = lines.slice(styleOpen, styleClose - 1).join('\n');

const bodyOpen = lines.findIndex(l => l.trim().startsWith('<body')) + 1;
const htmlClose = lines.findIndex(l => l.trim() === '</html>') + 1;
// 注意：原文件的 </head> 出现在 </style> 之后（非标准但浏览器可容错），必须原样保留
// styleClose 是 1-based 行号；</style> 自身的 0-based 索引为 styleClose-1
const headClose = lines.findIndex((l, i) => i >= styleClose && l.trim() === '</head>') + 1;
const headLines = lines.slice(0, styleOpen - 1);          // DOCTYPE..<style> 之前
const afterStyle = headClose ? [lines[headClose - 1]] : [];

writeFileSync(join(OUT, 'styles.css'), css);
writeFileSync(join(OUT, 'head.html'), headLines.join('\n'));
writeFileSync(join(OUT, 'after-style.html'), afterStyle.join('\n'));
console.log('head 行数 %d, </head> 在 L%d', headLines.length, headClose);

// ---------- 2. 主脚本边界 ----------
// 第 2 个 <script> 是主脚本（第 1 个是 __SS_SINGLE_FILE 标记）
let scriptStarts = [];
for (let i = 0; i < lines.length; i++) if (lines[i].trim() === '<script>') scriptStarts.push(i + 1);
const mainStart = scriptStarts[1];
const mainEnd = (() => { for (let i = mainStart; i < lines.length; i++) if (lines[i].trim() === '</script>') return i; return 0; })();
console.log('主脚本 L%d - L%d', mainStart, mainEnd);

// ---------- 3. three.js 区间（vendor）----------
// 这是 esbuild 的单 IIFE 产物：(() => { <prefix> // vendor/build/three.module.js ... // src/contract.js ... })();
let threeStart = -1, threeStop = -1;
for (let i = mainStart; i < mainEnd; i++) {
  const t = lineAt(i).trim();
  if (t === '// vendor/build/three.module.js') { threeStart = i; break; }
}
const contractLine = (() => { for (let i = mainStart; i < mainEnd; i++) if (lineAt(i).trim() === '// src/contract.js') return i; return -1; })();
if (threeStart < 0 || contractLine < 0) { console.error('定位 three.js / contract.js 失败', threeStart, contractLine); process.exit(1); }
threeStop = contractLine - 1;
while (lineAt(threeStop).trim() === '') threeStop--;
console.log('three.js 区间: L%d .. L%d (%d 行)', threeStart, threeStop, threeStop - threeStart + 1);

// 该 script 的头部（"use strict" 之类）与尾部（src/contract.js 起）
const preThree = lines.slice(mainStart, threeStart - 1);        // <script> / (() => { / __defProp ...
const vendor = lines.slice(threeStart - 1, threeStop);          // three 本体（含标记注释）
const gameRaw = lines.slice(threeStop, mainEnd - 1);            // three 之后到 </script>

// body 被主脚本切成两段：script 之前（HUD/DOM/首个标记脚本）与 script 之后
const bodyPre = lines.slice(bodyOpen - 1, mainStart - 1);   // 含 <body ...> 标签行
const bodyPost = lines.slice(mainEnd, htmlClose - 1);
writeFileSync(join(OUT, 'body.html'), bodyPre.join('\n').replace(/\s+$/, ''));
writeFileSync(join(OUT, 'body-tail.html'), bodyPost.join('\n').replace(/^\s+|\s+$/g, ''));

writeFileSync(join(OUT, 'vendor.three.js'), vendor.join('\n'));
writeFileSync(join(OUT, '_script-prefix.js'),
  preThree.filter((l) => !/^\s*<script>\s*$/.test(l)).join('\n'));
writeFileSync(join(OUT, '_game-raw.js'), gameRaw.join('\n'));
console.log('vendor 行数 %d, 游戏代码行数 %d', vendor.length, gameRaw.length);

// ---------- 4. 按 // src/xxx.js 标记切分游戏代码 ----------
const marks = [];
gameRaw.forEach((l, i) => {
  const m = l.match(/^\s*\/\/\s*(src\/[\w.\-\/]+\.js)\s*$/);
  if (m) marks.push({ name: m[1].replace('src/', ''), idx: i });
});
if (marks.length === 0) { console.error('未找到模块标记!'); process.exit(1); }
const head = gameRaw.slice(0, marks[0].idx);   // 标记之前的代码（IIFE 开头等）
console.log('模块标记 %d 个，模块前导行 %d', marks.length, head.length);

const written = [];
for (let i = 0; i < marks.length; i++) {
  const from = marks[i].idx + 1;
  const to = i + 1 < marks.length ? marks[i + 1].idx : gameRaw.length;
  const body = gameRaw.slice(from, to);
  // 去掉尾部 </script> 之类
  const content = body.join('\n').replace(/\s*<\/script>\s*$/, '');
  writeFileSync(join(OUT, marks[i].name), content);
  written.push({ name: marks[i].name, lines: body.length, bytes: content.length });
}
// 第一个模块之前的前导（IIFE 包裹开头）单独存
writeFileSync(join(OUT, '_game-prefix.js'), head.join('\n'));
console.log(written.map(w => `  ${w.name.padEnd(16)} ${String(w.lines).padStart(6)} 行  ${(w.bytes/1024).toFixed(1)} KB`).join('\n'));
console.log('\n完成。');
