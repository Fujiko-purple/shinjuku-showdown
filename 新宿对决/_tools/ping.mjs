/**
 * _tools/ping.mjs —— 快速启动体检：加载 → 打印异常 / 模式 / 关键状态 → 截图
 * 用法：node _tools/ping.mjs [--port 9581] [--shot shots/ping.png] [--start]
 */
import { Browser, sleep } from "./cdp.mjs";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg("file", resolve(HERE, "../dist/site/index.html")));
const LIVE = arg("url", "");
const PORT = Number(arg("port", "9581"));
const SHOT = arg("shot", "");
const START = argv.includes("--start");
const URL = LIVE || ("file:///" + FILE.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/"));

const MOBILE = argv.includes("--mobile");
const b = new Browser({ port: PORT, width: MOBILE ? 844 : 1280, height: MOBILE ? 390 : 720 });
try {
  await b.launch();
  await b.newPage();
  if (MOBILE) {
    await b.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await b.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
  await b.send("Page.navigate", { url: URL + (MOBILE ? (URL.indexOf("?") >= 0 ? "&touch=1" : "?touch=1") : "") });
  await sleep(2500);
  const boot = await b.evaluate(function () {
    return {
      errs: window.__ERRS || [],
      hasSIM: !!window.__SIM,
      mode: window.__SIM ? window.__SIM.mode() : null,
      three: window.__SIM ? window.__SIM.three() : null,
      cards: document.querySelectorAll("#screens .card").length
    };
  });
  console.log("BOOT:", JSON.stringify(boot));
  if (START) {
    await b.evaluate(function () { window.__SIM.start("gojo", 1); return true; });
    await sleep(1200);
    const st = await b.evaluate(function () { return { mode: window.__SIM.mode(), state: window.__SIM.state(), errs: window.__ERRS }; });
    console.log("FIGHT:", JSON.stringify({ mode: st.mode, errs: st.errs, f0: st.state.fighters[0], f1: st.state.fighters[1], dist: st.state.dist }));
    await b.keyDown("KeyW"); await sleep(500); await b.keyUp("KeyW");
    await sleep(1500);
    const st2 = await b.evaluate(function () { return { state: window.__SIM.state(), errs: window.__ERRS, stats: window.__SIM.stats() }; });
    console.log("AFTER:", JSON.stringify({ dist: st2.state.dist, hp: st2.state.fighters.map(f => f.hp), proj: st2.state.projectiles, errs: st2.errs, stats: st2.stats }));
  }
  if (SHOT) {
    mkdirSync(dirname(resolve(SHOT)), { recursive: true });
    await b.screenshot(resolve(SHOT));
    console.log("SHOT:", resolve(SHOT));
  }
} catch (e) {
  console.error("PING 异常:", (e && e.stack) || e);
  process.exitCode = 1;
} finally {
  await b.close();
}
