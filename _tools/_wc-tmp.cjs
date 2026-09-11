const fs=require('fs');
const s=fs.readFileSync('src/vendor.three.js','utf8');
const key='var fragment$9 = "';
const i=s.indexOf(key);
const seg=s.slice(i+key.length, i+key.length+2600);
const un = seg.split('\\n').join('\n');
console.log(un.slice(1400, 2600));
