# D · 联机对战技术方案考据（两人同房间 · 房间号 PK）

> 结论先行：**两人对战、60fps、物理简单（胶囊体 + 线段判定）这个规模下，最务实的选择是
> 「WebRTC DataChannel 直连 + 一方当主机（host-authoritative）+ 固定 60Hz 逻辑帧 + 客机本地预测」**，
> 房间号匹配用**免费信令**解决（v0 连信令都能省掉：手动交换连接码）。
> 不需要自建游戏服务器、不需要域名、可以继续留在 Cloudflare Pages 上，边际成本 0。
> 真正的工作量不在网络，而在**把现在这个可变时间步、到处 Math.random 的单机循环，改造成能复现的逻辑层**。

本文只写方案与来源，不改任何代码。文中所有"不确定"的地方都单独标注，请勿当成既定事实。

---

## 0. 结论速览（TL;DR）

| 问题 | 结论 |
|---|---|
| 要不要自建信令服务器？ | **不必。** v0 用"手动交换连接码"（复制粘贴/二维码）零后端；要房间号自动匹配时，用免费额度的 Cloudflare Worker + Durable Object 或 PeerJS 云服务。 |
| 用云房间服务器吗？ | 只有做**服务器权威**或**自动匹配**才需要。Supabase Realtime / Durable Objects / PartyKit 的免费额度对 2 人 1 房完全够用；Colyseus / Nakama 自建属于过度工程。 |
| 权威模型？ | **主机权威（host = 玩家 A 的浏览器）**。只有主机跑判定。作弊面比全客户端模拟小得多，代价是主机优势 + 主机掉线即结束。 |
| 同步方案？ | 状态同步（主机快照 + 客机本地预测），**不是**帧同步/回滚。理由见 §3.6：本项目当前做不到确定性。 |
| 输入延迟预算？ | 目标：本地操作 0 帧附加延迟（客机靠预测），命中判定滞后 = RTT/2 + 2 帧 ≈ 60~120ms。超过 ~150ms 的对手建议提示"网络不佳"。 |
| 能继续用 Cloudflare Pages 吗？ | **能**，静态站 + wrangler pages deploy 部署流程不用改（`deploy/publish.mjs --target cloudflare-pages`）。只有加"云信令/权威服务器"时才需要额外一个 Worker。 |
| 要域名/证书吗？ | 不需要。`*.pages.dev` 自带 HTTPS；WebRTC 与 Service Worker 都要求安全上下文（HTTPS 或 localhost）。 |
| TURN 免费额度够吗？ | Metered Open Relay 免费 **20 GB/月**；估算 2 人对战约 20~50 kB/s，够 **110~280 小时**中继时长。详见 §4.4。 |

---

## 1. 现状前提（这份方案是针对"这个工程"写的）

先把现有工程的联机相关事实列出来，后面每一条建议都对应这里的某一行：

| 事实 | 位置 | 对联网的含义 |
|---|---|---|
| 主循环是**可变时间步**：dt 直接来自 rAF，clamp 到 0.1s，sdt = dt * scale | src/main.js 的 loop2()（约 960~1000 行） | 没有"帧"概念 → 必须先引入固定步长累加器 |
| hitstop 把 scale 置 0、slowmo 置 0.22 | 同上 | 时间轴会被事件改写，回放/重演必须把这两个也纳入逻辑 |
| 逻辑与渲染写在同一帧里：city.update / combat.update / gojo.update / fx.update / render.* | 同上 | 逻辑层与表现层要拆开，否则两边永远对不齐 |
| 输入是"每帧采样一次"的快照对象 inputSnapshot，含 moveX/moveZ 模拟量与 12 个按键位 | src/main.js 的 buildInput()（约 903~954 行） | 输入已经是**可序列化的纯数据**，这是最好的消息，直接能进网络包 |
| 输入里含 camX/camY、mouse.x/y | 同上 | 相机相关的输入**不能**发给对手（属于本地表现），要过滤 |
| 触屏走 window.__TOUCH（模拟量）+ 合成 KeyboardEvent，调试注入走 window.__INJECT | src/mobile.js、src/main.js | 联机输入层应当从**同一处**取（buildInput 的结果），不要再开第二个入口 |
| Math.random() 共 52 处，其中逻辑相关：combat.js:2171（AI 防御判定）、combat.js:3 的 rand()；其余多为特效/程序化贴图 | src/combat.js、src/fighters.js、src/fx.js 等 | 特效随机不影响公平（各自随机即可）；**AI 与判定随机必须可控** |
| 已有可播种 RNG 实现（mulberry32） | src/city.js:103、src/audio.js:17、src/cutscene.js:6 | 直接复用，联机时由主机下发种子 |
| 已有"帧号"意识：黑闪判定用 cb.frame 而不是时间（因为 hitstop 期间 dt=0 时间会停、帧号不会） | src/combat.js:2343 附近注释、src/contract.js | 这条设计直觉是对的，联机时把它推广成"逻辑帧号"即可 |
| 已有快照出口 combat.getSnapshot()，但**只有 HUD/相机需要的字段**（hp/ce/anim/animT/phase/cd…），**没有位置与速度** | src/combat.js:2876 | 网络快照需要新增字段（位置/速度），不能直接复用 |
| 单文件产物 = src/manifest.json 列出的模块按序拼进一个 IIFE，共享作用域 | build/build.mjs、src/manifest.json | 新增 netcode.js 只需加进 manifest，顺位放在 main.js 之前；**不能改别人的文件** |
| 触屏端切后台会**自动按 Escape 暂停** | src/mobile.js:931 | 联机时"暂停"必须变成双人协商，否则对手那边就卡住了 |
| 部署链已经支持 Cloudflare Pages | deploy/publish.mjs:109 | 静态托管不用动 |

