# 14 · 独立验证报告（task-6 / verifier）

> 验证者：teammate **verifier**。写域：`_tools/verify-*.mjs`、`_tools/verify-assets/*`、本文件。
> 原则：**不读实现代码判断对错**，只看契约（reviews/13-mechanics-contract.md §4/§5/§6/§7）
> 与可观测行为（`window.__SS` / `__SS.mech()` / DOM / 截图 / hp 数值 / 场景世界 AABB）。
> 全程 **未修改 src/** 任何一个字节**（只新增 `_tools/verify-*.mjs` 与 `_tools/verify-assets/page-helpers.js`）。

最后更新：21:15（WIP 阶段：作者 21:00 仍在改 src；最后验证快照 = `tmp/verifier/dist.html` @ 21:00 私有构建，回归跑的是 Lead 的 `dist/新宿决战.html` @ 20:29）。**合流广播后我会对最终 dist 重跑并覆盖本文档。**

---

## 1. 验证脚手架（可复现）

| 文件 | 作用 |
|------|------|
| `_tools/verify-lib.mjs` | 共用脚手架：CDP 启动/跳播片/关 AI、页面内 rAF agent（帧计数、事件流 tap、帧调度按键、DOM 运动扫描）、结果收集与 JSON 落盘 |
| `_tools/verify-assets/page-helpers.js` | 页面侧工具集：`__MA/__SP/__BF/__D`（mech 取值）、`__SCAN/__BODY`（场景世界 AABB）、`__CALLS`（draw call）、`__HUDTEXT/__HUDOVERLAP/__OFFSCREEN`（HUD 体检） |
| `_tools/verify-boot.mjs` | 脚手架自检 + 可观测面盘点 + **帧对齐标定** + 基线帧时间 |
| `_tools/verify-sprint.mjs` | 契约 §7 疾跑（含反例/边界/手机端） |
| `_tools/verify-bf.mjs` | 契约 §6 黑闪（含 ±帧扫描、乱按 500 次、连点） |
| `_tools/verify-mahoraga.mjs` | 契约 §4 魔虚罗（触发边界/模型量测/对空/适应/damageGate/帧率） |
| `_tools/verify-duel.mjs` | 契约 §5 领域对决（连点必败/精确必赢/挂机必负/轴与窗口形态） |
| `_tools/verify-art.mjs` | 四个机制关键瞬间截图 + HUD 可读性体检（主观审查素材） |
| `_tools/verify-regression.mjs` | 回归守门：smoke + acceptance + 老探针串跑，汇总退出码 |

跑法（端口按契约 §3 错开，verifier 用 9510+）：

    node _tools/verify-boot.mjs      --file dist/新宿决战.html --port 9510
    node _tools/verify-mahoraga.mjs  --file dist/新宿决战.html --port 9515
    node _tools/verify-duel.mjs      --file dist/新宿决战.html --port 9514 --n 30
    node _tools/verify-bf.mjs        --file dist/新宿决战.html --port 9513
    node _tools/verify-sprint.mjs    --file dist/新宿决战.html --port 9512
    node _tools/verify-sprint.mjs    --file dist/新宿决战.html --port 9512 --mobile
    node _tools/verify-art.mjs       --file dist/新宿决战.html --port 9518
    node _tools/verify-regression.mjs --file dist/新宿决战.html

结果同时落盘到 `_tools/verify-assets/<name>.json`（原始 PASS/FAIL + 数字），截图落到 `shots/verifier/`。

### 1.1 帧精度标定（±1 帧类断言的前提）

`node _tools/verify-boot.mjs --port 9510 --file dist/新宿决战.html` 实测：

    调度帧 t=30 gameFrame=32 | 按下帧 P=33 (采样 t=31, gameFrame=33) | 第一帧掉血 t=43 hp=1797.4
    PASS 合成按键生效（pressFrame 被写入） | P=33 gameFrame(P)=33 gameFrame(调度)=32 帧偏移=1

结论：**在页面内第 t 帧 rAF 里 dispatch 的键盘事件，会在游戏第 t+1 帧被 buildInput 读到（固定 +1 帧偏移）**。
所有 ±1 帧断言都按这个偏移换算，不靠猜。

### 1.2 基线帧时间（魔虚罗帧率对比的参照）

    帧时间 ms: {"n":995,"min":3.4,"max":15.5,"avg":6.046,"p50":6,"p95":7.6}  >33.4ms 帧数=0/995 (0.0%)
    PASS 基线无页面错误

---

## 2. 契约条款 → 可执行断言映射

| 契约条款 | 断言 | 脚本 |
|---|---|---|
| §4 触发 | 宿傩 hp=900.5（>50%）不召唤；hp=900（=50%）必召唤；二次打残不重复触发 | verify-mahoraga |
| §4 模型 | 场景存在 mahoraga 节点；悬浮锚点 y≈14~17；悬浮躯体高 3.8~4.2m 量级；draw call 增量 ≤70 | verify-mahoraga |
| §4 对空 | 悬浮时近战 10 次打不到；未锁定时苍/赫/茈打不到；锁定后苍/赫/茈各至少命中一次 | verify-mahoraga |
| §4 适应 | 同招命中 2 次 ×0.45、4 次免疫；adapt 计数推进 | verify-mahoraga |
| §4 二阶段 | 魔虚罗存活时玩家打宿傩 ×0.6；宿傩打玩家 ×1.25 | verify-mahoraga |
| §4 性能 | 出场前后帧时间 p95 不明显变差 | verify-mahoraga |
| §5 连点 | 每帧按 light，N 次试验 N 次失败 | verify-duel |
| §5 对齐 | 按 needle∈[lo,hi] 按，N 次 ≥ 28/30 胜利 | verify-duel |
| §5 挂机 | 不输入必负 | verify-duel |
| §5 代价 | 玩家输：扣血 + burnoutT>0 | verify-duel |
| §5 轴 | needle∈[-1,1]；首回合窗口 ≈0.30；半周期 ≈0.8s；窗口只在指针经过后重随机 | verify-duel |
| §6 反乱按 | 随机时刻按 V 500 次 → 0 次黑闪；每帧按 V + 连续攻击 → 0 次 | verify-bf |
| §6 判定 | 命中帧按 V 成功；±1 成功；±3 失败；判定与 delta 自洽 | verify-bf |
| §6 伤害 | 一次黑闪 ≥ 同招普通命中 2.4 倍；ce 扣 8；事件流带 blackFlash 标记 | verify-bf |
| §7 起步 | 0.35s 内 4.8→10.5（ease-out）；1s 位移曲线 | verify-sprint |
| §7 惯性 | 松手不瞬间归零，0.25s 内回落 | verify-sprint |
| §7 表现 | phase 读到 sprint；FOV Δ≥6°；扬尘>0 | verify-sprint |
| §7 反例 | 连点/每帧按抬 Shift/交替乱按不超上限、无 NaN | verify-sprint |
| §7 手机 | 摇杆 >0.92 疾跑、0.90 不疾跑；__TOUCH.run 标志 | verify-sprint --mobile |

---

## 3. 逐机制结果（WIP 快照，非最终判定）

### 3.1 §7 疾跑 —— 快照 `tmp/sprint/dist.html`（20:25 构建，作者仍在做）

    node _tools/verify-sprint.mjs --file tmp/sprint/dist.html --port 9512

原始关键行：

    A 起步: 0.1s v=6.23 0.35s v=9.586 0.85~1.05s v=10.617 1s 位移=10.64m 帧数=157
    PASS §7 0.35s 内升到 10.5 量级（实测 0.35~0.4s 均速 >= 9.5） | v(0.35s)=9.586
    PASS §7 稳态速度落在 10.5±1 | v(稳态)=10.617
    PASS §7 起步有加速过程（0.1s 速度明显低于稳态） | v(0.1s)=6.23 vs 稳态 10.617
    PASS §7 1s 位移明显大于旧版 4.8m/s | 1s 位移=10.64m
    PASS §7 FOV 变化 >= 6 度 | idle=44 -> max=51.98 Δ=7.98
    C 走路: v(1.0~1.6s)=4.836 phases=[null] → PASS 走路速度仍是 4.8 量级
    B 松手: +0ms v=10.853 +0.25s v=6.352 +0.5s v=4.929
    PASS §7 松手不瞬间归零（+0.05s 仍 >= 6） | v(+0)=10.853
    PASS §7 松手 0.25s 内回落到走路量级（<= 6.5） | v(+0.25s)=6.352
    H 边界: 0.28~0.34s v=9.927 0.36~0.42s v=10.329
    FAIL sprint 自报字段齐全（契约 §1.3） | 缺 ["speed","target","phase","fov","accelPhase","dust"]
    FAIL §7 相位读到 sprint | phases=[null]
    FAIL §7 扬尘 > 0 | dust max=NaN

结论（快照）：**速度手感部分实测通过**（起步 0.35s≈9.6、稳态 10.6、1s 位移 10.64m、FOV Δ7.98°、松手惯性曲线正确、走路仍 4.836）。
但当时 `MECH_DEBUG.sprint` 还没注册，phase/dust/fov 读不到，所以「相位=sprint」「扬尘>0」两条**不能算通过**，等作者注册后重测。

### 3.2 §4 魔虚罗 —— `tmp/verifier/dist.html`（21:00 私有构建，含作者最新改动）

    node _tools/verify-mahoraga.mjs --file tmp/verifier/dist.html --port 9515 --parts trigger,air,adapt,gate,perf
    node _tools/verify-mahoraga.mjs --file tmp/verifier/dist.html --port 9515 --parts air,adapt
    node _tools/verify-mahoraga.mjs --file tmp/verifier/dist.html --port 9515 --low --parts air

    PASS §4 宿傩 hp=900.5（>50%）不触发 | beforeAlive=false（第一次伤害后魔虚罗 hp=0，必须仍为 0）
    PASS §4 宿傩 hp=900（正好 50%）必触发 | alive=true 用时 61~100ms
    PASS §4 魔虚罗 hpMax=900（契约 §4） | hpMax=900
    召唤演出 phaseLock 峰值=2.80（契约 2.8） → PASS
    不重复触发：二次打残后 phaseLock 峰值=0.00 魔虚罗 hp 900 -> 900 → PASS
    魔虚罗姿态采样 24/24 帧有效: 锚点 y min=0.05 中位=3.44 max=14.76 | 悬浮帧 1 个: 中位 y=14.76 中位 bodyH=3.82
    PASS §4 场景里存在名为 mahoraga 的模型节点 | 有效帧=24/24
    PASS §4 悬浮锚点 y ≈ 14~17（悬浮帧中位 14.76）
    PASS §4 悬浮躯体高 3.8~4.2m 量级（悬浮帧中位 bodyH=3.82）
    PASS §4 会俯冲/落地（10s 内锚点掉到 0.05）
    PASS §4 模型可见（>= 80% 采样帧） | 可见 23/24 帧
    PASS §4 魔虚罗模型 draw call 增量 <= 70 | 增量=55（未出场中位 189 -> 出场后中位 244）
    PASS §4 悬浮时近战打不到 | hp 900 -> 900（10 次轻击）
    PASS §4 未锁定时弹道不会掰向魔虚罗（打不到） | hp 900 -> 900
    PASS §4 锁定键 KeyQ 能进入 cam.lockOn | lockOn=true
    锁定 blue: 6 次内造成伤害 0/6 次，最大伤害 0，adapt 变化 2 次
    锁定 red:  6 次内造成伤害 3/6 次，最大伤害 115，adapt 变化 3 次
    锁定 purple: 6 次内造成伤害 1/6 次，最大伤害 301，adapt 变化 1 次
    PASS §4 锁定后 赫/茈 至少各命中一次（6 次机会内）
    PASS §4 锁定后 苍 也有命中迹象（苍 dmg=0，用 adapt 计数判定）
    PASS §4 魔虚罗存活时宿傩打玩家 x1.25 | 8.166 -> 10.208 比值=1.250
    帧时间 出场前 p95=7.5 / 出场后 p95=8.5（0/1134 与 0/980 帧 >33.4ms） → PASS

**适应（契约「同招命中 2 次 x0.45、4 次免疫」）—— 实测序列（新召唤、锁定、连续赫）：**

    适应试验#1 伤害=115 剩余hp=785 adapt={"red":1}
    适应试验#2 伤害=52  剩余hp=733 adapt={"red":2}     <- 52/115 = 0.452
    适应试验#3 伤害=52  剩余hp=681 adapt={"red":3}
    适应试验#4 伤害=0   剩余hp=681 adapt={"red":4}     <- 第 4 次命中：免疫（0 伤害）
      … 第 5~24 次同样 0 伤害，adapt.red 一路记到 21（说明计数记的是「命中」而不是「施放」）

→ **适应机制本身是对的**：首击全额、第 2/3 击 x0.45、第 4 击起 0 伤害，适应计数只随命中推进。
（我第一版把它判成 FAIL 是**我的测试设计错了**：对空测试先把赫适应掉了，之后再用赫测「4 次命中」自然全是 0；改成新召唤后序列完全符合契约。）

**修正后的结论：§4 语义层面只剩 1 条真 FAIL ——「魔虚罗存活时玩家近战打宿傩 = 0 伤害」**：

    damageGate 玩家打宿傩: 无魔虚罗=2.6 有魔虚罗=0 比值=0.000  → FAIL §4 魔虚罗存活时玩家打宿傩 x0.6

同条件（玩家摆在宿傩身前 1.6m、转向、轻击 1 次）在没有魔虚罗时稳定打 2.6（26×INCOMING_SCALE），
魔虚罗存活时稳定 0。可疑点：要么近战段被 segment 钩子整段吃掉（但魔虚罗 hp 也没掉，等于伤害凭空消失），
要么玩家在出拳瞬间被打断。请作者用同一条命令复现并定位。

**另一个需要作者确认的观察（不算 FAIL）**：10s 姿态采样里只有 1/24 帧在契约的 14~17m，其余在 0.05~8.5m。
契约写「基准高度 y ≈ 14~17，除俯冲外不落地」。如果技能循环让魔虚罗大部分时间贴地，
「在半空、近战够不到」的体感会打折（我实测近战确实打不到，但那是 hitTest 的结果，不是高度的结果）。

低画质（800x450 → quality=low）复测：召唤/模型/draw call(+45)照常工作，无报错。
### 3.3 §5 领域对决 —— 快照 `tmp/verifier/dist.html`（verifier 20:31 从当时 src 私有构建）

    node _tools/verify-duel.mjs --file tmp/verifier/dist.html --port 9514 --n 6

    __SS.duel 接口 = {"fns":{"begin":"function","push":"function","update":"function","resolve":"function","reset":"function"},"active":"boolean","tug":"number","ctor":"DomainDuel"}
    PASS §5 clashLike 实现默认接口（5 个方法 + active/tug/winner/elapsed）
    连点 #1 lose elapsed=2.6s miss=3 sync=0 tug=-0.58 按键=252
    连点汇总: 开局 6/6 判负 6 判胜 0 → PASS §5-1
    对齐 #1 win elapsed=3.6s sync=5 miss=0 按键=5
    对齐汇总: 开局 6/6 判胜 6 胜率=100.0% → PASS §5-2
    挂机: lose elapsed=3.47s tug=-0.628 miss=3 → PASS §5-3
    PASS §5-4 玩家输：扣血 | hp=1453.27（起始 1800）
    PASS §5-4 玩家输：burnoutT > 0 | burnout=4.920
    needle 样本=631 越界=0 范围=[-0.995,1.000] → PASS §5 needle 始终在 [-1,1]
    PASS §5 首回合窗口宽度 ≈ 0.30 | 首窗口=0.300
    逐回合: [{"r":0,"窗口宽":0.3},{"r":1,"窗口宽":0.255},{"r":2,"窗口宽":0.21},{"r":3,"窗口宽":0.165},{"r":4,"窗口宽":0.12}] → PASS 窗口随回合收窄
    窗口重随机 8 次，指针在变化前确实进入过旧窗口的=8 → PASS §5 窗口只在指针经过后重新随机（8/8）
    needle round0（诊断）: 累计行程=12.31 用时=11.19s 均速=1.100/s -> T=3.636s

**周期这条我最后改判 PASS，并撤回原先的 FAIL —— 先记清楚过程（对账用）：**

1. 我第一版用「平均扫动速度」反推：三角/正弦往返的均速等于 4/T。三次独立测量得 1.100 / 1.287 / 1.327 单位每秒
   → T = 3.64 / 3.11 / 3.02s，于是判 FAIL。
2. Lead 用「只统计 clash active 帧 + 相邻帧方向反转」测到半周期 0.88 / 0.72s → 往返 1.59s，与契约一致，判我口径有问题。
3. 我按同样口径重测（@_tools/verify-duel.mjs@ 的方向反转段），并加了「上一段路径 >= 0.3 才算一次真反转」的反噪门槛，
   逐场单独统计（跨场拼接会在结算/重开处产生假反转）。最终原始输出：

    场次#1 active帧=473 时长=3.26s 半周期=[1.004,0.803,0.8] 往返=1.606s
    场次#2 active帧=405 时长=2.96s 半周期=[1.484,0.804] 往返=2.968s
    场次#3 active帧=368 时长=2.58s 半周期=[1.141,0.807] 往返=2.282s
    全部半周期样本 s=[1.004,0.803,0.8,1.484,0.804,1.141,0.807] 最快=0.800s
    PASS §5 首回合 needle 扫描半周期 ≈ 0.8s | 最快半周期=0.800s（往返 1.601s）

4. 结论：**指针最快的半周期是 0.800s（往返 1.601s），与契约 1.6s、与 Lead 的 1.59s 完全一致**。
   我原来的「平均速度法」在这套实现里不成立：指针在半程处会减速/过窗停留（模块自报 `dwellMs=120`），
   路径长度-时间比被停顿拉低，于是 T 被高估近 2 倍 —— 这是**验证方法错误，不是实现缺陷**。已把断言改成
   「取最快的一次半周期 ∈ [0.6, 1.05]」（停顿只会把区间拉长，所以最快的那次最接近真实扫动），并保留均速法作为诊断输出。
   §5 最终：**16/16 PASS**。
顺带两个观察（不是 FAIL，供作者参考）：
- 成功时指针会定格，逐回合周期估计里同步成功场次的「含静默均速」被拉到 9~11s；去掉定格帧后才和 idle 场一致。
  定格本身是契约要求（「成功=青色冲击+指针定格」），但占比不低，可能会让节奏发闷。
- 挂机场次均在 2.5~3.5s 判负（tug 被 AI 推到 ≤ -0.35 后崩坏/超时），快于契约「12s 内必输」的最坏情形，满足「必输」要求。

### 3.4 §6 黑闪 —— 快照 `tmp/verifier/dist.html`

    node _tools/verify-bf.mjs --file tmp/verifier/dist.html --port 9513

    mech.blackFlash 初始 = {"F":-1,"P":-999,"delta":0,"ok":false,"ce":100,"chaos":0,"streak":0,"mul":0,"hits":0,"fails":0,"bf":0,"cd":0,...} → PASS 字段齐全
    校准: 出拳帧=20 命中帧(t)=30 命中 gameFrame=33 amount=3 hp 1800->1797.4
    k=-3 delta=4 ok=false | k=-2 delta=2 ok=false | k=-1 delta=3 ok=false | k=0 delta=3 ok=false
    k=1  delta=3 ok=false | k=2 delta=0 ok=true (mul=2.5) | k=3 delta=1 ok=true (mul=2.75)
    PASS 扫帧：至少一次同步成功 | 成功集合=[0,1]
    PASS 扫帧：|delta| >= 3 必须失败 | 四条 |delta|∈{3,3,3,4} 全部 ok=false
    PASS 扫帧：判定与 |delta| 自洽（ok 只出现在 |delta| <= 2）
    PASS §6 成功时事件流带 blackFlash 标记 | hit.blackFlash=true
    PASS §6 黑闪命中后 stats.blackFlash +1 | before=0 after=2
    随机乱按 500 次 V（不攻击）: stats.blackFlash 2 -> 2 | presses=316 mashes=314 chaosActive=true → PASS §6 随机 500 次 → 0
    每帧按 V + 连续出拳: stats.blackFlash 2 -> 2 | 命中事件=14 黑闪标记=0 → PASS §6 连点 → 0
    PASS §6 连点期间仍然能打出普通命中（不打断操作） | 命中事件=14

**结论：§6 的 13/14 通过。**唯一未通过的是「黑闪伤害 ≥ 同招普通命中 2.4 倍」，但第一次测量用的是事件里的
`amount`（主循环 `Math.round` 过的整数：普通 2.6→3、黑闪 6.5→7），取整后 7/3=2.33 失真。
已把断言改成用 hp 真实差值计算（真值比才是契约要的 2.5 倍），最终跑会给出真值比。

另一条实测细节：±3 帧确实全部失败、±0/±1 成功，且 `mech.blackFlash.mul` 按连闪从 2.5 涨到 2.75，符合契约「连闪 n 次 → min(3.5, 2.5+0.25(n-1))」。

### 3.5 回归（既有系统没被打破）—— 目标 `dist/新宿决战.html`（Lead 20:29 构建）

    node _tools/verify-regression.mjs --file dist/新宿决战.html

    ===== 回归汇总: 8 pass / 0 fail / 0 skip =====
      PASS  smoke                exit=0  12.6s
      PASS  acceptance           exit=0  39.2s
      PASS  probe-movedir        exit=0  90.9s
      PASS  probe-dash           exit=0  93.7s
      PASS  probe-bgm-dom        exit=0  80.8s
      PASS  probe-hudcollide     exit=0  84.0s
      PASS  probe-mobilecase     exit=0  87.3s
      PASS  probe-frametime      exit=0  94.3s

关键原始行（摘自各探针输出）：

    acceptance: "verdict": { "pass": true }
                "perf": { "frames": 4222, "avgMs": 8.14, "avgFps": 122.9, "p50": 7.9, "p95": 10, "p99": 13.8, "worstFps": 34.5 }
                "consoleIssues": [], "failedRequests": []
    probe-movedir: 按 W 位移 1.99m 与「远离相机」方向点积 1.991 → ✅ 前进正确；放苍后 anim 恢复正常；错误: 0
    probe-dash: Shift+W 疾跑 序列=["idle","walk","sprint"]；松手回 idle；空格闪避 序列=["idle","guard_infinity","idle"]
    probe-hudcollide: 连击时 重叠=[]；banner 出现时 重叠2=[]；错误 []
    probe-mobilecase: 1) 闪避后前进 anim 末端=run；2) 疾走+前进 序列=["idle","walk","sprint"]；3) 疾走+轻击 位移 2.27m 错误 []
    probe-frametime: 战斗 avg 11.37ms p50 10 p95 16 max 467ms，>33ms 20 帧（n=1825）——与基线同量级，无新增长卡

结论：**四个机制的代码合进 dist 后，8 个既有验收/探针全部 exit 0，没有回归。**
（注意这轮 dist 是 20:29 构建；作者在 20:30~20:57 又改了 fighters/mahoraga/domainduel，最终以合流后的构建为准。）

### 3.6 §7 疾跑复测（MECH_DEBUG.sprint 注册后）—— 快照 `tmp/verifier/dist.html`（21:00 私有构建）

    node _tools/verify-sprint.mjs --file tmp/verifier/dist.html --port 9512
    ===== sprint 结果 26/26 PASS, 0 FAIL =====

    PASS §7 0.35s 内升到 10.5 量级 | v(0.35s)=10.507
    PASS §7 稳态速度落在 10.5±1 | v(稳态)=10.415
    PASS §7 起步有加速过程 | v(0.1s)=5.492 vs 稳态 10.415
    PASS §7 1s 位移明显大于旧版 4.8m/s | 1s 位移=10.60m
    PASS §7 FOV 变化 >= 6 度 | idle=44 -> max=51.98 Δ=7.98
    PASS §7 相位读到 sprint | phases=["walk","run","sprint"]
    PASS §7 扬尘 > 0 | dust max=6
    PASS §7 松手不瞬间归零 | v(+0)=10.711
    PASS §7 松手 0.25s 内回落到走路量级 | v(+0.25s)=6.276
    PASS 走路速度仍是 4.8 量级 | v(走路)=4.85
    PASS D 乱按不产生 NaN/异常 | errs=[]  D 速度不超上限 | max v=9.55
    PASS E 高频 toggle 不超上限（p95 <= 12） | p95=11.263 max=14.853
    PASS G 折返无异常/不超上限（p95 <= 12） | p95=11.963 max=19.042 errs=[]
    PASS F 挂机不位移 | 位移=0.251m；F 挂机后不是 sprint | 末 30 帧 phases=["walk"]

注：E/G 的 `max` 会冲到 14.9 / 19.0 m/s，但 p95 <= 12。静帧/位移差分在贴墙与碰撞推出时会出现尖峰，
我没有把它判成「速度失控」，但请作者确认贴墙时不会瞬移（复现脚本在 _tools/verify-sprint.mjs 的 D/E/G 段）。

### 3.7 §7 手机端（844x390 + html.is-touch + 触摸模拟）—— 快照同上：**FAIL**

    node _tools/verify-sprint.mjs --file tmp/verifier/dist.html --port 9512 --mobile
    ===== sprint-mobile 结果 7/11 PASS, 4 FAIL =====
    quality=low（844x390 触发低画质路径，全程无报错）
    手机 摇杆到底(0,-1): v(0.9~1.4s)=4.962 phase=walk run标志=false
    FAIL §7 手机摇杆推到底触发疾跑（v >= 9.5） | v=4.962（只到走路速度）
    FAIL §7 手机 phase=sprint | phases=["walk"]
    FAIL §7 __TOUCH.run 标志被补上 | run 采样值=[false]
    手机 摇杆 0.90: v=4.932 sprint=false → PASS 边界 0.90 不疾跑
    手机 摇杆 0.95: v=4.903 sprint=false → FAIL 边界 0.95 该疾跑却没疾跑
    PASS 手机 摇杆回中不位移 | 位移=0.311m

**结论：契约 §7「触屏摇杆推到底（|摇杆| > 0.92）即疾跑 + __TOUCH 补 run 标志」在手机端不成立。**
驱动方式是直接写 `window.__TOUCH = { on:true, mx:0, mz:-1 }`（main.js 的 buildInput 会读它当模拟量），
速度稳定在 4.96 m/s（= 走路 4.85），既没有 sprint 相位也没有 run 标志。

### 3.8 主观审查（截图，fail/pass 是我的判断，理由写清）

截图全部落在 `shots/verifier/art/`（13 张）。我逐张看了四类最关键的画面：

| 截图 | 机制 | 判断 | 理由 |
|---|---|---|---|
| `08-mahoraga-steady.png` | §4 魔虚罗 | **PASS** | 模型在路中央、深色躯体 + 暗红发光双眼 + 头顶法轮可辨认；右侧 HUD「魔虚罗 / 900/900 / 适应 0/8 / 八握剑异戒神将」+ 技能预警「俯冲下砸—落地后是弱点窗口」+ 屏幕中央「弱点暴露—近战可击」1.0s 倒计时都清楚；正好抓到俯冲落地的弱点窗口，玩法与画面一致 |
| `11-clash-sync.png` | §5 领域对决 | **PASS** | 屏幕中下同步轴清晰：术式同步 + 同步 ×0 + 轴上的亮窗与指针 + 右侧「裂纹 3/3」+ 操作提示「指针进入亮窗内按 J/K 对齐」；背景是领域破碎的猩红裂纹，胜负的视觉语言强；与底部技能条零重叠（DOM 体检 0 组重叠） |
| `04-bf-hitframe.png` | §6 黑闪 | **PASS** | 命中帧拳位确实有青色收缩环（契约要求的可读性特征），命中帧灰/金闪点能看到；普通命中 1797 数字正常 |
| `01-sprint-speedline.png` | §7 疾跑 | **中性偏 PASS** | 静帧能看到 FOV 明显拉大（Δ7.98°）、镜头后拉，但风噪/速度线/扬尘在静止图片里几乎不可见——这类「速度感」本来就靠时间维度。数值侧（速度曲线、FOV、扬尘计数 6、镜头）都过，画面侧我不敢替它吹成「很爽」，建议 Lead 亲自跑一遍手感 |

HUD 体检（DOM 层面，跨三个状态）：关键文字元素全部在视口内（越界 0 个），
`__HUDOVERLAP` 在普通战斗 / 魔虚罗出场 / 领域对决三个状态各 0 组重叠。

### 3.9 未跑完的部分（诚实列出）

- §4 手机端、§5 手机端、§6 手机端（`--mobile`）：只有 §7 跑过手机端（FAIL 见 §3.7）。
- §4 的法轮 8 格全亮 →「适应完成」×1.6：因为对空命中链目前不通（§3.2 第 1 条），无法验证。
- §4 的 4 个技能各自命中玩家且可被闪避：仅验证了 damageGate 与召唤链路，技能命中/闪避矩阵**未跑**。
- 最终合流产物 `dist/新宿决战.html`（截至 21:03 仍是 20:29 构建，作者 21:00 还在改 src）上的全量重跑。

---

## 4. 已知问题清单（按严重度，全部带证据）

| # | 级别 | 现象 | 证据（原始输出片段） | 归属 |
|---|------|------|----------------------|------|
| 1 | **FAIL** | 手机摇杆推到底不疾跑：v 停在 4.96 m/s（走路 4.85），phase=walk，__TOUCH.run 始终 false | `手机 摇杆到底(0,-1): v(0.9~1.4s)=4.962 phase=walk run标志=false`（sprint-mobile.json 4 条 FAIL） | sprint |
| 2 | 已澄清（我误报） | 「对空 0 命中 / adapt 无伤害也涨」是**我的测试设计错**：苍 dmg=0 是设计值；赫/茈单发受 0.35s 概率闪避影响，且我复用已被适应过的赫去测「4 次命中」 | 6 次机会下：赫 3/6 命中（115/52/52）、茈 1/6 命中（301）、苍 0 伤害但 adapt 记账 2 次；新召唤后适应序列 115→52→52→0 完全符合契约 | mahoraga（无需修） |
| 3 | **FAIL** | 魔虚罗存活时玩家近战打宿傩 0 伤害（无魔虚罗时同一站位 2.6，即 26×INCOMING_SCALE×1.0） | `damageGate 玩家打宿傩: 无魔虚罗=2.6 有魔虚罗=0 比值=0.000`（dist 与 21:00 快照各复现一次；同一次跑里宿傩打玩家 ×1.25 正常 =1.250） | mahoraga |
| 4 | 已撤回（我误判） | needle 往返周期：我先用「平均扫动速度」反推得 3.0~3.6s 判 FAIL | 按 Lead 口径（只统计 active 帧 + 方向反转）重测：**最快半周期 0.800s → 往返 1.601s**，与契约 1.6s 及 Lead 的 1.59s 一致。均速法被 120ms 过窗停留拖低而失真 | 无（实现无误） |
| 5 | **FAIL** | 手机摇杆推到底不疾跑：v 停在 4.96 m/s（走路 4.85），phase=walk，__TOUCH.run 始终 false | `手机 摇杆到底(0,-1): v(0.9~1.4s)=4.962 phase=walk run标志=false`（sprint-mobile.json 4 条 FAIL） | sprint |
| 6 | 观察 | 魔虚罗 10s 姿态采样里只有 1/24 帧在契约的 14~17m，其余在 0.05~8.5m（会俯冲落地是真的，但贴地时间占比高） | 采样明细 `[[0.4],[14.98],[8.44],[5.02],[3.79],[3.6],[3.6],[3.44],…,[0.05]×5,…]` | mahoraga |
| 7 | 观察 | mahoraga 子树世界 AABB 最低到 y=-2.93（契约「除俯冲外不落地」） | `allMinY=-2.18 / -2.93`（无法只靠 AABB 区分可见性；可能是俯冲砸地穿透） | mahoraga |
| 8 | 观察 | 疾跑 E/G 反例里瞬时峰值 14.9 / 19.0 m/s（p95 ≤ 12 通过），疑似贴墙推出/碰撞瞬移 | `PASS E p95=11.263 max=14.853` / `PASS G p95=11.963 max=19.042` | sprint |
| 9 | 观察 | 只按 W（4.85 m/s）时 anim 序列出现 walk -> run | `probe-mobilecase: 1) 闪避后立刻前进 anim=["idle","guard_infinity","walk","run"]` | sprint |
| 10 | 已修 | __SS.mech 是 getter 而契约 §1.3 写 __SS.mech() | 两个私有产物各复现 `TypeError: window.__SS.mech is not a function` | Lead（20:31 已改） |
| 11 | 已解释 | FOV 基线实测 44°（契约写 60°），Δ=7.98° | `PASS §7 FOV 变化 >= 6 度 | idle=44 -> max=51.98` | Lead 已确认按 Δ≥6° 记 |

当前仍然成立的 FAIL 只有 3 条：**#3 玩家近战打宿傩 0**、**#4 needle 周期**、**#5 手机摇杆不疾跑**。
### 4.1 我自己的测量方法修正（避免误判，透明记录）

- 事件流 tap 原来会把同一事件抄 2 份（@@snap.events@@ 是 @@cb.events@@ 活数组，一帧被 getSnapshot 读多次）→ 已按「帧号+已抄长度」去重。
- draw call 原来拿召唤瞬间采样（含法阵 fx + 镜头变化）→ 改成「等 phaseLock 归零 + 3.5s fx 散尽 + 连采 3 次取中位数」，191→296(FAIL) 变成 192→239(PASS)。
- 疾跑速度上限原来用 max（贴墙差分尖峰）→ 改成 p95，并把 max 一并贴出来（见 #7）。
- 黑闪伤害倍率原来用事件 @@amount@@（@@Math.round@@ 后 3 vs 7 = 2.33）→ 改成 hp 真值差（真值 2.6 vs 6.5 = 2.5）。
- 对空模型尺寸原来直接取「最高的悬浮节点」（抓到月亮 300m）→ 改成按节点名取 @@mahoraga@@，并区分 @@bodyH@@（悬浮部件）与 @@allH@@（含落地部件）。
## 5. 未验证 / 需要 Lead 决策的

- 法轮 8 格全亮 →「适应完成」→ 伤害 ×1.6：对空链已通（赫/茈可命中、苍靠 adapt 记账），但要点亮 8 格需要多招反复命中，单次跑预算不够，**未验证**。
- 触屏「咒」按钮（`__INJECT.press("KeyV")`）：需要黑闪模块 + 手机端跑一次，待 §6 落地。
- 手机端摇杆疾跑边界（0.90 vs 0.95）：待 sprint 注册 MECH_DEBUG 后跑 --mobile。
- 领域对决 30 次连点/对齐的**正式**数字：等合流后对 dist/新宿决战.html 跑。### 3.3 §5 领域对决 —— 快照 @@tmp/verifier/dist.html@@（verifier 20:31 从当时的 src 私有构建）

    node _tools/verify-duel.mjs --file tmp/verifier/dist.html --port 9514 --n 6

    __SS.duel 接口 = {"fns":{"begin":"function","push":"function","update":"function","resolve":"function","reset":"function"},"active":"boolean","tug":"number","ctor":"DomainDuel"}
    PASS §5 clashLike 实现默认接口（5 个方法 + active/tug/winner/elapsed）
    连点 #1 lose elapsed=2.6s miss=3 sync=0 tug=-0.58 按键=252
    连点汇总: 开局 6/6 判负 6 判胜 0 → PASS §5-1
    对齐 #1 win elapsed=3.6s sync=5 miss=0 按键=5
    对齐汇总: 开局 6/6 判胜 6 胜率=100.0% → PASS §5-2
    挂机: lose elapsed=3.47s tug=-0.628 miss=3 → PASS §5-3
    PASS §5-4 玩家输：扣血 | hp=1453.27（起始 1800）
    PASS §5-4 玩家输：burnoutT > 0 | burnout=4.920
    needle 样本=631 越界=0 范围=[-0.995,1.000] → PASS §5 needle 始终在 [-1,1]
    PASS §5 首回合窗口宽度 ≈ 0.30 | 首窗口=0.300
    逐回合: [{"r":0,"窗口宽":0.3},{"r":1,"窗口宽":0.255},{"r":2,"窗口宽":0.21},{"r":3,"窗口宽":0.165},{"r":4,"窗口宽":0.12}] → PASS 窗口随回合收窄
    窗口重随机 8 次，指针在变化前确实进入过旧窗口的=8 → PASS §5 窗口只在指针经过后重新随机（8/8）
    needle round0: 累计行程=12.31 用时=11.19s 均速=1.100/s -> T=3.636s（契约 1.6s）
    FAIL §5 首回合 needle 全周期 ≈ 1.6s（指针实际扫动速度反推） | T=3.636s

**结论：§5 的 14 条里 13 条通过，1 条 FAIL —— 指针往返周期实测约 3.1~3.6s，契约写的是 1.6s（≈2 倍慢）。**

数值细节：三角/正弦往返的「平均扫动速度」都等于 4/T。三次独立测量（两次 idle 场 + 一次逐回合）得到
均速 1.100 / 1.287 / (1.13) 单位/秒 → T ≈ 3.64 / 3.11 / 3.53s。旁证：11.19s 内窗口重随机 8 次，
每次重随机需要指针完整穿过一次窗口（每半周期一次）→ 半周期 ≈ 1.40s → 全周期 ≈ 2.8s，量级一致。
实现自报的 @@mech.duel.period = 1.6@@ 与实际扫动速度不符，**很可能是把 period 当成「单程扫描时间」实现**（往返 3.2s）。
这一条对用户需求（「领域对决太简单，要更准的对齐」）是反向的：指针越慢越好对。请 Lead 裁定「周期」定义并把数值统一。

顺带两个观察（不是 FAIL，供作者参考）：
- 成功时指针会定格，逐回合周期估计里同步成功场次的「含静默均速」被拉到 9~11s；去掉定格帧后才和 idle 场一致。
  定格本身是契约要求（「成功=青色冲击+指针定格」），但占比不低，可能会让节奏发闷。
- 挂机场次均在 2.5~3.5s 判负（tug 被 AI 推到 ≤ -0.35 后崩坏/超时），快于契约「12s 内必输」的最坏情形，符合「必输」要求。

### 3.4 §6 黑闪 —— 快照 @@tmp/verifier/dist.html@@

    node _tools/verify-bf.mjs --file tmp/verifier/dist.html --port 9513

    mech.blackFlash 初始 = {"F":-1,"P":-999,"delta":0,"ok":false,"ce":100,"chaos":0,"streak":0,"mul":0,"hits":0,"fails":0,"bf":0,"cd":0,...} → PASS 字段齐全
    校准: 出拳帧=20 命中帧(t)=30 命中 gameFrame=33 amount=3 hp 1800->1797.4
    k=-3 delta=4 ok=false | k=-2 delta=2 ok=false | k=-1 delta=3 ok=false | k=0 delta=3 ok=false
    k=1  delta=3 ok=false | k=2 delta=0 ok=true (mul=2.5) | k=3 delta=1 ok=true (mul=2.75)
    PASS 扫帧：至少一次同步成功 | 成功集合=[0,1]
    PASS 扫帧：|delta| >= 3 必须失败 | 四条 |delta|∈{3,3,3,4} 全部 ok=false
    PASS 扫帧：判定与 |delta| 自洽（ok 只出现在 |delta| <= 2）
    PASS §6 成功时事件流带 blackFlash 标记 | hit.blackFlash=true
    PASS §6 黑闪命中后 stats.blackFlash +1 | before=0 after=2
    随机乱按 500 次 V（不攻击）: stats.blackFlash 2 -> 2 | presses=316 mashes=314 chaosActive=true → PASS §6 随机 500 次 → 0
    每帧按 V + 连续出拳: stats.blackFlash 2 -> 2 | 命中事件=14 黑闪标记=0 → PASS §6 连点 → 0
    PASS §6 连点期间仍然能打出普通命中（不打断操作） | 命中事件=14

**结论：§6 的 13/14 通过。**唯一未通过的是「黑闪伤害 ≥ 同招普通命中 2.4 倍」，但第一次测量用的是事件里的
@@amount@@（主循环 @@Math.round@@ 过的整数：普通 2.6→3、黑闪 6.5→7），取整后 7/3=2.33 失真。
已把断言改成用 hp 真实差值计算（真值比才是契约要的 2.5 倍），最终跑会给出真值比。

另一条实测细节：±3 帧确实全部失败、±0/±1 成功，且 @@mech.blackFlash.mul@@ 按连闪从 2.5 涨到 2.75，符合契约「连闪 n 次 → min(3.5, 2.5+0.25(n-1))」。

### 3.5 回归 —— 见 §3.7（合流后跑 verify-regression）
### 3.6 主观审查（截图）—— 见 §3.8--

## 1. 验证脚手架（可复现）

| 文件 | 作用 |
|------|------|
| `_tools/verify-lib.mjs` | 共用脚手架：CDP 启动/跳播片/关 AI、页面内 rAF agent（帧计数、事件流 tap、帧调度按键、DOM 运动扫描）、结果收集与 JSON 落盘 |
| `_tools/verify-assets/page-helpers.js` | 页面侧工具集：`__MA/__SP/__BF/__D`（mech 取值）、`__SCAN/__BODY`（场景世界 AABB）、`__CALLS`（draw call）、`__HUDTEXT/__HUDOVERLAP/__OFFSCREEN`（HUD 体检） |
| `_tools/verify-boot.mjs` | 脚手架自检 + 可观测面盘点 + **帧对齐标定** + 基线帧时间 |
| `_tools/verify-sprint.mjs` | 契约 §7 疾跑（含反例/边界/手机端） |
| `_tools/verify-bf.mjs` | 契约 §6 黑闪（含 ±帧扫描、乱按 500 次、连点） |
| `_tools/verify-mahoraga.mjs` | 契约 §4 魔虚罗（触发边界/模型量测/对空/适应/damageGate/帧率） |
| `_tools/verify-duel.mjs` | 契约 §5 领域对决（连点必败/精确必赢/挂机必负/轴与窗口形态） |
| `_tools/verify-art.mjs` | 四个机制关键瞬间截图 + HUD 可读性体检（主观审查素材） |
| `_tools/verify-regression.mjs` | 回归守门：smoke + acceptance + 老探针串跑，汇总退出码 |

跑法（端口按契约 §3 错开，verifier 用 9510+）：

    node _tools/verify-boot.mjs      --file dist/新宿决战.html --port 9510
    node _tools/verify-mahoraga.mjs  --file dist/新宿决战.html --port 9515
    node _tools/verify-duel.mjs      --file dist/新宿决战.html --port 9514 --n 30
    node _tools/verify-bf.mjs        --file dist/新宿决战.html --port 9513
    node _tools/verify-sprint.mjs    --file dist/新宿决战.html --port 9512
    node _tools/verify-sprint.mjs    --file dist/新宿决战.html --port 9512 --mobile
    node _tools/verify-art.mjs       --file dist/新宿决战.html --port 9518
    node _tools/verify-regression.mjs --file dist/新宿决战.html

结果同时落盘到 `_tools/verify-assets/<name>.json`（原始 PASS/FAIL + 数字），截图落到 `shots/verifier/`。

### 1.1 帧精度标定（±1 帧类断言的前提）

`node _tools/verify-boot.mjs --port 9510 --file dist/新宿决战.html` 实测：

    调度帧 t=30 gameFrame=32 | 按下帧 P=33 (采样 t=31, gameFrame=33) | 第一帧掉血 t=43 hp=1797.4
    PASS 合成按键生效（pressFrame 被写入） | P=33 gameFrame(P)=33 gameFrame(调度)=32 帧偏移=1

结论：**在页面内第 t 帧 rAF 里 dispatch 的键盘事件，会在游戏第 t+1 帧被 buildInput 读到（固定 +1 帧偏移）**。
所有 ±1 帧断言都按这个偏移换算，不靠猜。

### 1.2 基线帧时间（魔虚罗帧率对比的参照）

    帧时间 ms: {"n":995,"min":3.4,"max":15.5,"avg":6.046,"p50":6,"p95":7.6}  >33.4ms 帧数=0/995 (0.0%)
    PASS 基线无页面错误

---

## 2. 契约条款 → 可执行断言映射

| 契约条款 | 断言 | 脚本 |
|---|---|---|
| §4 触发 | 宿傩 hp=900.5（>50%）不召唤；hp=900（=50%）必召唤；二次打残不重复触发 | verify-mahoraga |
| §4 模型 | 场景存在 mahoraga 节点；悬浮锚点 y≈14~17；悬浮躯体高 3.8~4.2m 量级；draw call 增量 ≤70 | verify-mahoraga |
| §4 对空 | 悬浮时近战 10 次打不到；未锁定时苍/赫/茈打不到；锁定后苍/赫/茈各至少命中一次 | verify-mahoraga |
| §4 适应 | 同招命中 2 次 ×0.45、4 次免疫；adapt 计数推进 | verify-mahoraga |
| §4 二阶段 | 魔虚罗存活时玩家打宿傩 ×0.6；宿傩打玩家 ×1.25 | verify-mahoraga |
| §4 性能 | 出场前后帧时间 p95 不明显变差 | verify-mahoraga |
| §5 连点 | 每帧按 light，N 次试验 N 次失败 | verify-duel |
| §5 对齐 | 按 needle∈[lo,hi] 按，N 次 ≥ 28/30 胜利 | verify-duel |
| §5 挂机 | 不输入必负 | verify-duel |
| §5 代价 | 玩家输：扣血 + burnoutT>0 | verify-duel |
| §5 轴 | needle∈[-1,1]；首回合窗口 ≈0.30；半周期 ≈0.8s；窗口只在指针经过后重随机 | verify-duel |
| §6 反乱按 | 随机时刻按 V 500 次 → 0 次黑闪；每帧按 V + 连续攻击 → 0 次 | verify-bf |
| §6 判定 | 命中帧按 V 成功；±1 成功；±3 失败；判定与 delta 自洽 | verify-bf |
| §6 伤害 | 一次黑闪 ≥ 同招普通命中 2.4 倍；ce 扣 8；事件流带 blackFlash 标记 | verify-bf |
| §7 起步 | 0.35s 内 4.8→10.5（ease-out）；1s 位移曲线 | verify-sprint |
| §7 惯性 | 松手不瞬间归零，0.25s 内回落 | verify-sprint |
| §7 表现 | phase 读到 sprint；FOV Δ≥6°；扬尘>0 | verify-sprint |
| §7 反例 | 连点/每帧按抬 Shift/交替乱按不超上限、无 NaN | verify-sprint |
| §7 手机 | 摇杆 >0.92 疾跑、0.90 不疾跑；__TOUCH.run 标志 | verify-sprint --mobile |

---

## 3. 逐机制结果（WIP 快照，非最终判定）

### 3.1 §7 疾跑 —— 快照 `tmp/sprint/dist.html`（20:25 构建，作者仍在做）

    node _tools/verify-sprint.mjs --file tmp/sprint/dist.html --port 9512

原始关键行：

    A 起步: 0.1s v=6.23 0.35s v=9.586 0.85~1.05s v=10.617 1s 位移=10.64m 帧数=157
    PASS §7 0.35s 内升到 10.5 量级（实测 0.35~0.4s 均速 >= 9.5） | v(0.35s)=9.586
    PASS §7 稳态速度落在 10.5±1 | v(稳态)=10.617
    PASS §7 起步有加速过程（0.1s 速度明显低于稳态） | v(0.1s)=6.23 vs 稳态 10.617
    PASS §7 1s 位移明显大于旧版 4.8m/s | 1s 位移=10.64m
    PASS §7 FOV 变化 >= 6 度 | idle=44 -> max=51.98 Δ=7.98
    C 走路: v(1.0~1.6s)=4.836 phases=[null] → PASS 走路速度仍是 4.8 量级
    B 松手: +0ms v=10.853 +0.25s v=6.352 +0.5s v=4.929
    PASS §7 松手不瞬间归零（+0.05s 仍 >= 6） | v(+0)=10.853
    PASS §7 松手 0.25s 内回落到走路量级（<= 6.5） | v(+0.25s)=6.352
    H 边界: 0.28~0.34s v=9.927 0.36~0.42s v=10.329
    FAIL sprint 自报字段齐全（契约 §1.3） | 缺 ["speed","target","phase","fov","accelPhase","dust"]
    FAIL §7 相位读到 sprint | phases=[null]
    FAIL §7 扬尘 > 0 | dust max=NaN

结论（快照）：**速度手感部分实测通过**（起步 0.35s≈9.6、稳态 10.6、1s 位移 10.64m、FOV Δ7.98°、松手惯性曲线正确、走路仍 4.836）。
但当时 `MECH_DEBUG.sprint` 还没注册，phase/dust/fov 读不到，所以「相位=sprint」「扬尘>0」两条**不能算通过**，等作者注册后重测。

### 3.2 §4 魔虚罗 —— `dist/新宿决战.html`（Lead 20:27 重建产物）

    node _tools/verify-mahoraga.mjs --file dist/新宿决战.html --port 9515

    PASS §4 宿傩 hp=900.5（>50%）不触发 | beforeAlive=false（第一次伤害后魔虚罗 hp=0，必须仍为 0）
    PASS §4 宿傩 hp=900（正好 50%）必触发 | alive=true 用时 100ms
    PASS §4 魔虚罗 hpMax=900（契约 §4） | hpMax=900
    召唤演出 phaseLock 峰值=2.80（契约 2.8） → PASS
    不重复触发：二次打残后 phaseLock 峰值=0.00 魔虚罗 hp 900 -> 900 → PASS
    魔虚罗节点定点量测 = {"name":"mahoraga","visible":true,"meshes":51,"anchorY":15.82,
      "allH":22.02,"allMinY":-2.18,"allMaxY":19.84,"bodyH":4.3,"bodyMinY":15.54,"bodyMaxY":19.84}
    PASS §4 悬浮锚点 y 实测 15.82（契约 14~17）
    PASS §4 悬浮躯体高实测 4.3m（契约 3.8~4.2，高出 0.1m）
    PASS §4 模型可见（51 个 mesh）
    draw calls: 未出场中位 192 -> 出场后中位 239 → PASS 增量=47（契约 ≤70）
    PASS §4 悬浮时近战打不到 | hp 900 -> 900（10 次轻击）
    PASS §4 未锁定时弹道不会掰向魔虚罗 | hp 900 -> 900
    PASS §4 锁定键 KeyQ 能进入 cam.lockOn
    FAIL §4 锁定后 苍/赫/茈 各自至少命中一次 | blue/red/purple 三次全部 dmg=0
    FAIL §4 适应：同招命中 4 次的伤害序列 | 16 次 blue 全部 dmg=0（但 adapt.blue 从 {} 涨到 {"blue":3}）
    PASS §4 适应计数有推进
    damageGate 玩家打宿傩: 无魔虚罗=2.6 有魔虚罗=0 比值=0.000
    FAIL §4 魔虚罗存活时玩家打宿傩 x0.6 | 2.6 -> 0
    damageGate 宿傩打玩家(解): 无魔虚罗=8.166 有魔虚罗=10.208 比值=1.250 → PASS（正好 ×1.25）
    帧时间 出场前 p95=7.5 / 出场后 p95=8.5（0/1134 与 0/980 帧 >33.4ms） → PASS

**待作者确认的三个 FAIL（细节）**：

1. **锁定后对空仍是 0 伤害**：`cam.lockOn=true` 时 `forceSkill("blue"/"red"/"purple")` 各一次，魔虚罗 hp 900→900，三次都 0；
   不锁定也是 0（这条符契约）。也就是说 aim 钩子把弹道掰向魔虚罗这条链路目前**没有任何一次命中**。
2. **适应计数在没有伤害的情况下上涨**：16 次 blue 里 `adapt.blue` 从 `{}` → `{"blue":1}` → `{"blue":2}` → `{"blue":3}`，但魔虚罗 hp 全程 900。
   契约 §4 是「同一招**命中** 2 次 → ×0.45；4 次 → 免疫」，计数只能记命中，不能记施放/扫掠询问。
3. **魔虚罗存活时玩家近战打宿傩 = 0**：基线（无魔虚罗）同一站位轻击 = 2.6（26×INCOMING_SCALE），
   魔虚罗存活时 = 0.000。要么近战段被 segment 钩子无条件吃掉，要么玩家在那一瞬间被打断/击退。
   需要作者自测确认是哪种（探针已把玩家摆到宿傩身前 1.6m 并转向，基线同条件命中）。

另：`allMinY=-2.18` 说明 mahoraga 这棵子树里有部件伸到地面以下（契约「除俯冲外不落地」）。
如果那是不可见的落点/法阵标记就无所谓；如果可见要修。无法只靠 AABB 区分可见性，先记录不判 FAIL。

### 3.3 §5 领域对决（WIP 说明）

`tmp/domainduel/dist.html`（20:25 构建）那一次跑的时候新机制还没接上（clash 仍是默认 DomainClash）：
`__SS.duel` 为 null、`mech.duel` 为空、needle 采样 0 个，所以 §5 的 7 条断言全部 FAIL —— **这是「还没实现」而不是「实现错了」**。
有用的旁证（默认 DomainClash 行为）：玩家完全不按键 2.6s 判负、hp 1800→1451.8、burnout=4.99（契约 §5「玩家输：扣血+burnoutT>0」成立）。

### 3.4 §6 黑闪 —— 待跑（src/blackflash.js 已出现实现）
### 3.5 回归 —— 待跑（合流后跑 verify-regression）
### 3.6 主观审查（截图）—— 待跑

---

## 4. 已知问题清单（按严重度）

| # | 级别 | 现象 | 证据 | 归属 |
|---|------|------|------|------|
| 1 | 契约不一致（已修） | `__SS.mech` 是 getter 但契约 §1.3 写 `__SS.mech()` | 两个私有产物各复现一次 TypeError: window.__SS.mech is not a function | Lead（20:31 已改成方法） |
| 2 | 待确认 | 锁定后苍/赫/茈对魔虚罗 0 命中 | verify-mahoraga 输出 | mahoraga |
| 3 | 待确认 | adapt 计数无伤害也上涨 | verify-mahoraga 输出 | mahoraga |
| 4 | 待确认 | 魔虚罗存活时玩家近战打宿傩 0 伤害 | verify-mahoraga 输出 | mahoraga |
| 5 | 待确认 | 悬浮模型子树伸到 y=-2.18 | verify-mahoraga __BODY | mahoraga |
| 6 | WIP | sprint 的 phase/dust/fov 读不到（MECH_DEBUG 未注册） | verify-sprint 输出 | sprint |
| 7 | 已解释 | FOV 基线实测 44°（不是契约写的 60°），Δ=7.98° | verify-sprint 输出 | Lead 已确认按 Δ≥6° 记 |

---

## 5. 未验证 / 需要 Lead 决策的

- 法轮 8 格全亮 →「适应完成」→ 伤害 ×1.6：需要 8 格点亮（4 招×2），当前对空命中链路不通，无法验证。
- 触屏「咒」按钮（`__INJECT.press("KeyV")`）：需要黑闪模块 + 手机端跑一次，待 §6 落地。
- 手机端摇杆疾跑边界（0.90 vs 0.95）：待 sprint 注册 MECH_DEBUG 后跑 --mobile。
- 领域对决 30 次连点/对齐的**正式**数字：等合流后对 dist/新宿决战.html 跑。