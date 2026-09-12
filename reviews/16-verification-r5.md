# 16 · 第五轮独立验证报告（领域对拼结算 / 普攻打落地魔虚罗）

- 验证者：independent verifier（本轮未修改任何 `src/`、未重新构建、未动 `dist/`、未 git 提交）
- 被测产物：`tmp/lead/dist.html` — **当前修订 SHA256 `5757F94C2C29FF31C1DBEBA6A9A546338E23C0A79088F55BDB22E9DD29AF3ED2`（10,070,038 B）**
- ⚠ **修订说明（重要）**：会话中途（01:07:18）这个产物被**别人重新构建过一次**（旧修订 10,069,101 B）。为了不含糊，两次我都跑了：**除 A13 之外的所有数字，两次运行逐字一致**；A13 那条结论在旧修订上复现、在当前修订上已被修好（下方 A13 给出两组原始数据）。
- 我的探针：`_tools/verify-r5.mjs`（自写，未复用 `probe-fix-ux.mjs`）
- 截图：`shots/verify-round5/*.png`
- 原始日志（本次运行的暂存证据，非交付物）：`tmp/verify-r5/logs/verify-r5-final.log`、`verify-r5.log`、`verify-r5-b.log`、`smoke.log`、`acceptance.log`、`probe-mahoraga.log`、`probe-duel.log`

复现命令：

```
node _tools/verify-r5.mjs --file tmp/lead/dist.html --port 9531 --portm 9532 --phase all
node _tools/verify-r5.mjs --file tmp/lead/dist.html --port 9533 --portm 9534 --phase B
node _tools/smoke.mjs         --file tmp/lead/dist.html --port 9536
node _tools/acceptance.mjs    --file tmp/lead/dist.html --port 9537
node _tools/probe-mahoraga.mjs --file tmp/lead/dist.html --port 9538
node _tools/probe-duel.mjs    --file tmp/lead/dist.html --port 9539
```

我的探针跑分：当前修订 **50 / 56 PASS**，旧修订 52 / 56。6 条 FAIL 里 **4 条是被测方的问题**（B10b / A9 / C3 / C5），**2 条是我自己的断言写反了**（B10c 的「<=2」、A13 的「必须重叠」—— 后者在当前修订已经不重叠，即该项已修好）。

---

## 0 · 一句话结论

| 项 | 结论 |
|---|---|
| **A. 领域对拼结算口径** | **核心问题已修好**：tug 为正/负/0 三种情况赢、为正/负输、12s 超时判负、双崩，共 7 个分支播报全部正确，`snap.clashWinner` 与 `duel.winner` 一致。但**结算面板只活在自己那 3 秒里**：`combat.reset()` / 返回标题 / 重新开始都清不掉它（A9/A11/A12）。同步轴 HUD 的重叠（A13）**已被 01:07 的重新构建修掉**。 |
| **B. 普攻打落地魔虚罗** | **只对了一半**。命中判定确实修好了（第一拳能打到、悬空打不到、反向走位让位、出招朝向跟着副目标），但**「自动吸附到宿傩身上」的元凶 `HitResolver.lunge` 一行都没改**：每一记轻击仍然把玩家**朝宿傩**拽 2.6m。后果是玩家第一拳后被拽出副目标射程（4+2=6m），**整个 1.6s 弱点窗口只能打出 1 下（27 伤害）**；贴脸 1.3m 且全程推摇杆的最好情况 2~3 下（59~98，两次运行分别是 2 和 3）。900 血要 **34 个窗口**（最好情况 10~16 个）。 |

---

## A · 领域对拼结算（用户问题 ①）

做法：真开一场领域对拼（`combat.domains.open('gojo')` + `open('sukuna')`，等 `__SS.state === 'clash'`），把 `combat.ai.difficulty` 置 0 清掉 AI 推搡、`clash.freezeT = 5` 冻住指针，再设定目标 `tug` 与 `sync=5` / `miss=3` / `life`，让**主循环自己**结算；在 `active` 翻掉的那一帧抓 `snap.clashWinner` 与 `tug`（`resolve` 之后 `tug` 会在 2s 内衰减回 0，晚采样会读到假值）。

