const { readFileSync } = require('fs');
const s = readFileSync('src/fighters.js', 'utf8');
const L = s.split(/\r?\n/);
console.log('=== L3290-3360（动画推进 + 一次性动画结束处理）===');
for (let i = 3289; i < 3360 && i < L.length; i++) console.log('L' + (i + 1) + ': ' + L[i].slice(0, 165));
