const t = Date.now();
const idx = await (await fetch('https://shinjuku-showdown.pages.dev/index.html?t=' + t, { cache: 'no-store' })).text();
console.log('IDX_BYTES', idx.length);
console.log('HAS_FIX', JSON.stringify({ clearDiag: idx.includes('clearDiag'), at9000: idx.includes('at: 9000'), soft: idx.includes('仍在加载') }));
const sw = await (await fetch('https://shinjuku-showdown.pages.dev/sw.js?t=' + t, { cache: 'no-store' })).text();
console.log('SW_VERSION', (sw.match(/构建版本\s*(\d+)/) || [])[1]);
