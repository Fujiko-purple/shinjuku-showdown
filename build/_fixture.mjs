/**
 * _fixture.mjs —— 开发期自测夹具（不是交付产物的一部分）
 * ----------------------------------------------------------------------------
 * 背景：重构期间 src/ 下的模块经常处于「队友正在写」的中间态（city.js 半截、
 * hud.js 还没落地），这时候连主构建都跑不起来，但移动端 UI 必须能持续迭代。
 *
 * 做法：拿仓库根目录的「上一版已知可用」单文件 新宿决战.html，把 mobile.css /
 * mobile.js 注进去，并在 main.js 的两处（输入桥、像素比上限）打上临时补丁，
 * 产出 dist/_fixture.html。队友的 src 一旦恢复可构建，就应该直接用主构建验收。
 *
 * 用法：node build/_fixture.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const base = join(ROOT, '新宿决战.html');
const out = join(ROOT, 'dist', '_fixture.html');
if (!existsSync(base)) { console.error('找不到基线文件 新宿决战.html'); process.exit(1); }

let html = readFileSync(base, 'utf8');
const by = (p) => readFileSync(join(ROOT, 'src', p), 'utf8');
const mobileCss = by('mobile.css');
const mobileJs = by('mobile.js');

/** 1) 注入移动端样式 */
const styleEnd = html.lastIndexOf('</style>');
if (styleEnd < 0) throw new Error('找不到 </style>');
html = html.slice(0, styleEnd) + '\n' + mobileCss + '\n' + html.slice(styleEnd);

/** 2) 注入 mobile.js —— 必须插在游戏主 IIFE 的 `})();` 之前，
 *    否则拿不到 keys / freshKeys / inputSnapshot / 主循环状态（会直接 ReferenceError）。 */
const scriptEnd = html.lastIndexOf('</script>');
if (scriptEnd < 0) throw new Error('找不到 </script>');
const iifeEnd = html.lastIndexOf('})();', scriptEnd);
if (iifeEnd < 0) throw new Error('找不到游戏主 IIFE 的结束标记');
html = html.slice(0, iifeEnd) + '  // src/mobile.js\n' + mobileJs + '\n' + html.slice(iifeEnd);

/** 3) 补丁：buildInput 读 window.__TOUCH（等价于 Lead 在 src/main.js 里加的那段） */
const moveOld = '    inputSnapshot.moveX = ax;\n    inputSnapshot.moveZ = az;';
if (!html.includes(moveOld)) throw new Error('补丁锚点 1 失效（基线文件的 buildInput 变了）');
html = html.replace(moveOld,
  '    const __T = window.__TOUCH;\n' +
  '    const __useTouch = !!(__T && __T.on);\n' +
  '    if (__useTouch && __T.camX) cam.yaw -= __T.camX * dt * 1.35;\n' +
  '    if (__useTouch && __T.camY) cam.pitch += __T.camY * dt * 0.95;\n' +
  '    inputSnapshot.moveX = __useTouch ? (__T.mx || 0) : ax;\n' +
  '    inputSnapshot.moveZ = __useTouch ? (__T.mz || 0) : az;');

/** 4) 补丁：像素比上限（等价于 Lead 在 src/main.js 的 applyResize 里加的那段） */
const resizeOld = 'render.resize(w, h, window.devicePixelRatio || 1);';
if (!html.includes(resizeOld)) throw new Error('补丁锚点 2 失效');
html = html.replace(resizeOld,
  'const __prMax = window.__PR_MAX || 2;\n    render.resize(w, h, Math.min(window.devicePixelRatio || 1, __prMax));');

writeFileSync(out, html);
console.log(JSON.stringify({ out, bytes: html.length, base: '新宿决战.html', note: '开发夹具，验收请用 dist/新宿决战.html 或 dist/site/' }, null, 2));
