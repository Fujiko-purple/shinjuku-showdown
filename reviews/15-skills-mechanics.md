# 15 · 招式与机制参考（宿傩 / 魔虚罗 / 玩家对策）

> **产出方式**：纯读源码（未运行游戏、未做任何改动、未跑构建）。
> 所有数字后面标 `文件:行号`；源码里读不到的一律写「源码未给出」，**不估算、不编造**。
> 实现与注释/契约冲突的地方集中列在 §5，方便后续决策。
>
> 前置阅读：`reviews/13-mechanics-contract.md`（冻结契约）、`reviews/14-verification.md`（实测数字）。
>
> 本作是**单文件 IIFE 拼装**（各 `src/*.js` 共享同一作用域，`var` 互相可见），
> 本文的「文件:行号」都是**源文件内行号**，不是打包产物行号。

---

## 0. 全局数值底账（先看这一节，后面所有换算都基于它）

| 项 | 值 | 出处 |
|---|---|---|
| 五条悟（玩家）血池 | 1500 | `src/combat.js:54` |
| 宿傩血池 | 1800 | `src/combat.js:54` |
| 咒力上限 / 自然回复 / 命中回复 | 100 / 6 每秒 / 1.5 每次命中 | `src/combat.js:55,56,58` |
| 领域槽上限 / 自然累积 / 造成伤害 / 受到伤害 | 100 / 1.4 每秒 / +2 / +3 | `src/combat.js:62,63,65,67` |
| **全局进入伤害系数** `INCOMING_SCALE` | **0.1** | `src/combat.js:75` |
| 宿傩出伤系数 `BOSS_DMG_SCALE` | **1.6**（只放大宿傩打出的伤害） | `src/combat.js:79` |
| 格挡减伤 `GUARD_DR` | 0.32（仅对 `guardable` 招式、且格挡方 `guarding=true`） | `src/combat.js:80` |
| 无下限被动减伤 `INFINITY_PASSIVE_DR` | 0.12（**只要招式标了 guardable 且受击方是玩家就吃**，与是否真在格挡无关） | `src/combat.js:84,1378` |
| 强韧 poise | 玩家 5 / 宿傩 8，每 0.75s 回 1 | `src/combat.js:100,101` |
| 硬直 | 轻 0.24s / 重 0.46s | `src/combat.js:96,97` |
| 顿帧 | 轻 0.05s / 重 0.1s / 黑闪 0.18s | `src/combat.js:92,93,88` |
| 移动 | 走 4.8 / 疾跑基础 8.8 / 宿傩走 4 / 宿傩跑 6.6 / 宿傩突进 15 | `src/combat.js:116,117,118,119,120` |
| 玩家闪避瞬时速度 | 16 | `src/combat.js:114` |

### 0.1 一条完整的伤害链（`src/combat.js:1352-1388`）

```
dmg = h.dmg                                  // 招式原始威力（或 原始威力 × 模块系数）
  ×0.32   若 guardable 且 victim.guarding     // combat.js:1373-1377
  ×0.88   若 guardable 且 victim 是玩家        // combat.js:1378（无下限被动）
  ×(1-drAmount) 若 victim.drT > 0             // combat.js:1379
  ×adaptMul(skill) 若 victim 是宿傩且 phase>=3 且 kind!=="domain"   // combat.js:1380
  ×ai.damageMul ×1.6  若 attacker 是宿傩        // combat.js:1381
  ×0.1                                        // combat.js:1382
  → damageGate 钩子链（魔虚罗庇护等）           // combat.js:1387
  → Math.max(1, dmg)   ← 伤害地板，永远不会是 0 // combat.js:1388
```

**由此得到两条必须记住的结论：**

1. 宿傩打玩家：`原始威力 × 1.6 × 难度倍率 × 0.1`。
   默认难度下倍率为 1.0，所以**实际掉血 = 原始威力 × 0.16**。
2. 玩家打魔虚罗**不走这条链**：魔虚罗的伤害在 `mahoraga.js` 自己算
   （见 §2.5），因为它的判定挂在 `HOOKS.segment` 上而不是 `resolver.apply`。

### 0.2 难度旋钮的真实取值

| 难度参数 | easy | normal | hard | 出处 |
|---|---|---|---|---|
| `AI_REACT` 反应延迟(s) | 0.35 | 0.22 | 0.12 | `src/combat.js:167` |
| `AI_DECIDE` 决策间隔(s) | 0.42 | 0.26 | 0.17 | `src/combat.js:169` |
| `AI_DMG` 宿傩伤害倍率 | 0.75 | 1.0 | 1.3 | `src/combat.js:171` |
| `AI_GUARD` 格挡概率 | 0.3 | 0.55 | 0.8 | `src/combat.js:173` |

`createCombat()` 里写死 `cb.ai.setDifficulty(1)`（`src/combat.js:2439`），
`setDifficulty` 把 x 当作**数字**夹到 0.4~2.5（`src/combat.js:1970-1977`），
x=1 时 `difficultyCurve(1,easy,normal,hard) = normal`（`src/combat.js:176-179`）。
**整包只有 `src/combat.js:2439` 和 `api.setDifficulty`（`src/combat.js:2969-2971`）两处调用，
主线流程没有难度选择 UI**（`src/main.js` 全文无 `setDifficulty`）。
→ 实机 AI 参数恒为：**反应 0.22s / 决策 0.26s / 伤害 ×1.0 / 格挡率 0.55**。

---

## 1. 宿傩（玩家对手）

### 1.1 招式与动作总表

「耗咒力 / CD / 射程 / 伤害 / 可格挡」来自 `src/contract.js:59-78` 的 `SKILL_DATA`；
「起手 cast / 判定 active / 后摇 recover」来自 `src/combat.js:494-865` 的 `buildFlows`。

| # | 名称 | skill key | 类型 | 耗咒力 | CD | 射程 | 基础伤害 | 可格挡 | cast | active | recover | 霸体 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 「解」无形斩击 | `dismantle` | 远程·线判定 | 8 | 1.1 | 90 | 58 | 是 | 0.2 | 0.34 | 0.3 | 否 |
| 2 | 「捌」贴合斩击 | `cleave` | 近战·连斩 | 14 | 2.4 | 5 | 96 | 是 | 0.35 | 0.24 | 0.34 | 是 `hyper` |
| 3 | 「开」火焰弓 / 竈 | `furnace` | 远程·爆炸场 | 30 | 11 | 95 | 190 | 否 | 0.7 | 0.2 | 0.4 | 否 |
| 4 | 领域展开「伏魔御厨子」 | `shrine` | 领域 | 走领域槽，满 100 才可放 | 0 | 0 | 伤害在领域里另算 | 否 | 0.9 | 0.05 | 0.3 | 是 + 不可打断 |
| 5 | 扩张术式「解」空间斩 | `worldslash` | 终盘·必中斩 | 40 | 12 | 9999 | 520 | 否（`unblockable`） | 1.1 | 0.35 | 0.55 | 是 + 不可打断 |
| 6 | 突进 | `rush` | 近战·位移 | 10 | 3 | 40 | 20 | 是 | 0.3 | 0.26 | 0.24 | 是 `hyper` |

逐条补充（都是源码里写死的行为）：

1. **「解」dismantle**（`src/combat.js:692-731`）
   - 起手 0.2s，然后在 `onActive` 生成 5 道斩击视觉并沿线段摧毁建筑；
     `a.data.travel = 0.12` 后做一次**线段命中判定**（`segmentHitsTarget(from, 玩家胸口, 1.35)`），
     命中即 `apply({kind:"projectile"})` 并结束。
   - 判定半径 1.35m（`src/combat.js:715`），本质是「0.32s 后必中」的直线斩——几何上很难躲，
     靠 `invT`（空格无下限）或格挡。
   - AI 只在 `dist > 1.5 && dist < 90` 时把它列入候选（`src/combat.js:2107`）。

2. **「捌」cleave**（`src/combat.js:732-756`）
   - `melee` 型：起手瞬间 `lunge(a, 4.2)` 小步前冲（`src/combat.js:741`、`1274-1289`），
     判定用 `tryMelee`，扫掠半径 `hitR:1.35`，射程 5m，击退 5，`heavy:true`。
   - `hyper:true`（`src/combat.js:739`）：出招期间**免疫硬直**——`apply()` 里
     `armored = staggered && victim.action.flow.hyper` → 取消硬直（`src/combat.js:1433-1434`）。
   - 视觉上是 3 道斩击（`cb.weapons.cleave({count:3})`，`src/combat.js:744-750`）。

3. **「开」furnace**（`src/combat.js:757-773` + `867-916`）
   - `cast 0.7` 后生成一个以 **40 m/s** 直线飞行的火焰场（`src/combat.js:868`），
     当它距玩家 `< 3.6m` 或飞行 `>= 0.75s` 时爆炸（`src/combat.js:888`）。
   - 爆炸判定半径 6m、`unblockable:true`（`src/combat.js:893-907`）。