---

## 2. 可选架构对比

### 2.1 纯 P2P：WebRTC DataChannel + 免费信令

**是什么。** 两个浏览器通过 RTCPeerConnection 建立直连，游戏数据走 RTCDataChannel。浏览器里**没有裸 UDP socket**，DataChannel 是浏览器唯一能拿到的"类 UDP"通道：默认可靠有序（SCTP over DTLS），但可以配置成不可靠/无序（maxRetransmits / maxPacketLifeTime / ordered:false）——这正是实时游戏想要的模式。
- MDN《RTCDataChannel》：https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- MDN《WebRTC protocols》（ICE / STUN / NAT / TURN）：https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols

**要不要自建信令服务器？** 这是本节唯一真正的决策点。三条路：

| 方案 | 后端成本 | 体验 | 适用 |
|---|---|---|---|
| **A. 手动交换连接码**（offer/answer 压缩成一段文本，聊天发过去） | 0，完全静态 | 玩家要复制粘贴 1~2 次，做不到"输入房间号即进" | v0 验证网络层、内部测试、两人已经开着语音 |
| **B. 免费云信令**（PeerJS 公共 PeerServer；或 Supabase Realtime / Firebase 的房间表） | 0（公共服务器有可用性风险） | 输入 6 位房间号即进 | 想马上有"房间号"体验、能接受第三方依赖 |
| **C. 自己的极简信令**（Cloudflare Worker + 一个 Durable Object 存房间） | 免费额度内（10 万请求/天） | 稳定、可自己控房间码生命周期、可顺手加 TURN 凭据下发 | 长期方案 |

PeerJS 官方说明其提供免费云 PeerServer，也可以自建：https://peerjs.com/

**优点**
- 数据不经过任何业务服务器，**零带宽成本**，延迟只有你和对手之间的物理 RTT。
- 页面继续是纯静态，Cloudflare Pages 一行不用改。
- 主机权威模式下，**不需要写任何服务器端游戏逻辑**。

**缺点 / 代价**
- **必须有信令**（WebRTC 规范如此），所以"完全没有任何后端"只在方案 A 成立。
- **NAT 穿透不是 100% 成功**：企业网、校园网、部分移动网络下要靠 TURN 中继，中继会引入额外跳数与流量成本（§4.4）。
- 主机优势：主机 0 延迟，客机受 RTT 影响；主机掉线/关标签页 = 对局结束。
- 无中心记录：没有排行榜、没有回放存档、没有反作弊。
- 浏览器后台标签页会被节流（rAF 掉到约 1Hz），**心跳不能挂在 rAF 上**。

**成本 / 可行性**：两周内可做出"能打"的版本；难度集中在逻辑层改造，不在这条链路的建立。可行性：**高**。

---

### 2.2 云服务房间服务器

| 服务 | 免费额度（截至本文核对时） | 形态 | 优缺点 | 对本项目的适配 |
|---|---|---|---|---|
| **Cloudflare Durable Objects** | Workers 免费版 **10 万请求/天**、**13,000 GB-s/天**；免费版只能用 SQLite 存储后端；超限当天该类操作**直接报错**（次日 00:00 UTC 重置） | 有状态 WebSocket 服务端 | 优点：和 Pages 同厂、WebSocket Hibernation 能大幅省 duration、延迟低。缺点：需要额外一个 Worker 项目（DO **不能**在 Pages 项目里创建），要写服务端代码 | ★★★★★ 长期首选（既能做信令，也能做权威服务器） |
| **PartyKit** | 个人版免费（部署到其平台）；商业版"也免费"**前提是部署到你自己的 Cloudflare 账户** | 房间抽象（PartyServer） | 优点：房间模型开箱即用，2024 年被 Cloudflare 收购。缺点：平台归属有不确定性；本质仍是 CF 之上的一层 | ★★★★ 想做云权威时最省事的入口 |
| **Colyseus** | 框架 MIT 开源、自建免费；托管 Colyseus Cloud **15 美元/月起** | Node.js 权威服务器框架 + 状态同步 | 优点：权威服务器、matchmaking、状态同步齐全。缺点：要自己跑 Node 进程（VPS/容器），对 2 人房是重度工具 | ★★ 除非将来要做大厅/排位 |
| **Nakama** | OSS 自建免费；Heroic Cloud 为付费托管 | 完整游戏后端（账号/匹配/存储/排行） | 优点：功能最全。缺点：Go 服务 + 数据库，运维门槛最高 | ★ 过度工程 |
| **Supabase Realtime** | 免费版：**200 并发连接、100 消息/秒、100 channel join/秒、单 channel 广播 payload ≤256 KB** | Postgres + 广播/Presence | 优点：几行代码就能当信令/房间表用、有 SQL 管房间。缺点：广播经其服务器（非 P2P），免费版每秒 100 条消息对 60Hz 输入流偏紧；200 连接 = 最多 100 个 2 人房 | ★★★ 最省事的"先跑起来"信令方案 |
| **Firebase RTDB** | Spark 免费档：数据库存储与下载有免费额度（超出后按量计费，下载约 1 美元/GB 量级）；**并发连接数有上限**（免费档通常为 100 量级，本文未逐字核对到官方表） | 星型同步数据库 | 优点：上手最快（一个 set() 就能同步）。缺点：星型拓扑 = 所有输入都绕 Google 一趟，延迟与费用都不划算；按连接/流量计费 | ★★ 原型可以，正式不建议 |

