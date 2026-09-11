
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('新宿决战.html', 'utf8');
const lines = src.split(/\r?\n/);
console.log('总行数', lines.length);

// 1. three.js 边界
let threeStart = -1, threeEnd = -1;
for (let i = 980; i < lines.length; i++) {
  if (threeStart < 0 && /var REVISION = "160"/.test(lines[i])) threeStart = i;
  if (threeStart > 0 && /window\.__THREE__ = REVISION/.test(lines[i])) { threeEnd = i; break; }
}
console.log('three.js 内联区间 (0-based):', threeStart, '->', threeEnd, ' 行数约', threeEnd - threeStart);

// 找 three.js IIFE 的真实起止（往回找 srcipt 内第一个大包裹）
for (let i = threeStart; i > 980; i--) {
  if (/^\s*\(function \(global, factory\)/.test(lines[i]) || /typeof exports === 'object'/.test(lines[i])) { console.log('three IIFE 起点候选 L' + (i+1) + ':', lines[i].slice(0, 100)); break; }
}
// 往后找结尾
for (let i = threeEnd; i < threeEnd + 40; i++) {
  console.log('  L' + (i+1) + ': ' + lines[i].slice(0, 120));
}

// 2. 顶层结构：找所有顶层 function/class/const 声明
const tops = [];
for (let i = 990; i < lines.length; i++) {
  const l = lines[i];
  const m = l.match(/^(\s{0,2})(function\s+[A-Za-z_$][\w$]*|class\s+[A-Za-z_$][\w$]*|const\s+([A-Z_$][A-Z0-9_$]{2,})\s*=|let\s+([A-Za-z_$][\w$]*)\s*=)/);
  if (m) tops.push({ line: i + 1, indent: m[1].length, text: l.trim().slice(0, 110) });
}
console.log('\n=== 顶层声明数量:', tops.length, '===');
console.log(tops.slice(0, 120).map(t => 'L' + t.line + ' [i' + t.indent + '] ' + t.text).join('\n'));
