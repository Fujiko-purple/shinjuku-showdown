# C. 类魂战斗核心设计考据（《新宿对决》重做参考）

> **本文用途**：为「战斗核心重做」提供可落地的数值与规则，不是机制清单。
> **纪律**：每条建议后标注 **【来源 URL】** 或 **【设计推断】**；【设计推断】= 由已验证数据 + 本作实测推导，没有外部出处。
> **本作现状数据**全部来自仓库实测代码：`src/combat.js`（TUNE 表）、`src/contract.js`（SKILL_DATA）、`reviews/12-lead-audit.md`。

---

## 0. 结论先行

用户和朋友的判断是对的，而且可以用代码里的数字复述：

| 现象（朋友的原话） | 代码里的证据 | 病灶 |
|---|---|---|
| 「没有建立在操作有收益的基础上」 | 玩家**只有 1 个防御动词**：无下限闪避（`INFINITY_TIME: 0.4` 无敌 + `INFINITY_CD: 0.85` 冷却）。全仓库 `guarding = true` 只出现在宿傩 AI（`combat.js:2228`），玩家**没有格挡、没有招架** | 攻防循环只有「打 / 不打」，没有「读招 → 选解法 → 拿收益」 |
| 「上强度 ≠ 加机制」 | 全局 `INCOMING_SCALE: 0.1` + `BOSS_DMG_SCALE: 1.6`：宿傩大招【空间斩】520 原始值 → 实伤约 83，仅占玩家 1500 血的 **5.5%**；玩家一次轻击约 3.5（≈ 敌方 1800 血的 **0.2%**），审计实测 14 次命中合计 79 伤害 | **每次交互都没有重量**，长局 = 磨血，机制再多也救不回来 |
| 「跑图反而死得更快，这不合理」 | 玩家移速 4.8 / 冲刺 8.8（`DASH_SPEED`）；宿傩跑 6.6、突进 15（`SUKUNA_RUN`/`SUKUNA_RUSH`）。宿傩【解】射程 90、【开】95、【空间斩】9999 且 `unblockable: true` | **逃不掉、也躲不开**：拉开距离只减少自己的输出，不减少对方的输出 |
| 「冲刺是鸡肋键」 | 冲刺无消耗、无无敌帧、无任何收益，只是「走得快一点」；而远程招有 CD 和咒力成本 | 位移没有**用途**（没有位置收益、没有资源收益） |
| 「无下限闪避有后摇卡自己」 | 无下限总空窗 = 0.4 + 0.85 = **1.25s**；宿傩重击硬直 `HITSTUN_HEAVY: 0.46`，两段连击即可锁死 | 唯一防御手段的冷却比 BOSS 连段间隔还长 |
| 「机制堆砌」 | 四个并行机制（魔虚罗 / 领域对决 / 黑闪 / 疾跑）通过 HOOKS 总线插入，各自独立；领域对决锁住双方操作最长 `CLASH_LIFE: 12` 秒 | 机制不服务核心循环，而是**打断**核心循环 |

**方向**：把「加机制」换成「**加要求 + 加收益**」——同样一个按键，让它有风险、有窗口、有回报，而不是再加一个新按键。

---

## 1. 见招拆招的四要素

一个「见招拆招」的战斗循环只有四件事，缺一件就退化成互相按技能：

```
BOSS 起手（预警 tell）
   → 玩家在有限时间内做选择（时机窗口 window）
        → 选择被系统区分为不同结果（选项 options）
             → 正确选择换到资源/伤害/位置（收益 reward）
   → 回到第一步，且节奏由双方共同控制
```

### 1.1 预警（tell）

**原理**：视觉刺激的简单反应时间平均约 **190 ms**，简单反应时整体在 **200 ms 量级**；而且预警提前量小于 **300 ms** 时，反应反而会变慢（刺激还没处理完就到了）——所以「有预警」还不够，**预警必须留出 0.3s 以上的余量**。
【来源 https://en.wikipedia.org/wiki/Reaction_time ："Human response times on simple reaction time tasks are usually on the order of 200 ms." / "approximately 190 milliseconds to detect visual stimulus" / "foreperiods of less than 300 ms may produce delayed RTs"】

**建议区间（设计推断，下限由上面的反应时间推出，上限参考本作已有的【空间斩】1.1s 预警）**：

| 招式类型 | 起手（windup / tell） | 说明 |
|---|---|---|
| 快速骚扰招（可格挡） | **0.35 ~ 0.55s** | 不需要玩家做多选决策，只要求「按住格挡」 |
| 普通攻击（需选解法） | **0.55 ~ 0.85s** | 玩家要判断「挡 / 闪 / 招架」 |
| 大招 / 不可格挡招 | **0.90 ~ 1.60s** | 必须伴随专属表现（颜色 / 音效 / 剪影） |
| 处决级 / 全屏招 | **1.60 ~ 2.50s** | 允许玩家做出「离开区域」这种长决策 |

**预警必须「有分类」，不是「有提示」**：只狼的危（Perilous）攻击用红色汉字统一提示，但**四种类型对应四种完全不同的解法**——突刺用识破、横扫必须跳、抓取要垫步、雷电要雷反；横扫「不能被格挡也不能被弹开」。
【来源 https://sekiroshadowsdietwice.wiki.fextralife.com/Combat ："Perilous Attacks are special abilities that cannot be guarded, and a red Kanji meaning 'Danger' flashes over Sekiro's head" / "Sweep Attack - Cannot be Guarded or Deflected."】

**颜色分级是行业标准做法**：战神（2018 / 诸神黄昏）用「红 = Unblockable（必须闪避）、黄 = Strong、双蓝环 = 必须盾击破防」三种标记，直接告诉玩家该用哪个防御动词。
【来源 https://www.ign.com/wikis/god-of-war-ragnarok/How_to_Parry ："enabling the chance to interrupt an enemy's next attack (including Strong yellow and Unblockable red attacks)"】

→ **规则化**：预警不是「要来了」，而是「**该怎么解**」。本作要把「不可格挡」的招做成颜色可区分的类别，而不是全部一样红。

### 1.2 时机窗口（window）

**已核实数值（务必带 fps 口径引用）**：

| 游戏 | 项目 | 数值 | 出处 |
|---|---|---|---|
| 只狼 | 弹反（Deflect）判定窗口 | **12 帧 = 0.2s**（连按会收缩到最少 **4 帧**；收缩惩罚在 **30 帧**后或一次成功弹反后清除） | https://sekiroshadowsdietwice.wiki.fextralife.com/Deflection |
| 只狼 | 识破（Mikiri）窗口 | **极大**，覆盖整个垫步动画、远超无敌帧 | https://sekiroshadowsdietwice.wiki.fextralife.com/Mikiri+Counter |
| 只狼 | 垫步无敌帧 | 前冲 **0.3s（18 帧@60）**、侧/后 **0.2s（12 帧@60）**、水中冲刺 **0 帧**；对横扫攻击侧/后垫步无效 | https://www.nexusmods.com/sekiro/mods/417 （mod 页转述的解包值，二手） |
| 艾尔登法环 | 翻滚无敌帧 + 后摇（fextralife 表口径 **30fps**） | 轻/中载 **13 帧无敌 + 8 帧后摇**（≈0.43s / 0.27s）；重载 **12 帧 + 16 帧后摇**；后跳 11 帧 | https://eldenring.wiki.fextralife.com/Dodging |
| 艾尔登法环 | **弹反判定帧（30fps）** | 小盾 **4 帧起手 + 5 帧判定**（=0.167s 有效窗口）；匕首 4+4；中盾/刺剑/曲剑/拳/爪 4+2；收招 13~19 帧 | https://eldenring.wiki.fextralife.com/Parry |
| 艾尔登法环 | 战技「快步」Quickstep | 延迟 0 帧、**15 帧无敌**、10 帧后摇 | https://eldenring.wiki.fextralife.com/Dodging |
| 艾尔登法环 | 跳跃 | 25 帧**部分**无敌（减伤，不是全免）+ 5 帧后摇 | 同上 |
| 黑暗之魂 1 | 翻滚无敌帧（30fps） | fandom 表：**全部翻滚 11 帧**、忍者翻（DWGR）13 帧；收招 轻 3 / 中 4 / 重 9 帧。**与社区帖「9/11/13 帧」冲突** | https://darksouls.fandom.com/wiki/Rolling ；冲突源 https://www.reddit.com/r/darksouls/comments/y8xe5i/iframes/ |
| 黑暗之魂 3 | 翻滚无敌帧（30fps） | 轻/中载 **13 帧**、重载 **12 帧** | https://darksouls3.wiki.fextralife.com/Equipment_Load |
| 血源 | 翻滚/垫步（解包，30fps） | 前冲 **11 帧无敌 + 18 帧翻滚硬直**；其他方向 11+20；翻滚 11+24 | https://www.bloodborne-wiki.com/2015/10/movement.html |
| Lies of P | 完美防御（Perfect Guard） | **0.155s（≈9.3 帧@60fps）**；PG 后的锁定 30 帧（0.5s） | https://www.nexusmods.com/liesofp/mods/161 （mod 页引用的数据定义，二手） |
| Lies of P | 完美防御效果 / 格挡 | PG：**零伤害、只吃耐力、破武器、可挡 Fury Attack、打出 Groggy**；格挡：减伤吃耐力，被减掉的伤害转为 **Guard Regain**，**攻击敌人可逐步回血、超时丢失** | https://liesofp.wiki.fextralife.com/Combat |
| 卧龙 | 化解（Deflect） | **16 帧**（mod 提升到 60 帧）；帧数受装备重量影响，与武器 Deflect Difficulty 无关 | https://www.nexusmods.com/wolongfallendynasty/mods/32 |
| 师父 Sifu | 招架（Parry） | **10 帧（@60fps ≈ 0.17s）** | https://www.nexusmods.com/sifu/mods/1280 |