4. **领域展开「伏魔御厨子」shrine**（`src/combat.js:774-789`；领域本体 `src/combat.js:1904-1927`）
   - 起手 0.9s、`hyper:true` 且 `interruptible:false` → **不可打断**（`src/combat.js:781`）。
   - 释放条件不是 CD 而是领域槽满 100 且不在重整期（`canCast`，`src/combat.js:437-440`）。
   - 领域参数：持续 `SHRINE_LIFE = 8s`（`src/combat.js:156`），
     每 `1s` 斩一次（`SHRINE_SLASH_INTERVAL`，`src/combat.js:158`），
     单次原始伤害 `62`（`SHRINE_DMG`，`src/combat.js:159`），
     作用半径 **90m**（`SHRINE_RADIUS`，`src/combat.js:160`，「无边界领域」）。
   - 判定条件是 `distXZ(宿傩, 玩家) < 90`（`src/combat.js:1908`）→ **实战中等于必中**，
     每次实际掉血 = `62 × 1.6 × 0.1 = 9.92`（`kind:"domain"`，不吃宿傩自己的适应，
     见 `src/combat.js:1380`）。
   - 领域结束（超时/破碎）后进入 `DOMAIN_COOLDOWN = 6s` 重整（`src/combat.js:69,1854`）。

5. **扩张术式「解」worldslash（终盘技）**（`src/combat.js:790-841`）
   - **只在 phase 3 才会被 AI 列入候选**（`src/combat.js:2105`）。
   - `cast 1.1s` 全程有红色预警：地面圆环 + 锁定线 + 屏幕染红（`src/combat.js:806-812`）。
   - `onActive` 时**直接对玩家 apply()**（不是弹道，是 hitscan），
     `kb:9`、`kind:"projectile"`、`unblockable:true`、`hitstop:0.1`（`src/combat.js:825-835`）。
   - 因为 `unblockable`，格挡与无下限被动都无效；**唯一免伤手段是命中瞬间 `invT > 0`**（空格，
     `src/combat.js:1360-1368`）。
   - `interruptible:false` + `hyper:true` → 1.1s 前摇期间**不可打断**（`src/combat.js:797-799`）。
   - 实际掉血 = `520 × 1.6 × 0.1 = 83.2`（玩家 1500 血的 5.5%）。

6. **突进 rush**（`src/combat.js:842-864`）
   - `hyper:true`，前摇 0.3s 内以 `SUKUNA_RUSH = 15 m/s` 直接贴脸（`src/combat.js:856`），
     判定阶段再以 7.5 m/s 续推（`src/combat.js:861`），`hitR:1.5`、击退 5.5。
   - AI 在 `dist > 7 && dist < 40` 时考虑（`src/combat.js:2109`）。

**另外**：玩家与宿傩共用同一张 `SKILL_DATA`（`src/contract.js:59-78`）；
宿傩只会出上表 6 招（AI 候选里没有别的）。

### 1.2 阶段机制 phase 1 / 2 / 3

触发完全按**血量分档**，没有别的条件（`src/combat.js:2015-2041`）：

| 阶段 | 血量区间（`sk.hp / sk.hpMax`） | 出处 |
|---|---|---|
| phase 1 | `frac > 0.66`（1800 → 1188 血以上） | `src/combat.js:2019` |
| phase 2 | `0.33 < frac <= 0.66`（1188 ~ 594 血） | `src/combat.js:2019` |
| phase 3 | `frac <= 0.33`（594 血以下） | `src/combat.js:2019` |

每次换阶段（只在新旧不同时执行一次）：

- 立刻获得 **3 秒 30% 减伤**：`sk.drT = 3; sk.drAmount = 0.3`（`src/combat.js:2023-2024`）。
- 全屏红闪 + 震屏 + `banner("宿傩 — 第 N 阶段")`（`src/combat.js:2025-2026`）。
- 进入 phase ≥ 2 时额外一句 `callout("宿傩 / 解 · 捌 · 开")`（`src/combat.js:2028-2030`）。
- 进入 **phase 3** 时（`src/combat.js:2031-2040`）：
  - `sk.ctrl.setMode("awakened")`（外观切换）；
  - 减伤改为 `drAmount = 0.25`（覆盖上面的 0.3，`src/combat.js:2033`）；
  - 头顶金色「摩虚罗之轮」`cb.wheel.setVisible(true)`（`src/combat.js:2034`，轮子本体 `1543-1593`）；
  - 切终盘 BGM `music_final`，播 `domain_shrine`；
  - `banner("摩虚罗之轮 — 他开始适应你的术式")`。

**半血召唤魔虚罗落在 phase 2 内**：触发条件是 `宿傩 HP ≤ 50%`（`src/mahoraga.js:2100`，
阈值常量 `TRIGGER_RATIO: 0.5` `src/mahoraga.js:56`），而 50% 落在 phase 2 区间（`>0.33`）。
所以玩家看到的顺序通常是：**phase 2 演出 → 半血召唤魔虚罗（2.8s 冻结）→ 继续打到 33% 进 phase 3**。

### 1.3 被动 / 特殊机制

#### (a) 摩虚罗之轮「适应」（这是宿傩**自己**的适应，与魔虚罗的适应是两套）

- 只在 **phase ≥ 3** 生效，且 `h.kind !== "domain"`（`src/combat.js:1380`、`1453`）。
- 玩家每命中宿傩一次 → `cb.adaptSkill(skill)`：该技能计数 +1、`sk.adaptTotal++`、
  法轮点亮一格、冒「适应」字样（`src/combat.js:2358-2368`）。
- 减伤公式：`adaptMul(skill) = max(0.3, 1 - n × 0.12)`，
  即 `ADAPT_PER_HIT = 0.12`、`ADAPT_FLOOR = 0.3`（`src/combat.js:162,164,2354-2357`）。
  → 同一招命中 6 次即触底 30%。**按招分别计数**（`sk.adapt` 是 Map，key 是 skill）。
- `adaptTotal` 累计到 `WHEEL_SEGMENTS = 8` 时横幅「摩虚罗之轮 — 适应完成」
  （`src/combat.js:166,2367`）；法轮 `light(n)` 每格颜色从 `C.CONCRETE2` 变 `C.GOLD`，
  满格时外环变 `C.CRIMSON`（`src/combat.js:1579-1587`）。
- ⚠ 魔虚罗在场时，`mahoraga.js` 每帧把 `cb.wheel` 按下去（`src/mahoraga.js:2113`），
  避免和魔虚罗头顶的法轮重复显示；魔虚罗退场后 `combat.js:2737-2740` 会重新点亮。

#### (b) 领域对决「术式同步」（`src/domainduel.js`，宿傩的领域对抗机制）

双方领域同时展开时进入对拼（`src/combat.js:1811-1829` 调用 `clash.begin()`）。
默认的连点版 `DomainClash`（`src/combat.js:1594-1749`）**已被 domainduel 替换**
（`onHook("clash", createDomainDuel)`，`src/domainduel.js:989`；`DomainRunner` 构造里
`firstHook("clash", …) || new DomainClash(…)`，`src/combat.js:1755`）。

| 参数 | 值 | 出处 |
|---|---|---|
| 指针扫动周期 | 1.6s → 每次同步 −0.12s，下限 1.12s | `src/domainduel.js:48,56,419-421` |
| 窗口宽度（轴长 2.0） | 0.30 → 每次同步 −0.03，下限 0.18 | `src/domainduel.js:58,61,422-424` |
| 窗口停留时间 dwell | `宽度 / 速度`，档位 120 → 99.9 → 81.6 → 65.1 → 50.4 ms | `src/domainduel.js:430-431`（数值见 `52-54` 行注释） |
| 同步成功 | `tug += 0.17`，`sync++`，窗口重抽，指针定格 0.10s | `src/domainduel.js:63,76,634-649` |
| 窗口外按下（失误） | `tug -= 0.12`，`miss++`，锁定 0.25s | `src/domainduel.js:65,69,650-663` |
| 指针扫过没按（错过） | `tug -= 0.08`，`miss++`（不锁定） | `src/domainduel.js:67,664-675` |
| 锁定期内再按 | 不记新失误，锁定续期 +0.06s、上限 0.40s | `src/domainduel.js:71,73,760-765` |
| 胜利 | `sync >= 5` | `src/domainduel.js:78,818` |
| 失败 | `miss >= 3` | `src/domainduel.js:79,819` |
| 12s 超时 | `|tug| >= 0.35` 判胜负，否则双崩 | `src/domainduel.js:86,822-826`；`CLASH_LIFE=12` `src/combat.js:137` |
| 宿傩持续推搡 | `CLASH_AI_PUSH(0.26) × 难度 × (0.7+0.3×宿傩血量比)` 每秒 | `src/domainduel.js:776-781`；常量 `src/combat.js:141` |
| 僵持侵蚀 | `|tug| < 0.15` 时双方各吃 `70×INCOMING_SCALE×dt` | `src/domainduel.js:784-792`；`src/combat.js:143,145` |
| 输家代价 | 伤害取 `CLASH_WIN_DMG[胜者] × 0.1`：玩家输 = 360×0.1 = **−36**、宿傩输 = 320×0.1 = **−32**；熔断时长取 `BURNOUT[输家]`：玩家 5s / 宿傩 6s | `src/combat.js:147,149`；`src/domainduel.js:889` |
| 双崩代价 | 双方各 −9（`90×0.1`）且术式熔断 2s | `src/combat.js:151,1740`；`src/domainduel.js:907` |

