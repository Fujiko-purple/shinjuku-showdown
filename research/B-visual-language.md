# B · 视觉语言考据：新宿决战剪辑 → 可执行美术规范

> 交付物：本文件为唯一新增/修改文件（\`research/B-visual-language.md\`）。未改动仓库内任何其它文件。
> 考据时间：本次会话。项目：\`新宿对决\`（Web 战斗游戏，设计令牌见 \`src/styles.css\`）。

## 0. 证据等级说明（先读这一节）

| 等级 | 含义 | 本文标记 |
|---|---|---|
| **A 实测** | 我本机直接请求 API / 直接量测图像像素得到 | \`[A]\` |
| **B 原文** | 抓取到目标页面/接口正文并引用 | \`[B]\` |
| **C 二手** | 只能通过搜索引擎摘要间接获得（无法打开正文） | \`[C]\` |
| **D 推断** | 我基于同类资料/通用技法推断，**没有看过该视频** | \`[D]\` |

**必须声明的三件事：**

1. **我没有观看该视频。** \`web_fetch\` 工具在本机对所有域名均返回 \`URL hostname ... resolves to a non-public IP address\`（DNS 被本地接管），包括 \`example.com\` 与 Wikipedia —— 即该工具在本会话**完全不可用**。我改用 \`pwsh\` 内的 \`Invoke-WebRequest\` 直连（这条路径可通），但它也**只能拿到网页/接口文本，不能解码视频画面**。
2. 我拿到的是 **B 站官方接口的元数据**（标题/UP主/时长/统计/标签/原始分辨率）\`[A]\` + **封面图的像素统计**（我自己算的）\`[A]\` + **原作者的自述与官方符号库原文** \`[B]\`。**剪辑本体的镜头、剪辑点、特效层级属于 \`[D]\` 推断**，来源是"同类 MMV/静止画 MAD 的通用技法 + 官方视觉符号"，不是我对该片的逐帧观察。
3. 因此第 1 节的写法是：**先给硬事实，再给可执行规范**，规范部分标注了推断依据。

---

## 1. 参考对象勘误（这条改变整个美术方向）

### 1.1 它不是什么

- **它不是 MAPPA 的官方动画，也不是官方分镜。** 它是**同人 MMV（Manga Music Video / 静止画 MAD）**。
  \`[A]\` B 站接口 \`view?bvid=BV1tTVw6WEzi\` 原文简介：**"搬运自外网自制动画大佬"NinjaristicNinja"，超高清新宿决战 1440P 五条悟 vs 宿傩，作者非原创"**。
  \`[B]\` 原作者 YouTube 频道自述：**"I make Manga 'animations' (MMVs/MADs)"**；Patreon 标题 **"creating MMVs & Manga Edits!"**。

- **新宿决战篇（人外魔境新宿决战）截至本次检索尚未动画化。** 动画进度为第 3 期《死灭回游 前篇》，第 4 期《死灭回游 后篇》已宣布制作 \`[C]\`（[comic-rush 对应表](https://comic-rush.jp/jujutsukaisen-anime-manga-guide-comicrush/)、[anisaki](https://anisaki.hatenadiary.com/entry/jjk-shimetsukaiyu-kohen)、[masa-tech-blog](https://masa-tech-blog.com/jujutsu-kaisen-shimetsu-kaiyu-kouhen-dokomade/)）。
  → **结论：不存在"新宿决战的官方动画分镜"可抄。** 官方参照只能来自：漫画原作（该篇约第 221–268 话）、动画 1/2 期已建立的演出语法（尤其《涩谷事变》）、官方 PV/主视觉。**这条对"美术向它靠"是决定性的**。

### 1.2 它到底是什么（硬事实 \`[A]\`）

| 项 | 值 | 来源 |
|---|---|---|
| 标题 | "最强的战绩，铭刻于新宿" | \`api.bilibili.com/x/web-interface/view\` |
| UP 主 | 唯夢WeiM（搬运，非原创） | 同上 |
| 发布 | 2026-05-26 | 同上 |
| 时长 | **96 秒**（1 分 36 秒） | 同上 |
| 分区 | tid 27 / 2041（动画 → 综合） | 同上 |
| 播放 / 点赞 / 投币 / 收藏 / 弹幕 / 评论 / 分享 | 2,177,141 / 112,043 / 8,251 / 45,938 / 997 / 6,213 / 9,013 | 同上 |
| 标签 | **新宿决战、外网搬运、咒术回战、五条悟** | \`/x/tag/archive/tags\` |
| 原始分辨率 | **3822 × 2160**（简介写 1440P，实际更高） | \`/x/player/pagelist\` |
| cid | 38619907839 | 同上 |

**封面图实测（2560 × 1439，我采样 102,480 像素自己统计）\`[A]\`：**

- 高频色块：\`#c0c0c0\` 9.3% ／ \`#e0e0e0\` 5.9% ／ \`#202040\` 5.7% ／ \`#404040\` 4.4% ／ \`#000020\` 4.3% ／ \`#e0c0c0\` 4.1% ／ \`#e0c0e0\` 3.9%
- 3×3 分区均值：左列偏**深蓝**（\`#304d6f\` / \`#304662\`），中列**蓝灰**（\`#64a5d5\` / \`#4a7397\`），右列**近白偏粉紫**（\`#c6c6da\` / \`#dfd5de\` / \`#d6c4bd\`）
- 近黑像素（max 通道 < 60）占 **9.7%**；高饱和像素占 **32.9%**

**可直接落地的三条读数：**
1. 这张封面是**"冷蓝压暗底 + 近白高光主体"**，不是"青蓝 vs 赤红"的高饱和对撞。真正的红/黑对撞更可能出现在**爆点帧**而非全片基调 → **别把"宿傩 = 满屏红"当默认底色**。
2. **高饱和占比 32.9%** 已经是"高信息量"水平；这是**封面（单帧、可读性优先）**，游戏内常驻战斗应低于它。
3. 近黑只占 9.7%，说明**暗部没有压死**，靠中低明度的蓝灰（\`#304d6f\`~\`#4a7397\`）撑体积 → 新宿夜景的正确做法是"**低明度冷蓝的城市体积**"，不是纯黑剪影。

---

## 2. 视觉语言拆解 → 美术规范

> 每条给出：**观察/依据** → **规范（可直接写进代码/文档的数值）**。
> 凡属 \`[D]\` 的，依据写"MMV 通用技法"。

### 2.1 镜头（Camera）

**依据**：MMV/静止画 MAD 的标准制作流是 **Photoshop 拆件 → After Effects 加运动**（[静止画MADの作り方](https://creator-blog.jp/how-to-make-mad-using-still-images/)）\`[C]\`；原作是漫画格，因此"镜头"本质是**对静态格的 2.5D 摄影机运动与层级视差**，不是逐帧作画 \`[D]\`。

**规范：**

| 编号 | 规则 | 数值 |
|---|---|---|
| CAM-1 | 单次镜头运动**最多 2 个自由度**（如 推 + 轻微摇），禁止 3 轴同时动 | ≤2 DOF |
| CAM-2 | 视差层数固定 3 层（前景剪影 / 中景角色 / 远景城市），层间速度比 | 1 : 0.45 : 0.18 |
| CAM-3 | 常态战斗镜头：**越肩（OTS）+ 中景 35° 视角**；广角只在"领域展开 / 空间斩 / 黑闪"三个事件使用 | 广角 ≤ 15% 时长 |
| CAM-4 | 镜头切换间隔：常态 ≥ 1.5 s；**演出段落允许 0.3–0.8 s 快切，但连续快切 ≤ 5 镜**，之后必须回到 ≥1.5 s 的长镜 | — |
| CAM-5 | 推镜（dolly-in）用于"术式蓄力"，拉镜（dolly-out）用于"领域展开"（空间被撑开） | 推 ≤ 0.8 s，拉 ≤ 1.2 s |
| CAM-6 | 越肩 → 广角的切换必须间隔 ≥1.2 s，否则观众丢失空间关系 | ≥1.2 s |
| CAM-7 | 屏幕震动只在 P0 事件（命中/领域/黑闪）触发，幅度 ≤ 屏高 1.6%，衰减 ≤ 220 ms | ≤1.6% |

### 2.2 配色（Palette）

**依据**：封面实测 \`[A]\` + 项目现有令牌 \`[B]\`（\`src/styles.css\`）+ 官方术式色彩语义 \`[B/C]\`。

**项目现有令牌（勿新增重复色）：**
\`\`\`
--ink      #06060c   虚空底
--ink-2    #0c0d16
--crimson  #ff1f3d   宿傩红
--crimson-dk #8c0b1e
--azure    #2b86ff   五条苍
--cyan     #5ff0ff   五条高光/无下限
--violet   #b04cff   茈 / 领域
--gold     #ffd873   UI 主色
--paper    #e8e6df   正文/近白
\`\`\`

**官方色彩语义（必守）：**
- 五条悟：\`蒼(あお)\` = 引力/蓝，\`赫(あか)\` = 斥力/**红**，\`茈(むらさき)\` = 虚式/**紫**（无下限的三种输出）\`[C]\`（[ciatr](https://ciatr.jp/topics/317691)、[likiroku](http://likiroku.com/jujutsu-gojou-nouryoku/)）。
  → **勘误：五条 ≠ 纯青蓝。** 他一定带**红（赫）与紫（茈）**。把"青蓝 vs 赤红"当作两人阵营色是**错的**，会撞色。正确做法：五条用**冷蓝→青白→紫**同一色相的明度/色相阶梯；宿傩用**赤红→暗红→近黑**。
- 宿傩：赤 + 黑 + 骨白（详见 §3.2）。

**规范：**

| 编号 | 规则 | 数值 |
|---|---|---|
| COL-1 | 战斗常驻高饱和**色族 ≤ 2**（五条青蓝族 / 宿傩赤族），事件色**瞬时 +1**（紫=茈、金=UI 提示） | ≤2 常驻 +1 瞬时 |
| COL-2 | 每个色族**只允许 2 个明度档**（主色 + 暗部），第三档必须是**去饱和**而非换色相 | 2 档 |
| COL-3 | **金色 \`--gold\` 属 UI 专用**，禁止出现在术式特效与角色材质上（它是第 3 个高饱和族，最容易导致"乱"） | UI only |
| COL-4 | 环境（新宿夜景）只允许低饱和冷蓝中低明度：L 20–45%、S 10–35% | — |
| COL-5 | 角色受击色统一为**白闪**（去饱和到 100% 亮度），不许用队伍色描边 | — |
| COL-6 | 单人镜头时另一方可退到 65% 亮度 / 40% 饱和，形成"焦点降噪" | — |

### 2.3 特效（VFX）

**依据**：官方符号描述见 §3；MMV 常用叠加层（速度线、flash frame、色差、glitch、粒子）\`[D]\`。

**规范：**

| 编号 | 特效 | 允许参数 |
|---|---|---|
| FX-1 | **咒力粒子** | 同屏可见粒子 ≤ 300；**颜色族 ≤ 2**；尺寸分 3 档（2/4/8 px @1080p）；生命周期 ≤ 0.9 s |
| FX-2 | **黑闪** | 只允许**黑 + 红**双色（官方：咒力"闪黑"，是空间扭曲；见 §3.4）。表现 = 1 帧全屏黑闪 + 红色放射闪电 ≤ 6 帧 + 顿帧 80–140 ms |
| FX-3 | **空间斩（世界を断つ斬撃）** | **纯黑斩线**（\`#000\`~ \`--ink\`）宽 2–4 px，带 1–2 px 白边；沿线**禁止彩色**；命中后延迟 0.12–0.25 s 才出现"错位/分离"效果 |
| FX-4 | **领域展开** | 全屏色覆盖 ≤ 0.4 s，之后**降到 ≤ 18% 不透明度**作为底纹常驻；领域内**禁止再叠另一种全屏色** |
| FX-5 | **泛光（Bloom）** | 阈值 ≥ 0.85、强度 ≤ 0.35、半径 ≤ 12 px @1080p；**只有发光体（咒力/术式）能触发**，UI 与角色固有色不触发 |
| FX-6 | **噪点/颗粒** | ≤ 4% 不透明度；**禁止在 UI 层之上**（UI 必须干净可读） |
| FX-7 | **色差（RGB 分离）** | ≤ 2 px；只在爆点帧 ≤ 6 帧内使用 |
| FX-8 | **闪烁/频闪** | 全屏亮度闪烁 **≤ 3 Hz**（光敏性癫痫安全线）；单次 ≤3 帧；**绝对禁止 15–25 Hz 频闪** |
| FX-9 | **速度线/集中线** | 只画在**角色背后 1/3 屏**且不越过 UI 安全区；不透明度 ≤ 45% |
| FX-10 | **屏幕污渍/血/裂纹叠层** | 同屏 ≤ 1 层；战斗中不透明度 ≤ 25% |

### 2.4 节奏（Timing）

**依据**：96 秒成片 + B 站弹幕/热度结构 \`[A]\`；"0 帧起手"是该类剪辑的常见标签（抖音转载标题出现"#0帧起手"）\`[C]\`；音乐卡点为 MMV 基本手法 \`[D]\`。

**规范：**

| 编号 | 规则 | 数值 |
|---|---|---|
| TIM-1 | 剪辑点对齐音乐强拍（BPM 网格）；游戏内对应"招式命中帧对齐 BGM 拍点" | 卡点容差 ≤ 40 ms |
| TIM-2 | 顿帧（hitstop）：轻击 60–80 ms，重击 90–140 ms，必杀/黑闪 160–220 ms | — |
| TIM-3 | 慢镜：≤ 0.8 s；每 10 s ≤ 2 次；**只在必中/黑闪/领域**使用 | — |
| TIM-4 | "0 帧起手"＝**动作起手无预备帧**：起手到判定 ≤ 3 帧，靠**预备音效 + 1 帧白闪**替代视觉预备 | ≤3 帧 |
| TIM-5 | 爆点后强制"呼吸镜"：≥0.6 s 的低运动量镜头 | ≥0.6 s |
| TIM-6 | 一局内"全屏特效峰值"次数 ≤ 6 次（每 10 s ≤ 1 次），避免持续过载 | — |

### 2.5 字幕 / 文字排版（Typography）

**依据**：项目已配置字体栈 \`[A]\`：\`--f-jp\`（Yu Mincho 明朝）、\`--f-ui\`（Yu Gothic）、\`--f-num\`（DIN Alternate / Bahnschrift / Impact）。日式战斗演出惯例为**明朝体 + 竖排 + 白字黑描边/红印章** \`[D]\`。

**规范：**

| 编号 | 元素 | 规则 |
|---|---|---|
| TYP-1 | 招式名/标题 | **明朝体（\`--f-jp\`）**，竖排优先，字号 ≥ 屏高 6% |
| TYP-2 | 描边 | 白字 + 2–3 px 深色描边（\`--ink\`）；**禁止发光文字**（与泛光预算冲突） |
| TYP-3 | 强调/印章 | 赤 \`--crimson\` 方形印章块 + 反白文字，仅用于"领域展开""黑闪"等命名瞬间，≤1.2 s |
| TYP-4 | 数字/伤害 | \`--f-num\` 等宽数字（\`--num-feat: tnum lnum\`），仅右对齐堆叠，同时 ≤ 4 行 |
| TYP-5 | 位置 | 文字只能出现在**上下 letterbox 带**或屏幕**左右各 6% 保险区内**；禁止压在中央构图区 |
| TYP-6 | 同时出现的文字块 | **≤ 2 块**（1 个招式名 + 1 个提示）；弹幕式吐槽文字在战斗 HUD 中禁止 |

---

## 3. "画面很乱"成因清单与硬约束

### 3.1 为什么会糊（按贡献度排序）

1. **高饱和色族数量超预算。** 人眼在 60 fps 动态画面里，同屏能稳定区分的**高饱和色相族上限约 2–3**。第 4 族开始，观众不再"看到颜色"，只看到噪点。本项目现状：**青(五条) + 赤(宿傩) + 紫(茈/领域) + 金(UI) = 4 族**，已经在红线外。
2. **高频细节 × 运动矢量乘积爆炸。** 每个在动的层都携带边缘（高频），运动让边缘产生时间混叠。**层数 × 运动速度**是"糊"的直接度量。城市背景 + 粒子 + 速度线 + 屏幕震动同时动 = 4 个运动矢量。
3. **发光叠发光（Bloom 堆积）。** 泛光阈值低 + 多个发光体 → 中间调被抬升 → 对比度塌陷 → 主体与背景分离度归零。
4. **UI 与特效抢同一块屏幕。** 全屏色覆盖（领域/受击闪）压在血条上，血条可读性崩塌，观众被迫在"看招"和"看血"之间切换。
5. **同帧多个"最高优先级"事件。** 两个必中特效、命中闪 + 领域展开 + 黑闪同帧 = 无焦点。
6. **字幕/提示与战斗主体同区。** 文字出现在中央构图区，等于在焦点上盖了一层高频噪声。
7. **频闪与色差滥用。** 每帧抖动（≤15 Hz 的闪烁、逐帧色差）是"廉价感 + 视觉疲劳"的主因，且带来光敏性风险。
8. **暗部压死 + 高光过曝。** 近黑 40% 以上 + 高光 10% 以上时，中间调消失，画面只剩两块死色，运动模糊一叠就糊成一团。

### 3.2 可执行约束（预算表）

**A. 颜色预算**

| 约束 | 数值 |
|---|---|
| 同屏高饱和色族（常驻） | **≤ 2** |
| 瞬时事件色 | **+1**，且持续 ≤ 0.4 s |
| 单帧高饱和像素覆盖率 | 常态 **≤ 20%**；爆点帧 **≤ 35%**；绝不超过 **40%** |
| 近黑（max 通道 <60）覆盖 | 30–45%（夜景允许）；**>55% 视为失败** |
| UI 金色与战斗特效色的重叠 | **0**（禁止同屏共现于同一区域） |
| 去饱和处理 | 焦点外元素统一降到 **65% 亮度 / 40% 饱和** |

**B. UI 区域预算（安全区）**

\`\`\`
┌───────────────────────────────┐
│ 顶部带 8%  ：回合 / 计时 / 状态图标 │
│ ┌───────────────────────────┐ │
│ │  中央构图区 68% × 74%      │ │
│ │  常驻 UI 数量 = 0          │ │
│ │  仅允许 ≤0.4s 瞬时提示      │ │
│ └───────────────────────────┘ │
│ 底部带 18% ：HP / 咒力 / 招式槽    │
└───────────────────────────────┘
   左右各 6% 保险区：禁止任何关键信息
\`\`\`

- 常驻 UI **只能**在顶部 8% 与底部 18% 带内。
- 中央构图区**常驻 UI = 0**；瞬时提示（"领域展开""黑闪"）≤ 0.4 s 且不透明度 ≤ 85%。
- 全屏色覆盖（领域/受击闪）必须**先降 UI 不透明度到 ≤ 30%**，或在覆盖层之上重绘 UI 轮廓。

**C. 特效优先级（同帧冲突时按此抢占，低者自动淡出）**

| 优先级 | 事件 | 行为 |
|---|---|---|
| **P0** | 命中确认 / 受击白闪 / 黑闪 | 独占；抢占所有其它层 |
| **P1** | 领域展开 / 必中效果 | 可打断 P2，不可打断 P0 |
| **P2** | 术式特效（蒼/赫/茈/解/捌/竈） | 与同级**最多 2 个**并存 |
| **P3** | 环境粒子（咒力余烬、尘埃） | 冲突时全局降到 20% |
| **P4** | 天气 / 城市氛围 / 霓虹 | 冲突时全局降到 10% 或直接关闭 |

**D. 噪点 / 泛光预算**

| 项 | 预算 |
|---|---|
| Bloom 阈值 / 强度 / 半径 | ≥0.85 / ≤0.35 / ≤12 px @1080p |
| 发光体数量 | 同屏 **≤ 3** |
| 噪点不透明度 | ≤ 4%，且**永不覆盖 UI** |
| 色差位移 | ≤ 2 px，≤ 6 帧 |
| 全屏闪烁频率 | ≤ 3 Hz |
| 屏幕污渍层 | ≤ 1 层，≤ 25% |
| 运动模糊 | 只对速度 > 阈值的主体启用；背景**不开**运动模糊 |

**E. "糊"的判定式（可自检）**

\`\`\`
混乱度 C = (高饱和色族数) × (独立运动矢量数) × (高频叠层数)
- 三个因子任一 ≤1 时：即使其它两项高，画面仍可读
- 目标：C ≤ 12
- 例：2 色族 × 2 运动矢量 × 3 叠层 = 12 → 临界
- 例：4 色族 × 3 运动矢量 × 4 叠层 = 48 → 必糊
\`\`\`

**F. 单帧自检清单（截图即可判定）**
1. 数高饱和色族，>3 直接打回。
2. 中央构图区内是否有常驻 UI，有则打回。
3. 发光体是否 >3。
4. 近黑覆盖率是否 >55%。
5. 是否同帧存在两个 P0/P1 事件。
6. 文字块是否 >2。

---

## 4. 官方视觉符号库（可直接写进美术文档）

> 以下每条都来自可引用的官方/权威文本 \`[B]\`（我抓到了 wiki 原文），或 \`[C]\`（二手文章）。**这是本次交付中最"实"的部分。**

### 4.1 五条悟 / 无下限（Limitless / 無下限呪術）

**原文 \`[B]\`**（[Fandom: Limitless](https://jujutsu-kaisen.fandom.com/wiki/Limitless)）：
> "…inherited technique passed down in the Gojo Clan. This technique brings the concept of **"Infinity"** into reality, allowing the user to **manipulate and distort space** at will. While any member of the Gojo Clan can hereditarily gain this technique, only those who also possess the **Six Eyes** as well can truly master the power of the Limitless."
> "**Infinity** is the neutral state of the Limitless and is essentially **the power to stop**. The Limitless technique operates the same way **convergent and divergent sequences** do in mathematics."

**可写进美术文档的元素清单：**

| 元素 | 视觉实现建议 |
|---|---|
| **∞ / 无限符号** | 无下限的**事实上的家徽**。用极细（1–2 px）青白线条绘制，缓慢自转或脉冲；作为 UI 徽记、领域边框、加载动画 |
| **无下限屏障** | 半透明青白折射壳，**边缘可见"趋近但不接触"的残影**（同一动作留下 3–4 个渐隐重影）——直接表达"收敛数列" |
| **六眼** | 高纯度 cyan \`#5ff0ff\`，虹膜内可见**多层同心纹路**；激活时**只亮眼睛，不亮全身** |
| **蒼（青）** | 引力/负向，冷蓝 \`--azure\` → \`--cyan\`；表现为**向内收缩**的粒子与吸积感 |
| **赫（赤）** | 斥力/正向，**红**（\`--crimson\` 系）；表现为**向外扩张**的冲击 |
| **茈（紫）** | 虚式，\`--violet\` \`#b04cff\`；**只有蒼与赫同时碰撞才生成** → 视觉上必须是"两色混合的产物"，不能凭空出现 |
| **无下限的色阶** | 冷蓝 → 青白 → 紫，**同一族的明度/色相阶梯**，不要引入第二个暖色族 |

> **关于"五条家纹"：** 我**未能确认**作品中存在被官方明确绘制的五条家家纹；相关文章多为"彻底調査/考察"，实际上是在比对**现实中**存在的五条氏家系与家纹（[trend-jiji](https://trend-jiji-sidejob.com/jujutsukaisen-gojo-familytree/)、[anime-de-dekiteiru](https://anime-de-dekiteiru.com/jujutsu-gojo-family/)、[csm-fan](https://csm-fan.com/?p=18172)）\`[C]\`。
> **建议：不要自造"家纹"再声称是官方的**，直接采用 **∞ 符号 + 六眼** 作为五条阵营徽记，这是有原文支撑的。

### 4.2 两面宿傩 / 伏魔御厨子（Malevolent Shrine / 伏魔御廚子）

**原文 \`[B]\`**（[Fandom: Malevolent Shrine](https://jujutsu-kaisen.fandom.com/wiki/Malevolent_Shrine)）：
> "Befitting its name, Malevolent Shrine constructs a **disfeatured Buddhist shrine** (resembling an oversized ***zushi*(厨子)**, or more vaguely a ***chinjudō*(鎮守堂)**) that has been **distorted to instead enshrine demons**. **Several bovine skulls form the base of the shrine.** The **hip-and-gable roof is crowned with a small bovine skull**, has **horns** emerging from it, two smaller mouths in each gable, **tiny fanged mouths in each of the top corners of the entrances' doorframes**, as well as **human skulls that hang down from the four corners of the roof**. The **four entrances to the shrine are formed by four large, grotesque mouths**, complete with humanlike teeth and tongues. **Four short, tree-like stumps with gnarled branches stand at each corner** of the shrine."
> 异形形态："…a large mass of flesh, horns and teeth with **multiple eyes — one large, central eye surrounded by six smaller eyes** … patches of hair-like appendages … **four large curved horns** at the top, **two giant humanoid hands at the bottom**, and a **spine-like appendage** tapering down from the back."
> 必中效果：""…relentlessly **slashes apart anything until nothing but dust remains**… via Sukuna's two types of slashing attacks: **Cleave** and **Dismantle**."

**掌印 \`[C]\`**（[pixiv 百科：伏魔御廚子](https://dic.pixiv.net/a/%E4%BC%8F%E9%AD%94%E5%BE%A1%E5%BB%9A%E5%AD%90)）：
> "掌印は、インド神話の冥府神ヤマが日本に伝わり仏教の天部となった、**運命と死と地獄の神閻魔天の印**。"
> （掌印＝**阎魔天**之印：命运、死与地狱之神）

**可写进美术文档的元素清单：**

| 元素 | 视觉实现建议 |
|---|---|
| **厨子 / 神社结构** | 不是"鸟居"而是**被扭曲的佛龛/镇守堂**。若要简化，保留**入母屋屋顶（hip-and-gable）+ 四角垂挂人骨**这一对识别特征 |
| **牛骨基座** | 多个牛头骨堆叠成台基；用**骨白 \`--paper\` 降饱和**，不要象牙黄 |
| **四张口构成四个入口** | 领域边界＝**四张巨口**，不是几何结界。入口处有**獠牙与舌** |
| **四个树桩（gnarled branches）** | 四角枯木，作为**构图框架元素**（可承担视差前景层） |
| **赤 + 黑 + 骨白** | 宿傩的完整色族：\`--crimson\` \`#ff1f3d\` → \`--crimson-dk\` \`#8c0b1e\` → \`--ink\` \`#06060c\`，骨白点缀 |
| **斩击的"解"与"捌"** | "解"＝常规斩击线；"捌"＝**依咒力差必定斩断**，视觉上应是**更细、更快、更绝对的线**（建议：解=带白边黑线，"捌"=**纯黑无白边**，一刀切过不留光） |
| **火焰/竈（開のフーガ）** | 竈＝灶/炉，火焰意象属**开（フーガ）**而非领域本体；火焰色应用**暗红→橙红**，且**必须限定在单一方向**（避免与领域全屏色撞车） |
| **空间斩 / 世界を断つ斬撃** | 纯黑斩线，**命中后延迟**才显现"世界被切断"的错位（[anime-lab](https://anime-lab.net/jujutsu-sekai/)、[asobigokoro](https://asobigokoro.work/Anime-Manga/jujutsu-kaisen-ryomen-sukuna-techniques-mizushi-kamino/)）\`[C]\` |
| **本来の姿** | **4 臂 / 4 眼 / 2 口 / 身高逾 2 m**；4 臂的意义是"**两臂结印、两臂肉搏**"——美术上必须让**掌印持续可见**（[zen-seer](https://zen-seer.com/?p=11850)）\`[C]\` |
| **现实原型（可用于纹样）** | 记纪神话中的两面宿傩是"**计八本手足、头前后两面各有一张脸**"的异形（[ja.wikipedia 両面宿儺](https://ja.wikipedia.org/wiki/%E4%B8%A1%E9%9D%A2%E5%AE%BF%E5%84%BA)）\`[B]\` → 可做**双面/对称纹样**母题 |

### 4.3 无量空处（Unlimited Void / 無量空処）

**原文 \`[B]\`**（[Fandom: Unlimited Void](https://jujutsu-kaisen.fandom.com/wiki/Unlimited_Void)）：
> "…brings the user and their targets **inside the Limitless itself**, which is an **endless void resembling outer space** in appearance, with a **large black hole, distant galaxies and numerous white patches** in the background. **Boundless raw information floods into the target's mind**…"

**二手补充 \`[C]\`**（[百度百科 无量空处](https://baike.baidu.com/item/%E6%97%A0%E9%87%8F%E7%A9%BA%E5%A4%84/56465166)、[pixiv 百科 無量空処](https://dic.pixiv.net/a/%E7%84%A1%E9%87%8F%E7%A9%BA%E5%87%A6)）：
> 外部表现为**巨大的黑色球体**，内部空间漆黑，领域内除五条外所有人**悬浮**；效果是强制的**无限回知觉与传达**——"知覚→伝達→行動"循环中前两步永不结束，对手"感知一切却无法行动"，并因信息量而**损伤大脑**。

**可写进美术文档的元素清单：**

| 元素 | 视觉实现建议 |
|---|---|
| **巨大黑球（外部）** | 纯黑球体 + **极细微的青边**；球面几乎无反射（区别于普通能量球） |
| **宇宙/虚空（内部）** | 黑底 + **遥远星系**（极低亮度、低饱和）+ **大量白色斑块**（"numerous white patches"）。**关键：白斑要高密度但低亮度**，不能做成闪光 |
| **黑洞** | 单一中心暗核 + 引力透镜环；作为构图中心与视线落点 |
| **"无限信息"意象** | 用**信息本身的堆叠**表达：字符/数字/汉字碎片以极高密度但极低对比度漂浮；或**无限递归的分形网格**。**必须"多而弱"，一旦高对比就变糊** |
| **悬浮** | 对手失去地面支撑、缓慢上浮；**剥夺重力参考线**是"分析瘫痪"的最佳视觉翻译 |
| **认知过载的效果** | "リリリリリリ…"式的**重复崩坏文字**（原作/单行本作者自述）\`[C]\` → 可做 UI 故障/字块重复的特效母题 |
| **色阶** | 黑 → 深蓝 → 青白 → 紫。**禁止暖色**（这是五条的领域，暖色会与宿傩撞车） |

### 4.4 黑闪（Black Flash / 黒閃）

**原文 \`[B]\`**（[Fandom: Black Flash](https://jujutsu-kaisen.fandom.com/wiki/Black_Flash)）：
> "Black Flash is **a distortion in space** that occurs when cursed energy is applied within **0.000001 seconds (1 microsecond)** of a physical hit. When a jujutsu sorcerer is able to achieve this, **their cursed energy flashes black**, and the destructive power of their strike is equal to **a normal hit to the power of 2.5**."
> "…no sorcerer is capable of using it at will, **not even Satoru Gojo**… the sparks do not choose who to bless."

**二手补充 \`[C]\`**：外在表现为"**一闪而逝的黑色火花**"（[百度百科 黑闪](https://baike.baidu.com/item/%E9%BB%91%E9%97%AA/57267375)）。

**可写进美术文档的元素清单：**

| 元素 | 视觉实现建议 |
|---|---|
| **"咒力闪黑"** | **不是红色闪电，是黑色的能量闪光**。红色可作为**次级火花**，但主体必须是黑 |
| **黑色火花** | 短促（≤6 帧）、沿打击方向**向外放射**的黑色尖刺/裂纹 |
| **空间扭曲** | 命中点周围**空间错位**：背景在打击点附近做 ≤3 px 的径向偏移，比"画闪电"更贴原作设定 |
| **2.5 次方** | 数值/演出上的"越级"：伤害数字用 \`--f-num\` 且**加大到常规的 1.8 倍**，配 1 次全屏黑闪 |
| **随机的恩惠** | "火花不选择被祝福者" → 黑闪应带**低概率随机触发**的读感（不可被玩家当作常规资源） |
| **禁止** | 禁止把黑闪做成"红黑雷电全屏铺满"；那是常见的同人误读，也是"画面很乱"的头号来源 |

### 4.5 领域展开 / 掌印（Domain Expansion & Mudra）

**原文 \`[B]\`**：五条悟的手印见 [Fandom: Unlimited Void](https://jujutsu-kaisen.fandom.com/wiki/Unlimited_Void)（配图 "The hand sign for Unlimited Void"）；宿傩的手印见 [Fandom: Malevolent Shrine](https://jujutsu-kaisen.fandom.com/wiki/Malevolent_Shrine)（配图 "The hand signs for Malevolent Shrine"）。
**宿傩掌印来源 \`[C]\`**：**阎魔天印**（命运·死·地狱）。
**领域总览与手印含义 \`[C]\`**：[ciatr 領域展開一覧](https://ciatr.jp/topics/317645)、[aniragablog 手印全解説](https://aniragablog.com/area_development_hand/)。

**可写进美术文档的元素清单：**

| 元素 | 视觉实现建议 |
|---|---|
| **结印特写** | 领域展开的**第一拍永远是手部特写**（近景、浅景深、背景降饱和），为随后的全屏爆发做"视觉预备" |
| **掌印识别性** | 每个角色一个**固定手型剪影**，做成可复用的图标/徽记（宿傩＝阎魔天印） |
| **展开时序** | ① 结印特写 → ② 1–2 帧白/黑闪 → ③ 全屏色覆盖（≤0.4 s）→ ④ 降到 ≤18% 作为底纹常驻 |
| **领域边界** | 五条：黑球/星空；宿傩：四张巨口构成的神社。**两者都不是几何结界** |
| **必中效果** | 领域内"必中"用**视觉上不可躲避的覆盖**表达（斩击线从所有方向同时到达 / 信息流无孔不入） |
| **代价** | 领域展开应有**明确的资源/代价读数**（咒力条骤降），否则观众读不到"这是大招" |

### 4.6 其它可直接引用的符号

| 符号 | 要点 | 来源 |
|---|---|---|
| **魔虚罗（八握剣異戒神将魔虚羅）** | 右腕配**对咒灵特化之剑**，缠绕与反转术式同源的**正能量**；**法阵/车轮**为其适应机制的视觉载体 | [pixiv 百科](https://dic.pixiv.net/a/%E5%85%AB%E6%8F%A1%E5%89%A3%E7%95%B0%E6%88%92%E7%A5%9E%E5%B0%86%E9%AD%94%E8%99%9A%E7%BE%85) \`[C]\`、[アニヲタWiki](https://w.atwiki.jp/aniwotawiki/pages/58367.html) \`[C]\` |
| **死灭回游 / 新宿的城市意象** | 新宿＝"决战之地"，官方亦以"決戦の地"表述新宿 | [collabo-cafe](https://collabo-cafe.com/events/collabo/jujutsuten-shinjuku-2026/) \`[C]\` |
| **涩谷事变（可用的动画演出参照）** | 动画 2 期的作画/演出被反复讨论，是**唯一已动画化的高强度都市战斗**参照 | [note 解説](https://note.com/lucid_mint3312/n/n18d5cfed72a0) \`[C]\`、[csm-fan](https://csm-fan.com/?p=19793) \`[C]\` |

---

## 5. 参考资料 URL 清单

### 5.1 目标剪辑本体
- 视频页：https://www.bilibili.com/video/BV1tTVw6WEzi/
- 元数据接口（**我实际请求成功**）：https://api.bilibili.com/x/web-interface/view?bvid=BV1tTVw6WEzi
- 标签接口：https://api.bilibili.com/x/tag/archive/tags?bvid=BV1tTVw6WEzi
- 分 P/分辨率接口：https://api.bilibili.com/x/player/pagelist?bvid=BV1tTVw6WEzi
- 封面图（**我实际下载并做了像素统计**）：http://i2.hdslb.com/bfs/archive/fc11e283ce1cd34a1c7d907d03cd011d6b5d62d9.jpg
- 首帧图：http://i1.hdslb.com/bfs/storyff/_000028i4j24yqyb3727a3pi0pzzub1b_firsti.jpg
- 原作者：https://www.youtube.com/@NinjaristicNinja ／ https://www.youtube.com/@NinjaristicNinja/playlists ／ https://www.patreon.com/ninjaristicninja/shop

### 5.2 同类新宿决战剪辑（B 站站内，可作横向参照）
- https://www.bilibili.com/video/BV1pztMe4EqC/ （新宿决战篇 全回顾·素材整理）
- https://www.bilibili.com/video/BV1u4XuB3E51/ （一口气看完 五条悟 VS 宿傩）
- https://www.bilibili.com/video/BV1FnGzzxErU/ （外网 2000 万播放·新宿决战全集·静止画 MAD）
- https://www.bilibili.com/video/BV1Pm421u71i/ （全十四种领域展开深度剖析 Vol.1：伏魔御厨子 vs 无量空处）
- https://www.bilibili.com/video/BV1TiMB6rENs/ （同 UP 主的另一版本；简介交代了搬运谱系）
- https://www.bilibili.com/video/BV1wB4Q6pEuW/ （静止画 MAD·两面宿傩高燃剪辑）

### 5.3 官方 / 权威符号来源
- 官方站：https://jujutsukaisen.jp/ ／ https://jujutsukaisen.jp/shimetsukaiyu/ ／ https://jujutsukaisen.jp/onair/
- Fandom（**我通过 api.php 抓到正文原文**）：
  - https://jujutsu-kaisen.fandom.com/wiki/Malevolent_Shrine
  - https://jujutsu-kaisen.fandom.com/wiki/Unlimited_Void
  - https://jujutsu-kaisen.fandom.com/wiki/Black_Flash
  - https://jujutsu-kaisen.fandom.com/wiki/Limitless
  - 取正文的接口形式：https://jujutsu-kaisen.fandom.com/api.php?action=parse&prop=wikitext&format=json&formatversion=2&page=<页面名>
- ja.wikipedia 両面宿儺（现实原型）：https://ja.wikipedia.org/wiki/%E4%B8%A1%E9%9D%A2%E5%AE%BF%E5%84%BA
- pixiv 百科：https://dic.pixiv.net/a/%E4%BC%8F%E9%AD%94%E5%BE%A1%E5%BB%9A%E5%AD%90 ／ https://dic.pixiv.net/a/%E7%84%A1%E9%87%8F%E7%A9%BA%E5%87%A6 ／ https://dic.pixiv.net/a/%E5%85%AB%E6%8F%A1%E5%89%A3%E7%95%B0%E6%88%92%E7%A5%9E%E5%B0%86%E9%AD%94%E8%99%9A%E7%BE%85
- 百度百科：伏魔御厨子 https://baike.baidu.com/item/%E4%BC%8F%E9%AD%94%E5%BE%A1%E5%8E%A8%E5%AD%90/67362177 ／ 无量空处 https://baike.baidu.com/item/%E6%97%A0%E9%87%8F%E7%A9%BA%E5%A4%84/56465166 ／ 黑闪 https://baike.baidu.com/item/%E9%BB%91%E9%97%AA/57267375 ／ 人外魔境新宿决战 https://baike.baidu.com/item/%E4%BA%BA%E5%A4%96%E9%AD%94%E5%A2%83%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98/67698919

### 5.4 术式 / 演出 / 制作技法
- 五条术式（蒼・赫・茈）：https://ciatr.jp/topics/317691 ／ http://likiroku.com/jujutsu-gojou-nouryoku/
- 领域展开与手印总览：https://ciatr.jp/topics/317645 ／ https://aniragablog.com/area_development_hand/
- 宿傩本来の姿（4 臂 4 眼）：https://zen-seer.com/?p=11850
- 世界を断つ斬撃 / 御廚子の解・捌・竈：https://anime-lab.net/jujutsu-sekai/ ／ https://asobigokoro.work/Anime-Manga/jujutsu-kaisen-ryomen-sukuna-techniques-mizushi-kamino/
- 五条家・家紋考察（**无官方定论**）：https://trend-jiji-sidejob.com/jujutsukaisen-gojo-familytree/ ／ https://anime-de-dekiteiru.com/jujutsu-gojo-family/ ／ https://csm-fan.com/?p=18172
- 动画进度与漫画对应：https://comic-rush.jp/jujutsukaisen-anime-manga-guide-comicrush/ ／ https://subculview.com/jujutsu-manga-anime-guide ／ https://masa-tech-blog.com/jujutsu-kaisen-shimetsu-kaiyu-kouhen-dokomade/ ／ https://anisaki.hatenadiary.com/entry/jjk-shimetsukaiyu-kohen
- 涩谷事变 作画/演出解说：https://note.com/lucid_mint3312/n/n18d5cfed72a0 ／ https://csm-fan.com/?p=19793
- 静止画 MAD 制作流程（PS 拆件 → AE 运动）：https://creator-blog.jp/how-to-make-mad-using-still-images/
- 官方 PV（动画）：「死滅回游 前編」PV https://www.youtube.com/watch?v=iUSQenRKsOo ／ https://www.youtube.com/watch?v=TLqf40gcqqk

---

## 6. 我**没能确认**的条目（请勿当作已核实使用）

1. **视频画面本身：我完全没有看过。** 因此以下全部未经证实：
   - 实际剪辑点数量、平均镜头长度、是否有快切/慢镜/闪烁的具体频率；
   - 每个镜头的实际配色（我只有**封面**的像素统计）；
   - **BGM 是什么**。有二手线索指向同 UP 主的其它版本为"雨爱版"（见 [BV1TiMB6rENs](https://www.bilibili.com/video/BV1TiMB6rENs/) 简介），但**无法确认 BV1tTVw6WEzi 用的就是《雨爱》**；
   - 是否包含字幕/文字排版、排版的字体与位置（§2.5 全为通用日式演出惯例推断）。
2. **"同屏多少种高饱和元素会糊"没有一个物理阈值。** §3.2 的数值（≤2 常驻色族、≤20%/35% 覆盖、C ≤ 12 等）是我**基于视觉工作记忆容量、光敏性安全标准与工程经验给出的建议预算**，不是从该视频测得的结论。建议在项目里用 A/B 截图做一次实际校准。
3. **五条家家纹不存在官方定论**（§4.1 已说明）。
4. **鸟居意象需谨慎**：伏魔御厨子的官方文本描述是"**被扭曲的佛龛（厨子）/镇守堂**"，含**牛骨基座、人骨垂挂、四张巨口**；用户提示中的"鸟居"在原文中**未出现**。若美术要鸟居，应作为**二次设计**而非"官方元素"。
5. **火焰意象归属**：火焰/炉（竈・開のフーガ）属于宿傩的**术式**而非领域本体（§4.2 已标注）。
6. **新宿决战是否已动画化**：依据二手文章为"尚未"，但动画排期会变动，**上线前请复核官方站** https://jujutsukaisen.jp/onair/。
7. **本章节 §2.1–2.5 的"规范"数值**为可执行建议，**非考据结论**；考据结论仅是 §1.2 的元数据、封面像素统计与 §4 的官方符号原文。
