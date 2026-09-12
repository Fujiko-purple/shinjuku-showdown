/**
 * _tools/playtest.mjs —— 用"真按键"打完一整局（站在玩家视角找问题）
 * ----------------------------------------------------------------------------
 * 不是探针：它模拟一个会接近、会打连段、会招架、会放术式、会开领域的普通玩家，
 * 全程通过 CDP 真按键操作，并把关键帧截图 + 事件流水落盘，供人肉复盘。
 * 用法：node _tools/playtest.mjs [--char gojo] [--diff 1] [--sec 150] [--port 9590]
 */
import { Browser, sleep } from "./cdp.mjs";
import { resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg("file", resolve(HERE, "../dist/site/index.html")));
const PORT = Number(arg("port", "9590"));
const CHAR = arg("char", "gojo");
const DIFF = Number(arg("diff", "1"));
const MAXSEC = Number(arg("sec", "180"));
const SHOTS = resolve(arg("shots", resolve(HERE, "../shots/play")));
const URL = "file:///" + FILE.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
mkdirSync(SHOTS, { recursive: true });

const b = new Browser({ port: PORT, width: 1280, height: 720 });
const nap = sleep;
const held = new Set();
async function hold(code, on) {
  if (on && !held.has(code)) { held.add(code); await b.keyDown(code); }
  else if (!on && held.has(code)) { held.delete(code); await b.keyUp(code); }
}
async function tap(code, ms) { await b.keyDown(code); await nap(ms || 40); await b.keyUp(code); }
async function release() { for (const c of Array.from(held)) await hold(c, false); }

const log = [];
function note(t, tag, data) { log.push({ t: +t.toFixed(2), tag, data }); }

try {
  await b.launch(); await b.newPage();
  await b.send("Page.navigate", { url: URL });
  await nap(2800);
  // 选人 + 开始（真点击；cdp.evaluate 不支持传参，用全局中转）
  await b.evaluate("window.__PICKCHAR = " + JSON.stringify(CHAR));
  await b.evaluate(function () {
    const card = document.querySelector('#screens .card[data-char="' + window.__PICKCHAR + '"]');
    if (card) card.click();
    return true;
  });
  await b.evaluate("window.__PICKDIFF = " + JSON.stringify(String(DIFF)));
  await b.evaluate(function () {
    const btns = document.querySelectorAll("#sc-diff button");
    const t = btns[Number(window.__PICKDIFF)];
    if (t) t.click();                                  // 之前忘了点难度，所有测试都在"普通"档跑
    return true;
  });
  await nap(200);
  await b.evaluate(function () { document.getElementById("sc-go").click(); return true; });
  await nap(600);
  await b.evaluate(function () { window.__SIM.pause(false); return true; });

  const t0 = Date.now();
  let lastShot = -99, shots = 0, lastDecision = 0, lastV = -9, lastDomain = -9;
  let maxCombo = 0, seenDomain = false, seenMaho = false, seenResult = false;

  while ((Date.now() - t0) / 1000 < MAXSEC) {
    const st = await b.evaluate(function () {
      const S = window.__SIM;
      if (!S) return null;
      const s = S.state();
      return { mode: S.mode(), st: s, proj: S.world ? null : null, stats: S.stats() };
    });
    if (!st) break;
    const t = (Date.now() - t0) / 1000;
    if (st.mode === "result") {
      if (!seenResult) {
        seenResult = true;
        note(t, "result", st.stats);
        await nap(700);                                  // 等结算面板的淡入（0.25s 过渡）
        await b.screenshot(SHOTS + "/z-result-" + CHAR + ".png");
      }
      break;
    }
    const me = st.st.fighters[0], foe = st.st.fighters[1];
    const d = st.st.dist;
    maxCombo = Math.max(maxCombo, me.combo);
    if (st.st.domains && st.st.domains.length && !seenDomain) { seenDomain = true; note(t, "domain", st.st.domains); await b.screenshot(SHOTS + "/c-domain.png"); }
    if (st.st.maho && st.st.maho.alive && !seenMaho) { seenMaho = true; note(t, "mahoraga", st.st.maho); await b.screenshot(SHOTS + "/d-mahoraga.png"); }

    // ---- 决策（每 120ms 一次）----
    if (Date.now() - lastDecision > 120) {
      lastDecision = Date.now();
      const foeAct = foe.phase;
      // 防御优先：对手起手 → 招架；对手远程 → 闪避
      if (foeAct === "startup" && d < 5.5 && Math.random() < 0.5) { await tap("Space", 60); note(t, "parry_attempt", { foeMove: foe.move }); }
      else if (foe.move === "dismantle" || foe.move === "furnace" || foe.move === "purple") { await tap("ShiftLeft", 50); note(t, "dodge", { foeMove: foe.move }); }
      // 领域：槽满就开（这是本作最值得用的一次性资源）
      const domainReady = me.gauge >= 100 && me.domainT <= 0;
      if (me.hp < me.hpMax * 0.45 && me.ce > 45) {
        await hold("KeyW", false);
        await tap("KeyH", 60); note(t, "heal", { hp: me.hp });          // 血少先自愈（旧版 bot 从来不用，等于白送）
      } else if (domainReady && Date.now() - lastDomain > 8000) { lastDomain = Date.now(); await tap("KeyG", 60); note(t, "open_domain", {}); }
      // 中远距离用"赫"（有伤害）而不是"蒼"（0 伤害的吸附场）
      else if (d > 4.5 && me.ce > 34) { await tap("KeyI", 60); note(t, "skill_mid", { d: +d.toFixed(1) }); }
      else if (d > 3.4) { await hold("KeyW", true); }
      else { await hold("KeyW", false); }
      if (d < 3.6) {
        await hold("KeyW", false);
        await tap("KeyJ", 50);
        // 连段：再补两下
        await nap(130); await tap("KeyJ", 50);
        await nap(130); await tap("KeyJ", 50);
        if (me.ce > 40) { await tap(CHAR === "gojo" ? "KeyI" : "KeyI", 60); }
        if (Math.random() < 0.5) await tap("KeyV", 40);      // 黑闪手感
      }
      if (d > 8) await tap("KeyK", 0.5 * 0);                  // 占位：远距离不乱按
    }
    // 每 20 秒截一张
    if (t - lastShot > 20) { lastShot = t; await b.screenshot(SHOTS + "/t" + String(++shots).padStart(2, "0") + ".png"); }
    await nap(50);
  }
  await release();
  const fin = await b.evaluate(function () { return { mode: window.__SIM.mode(), st: window.__SIM.state(), stats: window.__SIM.stats(), errs: window.__ERRS }; });
  const report = { char: CHAR, diff: DIFF, seconds: +((Date.now() - t0) / 1000).toFixed(1), maxCombo, mode: fin.mode, stats: fin.stats, errs: fin.errs, hp: fin.st.hp, log };
  writeFileSync(SHOTS + "/../playtest-report.json", JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ mode: report.mode, seconds: report.seconds, maxCombo, stats: report.stats, errs: report.errs, hp: report.hp, events: log.length, shots: shots + 3 }, null, 1));
  if (fin.mode !== "result") { await b.screenshot(SHOTS + "/z-timeout.png"); }
} catch (e) {
  console.error("playtest 异常：", (e && e.stack) || e);
  process.exitCode = 1;
} finally { await release(); await b.close(); }