| 用例 | 强制条件 | 结算时实际 tug | `duel.winner` / `snap.clashWinner` | `#banner` 原文 | `#duel-result` class / 标题 | 判定 |
|---|---|---|---|---|---|---|
| A1 | sync=5，tug=+0.6 | **+0.571** | gojo / gojo | 领域胜利 — 无量空处 压倒 伏魔御厨子 | `win on` / 领域胜利 | **PASS** |
| A2 | sync=5，tug=−0.6 | **−0.593** | gojo / gojo | 领域胜利 — 无量空处 压倒 伏魔御厨子 | `win on` / 领域胜利 | **PASS** |
| A3 | sync=5，tug=0 | **0**（严格 0，无漂移） | gojo / gojo | 领域胜利 — 无量空处 压倒 伏魔御厨子 | `win on` / 领域胜利 | **PASS** |
| A4 | miss=3，tug=+0.6 | **+0.6** | sukuna / sukuna | 领域败北 — 无量空处 碎裂，术式熔断 | `lose on` / 领域败北 | **PASS** |
| A5 | miss=3，tug=−0.6 | **−0.6** | sukuna / sukuna | 领域败北 — 无量空处 碎裂，术式熔断 | `lose on` / 领域败北 | **PASS** |
| A6 | tug=−0.5，life 走到 ≤0（超时分支） | **−0.5**，life 记录 **−0.007** | sukuna / sukuna | 领域败北 — 无量空处 碎裂，术式熔断 | `lose on` / 领域败北，副标题「宿傩 Ⅴ 你 · 同步 0/5 · 失误 0/3 · 用时 0.9s（12s 判定）」 | **PASS** |
| A7 | tug=0，life 走到 ≤0 → `resolve(null)` | **0** | draw / draw | 领域同时崩坏 — 术式熔断 | `draw on` / 两败俱伤 | **PASS** |

原始行（A2，关键反例：tug 为负却赢）：

```
A2 结算: {"winner":"gojo","tug":-0.475,"sync":5,"miss":0,"active":false,"snapWinner":"gojo",
"snapTug":-0.475,"bannerDom":"领域胜利 — 无量空处 压倒 伏魔御厨子","bannerShown":true,
"panel":{"cls":"win on","title":"领域胜利","vs":"你 Ⅴ 宿傩 · 同步 5/5 · 失误 0/3 · 用时 0.0s",
"line":"伏魔御厨子 破碎 — 宿傩 −32 HP · 术式熔断 6.0s"},
"atResolve":{"snapWinner":"gojo","tugAtResolve":-0.593,"life":11.999}}
```

**A2/A4 是对「旧实现会播反」的直接反证**：`src/main.js:1099-1100` 的结构决定旧代码在 A2 会走 `won = tug > 0 = false` / `lost = tug <= 0 = true` → 播「领域败北」；A4 会走 `won = true` → 把败北播成胜利。现在两者都跟着 `clashWinner`。

**「tug 常停在 0 附近」这个说法我拿到了真数据**（不是我造的，是被测方自己的回归套件 `probe-duel` 跑真输入得到的）：

```
e2e-perfect（真实按键 5/5 同步）: {"active":false,"winner":"gojo","sync":5,"miss":0,"elapsed":3.93,"tug":-0.129}
e2e-idle  （真实静止）          : {"active":false,"winner":"sukuna","sync":0,"miss":3,"elapsed":2.32,"tug":-0.693}
```

即：**真玩家 5/5 同步取胜时 tug = −0.129**，旧口径 `tug > 0` 会判负。修复方向正确。

`stats2.clashWins` 计数：每次胜利 `clashWinsDelta = 1`（A1/A2/A3/A8/A9/A10 各 +1，A4~A7 全部 0），**没有重复 +2**。