**定点窗口位置**：窗口只在指针**前方 0.22~1.05s 能到达**的位置里随机（禁背板），
且与上一个窗口中心至少差 0.26（`src/domainduel.js:81-85,614-631`）。

#### (c) 领域「无量空处」对比（玩家侧，用于理解对撞）

- 持续时间 `VOID_SUPPRESS + 2.5 = 7.5s`（`src/combat.js:152,1789`）。
- 作用半径 60m 内每 0.5s 一跳、每跳 `VOID_DOT_DPS(62) × 0.5 × 0.1 = 3.1`，
  并持续压制玩家硬直 0.22s（`src/combat.js:1885-1903`）。

#### (d) 术式熔断（burnout）

- 熔断期间被锁的招式集合（`src/combat.js:320-323`）：
  - 玩家：苍 / 赫 / 茈 / 200%茈 / 领域展开；
  - 宿傩：解 / 捌 / 开 / 伏魔御厨子 / 空间斩。
- 熔断中这些招 `canCast` 直接 false（`src/combat.js:412-414,436`），
  并且**熔断中不能开领域**（`src/combat.js:1790`）。
- 只在领域对拼结算时施加（`src/combat.js:1727,1739`；`src/domainduel.js:889,907`）。

#### (e) 霸体（hyper）与不可打断

- `flow.hyper` 的效果不是「不掉血」而是「**不吃硬直**」（`src/combat.js:1433-1434`）。
- `interruptible:false` 让 `runner.cancel()` 拒绝非强制打断（`src/combat.js:1172-1173`）。
- 宿傩拥有 hyper 的招：**捌 / 突进 / 伏魔御厨子 / 空间斩**（`src/combat.js:739,848,782,797`）；
  其中「不可打断」的只有**领域展开**与**空间斩**（`781,799`）。

#### (f) 强韧 poise（决定「什么时候能打断他」）

- `POISE = { 玩家 5, 宿傩 8 }`，`POISE_REGEN = 0.75s/点`（`src/combat.js:100,101,389-395`）。
- 轻击（非重击、非黑闪、非弹道）每次只扣 1 点 poise；**只有 poise 归零才会硬直**
  （`src/combat.js:1429-1434`）。
- 判定「重击」的口径：`h.heavyFlag`（踢击/捌等显式标记）或 ```h.dmg >= 150`
  或结算后 `dmg >= 15`（`src/combat.js:94,1427`）。
  → 玩家的**踢击（K）**是重击，**轻击（J）**要连打 8 下才破 poise。

### 1.4 AI 行为（真实阈值与概率，全部来自 `src/combat.js:1936-2254`）

#### (a) 感知：延迟视觉，不读实时状态

- 每帧把玩家状态压进 `obsBuf`（最多 **90** 条，`src/combat.js:2003`）。
- 决策只看 **`reactTime` 之前**的那一条（`reactionView`，`src/combat.js:2006-2013`）——
  默认 0.22s 的延迟。
- 观测字段包括：`dist / attacking / heavy / bigCast / purple / domainCast / guarding / stunned /
  invincible / recovering / hpFrac / px / pz`（`src/combat.js:1984-2002`）。
  其中 `bigCast` = 正在放**赫 / 茈 / 200%茈**，`purple` = 茈，`recovering` = **玩家在后摇中**。

#### (b) 决策：效用评分取最高，每 0.26×rand(0.85,1.2) 秒一次

`decide()`（`src/combat.js:2092-2124`）给候选打分，**取最高分**；
与上一次意图相同的候选 **+13 惯性分**（`src/combat.js:2119`）；
意图锁定 `rand(0.35, 0.75)` 秒（`src/combat.js:2123`）。
决策间隔 `decideInterval × rand(0.85,1.2)`（`src/combat.js:2077`）→ 默认 **0.221~0.312s**。

| 候选 | 分值公式 | 附加条件 | 出处 |
|---|---|---|---|
| 领域展开 | `140`（玩家正在读领域）否则 `58 + (phase-1)×14` | 领域槽满且不在重整期 | `src/combat.js:2104` |
| 空间斩 | `84 + (玩家硬直?12:0) + (距离>12?8:0)` | **仅 phase 3** | `src/combat.js:2105` |
| 开 | `64` | phase ≥ 2、`9 < dist < 95` | `src/combat.js:2106` |
| 解 | `50 + (dist>22?12:0) + punish×0.6` | `1.5 < dist < 90` | `src/combat.js:2107` |
| 捌 | `58 + phase×7 + punish` | `dist <= 射程+0.6`（5.6m） | `src/combat.js:2108` |
| 突进 | `44 + phase×9 + punish` | `7 < dist < 40` | `src/combat.js:2109` |
| 格挡 | `20 × 格挡率 + (重击?14:0)` | 玩家在攻击中、`dist<7.5`、玩家不无敌、`guardCd<=0` | `src/combat.js:2110-2112` |
| 闪避 | `56 + phase×6` | 玩家在读赫/茈/200%茈、`dist<18` | `src/combat.js:2113` |
| 闪避 | `42` | 玩家重击且 `dist<5.5`，且 `random() < 格挡率×0.7` | `src/combat.js:2114` |
| 接近 | `34 + (dist>16?14:0) + punish − (自己血<22%?16:0) − (玩家读茈?22:0) + phase×3` | — | `src/combat.js:2115` |
| 后撤 | `(自己血<35%?44:6) + (玩家大读条?20:0) + (自己血<320?18:0)` | `retreatCd<=0` | `src/combat.js:2116` |
| 侧移 | `22 + phase×3 + punish×0.4` | — | `src/combat.js:2117` |

其中 **`punish = obs.recovering ? 24 : 0`**（`src/combat.js:2103`）——
这就是宿傩的「惩罚窗口」：**玩家挥空/后摇时，捌 +24、突进 +24、解 +14.4**。

#### (c) 执行层的硬限制（玩家的破绽从哪来）

- `act()` 里如果 `sk.action` 还没结束就**只转向、不做别的**（`src/combat.js:2151-2154`）
  → 宿傩**不能取消自己的招式**，一旦起手就必须走完 cast→active→recover。
- 格挡持续 `rand(1, 1.7)` 秒后进入冷却，且 `dist > 6` 时立刻放弃（`src/combat.js:2170-2176`）。
- 后撤执行后 `retreatCd = rand(2.6, 4.2)` 秒（`src/combat.js:2198`）。
- 闪避位移是 `vel += 法向 × 9` 再 `moveTowards(…, SUKUNA_RUN=6.6)`（`src/combat.js:2186-2188`），
  方向只有左右两个候选，且 `intent.until` 到点会反向（`src/combat.js:2190-2193`）。
- 领域对拼期间 AI 完全不动、只转向（`src/combat.js:2056-2061`）。
- `phaseLock > 0`（魔虚罗召唤 2.8s / 击破 1.8s）时**玩家输入与 AI 一起冻结**
  （`src/combat.js:2690-2693`），这是纯演出，不是输出窗口。
- 接近时 phase ≥ 2 会走「侧向偏移 0.45 的绕行接近」，phase 1 是直线接近
  （`src/combat.js:2237-2248`）；后撤时 phase ≥ 2 优先找建筑做掩体
  （`coverPoint()`，`src/combat.js:2126-2144`，掩体点每 1.5s 重算）。

#### (d) 结论：可以稳定惩罚宿傩的时机

| 时机 | 为什么 | 出处 |
|---|---|---|
| 他放「开」（0.7s 前摇） | `interruptible:true`、无 hyper，任何重击/弹道都能打断 | `src/combat.js:757-773` |
| 他放「解」（0.2s 前摇 + 0.34s 判定） | 可以贴脸换血；poise 只 8 | `src/combat.js:692-731` |
| 他放「捌 / 突进」之后 | 这两招 hyper 只覆盖出招期间，**recover 期间没有霸体**（0.34s / 0.24s） | `src/combat.js:735,845` |
| 他格挡时 | 格挡只对 `guardable` 招式生效（−68%），**不可格挡的苍/赫/茈/开 直接穿** | `src/combat.js:1371-1377` |
| 他后撤/侧移时 | 这两个意图不还手；后撤冷却 2.6~4.2s | `src/combat.js:2196-2234` |
| 他刚被 poise 破防 | 硬直 0.46s（重）/ 0.24s（轻） | `src/combat.js:96,97,1438` |

