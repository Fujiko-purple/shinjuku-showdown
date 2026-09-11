
import { readFileSync } from 'node:fs';
const lines = readFileSync('新宿决战.html','utf8').split(/\r?\n/);
const marks = [];
for (let i = 31590; i < lines.length; i++) {
  const m = lines[i].match(/^\s*\/\/\s*(src\/[\w.\-\/]+\.js)\s*$/);
  if (m) marks.push({ name: m[1], line: i + 1 });
}
console.log('模块边界:');
for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].line : lines.length;
  console.log(`  ${marks[i].name.padEnd(20)} L${marks[i].line} - L${end-1}   ${end - marks[i].line} 行`);
}
// city.js 内部的函数清单（场景到底有什么）
const cityStart = marks.find(m=>m.name.includes('city')).line;
const cityEnd = marks.find(m=>m.name.includes('fx')).line;
console.log('\n=== city.js 内部的函数/对象 ===');
for (let i = cityStart; i < cityEnd; i++) {
  const l = lines[i];
  if (/^\s{0,4}(function\s+[\w$]+|const\s+[A-Za-z_$][\w$]*\s*=\s*(function|\(|\{|new\s)|class\s+[\w$]+)/.test(l)) console.log('  L'+(i+1)+': '+l.trim().slice(0,110));
}
console.log('\n=== fighters.js 内部 ===');
const fs_ = marks.find(m=>m.name.includes('fighters')).line;
const fe = marks.find(m=>m.name.includes('combat')).line;
for (let i = fs_; i < fe; i++) {
  const l = lines[i];
  if (/^\s{0,4}(function\s+[\w$]+|const\s+[A-Za-z_$][\w$]*\s*=\s*(function|\(|\{|new\s)|class\s+[\w$]+)/.test(l)) console.log('  L'+(i+1)+': '+l.trim().slice(0,110));
}
console.log('\n=== render.js 内部 ===');
const rs = marks.find(m=>m.name.includes('render')).line;
const re = marks.find(m=>m.name.includes('main')).line;
for (let i = rs; i < re; i++) {
  const l = lines[i];
  if (/^\s{0,4}(function\s+[\w$]+|const\s+[A-Za-z_$][\w$]*\s*=\s*(function|\(|\{|new\s)|class\s+[\w$]+)/.test(l)) console.log('  L'+(i+1)+': '+l.trim().slice(0,110));
}