### A 的反例（我做出来的）

**A9 · `combat.reset()` 清不掉结算面板 — FAIL**

```
A9 reset 前后: {"before":{"cls":"win on","disp":"","op":1},
               "at60":{"cls":"win on","disp":"","op":1,"state":"fight"},
               "at960":{"cls":"win on","disp":"","op":1,"state":"fight"}}
FAIL A9 reset() 立即清掉结算面板
```

根因（读源码确认）：`DomainDuelHud.clearResult()` 只在 `DomainDuel.begin()`（domainduel.js:619）被调用；`onHook("reset")`（1125-1128）只调 `DomainDuelCurrent.reset()` 和 `DomainDuelHud.hide()`，而 `hide()` 只管同步轴 HUD，不碰 `#duel-result`。`DomainDuel.reset()` 也没有清 `resT`。

**A11 · 保留期内「返回标题」→ 结算大字压在标题页最上层**（截图 `shots/verify-round5/a11-title-residue.png`，可肉眼看到「領域胜利」盖住标题页的模式选择按钮）

```
A11 点「返回标题」之后: {"state":"title","panelCls":"win on","panelOpacity":"1",
  "panelZ":"41","titleZ":"40","titleVisible":true,"panelRect":{"x":0,"y":0,"w":1280,"h":720}}
```

z-index 41 > 标题页 `.screen` 的 40（`src/styles.css:597-598`），而 `DomainDuelHud.tick` 在 `resT > 0` 时**提前 return**，连 title/cutscene 的收起判断都不走（domainduel.js:383-392）。

**A12 · 保留期内「重新开始」→ 结算大字留在新一局上**

```
A12 点「重新开始」之后: {"state":"cutscene","panelCls":"win on","panelOpacity":"1","panelZ":"41"}
```

**A13 · 结算面板与同步轴 HUD 重叠 —— 旧修订复现（32,034 px² / 2.4s），当前修订已修好**

旧修订（10,069,101 B）实测：

```
A13 时间线: [{"t":0,"hudDisp":"block","ov":32034,"box":[355,249,925,471],"hud":[330,415,950,514]},
 ... t=2284 全部 ov=32034 ...
 {"t":2492,"hudDisp":"none","ov":0}, {"t":2703,"cls":"","ov":0}]
```

面板盒 570×223、同步轴 HUD 620×99，重叠 32,034 px² ＝ HUD 面积的 52%，持续到结算后约 2.4s。当时的机理是：domainduel.js 只在 `resT > 0` 时**提前 return 不去动 HUD**，而主循环在 `_hudHold`（1.8s）内仍每帧 `show()`，所以两套字照旧叠在一起；桌面截图 `a1-win-tug-pos.png` 里能直接看到白色同步轴与「术式同步 同步 ×5」压在结算框内。

**当前修订（5757F94C…）实测已修好**，同一探针、同一用例：

```
A13 时间线: [{"t":0,"hudDisp":"none","hudOpacity":0,"ov":0,"box":[355,249,925,471],"hud":[0,0,0,0]},
 ... t=2309 全部 hudDisp:"none" ov=0 ...]
C 几何（触屏）: "duelHudRect":null, "duelHudOverlap":0, hudNodes[#duel-hud].disp:"none"
```

即：结算面板出现期间同步轴 HUD 全程 `display:none`，重叠 0。**这一条我按「旧修订存在、当前修订已修」记录**（我的断言写的是「必须重叠」，所以在当前修订上反而 FAIL —— 是我断言方向的问题，不是产品的问题）。

**A8 · 3 秒生命周期 — PASS**：`{"goneAt":2525}`（该计时从 `duelFire` 返回点起算，返回点已在结算后 ~450ms，故实际保留 ≈2.98s，符合 `RESULT_HOLD: 3`）。