> ⚠️ 口径警告：fextralife 的 ER 表头写明「All frame data below is for 30 FPS」。所以 13 帧 = 0.43s。社区另有一派按 60fps 读成 0.22s，**引用时必须写口径**，否则会被当成错数据（见 §7）。

**实测聚类（这四款游戏的招架窗口惊人地一致，可以直接当成行业标准）**：只狼 **0.20s**、Lies of P **0.155s**、Sifu **0.17s**、艾尔登法环小盾 **0.167s**（=5 帧@30fps）→ 落点 **0.15 ~ 0.20s**。
【来源见上表四行】

**建议区间（前两行由实测聚类得出，其余为设计推断）**：

| 防御动词 | 判定窗口 | 后摇 / 代价 | 类比来源 |
|---|---|---|---|
| 招架（精准） | **0.18s**（区间 0.15~0.20s） | 失败吃满伤害 + 0.3~0.4s 硬直 | 四作实测聚类【已核实】 |
| 闪避（无敌帧） | **0.25 ~ 0.30s** 无敌 | 0.25~0.35s 后摇，不能连续无脑滚 | 血源 11 帧=0.37s、只狼侧后 0.2s、ER 0.43s【已核实】 |
| 格挡（按住） | 常驻 | 持续掉资源；破防后 1.0~1.5s 大硬直 | Lies of P【已核实机制】 |
| 反制专用（识破类） | 0.4 ~ 0.7s（可以很宽） | 只在特定招上生效 | 只狼识破【已核实】 |
| BOSS 被惩罚窗口 | **0.6 ~ 1.2s**（大招后）/ 0.25~0.5s（普通招后） | 玩家要能塞进「起手 0.1~0.2s + 一段攻击」 | 【设计推断】 |

**关键关系式（本作最该先定的三条）**：
1. `BOSS 招式后摇 ≥ 玩家起手 + 玩家一段攻击 + 0.1s 缓冲`，否则玩家**永远**惩罚不到 BOSS → 变成「站着挨打」。
2. `玩家闪避空窗 ≤ BOSS 两次威胁动作的最小间隔`，否则出现「躲了第一下，第二下必吃」——本作现在是 1.25s 空窗 vs 宿傩连段间隔约 0.3~0.5s，**必然被锁死**。
3. `招架窗口 ≥ 0.15s`：低于这个值，在 60fps 下只有不到 10 帧，会被玩家判定为「随机」。

### 1.3 玩家选项（options）

选项要**互斥且有不同代价**，否则玩家只会用最强的那一个（本作现状：只有闪避，所以是「闪避键模拟器」）。

| 选项 | 什么时候用 | 代价 | 收益 |
|---|---|---|---|
| 闪避 / 位移 | 大范围、多段、来不及判断 | 位置变差（离 BOSS 更远 = 少输出）+ 后摇 | 无伤 + 站位重置 |
| 招架 | 单段、有明确节奏 | 窗口窄，失败吃满 | 直接反打 + 资源返还 |
| 格挡 | 来不及招架但能预判 | 掉资源、有破防风险 | 稳定减伤（本作 `GUARD_DR: 0.32` 即减 68%，但**玩家用不到**） |
| 走位 / 拉开 | 需要治疗、回复、观察 | 放弃输出；**必须真的安全**（本作不成立，见 §5.1） | 恢复节奏 |
| 专用反制 | 特定招（识破 / 雷反 / 破 Weapon） | 只对一类招有效 | 最高收益 |

**必须产出的工件：招式 × 解法矩阵**（每招明确「能被哪些选项解」）。只狼的矩阵是可读的：突刺→识破，横扫→跳，抓取→垫步，雷电→雷反【来源 https://sekiroshadowsdietwice.wiki.fextralife.com/Combat】；本作目前是「所有招 → 无下限闪避」，这就是「机制堆砌但鸡肋」的根因。

### 1.4 收益（reward）

**核心原则：玩家的每一次正确操作都必须能换算成资源、伤害或位置，三者至少一项。**

| 收益类型 | 成熟做法（原文） | 出处 |
|---|---|---|---|
| 敌方削韧（体干） | 「弹反对**防守方**只造成少量体干伤害，对**攻击方**造成大量体干伤害」；「成功弹反可以把你的体干条填满，但**永远不会破你的体干**」；而**长按格挡比弹反吃更多体干伤害**（官方手册原文） | https://sekiroshadowsdietwice.wiki.fextralife.com/Posture ；官方手册 https://www.fromsoftware.jp/manual/sekiroshadowsdietwice/stadia/mechanics.html |
| 削韧与血量联动 | 「敌人的 Vitality 与体干回复速度挂钩——Vitality 越低，体干回复越慢」→ 先打血、再破防，是**两层结构**而不是一条条 | https://www.fromsoftware.jp/manual/sekiroshadowsdietwice/stadia/mechanics.html |
| 压制原理 | 「攻击者在**出招期间不能回复自己的体干**」→ 连续进攻本身就是一种资源操作 | https://sekiroshadowsdietwice.wiki.fextralife.com/Posture |
| 破防 → 处决（**必须主动领取**） | Lies of P：敌人积累够 stagger 点后血条出现**白框数秒**，此时玩家必须用**蓄力攻击 / 虚构技 / 完美格挡**才能打出硬直；白框时长与硬直时长都是可升级参数 | https://lies-of-p.fandom.com/wiki/Stagger |
| 处决窗口的容错 | 只狼：「忍杀只能在有限窗口内执行，所以要快点打」；错过则敌人**只回复一小段体干**（不是归零）→ 避免「永远追不上」 | https://sekiroshadowsdietwice.wiki.fextralife.com/Posture |
| 反击回血 | 血源：「受伤后 **5 秒内**成功攻击敌人可回血」；「只能回收**最后一次**被命中的血量」；处决式攻击可以回满可回部分；重击比轻击回得多，**按 DPS 而非单击配平** | https://bloodborne.wiki.fextralife.com/Rally |
| 格挡回血 | 「被减免的伤害会转入 Guard Regain，玩家通过**攻击**回收一部分生命」；流失速度是 **P-Organ 升级项**（=可调参） | https://lies-of-p.fandom.com/wiki/Guard |
| 技能资源（风险循环） | Lies of P 虚构槽：「攻击敌人产生 Fable」；「**死亡时清空**，捡回 Death Ergo 才恢复」 | https://lies-of-p.fandom.com/wiki/Fable_Arts |
| 节奏回资源 | 仁王残心：只能回收「白条」覆盖的部分，**永远回不满** | https://nioh.wiki.fextralife.com/Ki_Pulse |
| 双向资源条 | 卧龙：攻击让气势**向右累积**，被打/格挡让它**向左（负）**；**化解成功同时涨自己、削对手**；气势攻击**清空自己整条槽**，但槽越高这一击越强；处决**无条件重置**气势槽 | https://game8.co/games/Wo-Long-Fallen-Dynasty/archives/406802 |
| 精准 vs 长按 | 师父：**格挡会让自己的结构条上涨，招架不会**（还能更多地削减对手结构） | https://sifu.fandom.com/wiki/Structure |
| 临时血包 + 输出窗口 | 战神怒气：靠造成/承受伤害积累；开启后**受到伤害扣的是怒气而不是血**；必须**充满才能释放** | https://godofwar.fandom.com/wiki/Spartan_Rage |
| 削韧配平表（可算几刀破防） | 艾尔登法环架势伤害有**固定值表**：技能「Square Off：重击 40 / 轻击 30」「Lion's Claw：30（巨锤 45）」「Carian Grandeur：20 / 30 / 45」；未发现你的敌人 +20% 架势伤害；双手持握轻击 +30%、重击 +10% | https://eldenring.wiki.fextralife.com/Stance |
| 位置收益 | 背后 / 侧向命中给额外伤害或直接破防 | 【设计推断：魂系背刺是标准答案】 |

**本作现状对照**：连击计数器（`cb.combo`，`COMBOTIMEOUT: 1.6`）在 ×3 时只弹一个横幅，**没有给任何伤害/资源加成** —— 这是典型的「有记录、无收益」的操作。

---

## 2. 为什么「加机制」会变成粪怪

