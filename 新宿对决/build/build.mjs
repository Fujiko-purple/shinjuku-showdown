/**
 * 新宿对决/build/build.mjs —— 构建脚本（站点版为主，单文件版可选）
 * ----------------------------------------------------------------------------
 * 产物：
 *   dist/site/                【主产物】可静态托管（Cloudflare Pages），浏览器分别缓存
 *       index.html
 *       assets/three.js       three.js r160（独立文件：一年不变的缓存头）
 *       assets/game.js        游戏模块（每次部署只重下这一个，约 30KB）
 *       assets/styles.css
 *       _headers              给 three.js 打 immutable 缓存头
 *   dist/index.html           【可选】单文件版（--single），给朋友双击/离线玩
 *
 * 设计要点：
 *   · three.js 单独成文件：它依赖 prefix.js 的 __defProp/__export 且用裸名导出，
 *     three 那一块自己闭合成 IIFE 并把命名空间挂到 window.THREE；
 *     游戏那一块开头把用到的名字从 window.THREE 解构出来 —— 源码继续写裸名，改动为零。
 *   · 路径里有中文：必须用 fileURLToPath，new URL().pathname 会做百分号编码（踩过）。
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

/** 游戏代码里用到的 three.js 名字（源码写裸名，构建时从 window.THREE 解构） */
const THREE_NAMES = [
  "WebGLRenderer", "Scene", "Fog", "PerspectiveCamera", "HemisphereLight", "DirectionalLight",
  "Mesh", "PlaneGeometry", "MeshStandardMaterial", "GridHelper", "RingGeometry", "MeshBasicMaterial",
  "Group", "CapsuleGeometry", "SphereGeometry", "ConeGeometry", "CircleGeometry", "Color"
];

const prefix = read(join(SRC, "prefix.js"));
const vendor = read(join(SRC, "vendor.three.js"));
const game = manifest.map((f) => read(join(SRC, f))).join("\n");

const shim = "var " + THREE_NAMES.map((n) => n + " = THREE." + n).join(", ") + ";";
const threeChunk = [prefix, vendor, "window.THREE = three_module_exports;", "})();"].join("\n");
const gameChunk = ["(function () {", "var THREE = window.THREE;", shim, game, "})();"].join("\n");

const CSS = [
  ":root{--azure:#5ff0ff;--crimson:#ff1f3d;--gold:#ffd873;--ink:#070a12}",
  "*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--ink);overflow:hidden}",
  "body{font-family:'Noto Sans JP',system-ui,-apple-system,'Segoe UI',sans-serif;color:#e8eef7}",
  "#stage{position:fixed;inset:0;width:100%;height:100%;display:block}",
  "#overlay{position:fixed;inset:0;pointer-events:none}",
  "#hud2{position:absolute;inset:0}",
  "#hud2 .bar-row{display:flex;align-items:flex-start;gap:14px;padding:10px 14px}",
  "#hud2 .side{flex:1;min-width:0}",
  "#hud2 .side.p2{text-align:right}",
  "#hud2 .nm{font-size:15px;font-weight:700;letter-spacing:.14em;margin-bottom:4px;text-shadow:0 2px 6px #000}",
  "#hud2 .p1 .nm{color:var(--azure)}",
  "#hud2 .p2 .nm{color:var(--crimson)}",
  "#hud2 .bar{height:12px;background:rgba(0,0,0,.62);border:1px solid rgba(255,255,255,.18);overflow:hidden}",
  "#hud2 .bar.ce{height:5px;margin-top:4px;border-color:rgba(255,255,255,.1)}",
  "#hud2 .bar i{display:block;height:100%;transform-origin:left center;transition:transform .06s linear}",
  "#hud2 .p2 .bar i{transform-origin:right center}",
  "#hud2 .bar.hp i{background:linear-gradient(90deg,#8fd8ff,#eaf6ff)}",
  "#hud2 .p2 .bar.hp i{background:linear-gradient(270deg,#ff8a7a,#ffdccf)}",
  "#hud2 .bar.ce i{background:var(--azure);opacity:.85}",
  "#hud2 .p2 .bar.ce i{background:var(--crimson);opacity:.85}",
  "#hud2 .mid{display:flex;flex-direction:column;align-items:center;gap:2px;font-variant-numeric:tabular-nums;min-width:96px}",
  "#hud2 .mid .num{font-size:13px;color:#9fb2cc}",
  "#hud2 .mid .vs{font-size:17px;font-weight:800;letter-spacing:.2em;color:#dbe6f5;text-shadow:0 2px 8px #000}",
  "#hud2 .msg{position:absolute;left:0;right:0;top:44%;text-align:center;font-size:22px;font-weight:800;letter-spacing:.14em;color:var(--gold);text-shadow:0 0 18px rgba(255,216,115,.5),0 3px 0 #000;opacity:.94}",
  "#hud2 .tip{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:13px;color:#8fa3bd;letter-spacing:.06em}",
  "@media (max-width:820px){#hud2 .nm{font-size:13px}#hud2 .msg{font-size:18px}#hud2 .tip{font-size:11px}}"
].join("");

const HEAD = [
  "<!DOCTYPE html>",
  '<html lang="zh-CN"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
  '<meta name="theme-color" content="#070a12">',
  "<title>新宿对决 · M0</title>",
  '<link rel="stylesheet" href="assets/styles.css">',
  "</head><body>",
  '<canvas id="stage"></canvas>',
  '<div id="overlay"></div>'
].join("\n");
const TAIL = "</body></html>";

const byteSize = (p) => { try { return readFileSync(p).length; } catch (e) { return 0; } };
const kb = (p) => (byteSize(p) / 1024).toFixed(0) + "KB";

/* ---------------- 站点版（主产物） ---------------- */
rmSync(SITE, { recursive: true, force: true });
mkdirSync(join(SITE, "assets"), { recursive: true });
writeFileSync(join(SITE, "assets", "three.js"), threeChunk);
writeFileSync(join(SITE, "assets", "game.js"), gameChunk);
writeFileSync(join(SITE, "assets", "styles.css"), CSS);
writeFileSync(join(SITE, "index.html"), [HEAD, '<script src="assets/three.js"></script>', '<script src="assets/game.js"></script>', TAIL].join("\n"));
writeFileSync(join(SITE, "_headers"), "/assets/three.js\n  Cache-Control: public, max-age=31536000, immutable\n\n/assets/game.js\n  Cache-Control: public, max-age=0, must-revalidate\n");

/* ---------------- 单文件版（可选，默认不构建） ---------------- */
let single = null;
if (process.argv.includes("--single")) {
  const inlineHead = HEAD.replace('<link rel="stylesheet" href="assets/styles.css">', "<style>" + CSS + "</style>");
  single = join(DIST, "index.html");
  writeFileSync(single, [inlineHead, "<script>" + prefix + "\n" + vendor + "\n" + game + "\n})();</script>", TAIL].join("\n"));
}

console.log(JSON.stringify({
  站点目录: SITE,
  three: kb(join(SITE, "assets", "three.js")),
  game: kb(join(SITE, "assets", "game.js")),
  index: kb(join(SITE, "index.html")),
  单文件: single || "（未构建，加 --single 才出）",
  modules: manifest.length
}, null, 2));