---

## 2. 魔虚罗「八握剑异戒神将」（式神 / 第二阶段）

模块：`src/mahoraga.js`（唯一实现，契约 §4）。触发、建模、AI、HUD 全在这一个文件里。

### 2.1 召唤演出与状态机

**触发（唯一入口）**：每帧检查 `宿傩 HP / HPMAX <= 0.5`，且本局没触发过、没被击破过
（`src/mahoraga.js:2098-2101`）。常量 `TRIGGER_RATIO = 0.5`（`src/mahoraga.js:56`）。

**真实状态名**（`MAHO.state`，`src/mahoraga.js:481`）：

```
off → summon → air ⇄ windup → cast → air
                       └→ dive → down(弱点窗口) → ascend → air
                                          └→ broken（终态，本局不再出现）
```

| 状态 | 含义 | 出处 |
|---|---|---|
| `off` | 未出现 / 已重置 | `src/mahoraga.js:481` |
| `summon` | 召唤演出 2.8s（`SUMMON_LOCK`） | `src/mahoraga.js:57,603` |
| `air` | 悬空巡航（默认状态） | `src/mahoraga.js:724,1246,1258` |
| `windup` | 技能前摇 | `src/mahoraga.js:885` |
| `cast` | 技能收招（斩击波/落雷/弹幕的余波在这段时间继续跑） | `src/mahoraga.js:1187-1190` |
| `dive` | 俯冲位移中（0.45s） | `src/mahoraga.js:1212-1225` |
| `down` | **落地弱点窗口 1.6s** | `src/mahoraga.js:1005-1011` |
| `ascend` | 升空 1.0s（前 0.35s 仍算可打） | `src/mahoraga.js:1014-1022,1241-1252` |
| `broken` | 已击破 | `src/mahoraga.js:1367` |

**召唤演出逐段（`src/mahoraga.js:651-737`）**：

| 时间 | 内容 | 出处 |
|---|---|---|
| 0.00~0.35s | 本体隐藏，金色光柱从法阵往上长到 18m（`DESCEND_FROM`） | `680-682` |
| 0~1.0s | 法轮道具从**宿傩头顶**升起，1.0~2.6s 期间整体旋转闪烁 | `656-672` |
| 0.35~2.20s | 本体从 **18m** 用 ease-out 降落到悬浮高度 | `683-693` |
| 2.20~2.80s | 定格：18m 冲击波 + 金色地环 + 20 块碎石 + 落地音 | `694-707` |
| 2.0s | callout「八握剑异戒神将 / MAHORAGA」+ banner「魔虚罗 · 八握剑异戒神将 降临」 | `715-720` |
| 2.8s | 切 `air`，`cd = 0.9`，**第一招固定为俯冲下砸**（`pendingForce="dive"`） | `721-735` |

- 演出期间 `cb.phaseLock = 2.8`（`src/mahoraga.js:619`）→ 双方输入与 AI 冻结
  （`src/combat.js:2690-2693`）。
- 天空压暗：`fx.screen({desaturate:0.5, vignette:0.55, blur:0.22})`（`src/mahoraga.js:621`）。
- 出场点是**宿傩与玩家连线的中点**（`src/mahoraga.js:591-593`）。
- 护盾开启：`MAHO.protected = true`（`src/mahoraga.js:599`）。
- 模型尺寸：高 **4.2m**、肩宽 **2.6m**（`src/mahoraga.js:60,61`）。

### 2.2 四个术式

技能 id：`MAHO_SKILL_IDS = ["slash","lightning","dive","barrage"]`（`src/mahoraga.js:131`），
中文名 `MAHO_SKILL_NAME`（`src/mahoraga.js:132`）。

| # | 名字 | id | 前摇 | 原始伤害 | 判定 | 预警文案（HUD） | 躲避方式 |
|---|---|---|---|---|---|---|---|
| 1 | **退魔斩** | `slash` | 0.75s | **130** | 贴地斩击波，宽 6m（半宽 3.0）、速 **22 m/s**、存活 2.4s | 「退魔斩 — 横向走位躲开」 | 横向走位 |
| 2 | **落雷** | `lightning` | 0.9s | **150** | 以施法瞬间玩家位置为中心的圆，半径 3.4 | 「落雷 — 离开红圈」 | 走出红圈 |
| 3 | **俯冲下砸** | `dive` | 0.8s | **200** | 落到锁定点，半径 8 | 「俯冲下砸 — 落地后是弱点窗口」 | 前 0.55s 圈跟着你，最后 0.25s 锁死 |
| 4 | **咒力弹幕** | `barrage` | 0.5s | **70 ×3** | 3 连发追踪弹，间隔 0.35s，速 26 m/s，转向率 2.6 rad/s | 「咒力弹幕 — 可格挡」 | 横向跑动 / 无下限 |

参数表出处：`SLASH` / `BOLT` / `LIGHTNING` / `DIVE` 定义在 `src/mahoraga.js:121-124`；
预警文案生成在 `src/mahoraga.js:890`。

逐条实现细节：

1. **退魔斩**（`src/mahoraga.js:917-963`）
   - 生成 6m×1.5m 的贴地波（`BoxGeometry(SLASH.halfW*2, 1.5, 0.5)`，`src/mahoraga.js:924`），
     方向在**发射瞬间锁定**（`dirX/dirZ` 只算一次，`920-922`）——所以横向走位有效。
   - 命中判定：`|玩家 y| < 2.4` 且 `水平距离 < halfW + 0.8 = 3.8m`（`src/mahoraga.js:952-954`）。
   - 沿途摧毁建筑（`destroyAlongSegment(..., 3, ...)`，`src/mahoraga.js:946-948`）。
   - 击退 `kb:12`、`kind:"projectile"`、`hitstop:0.1`（`src/mahoraga.js:955`）。
2. **落雷**（`src/mahoraga.js:969-986`）
   - 落点在**施法瞬间锁死**，整段 0.9s 都是走位窗口（`src/mahoraga.js:903,1180-1183`）。
   - 从 y=42 劈到 y=0.2，命中判定 `距离 < 3.4 + 0.7 = 4.1m` 且 `|玩家 y| < 3`（`982-983`）。
   - 击退 8、`kind:"projectile"`、`hitstop:0.12`。
3. **俯冲下砸**（`src/mahoraga.js:988-1013`、位移在 `1212-1225`）
   - 前摇 0.8s：本体下压发光；红圈**前 0.55s 跟着玩家**（`dur - 0.25`），最后 0.25s 锁定
     （`src/mahoraga.js:1171-1179`）。
   - 落点带 0.25s 速度预判（`pl.vel × 0.25`，`src/mahoraga.js:894,1052`）。
   - 位移 0.45s，位置按 `u²` 插值（先慢后快），到点触发冲击。
   - 冲击判定 `距离 < 8 + 0.7 = 8.7m` 且 `|玩家 y| < 3`，伤害 200、击退 20、
     `kind:"melee"`、`hitstop:0.16`（`src/mahoraga.js:1000-1001`）。
   - **冲击后立刻进 down：弱点窗口 1.6s**（`src/mahoraga.js:1005-1011`）。
4. **咒力弹幕**（`src/mahoraga.js:1072-1126`）
   - 从右手（`handR`）发射，朝玩家胸口（`pl.p.y + 1.1`）追踪；
     每帧最大转向 `turn × dt = 2.6 × dt` 弧度（`src/mahoraga.js:1095-1101`）。
   - **扫掠判定**（弹速 26 m/s，单点判定会漏）：点到线段距离 `< hitR(1.7) + 0.7 = 2.4m`
     （`src/mahoraga.js:1105-1109`）。
   - 存活 3.4s 或 `y < 0.2` 消失（`src/mahoraga.js:1124`）。
   - 若命中时玩家 `invT > 0`：弹被消耗、计入 `stats.boltsBlocked`、不造成伤害（`1110-1116`）。

**所有魔虚罗伤害的唯一出口**是 `mahoHitPlayer()`（`src/mahoraga.js:1137-1160`）：
`dmg = 原始伤害 × SKILL_DMG_SCALE(1.0) × (软狂暴?1.6:1)`，
然后走 `cb.resolver.apply({ from: 宿傩, to: 玩家, skill: SKILL.MAHORAGA, mahoSkill: true })`。

**实际掉血换算**（`原始 × 0.88(玩家无下限被动) × 1.6(BOSS) × 1.0(难度) × 0.1`
= **原始 × 0.1408**）：

