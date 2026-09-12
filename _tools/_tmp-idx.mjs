const t = Date.now();
const idx = await (await fetch('https://shinjuku-showdown.pages.dev/index.html?t=' + t, { cache: 'no-store' })).text();
console.log('IDX_BYTES', idx.length);
const scripts = [...idx.matchAll(/<script[^>]*>/g)].map(m => m[0]);
console.log('SCRIPTS', JSON.stringify(scripts, null, 1));
console.log('HAS_THREE_REF', idx.includes('three.js'));
console.log('HAS_MOBILE_CSS', idx.includes('mobile.css'));
console.log('HEAD_HINT', JSON.stringify(idx.slice(idx.indexOf('<script') - 200, idx.indexOf('<script') + 120)));
// 线上 sw.js 的版本戳
const sw = await (await fetch('https://shinjuku-showdown.pages.dev/sw.js?t=' + t, { cache: 'no-store' })).text();
const m = sw.match(/构建版本\s*(\d+)/);
console.log('SW_VERSION', m && m[1]);
const local = require('node:fs').readFileSync('dist/site/index.html', 'utf8');
console.log('LOCAL_BYTES', local.length, 'local_has_three', local.includes('three.js'));
