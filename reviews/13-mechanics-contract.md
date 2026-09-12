# 13 · 机制扩展契约（冻结版）

> Lead 写定。四个机制模块各自独立成文件，通过下面的**钩子总线**接入 combat，
> **禁止**修改别人的写域文件。契约一旦冻结，改动必须由 Lead 统一执行。

---

## 0. 本轮用户需求（原话拆解）

| # | 需求 | 交付物 |
|---|------|--------|
| A | 宿傩半血后出现**魔虚罗建模**；宿傩伤害变高、对玩家伤害免疫更多；魔虚罗放技能攻击玩家；魔虚罗在半空，玩家能打到但极难 | `src/mahoraga.js` |
| B | **领域对决太简单**，需要更准的操作来「对齐」，否则失败 | `src/domainduel.js` |
| C | **黑闪触发太简单**，按原作「打击与咒力误差 < 0.000001 秒」重做触发难度 | `src/blackflash.js` |
| D | **疾跑没有疾跑的感觉** | `src/fighters.js` / `camera.js` / `audio.js` / `mobile.js` |

不变量：数值设计（`INCOMING_SCALE` 等）用户明确要求不要动。

---

## 1. 架构：钩子总线

所有机制模块与 `combat.js` 的唯一接口是 `src/contract.js` 里的 `HOOKS`。
`contract.js` 在 manifest 里排第一，所有模块共享同一个 IIFE 作用域，`var` 互相可见。

```js
var HOOKS = {
  combatInit: [], // (cb)                      战斗对象构建完成
  reset:      [], // (cb)                      每局重开
  tick:       [], // (cb, dt, t)               每帧（战斗逻辑之后、快照之前）
  hud:        [], // (dt, snap)                每帧 HUD（hud.js 驱动）
  segment:    [], // (cb,p0,p1,r,meta)->bool   命中扫掠检测；return true = 这次攻击被本模块吃掉
  aim:        [], // (cb,owner,from,dir,skill)->Vector3|null  改写弹道方向（对空）
  damageGate: [], // (cb,h,dmg)->number        伤害乘区（数值链，必须返回数字）
  onHitDone:  [], // (cb,h,dmg,info)           伤害结算完成
  beforeCast: [], // (cb,c,skill)->false|void  出招前拦截
  blackFlash: [], // (cb,h,dmg)->number|bool|undefined  只取第一个注册者
                  //   返回数字 = 本次命中的伤害倍率（原作 2.5）
                  //   返回 true = 用 2.5 倍；返回 false = 不算黑闪
                  //   返回 undefined = 模块缺席，走旧逻辑（0.28s 窗口 + 终结技）
  clash:      [], // (combat2)->clash 实例     只取第一个注册者（替换默认 DomainClash）
  move:       [], // (cb,c,wish,dt,inp,cur)->number        移动速度乘区（数值链，返回倍数）
  locomotion: []  // (cb,c,info)->bool         接管移动动画状态机；return true = 已处理
};
function onHook(name, fn) { ... }
function runHook(name, ...args) { ... }   // 逐个调用；segment 用返回值判断「是否被吃掉」
function firstHook(name, ...args) { ... } // 只调第一个
```

### 1.1 combat.js 里已装好的钩子位置（Lead 负责，队友只读）

| 位置 | 钩子 | 说明 |
|------|------|------|
| `createCombat()` 末尾 | `combatInit` | 拿到 `cb` |
| `HitResolver.apply(h)` 伤害计算后 | `damageGate` | 依次乘，返回数字 |
| `HitResolver.apply(h)` 黑闪判定处 | `blackFlash` | 返回 true = 本次命中算黑闪 |
| `HitResolver.apply(h)` 结算完 | `onHitDone` | |
| `tryMelee / 苍 / 赫 / 茈 / 开` 命中检测处 | `segment` | 每个弹道/近战的扫掠段都会问一次 |
| `spawnBlueField/spawnRedField/spawnFurnaceField/firePurple` | `aim` | 允许把弹道掰向空中 |
| `updatePlayer` 移动速度 | `move` | `speedMul` |
| `Combatant.syncState` | `locomotion` | 移动动画状态机 |
| `SkillRunner.start` | `beforeCast` | 返回 false 可拒绝出招 |
| `update2` 每帧 | `tick` | |
| `api.reset()` | `reset` | |
| `hud.js` 每帧 | `hud` | |
| `DomainRunner` 构造 | `clash` | |

