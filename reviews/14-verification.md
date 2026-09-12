# 14 · 独立验证报告（task-6 / verifier）

> 验证者：teammate **verifier**。写域：`_tools/verify-*.mjs`、`_tools/verify-assets/*`、本文件。
> 原则：**不读实现代码判断对错**，只看契约（reviews/13-mechanics-contract.md §4/§5/§6/§7）
> 与可观测行为（`window.__SS` / `__SS.mech()` / DOM / 截图 / hp 数值 / 场景世界 AABB）。
> 全程 **未修改 src/** 任何一个字节**（只新增 `_tools/verify-*.mjs` 与 `_tools/verify-assets/page-helpers.js`）。

最后更新：WIP 阶段（四个机制作者仍在写）。**合流完成后本文档会重跑并覆盖为最终结论。**

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
    needle round0: 累计行程=12.31 用时=11.19s 均速=1.100/s -> T=3.636s（契约 1.6s）
    FAIL §5 首回合 needle 全周期 ≈ 1.6s（指针实际扫动速度反推） | T=3.636s

**结论：§5 的 14 条里 13 条通过，1 条 FAIL —— 指针往返周期实测约 3.1~3.6s，契约写的是 1.6s（≈2 倍慢）。**

数值细节：三角/正弦往返的「平均扫动速度」都等于 4/T。三次独立测量（两次 idle 场 + 一次逐回合）得到
均速 1.100 / 1.287 / 1.133 单位每秒 → T ≈ 3.64 / 3.11 / 3.53s。旁证：11.19s 内窗口重随机 8 次，
每次重随机需要指针完整穿过一次窗口（每半周期一次）→ 半周期 ≈ 1.40s → 全周期 ≈ 2.8s，量级一致。
实现自报的 `mech.duel.period = 1.6` 与实际扫动速度不符，**很可能是把 period 当成「单程扫描时间」实现**（往返 3.2s）。
这一条对用户需求（「领域对决太简单，要更准的对齐」）是反向的：指针越慢越好对。请 Lead 裁定「周期」定义并把数值统一。

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

### 3.5 回归 —— 见 §3.7（合流后跑 verify-regression）
### 3.6 主观审查（截图）—— 见 §3.8

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