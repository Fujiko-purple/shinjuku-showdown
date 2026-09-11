const { readFileSync } = require('fs');
const s = readFileSync('src/mobile.js', 'utf8');
const L = s.split(/\r?\n/);
console.log('=== rotate-go 处理（当前）===');
L.forEach((l, i) => { if (/rotate-go/.test(l)) console.log('L' + (i + 1) + ': ' + l.trim()); });
console.log('');
console.log('=== goFullscreenLandscape 调用点 ===');
L.forEach((l, i) => { if (/goFullscreenLandscape/.test(l)) console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 120)); });