### 1.2 combat 提供的公共设施（队友直接用，不要改）

```js
cb.frame            // 整数帧计数，每次 update2 +1（含 hitstop 的 dt=0 帧）
cb.pressFrame       // {light:-99, heavy:-99, ...} 最近一次「按下边沿」的帧号
cb.edges            // 本帧按键边沿 {light,heavy,blue,...}
cb.phaseLock        // >0 时玩家与 AI 都被冻住（召唤演出用）
cb.fighters[SIDE.GOJO] / [SIDE.SUKUNA]   // Combatant：hp/hpMax/ce/p/vel/action/stunT/invT/guarding
cb.resolver.apply({from,to,skill,dmg,dir,kb,kind,unblockable,hitstop})  // 唯一伤害入口
cb.fx.screen/hitSpark/shockwave/callout/lightning/groundRing/debris/aura/sphere/damageNumber
cb.audio.play(id,{volume,rate}) / cb.audio.loop(id) / cb.audio.stop(id)
cb.pushEvent({type:...})   // 统计/演出事件流
cb.banner(text, dur)
cb.mode / cb.resultLocked / cb.onDeath(c) / cb.setResult("victory"|"defeat")
SKILL / SKILL_DATA / SIDE / C / TUNE
cam / godCam / scene          // 同作用域可见
__SS / window.__INJECT.press(code) / release(code)  // 按键注入（触屏自建按钮、探针）
__SS.mech()                   // 四个机制的自报状态快照（见 §1.3）
```

**cb 上你可读写的字段**

| 字段 | 读/写 | 说明 |
|------|-------|------|
| `cb.frame` | 只读 | 帧计数（含顿帧） |
| `cb.pressFrame` | 只读 | `{light,heavy,...,v,mouse}` 最近按下帧号 |
| `cb.edges` | 只读 | 本帧按键边沿 |
| `cb.phaseLock` | **可写** | >0 时冻结双方输入与 AI，世界照常跑（阶段演出用） |

### 1.3 模块必须自报状态（独立验证的硬要求）

每个机制模块**必须**在自己文件里注册一份调试快照，探针只用它、不读实现代码：

```js
MECH_DEBUG.mahoraga   = () => ({ hp, hpMax, alive, adapt, mode, skill, cd });
MECH_DEBUG.duel       = () => ({ needle, lo, hi, sync, miss, tug, round, debounce, active });
MECH_DEBUG.blackFlash = () => ({ F, P, delta, ok, ce, chaos, streak, mul, hits, fails });
MECH_DEBUG.sprint     = () => ({ speed, target, phase, fov, accelPhase, dust });
```
探针里 `__SS.mech()` 一次拿到全部。字段名照抄，不要改。

---

## 2. 写域（硬边界）

| 文件 | 所有者 | 备注 |
|------|--------|------|
| `src/contract.js` `src/combat.js` `src/hud.js` `src/main.js` `src/manifest.json` `_tools/cdp.mjs` | **Lead** | 别人只读 |
| `src/mahoraga.js` `_tools/probe-mahoraga.mjs` | 队友 mahoraga | |
| `src/domainduel.js` `_tools/probe-duel.mjs` | 队友 domainduel | |
| `src/blackflash.js` `_tools/probe-bf.mjs` | 队友 blackflash | |
| `src/fighters.js` `src/camera.js` `src/audio.js` `src/mobile.js` `_tools/probe-sprint.mjs` | 队友 sprint | |
| `_tools/verify-*.mjs` `reviews/*` | 队友 verifier | |
| `src/body.html` | **没人动** | 7.4MB，动了必炸 |

Lead 已预置 3 个占位模块文件并写进 manifest，任何时刻构建都能过。
**钩子层已落地并跑通 smoke + acceptance**（combat.js 的挂点全部装好；模块缺席时行为与改前一致）。

---

## 3. 构建 / 自测（每个队友都必须跑）

