/**
 * build/build.mjs —— 根构建入口（2026-09-13 起改为「构建新项目」）
 * ----------------------------------------------------------------------------
 * 为什么要有这一层：Cloudflare Pages 是 Git 集成的，它的构建命令指向**这个文件**、
 * 输出目录是 dist/site。新项目在 新宿对决/ 下自己构建，所以要在这里把产物搬到
 * dist/site —— 这样"推送到 GitHub = 自动上线新版"这条链路不用改任何线上配置。
 *
 *   node build/build.mjs              构建新项目 -> dist/site（Pages 用的就是这个）
 *   node build/build.mjs --legacy     旧版 demo 的构建（保留但默认不跑，仅供对照）
 *
 * 另外会写一个"自毁 Service Worker"：旧站的 sw.js 会把外壳缓存住，
 * 不清掉的话老玩家会一直看到旧版（这是真实踩过的坑）。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEW = join(ROOT, "新宿对决");
const OUT = join(ROOT, "dist", "site");
const legacy = process.argv.includes("--legacy");

/** 手写递归复制（原因见下面 cpSync 的注释） */
function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const ent of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, ent.name), d = join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else writeFileSync(d, readFileSync(s));
  }
}

function run(cmd, args, cwd) {
  /**
   * ⚠ 不要开 shell:true —— Windows 上 node 的绝对路径含空格（C:Program Files
odejs
ode.exe），
   * 走 cmd.exe 会被拆成两段（踩过一次）。
   */
  const r = spawnSync(cmd, args, { cwd: cwd || ROOT, stdio: "inherit" });
  if (r.status !== 0) { console.error("BUILD 失败: " + cmd + " " + args.join(" ")); process.exit(r.status === null ? 1 : r.status); }
}

console.log("▸ 构建新项目（新宿对决/）");
run(process.execPath, [join(NEW, "build", "build.mjs")]);

console.log("▸ 同步产物到 dist/site（Cloudflare Pages 的输出目录）");
try {
  const SRC = join(NEW, "dist", "site");
  if (!existsSync(SRC)) throw new Error("源目录不存在: " + SRC);
  rmSync(OUT, { recursive: true, force: true });
  /**
   * ⚠ 不要用 fs.cpSync：在这台 Windows 上对含中文的路径会直接把 node 进程打崩
   * （exit 0xC0000409 STATUS_STACK_BUFFER_OVERRUN，实测）。手写递归复制最稳，Linux 上也一样跑。
   */
  copyDir(SRC, OUT);
  console.log("  已复制 " + readdirSync(OUT).length + " 个顶层条目");
} catch (e) {
  console.error("同步失败:", (e && e.stack) || e);
  process.exit(1);
}

/** 自毁 SW：清缓存 + 注销自己 + 让所有客户端刷新到新版 */
writeFileSync(join(OUT, "sw.js"), [
  "// 自毁 Service Worker：旧站缓存必须清掉，否则老玩家会一直看到旧版",
  "self.addEventListener('install', function (e) { self.skipWaiting(); });",
  "self.addEventListener('activate', function (e) {",
  "  e.waitUntil((async function () {",
  "    try {",
  "      var keys = await caches.keys();",
  "      await Promise.all(keys.map(function (k) { return caches.delete(k); }));",
  "      await self.registration.unregister();",
  "      var cs = await self.clients.matchAll();",
  "      cs.forEach(function (c) { c.navigate(c.url); });",
  "    } catch (err) {}",
  "  })());",
  "});"
].join("\n"));

/** 让老玩家浏览器里的 sw.js 主动更新 */
const idx = join(OUT, "index.html");
writeFileSync(idx, readFileSync(idx, "utf8").replace(
  "</body>",
  '<script>if("serviceWorker" in navigator){try{navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.update();});}).catch(function(){});}catch(e){}}</script>\n</body>'
));

if (legacy) {
  console.log("▸ 旧版 demo 构建（--legacy）");
  if (existsSync(join(ROOT, "旧版备份", "build.mjs"))) run(process.execPath, [join(ROOT, "旧版备份", "build.mjs")]);
  else console.log("  （旧版构建脚本未保留，跳过）");
}

const bytes = (p) => { try { return readFileSync(p).length; } catch (e) { return 0; } };
console.log(JSON.stringify({
  输出: OUT,
  index: (bytes(join(OUT, "index.html")) / 1024).toFixed(1) + "KB",
  game: (bytes(join(OUT, "assets", "game.js")) / 1024).toFixed(0) + "KB",
  three: (bytes(join(OUT, "assets", "three.js")) / 1024).toFixed(0) + "KB",
  标题: (readFileSync(join(OUT, "index.html"), "utf8").match(/<title>([^<]*)</) || [])[1] || "?"
}, null, 2));