**A10 · 连续两局 — PASS**：开局即 `clearResult()`（`afterArm:{"cls":"","disp":"none"}`），第二局结算显示 `lose on` / 领域败北，DOM 里 `#duel-result` 始终只有 1 个（`afterArm:1, afterFire:1`），没有叠加。

---

## B · 普攻 vs 落地弱点窗口魔虚罗（用户问题 ②）

做法：`combat.setAiEnabled(false)` → 把宿傩 HP 压到 50% 触发召唤 → `mahoraga.freeze(true)` + `setEvade(0)` → `force('dive')` 等落到 `state==='down'`（weakT=1.6）→ `setPos` 钉住位置 → 用 `combat.update(input, 1/60, t)` 走真实输入结构（`input.light`），外加一条 CDP 真按键 J。

| 用例 | 场景 | 原始结果 | 判定 |
|---|---|---|---|
| B1 | 宿傩 25m，魔虚罗落地 3m | `maho:27, suk:0`，`hookDelta:{calls:18,offered:18}` | **PASS** |
| B2 | 同场景看朝向 | `face:{yaw:3.142,toMaho:3.142,err:0,pick:'maho'}`（宿傩方向是 0 rad，误差 π） | **PASS** |
| B3 | 魔虚罗悬空 y=5，同水平位置 | `maho:0`；`snap.banner = "魔虚罗悬在空中 —— 近战够不到，按住 Q 锁定后用 苍/赫/茈"` | **PASS** |
| B4 | 宿傩身前 2.6m，魔虚罗背后 3.2m | `suk:1.56, maho:27`（宿傩照吃） | **PASS** |
| B5 | 朝**远离**魔虚罗走 + 普攻 | `maho:0`，`hook:{calls:16, offered:0}`（钩子被调 16 次、**一次都没给副目标**），`intent:[0.39,0.92]` | **PASS** |
| B5b | 对照组：同距离朝魔虚罗走 | `maho:27`，`offered:18` | **PASS**（证明 B5 让位来自方向而非距离） |
| B6 | 窗口结束（state→ascend→air）后再打 | `afterPunch:{maho:0}` | **PASS** |
| B7 | `meleeAim`/`aim` 自洽 | `{"calls":82,"offered":18,"active":false}`，无 NaN，`offered ≤ calls` | **PASS** |
| B8 | CDP 真按键 J（真输入层） | `hp0:900 → hp1:873`（−27） | **PASS** |
| B12 | 副目标是否偷走宿傩的伤害 | 对照组（魔虚罗 14m）`suk:1.56`；实验组（魔虚罗背后 3.2m 窗口内）`suk:1.56` —— **完全相同** | **PASS** |

### B 的反例（重点，本轮最值钱的发现）

**B9 · 「自动吸附到宿傩身上」根本没修 —— 每一记普攻仍然把玩家朝宿傩拽 2.6m**

```
B9 宿傩25m / 魔虚罗身前3m / 单次普攻逐帧:
{"gapM0":3,"gapS0":25,"range":4,"maho":27,"suk":0,
 "moved":2.6,"projSukuna":2.6,"projMaho":-2.6,"hitFrame":7,
 "gapAtHit":5.6,"gapEnd":5.6,
 "trace":[[0,5.6,900],...,[7,5.6,873],...,[29,5.6,873]]}
```

位移在**宿傩方向上的投影 +2.6m、在魔虚罗方向上的投影 −2.6m** —— 玩家朝魔虚罗出拳，人却朝反方向飞出去。原因在 `src/combat.js:1276-1291`：

```
/** 出招小步前冲（打击感） */
lunge(a, dist) {
  const t = a.target;               // ← 永远是宿傩
  ...
  const step = Math.min(dist, Math.max(0, d - 1.7));
  a.actor.ctrl.setPos(nx, 0, nz);   // ← 玩家被搬向宿傩
}
```

`SKILL.PUNCH` 的 `onStart` 就写着 `lunge(a, 2.6)`（combat.js:526-527），重击 `KICK` 是 3.4，黑闪是 5.0。