```bash
# 私有构建：绝不碰共享 dist/，不会和别人的构建打架
node build/build.mjs --out tmp/<你的名字>/dist.html --site-out tmp/<你的名字>/site
# 冒烟（必须 ok:true errors:[]）
node _tools/smoke.mjs --file tmp/<你的名字>/dist.html --port 95xx
# 你自己的探针
node _tools/probe-xxx.mjs
```
- 端口各自错开：mahoraga 9501 / domainduel 9502 / blackflash 9503 / sprint 9504 / verifier 9510+。
- **不要**跑 `node build/build.mjs`（会覆盖共享 `dist/`）。Lead 用 `_tools/build-locked.mjs`。
- **不要** git commit / push。Lead 统一提交。
- 代码注释用中文，文件头写大注释说明模块职责。

---

## 4. A · 魔虚罗 + 二阶段宿傩（`src/mahoraga.js`）

顶层导出：
```js
var MahoragaPhase = {
  summon(cb), isAlive(), hp, hpMax, adapt, mode,
  update(cb, dt, t), reset(cb),
  hitTest(cb, p0, p1, radius, meta) -> bool,   // HOOKS.segment 用
  damageGate(cb, h, dmg) -> number,            // HOOKS.damageGate 用
  bar() -> { hp, hpMax, adapt, mode } | null,  // HUD
  debug() -> {...}                             // __SS 探针
};
```

**触发**：**由你的模块自己在 `HOOKS.tick` 里判断**（combat.js 不认识魔虚罗）：宿傩 HP ≤ 50% 且未触发过
→ 自己写 `cb.phaseLock = 2.8`，并在 `phaseLock` 回到 0 时把魔虚罗放出来。召唤演出：「布瑠部由良由良」、
金色法阵 groundRing、天空压暗（`fx.screen({desaturate,vignette,blur})`）、
法轮从宿傩头顶升起 → 魔虚罗从法阵中出现。演出结束 `phaseLock = 0`。

**模型（程序化建模，用户直接点名的交付物，必须好看）**
- 尺寸 3.8~4.2m 高、肩宽 2.6m；深色躯体（`C.INK` 系）+ `C.CONCRETE2` 骨白护甲片。
- 必备部件：躯干/头/暗红发光双眼/双臂（前臂粗大）/双腿/背后**退魔之剑**/头顶**八握剑异戒神将法轮**（8 格+外环+内环）。
- 姿态动画：`hover`（悬浮呼吸+法轮旋转）/`windup`/`slash`/`slam`（下砸）/`damage`/`summon`。
- draw call ≤ 70；`"low"` 画质隐藏小部件。
- 材质用 MeshBasic/Lambert 级别，别引入高开销 PBR。

**在空中**
- 基准高度 y ≈ 14~17，绕玩家漂移/环绕，水平速度 8~12 m/s（难度越高越快）。
- 除「俯冲」外不落地 → 近战（射程 4~5.2m）够不到。

**玩家能打到，但极难**
- 命中体积：球心在胸口，半径 2.0m（难度 2.4/2.0/1.7）。
- 只有 `苍/赫/茈/200%茈` 能打到它：靠 `HOOKS.aim` 把弹道掰向它 —— 且**只有在玩家锁定（`cam.lockOn`）时才掰**，否则弹道照旧打宿傩。
- 0.35s 预判闪避：`segment` 被调用时若弹道朝向自己，按难度概率侧移（easy 30% / normal 55% / hard 75%）。
- **适应**：按招式分别计数，同一招命中 2 次 → 该招伤害 ×0.45；4 次 → 免疫（0 伤害）+「适应」字样 + 法轮点亮一格。
  法轮 8 格全亮 → 「适应完成」，魔虚罗伤害 ×1.6（软狂暴）。
- 命中反馈：金色火花、法轮震动、血条掉血、`banner`/`callout`。

**技能（至少 4 个，每个都有清晰前摇 + 可躲窗口）**
1. `退魔斩`：贴地斩击波朝玩家飞（宽 6m、速 22m/s），命中 130 + 击退。
2. `落雷`：玩家脚下 0.9s 红圈预警 → 落雷，命中 150。走位可躲。
3. `俯冲下砸`：0.8s 预备（本体下压发光）→ 冲到玩家位置砸地（半径 8m，200 + 击退 + 冲击波）；
   **落地后停留 1.6s（弱点暴露，横幅提示，此时近战能打到）**，然后升空。
4. `咒力弹幕`：3 连发追踪弹（每发 70，可格挡），间隔 0.35s。
- 冷却 2.6~4.0s，宿傩 HP 越低越短；同一时刻只允许一个技能。
- 所有伤害走 `cb.resolver.apply({from: cb.fighters[SIDE.SUKUNA], to: 玩家, skill: SKILL.MAHORAGA, ...})`，
  这样**无下限（invT）闪避、格挡、受击反馈全部沿用既有系统**。

