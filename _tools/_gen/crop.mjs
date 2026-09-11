/**
 * crop.mjs —— 把截图裁一块放大，用来在游戏画面里近距离检查角色（开发工具）
 * 用法：node _tools/_gen/crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
 */
import { Browser, sleep } from '../cdp.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [inp, outp, x, y, w, h, sc] = process.argv.slice(2);
const b64 = readFileSync(resolve(inp)).toString('base64');
const scale = Number(sc || 3);
const html = '<!doctype html><html><body style="margin:0;background:#000"><canvas id=c></canvas><script>' +
  'var img=new Image();img.onload=function(){var c=document.getElementById("c");c.width=Number("' + w + '")*' + scale + ';c.height=Number("' + h + '")*' + scale +
  ';var g=c.getContext("2d");g.imageSmoothingEnabled=false;g.drawImage(img,' + x + ',' + y + ',' + w + ',' + h + ',0,0,c.width,c.height);window.__RDY=1;};' +
  'img.src="data:image/png;base64,' + b64 + '";</script></body></html>';
const tmp = resolve('_tools/_gen/_crop.html');
writeFileSync(tmp, html);
const b = new Browser({ port: 9355, width: Math.min(3000, Number(w) * scale), height: Math.min(2000, Number(h) * scale) });
await b.launch(); await b.newPage();
await b.send('Page.navigate', { url: 'file:///' + tmp.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') });
for (let i = 0; i < 40; i++) { if (await b.evaluate('!!window.__RDY')) break; await sleep(100); }
await b.screenshot(resolve(outp));
console.log('saved', outp);
await b.close();