来源：
- DO 计费与免费额度：https://developers.cloudflare.com/durable-objects/platform/pricing/
- Workers 计划与限制：https://developers.cloudflare.com/workers/platform/pricing/ ｜ https://developers.cloudflare.com/workers/platform/limits/
- DO 的 WebSocket Hibernation：https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Pages Functions 绑定 DO（注意 DO 必须单独建 Worker）：https://developers.cloudflare.com/pages/functions/bindings/
- PartyKit 官网/定价：https://www.partykit.io/ ｜ 被 CF 收购：https://blog.cloudflare.com/cloudflare-acquires-partykit/
- Colyseus：https://colyseus.io/ ｜ https://colyseus.io/pricing/
- Nakama：https://heroiclabs.com/pricing/
- Supabase Realtime 配额：https://supabase.com/docs/guides/realtime/quotas
- Firebase 定价：https://firebase.google.com/pricing

**一句话对比**：云房间服务器解决的是"**怎么让两个人找到彼此**"（信令/匹配）和"**谁来判定**"（权威），它对"两人对打"这件事本身没有任何带宽上的好处——**对局数据最好还是直连**。

---

### 2.3 权威服务器 vs 主机（host）权威

| | 主机权威（P2P 中的一方当服务器） | 专用权威服务器 |
|---|---|---|
| 谁跑判定 | 玩家 A 的浏览器 | 云上一台进程/DO |
| 客机输出去向 | 直连主机 | 服务器 |
| 延迟 | RTT/2（两人之间） | 各自到服务器的 RTT |
| 作弊面 | 主机可改一切；客机只能改自己的输入（**主机必须校验输入**） | 服务器说了算，客户端只能骗自己 |
| 掉线影响 | 主机掉线 = 对局结束 | 服务器在，可重连/换人 |
| 带宽成本 | 0（不经过服务器） | 服务器出口带宽（中继模式还要吃 TURN/SFU 额度） |
| 工程量 | 中（要在游戏里加"我是权威"的分支） | 大（服务端逻辑、部署、扩缩容） |
| 适合 | 朋友对战、同人作品、演示 | 排位赛、有奖励的经济系统 |

**推荐**：**先用主机权威**，但从第一天起就把"权威逻辑"写成不依赖 window、不依赖渲染、不吃全局可变状态的一块（§6），这样将来要换成服务器权威，是把这块代码搬到 Worker/Node 里，而不是重写游戏。

**不确定**：Cloudflare Durable Objects 能不能撑 60Hz 的权威模拟（每个 DO 单线程、消息按条计费）——按免费额度推演是不够的（§5.1 有量化），但没有实测；建议只把 DO 当信令。

---

## 3. 同步方案：状态同步 vs 帧同步（这一节是全文重点）

### 3.1 两种路线的本质

- **帧同步 / 确定性锁步（lockstep）**：只传输入，两端各自用同一份逻辑跑出相同结果。带宽与实体数量无关（Gaffer on Games: https://www.gafferongames.com/post/deterministic_lockstep/ ），**但前提是"完全确定性"**——同样的输入必须逐位产生同样的状态。
- **状态同步（snapshot / host-authoritative）**：一方跑逻辑，把结果（位置、血量、状态）发给另一方，另一方只负责表现与本地预测。

### 3.2 本项目做帧同步的真实难度（关键判断）

1. **可变时间步**。sdt = dt * scale，dt 来自 rAF，60/120/144Hz 各不相同，还有 hitstop（scale=0）、slowmo（0.22）。不同帧率下同一段输入产生的轨迹本来就不同。
2. **浮点非确定性**。ECMAScript 规定 + - * / 与 Math.sqrt 是精确 IEEE 754（每条运算单独舍入），但 Math.sin / cos / tan / exp / pow / log 是**实现近似**，V8 用 fdlibm 移植版且历史上换过实现，SpiderMonkey / JavaScriptCore 各有各的——Chrome 和 Safari 上同一个旋转角度可以差最后几位。参考：
   - Gaffer on Games《Floating Point Determinism》：https://gafferongames.com/post/floating_point_determinism/
   - 《Deterministic Lockstep in Browser Games》（含"哪些 Math 函数可以信赖"的具体列举）：https://simplified.media/guides/deterministic-lockstep
3. **Math.random 无法播种**（引擎相关、每个 realm 独立、回滚重放会二次消耗随机数）。本项目逻辑路径上至少有 AI 防御判定用到它（src/combat.js:2171），好在工程里已有 mulberry32 可复用的确定性 RNG。
4. **动画与冷却以时间驱动**（animT、cdOf() 等），时间又受 hitstop 改写；判定必须落在**帧号**上才可复现（工程里黑闪那段注释已经悟到这一层）。
5. 帧同步一旦漂移，**越打越歪**：一个 bit 在第 400 帧分叉，第 460 帧就会看见（同上 simplified.media 一文）。