| 招式 | 原始 | 实际掉血（常态） | 软狂暴后（×1.6） |
|---|---|---|---|
| 退魔斩 | 130 | **18.3** | 29.3 |
| 落雷 | 150 | **21.1** | 33.8 |
| 俯冲下砸 | 200 | **28.2** | 45.1 |
| 咒力弹幕（单发） | 70 | **9.9** | 15.8 |

> 换算依据：`src/mahoraga.js:109,1141` + `src/combat.js:79,84,1378,1381,1382`。
> `SKILL.MAHORAGA.guardable = true`（`src/contract.js:77`）是 0.88 这一项的来源。

**冷却**：`mahoNextCd` = `lerp(CD_LOW 2.6, CD_HIGH 4.0, 宿傩血量比) × CD_DIFF`
（`src/mahoraga.js:870-875`）→ **宿傩血越少，魔虚罗出招越频繁（2.6~4.0s）**。
同一时刻只允许一个技能（`state === "air"` 且 `cd <= 0` 才起手，`src/mahoraga.js:2150-2158`）。

**选招规则**（`mahoPickSkill`，`src/mahoraga.js:2170-2190`）：
- **不会连放同一招**（`pool = ids.filter(id => id !== lastSkill)`）；
- 权重：俯冲 = `1.2 + (0.5 - 宿傩血量比) × 1.6`，其余三招各 1.0；然后按权重加权随机。
  → 宿傩满血时俯冲权重 0.4（低于其他招），残血时 2.0（明显更爱俯冲，也就是更常送弱点窗口）。

### 2.3 适应机制

- 参与适应的只有**四个术式**：`MAHO_SPELLS = [苍, 赫, 茈, 200%茈]`（`src/mahoraga.js:130`）。
  **近战不参与适应计数**（`src/mahoraga.js:1337-1341,1357`）。
- 每种术式**独立计数**（`MAHO.adapt[skill]`，`src/mahoraga.js:488,1295-1296`）。
- 倍率规则（`mahoAdaptMul`，`src/mahoraga.js:1276-1281`）：

| 该术式累计命中次数 n | 伤害倍率 |
|---|---|
| 1 | ×1.00 |
| 2 | ×**0.45**（`ADAPT_MUL`，`src/mahoraga.js:110`） |
| 3 | ×0.45 |
| **4 起** | **×0（完全免疫）**（`ADAPT_IMMUNE`，`src/mahoraga.js:111`） |

- 法轮：`WHEEL_MAX = 8` 格（`src/mahoraga.js:112`）。
  **每次「升到 2 次」点亮一格、每次「升到 4 次」再点亮一格**（`src/mahoraga.js:1299-1310`）——
  4 个术式 × 2 次 = 恰好 8 格。
- 8 格全亮 → `softRage = true`（软狂暴）：横幅「法轮全亮 —— 适应完成（软狂暴）」，
  **魔虚罗所有技能原始伤害 ×1.6**（`src/mahoraga.js:1318-1327`、`1141`）；
  法轮转速从 0.55 提到 1.6（`src/mahoraga.js:837`）。
- 命中提示：第 2 次「适应 / <招式名> ×0.45」，第 4 次「适应完成 / <招式名> 免疫」
  （`src/mahoraga.js:1304,1313`）；已经完全免疫时打上去会刷「免疫 —— 该术式已被适应」
  （仅当 `raw > 0`，所以 0 伤害的苍不会刷屏，`src/mahoraga.js:1358-1359`）。
- **持续场的节流**：苍这种持续场两次「适应计数」之间至少隔 `CONTINUOUS_CD = 0.75s`
  （`src/mahoraga.js:120,1968-1971`）。
- ⚠ **苍的原始伤害是 0**（`src/combat.js:945` 传 `dmg: 0`），
  但它**照样推进苍的适应计数、照样点亮法轮**——等于白送一格软狂暴进度（见 §3.2）。

### 2.4 悬空 / 落地

**高度**（`AIR_Y`，`src/mahoraga.js:78`）：

| 档位 | 高度 | 兜底高度（camera.js 未调 camFrame 时） |
|---|---|---|
| easy | 4.0m | 3.0m |
| **normal（实机）** | **4.5m** | 3.4m |
| hard | 5.0m | 3.8m |

- 兜底表 `AIR_Y_FALLBACK` 在 `src/mahoraga.js:85`；
  判定「camera.js 有没有真的调 camFrame」看最近 1.5s 有没有调用记录（`src/mahoraga.js:554-559`）。
  **`src/camera.js:722` 确实每帧调用 `firstHook("camFrame", …)`，
  所以实机走的是 AIR_Y，即 normal = 4.5m。**
- 悬浮还有 ±0.55m 的呼吸浮动（`src/mahoraga.js:810`）与躯干 bob 0.18（`825-826`）。
- 航线：**绕宿傩做侧向往返**，半径 `ORBIT_LOCAL = 4/4.5/5m`（`src/mahoraga.js:91`），
  相位速度 `0.34 + (软狂暴?0.12:0)` rad/s（`src/mahoraga.js:777`），
  水平速度上限 `AIR_SPEED = 8/10/12 m/s`（`src/mahoraga.js:94`）。
- 命中球球心 = **胸口**：悬空时 `pos.y + 2.4`，落地/升空时 `pos.y + 1.35`
  （`mahoBodyCenter`，`src/mahoraga.js:544-547`）。
- 命中球半径 `HIT_R = 2.4/2.0/1.7`（`src/mahoraga.js:100`），
  实际判定半径 = `扫掠半径 + HIT_R`（`src/mahoraga.js:1913`）。

**落地后弱点窗口**：

- 时长 `WEAK_T = 1.6s`（`src/mahoraga.js:108`）。
- 进入时横幅「弱点暴露 —— 近战可击」+ callout「弱点暴露 / 1.6s」，
  HUD 显示「弱点暴露 · 近战可击 x.xs」倒计时（`src/mahoraga.js:1009-1010,1515-1517`）。
- **近战判定条件**：`state === "down"` **或** `state === "ascend" && t < 0.35`
  （`src/mahoraga.js:1923`）。
- **弱点窗口内近战伤害 ×1.5**（`WEAK_MELEE_MUL`，`src/mahoraga.js:107,1339`）。
  例：轻击 26 → `26 × 0.7 × 1.5 = 27.3`；踢击 42 → `42 × 0.7 × 1.5 = 44.1`。
- 1.6s 后自动 `ascend`，1.0s 升回空中（`src/mahoraga.js:1241-1252`）。

**为什么悬空时近战打不到**（两层原因，都在源码里）：

1. **几何够不到**：近战扫掠线段锚在攻击者**右手世界坐标**，长度 `range × 0.85`
   （`src/combat.js:1302-1305`），玩家手部高度约 1.4m；
   悬空时魔虚罗胸口在 `4.5 + 2.4 = 6.9m`。判定要求
   `点到线段距离 <= 扫掠半径 + HIT_R`——轻击是 `1.05 + 2.0 = 3.05m`，
   垂直方向差 5.5m ⇒ 数学上不可能命中（`src/mahoraga.js:1911-1915`）。
2. **状态门禁**：即使几何上碰到了，只要不是 `down`（或 `ascend` 的前 0.35s），
   `mahoHitTest` 会直接 `return false`，并弹一句提示
   「魔虚罗悬在空中 —— 近战够不到，按住 Q 锁定后用 苍/赫/茈」（横幅限流 5s，`src/mahoraga.js:1922-1933`）。

**判定半径表**（`扫掠半径 + HIT_R(normal 2.0)`）：

| 玩家招式 | 扫掠半径（源码） | 对魔虚罗的有效距离 |
|---|---|---|
| 轻击 punch | `hitR 1.05`（`src/combat.js:525`） | 3.05m |
| 踢击 kick | `hitR 1.2`（`src/combat.js:547`） | 3.20m |
| 黑闪 | `hitR 1.25`（`src/combat.js:537`） | 3.25m |
| 苍 blue | 2.4（`src/combat.js:944`） | 4.40m |
| 赫 red | 1.5（`src/combat.js:996`） | 3.50m |
| 茈 purple | 1.8（`src/combat.js:1065`） | 3.80m |
| 开 furnace（宿傩的招，玩家没有） | 6（`src/combat.js:893`） | 8.00m |

**对空瞄准（`HOOKS.aim`）**：只有当 `cam.lockOn` 为真时才把弹道掰向魔虚罗胸口
（`mahoAim`，`src/mahoraga.js:2006-2033`；`mahoLockOn()` 读 `cam.lockOn`，`562-567`）。
- 生效招式：**苍 / 赫 / 茈 / 200%茈**（`src/mahoraga.js:2010`）。
- 提前量按弹速算出的飞行时间迭代 2 次（上限 1.6s）；苍的弹速写死 14 m/s，
  赫的弹速 = `SKILL_DATA[RED].range × 0.65 = 22.1 m/s`，茈/200%茈是即时线段，不加提前量
  （`src/mahoraga.js:2014-2032`）。