**二阶段宿傩（用户原话：伤害变高、对玩家的伤害免疫更多）**
- `damageGate`：魔虚罗存活时，玩家打宿傩 ×**0.6**；宿傩打玩家 ×**1.25**（`h.from.side === SIDE.SUKUNA` 时）。
- 魔虚罗被击破 → 解除庇护，宿傩进「真·宿傩」状态（banner + 视觉），伤害 ×1.15 保留。
- 魔虚罗 HP 900；击破时播放破碎演出。

**HUD（模块自建 DOM，不要改 hud.js）**：顶部第二条血条 + 「魔虚罗 · 八握剑异戒神将」+ 适应 `n/8` + 技能预警。

**验收（自己跑通并给出数字）**
- `__SS.mahoraga.debug()` 读得到 hp/hpMax/alive/adapt/mode。
- 宿傩到 50% 必触发；不重复触发。
- 4 个技能各至少实测一次命中玩家、且能被闪避一次。
- 对空命中：锁定状态下 `苍/赫/茈` 至少各命中过一次；不锁定时打不到。
- 近战在悬浮时打不到、在俯冲落地 1.6s 内能打到。

---

## 5. B · 领域对决（`src/domainduel.js`）

```js
var createDomainDuel = function(combat2) { return clashLike; };
onHook("clash", createDomainDuel);
```
`clashLike` 必须实现默认 `DomainClash` 的**全部接口**：
`active / tug / winner / elapsed / begin() / push(amount,label) / update(dt,edges) / resolve(winner,byTime) / reset()`。

**新机制「术式同步」**
- 同步轴：`needle` 在 [-1,1] 往返扫动，速度随回合加快（周期 1.6s → 0.85s）。
- 窗口：位置每回合随机、宽度随回合收窄（0.30 → 0.12）；**窗口只在指针经过后才重新随机**（禁止背板）。
- 指针在窗口内时按下 `edges.light || edges.heavy || edges.mouse` → **同步成功**：`tug += 0.17`，`sync++`，回合推进（更快更窄）。
- 窗口外按键 → **失败**：`tug -= 0.12`，`miss++`，连击清零，进入 0.25s debounce（防乱按误判）。
- 指针扫过窗口但没按（错过）→ 同样 `miss++`、`tug -= 0.08`。
- `miss >= 3` → 领域崩坏 → `resolve(SIDE.SUKUNA)`（玩家输，吃 CLASH_WIN_DMG + 熔断）。
- `sync >= 5` → `resolve(SIDE.GOJO)`。
- 必须注册 `MECH_DEBUG.duel`（§1.3）。
- AI 持续推 tug（保留 `TUNE.CLASH_AI_PUSH`）；玩家原地不动 12s 内必输。
- 12s 超时：`|tug| >= 0.35` 判胜负，否则双崩（比旧版 0.15 更严）。

**演出**：成功=青色冲击+指针定格；失败=猩红裂纹+屏幕红闪；领域球裂纹随 miss 累积。
**HUD（模块自建 DOM）**：屏幕中下一条同步轴 —— 指针、窗口高亮、「同步 ×N」「裂纹 N/3」。
原有 `weapons.domainClash({ tug: () => clash.tug })` 视觉保留。

**验收（给数字）**
- 无脑连点（每帧按 light）：30 次试验 30 次失败。
- 精确对齐（探针按 needle 位置按）：30 次试验 ≥ 28 次胜利。
- 站着不动：12s 后判负。
- 玩家输：扣血 + `burnoutT > 0`。

---

## 6. C · 黑闪（`src/blackflash.js`）

```js
var BlackFlash = { judge(cb, h, dmg) -> number|bool|undefined, reset(cb) };
onHook("blackFlash", (cb,h,dmg) => BlackFlash.judge(cb,h,dmg));
// 返回 2.5 → combat.js 把本次伤害乘 2.5（推荐写法：倍率你定，伤害它结算）
// 返回 false / 0 → 本次不算黑闪
// 返回 undefined → 交回旧逻辑（只在你自己判断"不该接管"时用）
```
必须注册 `MECH_DEBUG.blackFlash`（§1.3）。