### 3.3 回滚（rollback / GGPO 思路）

GGPO 的定位是"零输入延迟的 P2P 回滚网络库"，做法是：本地输入立即执行，远端输入未到时**先预测**，等真输入到达后**回滚到那一帧重演**（https://www.ggpo.net/）。
- 优点：本地无附加延迟，手感与单机几乎一致——这是格斗游戏公认的"正确解"。
- 代价：**必须有确定性 + 可快照/可恢复的状态**。回滚要保存每一帧的状态（或至少保存足够重建的历史），并能在 1 帧预算内重演若干帧（16.7ms 内做完 N 次模拟）。本项目的状态分散在 combat.js / fighters.js / mahoraga.js / domainduel.js / fx.js 的闭包里，**没有统一的 state 结构，也没有 save/restore**。
- 结论：**回滚不属于第一版**。但要在第一版就把"逻辑帧"、"输入包"、"逻辑状态可导出"这三件事做出来，回滚才有落脚点。

### 3.4 延迟补偿

- **客机本地预测（client-side prediction）**：客机按下"前进"立刻本地移动自己，不等主机。位移类操作预测效果好（位置修正用平滑插值，别瞬移）；**出招/命中不要本地预测**——让主机的判定说话，客机表现层提前播个"起手"动画即可。
- **主机侧输入缓冲**：主机收到客机输入后，**不要**立刻用；放进按帧号排序的缓冲，等到"该帧播放"（典型 1~2 帧）再消费。抖动（jitter）比平均延迟更伤人：平均 30ms / 抖动 60ms 的移动网络比稳定 80ms 的宽带更难受。
- **快照插值**：客机把收到的快照排进 100ms 左右的小缓冲，渲染时插值，网络抖动就不会表现为画面抖动。
- **不同步就硬拉回来**：客机预测位置与主机快照差 > 0.5m 时平滑收敛；差 > 3m（丢包太久）时瞬移并闪一下提示，不要长时间"各打各的"。

### 3.5 输入延迟预算（60fps = 16.7ms/帧）

| 场景 | RTT | 客机附加缓冲 | 客机"看到命中"滞后 | 手感判断 |
|---|---|---|---|---|
| 同机 / 局域网 | < 5ms | 1 帧 | ~20ms | 与单机无异 |
| 同城宽带 | 10~25ms | 1 帧 | 30~45ms | 基本无感 |
| 跨省 | 30~60ms | 1~2 帧 | 50~95ms | 可玩，连招要适应 |
| 跨国 / 4G | 150~300ms | 2~3 帧 | 180~350ms | 明显迟钝，建议提示"网络不佳" |

**结论性建议**：把"输入延迟"做成可调（0/1/2 帧）并显示在设置里，默认 1 帧 + 客机预测。**不要**为了"公平"给主机也加延迟——主机优势对朋友对战不是问题。

### 3.6 对"两人 / 60fps / 胶囊体 + 线段判定"的最终推荐

> **主机权威的状态同步 + 固定 60Hz 逻辑帧 + 客机本地预测 + 1 帧输入缓冲。不做确定性锁步，不做回滚。**

理由（按重要性排序）：
1. **判定量小且便宜**：命中就是"线段 vs 胶囊体的最短距离"（src/combat.js 的 HitResolver.segmentHitsTarget，CAPSULE_R = 0.72），主机一个人算，CPU 成本可以忽略——**没必要让两个浏览器各算一遍再赌它们算得一样**。
2. **只有两个玩家**：帧同步省带宽的优势在这里毫无价值（输入包本来就只有十几字节），而它带来的确定性负担是实打实的。
3. **工程现状决定成本**：可变时间步 + 52 处 Math.random + 闭包式状态，走确定性路线的改造量远超"加一层快照同步"。
4. **可演进**：主机权威不排斥回滚。等固定帧、输入包、状态导出做好了，再决定要不要为了手感升级到"客机也预测对手 + 回滚"——那时改的是客机的预测层，不是游戏逻辑。

---

## 4. 房间号匹配、重连、观战、中继

### 4.1 房间码生成与加入流程

**推荐形状**（主机权威下，房间 = 主机的会话）：

1. **建房（主机）**：生成 6 位房间码（字符集去掉易混的 0/O/1/I，例如 ABCDEFGHJKLMNPQRSTUVWXYZ23456789，约 32^6 ≈ 10 亿组合），同时生成一个 **joinSecret**（随机 token，用于重连身份认证——房间码本身是可猜的，不能当身份）。
2. **登记**：把 {roomCode, joinSecretHash, hostOffer/peerId, createdAt, ttl} 写进信令层（方案 A 就写进那段文本；方案 B 写进 Supabase 表或 PeerJS ID 约定；方案 C 写进 Durable Object）。
3. **加入（客机）**：客机输入房间码 → 从信令层换到主机的连接信息（SDP/ICE）→ 建立 RTCPeerConnection → createDataChannel("game", { ordered:false, maxRetransmits:0 }) → 等 readyState === "open"（**连接建立前 send 的数据会被丢弃**）。
4. **握手**：交换 {protoVersion, rulesHash, seed, side}。
   - protoVersion 必须校验，否则旧版本的 HTML 和新版本对战 = 规则不同。
   - rulesHash：把 SKILL_DATA（伤害/CD/射程）等规则表哈希一下，不一致直接拒绝开局并提示刷新页面。