### 2.1 公认的粪怪反模式（每条：真实案例 + 出处 + 本作映射）

> 来源等级：**媒体评测/官方 wiki** > **社区共识（Reddit/攻略站）** > 【设计推断】。凡标注「社区评价」的，属于玩家群体共识而非设计者自述。

| # | 反模式 | 真实案例与原文 | 出处 | 本作对应现象 |
|---|---|---|---|---|
| 1 | **不可躲 / 无解** | 混沌温床（Bed of Chaos）：手扫覆盖整个半场，碰撞「不可能避开」，还必须跳到细根上，「只能希望运气好」 | https://gamerant.com/dark-souls-bed-of-chaos-fromsoftware-worst-boss-jumping-mechanic-collision-arena/ | 【空间斩】射程 9999 + `unblockable` + 前摇霸体，唯一解是无下限；而无下限有 1.25s 空窗 → 第二发必吃 |
| 2 | **预警不可区分 / 反应不过来** | 玛莲妮亚·水鸟乱舞被直接评为「beyond unfair and is outright broken」，需要「pinpoint precision」的时机与距离 | https://gamerant.com/elden-ring-malenia-pinnacle-boss-design-representation-good-bad/ | 所有大招的预警表现同质（都是红），玩家无法在 0.3s 内判断该用哪种解法 |
| 3 | **构筑/数值 check 取代操作** | 玛莲妮亚的吸血让部分盾系 build「不是劣势，而是**打不过**」——「some shield builds are incapable of beating Malenia and not just disadvantaged」 | https://gamerant.com/elden-ring-malenia-pinnacle-boss-design-representation-good-bad/ | `INCOMING_SCALE: 0.1` 把 TTK 拉到 3 分钟，但玩家只有两个输出键 → 长局只能磨血 |
| 4 | **吸血流 / 惩罚与操作无关** | 玛莲妮亚「即使攻击被格挡也会回血」 | https://eldenring.wiki.fextralife.com/Malenia+Blade+of+Miquella | 无（本作没有），但**不要**用「BOSS 打你回血」来上强度 |
| 5 | **随机性主导** | 混沌温床的终局：玩家「要么背下少数几个稳定的翻滚位置，要么**指望跳跃机制运气好**」——同一个输入不保证同一个结果 | https://gamerant.com/dark-souls-bed-of-chaos-fromsoftware-worst-boss-jumping-mechanic-collision-arena/ ："players either have to learn one of the few consistent places to roll into the final phase or hope they get lucky" | `AI_GUARD: 0.3/0.55/0.8`（宿傩**按概率**决定格挡）、`decideT = decideInterval * rand(0.85,1.2)`、`Math.random() < guardChance*0.7` 决定闪避 —— 玩家学不到规律 |
| 6 | **杀不死 / 多段无解** | 神皮双人组：两个 BOSS「互相复活」，打完两条血「也不会结束战斗」 | https://eldenring.wiki.fextralife.com/Godskin_Duo | 魔虚罗 + 宿傩的双目标结构，如果两条线同时施压，就是 2v1 无节奏 |
| 7 | **强制小游戏 / 机制打断节奏（且与操作技巧无关）** | Alatreon 的「属性 DPS check」：必须在限定时间内打够属性伤害，否则大招「几乎必定猫车」——玩家被迫换武器/换 build，而不是打得更好；混沌温床则把胜负押在平台跳跃上 | https://monsterhunterworld.wiki.fextralife.com/Alatreon ："Unless you can beat him without mistakes, elemental damage is essential against Alatreon, as doing enough elemental damage will weaken his supernova, which will cart the hunter in almost every case if not weakened." ；https://gamerant.com/dark-souls-bed-of-chaos-fromsoftware-worst-boss-jumping-mechanic-collision-arena/ | 领域对决：`CLASH_LIFE: 12`，一旦触发就锁住双方移动与操作最长 12 秒，玩家在里面的操作是「连点」（`CLASH_PRESS_PUSH: 0.09`）——**与战斗技巧无关的强制小游戏** |
| 8 | **BOSS 逃跑 → 永远追不上** | 艾尔登之兽「跑掉」被大量吐槽（社区争议，见来源） | https://www.reddit.com/r/Eldenring/comments/wo1ejk/that_fact_that_people_shit_on_elden_beast_for/ | AI 有 `retreat` 行为，低血时评分 44（高于「进攻」的基础 34），且 BOSS 跑速 6.6 > 玩家 4.8 |
| 9 | **一撃必杀且无操作空间** | 「不可格挡 + 无预警 + 必杀」三者叠加时的合成反模式（#1 与 #2 的叠加态；单看每一招都不算粪，叠在一起就没有解法） | 【设计推断：由 #1#2 归纳】 | 现状相反（伤害过低），但**不要**用「提高 BOSS_DMG_SCALE」来解决难度——那会直接走到这一条 |
| 10 | **BOSS 被做成别的游戏的 BOSS** | 只狼的怨恨之鬼被社区视为「魂系 BOSS 混进弹反游戏」（攻略直言要用伞挡下大部分火焰与物理攻击） | https://sekiroshadowsdietwice.wiki.fextralife.com/Demon+of+Hatred | **本作最大风险**：不要把「机制」做成和核心循环无关的独立玩法 |

### 2.2 机制准入测试（新机制上线前必须 5 问全过）

1. 它是否**增加玩家已有按键的深度**（而不是新增按键）？
2. 它有没有**可读预警**、**明确窗口**、**明确收益**？
3. 玩家**操作失败**时，损失是否与失误程度成正比（而不是直接死/直接赢）？
4. 它是否**加快**核心循环（更频繁的读招-惩罚），而不是把玩家锁在某段演出里？
5. 移除它，游戏是否变差？若否，它就是粪怪预备役。
【设计推断，参考上述反模式归纳】

---

## 3. 玩家的操作收益模型（资源循环）

### 3.1 三种成熟循环的结构

| 循环 | 输入（涨资源） | 输出（花资源） | 负反馈 | 出处 |
|---|---|---|---|---|
| 只狼·体干 | 弹反（对敌方 +大量体干，对自己 +少量） | 体干满 → 忍杀 | 被弹/被破防 → 自己大硬直 | https://sekiroshadowsdietwice.wiki.fextralife.com/Posture |
| 血源·回响 | 受伤后 5s 内反击 | 回收血量 | 超时 → 血永久丢失 | https://bloodborne.wiki.fextralife.com/Rally |
| 卧龙·气势 | 化解成功 / 命中 | 武技、奇术、化解 | 被打 / 化解失败 → 掉气势；**气势见底什么都不能做** | https://wolong.wiki.fextralife.com/Combat |
| Lies of P·Guard Regain | 格挡后的减伤额度 | 攻击敌人回收 | 超时丢失 | https://liesofp.wiki.fextralife.com/Combat |

**共同点**：资源**只在交锋中产生**，且**有超时**。这两个属性正是「避免玩家跑到一边等 CD」的关键设计。

### 3.2 资源循环模板（建议本作直接采用）

单条「咒力」双向槽（不新增第二个条），事件表如下：

| 事件 | 咒力变化 | 附加效果 | 依据 |
|---|---|---|---|
| 轻击命中 | **+3** | — | 本作已有 `CE_ON_HIT: 1.5`，建议提到 3 |
| 重击命中 | **+5** | — | 【设计推断】 |
| **招架成功** | **+12** | 敌方削韧 +18；打开 **0.35~0.5s** 反击窗口；给玩家 0.2s 顿帧 | 只狼弹反【来源见 §1.4】 |
| **完美闪避**（无敌帧前半段穿过攻击） | **+6** | 0.2s 慢镜（可选） | 【设计推断】 |
| 格挡成功 | **-6** | 减伤部分转入「回气池」，3s 内攻击可回收 | Lies of P Guard Regain【来源】 |
| 受到伤害 | **-8**，且 5s 内反击可回收**最后一次**受伤的血量 | 血源 Rally | 同上 |
| **距 BOSS > 12m 且 3s 无交锋** | **-3/s**（反转自然回复） | 取代现在的 `CE_REGEN: 6` | **设计推断**：这是本作解决「跑图没收益」的核心 |
| 削韧打满 | 处决窗口 **1.0s**，伤害 = 最大生命 **8~12%**；窗口内必须由玩家主动触发（而非自动结算） | 只狼忍杀 / Lies of P 白框【来源】 |
| 连段 ×3 完成 | **+8** + 一段收招动作 | 让连击计数器真正有收益 | 本作现状：只弹横幅 |

> **反向设计（同样重要）**：资源见底时不能「什么都不做」（那是卧龙的设计，本作不需要这么硬），而是**防御选项变贵**：咒力 < 20 时闪避后摇 +0.1s、格挡减伤下降。

### 3.3 一次「正确交互」应得的重量（数值标定）

现状最大问题是**没重量**，因此给出标定区间（设计推断，按「一局 2.5~4 分钟、BOSS 血量 1800」反推）：

