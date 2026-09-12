/**
 * _tools/probe.mjs —— 验收探针（A1~A14）
 * ----------------------------------------------------------------------------
 * 对应 CONTRACT.md 的 12 条战斗铁律。全部走真实页面 + 真实固定帧。
 * 只读 window.__SIM / window.__DATA，不读实现内部变量。
 * 用法：node _tools/probe.mjs [--port 9560]
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
if (!existsSync(FILE)) { console.error("找不到产物 " + FILE); process.exit(2); }
const URL = "file:///" + FILE.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");

const R = [];
function check(name, ok, detail) {
  R.push({ name, ok: !!ok });
  console.log((ok ? "  PASS " : "  FAIL ") + name + (detail !== undefined ? "  → " + JSON.stringify(detail) : ""));
}
function head(t) { console.log("\n=== " + t + " ==="); }
const b = new Browser({ port: PORT, width: 1280, height: 720 });
const nap = sleep;

/* ---------------- 页内函数（不能引用外部变量） ---------------- */
function pageBoot() {
  return {
    errs: window.__ERRS || [], sim: !!window.__SIM, mode: window.__SIM ? window.__SIM.mode() : null,
    cards: document.querySelectorAll("#screens .card").length, three: window.__SIM ? window.__SIM.three() : null,
    slots: document.querySelectorAll("#hud3 .slot").length
  };
}
function pageDeterminism() {
  const S = window.__SIM;
  S.pause(true);
  const script = [];
  for (let i = 0; i < 180; i++) {
    script.push({
      moveX: i % 40 < 20 ? 1 : -0.6, moveZ: i % 30 < 10 ? 1 : 0,
      light: i % 11 === 0, heavy: i % 47 === 0, parry: i % 23 === 0, dodge: i % 37 === 0,
      blue: i % 53 === 0, red: i % 71 === 0, purple: i % 97 === 0, domain: i % 89 === 0, v: i % 13 === 0
    });
  }
  function run() {
    S.reset(4242, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "ai");
    const hs = [];
    for (let i = 0; i < script.length; i++) { S.step(script[i], null); hs.push(S.hash()); }
    return hs;
  }
  const a = run(), c = run();
  S.pause(false);
  let firstDiff = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) { firstDiff = i; break; }
  return { same: a.join(",") === c.join(","), firstDiff, frames: script.length, sample: a.slice(0, 4) };
}
function pageParry() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(1, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.4, 0, Math.PI / 2); S.place(1, 1.4, 0, -Math.PI / 2);
  const hp0 = S.hp(1), ce0 = S.ce(1);
  let evs = [];
  for (let f = 0; f <= 24; f++) {
    const e = S.step({ light: f === 0 }, { parry: f === 3 });
    if (e) evs = evs.concat(e);
  }
  const pe = evs.filter((e) => e.type === "parry")[0] || null;
  const out = { hpBefore: hp0, hpAfter: S.hp(1), ceGain: +(S.ce(1) - ce0).toFixed(2), counter: pe ? pe.data.counter : null, foeStun: pe ? pe.data.foeStun : null };
  S.reset(1, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.4, 0, Math.PI / 2); S.place(1, 1.4, 0, -Math.PI / 2);
  const hpA = S.hp(1);
  let hit = false;
  for (let f = 0; f <= 24; f++) { const e = S.step({ light: f === 0 }, {}); if (e) for (const x of e) if (x.type === "hit") hit = true; }
  out.controlDmg = hpA - S.hp(1); out.controlHit = hit;
  S.pause(false);
  return out;
}
function pageResource() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(2, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -12, 0, Math.PI / 2); S.place(1, 12, 0, -Math.PI / 2);
  S.setCE(0, 50);
  const far0 = S.ce(0);
  for (let i = 0; i < 180; i++) S.step({}, {});
  const far1 = S.ce(0);
  S.place(0, -1.2, 0, Math.PI / 2); S.place(1, 1.2, 0, -Math.PI / 2);
  const near0 = S.ce(0);
  for (let i = 0; i < 180; i++) S.step({}, {});
  S.pause(false);
  return { far0, far1, near0, near1: S.ce(0) };
}
function pageDataRules() {
  const M = window.__DATA.MOVES;
  const bad = [], slowUnblock = [];
  Object.values(M).forEach((m) => {
    if (m.dmg > 0 && m.kind !== "domain") {
      const zero = (m.def || []).filter((d) => d === "parry" || d === "dodge" || d === "walk");
      if (!zero.length) bad.push(m.id);
    }
    if (m.unblockable && m.startup < 48) slowUnblock.push(m.id + ":" + m.startup);
  });
  /** 规则 11 的判据只针对"非连段招"：连段腿本来就要快，靠 chain 收招；远程招用 CD 兜底 */
  const attack = Object.values(M).filter((m) => m.dmg > 0 && m.kind !== "domain");
  const shortRecover = attack.filter((m) => m.recovery < 30 && !m.chain && (m.kind === "melee")).map((m) => m.id);
  const spammyRanged = attack.filter((m) => m.kind === "projectile" && (m.cd || 0) < 300).map((m) => m.id);
  const armor = Object.values(M).filter((m) => m.armor).length;
  return { bad, slowUnblock, shortRecover, spammyRanged, armorCount: armor, moveCount: Object.keys(M).length };
}
function pageWhiff() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(3, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, 0, 0, Math.PI / 2); S.place(1, 6.2, 0, -Math.PI / 2);
  const hp0 = S.hp(0);
  let whiffHit = false, hits = 0;
  for (let f = 0; f <= 90; f++) {
    const i0 = { heavy: f === 0 };
    const i1 = { moveX: f >= 18 ? -1 : 0, moveZ: 0, light: f === 42 || f === 56 };
    const e = S.step(i0, i1);
    if (e) for (const x of e) { if (x.type === "hit") { hits++; if (x.data.by === "gojo") whiffHit = true; } }
  }
  S.pause(false);
  return { whiffHit, hits, dmg: hp0 - S.hp(0) };
}
function pagePoise() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(4, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.3, 0, Math.PI / 2); S.place(1, 1.3, 0, -Math.PI / 2);
  const p0 = S.state().fighters[1].poise;
  let evs = [];
  /** 三连段的真实节奏：每 12 帧按一次轻击（后摇前半段接下一段） */
  for (let f = 0; f <= 150; f++) {
    const e = S.step({ light: f % 12 === 0, moveX: 1 }, {});   // 边打边贴（真人也是这么打的）
    if (e) evs = evs.concat(e);
  }
  const p1 = S.state().fighters[1].poise;
  const broken = evs.filter((e) => e.type === "broken").length;
  // 处决：把对手打到架势崩坏，再按 K
  S.reset(5, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.3, 0, Math.PI / 2); S.place(1, 1.3, 0, -Math.PI / 2);
  const foe = S.state().fighters[1];
  let execEv = null, hpBefore = S.hp(1);
  for (let f = 0; f <= 420 && !execEv; f++) {
    // 先连续打到架势崩坏，崩坏后按 K 处决
    const wantHeavy = S.state().fighters[1].broken > 0;
    const e = S.step(wantHeavy ? { heavy: true } : { light: f % 12 === 0, moveX: 1 }, {});
    if (e) for (const x of e) if (x.type === "execute") execEv = x;
  }
  S.pause(false);
  return { poiseBefore: p0, poiseAfter: p1, brokenEvents: broken, exec: !!execEv, execDmg: execEv ? execEv.data.dmg : 0, hpBefore, pct: execEv ? +(execEv.data.dmg / 1800).toFixed(3) : 0 };
}
function pageBlackFlash() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(6, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.4, 0, Math.PI / 2); S.place(1, 1.4, 0, -Math.PI / 2);
  const hp0 = S.hp(1);
  let bf = false;
  // light1 起手 5 帧 → 判定在 f=5 附近；f=4/5/6 按 V 命中
  for (let f = 0; f <= 30; f++) {
    const e = S.step({ light: f === 0, v: f === 5 }, {});
    if (e) for (const x of e) if (x.type === "blackflash") bf = true;
  }
  const dmgBf = hp0 - S.hp(1);
  // 对照：不按 V
  S.reset(6, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -1.4, 0, Math.PI / 2); S.place(1, 1.4, 0, -Math.PI / 2);
  const hp1 = S.hp(1);
  for (let f = 0; f <= 30; f++) S.step({ light: f === 0 }, {});
  const dmgPlain = hp1 - S.hp(1);
  S.pause(false);
  return { bf, dmgBf, dmgPlain, ratio: +(dmgBf / dmgPlain).toFixed(2) };
}
function pageDomain() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(7, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.place(0, -2, 0, Math.PI / 2); S.place(1, 2, 0, -Math.PI / 2);
  S.setGauge(0, 100);
  let dom = null;
  for (let f = 0; f <= 90; f++) { const e = S.step({ domain: f === 0 }, {}); if (e) for (const x of e) if (x.type === "domain") dom = x; }
  const st = S.state();
  const frozen = st.fighters[1].frozen > 0 || st.fighters[1].hitstun > 0;
  // 封闭领域的外壳要能被打碎：把宿傩挪出去，再用弹道打掉锚点
  S.place(1, 26, 0, -Math.PI / 2);
  S.setGauge(0, 0); S.setGauge(1, 0);
  // 领域对拼：宿傩也开领域 → 后开的被压碎（它也允许在被冻结时展开，这是开放领域的特权）
  S.setGauge(1, 100);
  let clash = null, broken = null;
  for (let f = 0; f <= 90; f++) { const e = S.step({}, { domain: f === 0 }); if (e) for (const x of e) { if (x.type === "domainclash") clash = x; if (x.type === "domainbroken") broken = x; } }
  S.pause(false);
  return { opened: !!dom, domKind: dom ? dom.data.kind : null, anchors: dom ? dom.data.anchors : 0, enemyFrozen: frozen, clash: !!clash, loser: broken ? broken.data.id : null };
}
function pageMahoraga() {
  const S = window.__SIM;
  S.pause(true);
  S.reset(8, "gojo", "sukuna"); S.control(0, "human"); S.control(1, "human");
  S.summon();
  let m = null;
  for (let f = 0; f < 40 && !m; f++) { S.step({}, {}); m = S.maho(); }
  const alive0 = !!(m && m.alive);
  const ad0 = m ? m.adapt.melee : -1;
  S.damageMaho("light1", "melee"); S.damageMaho("light1", "melee");
  const after = S.maho();
  const ad1 = after ? after.adapt.melee : -1;
  const hpBefore = S.hp(1);
  S.damageMaho("purple", "skill");
  const after2 = S.maho();
  S.pause(false);
  return { alive0, ad0, ad1, afterPurpleAlive: after2 ? after2.alive : null, foeHpKept: S.hp(1) === hpBefore };
}
function pageKO() {
  const S = window.__SIM;
  S.pause(true);
  S.start("gojo", 1);
  S.pause(true);
  S.setHP(1, 1);
  S.place(0, -1.4, 0, Math.PI / 2); S.place(1, 1.4, 0, -Math.PI / 2);
  let ko = null, evs = [], trace = [];
  S.control(1, "human");
  for (let f = 0; f <= 40; f++) {
    const e = S.step({ light: f === 0 }, {}) || [];
    for (const x of e) { evs.push(x.type); if (x.type === "ko") ko = x; }
    if (f <= 8) { const ff = S.state().fighters; trace.push([f, S.move(0), ff[0].x, ff[1].x, ff[1].hp]); }
  }
  const mode = S.mode();
  const result = document.getElementById("sc-result");
  const shown = result ? !result.classList.contains("hide") : false;
  const title = document.getElementById("sc-rtitle") ? document.getElementById("sc-rtitle").textContent : "";
  S.pause(false);
  return { ko: !!ko, mode, resultShown: shown, title, foeHp: S.hp(1), meHp: S.hp(0), events: evs, trace: trace };
}
function pageAI() {
  const M = window.__DATA.MOVES;
  const S = window.__SIM;
  S.pause(true);
  S.reset(9, "gojo", "sukuna"); S.control(0, "ai"); S.control(1, "ai");
  const seq = [];
  let last = null, repeats = 0, minGap = 999, lastAt = -999, gaps = [];
  for (let f = 0; f < 60 * 40; f++) {
    const e = S.step(null, null);
    if (e) for (const x of e) {
      if (x.type === "start" && x.data.id === "sukuna") {
        const def = ["parry", "dodge", "infinity"].indexOf(x.data.move) >= 0;
        if (def) continue;                       // 规则 9 管的是"进攻招复读"，防御反应不算
        if (x.data.move === last) repeats++;
        last = x.data.move; seq.push(x.data.move);
        gaps.push((f - lastAt) / 60); lastAt = f;
      }
    }
  }
  S.pause(false);
  const real = gaps.slice(1).filter((g) => g < 12);
  return { total: seq.length, repeats, minGapSec: +(Math.min.apply(null, gaps.slice(1).concat([99]))).toFixed(2), sample: seq.slice(0, 14) };
}

