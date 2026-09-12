/**
 * shinjuku2/_tools/probe.mjs —— M0 验收探针
 * ----------------------------------------------------------------------------
 * CONTRACT.md 的 A1~A6 逐条对应下面的 check()。
 * 全部走真实页面 + 真实固定帧；只读 window.__SIM 暴露的接口，不读实现内部变量。
 *
 * 用法：node shinjuku2/_tools/probe.mjs [--file dist/index.html] [--port 9560]
 */
import { Browser, sleep } from "./cdp.mjs";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const FILE = resolve(arg("file", resolve(HERE, "../dist/site/index.html")));
const PORT = Number(arg("port", "9560"));
if (!existsSync(FILE)) { console.error("找不到产物 " + FILE + "（先跑 node 新宿对决/build/build.mjs）"); process.exit(2); }
const URL = "file:///" + FILE.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");

const R = [];
function check(name, ok, detail) {
  R.push({ name, ok: !!ok });
  console.log((ok ? "  PASS " : "  FAIL ") + name + (detail !== undefined ? "  → " + JSON.stringify(detail) : ""));
}
function head(t) { console.log("\n=== " + t + " ==="); }

const b = new Browser({ port: PORT, width: 1280, height: 720 });
const nap = sleep;

/** 页内：确定性重放 */
function pageDeterminism() {
  const S = window.__SIM;
  S.pause(true);
  const script = [];
  for (let i = 0; i < 150; i++) {
    script.push({
      moveX: i % 40 < 20 ? 1 : -0.5, moveZ: (i % 30 < 10) ? 1 : 0,
      light: i % 11 === 0, heavy: i % 47 === 0, parry: i % 23 === 0, dodge: i % 37 === 0
    });
  }
  function run() {
    S.reset(777);
    S.control(0, "human"); S.control(1, "ai");
    const hashes = [];
    for (let i = 0; i < script.length; i++) { S.step(script[i], null); hashes.push(S.hash()); }
    return hashes;
  }
  const a = run(), c = run();
  S.pause(false);
  let firstDiff = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) { firstDiff = i; break; }
  return { same: a.join(",") === c.join(","), firstDiff: firstDiff, frames: script.length, sample: a.slice(0, 6) };
}

/** 页内：招架收益 + 对照组 */
function pageParry() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(1); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.4, 0, Math.PI / 2);
  S.place(1, 1.4, 0, -Math.PI / 2);
  const hp0 = S.hp(1), ce0 = S.ce(1);
  let evs = [];
  for (let f = 0; f <= 22; f++) {
    const e = S.step({ light: f === 0 }, { parry: f === 3 });
    if (e) evs = evs.concat(e);
  }
  const parryEv = evs.filter((e) => e.type === "parry")[0] || null;
  const out = {
    hpBefore: hp0, hpAfter: S.hp(1), ceGain: +(S.ce(1) - ce0).toFixed(2),
    parryEv: !!parryEv, counter: parryEv ? parryEv.data.counter : null,
    foeStun: parryEv ? parryEv.data.foeStun : null, attackerMove: S.move(0)
  };
  S.reset(1); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.4, 0, Math.PI / 2); S.place(1, 1.4, 0, -Math.PI / 2);
  const hpA = S.hp(1);
  let hitEv = null;
  for (let f = 0; f <= 22; f++) {
    const e = S.step({ light: f === 0 }, {});
    if (e) for (const x of e) if (x.type === "hit") hitEv = x;
  }
  out.controlDmg = hpA - S.hp(1);
  out.controlHit = !!hitEv;
  out.parryEventTypes = evs.map((e) => e.type);
  S.pause(false);
  return out;
}

/** 页内：距离即资源 */
function pageResource() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(2); S.control(0, "human"); S.control(1, "human");
  S.place(0, -12, 0, Math.PI / 2); S.place(1, 12, 0, -Math.PI / 2);
  S.setCE(0, 50); S.setCE(1, 50);
  const far0 = S.ce(0), d0 = S.state().dist;
  for (let i = 0; i < 180; i++) S.step({}, {});
  const far1 = S.ce(0);
  S.place(0, -1.2, 0, Math.PI / 2); S.place(1, 1.2, 0, -Math.PI / 2);
  const near0 = S.ce(0), d1 = S.state().dist;
  for (let i = 0; i < 180; i++) S.step({}, {});
  const near1 = S.ce(0);
  S.pause(false);
  return { farDist: d0, far0: far0, far1: far1, nearDist: d1, near0: near0, near1: near1 };
}

/** 页内：零伤害解枚举 */
function pageSolutions() {
  const MOVE = window.__DATA.MOVE;
  const bad = [];
  const list = Object.values(MOVE).filter((m) => m.dmg > 0);
  for (const m of list) {
    const zero = (m.def || []).filter((d) => d === "parry" || d === "dodge");
    if (!zero.length) bad.push(m.id);
  }
  return { moves: list.map((m) => m.id), bad: bad, parryWindowFrames: MOVE.parry.active, heavyRecovery: MOVE.heavy.recovery };
}