| 指标 | 本作现状 | 建议区间 | 理由 |
|---|---|---|---|
| 玩家一次轻击 | ≈0.2% BOSS 血量 | **1.0 ~ 1.5%** | 一套 3 连段 ≈ 3~5% |
| 玩家一次完整连段 / 招架反击 | — | **3 ~ 8%** | 玩家能在 12~30 次交互内打完 |
| BOSS 一次普通命中 | — | **10 ~ 18%** 玩家血量 | 玩家能承受 6~10 次失误 |
| BOSS 一次大招命中 | 5.5% | **25 ~ 40%** | 失误后**还能继续**，但压力明确 |
| 玩家被同一次连段打死 | 可能 | **禁止**（受击后 0.4s 脱离窗口） | 反 #9 |
| 一局内的「读招-惩罚」循环次数 | 数百次平A | **15 ~ 30 次** | 【设计推断】 |

> **不要把成长做成线性**：只狼的攻击力收益是**分段递减**的（2~14 点每点 +20 伤害，15~27 点每点约 +8，28~51 点约 +4，52~99 点约 +0.8），而且「攻击力对体干伤害与血量伤害**同比例**提升」。
> 【来源 https://sekiroshadowsdietwice.wiki.fextralife.com/Attack+Power ："Increasing attack power also increases the posture damage you do at an identical rate as vitality damage."】
> → 本作的技能升级/咒力成长应该走同样的分段曲线，否则「磨血」问题会在后期被放大。

---

## 4. BOSS 复读与 AI 设计

### 4.1 攻击欲望（aggression）的可量化旋钮

**先对齐业界对「攻击欲望」的定义**：商业项目里 aggression 不是一个「凶不凶」的滑块，而是**三个计时器旋钮**——冷却计时器、强度表（menace gauge）到达峰值所需时长、单位时间内允许的最大骚扰次数；难度提升改的是**这些参数**而不是伤害。
【来源 https://www.aiandgames.com/p/revisiting-alien-isolation ："This includes cooldown timers that prevent the alien from coming back for a certain amount of time, the time it takes for the menace gauge to peak before it tells the alien to leave and the overall number of times the alien can menace you before it returns to backstage mode." / "as the difficulty increases the xenomorph spends even less time in backstage mode, the menace gauge durations are increased and the patrol region relative to the player decreased."】

**压力预算（按「每 N 秒最多 M 次威胁」写死，这是最能直接抄的一条）**：求生之路的导演系统在普通战役里是「**每 45 秒 4 个特殊怪**」，困难则是「**每 15 秒 8 个**」，且强度表由玩家行为（击杀、受伤）推动而不是纯计时。
【来源 https://steamcommunity.com/workshop/filedetails/discussion/3145769266/4143942360094410180/ ："the director spawns 4 specials every 45 seconds in normal campaigns instead of the Hard 8 : 8 specials per 15 seconds." / "you get approximately 30 seconds before the director shifts into the next stage"】

| 参数 | 本作现状 | 建议区间 | 依据 |
|---|---|---|---|
| **压力预算**（每 N 秒最多 M 次高威胁动作） | 无（由效用评分自然涌现） | P1 **每 20s ≤3 次** / P2 **每 20s ≤5 次** / P3 **每 20s ≤7 次** | L4D 导演模型【来源见上】+ 按本作 3 分钟一局折算【设计推断】 |
| 威胁动作最小间隔（相邻两次必须应对的攻击） | 由 `AI_DECIDE` 0.42/0.26/0.17s + 行为持续 `rand(0.35,0.75)` 间接决定 | P1 **2.2~3.2s** / P2 **1.7~2.6s** / P3 **1.3~2.0s** | 【设计推断】 |
| 招式后 BOSS 后摇（recover） | 【空间斩】0.55s | 大招 **0.9~1.4s** / 普通 **0.3~0.5s** | 【设计推断；阈值见 §1.2 关系式 1】 |
| 玩家可惩罚窗口 | — | **0.6~1.2s**（大招后） | 同上 |
| BOSS 反应延迟 | `AI_REACT` 0.35/0.22/0.12 | **0.25~0.35s**（normal），最低不低于 0.2s | 人类视觉 RT ≈190ms https://en.wikipedia.org/wiki/Reaction_time |
| 决策间隔 | `AI_DECIDE` 0.42/0.26/0.17 | **0.30~0.45s**，且**攻击的发起不由决策间隔决定**，只由「后摇结束 + 招式冷却」决定 | 【设计推断】 |
| 霸体（hyper armor）招占比 | 多个大招 `hyper: true` | **≤ 30%**，且霸体招必须「不可格挡 + 长预警」 | 只狼危字分级【来源】 |
| 无敌帧 / 位移帧 | RUSH 有位移 | 单次 **≤ 0.25s**，且位移期间**不能攻击** | 反 #8 |
| 追击速度 | `SUKUNA_RUN` 6.6 vs 玩家 4.8；`SUKUNA_RUSH` 15 | BOSS 常速 **≤ 玩家冲刺速度 × 0.95**；突进必须有 **≥0.35s 前摇 + 0.5s whiff 惩罚** | 【设计推断】 |
| 难度倍率 `AI_DMG` | 0.75 / 1.0 / 1.3 | 收到 **0.9 / 1.0 / 1.1**，难度全部转移到「要求」上 | 直接回应「上强度 = 加欲望而不是加数值」 |
| 阶段切换 | `ph` 提高招式评分 | 只加**招式种类 / 连段长度 / 频率**，不加伤害 | 怪物猎人贝希摩斯第二阶段："he will use his skills more often and sometimes in rapid succession and his meteor will now target all hunters." https://monsterhunterworld.wiki.fextralife.com/Behemoth |

### 4.2 反「站桩挨打」

- BOSS 的**移动**与**攻击**互斥：处于位移/后撤状态时禁止发起攻击。
- 玩家的连段必须能产生**可见的进度**：`POISE: {GOJO:5, SUKUNA:8}` + `POISE_REGEN: 0.75/s` 是有的，但没有反馈。建议：韧性条可见 + 打满给 1.0s 处决窗口（对应只狼 Poise → 「被打断几秒，可以白打一套」【来源 https://sekiroshadowsdietwice.wiki.fextralife.com/Posture】）。
- 给 BOSS 一个**可读的脱离手段**（推开 / 位移 / 反击），冷却 3~5s，且有预警；而不是「连续霸体硬吃」。
- **削韧条必须在「脱战后快速回复」**：艾尔登法环的设计是「敌人一段时间不受伤后逐渐恢复架势，而**一旦开始恢复就恢复得很快**」——这样既不惩罚持续压制，也不允许玩家打两下就跑。参考其可量化程度：单招架势伤害是**固定值表**（重击 40 / 轻击 30 / 部分技能 45），BOSS 阈值 ÷ 单招值 = 「几刀破防」可以直接算出来。
  【来源 https://eldenring.wiki.fextralife.com/Stance ："Enemy Stance gradually recovers after a period of time without taking damage. While recovery times vary between enemies, Stance Damage is restored quickly once recovery begins."】
- **只狼的反向技巧**：攻击者在出招期间不能回复自己的体干——本作可以给宿傩加同一条规则：**连续出招会让他更脆**，这样「BOSS 打得很凶」同时也就是「玩家翻盘的机会」。
  【来源 https://sekiroshadowsdietwice.wiki.fextralife.com/Posture ："though an attacker cannot regain their own Posture while they are attacking."】

### 4.3 反「永远追不上」

- BOSS 的后撤必须是**有代价的逃跑**：后撤期间不能攻击 = 玩家追上去的 2 秒是白送的输出窗口。
- 【苍】（吸引）这类「拉近」手段应该成为玩家对付撤退的手段 —— 把「追不上」变成玩家的**操作收益**，而不是罚站（见 §5.4 方案 A）。
- 全场无边界远程招（射程 9999）**必须**满足：有专属预警 + 有明确解法 + 有冷却 ≥ 20s。否则就是反模式 #1。

### 4.3.1 双目标场景（魔虚罗 + 宿傩）必须用「仇恨令牌」

群战有一个成熟的工业做法：**同一时间只有一个敌人真正持有进攻权**，其他敌人做辅助行为（包夹、远程、等待）。怪物猎人·贝希摩斯的实装是可以直接引用的样板：
- 仇恨是**显式单目标令牌**：「攻击头部或故意被抓可以获得 enmity，获得仇恨后贝希摩斯会停止施放 Charybdis 并把注意力转向该玩家」。
- 令牌状态**对玩家可见**：「在坦克的仇恨被战斗文本确认之前不要开打」。
- 令牌**可被重置但要有代价**：「闪光弹会重置仇恨，所以要省着用」；且「仇恨会在几分钟后重置」。
【来源 https://monsterhunterworld.wiki.fextralife.com/Behemoth ："You can gain the enmity (aggro) of Behemoth by attacking it's head or get grabbed on purpose." / "Do not engage until the tank has enmity confirmed by the combat text." / "Be aware that Flashpods reset Enemity (aggro), so they should be used sparingly."】