- 不锁定 → 返回 `null` → 弹道照旧打宿傩。

### 2.5 玩家打它的伤害入口（外部伤害的唯一缩放点）

判定挂载点是 `HOOKS.segment`（`src/mahoraga.js:2284`），被 `combat.js` 在 5 处调用：
近战 `tryMelee`（`src/combat.js:1310`）、苍（`944`）、赫（`996`）、茈（`1065`）、开（`893`）。

`mahoHitTest`（`src/mahoraga.js:1890-1979`）的过滤链：

1. 未出现 / `broken` / `summon` → 不吃（`1892`）。
2. `owner.side !== 玩家` → 不吃（`1895`，宿傩自己的招不会被吃掉）。
3. **近战去重**：同一个攻击实例（`meta.attack`）只结算一次（`1906-1910`）；
   拿不到实例时退化成 0.18s 节流。
4. 几何命中判定：`点到扫掠线段距离 <= 扫掠半径 + HIT_R`（`1911-1915`）。
5. **术式的预判闪避**：几何命中后还有一次翻滚——
   `dodgeCd <= 0 && dodgeT <= 0 && Math.random() < EVADE_P`（`1972-1976`）。
   `EVADE_P = easy 0.30 / normal 0.55 / hard 0.75`（`src/mahoraga.js:104`，实机取 normal = **55%**）。
   翻滚 0.35s（`EVADE_LEAD`）：前 0.12s 以 **55 m/s** 爆发侧移、之后 26×0.4 = 10.4 m/s，
   翻滚冷却 `DODGE_CD = 1.1s`（`src/mahoraga.js:97-99,105,1983-1995,2126-2134`）。
   **翻滚期间不产生任何伤害**（`return false`），并弹「回避 / 预判闪避」。

伤害计算（`mahoApplyHit`，`src/mahoraga.js:1333-1363`）：

```
近战：dmg = raw × DAMAGE_IN_SCALE(0.7) × (弱点窗口 ? 1.5 : 1)     // 近战不吃适应
术式：dmg = raw × DAMAGE_IN_SCALE(0.7) × adaptMul(skill)          // 1339-1341
```

- `DAMAGE_IN_SCALE = 0.7`（`src/mahoraga.js:106`）——**这是外部伤害唯一的缩放点**。
- 打完立即掉血、闪光、飘字、法轮震动（`1345-1355`）。
- 各招「第一次命中」的实际伤害（原始 × 0.7）：

| 玩家招式 | 原始威力 | 对魔虚罗第一击 | 备注 |
|---|---|---|---|
| 苍 | 0（`src/combat.js:945`） | **0** | 但照样推进适应计数 |
| 赫 | 165（`src/contract.js:64`） | **115.5** | 验证报告里的 115 就是它 |
| 茈（满蓄力） | 430（`src/contract.js:65`） | **301** | 蓄力不足时 `× lerp(0.7,1,ratio)` |
| 茈 200% | 900（`src/contract.js:66`） | **630** | 再装填 26s（`src/combat.js:135`） |
| 轻击（弱点窗口） | 26 | **27.3** | 悬空时 0 |
| 踢击（弱点窗口） | 42 | **44.1** | 悬空时 0 |

- **挡下（BLOCK_P / BLOCK_TRANSFER）**：参数确实存在——`BLOCK_P = 0.30`、
  `BLOCK_TRANSFER = 0.35`（`src/mahoraga.js:95,96`），
  命中转记伤害 `Math.max(1, raw × 0.35)`（`src/mahoraga.js:1957`），
  演出是「挡下 / 退魔之剑」+ 金色火花 + 音效。
  **但按当前源码这个分支不可达**——详见 §5.1。

**其他相关**：魔虚罗的提示、挡下、命中、闪避、免疫、击破都会 `pushEvent`
（`mahoraga_weak / mahoraga_damage / mahoraga_dodge / mahoraga_block / mahoraga_broken /
mahoraga_rage / mahoraga_summon / mahoraga_spawned / mahoraga_cast / mahoraga_hit_player`）。

### 2.6 血池与击破

- 血池 `HP = 900`（`src/mahoraga.js:59`，HUD 初始文案也是 `900 / 900`，`src/mahoraga.js:1462`）。
- 击破（`hp <= 0` → `mahoBreak`，`src/mahoraga.js:1360,1365-1405`）后：
  - `state = "broken"`、`alive = false`、`protected = false`、`trueSukuna = true`、
    `finished = true`（**本局不再出现**，`1366-1371`）；
  - `cb.phaseLock = BREAK_LOCK = 1.8s` 演出（`1380`，常量 `58`）：白闪 + 34m 冲击波 +
    60+40 块碎片 + 金色火花 + 天雷 + 横幅「魔虚罗 —— 击破！」；
  - 零件在 1.8s 内做崩解动画（`1394,1407-1423`），1.2s 后本体隐藏、HUD 收起（`1419-1435`）；
  - 弹幕 / 斩击波 / 预警圈全部清场（`1374-1376`）；
  - 宿傩保持「真·宿傩」灵光（`1400-1403,1437-1438`）。
- **庇护与击破后的乘区**（`mahoDamageGate`，`src/mahoraga.js:2069-2082`）：

| 状态 | 玩家 → 宿傩 | 宿傩 → 玩家 |
|---|---|---|
| 魔虚罗存活（庇护期） | ×**0.6**（`GUARD_GOJO`） | ×**1.25**（`GUARD_SUKUNA`） |
| 魔虚罗被击破（真·宿傩） | ×1.0 | ×**1.15**（`TRUE_SUKUNA`） |

- 魔虚罗自己的招式带 `mahoSkill: true`，**不叠加**这层乘区（`src/mahoraga.js:2072`）。
- 击破后血池不会回复；`reset()` 才归零（`src/mahoraga.js:2192-2247`）。

### 2.7 HUD 与屏外指示（模块自建 DOM，不改 hud.js）

- 右上角第二条血条（`#maho-hud`，`right:18px; top:78px; width:min(33vw,430px)`，
  `src/mahoraga.js:1449`）：「八握剑异戒神将 / 魔虚罗 / 适应 n/8」+ 血条 + `HP / HPMAX`
  + 状态行 + 技能预警 + 弱点倒计时（`src/mahoraga.js:1453-1475`）。
- 状态行文案（`src/mahoraga.js:1511`）：
  `down` → 「落地 —— 弱点窗口」；`summon` → 「召唤中」；`broken` → 「已击破」；
  其余 → 「悬空 —— 近战够不到，锁定后用术式」。
- 屏外指示：投影 `|ndcX| > 0.92` 或出画时，屏幕边缘出现「▲ 魔虚罗 NNm（悬空）」
  （`src/mahoraga.js:1527-1562`）；锁定（Q）且目标在画面内时显示金色准星（`1539-1548`）。
- BOSS 取景覆盖：`camFrame` 返回 `frac 0.15→0.085、pitch 0.40→0.26、fracMin 0.13→0.075`，
  用 `ease 4.6`（≈0.7s）插值（`src/mahoraga.js:87-88,2250-2270`）。

---

## 3. 玩家对策速查表

**键位**（`src/main.js:930-942` 的输入采样；说明文案在 `src/body.html:147-184`）：

| 键 | 动作 | 源码 |
|---|---|---|
| W A S D | 移动（相对镜头） | `src/main.js:905-906,924-925` |
| Shift | 疾跑（4.8 → 10.5 m/s，0.35s 起步） | `src/main.js:938`；`src/fighters.js:4137-4143` |
| **空格** | 无下限 / 闪避（0.4s 完全免伤 + 16 m/s 位移，总 CD 1.25s） | `src/main.js:935`；`src/combat.js:2485-2508,111,113` |
| J | 轻击（可三连段） | `src/main.js:930`；连段倍率 `src/combat.js:1131-1138` |
| K | 重击 / 踢击 | `src/main.js:931` |
| V | 黑闪同步键（命中帧 ±1 帧内按下） | `src/main.js:942`；`src/blackflash.js:63-79` |
| U | 术式顺转「苍」 | `src/main.js:932` |
| I | 术式反转「赫」 | `src/main.js:933` |
| O（按住） | 虚式「茈」（蓄力越久越强） | `src/main.js:939`；`src/combat.js:2604-2610` |
| L（按住） | 起手式 · 200% 茈（再装填 26s） | `src/main.js:940`；`src/combat.js:2611-2617,135` |
| H | 反转术式（自愈 180，0.6s 吟唱） | `src/main.js:934`；`src/contract.js:67` |
| G | 领域展开「无量空处」 | `src/main.js:936`；`src/contract.js:68` |
| Q | 锁定开关（**对空必须**） | `src/main.js:349-351`；`src/camera.js:101` |
| P / Esc、R、F | 暂停 / 重开 / 全屏 | `src/main.js:336-355` |
| 鼠标左键拖拽 / 滚轮 / 右键拖拽 | 旋转 / 拉近拉远 / 平移 | `src/main.js:135-154` |

