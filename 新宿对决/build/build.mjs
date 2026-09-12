/**
 * 新宿对决/build/build.mjs —— 构建脚本（站点版为主，单文件版可选）
 * ----------------------------------------------------------------------------
 * 产物：
 *   dist/site/                【主产物】Cloudflare Pages 用
 *       index.html  assets/{three.js,game.js,styles.css}  _headers
 *   dist/index.html           【可选】单文件版（--single）
 * 路径含中文：必须 fileURLToPath，new URL().pathname 会百分号编码（踩过）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const SITE = join(DIST, "site");

const read = (p) => readFileSync(p, "utf8");
const manifest = JSON.parse(read(join(SRC, "manifest.json")));
const missing = manifest.filter((f) => !existsSync(join(SRC, f)));
if (missing.length) { console.error("manifest 里有不存在的模块:", missing.join(", ")); process.exit(2); }

const THREE_NAMES = [
  "WebGLRenderer", "Scene", "Fog", "PerspectiveCamera", "HemisphereLight", "DirectionalLight",
  "Mesh", "PlaneGeometry", "MeshStandardMaterial", "GridHelper", "RingGeometry", "MeshBasicMaterial",
  "Group", "CapsuleGeometry", "SphereGeometry", "ConeGeometry", "CircleGeometry", "Color",
  "BoxGeometry", "CylinderGeometry", "TorusGeometry", "Vector3"
];

const prefix = read(join(SRC, "prefix.js"));
const vendor = read(join(SRC, "vendor.three.js"));
const game = manifest.map((f) => read(join(SRC, f))).join("\n");
const shim = "var " + THREE_NAMES.map((n) => n + " = THREE." + n).join(", ") + ";";
const threeChunk = [prefix, vendor, "window.THREE = three_module_exports;", "})();"].join("\n");
const gameChunk = ["(function () {", "var THREE = window.THREE;", shim, game, "})();"].join("\n");

const CSS = [
  ":root{--azure:#5ff0ff;--crimson:#ff1f3d;--gold:#ffd873;--ink:#05070d;--dim:#8fa3bd}",
  "*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--ink);overflow:hidden;-webkit-tap-highlight-color:transparent}",
  "body{font-family:'Noto Sans JP',system-ui,-apple-system,'Segoe UI',sans-serif;color:#e8eef7;user-select:none}",
  "#stage{position:fixed;inset:0;width:100%;height:100%;display:block}",
  "#overlay{position:fixed;inset:0;pointer-events:none}",
  "#hud3{position:absolute;inset:0;pointer-events:none}",
  "#hud3 .top{display:flex;align-items:flex-start;gap:10px;padding:10px 14px}",
  "#hud3 .side{flex:1;min-width:0}",
  "#hud3 .side.p2{text-align:right}",
  "#hud3 .nm{font-size:16px;font-weight:800;letter-spacing:.12em;text-shadow:0 2px 6px #000;margin-bottom:4px}",
  "#hud3 .nm span{font-size:12px;font-weight:600;letter-spacing:.08em;margin-left:6px}",
  "#hud3 .p1 .nm b{color:var(--azure)}#hud3 .p1 .nm span{color:var(--gold)}",
  "#hud3 .p2 .nm b{color:var(--crimson)}#hud3 .p2 .nm span{color:var(--gold)}",
  "#hud3 .bar{height:13px;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.2);overflow:hidden}",
  "#hud3 .bar+.bar{margin-top:3px}",
  "#hud3 .bar.ce{height:5px;border-color:rgba(255,255,255,.12)}",
  "#hud3 .bar.poise{height:4px;border-color:rgba(255,255,255,.1)}",
  "#hud3 .bar i{display:block;height:100%;transform-origin:left center;background:#eaf6ff;transition:transform .06s linear}",
  "#hud3 .p2 .bar i{transform-origin:right center}",
  "#hud3 .p1 .bar.ce i{background:var(--azure)}#hud3 .p2 .bar.ce i{background:var(--crimson)}",
  "#hud3 .p2 .bar.hp i{background:linear-gradient(270deg,#ff1f3d,#7a1220)}",
  "#hud3 .p1 .bar.hp i{background:linear-gradient(90deg,#8fd8ff,#eaf6ff)}",
  "#hud3 .mid{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:92px;font-variant-numeric:tabular-nums}",
  "#hud3 .mid .clock{font-size:22px;font-weight:800;letter-spacing:.06em;text-shadow:0 2px 8px #000}",
  "#hud3 .mid .dist{font-size:12px;color:var(--dim)}",
  "#hud3 .maho{position:absolute;top:84px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:3px 12px;background:rgba(6,8,14,.72);border:1px solid rgba(255,216,115,.5)}",
  "#hud3 .maho.on{display:flex}",
  "#hud3 .maho.danger{border-color:#ff2b1e;box-shadow:0 0 18px rgba(255,43,30,.6)}",
  "#hud3 .maho .t{font-size:13px;font-weight:700;color:var(--gold);letter-spacing:.1em}",
  "#hud3 .maho .adapt{width:150px;height:7px;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.25);overflow:hidden}",
  "#hud3 .maho .adapt i{display:block;height:100%;transform-origin:left center;background:var(--gold)}",
  "#hud3 .maho .v{font-size:12px;color:#e8eef7}",
  "#hud3 .msg{position:absolute;left:0;right:0;top:36%;text-align:center;font-size:24px;font-weight:800;letter-spacing:.16em;opacity:0;transition:opacity .12s}",
  "#hud3 .msg b{display:block;color:var(--gold);text-shadow:0 0 20px rgba(255,216,115,.6),0 3px 0 #000}",
  "#hud3 .msg span{display:block;font-size:14px;font-weight:600;color:#dfeaf6;letter-spacing:.08em;margin-top:2px;text-shadow:0 2px 6px #000}",
  "#hud3 .msg:not(:empty){opacity:1}",
  "#hud3 .combo{position:absolute;left:24px;top:42%;font-size:26px;font-weight:800;color:#fff;text-shadow:0 0 14px rgba(95,240,255,.8),0 3px 0 #000}",
  "#hud3 .bars{position:absolute;left:0;right:0;bottom:44px;display:flex;justify-content:center;gap:10px}",
  "#hud3 .slot{position:relative;width:64px;height:56px;background:rgba(8,11,18,.78);border:1px solid rgba(255,255,255,.22);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}",
  "#hud3 .slot em{position:absolute;top:2px;left:4px;font-size:10px;font-style:normal;color:var(--dim)}",
  "#hud3 .slot b{font-size:17px;font-weight:800;color:#9fb2cc;letter-spacing:.04em}",
  "#hud3 .slot.ready{border-color:rgba(95,240,255,.85);box-shadow:0 0 12px rgba(95,240,255,.28)}",
  "#hud3 .slot.ready b{color:#fff}",
  "#hud3 .slot .cd{position:absolute;inset:0;background:rgba(0,0,0,.62);transform-origin:top center;opacity:0}",
  "#hud3 .slot .fill{position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--gold);transform-origin:left center}",
  "#hud3 .slot.dom{border-color:rgba(255,216,115,.4)}",
  "#hud3 .keys{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:12px;color:#6f819b;letter-spacing:.04em}",
  "#screens{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .25s}",
  "#screens.show{opacity:1;pointer-events:auto}",
  "#screens .panel{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(5,7,13,.55),rgba(5,7,13,.92));padding:24px;text-align:center}",
  "#screens .panel.hide{display:none}",
  "#screens .logo{font-size:clamp(34px,7.4vmin,64px);font-weight:800;letter-spacing:.3em;color:#fff;text-shadow:0 0 30px rgba(95,240,255,.55),0 4px 0 #000}",
  "#screens .sub{margin-top:6px;font-size:13px;color:var(--dim);letter-spacing:.16em}",
  "#screens .pick{display:flex;gap:20px;margin:26px 0 14px;flex-wrap:wrap;justify-content:center}",
  "#screens .card{width:232px;padding:16px;background:rgba(10,13,20,.86);border:1px solid rgba(255,255,255,.18);cursor:pointer;transition:.15s}",
  "#screens .card:hover{transform:translateY(-2px)}",
  "#screens .card .cn{font-size:24px;font-weight:800;letter-spacing:.1em}",
  "#screens .card .ct{font-size:12px;color:var(--dim);margin:2px 0 8px;letter-spacing:.2em}",
  "#screens .card .cd{font-size:12px;color:#b9c8dc;line-height:1.6}",
  "#screens .card[data-char=gojo].on{border-color:var(--azure);box-shadow:0 0 26px rgba(95,240,255,.35)}",
  "#screens .card[data-char=gojo] .cn{color:var(--azure)}",
  "#screens .card[data-char=sukuna].on{border-color:var(--crimson);box-shadow:0 0 26px rgba(255,31,61,.35)}",
  "#screens .card[data-char=sukuna] .cn{color:var(--crimson)}",
  "#screens .diff{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim)}",
  "#screens .diff button{background:rgba(12,16,24,.9);color:#cfe0f5;border:1px solid rgba(255,255,255,.2);padding:5px 12px;font-size:13px;cursor:pointer}",
  "#screens .diff button.on{background:var(--azure);color:#04121a;border-color:var(--azure);font-weight:700}",
  "#screens .go{margin-top:22px;padding:12px 44px;font-size:19px;font-weight:800;letter-spacing:.24em;cursor:pointer;background:linear-gradient(90deg,rgba(95,240,255,.9),rgba(43,134,255,.9));color:#04121a;border:0}",
  "#screens .go:hover{filter:brightness(1.1)}",
  "#screens .foot{margin-top:14px;font-size:12px;color:#6f819b;letter-spacing:.08em}",
  "#screens .foot b{color:#cfe0f5}",
  "#screens .pt{font-size:36px;font-weight:800;letter-spacing:.4em}",
  "#screens .result .rt{font-size:clamp(38px,8vmin,72px);font-weight:800;letter-spacing:.28em}",
  "#screens .result .rt.win{color:var(--azure);text-shadow:0 0 30px rgba(95,240,255,.6),0 4px 0 #000}",
  "#screens .result .rt.lose{color:var(--crimson);text-shadow:0 0 30px rgba(255,31,61,.6),0 4px 0 #000}",
  "#screens .result .rsub{margin:6px 0 18px;font-size:16px;letter-spacing:.2em;color:#dfeaf6}",
  "#screens .result .stats{display:grid;grid-template-columns:repeat(3,minmax(120px,1fr));gap:8px 22px;margin-bottom:22px;font-size:14px}",
  "#screens .result .stats div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed rgba(255,255,255,.14);padding:3px 0}",
  "#screens .result .stats span{color:var(--dim)}#screens .result .stats b{color:#fff}",
  "#screens .result .row{display:flex;gap:14px}",
  "#screens .result button{padding:10px 32px;font-size:15px;font-weight:700;letter-spacing:.16em;cursor:pointer;background:rgba(12,16,24,.92);color:#dbe6f5;border:1px solid rgba(255,255,255,.28)}",
  "#screens .result button:hover{background:rgba(30,38,52,.95)}",
  "#touch{position:absolute;inset:0;display:none}",
  "html.is-touch #touch{display:block}",
  "html.is-touch #hud3 .keys{display:none}",
  "#stick{position:absolute;left:22px;bottom:26px;width:132px;height:132px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.2);pointer-events:auto}",
  "#stick-knob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(95,240,255,.35);border:1px solid rgba(95,240,255,.7)}",
  ".tbtn{position:absolute;border-radius:50%;background:rgba(12,16,24,.8);border:1px solid rgba(255,255,255,.28);color:#dfeaf6;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;pointer-events:auto}",
  "#btn-light{right:170px;bottom:36px;width:74px;height:74px}",
  "#btn-heavy{right:88px;bottom:74px;width:74px;height:74px}",
  "#btn-parry{right:170px;bottom:124px;width:66px;height:66px;border-color:rgba(95,240,255,.6)}",
  "#btn-dodge{right:26px;bottom:26px;width:66px;height:66px}",
  "#btn-bf{right:96px;bottom:158px;width:58px;height:58px;border-color:rgba(255,216,115,.65);color:var(--gold)}",
  "@media (max-width:900px){#hud3 .bars{bottom:auto;top:64px;gap:6px}#hud3 .slot{width:48px;height:42px}#hud3 .slot b{font-size:13px}#hud3 .slot em{font-size:9px}#hud3 .keys{display:none}",
  "#hud3 .maho{top:auto;bottom:auto;top:118px}#hud3 .msg{top:30%;font-size:18px}#hud3 .combo{font-size:20px;left:12px}}"
].join("");

const HEAD = [
  "<!DOCTYPE html>",
  '<html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
  '<meta name="theme-color" content="#05070d">',
  "<title>新宿対決 · 咒术回战同人对战</title>",
  '<link rel="stylesheet" href="assets/styles.css">',
  "</head><body>",
  '<canvas id="stage"></canvas>',
  '<div id="overlay"></div>',
  '<div id="touch">',
  '  <div id="stick"><i id="stick-knob"></i></div>',
  '  <div class="tbtn" id="btn-light">轻</div>',
  '  <div class="tbtn" id="btn-heavy">重</div>',
  '  <div class="tbtn" id="btn-parry">招架</div>',
  '  <div class="tbtn" id="btn-dodge">闪</div>',
  '  <div class="tbtn" id="btn-bf">黑闪</div>',
  "</div>"
].join("\n");
const TAIL = "</body></html>";

const byteSize = (p) => { try { return readFileSync(p).length; } catch (e) { return 0; } };
const kb = (p) => (byteSize(p) / 1024).toFixed(0) + "KB";

rmSync(SITE, { recursive: true, force: true });
mkdirSync(join(SITE, "assets"), { recursive: true });
writeFileSync(join(SITE, "assets", "three.js"), threeChunk);
writeFileSync(join(SITE, "assets", "game.js"), gameChunk);
writeFileSync(join(SITE, "assets", "styles.css"), CSS);
writeFileSync(join(SITE, "index.html"), [HEAD, '<script src="assets/three.js"></script>', '<script src="assets/game.js"></script>', TAIL].join("\n"));
writeFileSync(join(SITE, "_headers"), "/assets/three.js\n  Cache-Control: public, max-age=31536000, immutable\n\n/assets/game.js\n  Cache-Control: public, max-age=0, must-revalidate\n");

let single = null;
if (process.argv.includes("--single")) {
  const inlineHead = HEAD.replace('<link rel="stylesheet" href="assets/styles.css">', "<style>" + CSS + "</style>");
  single = join(DIST, "index.html");
  writeFileSync(single, [inlineHead, "<script>" + prefix + "\n" + vendor + "\n" + game + "\n})();</script>", TAIL].join("\n"));
}

console.log(JSON.stringify({
  站点目录: SITE, three: kb(join(SITE, "assets", "three.js")), game: kb(join(SITE, "assets", "game.js")),
  index: kb(join(SITE, "index.html")), 单文件: single || "（未构建，加 --single 才出）", modules: manifest.length
}, null, 2));