MMO 侧则把它做成**按敌人等级分档的配置表**（例如档位 5 = 副本中 BOSS，档位 6 = 副本最终 BOSS），而不是每个敌人都手写一套。
【来源 https://ffxiv.consolegameswiki.com/wiki/Aggression 】

→ **本作规则**：魔虚罗在场时，**同一时刻只有一个敌人可以发起「必须应对」的攻击**；另一个只能做可忽略的骚扰（伤害 ≤ 单次 5% 血）。这条能直接消灭「2v1 无节奏」的粪怪感。

### 4.4 读招不读按键（input reading 的公平线）

玩家社区的争议点是**「AI 是不是在读我的按键」**：如果 BOSS 在玩家按下按键的**那一瞬间**就能反应，就会「trivialize skills like quick reaction times」（把反应速度这个技巧直接作废）。但实际实现并不一样——
【来源 https://gamerant.com/elden-ring-input-reading-animations-boss-battles/ ："Input reading... is when a game's AI reacts to the signal sent by a player's control input, rather than reacting to something like a collision"】

**公平的做法官方已经写明**：艾尔登法环「没有输入读取，只有**动画读取**」——「敌人 AI 对玩家的**治疗动画**这一类高承诺动作有脚本化反应是很常见的，但对其他动画（比如闪避、近战攻击）没有」，而且这种反应的设计目的是「**惩罚时机不对的治疗**」，不是禁止玩家做这件事。
【来源 https://gamerant.com/elden-ring-input-reading-animations-boss-battles/ ："Elden Ring does not feature input reading, but animation reading." / "it's common for an enemy AI to have a scripted response for something like the player's healing animation, but not for other animations" / "the reading of the healing animation only existing to punish poorly timed healing."】

**规则**：
- AI 只允许读**动画阶段**（起手帧过了 X% 才能反应）与**场上实体**，禁止读 `cur/edges` 输入位。
- 对「高承诺动作」（治疗、蓄力、领域展开）可以有脚本化反制，但必须**读动画且留反应延迟**；对普攻/闪避不得有专属反制。
- 本作现在 AI 通过 `observe(t)` / `reactionView(t)` 观察玩家状态 —— 必须确认它取的是**动作快照**而不是按键边沿。
- 反应延迟用 `AI_REACT` 统一施加（≥0.2s），且**困难难度也只缩短延迟，不缩短窗口**。

### 4.5 复读抑制

本作 AI 是效用评分制（`decide()`，对每个候选打分取最大，同一行为有 +13 惯性加成）——惯性加成会**放大复读**。

**规则**：
1. 同一招式内置冷却 **≥ 5~8s**（本作已有 `SKILL_DATA[].cd`，如【解】1.1s 太短）。
2. **禁止同一招连续使用两次**（含连段变体），用「最近使用过的招式权重 ×0.35」实现。
3. 招式权重按距离分档：近（0~5m）/ 中（5~15m）/ 远（>15m）各一组权重，**不允许出现「任何距离都用同一招」**。
4. 每个阶段至少 6 个可用招式，保证 10 次决策内的重复率 < 25%（可脚本验收：跑 60s 对局统计招式分布）。

---

## 5. 远程 / 高机动角色的特殊问题：五条悟怎么做才不失衡

### 5.1 问题量化（本作实测）

| 抱怨 | 数据 | 结论 |
|---|---|---|
| 「跑图没收益」 | 咒力 `CE_REGEN: 6/s` 是**被动**回复，跑不跑都涨；而拉开距离后玩家的输出手段只剩有 CD 的远程招 | 跑图**没有正收益**，只有「暂时不挨打」 |
| 「跑反而掉血」 | 宿傩【解】射程 90、【开】95、【空间斩】9999；玩家移速 4.8、冲刺 8.8，宿傩跑 6.6、突进 15 | 拉开距离**不减少承伤**，只减少自己的输出 → 理性选择是贴身 |
| 「冲刺是鸡肋」 | 冲刺无消耗、无无敌帧、无位置收益 | 只有在「没有别的位移手段」时才有用 |
| 「无下限闪避有后摇卡自己」 | 0.4s 无敌 + 0.85s 冷却 = **1.25s** 空窗，且【空间斩】`active: 0.35` 后仍有 0.55s 收招；玩家 `HITSTUN_HEAVY: 0.46` | 一次闪避失败 = 被两段连击锁死 |

**根因一句话**：现在的五条悟既**没有距离收益**（远程吃 CD），也**没有距离安全**（BOSS 射程 9999），所以机动性只能带来负收益。

### 5.2 原作依据：无下限不是无敌，它有六种破解（这正好是设计素材）

原作的官方设定条目直接把破解方式写清楚了（引用为 Fandom 词条正文 + 其标注的漫画章节，**非漫画原句**）：

| 破解方式 | 原文 | 出处 |
|---|---|---|
| 总则：**只能由使用者自己关掉，或被「领域」（展开 / 展延）抵消**；带特定术式的咒具可以扰乱或解除 | "The Infinity can only be deactivated by the user, or dismissed with a domain, applied through either expansion or amplification." | https://jujutsu-kaisen.fandom.com/wiki/Limitless （chap 84） |
| **领域展延**：带展延的攻击必定命中，代价是**同时不能用生得术式，只能肉搏** | "an attack with Domain Amplification will always land regardless of the opponent's technique." / "Amplification's primary drawback is that an innate technique cannot be activated at the same time, limiting the user to relying on hand-to-hand combat." | https://jujutsu-kaisen.fandom.com/wiki/Domain_Amplification （chap 84 / 171 / 227） |
| **领域对撞 + 术式熔断**：五条靠「破坏自己脑中术式的刻印，再用反转术式修复」强行恢复熔断的术式，**第 5 次后脑损伤累积到再也开不出领域** | "Gojo was damaging the engraving of his Limitless technique in his brain and then healing it with reverse cursed technique to forcibly restore his exhausted technique after every domain clash. After doing these five times, he's reached his limit..." | https://jujutsu-kaisen.fandom.com/wiki/Satoru_Gojo_vs._Sukuna （chap 230） |
| **束缚换输出**：宿傩放弃领域内的必中效果，换取领域外斩击威力，并靠**身体接触**规避无量空处 | "Using a binding vow, he increases the output of slashes outside Gojo's barrier in exchange for removing the sure-hit effect within it." | 同上（chap 227） |
| **适应（魔虚罗）**：把「斩击的目标」从五条本人扩展为**空间本身**，从而无视无下限 | "Sukuna used this model to expand the target of his Dismantle to cut the world itself with no regard for the Infinity." | 同上（chap 236） |

**最关键的一条（对游戏化最有价值）**：原作里无下限**几乎不消耗咒力**——六眼让术式损耗「无限接近于零，正常情况下不可能耗尽咒力」，所以**代价被转移到了「大脑」这个不可回复的槽上**（熔断 → 强行修复 → 脑损伤累积）。
【来源 https://jujutsu-kaisen.fandom.com/wiki/Six_Eyes （chap 140）："The amount of cursed energy loss ... is infinitesimally close to zero, making it impossible for them to run out of cursed energy normally."】
另外无下限的操作精度要求极高，「用多了会累」——这是官方给的「无敌能力也有操作成本」的原始表述。
【来源 https://jujutsu-kaisen.fandom.com/wiki/Limitless （chap 69）："requires precise manipulation of the user's cursed energy, which can cause the user to tire out easily."】

（中文二手整理另列出「天逆鉾 / 黑绳」两种咒具破解，可作 DLC 级素材：【来源 https://blog.csdn.net/weixin_43949948/article/details/143416698 】）

→ **设计启示**：原作自己就给「无敌」配了代价与破解。**游戏里也应该让无下限是「有条件、有代价、有破解」的**，而且代价最好放在**不可自然回复的槽**（脑负荷 / 熔断层数）上——这比再加一条耐力条更贴原作，也天然避免「堆机制」。

### 5.3 行业先例：同样的「远程/高机动太强」别人怎么解的

- **会心距离（最成熟、最可直接抄）**：怪猎的远程武器必须站在「适正距离」才有 **1.5 倍**伤害；偏离适正距离「一步」，弩弹伤害只剩约 **1/10**；MH Rise 的弓出圈约 **1/5**，而「OUT OF RANGE」**直接没有判定**（0 伤害）。矢种之间窗口差异极大——扩散矢的适正距离只有 **1~1.5 个回避步**（必须贴脸）。设计意图被直接写明：系统上就是「**不让远程比近战更有利**」，而且「这个枷锁一旦去掉，历史上多次发生平衡崩坏」。
  【来源 https://wikiwiki.jp/nenaiko/システム/クリティカル距離 ："距離によって威力は 0.5、0.8、1.0、1.5 と変化し" / "ボウガンの弾は適正距離から一歩でも遠くから撃てば、ダメージが約1/10になる" / "システム的には「近接武器より有利にならないように」という配慮だと思われる。" / "故に、この枷が外れると バランス崩壊 を起こしている事が少なくない。"】
  → **本作可直接借用**：给【赫】【茈】定义「适正距离带」（例：8~18m 满伤，<8m 或 >18m 衰减到 40%），并做准星/指示器可视化（怪猎用 ◎/○/OUT OF RANGE 三档：【来源 https://game8.co/games/Monster-Hunter-Wilds/archives/500373 】）。
