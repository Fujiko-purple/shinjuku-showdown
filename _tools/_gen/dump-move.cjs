const { readFileSync } = require('fs');
const c = readFileSync('src/combat.js', 'utf8');
const L = c.split(/\r?\n/);
console.log('=== combat.js 里玩家移动 / moveTowards 调用 ===');
L.forEach((l, i) => { if (/moveTowards|moveIntent|setPos\(|input\.moveX|input\.moveZ|MOVE_SPEED|DASH_SPEED/.test(l)) console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 150)); });