**这一行本轮没有被任何人动过**：`git diff -U0 -- src/combat.js` 的 hunk 只有 `@@ -1256,0 +1257,2 @@`（新增 _saim）、`@@ -1299 … @@ -1382`（tryMelee）、`@@ -2592 … @@ -2865`（朝向 + 快照）；`lunge` 位于 1277-1291，落在 `1257..1299` 这段**无改动**区间里。

**B10 · 后果：一个 1.6s 弱点窗口只能打出 1 下（27 伤害）**

```
B10 站着连打：attempts:4, damaging:1, per:[27,0,0,0], total:27
  rows: [{hook:{calls:18,offered:18}, gapBefore:3,    gapAfter:5.6,  maho:27},
         {hook:{calls:16,offered:0},  gapBefore:5.6,  gapAfter:8.2,  maho:0},
         {hook:{calls:16,offered:0},  gapBefore:8.2,  gapAfter:10.8, maho:0},
         {hook:{calls:16,offered:0},  gapBefore:10.8, gapAfter:13.4, maho:0}]
B10 按住朝魔虚罗方向连打：attempts:4, damaging:1, per:[27,0,0,0], total:27
  rows: [gap 3→4.45（maho:27）, gap 4.45→5.52（offered:0, maho:0）, ...]
B10c 贴脸 1.3m + 全程推摇杆（最好情况）：旧修订 damaging:2, per:[27,32,0,0], total:59
                                              当前修订 damaging:3, per:[27,32,39,0], total:98
B10 推算: {"dmgPerHit":27,"dmgPerWindowStill":27,"dmgPerWindowWalking":27,
          "windowsFor900_still":34,"windowsFor900_walking":34}
```

机理完全自洽：`lunge` 在 `onStart`（第 0 帧）就把玩家搬走 2.6m，而命中判定第 7 帧才发生；副目标的射程门槛是 `flow.range(4) + mahoHitR(2.0) = 6m`，所以只要开拳瞬间间距 > 3.4m，这一拳的钩子就会 `return null`（B10 第二行的 `offered:0 / calls:16` 就是铁证）。玩家移动速度远追不上这一记瞬移，所以「边推摇杆边打」也是 1 下。

**量化结论**：每下 27（连段后续 32/39），**每窗口 1 下**，魔虚罗 900 血 → **34 个弱点窗口**；贴脸 + 全程推摇杆的最好情况是 2~3 下 / 59~98（两次运行分别测到 2 和 3，这一段有运行间抖动）→ 10~16 个窗口。

**B 的语义部分我确认没问题**：悬空打不到、窗口结束后打不到、反向走位让位、朝向跟着副目标、宿傩的伤害不被偷 —— 这些都被我独立复现了。

---

## C · 回归（4 个套件，全部真跑）

| 套件 | 结果 | 原始依据 |
|---|---|---|
| `smoke.mjs` | 退出码 0 | `"ok": true`，`errors: []`，`"bootStep":"完成"` |
| `acceptance.mjs` | 退出码 0 | `"verdict": { "pass": true }`，`consoleIssues: []`，`failedRequests: []` |
| `probe-duel.mjs` | **41 项检查，失败 0 项**，`__RESULT__{"ok":true,…}` | 输出原文 `检查项 41 项，失败 0 项` / `页面错误 []` |
| `probe-mahoraga.mjs` | **67 条断言，PASS 63 / FAIL 4** | 见下 |

`probe-mahoraga` 的 4 条 FAIL 原文：

```
FAIL F1 锁定状态下「苍」命中空中魔虚罗  → null
FAIL F2 锁定状态下「赫」命中空中魔虚罗  → null
FAIL P1 弹道标定：无闪避时命中率 ≥90%（说明 aim 在新高度下瞄得住）  → {"casts":16,"hits":0,"dodges":0,"hitRate":0}
FAIL P2 难度回归：normal 下命中率落在「能打到但极难」区间（15%~60%，契约 EVADE_P=0.55）  → {"casts":16,"hits":0,"dodges":0,"hitRate":0} 目标区间 15%~60%
```