- **远程不产生资源**：血源的 Rally 只能靠**贴身反击**回收，远程攻击（Simon's Bowblade）**不回 Rally** → 拉开距离 = 主动放弃回血资源。
  【来源 https://bloodborne.fandom.com/wiki/Rally ："Ranged attacks from Simon's Bowblade do not provide rally."】
- **补给锁在近身**：DOOM 永恒处决必须进入橙色近战提示距离，且**必掉血包**；电锯回弹药需要燃料，怪越大消耗越多。
  【来源 https://doom.fandom.com/wiki/Glory_Kill ："enemies killed through Glory Kills always drop health pickups"】
- **攻防工具人人平等，进攻手段才允许差异化**：Sirlin 总结格斗游戏的「Universal Defense, Unique Offense」——防御工具必须人人共享，才允许角色进攻手段高度差异化；而「乌龟（零风险打法）之所以被讨厌，是因为它靠诱使对手在错误时机进攻来惩罚人」。
  【来源 https://www.sirlin.net/articles/designing-defensively-guilty-gear ："Universal Defense: all characters have equal access to an unusually large number of safeguards and defensive abilities. Unique Offense: each character has unique mechanics..."】
  → **直接回应「五条悟 vs 宿傩」的不对称**：双方的**防御动词集合必须相同**（都能闪、都能招架、都有破防/处决），差异只放在**进攻手段与射程**上。
- **机动工具必须有限制条件**：只狼钩绳只能钩关卡作者放置的、变绿的钩点；钩索动画期间**仍会被打到**；蹲姿钩完落地会脱离潜行。
  【来源 https://sekiroshadowsdietwice.wiki.fextralife.com/Grappling+Hook ："Sekiro can still be hurt by enemy attacks during this animation."】
  → 本作的无下限也应该满足：**有破解、有冷却、有使用代价**，而不是免费无敌。

### 5.4 七个可选方案与取舍

> 下面给了 **7 个**候选。如果只允许落地 **3 个**，就是 §5.5 的「核心三件」（B + A + F）。

| 方案 | 做法 | 原作味 | 实现成本 | 风险 |
|---|---|---|---|---|
| **A. 距离即资源** | 咒力**只在距敌 12m 内的交锋中增长**（命中/招架/被击中）；>12m 时每秒 **-3** | ★★★（要打拳才有术式） | 低（改一个回复条件） | 纯远程玩家会不适；需要用「苍」提供主动拉近 |
| **B. 无下限 = 招架键（防反）** | 把现在的 0.4s 无敌位移改成 **0.18~0.22s 窗口的「停招」**：成功 = 零伤害 + 敌方硬直 0.5s + 返咒力 12；失败 = 0.35s 硬直 + 吃满伤害。位移交给普通闪避（有后摇、无长冷却） | ★★★★（无下限是「停住」不是「躲开」） | 中（要新增一个闪避动词，但可复用现有 dodge 键位/动画） | 需要重新调宿傩所有招的判定，否则会过强 |
| **C. 移动付费（耐力）** | 冲刺/闪避消耗耐力；**完美闪避**（无敌帧前半段穿过攻击判定）返还耐力 + 0.2s 慢镜 | ★★ | 中 | 两条资源条容易变复杂 → 建议只留咒力一条，冲刺耗咒力下限 20 |
| **D. 远程 = 处决手段** | 【赫】【茈】只在敌方**破防 / 大后摇窗口**内造成全额伤害，平时伤害 ×0.3；对应原作「茈是终结技」 | ★★★★ | 低（改伤害乘区） | 玩家会觉得「远程键变弱」，需要 UI 明示窗口 |
| **E. 领域 = 双向资源战（改造现有对撞）** | 对撞不再锁 12 秒：改为**最多 6 秒**，双方把已积累的资源投入推条；输家不是直接吃伤，而是进入「术式熔断」+ 被追击 8s（有操作空间） | ★★★ | 中（改 `domainduel.js` 时长与结算） | 已有代码，改造成本可控 |
| **F. 破解必须可见（表现层）** | 宿傩用**领域展延**中和无下限时，UI 明确提示「术式被中和」并给 **1.5s** 应对窗口；展延期间 BOSS **只能近战**（正是原作写明的缺点）→ 玩家获得 2~3s 反打窗口 | ★★★★★ | 低（表现 + 一个状态标记） | 无 |
| **G. 代价放在「脑负荷 / 熔断层数」而不是耐力条** | 无下限几乎不耗咒力（原作：六眼让损耗近乎为零），代价转移到**不可自然回复的脑负荷槽**：每次在熔断状态下强行恢复术式 +1 层，满 3 层当局限用领域、5 层后无下限窗口缩短一半。原作五条正是「破坏脑中刻印 → 反转术式修复 → 第 5 次后开不出领域」【来源 §5.2】 | ★★★★★（直接来自原作设定） | 中（新增一个状态 + UI） | 玩家可能看不懂 → 必须做成可见层数与明确提示 |

### 5.5 推荐组合

**核心三件（先做，能直接回应朋友的三句抱怨）**：
1. **B（无下限变招架键）** —— 直接实现「无下限可以防反」，把唯一的防御键从「无脑无敌」变成「有窗口、有风险、有收益」。
2. **A（距离即资源）** —— 跑图不再是策略：不涨资源，也不像现在一样「跑就掉血」；跑 = 中立，而不是负收益。
3. **F（破解可见）** —— 让设定与机制咬合：无下限会被中和，但中和期间 BOSS 只能打拳，玩家获得反打窗口。这条**不加机制，只加信息**，性价比最高。

**第二批**：
- **D（远程改处决）** + **怪猎式「适正距离带」**：给【赫】【茈】定义满伤距离带（8~18m），带外衰减到 40%，并在准星/指示器上可视化。这样「站对距离」本身成为玩家的操作收益，而不是「跑得越远越安全」。
- **E（对撞从 12s 砍到 6s）**。
- **G（脑负荷/熔断层数）** 作为 F 的数值化落地：让「无下限被中和」有累积代价。

**长期**：C（移动付费）。
**不建议**：为了「机动性手感」继续加位移键。位移应该**更少、更有代价、更有位置收益**（背后/侧向命中加成），并且严格遵守 Sirlin 的「防御工具人人平等」——**宿傩也必须遵守同一套招架/破防规则**，否则玩家会觉得「只有我被规则约束」。

**配套的「接近工具」**（解决「追不上/被风筝」，等价于格斗游戏的立回）：给双方各一个**有预警、有代价的接近手段**——玩家用【苍】拉近（消耗咒力、有前摇），宿傩用突进（0.35s 前摇 + 0.5s whiff 惩罚）。这样「距离」变成双方都在玩的资源，而不是单向的惩罚。

---

## 6. 落地清单：新项目必须先定下来的 12 条战斗规则（+1 条加分）

> 每条一句话 + 可验收方式 + 依据。建议直接进 `contract`，改规则要同步改验收脚本。

| # | 规则 | 验收方式 | 依据 |
|---|---|---|---|
| 1 | **每一招必须标注它能被哪些选项解**（招架/闪避/格挡/位移），且至少有一种解法是「零伤害」。 | 招式表每行有 `def` 字段；脚本枚举无遗漏；随机抽 5 招人工验证 | 只狼危字分级【来源】 |
| 2 | **不可格挡 / 不可闪避的招必须给 ≥0.8s 的专属预警**，且预警可区分类型（颜色 + 音效 + 剪影至少两项）。 | 探针读每招 `cast` 时长 ≥0.8s；录屏抽查类别可辨 | 反应时间 190~200ms + <300ms 反而拖慢【来源】 |
| 3 | **玩家必须有 ≥3 个防御动词**，代价互不相同（闪避=位置+后摇 / 招架=窗口+失败惩罚 / 格挡=资源消耗）。 | 输入表 + 单元测试：三个动词各自能触发；现状 `guarding` 只属于 AI | Lies of P / 只狼【来源】 |
| 4 | **招架成功必须返还 ≥1 项资源并打开 ≥0.35s 反击窗口**；不允许存在「成功但没收益」的防御。 | 招架成功的资源变化日志非零；连段计时窗口 ≥0.35s | 只狼弹反、血源 Rally【来源】 |
| 5 | **取消被动资源回复**：资源只在距敌 12m 内的交锋中增长，>12m 时每秒 -3。 | 探针：站远处 10s，资源曲线必须下降 | 【设计推断】（回应「跑图没收益」） |
| 6 | **玩家冲刺速度 ≥ BOSS 常速 × 1.2**；BOSS 后撤/位移期间**禁止攻击**。 | 数值断言 + AI 行为日志 | 反模式 #8【来源】 |
| 7 | **BOSS 单次无敌/位移 ≤0.25s，霸体招占比 ≤30%**；玩家完整 3 连段必须能推动敌方削韧条。 | 60s 对局统计霸体招比例；削韧条在 3 连段后可见变化 | 只狼 Poise【来源】 |
| 8 | **BOSS 攻击间隔按阶段设下限**：P1 ≥2.2s / P2 ≥1.6s / P3 ≥1.1s；难度只调间隔与招式种类，**不调伤害**。 | 统计 60s 内相邻两次威胁动作的间隔分布 | 用户朋友的判据 + 【设计推断】 |
| 9 | **禁止同招连续复用**：同一招冷却 ≥5s，且不得连续使用两次。 | 招式使用序列脚本检查（10 次决策内重复率 <25%） | 反模式 #5（随机/复读） |
| 10 | **AI 只读动画与实体，禁止读按键**；反应延迟 ≥0.2s。 | 代码审查 `reactionView` 数据来源；延迟表可配置 | https://gamerant.com/elden-ring-input-reading-animations-boss-battles/ |
| 11 | **每招必须有 ≥0.5s 的空招（whiff）惩罚窗口**，玩家能在其中塞进一整段反击。 | 招式的 `recover` ≥0.5s；实测能打出 3 连段 | §1.2 关系式 1【设计推断】 |
| 12 | **玩家被同一次连段打死 = 禁止**：受击后给 ≥0.4s 脱离窗口；单次大招失误 ≤40% 最大生命。 | 伤害/硬直断言；被抓连击时玩家可在第 2 段后脱离 | 反模式 #9【设计推断】 |
| 13（加分） | **每一次交互都要有重量**：轻击 1~1.5% BOSS 血，大招命中 25~40% 玩家血；一局 15~30 次读招循环。 | DPS/TTK 报表在 2.5~4 分钟内 | §3.3【设计推断】 |

