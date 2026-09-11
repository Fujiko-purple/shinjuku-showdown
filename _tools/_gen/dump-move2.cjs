const { readFileSync } = require('fs');
const c = readFileSync('src/combat.js', 'utf8');
const L = c.split(/\r?\n/);
console.log('=== L2385-2415（玩家移动输入处理）===');
for (let i = 2384; i < 2415 && i < L.length; i++) console.log('L' + (i + 1) + ': ' + L[i].slice(0, 160));
console.log('');
console.log('=== moveX / moveZ 在 combat.js 里的用法 ===');
L.forEach((l, i) => { if (/moveX|moveZ|inp\.move/.test(l)) console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 150)); });