### 3.1 敌方动作 → 玩家应对

| 敌方动作 | 预警 | 玩家按什么 | 站哪里 / 时机 |
|---|---|---|---|
| **宿傩「解」**（58 伤，0.2s 起手） | 5 道斩击 + 音效 | **空格**（无下限） | 它 0.32s 后是线段必中，只能靠 `invT` 硬吃；或在他起手前用 J/K 抢 |
| **宿傩「捌」**（96 伤，5m） | 起手 0.35s + 3 道斩击 | **空格**，或后撤出 5.6m | 它 `hyper` 只覆盖出招期；打完的 0.34s 后摇是你的输出窗口 |
| **宿傩「开」**（190 伤，不可格挡，6m 爆炸圈） | 0.7s 吟唱 + 火焰球 | **空格** / 横向疾跑（Shift） | 无 hyper，可被你的重击打断；别站在他正面 9~95m 的直线上 |
| **宿傩领域「伏魔御厨子」**（8s，每 1s 掉 9.92） | banner「领域展开 — 伏魔御厨子」+ 红光 | **G 反开领域**触发对拼；否则**空格**硬吃每一跳 | 半径 90m 无处可躲；有领域槽时**必然要拼领域**（`src/combat.js:2063-2070`：玩家读领域时 AI 优先反开） |
| **宿傩「空间斩」**（phase 3，520 伤，不可格挡） | 1.1s 全屏红警 + 地面红圈 + 锁定线 | **空格**（唯一解：`unblockable` 只有 `invT` 能免） | 前摇 1.1s 内**打不断他**；看到红线就准备按空格，在**判定瞬间**（红线收束、他举手劈下）按 |
| **宿傩「突进」**（20 伤 + 贴脸） | 0.3s 起手，人直冲过来 | **空格** / 侧向走位 | 他贴脸后大概率接「捌」，空格要留给捌 |
| **领域对拼「术式同步」** | 屏幕中下同步轴，亮窗 | **指针进亮窗的瞬间按 J**（或 K / 鼠标左键） | 窗口停 120→50ms；**窗口外按一次就 miss + 锁定 0.25s**，连点必崩（`src/domainduel.js:23-30`） |
| **魔虚罗 · 退魔斩**（18.3 伤） | HUD「退魔斩 — 横向走位躲开」+ 贴地波 | 横移（A/D）、**Shift 疾跑**、或**空格** | 波的方向在发射瞬间锁死，**侧向一步**即可；别顺着波跑 |
| **魔虚罗 · 落雷**（21.1 伤） | HUD「落雷 — 离开红圈」+ 地面红圈 0.9s | **走出红圈**（4.8 m/s × 0.9s ≈ 4.3m > 判定 4.1m），或**空格** | 圈在起手瞬间锁死、**不追人**——直接走开 |
| **魔虚罗 · 俯冲下砸**（28.2 伤，判定 8.7m） | HUD「俯冲下砸 — 落地后是弱点窗口」+ 红圈 | 前 0.55s 继续跑位，**最后 0.25s + 0.45s 位移阶段按空格** | 红圈**前 0.55s 跟着你**、之后锁死；判定是落地一瞬间，空格 0.4s 完全覆盖 |
| **魔虚罗 · 咒力弹幕**（9.9×3） | HUD「咒力弹幕 — 可格挡」+ 红球 | **空格**（弹会被 `invT` 吃掉并计数）/ 横向疾跑 | 追踪转向只有 2.6 rad/s，**横跑**能甩掉；HUD 写的「可格挡」实际上玩家没有格挡键（见 §5.4） |
| **魔虚罗悬空（常态）** | HUD 状态行「悬空 —— 近战够不到，锁定后用术式」 | **先按 Q 锁定**，再 **I 赫 / O 茈（蓄满）/ L 200%茈 / U 苍** | 近战在空中 0 命中（数学上够不到，见 §2.4）；只有锁定后弹道才会被掰上去（`src/mahoraga.js:2011`） |
| **魔虚罗落地（弱点 1.6s）** | 横幅「弱点暴露 —— 近战可击」+ HUD 倒计时 | **J / K 贴身连打**（近战伤害 ×1.5） | 只有这 1.6s（以及升空前 0.35s）近战能打到它；落点就是它砸的位置，直接冲过去 |
| **魔虚罗升空（ascend 1.0s）** | 本体上升 + 红色地环 | 前 **0.35s** 仍可近战；之后停手改术式 | `src/mahoraga.js:1923` |
| **魔虚罗击破瞬间** | 白闪 + 横幅「魔虚罗 —— 击破！」 | 演出 1.8s 内**不能动**（`phaseLock`），结束立刻转打宿傩 | 击破后宿傩打你 ×1.15、你打他回到 ×1.0 |

### 3.2 打魔虚罗的效率路线（按源码数值推）

- **主力是茈与赫**，不是近战：
  - 赫（165）首击 115.5，第 2/3 击各 52.0，第 4 击起免疫 → **一个赫最多 219.5**；
  - 茈满蓄力（430）首击 301，第 2/3 击各 135.5 → **一个茈最多 571.9**；
  - 200% 茈（900）首击 630（再装填 26s）；
  - 900 血池 ⇒ **赫 ×3 + 茈 ×3 就能打完**（219.5 + 571.9 = 791.4，余 108.6 靠弱点窗口的近战补）。
- **不要用苍去蹭**：苍对魔虚罗伤害恒为 0，但会把「苍」的适应推到 2/4 并**点亮两格法轮**，
  直接把软狂暴（魔虚罗伤害 ×1.6）提前。
- **每个术式都有 4 次机会**，用满再换招：对同一个术式连打 4 次以上，第 4 次起是 0 伤害。
- **55% 的预判闪避**意味着术式会经常落空（`src/mahoraga.js:104`，实机 normal 档）；
  打完一发先看有没有「回避 / 预判闪避」字样，再决定要不要补。

---

## 4. 关键数值索引（速查）

| 数字 | 含义 | 出处 |
|---|---|---|
| 0.5 | 召唤魔虚罗的宿傩血量阈值 | `src/mahoraga.js:56,2100` |
| 2.8 / 1.8 | 召唤演出 / 击破演出时长（s，期间双方冻结） | `src/mahoraga.js:57,58,619,1380` |
| 900 | 魔虚罗血池 | `src/mahoraga.js:59` |
| 4.2 / 2.6 | 魔虚罗身高 / 肩宽（m） | `src/mahoraga.js:60,61` |
| 4.0 / 4.5 / 5.0 | AIR_Y（easy/normal/hard；实机 normal = 4.5） | `src/mahoraga.js:78` |
| 3.0 / 3.4 / 3.8 | AIR_Y_FALLBACK（camFrame 未接线时的兜底） | `src/mahoraga.js:85` |
| 18 | DESCEND_FROM，召唤时从天而降的起点（m） | `src/mahoraga.js:92` |
| 4 / 4.5 / 5 | ORBIT_LOCAL，绕宿傩的航线半径（m） | `src/mahoraga.js:91` |
| 8 / 10 / 12 | AIR_SPEED，水平机动上限（m/s） | `src/mahoraga.js:94` |
| 2.4 / 2.0 / 1.7 | HIT_R，命中球半径（m） | `src/mahoraga.js:100` |
| 0.35 | EVADE_LEAD，预判闪避时长（s） | `src/mahoraga.js:101` |
| 0.30 / 0.55 / 0.75 | EVADE_P，闪避概率（实机 normal = 0.55） | `src/mahoraga.js:104` |
| 26 / 55 / 0.12 | 闪避巡航速度 / 爆发速度 / 爆发时长（m/s, s） | `src/mahoraga.js:97,98,99` |
| 1.1 | DODGE_CD，闪避冷却（s） | `src/mahoraga.js:105` |
| 0.7 | DAMAGE_IN_SCALE，玩家→魔虚罗伤害系数 | `src/mahoraga.js:106,1339,1341` |
| 1.5 / 1.6 | WEAK_MELEE_MUL 弱点近战加成 / WEAK_T 弱点窗口（s） | `src/mahoraga.js:107,108` |
| 0.45 / 4 | ADAPT_MUL 第 2 次起倍率 / ADAPT_IMMUNE 免疫门槛 | `src/mahoraga.js:110,111` |
| 8 / 1.6 | WHEEL_MAX 法轮格数 / SOFT_RAGE 软狂暴倍率 | `src/mahoraga.js:112,113` |
| 0.6 / 1.25 / 1.15 | 庇护期玩家→宿傩 / 宿傩→玩家 / 击破后宿傩→玩家 | `src/mahoraga.js:115,114,116` |
| 2.6 / 4.0 | 魔虚罗技能冷却下限 / 上限（s） | `src/mahoraga.js:117,118,870-875` |
| 0.75 | CONTINUOUS_CD，持续场适应计数节流（s） | `src/mahoraga.js:120,1970` |
| 130 / 0.75 / 22 / 3.0 / 2.4 | 退魔斩：伤害 / 前摇 / 速度 / 半宽 / 存活 | `src/mahoraga.js:121` |
| 70 / 0.5 / 0.35 / 3 / 26 / 2.6 / 1.7 / 3.4 | 弹幕：单发伤害 / 前摇 / 间隔 / 发数 / 弹速 / 转向 / 命中R / 存活 | `src/mahoraga.js:122` |
| 150 / 0.9 / 3.4 | 落雷：伤害 / 前摇 / 半径 | `src/mahoraga.js:123` |
| 200 / 0.8 / 0.45 / 8 | 俯冲：伤害 / 前摇 / 位移时长 / 半径 | `src/mahoraga.js:124` |
| 58 / 96 / 190 / 520 / 20 | 宿傩 解 / 捌 / 开 / 空间斩 / 突进 的原始伤害 | `src/contract.js:69-74` |
| 8 / 14 / 30 / 40 / 10 | 宿傩 解 / 捌 / 开 / 空间斩 / 突进 的咒力消耗 | `src/contract.js:69-74` |
| 1.1 / 2.4 / 11 / 12 / 3 | 宿傩 解 / 捌 / 开 / 空间斩 / 突进 的 CD | `src/contract.js:69-74` |
| 8 / 1 / 62 / 90 | 伏魔御厨子：持续 / 斩击间隔 / 单次伤害 / 半径 | `src/combat.js:156,158,159,160` |
| 0.12 / 0.3 | 宿傩适应每层减伤 / 减伤下限 | `src/combat.js:162,164` |
| 0.22 / 0.26 / 1.0 / 0.55 | 实机 AI：反应 / 决策间隔 / 伤害倍率 / 格挡率 | `src/combat.js:167-173,2439` |
| 24 | 「玩家后摇」惩罚分 | `src/combat.js:2103` |
| 13 | 意图惯性加分 | `src/combat.js:2119` |
| 0.35~0.75 | 意图锁定时长（s） | `src/combat.js:2123` |