---

## 附录 A：TUNE 对照表（现状 → 建议，直接可改）

> 左列是本仓库 `src/combat.js` 现有键名，右侧是建议值与其依据章节。**这不是必改清单，而是"新项目先定下来"的候选基线**。

| 参数 | 现状 | 建议 | 依据 |
|---|---|---|---|
| `INFINITY_TIME` | 0.4（全额无敌） | 拆成两个动词：**无下限招架窗口 0.18s** + **普通闪避无敌 0.25~0.30s** | §1.2 / §5.4-B |
| `INFINITY_CD` | 0.85 | 普通闪避只给 0.25~0.35s 后摇，**不要长冷却锁**（长锁 = 被连段必吃） | §1.2 关系式 2 |
| `DODGE_SPEED` | 16（瞬时冲量） | 保留位移手感；**无敌交给帧窗口而不是位移本身** | §5.4-B |
| `MOVE_SPEED` / `DASH_SPEED` | 4.8 / 8.8（疾跑模块顶速约 10.5） | 冲刺 ≥ BOSS 常速 × 1.2（宿傩常速 6.6 → 玩家冲刺 ≥ **7.9**，现值达标） | §6-6 |
| `SUKUNA_RUN` / `SUKUNA_RUSH` | 6.6 / 15 | 常速 ≤ 玩家冲刺 × 0.95；突进加 **0.35s 前摇 + 0.5s whiff 惩罚**，位移期间禁止攻击 | §4.1 / §6-6 |
| `CE_REGEN` | 6/s（被动） | **仅距敌 12m 内交锋时增长**；>12m 时 **-3/s** | §3.2 / §5.4-A |
| `CE_ON_HIT` | 1.5 | 轻击 3 / 重击 5 / 招架 12 / 完美闪避 6 | §3.2 |
| `GUARD_DR` | 0.32（**当前玩家用不到**） | 玩家也要有格挡：减伤 0.25~0.35 + 持续消耗 + 「回气池」3s 内可回收 | §1.3 / §1.4 |
| `POISE` | 5 / 8 | 保留数值，但加**可见条** + 打满给 **1.0s 主动处决窗口** | §4.2 |
| `POISE_REGEN` | 0.75/s | 改为「脱战后**快速**回复（≥3/s）」——持续压制才有窗口，逃跑就丢进度 | §4.2 |
| `HITSTUN_HEAVY` | 0.46 | 加**连段保护**：被命中第 2 段后给玩家 ≥0.4s 脱离窗口 | §6-12 |
| `INCOMING_SCALE` | 0.1 | 按「轻击 = BOSS 最大生命 1~1.5%」反推重设（不是直接改这个旋钮，而是重算 SKILL_DATA × 该系数） | §3.3 |
| `BOSS_DMG_SCALE` | 1.6 | 只用来标定「大招命中 = 玩家最大生命 25~40%」，**不要当作难度旋钮** | §3.3 / §4.1 |
| `AI_REACT` | 0.35 / 0.22 / 0.12 | **0.35 / 0.28 / 0.22**，且**任何难度都不低于 0.2s** | §4.1（反应时间研究） |
| `AI_DECIDE` | 0.42 / 0.26 / 0.17 | 0.45 / 0.35 / 0.30；**攻击的发起改由「后摇结束 + 招式冷却」控制**，不再由决策间隔决定 | §4.1 |
| `AI_GUARD` | 0.3 / 0.55 / 0.8（**概率**） | 改为**条件式**：只对特定招式、且满足朝向/资源条件时格挡 → 玩家能学会规律 | §2.1-5 |
| `AI_DMG` | 0.75 / 1.0 / 1.3 | **0.9 / 1.0 / 1.1**，难度全部转移到「间隔 / 招式种类 / 连段长度」 | §4.1 |
| `SKILL_DATA[WORLD_SLASH]` | cast 1.1 / active 0.35 / recover 0.55 / range 9999 | 保留 1.1s 预警；**recover 提到 0.9~1.2s**（给玩家惩罚窗口）；**射程改有限 + 冷却 ≥20s** | §1.2 / §4.3 |
| `CLASH_LIFE` / `CLASH_PRESS_PUSH` | 12s / 连点 0.09 | **6s**，并把「连点」改成「投入咒力」的资源交换 | §5.4-E |

---

## 7. 存疑点 / 未验证项（引用时务必注意）

1. **ER 翻滚帧数的 fps 口径**：fextralife 表头写 30fps（13 帧 = 0.43s），社区另有按 60fps 读成 0.22s 的说法。本文按 30fps 呈现并标注口径；**若要写进正式设计文档，建议以自己实测或 datamine 二次确认**。
2. **Lies of P 完美防御帧数（0.155s）来自 Nexus mod 说明页**（mod 作者引用的游戏内时间定义），不是官方 wiki；另有 Reddit 标题称「8 帧窗口」。两者都属二手，本文取 0.155s 并纳入聚类。
3. **只狼「12 帧」来自 fextralife wiki 正文 + 评论区讨论**（wiki 曾长期写作 30 帧，评论区质疑后修正为 12 帧），属于社区共识而非官方数据。
4. **黑魂 3 翻滚帧数**来自 fextralife「Equipment Load」页（轻/中 13 帧、重 12 帧，30fps 口径）；**黑魂 1 两说并存**（fandom 表「全部 11 帧」 vs Reddit「9/11/13」），引用时必须二选一。
5. **「BOSS 攻击间隔 P1≥2.2s」等 AI 调参区间没有外部出处**，是根据本作实测数值 + 反应时间研究推导的【设计推断】，需要在本作里用 60s 对局样本校准。
6. **怪物猎人「会心距离」**：距离档位倍率 0.5 / 0.8 / 1.0 / 1.5、偏离一STEP 约 1/10 伤害、Rise 出圈约 1/5 与「OUT OF RANGE 无判定」均来自日文社区大辞典（https://wikiwiki.jp/nenaiko/システム/クリティカル距離 ），**不是官方数值表**；弓的蓄力等级倍率另见 https://laxgg.blogspot.com/p/mhgen-bow-mechanics.html 。
7. **怨恨之鬼/神皮双人组的「被骂」表述**部分来自 Reddit 与攻略站，属社区评价而非设计者自述；文中已按「社区评价」措辞。
8. 本文引用的 Reddit/Fextralife/GameRant 均为二手整理，**帧数据以社区 datamine 为准**；正式立项建议做一次本机实测。
9. **来源冲突一览（引用时二选一并写明）**：
   - 黑魂 1 翻滚：fandom 表「全部 11 帧、忍者翻 13 帧」 vs Reddit 帖「9/11/13/15 帧」。
   - 艾尔登法环弹反：fextralife「小盾 4 帧起手」 vs 社区「buckler 16 帧起手」。
   - 只狼弹反：fextralife 现行「12 帧（0.2s）」 vs 旧维基流传的「30 帧（0.5s）」（fextralife 评论区本身在争论，本文取 12 帧）。
   - Lies of P 完美防御：mod 页「0.155s（≈9.3 帧）」 vs Reddit 标题「8 帧窗口」。