5. **开局**：主机定 seed（复用 mulberry32）+ 起始帧号，广播 start；双方在同一逻辑帧号开始。
6. **防撞码**：房间码要有 TTL（例如 60 秒未加入即失效）与"已被占用"标记，避免两个客机抢同一个房。

**不确定**：6 位房间码在"同时在线房间数很少"时几乎不会碰撞，但**如果不做服务端唯一性检查，理论上会撞**。建议生成时让信令层查重（方案 A 由人肉保证）。

### 4.2 断线重连

- **心跳**：每 250~500ms 一个 ping（走可靠通道），3 秒无响应判"可疑"，6 秒判"掉线"。**心跳不能挂在 rAF 上**——标签页切到后台时 rAF 会被节流，会让健康的连接被误判。用 setInterval 或 Worker 定时器，并配合 document.visibilitychange 提示。
- **保留状态**：掉线后主机把房间状态**保留 30~60 秒**（不立刻判负），期间冻结逻辑帧（两人都冻结，不能主机自己继续跑）。
- **重连**：客机带 joinSecret 重连，主机校验后从"当前帧 + 快照"恢复它——这也是为什么**快照要能表达完整可玩状态**（位置/速度/血量/能量/状态机/冷却/领域态），而不只是 HUD 字段。
- **重连失败**：超时判负（或回标题），并且**在 UI 上明确写清是谁掉了**，否则玩家会以为是游戏卡死。
- **工程现状相关**：触屏端切后台会自动发 Escape 暂停（src/mobile.js:931）。联机模式下这个行为要改成"请求暂停"，等对方同意。

### 4.3 观战

- 观战本质是"再来一条 DataChannel，只收快照、不发输入"。主机按 10~20Hz 发快照即可（观战不需要 60Hz）。
- 代价：主机的上行会被放大（乘上观战人数）。两人对战 + 1 个观战者仍然很小，但**如果连接走 TURN 中继，主机的中继流量会翻倍**，要先看额度。
- **最小可行**：第一版不做观战；把"快照是纯数据、可多播"这件事设计进去，第二版加一个 observers 列表即可。
- **不确定**：如果观战要"延迟 30 秒防直播偷看"，那需要主机侧存快照环缓冲，属于第二期。

### 4.4 NAT 穿透失败时的中继（TURN）

- **STUN**：让双方发现自己的公网地址，免费（Google 公共 STUN stun:stun.l.google.com:19302，Cloudflare 也提供 STUN）。建议同时配 2 个，一个挂了还有备份。
- **TURN**：直连失败时唯一兜底，**数据全程过中继**，因此同时吃"带宽"和"延迟"。
  - **Metered Open Relay**：文档写明"**每月 20 GB 免费 TURN 用量**"，凭据通过其 REST API 下发。来源：https://www.metered.ca/tools/openrelay/
  - **Cloudflare Realtime TURN**：**与 Realtime SFU 一起用时免费**，否则 **0.05 美元/实时 GB**（Cloudflare → TURN 客户端方向）。来源：https://developers.cloudflare.com/realtime/turn/
  - **自建 coturn**：开源、可控，但需要一台有公网 IP 的服务器（这就是"唯一需要花钱"的那一项）。https://github.com/coturn/coturn
- **额度够不够（粗算，需实测校准）**：
  - 每人对局流量 ≈ 输入包（60Hz × 约 40B 含包头）+ 快照（20~30Hz × 约 64~128B）≈ **20~50 kB/s（双向合计）**。
  - 20 GB ÷ 40 kB/s ≈ **约 140 小时**的中继时长；按区间 20~50 kB/s 算约 **110~280 小时**。
  - 结论：**免费额度对"朋友对战"绰绰有余**；但**如果同时开语音聊天**，音频会成为大头，额度会迅速见底（这条是常识判断，未做实测）。
- **要不要预先配 TURN**：要。直连失败如果没有 TURN，表现是"输入房间号后一直转圈"，玩家无法自救。建议在 UI 上暴露"直连/中继"状态（pc.getStats() 里看 candidate 类型），出问题时能一眼看出是网络问题。

---

## 5. 成本与门槛

### 5.1 免费额度够不够

| 项目 | 需要吗 | 免费额度 | 这个游戏的实际消耗 |
|---|---|---|---|
| 静态托管（Cloudflare Pages） | 已有 | Pages 免费，*.pages.dev 自动 HTTPS | 不变；对局数据不走 Pages |
| 对局带宽（P2P 直连） | — | — | **0**（不经过服务器） |
| TURN 中继（穿透失败时） | 建议配 | 20 GB/月（Metered） | 直连为主时几乎用不到；全中继约 110~280 小时/月 |
| 信令（Worker + Durable Object） | 房间号自动匹配时才要 | 10 万请求/天、13,000 GB-s/天 | 每局建房/加入各几次请求，可以忽略 |
| 权威服务器 | 只有反作弊/排位才要 | 同上 | 60Hz × 2 人 = 每秒 120 条 WebSocket 消息，**会很快吃满 10 万/天**（约 14 分钟/天）——这是"不要用 DO 转发对局数据、只做信令"的量化理由 |

### 5.2 需要不需要写后端 / 域名 / 证书