---

## 5. 源码里读到的冲突 / 未能确认的条目

> 这一节最需要 Lead 决策。以下每一条都**只依据源码**，不含推测性的数值。

### 5.1 「挡下」（BLOCK_P / BLOCK_TRANSFER）在当前源码里不可达 —— 死分支

`src/mahoraga.js:1922-1964` 的控制流是：

```
weak = (state === "down") || (state === "ascend" && t < 0.35)
if (!weak) { …提示…; return false; }        // 1933：悬空一律不吃近战判定
if (wouldHit) { …弱点命中…; return true; }   // 1935-1941
if (wouldHit && Math.random() < BLOCK_P) { …挡下… }  // 1951：此处 wouldHit 恒为 false
return false;                                // 1964
```

走到 1951 行时必然满足「`weak` 为真」且「`wouldHit` 为假」（否则 1941 行已经 return），
所以 `wouldHit && …` 永远不成立 → **「挡下」的演出、`stats.blocks` 计数、
`mahoraga_block` 事件、`BLOCK_TRANSFER` 转记伤害，在当前实现下永远不可能发生**。
参数本身在表里（`src/mahoraga.js:95,96`），注释（`1943-1950`）描述的是「悬浮态」，
与代码的 early-return 语义相反。

> 这与 `reviews/14-verification.md:29` 记录的「挡下 7/12 次」观测不一致
> （那次观测对应的实现版本或探针口径与当前 `src/mahoraga.js` 不同）。
> 本文按**当前源码**记录：不可达。**未确认**：哪一版才是想要的强度。

### 5.2 魔虚罗的三档难度表（easy/normal/hard）实际上永远取 normal

- `mahoDiff(cb)` 只认字符串：`MAHO_DIFFS.indexOf(cb.ai.difficulty)`（`src/mahoraga.js:133,138-141`）。
- `SukunaAI.setDifficulty` 把难度存成**数字**：`clamp6(Number(x) || 1, 0.4, 2.5)`
  （`src/combat.js:1970-1972`），`createCombat` 里是 `setDifficulty(1)`（`src/combat.js:2439`）。
- `1` 不是 `easy` / `normal` / `hard` 中任何一个 ⇒ `mahoDiff` **恒返回 `normal`**。

后果（全部是源码事实，不是推测）：`AIR_Y` 恒 4.5、`AIR_Y_FALLBACK` 恒 3.4、
`ORBIT_LOCAL` 恒 4.5、`AIR_SPEED` 恒 10、`HIT_R` 恒 2.0、`EVADE_P` 恒 0.55、`CD_DIFF` 恒 1.0。
**easy / hard 两列在本作里是死数据。** 要让难度真的影响魔虚罗，需要把 `cb.ai.difficulty`
改成字符串，或在 `mahoDiff` 里做「数字 → 档位」的映射。

### 5.3 契约文字与实现的两处漂移

| 项 | 契约/注释写的 | 源码实际 | 出处 |
|---|---|---|---|
| 魔虚罗悬浮高度 | 契约初版 14~17m，修订版 5.2/5.8/6.4 | `AIR_Y = 4.0/4.5/5.0`（实机 normal 4.5） | `src/mahoraga.js:30,51,78` |
| 预判侧移概率 | 契约 0.30/0.55/0.75 | 表未改，但见 §5.2 恒 0.55 | `src/mahoraga.js:35,104` |

`reviews/14-verification.md:27` 已指出第 1 条需要 Lead 更新契约文本。

### 5.4 玩家没有「格挡」操作 —— 但弹幕的 HUD 提示写着「可格挡」

- `src/combat.js` 全文**没有任何一处给玩家写 `pl.guarding = true`**
  （唯一一处 `guarding = true` 在 `src/combat.js:2171`，那是宿傩 AI 的格挡）。
  `startInfinity()` 只做 `ctrl.setGuard(true)` 的**动画**（`src/combat.js:2490`），
  免伤走的是 `pl.invT`（`src/combat.js:1360-1368`）。
- 因此 `resolver.apply` 里 `guardable && victim.guarding`（`src/combat.js:1373`）对玩家永不成立。
- 咒力弹幕的预警文案是「咒力弹幕 — 可格挡」（`src/mahoraga.js:890`），
  但玩家实际能用的只有 **空格 / 无下限**。**未确认**：这句文案是笔误，还是本来打算做格挡键。

### 5.5 其它「源码未给出」的条目

- **宿傩的 AI 难度选择入口 / UI**：源码未给出（只有 `api.setDifficulty`，无 UI 调用）。
- **魔虚罗被击破后是否有额外奖励或剧情**：源码未给出（只有 `trueSukuna` 的伤害倍率与灵光）。
- **法轮 8 格全亮后除了 SOFT_RAGE ×1.6 还有没有别的机制**：源码未给出
  （`mahoAdaptStep` 里只有 banner + callout + 地环 + 音效，`src/mahoraga.js:1318-1327`）。
- **实测 TTK / 期望伤害**：源码未给出。§3.2 的「赫×3 + 茈×3」是按公式直接推的，
  **没有**计入 55% 闪避与免疫的期望值。
- **`LIGHTNING.lockT: 0.0`**（`src/mahoraga.js:123`）：全文没有任何地方读它 → 目前是**未使用字段**。
- **`MAHO.orbitW = 0.34`**（`src/mahoraga.js:508`）：`mahoPredict` 用它做提前量外推
  （`src/mahoraga.js:2050`），但 `mahoUpdateAir` 用的是写死的 0.34
  （`src/mahoraga.js:777`，软狂暴时实际是 0.46）→ 两者**可能不同步**，源码未给出统一口径。

---

## 6. 一句话总结

- **宿傩**：6 招（解 / 捌 / 开 / 伏魔御厨子 / 空间斩 / 突进），三段血量阶段（0.66 / 0.33），
  phase 3 起自带「按招递减 12%/次、下限 30%」的适应与法轮，出伤统一 ×1.6×0.1；
  半血（50%）触发魔虚罗。
- **魔虚罗**：900 血、悬空 4.5m（近战数学上够不到）、四个带清晰前摇的术式、
  「同招 2 次 ×0.45、4 次免疫、法轮 8 格全亮软狂暴 ×1.6」的适应，
  俯冲落地贡献 1.6s 弱点窗口（近战 ×1.5）；玩家一侧的伤害统一乘 `DAMAGE_IN_SCALE = 0.7`。
- **玩家**：Q 锁定 → I/O/L 术式对空；看到红圈走位或空格；落地 1.6s 贴身 J/K；
  领域对拼时**只在亮窗内按一次 J**。