**是不是同一批历史遗留？我的证据是「它们被测的代码本轮一行没动」**（我手上没有可直接对照的旧产物，所以不给「绝对是同一批」这种我证不了的结论）：

- `git diff -U0 -- src/mahoraga.js` 的 hunk 只有：527（hookCalls/aimUntil/aimOffered）、1511-1533（HUD 文案）、1626（debug.aim）、1944-1974（mahoHitTest 的**近战**分支，删掉的是永远跑不到的「挡下」死代码）、2083+（新增 mahoMeleeAim）、2228/2282（reset）、2341（注册钩子）。
- F1/F2/P1/P2 测的是**术式**（苍/赫 弹道、mahoAim 提前量、EVADE_P、AIR_Y 高度）—— 这些行全部落在上面 hunk **之外**，`MAHO_TUNE.AIR_Y / HIT_R / EVADE_P` 也没有任何 diff。

另外一个必须说的覆盖缺口：**`smoke` / `acceptance` / `probe-duel` / `probe-mahoraga` 四个套件里，grep 不到 `duel-result`、`clashWinner`、`meleeAim` 任何一个符号（命中 0 次）**。也就是说本轮新增的整屏面板与副目标钩子，**没有被任何回归套件覆盖**，只有作者自己的 `probe-fix-ux.mjs` 覆盖，而它没有测 A9/A11/A12/A13 这些收尾与布局分支。

---

## D · 移动端 844×390 触屏（DPR 2，`Emulation.setDeviceMetricsOverride(mobile)` + `setTouchEmulationEnabled(5)`，`html.is-touch` 已生效）

| 检查 | 原始数字 | 判定 |
|---|---|---|
| 面板是否被裁 | `box:{x:234,y:124,w:375,h:142,b:266,rt:610}`，视口 844×390 → `inViewport:true` | **PASS** |
| 字号 | `titleFont:"32.76px"`、`vsFont:"15px"`、`lineFont:"14px"`、`hint:13px` | **PASS**（大字够大；副标题 15px 在 390 高的横屏上偏小但仍可读） |
| 是否压住触屏控件 | `overlaps:[{cls:"t-tip t-show", r:{x:8,y:191,w:320,h:38,rt:328}, ov:3572}]` | **FAIL** |
| 与同步轴 HUD 重叠 | 当前修订：`duelHudRect:null, duelHudOverlap:0`，`#duel-hud` 全程 `display:none`（旧修订是 20,304 px²） | **PASS**（已修） |
| 第二局（败北）面板 | `title:"领域败北"`，`inViewport:true`；仍有 `.t-tip` 的 3572 px² 重叠 | **FAIL**（仅提示条被压） |

截图：`c1-mobile-duel-win.png`（1688×780 = 844×390@2x）、`c2-mobile-duel-lose.png`、`c0-mobile-fight.png`。肉眼可在 c1 里看到：左下角教程提示条「拖动画面转视角 · 双指捏合缩放 …」右端被结算框切成两半（就是那 3572 px²），同步轴 HUD 的轴线与「术式同步 同步 ×5」也压在结算框下沿。底部动作按钮（苍/赫/茈/反/领）没有被压，中央大字清晰可读。

---

## E · 我没能验证 / 存疑的点