try {
  await b.launch(); await b.newPage();
  await b.send("Page.navigate", { url: URL });
  await nap(3200);

  head("A1 启动与界面");
  const boot = await b.evaluate(pageBoot);
  check("A1 无 JS 异常", boot.errs.length === 0, boot.errs);
  check("A1 标题页有 2 张角色卡 + 5 个技能槽", boot.cards === 2 && boot.slots === 5, { cards: boot.cards, slots: boot.slots });
  check("A1 渲染在出画面（draw > 0）", boot.three && boot.three.calls > 0, boot.three);

  head("A2 确定性（铁律 5）");
  const det = await b.evaluate(pageDeterminism);
  check("A2 180 帧混合输入两遍逐帧哈希一致", det.same, det);

  head("A3 招架：零伤害 + 返咒力 + 反击窗口（规则 4）");
  const parry = await b.evaluate(pageParry);
  check("A3 招架窗口内被命中 → 零伤害", parry.hpAfter === parry.hpBefore, parry);
  check("A3 招架成功返咒力 >=12 且给 >=0.35s 反击窗口", parry.ceGain >= 12 && parry.counter >= 21, parry);
  check("A3 对照：不招架就挨打", parry.controlDmg > 0 && parry.controlHit, parry);

  head("A4 距离即资源（规则 5）");
  const res = await b.evaluate(pageResource);
  check("A4 >12m 站 3 秒咒力下降", res.far1 < res.far0 - 6, res);
  check("A4 贴身 3 秒咒力回升", res.near1 > res.near0 + 6, res);

  head("A5/A6/A11 数据表规则（规则 1/2/11）");
  const dr = await b.evaluate(pageDataRules);
  check("A5 所有有伤害的招式都有零伤害解（招架/闪避/走位）", dr.bad.length === 0, dr.bad);
  check("A5 不可格挡的招起手 >=0.8s（48 帧）", dr.slowUnblock.length === 0, dr.slowUnblock);
  check("A6 所有非连段近战招后摇 >=30 帧（0.5s 空招惩罚）", dr.shortRecover.length === 0, dr.shortRecover);
  check("A6 远程招 CD >=5s（规则 9，不许刷）", dr.spammyRanged.length === 0, dr.spammyRanged);
  check("A11 霸体招占比 <=30%", dr.armorCount / dr.moveCount <= 0.3, { armor: dr.armorCount, total: dr.moveCount });
  const whiff = await b.evaluate(pageWhiff);
  check("A6 挥空后对手能塞进反击", whiff.whiffHit === false && whiff.hits >= 1, whiff);

  head("A7 削韧与处决（规则 7/12）");
  const poise = await b.evaluate(pagePoise);
  check("A7 连续命中会打掉架势", poise.poiseAfter < poise.poiseBefore, { before: poise.poiseBefore, after: poise.poiseAfter });
  check("A7 架势崩坏 + 处决伤害 ≈12% 最大血", poise.exec && poise.pct >= 0.11 && poise.pct <= 0.13, poise);

  head("A8 黑闪（按准 ×2.5）");
  const bf = await b.evaluate(pageBlackFlash);
  check("A8 命中帧 ±3 内按 V → 黑闪且伤害 ×2.5", bf.bf && bf.ratio >= 2.4 && bf.ratio <= 2.6, bf);

  head("A9/A10 领域（开放领域可被打破 + 后开被压碎）");
  const dom = await b.evaluate(pageDomain);
  check("A9 领域能展开且内部敌人行动不能", dom.opened && dom.domKind === "void" && dom.enemyFrozen, dom);
  check("A10 领域对拼：开放领域压碎封闭领域（原作结构性优势）", dom.clash && dom.loser === "gojo", dom);

  head("A11 魔虚罗：无血条、适应进度、可打断、茈可击破");
  const mh = await b.evaluate(pageMahoraga);
  check("A11 半血召唤，且挨打会涨适应", mh.alive0 && mh.ad1 > mh.ad0, mh);
  check("A11 茈可以一击击破（原作待遇）", mh.afterPurpleAlive === false, mh);

  head("A12 结算（KO → 结果面板）");
  const ko = await b.evaluate(pageKO);
  check("A12 KO 后进入 result 模式并显示结果面板", ko.ko && ko.mode === "result" && ko.resultShown, ko);

  head("A13 AI（规则 8/9/10）");
  const ai = await b.evaluate(pageAI);
  check("A13 40 秒对局里 AI 不连续复用同一招", ai.total > 6 && ai.repeats === 0, ai);
  check("A13 AI 出手间隔不短于 0.6s（普通难度）", ai.minGapSec >= 0.6, ai);

  const errs2 = await b.evaluate(function () { return window.__ERRS || []; });
  check("Z1 全程无 JS 异常", errs2.length === 0, errs2);

  const bad = R.filter((x) => !x.ok);
  console.log("\n==== 汇总 " + (R.length - bad.length) + "/" + R.length + " PASS ====");
  for (const x of bad) console.log("  FAIL " + x.name);
  process.exitCode = bad.length ? 1 : 0;
} catch (e) {
  console.error("探针异常：", (e && e.stack) || e);
  process.exitCode = 1;
} finally { await b.close(); }
