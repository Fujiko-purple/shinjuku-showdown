/**
 * build.mjs —— 新宿决战构建脚本
 * ----------------------------------------------------------------------------
 * 一次构建产出两份可交付物：
 *
 *   1) dist/新宿决战.html   单文件版：JS/CSS 全内联，双击即开（离线也能听 BGM）。
 *
 *   2) dist/site/           可静态托管的站点版，首屏体积最小化：
 *                            index.html              入口（全相对路径，放 CDN 子目录也能跑）
 *                            assets/three.js         three.js r160
 *                            assets/game.js          游戏代码（11 个模块顺序拼接）
 *                            assets/styles.css       基础样式
 *                            assets/mobile.css       移动端样式
 *                            assets/bgm.m4a          2.7MB 音频，首次交互后才加载
 *                            manifest.webmanifest    PWA 清单（可加主屏，横屏全屏）
 *                            sw.js                   离线缓存
 *                            icons/*.png             192/512/180 图标（自己生成，无依赖）
 *                            robots.txt  _headers  404.html
 *
 * 设计要点：
 *   - 模块顺序 = src/manifest.json；src/mobile.js 若没写进 manifest 会自动接在最后
 *     （它要调用 main.js 的顶层函数，必须最后执行）。
 *   - src/head.html 与 src/body.html 是别人的写域，构建只改写「产物」，不动源文件。
 *   - 站点版把内联 base64 音频抽成外部文件 + 首次交互懒加载，首屏从 5.63MB 降到 ~2MB。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const SITE = join(DIST, 'site');
const SHELL = join(ROOT, 'deploy', 'site-shell');

const read = (p) => readFileSync(p, 'utf8');
const exists = (p) => existsSync(p);
const manifest = JSON.parse(read(join(SRC, 'manifest.json')));

/* ---------- 1. 读源 ---------- */
const head = read(join(SRC, 'head.html'));
const styles = read(join(SRC, 'styles.css'));
const mobileCss = exists(join(SRC, 'mobile.css')) ? read(join(SRC, 'mobile.css')) : '';
const afterStyle = read(join(SRC, 'after-style.html'));
const body = read(join(SRC, 'body.html'));
const prefix = read(join(SRC, '_script-prefix.js'));
const vendor = read(join(SRC, 'vendor.three.js'));

/** 模块顺序：manifest + 自动补 mobile.js（永远最后） */
const EXTRA_LAST = ['mobile.js'];
const moduleNames = manifest.modules.slice();
for (const n of EXTRA_LAST) if (exists(join(SRC, n)) && !moduleNames.includes(n)) moduleNames.push(n);
/**
 * --lenient：允许 manifest 里声明了但还没落地的模块（队友正在写的新文件）暂时缺失。
 * 默认是硬失败 —— 构建产物不允许悄悄少一块。开发中间态可以加 --lenient 继续跑。
 */
const LENIENT = process.argv.includes('--lenient') || process.argv.includes('-l');
const missing = [];
const modules = [];
for (const name of moduleNames) {
  const p = join(SRC, name);
  if (!exists(p)) {
    if (!LENIENT) throw new Error('缺少模块: ' + name + '（开发中间态可用 --lenient 跳过）');
    missing.push(name);
    console.warn('⚠ 跳过缺失模块: ' + name + '（--lenient）');
    continue;
  }
  modules.push({ name, code: read(p) });
}

/* ---------- 2. 拼代码 ---------- */
/** 模块文件自带的首行注释（如 "// src/camera.js"）与构建器插入的分隔注释重复，
 *  统一剥掉，避免产物里出现两行同名注释、也让切分工具不会丢模块首行。 */
function stripSelfMarker(name, code) {
  const re = new RegExp('^[ \t]*//[ \t]*src/' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \t]*\r?\n');
  return code.replace(re, '');
}
const modulesClean = modules.map((m) => ({ name: m.name, code: stripSelfMarker(m.name, m.code) }));
const gameCode = modulesClean.map((m) => '  // src/' + m.name + '\n' + m.code).join('\n');
const scriptBody = [prefix, vendor, gameCode].join('\n');
const styleBody = mobileCss ? styles + '\n' + mobileCss : styles;

/* ---------- 3. 单文件版 ----------
   --out <路径>：把单文件产物写到别处（多人并行时不互相覆盖 dist/新宿决战.html）。
   站点版目录始终是 dist/site/（要独立目录请整体拷贝）。 */
const outArgIdx = process.argv.indexOf('--out');
const outHtml = outArgIdx >= 0 && process.argv[outArgIdx + 1]
  ? resolve(process.argv[outArgIdx + 1])
  : join(DIST, '新宿决战.html');
mkdirSync(dirname(outHtml), { recursive: true });
mkdirSync(DIST, { recursive: true });
writeFileSync(outHtml,
  head.trimEnd() + '\n' +
  '<style>\n' + styleBody + '\n</style>\n' +
  (afterStyle ? afterStyle.trimEnd() + '\n' : '</head>\n') +
  body.trimEnd() + '\n\n' +
  '<script>\n' + scriptBody + '\n\n</script>\n' +
  '</body>\n</html>\n');

/* ---------- 4. 站点版 ---------- */
if (exists(SITE)) rmSync(SITE, { recursive: true, force: true });
const SITE_ASSETS = join(SITE, 'assets');
mkdirSync(SITE_ASSETS, { recursive: true });
/**
 * ⚠ 站点版不能把 three.js 拆成独立文件：
 *   vendor.three.js 依赖 _script-prefix.js 里的 __defProp/__export，
 *   而这两个帮助函数和整个 IIFE 的作用域无法跨 <script> 共享（实测：
 *   ReferenceError: __export is not defined）。
 *   所以 game.js = 前缀 + three.js + 游戏模块，和单文件版是同一段代码。
 */