1. **12s 完整倒计时我没等满**。A6/A7 用的是真主循环 + `d.life = 0.9`（缩短时钟），走到的确实是 `resolve(..., byTime=true)` 那条分支（记录 `life:-0.007`，面板副标题出现「（12s 判定）」）。真 12s（720 帧）路径由被测方自己的 `probe-duel` 覆盖（`{"elapsed":12,"frames":720,"winner":"draw"}` / `tug:-0.622 → sukuna`，41/41 通过），我没有独立重跑这 12 秒。
2. **`lunge` 该不该改是设计裁定，不是我能定的**。我只证明它仍在、方向仍是宿傩、且直接把弱点窗口的收益压到 1 下。修法要 Lead 拍板（例如让 `lunge` 也吃 `meleeAim` 的副目标，或在副目标生效时跳过 lunge）。
3. **结算面板的 3 秒硬保留 vs 状态切换**：我验证了 reset / 返回标题 / 重新开始三种收尾都不清面板，但没有穷举全部状态。暂停菜单 z-index 55 高于面板 41，所以暂停页本身没被压 —— 这点是我读 CSS 得出的，没有截图实证。
4. **玩家轻击对宿傩只有 1.56 伤害**（对照 S1/S2 完全一致：26 × GUARD_GOJO 0.6 × INCOMING_SCALE 0.1 = 1.56），而对魔虚罗是 27（26 × DAMAGE_IN_SCALE 0.7 × WEAK 1.5）—— 相差 17 倍。`INCOMING_SCALE`（combat.js:75）与 `GUARD_GOJO` 都不在本轮 diff 内，**不是本轮引入的**，但 1800 血的宿傩要靠 1154 下轻击才能打死这件事看着不像有意设计，建议单独查。
5. **`probe-mahoraga` / `probe-duel` 的退出码我没抓到**（后台流式输出被我读了两次，中间那段丢了），只拿到断言统计 63/4 与 41/0。smoke 与 acceptance 的退出码是 0，这个我看到了。
6. **产物在我验证期间被重新构建过**（01:07:18，旧 10,069,101 B → 现 10,070,038 B；同时 `src/domainduel.js` 01:04:47 被改、`_tools/probe-duel.mjs` 01:07:14 被改）。我为此把整套探针在**当前修订上重跑了一遍**：B/A1-A12 全部逐字复现，只有 A13（同步轴 HUD 重叠）从「复现」变成「已修」。我**没有**去核对 `src/domainduel.js` 那次改动的具体内容，也不清楚是否还有别的行为变化 —— 报告只对上面那个 SHA256 负责。
7. **B10c（贴脸最好情况）有运行间抖动**：旧修订 2 下 / 59，当前修订 3 下 / 98。原因是魔虚罗落地位置与弱点窗口的相位每次不完全一致（`Math.random` 参与特效与窗口抽取），所以「最好情况」这个数字我给的是区间而不是定值；B9/B10a/B10b 这些**结论性数字两次完全一致**。
8. 我的探针里有 1 条 FAIL 是**我自己判定写严了**：B3 的横幅第一版用 /悬空/ 去匹配，实际文案是「魔虚罗悬在**空中** —— 近战够不到，按住 Q 锁定后用 苍/赫/茈」，改成 /悬在?空/ + /近战够不到/ 后 PASS。**这是测试的锅，不是产品的锅**，已修正后重跑。

---

## F · 给 Lead 的建议（按性价比排序）

1. **P0（本轮的 B 只修了一半）**：`HitResolver.lunge` 仍把玩家拽向宿傩。要么让 lunge 也走 `HOOKS.meleeAim` 的副目标，要么在副目标生效时跳过 lunge。不修的话「想打魔虚罗打不了」在体感上依然成立 —— 窗口里只能蹭到 1 下，人还一直往宿傩那边滑。
2. **P1**：`#duel-result` 的生命周期要挂到状态机上，而不是自己数 3 秒 —— 至少在 `onHook("reset")`、`state !== 'fight'/'clash'`、以及 `begin()` 三处都 `clearResult()`。
3. **P2（已修，仅剩收尾）**：同步轴 HUD 的重叠在 01:07 的重新构建里已修好（现在全程 `display:none`，重叠 0）。剩下的是**结算面板压在左下角教程提示条 `.t-tip` 上**（触屏 3572 px²，截图 `c1-mobile-duel-win.png` 里那条「拖动画面转视角 · 双指捏合缩放」被切了一半），把面板盒左边界让开提示条右边界（或提示条在结算期间收起）即可。