- **v0 完全不需要后端**（手动交换连接码）。
- **v1 想要"输入房间号即进"**：需要一个极简信令服务。可选"完全不自建"路线（PeerJS 公共服务器 / Supabase Realtime 房间表），也可以自建一个约 100 行的 Cloudflare Worker + DO。
- **域名/证书**：不需要。*.pages.dev 已经是 HTTPS；WebRTC 与 Service Worker 都要求安全上下文（HTTPS 或 localhost），**用 file:// 打开单文件版是连不上对战的**（Service Worker 也会失效，deploy/README.md 已经为此警告过）。
- **能不能继续部署在 Cloudflare Pages**：**能**。只有在引入 Worker/DO 时，才需要额外部署一个 Worker 项目（DO 不能在 Pages 项目内创建，见 https://developers.cloudflare.com/pages/functions/bindings/ ）。

### 5.3 最小可行方案（步骤级）

> 目标：**这一版不加任何后端**就能让两个远端的浏览器打起来；房间号体验放到 v1。

**阶段 0（半天）· 逻辑帧与输入包——不联网也能验收**
1. 主循环改固定步长：acc += min(dt, 0.1)，然后 while (acc >= 1/60) { stepLogic(1/60); acc -= 1/60; }；逻辑内禁止再用 rAF 的 dt；hitstop/slowmo 改成"逻辑帧计数"而不是秒。
2. 定义可序列化输入包：{f, moveX, moveZ, bits}（bits 把 light/heavy/blue/red/… 位压进 2~3 字节），帧号 f 单调递增。
3. 自测：同一串输入包喂给两个标签页的"影子逻辑"，逐帧对比位置哈希（这是唯一的确定性验收手段）。

**阶段 1（1~2 天）· 消灭不可复现来源**
4. 把逻辑路径上的 Math.random 换成可播种 mulberry32（工程里已有实现），种子由主机在握手时下发。
5. 逻辑路径里禁用/替换 Math.sin/cos/tan/pow/log（改查表），保留 + - * / sqrt（这些是精确 IEEE 754）。
6. 每次改完跑一遍"输入回放一致性"脚本，不一致就 diff。

**阶段 2（2~3 天）· 拆层**
7. 拆出 **sim 层**（位置/速度/血量/能量/状态机/冷却/命中判定）与 **view 层**（fx、音频、相机、屏幕特效、粒子）——view 层可以有随机，sim 层不行。
8. combat.getSnapshot() 扩展出网络需要的字段（双方的位置、速度、朝向、动作状态），并增加"从快照恢复"的入口。

**阶段 3（1~2 天）· 接上 WebRTC**
9. 新建 src/netcode.js（只加进 src/manifest.json，放在 main.js 前），内含：RTCPeerConnection 管理、两条 DataChannel（game 不可靠无序 + ctrl 可靠）、包编解码、连接状态机、getStats() 遥测。
10. **手动连接码模式**：主机生成 offer → 压缩成一段 base64 文本（页面里可一键复制）→ 客机粘贴 → 生成 answer → 回传主机 → 开局。**先不做房间号**。
11. **主机权威**：主机按固定帧把 {f, snapshot} 打包发出（快照 20~30Hz 即可，输入 60Hz）；客机只发输入，不跑判定，本地只预测自己的移动。
12. 联调验收：故意限速/丢包（Chrome DevTools 或 tc），看客机是否"抖而不崩"；拔网线 5 秒看是否进入"掉线"提示而不是永久卡死。

**阶段 4（1~2 天）· 房间号（v1）**
13. 加一个独立 Worker + Durable Object 做信令：POST /room 建房返回房间码、GET /room/:code 换 SDP、joinSecret 支持重连；只转发信令，**不转发对局数据**。
14. 顺手在同一个 Worker 里下发 TURN 凭据（避免把 TURN API key 写进前端）。
15. 兜底：信令服务不可用时，前端自动回退到"手动连接码"模式——这就是免费额度被用尽时（当天报错）的降级路径。

---

## 6. 与现有工程的结合（结构建议）

### 6.1 构建形态怎么改

现状：src/manifest.json 按序把模块拼进一个 IIFE，共享作用域（build/build.mjs:21,45,79-96）。
- **新增 "netcode.js"**：插在 "combat.js" 之后、"main.js" 之前。它需要读 inputSnapshot、注册 HOOKS，因此在同一作用域里最省事。
- **不要**在 netcode.js 里直接触碰 gojo/sukuna/city/render 的内部——只通过 HOOKS 总线和 window.__SS 已有出口交互，这样它才可能被移除而游戏行为不变（和现有四个机制模块的做法一致，见 src/contract.js 的 HOOKS 注释）。
- 联机开关用 URL 参数（现有习惯：?q=low&post=0&debug）如 ?net=host / ?net=guest，默认关闭 = 单机行为逐字节不变。

### 6.2 哪些逻辑必须"两台机算出同样的结果"

必须一致（**sim 层**）：
- 位置/速度/朝向、碰撞（CAPSULE_R=0.72 的胶囊体 + segmentHitsTarget 线段判定）
- 伤害结算、命中/格挡/闪避判定、连段计数
- 能量与冷却扣减、领域展开与领域对决的 tug、魔虚罗适应计数、黑闪窗口与判定帧
- 出手前冲（HitResolver.lunge 的位移）——它直接影响命中，属于逻辑
- AI 决策（联机下宿傩由主机 AI 驱动；注意 combat.js:2171 的 Math.random 在 AI 判定路径上）
- 帧驱动的状态机切换（anim/animT/phase 至少要能被快照正确传递）