/** 页内：空招惩罚窗口 */
function pageWhiff() {
  const MOVE = window.__DATA.MOVE;
  const S = window.__SIM;
  S.pause(true);
  S.reset(3); S.control(0, "human"); S.control(1, "human");
  S.place(0, 0, 0, Math.PI / 2);
  S.place(1, 5.9, 0, -Math.PI / 2);   // 重击 reach 4.2 + hitR 0.8 + BODY_R 0.45 = 5.45 → 5.9m 必然挥空
  const hp0 = S.hp(0);
  let whiffHit = false, hits = 0;
  for (let f = 0; f <= 80; f++) {
    const i0 = { heavy: f === 0 };
    /**
     * ⚠ 对手在重击的 startup（f=0~11）里**不能动**，否则它会自己走进 5.45m 的判定圈，
     * 台架就变成"打一个移动靶"而不是"挥空"（第一版就是这么误报的）。
     * f>=16 起才冲进来，在 p0 的后摇（f=16~47）里反击。
     */
    const i1 = { moveX: f >= 16 ? -1 : 0, moveZ: 0, light: f === 32 || f === 46 };
    const e = S.step(i0, i1);
    if (e) for (const x of e) { if (x.type === "hit") { hits++; if (x.data.by === "gojo") whiffHit = true; } }
  }
  const dmg = hp0 - S.hp(0);
  const st = S.state();
  S.pause(false);
  return { whiffHit: whiffHit, hits: hits, dmg: dmg, heavyRecoveryFrames: MOVE.heavy.recovery,
    p1x: st.fighters[1].x, p0hp: st.fighters[0].hp, p0action: S.move(0), p1action: S.move(1) };
}

try {
  await b.launch();
  await b.newPage();
  await b.send("Page.navigate", { url: URL });
  await nap(3500);

  head("A1 启动");
  const boot = await b.evaluate(function () {
    const S = window.__SIM;
    if (!S) return { err: "no __SIM" };
    return { state: S.state(), three: S.three(), errs: window.__ERRS || [], paused: S.paused() };
  });
  check("A1 页面起来且 __SIM 可用", boot && !boot.err, boot && boot.err);
  check("A1 两个角色都在场", !!(boot && boot.state && boot.state.fighters && boot.state.fighters.length === 2),
    boot && boot.state && boot.state.fighters.map((f) => f.id));
  const fA = await b.evaluate(function () { return window.__SIM.frame(); });
  await nap(400);
  const fB = await b.evaluate(function () { return window.__SIM.frame(); });
  check("A1 固定帧在走（0.4s 内 >=20 帧）", fB - fA >= 20, { from: fA, to: fB, delta: fB - fA, errs: boot && boot.errs, paused: boot && boot.paused });
  check("A1 three.js 在出画面（draw > 0）", !!(boot && boot.three && boot.three.calls > 0), boot && boot.three);

  head("A2 确定性：同一段输入跑两遍必须逐帧一致");
  const det = await b.evaluate(pageDeterminism);
  check("A2 150 帧输入序列两遍逐帧哈希一致", det && det.same, det);

  head("A3 招架：零伤害 + 对手硬直 + 咒力 +12（规则 4）");
  const parry = await b.evaluate(pageParry);
  check("A3 招架窗口内被命中 → 零伤害", parry && parry.hpAfter === parry.hpBefore, parry && { before: parry.hpBefore, after: parry.hpAfter });
  check("A3 招架成功返还咒力 >=12 并给出反击窗口", parry && parry.ceGain >= 12 && parry.counter >= 21, parry && { ceGain: parry.ceGain, counter: parry.counter, foeStun: parry.foeStun, types: parry.parryEventTypes });
  check("A3 对照：不招架就吃伤害（判定真的在跑）", parry && parry.controlDmg > 0 && parry.controlHit, parry && { controlDmg: parry.controlDmg, controlHit: parry.controlHit });

  head("A4 距离即资源（规则 5）");
  const res = await b.evaluate(pageResource);
  check("A4 相距 >12m 站 3 秒 → 咒力下降（每秒约 3）", res && res.far1 < res.far0 - 6, res);
  check("A4 贴身交锋 3 秒 → 咒力回升", res && res.near1 > res.near0 + 6, res && { near0: res.near0, near1: res.near1 });

  head("A5 每个伤害都有零伤害解（规则 1）");
  const sol = await b.evaluate(pageSolutions);
  check("A5 所有有伤害的招式都能被招架或闪避", sol && sol.bad.length === 0, sol);

  head("A6 空招惩罚窗口（规则 11：>=0.5s）");
  const whiff = await b.evaluate(pageWhiff);
  check("A6 重击在射程外会挥空（没有白嫖命中）", whiff && whiff.whiffHit === false, whiff && { hit: whiff.whiffHit });
  check("A6 挥空后对手能塞进反击（>=1 段命中）", whiff && whiff.hits >= 1,
    whiff && { hits: whiff.hits, dmg: whiff.dmg, p1x: whiff.p1x, p0hp: whiff.p0hp, p0action: whiff.p0action, p1action: whiff.p1action });
  check("A6 重击后摇 >=30 帧（0.5s）", whiff && whiff.heavyRecoveryFrames >= 30, whiff && { recovery: whiff.heavyRecoveryFrames });

  const bad = R.filter((x) => !x.ok);
  console.log("\n==== 汇总 " + (R.length - bad.length) + "/" + R.length + " PASS ====");
  for (const x of bad) console.log("  FAIL " + x.name);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) {
  console.error("探针异常：", (e && e.stack) || e);
  process.exitCode = 1;
} finally {
  await b.close();
}