10. **来源等级提醒**：只狼垫步无敌帧、Lies of P 完美防御帧数、卧龙化解帧数、Sifu 招架帧数四项来自 **Nexus mod 说明页**（mod 作者转述的游戏内数值），属于二手；怪猎「会心距离」数值来自日文攻略大辞典，属社区整理。这些数字**足以支撑设计区间，但不适合作为对外发布稿的硬引用**。
11. **搜索环境中 reddit / GameFAQs / Nexus / gamedeveloper.com 在本机 403**，凡是只能从搜索摘要取得的引用（DS1 翻滚帧、MH 会心距离 1.5x 倍率的部分表述、「FromSoft aggression = 攻击间隔」的 Nexus 表述）已单独标注。
12. **明确「不要当数字用」的项**（本轮考据确认无一手数据）：只狼体干回复速率公式、血源 Rally 精确帧数、仁王残心的精确窗口帧数与百分比（某 SEO 站声称「0.3s / 4 帧 / 60~90%」无一手依据）、卧龙气势增减的具体数值、Lies of P 回血百分比与硬直秒数、处决窗口的通用秒数、战神「敌人轮流进攻的攻击令牌」（GDC 场次摘要无 token 字样）、BOSS 出招间隔分布与连段分支概率的具体数值。

---

## 8. 来源汇总

| 主题 | URL |
|---|---|
| 只狼·弹反窗口 | https://sekiroshadowsdietwice.wiki.fextralife.com/Deflection |
| 只狼·识破窗口 | https://sekiroshadowsdietwice.wiki.fextralife.com/Mikiri+Counter |
| 只狼·体干/韧性 | https://sekiroshadowsdietwice.wiki.fextralife.com/Posture |
| 只狼·危（Perilous）攻击分级 | https://sekiroshadowsdietwice.wiki.fextralife.com/Combat |
| 只狼·怨恨之鬼 | https://sekiroshadowsdietwice.wiki.fextralife.com/Demon+of+Hatred |
| 艾尔登法环·翻滚/无敌帧表 | https://eldenring.wiki.fextralife.com/Dodging |
| 艾尔登法环·弹反 | https://eldenring.wiki.fextralife.com/Parrying |
| 艾尔登法环·玛莲妮亚 | https://eldenring.wiki.fextralife.com/Malenia+Blade+of+Miquella |
| 艾尔登法环·神皮双人组 | https://eldenring.wiki.fextralife.com/Godskin_Duo |
| 黑魂1·翻滚无敌帧 | https://www.reddit.com/r/darksouls/comments/y8xe5i/iframes/ |
| 黑魂3·翻滚机制说明 | https://steamcommunity.com/app/374320/discussions/0/1733217528121996749/ |
| 血源·Rally 回血 | https://bloodborne.wiki.fextralife.com/Rally |
| 仁王·残心 | https://nioh.wiki.fextralife.com/Ki+Pulse |
| 卧龙·气势槽 | https://wolong.wiki.fextralife.com/Combat |
| Lies of P·格挡/完美防御/Guard Regain | https://liesofp.wiki.fextralife.com/Combat |
| 怪物猎人·弓蓄力倍率 | https://laxgg.blogspot.com/p/mhgen-bow-mechanics.html |
| 怪物猎人·弓（太远伤害下降） | https://monsterhunterworld.wiki.fextralife.com/Bow |
| 怪物猎人·Alatreon 属性 check | https://monsterhunterworld.wiki.fextralife.com/Alatreon |
| 混沌温床·反模式分析 | https://gamerant.com/dark-souls-bed-of-chaos-fromsoftware-worst-boss-jumping-mechanic-collision-arena/ |
| 玛莲妮亚·水鸟乱舞评价 | https://gamerant.com/elden-ring-malenia-pinnacle-boss-design-representation-good-bad/ |
| 艾尔登法环·读指令 | https://gamerant.com/elden-ring-input-reading-animations-boss-battles/ |
| 艾尔登之兽·跑动争议（社区） | https://www.reddit.com/r/Eldenring/comments/wo1ejk/that_fact_that_people_shit_on_elden_beast_for/ |
| 人类反应时间（预警下限依据） | https://en.wikipedia.org/wiki/Reaction_time |
| 只狼·垫步无敌帧（mod 页转述解包值） | https://www.nexusmods.com/sekiro/mods/417 |
| 只狼·钩绳限制 | https://sekiroshadowsdietwice.wiki.fextralife.com/Grappling+Hook |
| 只狼·**官方 Web 手册**（体干/忍杀/Vitality 联动） | https://www.fromsoftware.jp/manual/sekiroshadowsdietwice/stadia/mechanics.html |
| 只狼·攻击力分段收益 | https://sekiroshadowsdietwice.wiki.fextralife.com/Attack+Power |
| 卧龙·气势槽数值规则（Game8） | https://game8.co/games/Wo-Long-Fallen-Dynasty/archives/406802 |
| Lies of P·Guard Regain | https://lies-of-p.fandom.com/wiki/Guard |
| Lies of P·Stagger（白框/主动触发） | https://lies-of-p.fandom.com/wiki/Stagger |
| Lies of P·Fable Arts（死亡清零） | https://lies-of-p.fandom.com/wiki/Fable_Arts |
| Sifu·结构条 | https://sifu.fandom.com/wiki/Structure |
| Sifu·招架与结构（二手评测） | https://outsidergaming.com/sifu-the-benefits-of-parrying-and-effects-on-structure/ |
| 战神·斯巴达之怒 | https://godofwar.fandom.com/wiki/Spartan_Rage |
| 艾尔登法环·架势/削韧数值表 | https://eldenring.wiki.fextralife.com/Stance |
| Alien: Isolation·menace gauge（攻击欲望三旋钮） | https://www.aiandgames.com/p/revisiting-alien-isolation |
| 求生之路·导演系统压力预算 | https://steamcommunity.com/workshop/filedetails/discussion/3145769266/4143942360094410180/ |
| 怪物猎人·贝希摩斯仇恨令牌 | https://monsterhunterworld.wiki.fextralife.com/Behemoth |
| FFXIV·仇恨档位 | https://ffxiv.consolegameswiki.com/wiki/Enmity ; https://ffxiv.consolegameswiki.com/wiki/Aggression |
| GDC·Boss Up: Boss Battle Design | https://gdcvault.com/play/1024921/Boss-Up-Boss-Battle-Design |
| 艾尔登法环·弹反帧数据 | https://eldenring.wiki.fextralife.com/Parry |
| 黑魂3·负重与翻滚帧 | https://darksouls3.wiki.fextralife.com/Equipment_Load |
| 黑魂1·翻滚（fandom 表） | https://darksouls.fandom.com/wiki/Rolling |
| 血源·移动帧数据（解包） | https://www.bloodborne-wiki.com/2015/10/movement.html |
| 血源·Rally（远程不回血） | https://bloodborne.fandom.com/wiki/Rally |
| 血源·枪反/处决 | https://bloodborne.fandom.com/wiki/Visceral_Attack |
| Lies of P·完美防御帧数（mod 页） | https://www.nexusmods.com/liesofp/mods/161 |
| 卧龙·化解帧数（mod 页） | https://www.nexusmods.com/wolongfallendynasty/mods/32 |
| Sifu·招架帧数（mod 页） | https://www.nexusmods.com/sifu/mods/1280 |
| 战神·颜色预警/盾反 | https://www.ign.com/wikis/god-of-war-ragnarok/How_to_Parry |
| 怪物猎人·会心距离数值与设计意图 | https://wikiwiki.jp/nenaiko/システム/クリティカル距離 |
| 怪物猎人·会心距离可视化与技能 | https://game8.co/games/Monster-Hunter-Wilds/archives/500373 |
| 怪物猎人·轻弩会心距离 | https://monsterhunterworld.wiki.fextralife.com/Light_Bowgun |
| 艾尔登法环·施法速度换蓝耗（阿兹尔法杖） | https://eldenring.wiki.fextralife.com/Azur%27s+Glintstone+Staff |
| 艾尔登法环·拉达冈肖像 | https://eldenring.wiki.fextralife.com/Radagon+Icon |
| DOOM 永恒·处决掉血包（补给锁近身） | https://doom.fandom.com/wiki/Glory_Kill |
| Sirlin·防御设计与「乌龟」 | https://www.sirlin.net/articles/designing-defensively-guilty-gear ; https://www.sirlin.net/ptw-book/the-turtles |
| 咒术回战·无下限（Limitless） | https://jujutsu-kaisen.fandom.com/wiki/Limitless |
| 咒术回战·领域展延 | https://jujutsu-kaisen.fandom.com/wiki/Domain_Amplification |
| 咒术回战·五条 vs 宿傩（熔断/束缚/适应） | https://jujutsu-kaisen.fandom.com/wiki/Satoru_Gojo_vs._Sukuna |
| 咒术回战·六眼（咒力损耗≈0） | https://jujutsu-kaisen.fandom.com/wiki/Six_Eyes |
| 五条悟无下限的六种破解（中文考据，二手） | https://blog.csdn.net/weixin_43949948/article/details/143416698 |
| 本作现状数值 | `src/combat.js`（TUNE）、`src/contract.js`（SKILL_DATA）、`reviews/12-lead-audit.md` |