可以各算各的（**view 层**）：
- fx.js 粒子/拖尾/屏幕特效、render.js 后处理、camera.js（机位、遮挡、FOV、震动）
- 音频 audio.js（除了"这一击命中了没有"这个事实来自 sim，其余混音/音量/播放位置都本地决定）
- 程序化贴图/几何随机（fighters.js 的伤害数字贴图、weapons.js 的顶点抖动）

**判断口诀**：*"如果我把它换成随机数，对方会不会吃亏？"* 会 → sim；不会 → view。

### 6.3 输入层与表现层怎么分离

- **输入层**：沿用 buildInput() 作为唯一入口，产出的 inputSnapshot 直接就是网络包内容（去掉 mouse.* 与 camX/camY，它们属于本地视角）。
- **表现层**：所有"预测/插值/修正"只允许改 Object3D 与相机，**不允许改 sim 的权威值**。给 sim 加一个显式的 applySnapshot(state)，表现层永远不直接写它。
- **调试**：现有探针习惯（window.__SS、__INJECT、HOOKS）继续沿用——加 __NET（连接状态、RTT、丢包、当前帧号、快照字节数），这样"卡顿到底是网络还是渲染"可以像现在查机制那样一探即知。

### 6.4 建议的模块清单（新增，不动现有文件）

| 新文件 | 职责 | 依赖 |
|---|---|---|
| src/netcode.js | 信令/连接/编解码/心跳/重连/遥测 | 无（只用浏览器 API） |
| src/net-sim.js（也可并入上者） | 固定步长、帧号、输入缓冲、快照序列化、预测与修正 | HOOKS、combat.getSnapshot() 扩展 |
| worker/signaling/（可选） | Worker + DO 信令，只做房间与 SDP 交换 | Cloudflare |

---

## 7. 风险清单

| # | 风险 | 表现 | 缓解 |
|---|---|---|---|
| 1 | **延迟与抖动** | 客机操作"软"，命中反馈慢半拍 | 客机预测位移、快照插值缓冲、在主 UI 显示 RTT；大于 150ms 提示 |
| 2 | **主机优势** | 主机 0 延迟、客机 1 帧以上缓冲 | 朋友对战可接受；要公平就让"选边/换边"在每局后自动交换 |
| 3 | **客机橡皮筋** | 预测被主机快照反复拽回 | 误差分级修正（小于 0.5m 平滑、大于 3m 瞬移 + 视觉提示） |
| 4 | **作弊** | 主机可改血量/CD；客机可伪造输入 | 主机**必须**校验客机的输入合法性与速率（不能信客机自检）；重要数值在主机侧再算一次；真要防作弊只能上服务器权威 |
| 5 | **同步漂移** | 双方看到的世界不一样（血条/位置） | 定种子、每 N 帧比对状态哈希、不一致以主机快照强制修正；保留输入日志以便复盘 |
| 6 | **版本不一致** | 新版和旧版对战，规则表不同 | 握手时比对 protoVersion + rulesHash，不一致拒绝开局 |
| 7 | **浏览器兼容** | Safari/iOS 的 WebRTC 实现差异、后台节流 | RTCDataChannel 能力在主流浏览器基本可用（caniuse 的 WebRTC P2P 覆盖率约 97%：https://caniuse.com/rtcpeerconnection ）；但要处理 onclose/onerror、bufferedAmount 背压、连接前 send 被丢弃；心跳不要依赖 rAF |
| 8 | **NAT 穿透失败** | "一直在连接中" | 配 TURN 兜底 + UI 显示直连/中继状态；提供"重新连接"按钮 |
| 9 | **移动端触屏联机** | 虚拟摇杆 + 合成 KeyboardEvent 的输入在网络上仍是纯数据（这点没问题），但**切后台自动暂停会打断对局**（src/mobile.js:931）、来电/切应用会断连 | 联机时改成"请求暂停"、切后台前发 halt；提供"重连中"遮罩而不是直接判负 |
| 10 | **移动端流量** | 无 Wi-Fi 时约 1~3 MB/分钟 | 开局前提示；给"省流"档（降快照频率） |
| 11 | **后台/锁屏** | rAF 停摆 → 游戏卡住、心跳误判、对手干等 | 用非 rAF 心跳 + 明确的"你已切出，对局将暂停 30 秒"提示 |
| 12 | **免费额度耗尽** | 信令/中继当天报错（DO 免费档超限是**当天直接报错**） | 前端保留"手动连接码"降级路径；TURN 直连优先 |
| 13 | **只写一个文件的纪律** | 本文只新增 research/D-netcode.md | 所有代码建议都写成"阶段"，不动其它文件 |

---

## 8. 来源链接清单

**WebRTC / 网络基础**
1. MDN · RTCDataChannel（可靠性模式、消息、bufferedAmount）：https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
2. MDN · createDataChannel（ordered / maxRetransmits / maxPacketLifeTime 语义）：https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel
3. MDN · WebRTC protocols（ICE / STUN / NAT / TURN 的关系）：https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols
4. Can I use · WebRTC Peer-to-peer connections（全球覆盖率 97.01%）：https://caniuse.com/rtcpeerconnection
5. PeerJS（免费云 PeerServer / 可自建）：https://peerjs.com/

