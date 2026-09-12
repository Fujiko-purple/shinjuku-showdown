import { readFileSync, writeFileSync } from 'node:fs';
const body = readFileSync('src/body.html', 'utf8');
if (body.includes('id="bgm2"')) { console.log('已经注入过 bgm2，跳过'); process.exit(0); }
const raw = readFileSync('_int/bgm2.m4a');
const b64 = raw.toString('base64');
const tag = '<audio id="bgm2" loop preload="none" src="data:audio/mp4;base64,' + b64 + '"></audio>';
const anchor = /<audio id="bgm"[^>]*><\/audio>/;
const m = body.match(anchor);
if (!m) { console.error('找不到 id="bgm" 的 audio 标签'); process.exit(1); }
const out = body.replace(anchor, m[0] + '\n' + tag);
writeFileSync('src/body.html', out);
console.log('注入完成：原始音频 ' + (raw.length/1048576).toFixed(2) + ' MB → base64 ' + (b64.length/1048576).toFixed(2) + ' MB');
console.log('body.html 现在 ' + (out.length/1048576).toFixed(2) + ' MB');