writeFileSync(join(SITE_ASSETS, 'game.js'), scriptBody);
writeFileSync(join(SITE_ASSETS, 'styles.css'), styles);
if (mobileCss) writeFileSync(join(SITE_ASSETS, 'mobile.css'), mobileCss);

/* 4a. 把 body.html 里的内联 base64 音频抽成独立文件 */
const audioMatch = body.match(/src="data:audio\/([a-z0-9]+);base64,([A-Za-z0-9+/=]+)"/i);
let audioInfo = null;
let audioName = '';
if (audioMatch) {
  const buf = Buffer.from(audioMatch[2], 'base64');
  audioName = 'bgm.' + (audioMatch[1] === 'mp4' ? 'm4a' : audioMatch[1]);
  writeFileSync(join(SITE_ASSETS, audioName), buf);
  audioInfo = { file: 'assets/' + audioName, bytes: buf.length };
}

/* 4b. 产物 HTML：音频外链化 + 清掉单文件标记 + 插入懒加载器与 PWA 头 */
function siteBody() {
  let b = body;
  if (audioMatch) {
    b = b.replace(/src="data:audio\/[a-z0-9]+;base64,[A-Za-z0-9+/=]+"/i,
      'preload="none" data-src="assets/' + audioName + '"');
  }
  b = b.replace('window.__SS_SINGLE_FILE = true;', 'window.__SS_SINGLE_FILE = false;');
  return b.trimEnd();
}
const siteHtml =
  head.trimEnd() + '\n' +
  read(join(SHELL, 'head-extra.html')) +
  (afterStyle ? afterStyle.trimEnd() + '\n' : '</head>\n') +
  siteBody() + '\n\n' +
  read(join(SHELL, 'lazy-audio.html')) + '\n' +
  /* sw-register.html：此前 sw.js 被生成却没有任何地方注册它（Lead 验收时发现，实测 getRegistrations() 为空） */
  read(join(SHELL, 'sw-register.html')) + '\n' +
  '<script src="assets/game.js"></script>\n' +
  '</body>\n</html>\n';
writeFileSync(join(SITE, 'index.html'), siteHtml);

/* 4c. PWA 图标：自己写的极简 PNG 编码器，不引第三方依赖 */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function pngRGBA(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
/** 图标：漆黒底 + 紫环 + 青点（与内联 favicon 同款），2x2 超采样抗锯齿 */
function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = 2, cx = size / 2, cy = size / 2;
  const R1 = size * 0.30, RW = size * 0.058, RD = size * 0.105;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const X = x + (sx + 0.5) / S, Y = y + (sy + 0.5) / S;
      const d = Math.hypot(X - cx, Y - cy);
      let cr = 0x06, cg = 0x06, cb = 0x0c;
      if (Math.abs(d - R1) < RW / 2) { cr = 0xb0; cg = 0x4c; cb = 0xff; }
      if (d < RD) { cr = 0x5f; cg = 0xf0; cb = 0xff; }
      const edge = Math.min(1, Math.max(0, (size * 0.5 - d) / 1.6));
      r += cr * edge; g += cg * edge; b += cb * edge; a += edge;
    }
    const n = S * S, i = (y * size + x) * 4;
    px[i] = Math.round(r / n); px[i + 1] = Math.round(g / n);
    px[i + 2] = Math.round(b / n); px[i + 3] = Math.round((a / n) * 255);
  }
  return pngRGBA(size, size, px);
}
mkdirSync(join(SITE, 'icons'), { recursive: true });
for (const [s, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  writeFileSync(join(SITE, 'icons', name), makeIcon(s));
}

/* 4d. PWA 清单 + Service Worker */
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const shellList = ['./', 'index.html', 'assets/styles.css', 'assets/mobile.css', 'assets/game.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
writeFileSync(join(SITE, 'manifest.webmanifest'), JSON.stringify({
  name: '新宿决战 · 五条悟 VS 宿傩',
  short_name: '新宿决战',
  description: '非商业同人 3D 格斗，手机浏览器直接开玩',
  lang: 'zh-CN',
  start_url: './',
  scope: './',
  display: 'fullscreen',
  display_override: ['fullscreen', 'standalone', 'minimal-ui'],
  orientation: 'landscape',
  background_color: '#06060c',
  theme_color: '#06060c',
  categories: ['games'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));
writeFileSync(join(SITE, 'sw.js'),
  read(join(SHELL, 'sw.template.js'))
    .replace(/__STAMP__/g, stamp)
    .replace('__SHELL__', JSON.stringify(shellList, null, 2)));
for (const f of ['robots.txt', '_headers', '404.html']) writeFileSync(join(SITE, f), read(join(SHELL, f)));

/* ---------- 5. 构建报告 ---------- */
const bytes = (p) => statSync(p).size;
const firstPaintFiles = ['index.html', 'assets/game.js', 'assets/styles.css']
  .concat(mobileCss ? ['assets/mobile.css'] : []);
const firstPaint = firstPaintFiles.reduce((s, f) => s + bytes(join(SITE, f)), 0);
console.log(JSON.stringify({
  singleFile: { path: outHtml, bytes: bytes(outHtml), MB: +(bytes(outHtml) / 1048576).toFixed(2) },
  site: {
    dir: SITE,
    firstPaintBytes: firstPaint,
    firstPaintMB: +(firstPaint / 1048576).toFixed(2),
    firstPaintFiles,
    audioLazy: audioInfo,
    stamp,
  },
  modules: modulesClean.map((m) => m.name + ':' + m.code.length),
  missingModules: missing,
  stylesBytes: styleBody.length,
}, null, 2));
