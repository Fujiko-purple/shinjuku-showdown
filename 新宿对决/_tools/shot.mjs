/**
 * 快速截图：加载站点版，等固定帧跑起来，截一张全屏图
 * 用法：node _tools/shot.mjs [--out shots/m0.png] [--port 9580] [--sec 3]
 */
import { Browser, sleep } from "./cdp.mjs";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg("file", resolve(HERE, "../dist/site/index.html")));
const OUT = resolve(arg("out", resolve(HERE, "../shots/m0.png")));
const PORT = Number(arg("port", "9580"));
const SEC = Number(arg("sec", "3"));
const URL = "file:///" + FILE.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");

const b = new Browser({ port: PORT, width: 1280, height: 720 });
try {
  await b.launch();
  await b.newPage();
  await b.send("Page.navigate", { url: URL });
  await sleep(2500);
  // 让对方先动起来：按住 W 一小会儿，画面里能看到交火
  await b.keyDown("KeyW");
  await sleep(600);
  await b.keyUp("KeyW");
  await sleep(SEC * 1000);
  mkdirSync(dirname(OUT), { recursive: true });
  await b.screenshot(OUT);
  const st = await b.evaluate(function () { return window.__SIM ? window.__SIM.state() : null; });
  console.log(JSON.stringify({ out: OUT, state: st }, null, 2));
} finally {
  await b.close();
}