**同步理论 / 回滚**
6. GGPO（回滚网络库的原始说明：零输入延迟、预测 + 回滚重演）：https://www.ggpo.net/
7. Gaffer on Games · Deterministic Lockstep（只传输入、带宽与实体数无关、但要求确定性）：https://www.gafferongames.com/post/deterministic_lockstep/
8. Gaffer on Games · Floating Point Determinism（编译器/OS/指令集差异导致浮点不确定）：https://gafferongames.com/post/floating_point_determinism/
9. Deterministic Lockstep in Browser Games（JS 里哪些运算精确、哪些 Math 函数是实现近似）：https://simplified.media/guides/deterministic-lockstep
10. Understanding Netcode Mechanics: Delay-based and Rollback Netcode（延迟型 vs 回滚型，格斗游戏视角）：https://jy-h.github.io/fighters-netcode-mechanics.html

**云服务与免费额度**
11. Cloudflare Durable Objects 计费（免费版 10 万请求/天、13,000 GB-s/天、超限当天报错、仅 SQLite 后端）：https://developers.cloudflare.com/durable-objects/platform/pricing/
12. Cloudflare Durable Objects · WebSocket Hibernation：https://developers.cloudflare.com/durable-objects/best-practices/websockets/
13. Cloudflare Workers 定价（免费 10 万请求/天、CPU 10ms；WebSocket 连接按一次请求计）：https://developers.cloudflare.com/workers/platform/pricing/
14. Cloudflare Workers 限制：https://developers.cloudflare.com/workers/platform/limits/
15. Cloudflare Pages Functions 绑定（DO 需要单独 Worker 项目）：https://developers.cloudflare.com/pages/functions/bindings/
16. PartyKit 官网与定价：https://www.partykit.io/ ｜ 被 Cloudflare 收购：https://blog.cloudflare.com/cloudflare-acquires-partykit/
17. Colyseus 官网与定价（OSS MIT；Cloud 15 美元/月起）：https://colyseus.io/ ｜ https://colyseus.io/pricing/
18. Nakama / Heroic Labs 定价：https://heroiclabs.com/pricing/
19. Supabase Realtime 配额（免费 200 并发连接、100 msg/s、100 join/s、广播 ≤256KB）：https://supabase.com/docs/guides/realtime/quotas
20. Firebase 定价（Spark 免费档）：https://firebase.google.com/pricing

**TURN 中继**
21. Metered Open Relay（免费 TURN，20 GB/月，凭据 API）：https://www.metered.ca/tools/openrelay/
22. Cloudflare Realtime TURN（与 SFU 同用免费，否则 0.05 美元/实时 GB）：https://developers.cloudflare.com/realtime/turn/
23. coturn（自建 TURN/STUN 的开源实现）：https://github.com/coturn/coturn

**本仓库内的一手依据（不是网络来源，是读代码得到的）**
24. src/main.js（主循环 loop2、buildInput、inputSnapshot、__INJECT、__SS）
25. src/combat.js（HitResolver / CAPSULE_R / segmentHitsTarget / getSnapshot / createCombat）
26. src/contract.js（HOOKS 总线、SKILL/SKILL_DATA、detectQuality）
27. src/mobile.js（__TOUCH、切后台自动暂停）
28. build/build.mjs、src/manifest.json（单文件拼装顺序）
29. deploy/README.md、deploy/publish.mjs（Pages 部署与 file:// 的限制）

---

## 9. 不确定性声明（写清哪些是事实、哪些是判断）

1. **行号**引用的是当前工作区的文件内容（src/main.js、src/combat.js、src/mobile.js、src/contract.js、build/build.mjs、deploy/publish.mjs 等），文件被改动后行号会漂移；机制名与函数名比行号更可靠。
2. **免费额度的具体数字**取自上述官方页面（核对时间：本次调研当时）；云厂商会调整额度与命名，落地前请再核一次。Supabase 的数字是逐行读到的；Firebase 免费档的**并发连接数上限**本次没有定位到官方表格原文，文中按"100 量级"表述并标注为未逐字核对。
3. **延迟/带宽/额度换算**（20~50 kB/s、20 GB ≈ 110~280 小时）是**按包大小假设推导的估算**，不是实测值；请用 pc.getStats() 或"省流档"实测校准。
4. **TURN 中继比例**（多少比例的对局需要中继）本文没有引用权威统计——不同网络环境差异很大，建议自己在 getStats() 里统计 candidate 类型。
5. **"切后台 rAF 被节流到约 1Hz"** 是浏览器工程界的共识性经验（Chrome/Firefox 均有节流策略，且策略会变），本文未逐字引用规范；但"心跳不要挂在 rAF 上"这个结论在任何策略下都成立。
6. **Durable Objects 能否承载 60Hz 权威模拟**：按"WebSocket 消息按条计费"的口径推演会很快吃满免费额度（§5.1），但本文没有实测；建议只把 DO 用作信令。
7. **iOS/Safari 的后台行为**（锁屏、切 App、来电后的恢复能力）未逐一实测；移动端联机请在真机上先做一次"切后台 30 秒再回来"的验收。
8. 本文**没有任何代码被修改**；research/D-netcode.md 是本次唯一新增文件。