**原作条件 → 游戏映射**（把这段话写进代码大注释）
> 「黑闪」= 物理打击与咒力冲击之间的时间差被压缩到 **0.000001 秒**以内产生的空间扭曲。
> 它不是能靠意志控制的技巧 —— 连最强术师也无法随意打出；威力是普通打击的 **2.5 倍**，
> 打出之后术师的咒力操作会变好（连闪更容易）。

- **同步键 = `V`**（新增）。触屏模块自建「咒」按钮，调用 `window.__INJECT.press("KeyV")`。
- **判定**：命中帧 `F = cb.frame`，按下 V 的帧 `P = cb.pressFrame.v`；`|F - P| <= 1` 才算同步（1 帧 ≈ 16.7ms，对应原作 1e-6 秒的极微误差）。
- **硬性前提**：`ce >= 8`（命中时扣 8）；不在紊乱期；不在 `BLACK_FLASH_CD`（3.2s）内；`h.kind === "melee"`。
- **反乱按（关键）**：V 的按下边沿**不在**任何命中帧的 ±1 帧内 → 进入 **0.6s 咒力紊乱**，紊乱期间 V 一律无效，并额外扣 5 CE。→ 连点 V = 永远出不了黑闪。
- **失败反馈**：命中帧没同步成功 → 灰色闪点 + 细字提示，不打断操作。
- **可读性（必须做）**：每次挥击在拳/脚上生成一个**收缩环**，正好在命中帧收缩到 0；命中帧（无论成败）都有 1 帧闪点。
- **成功**：`dmg *= 2.5`（取代旧的「+210*INCOMING_SCALE」）；连闪 n 次 → 倍率 `min(3.5, 2.5+0.25*(n-1))`，窗口放宽到 2 帧（上限 2）；
  打出后 6s 内「咒力掌握变好」窗口 +1 帧。沿用既有黑闪 FX/音效/`stats.blackFlash`。
- 触屏（`html.is-touch`）窗口放宽 1 帧（±2）。

**验收（必须给数字）**
- 随机时刻按 V 500 次 → 黑闪 **0** 次。
- 每帧都按 V（连点）→ 黑闪 **0** 次。
- 精确在命中帧按 V → 成功；±1 帧成功；±3 帧失败。
- 一次黑闪伤害 ≥ 同招普通命中的 2.4 倍。

---

## 7. D · 疾跑（`src/fighters.js` + `camera.js` + `audio.js` + `mobile.js`）

目标：**跑起来要有跑起来的感觉** —— 现在只是把速度 4.8 换成 8.8，没有起步、没有姿态、没有镜头、没有风。

- **起步加速**：按住 Shift 后 0.35s 内由 4.8 升到 10.5（ease-out）；松开 0.25s 回落（惯性，不瞬间归零）。
  用 `HOOKS.move` 返回 `{speedMul}`，状态存在 `ctrl` 上。
- **动画**：`syncState` 的 phase 现在只有 idle/move；要能区分 `walk`/`run`/`sprint`，跑动姿态前倾、摆臂大、步频快（`HOOKS.locomotion`）。
- **镜头**：FOV 随速度 60 → 68；相机稍后拉；高速时 `render.impulse({radialBlur})`。
- **音效**：风噪循环 + 脚步节奏随速度变调（`audio.js` 加 `run_wind`）。
- **粒子**：脚下扬尘（复用 `fx` 既有原语）。
- **触屏**：摇杆推到底（`|摇杆| > 0.92`）即疾跑；`__TOUCH` 补 `run` 标志。
- `HOOKS.move` 是**数值链**：`(cb,c,wish,dt,inp,cur)->number`，返回速度倍率（cur 默认 1）。
  只有玩家真的在动（`mag > 0.08`）时才会被调用，所以减速惯性要靠你自己的 `HOOKS.tick` 衰减。
- 必须注册 `MECH_DEBUG.sprint`（§1.3）。
- **验收（给数字）**：1s 位移曲线（起步 0.35s）；FOV 变化 ≥ 6°；phase 读到 sprint；扬尘 > 0；手机摇杆到底触发疾跑。

---

## 8. 报告格式（收尾必须交）

```
## <模块名>
- 改动文件：
- 构建/冒烟：命令 + 结果
- 探针：命令 + 关键数字（贴原始输出片段）
- 已知问题 / 没做完的：
- 需要 Lead 做的事：
```
