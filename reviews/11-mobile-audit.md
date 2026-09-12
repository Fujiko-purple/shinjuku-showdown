# 手机档与性能审计（task-10 · mobile-ship）

日期：2026-09-12 ｜ 写域：`src/mobile.js` `src/mobile.css` `build/` `deploy/` `reviews/11-mobile-audit.md`
探针：`_tools/probe-mobile-longtask.mjs` `_tools/probe-mobile-bootprofile.mjs` `_tools/probe-mobile-prewarm.mjs` `_tools/probe-mobile-perf.mjs` `_tools/probe-mobile-pwa.mjs`
（另有 camera-ui 的 `_tools/probe-hud-audit.mjs` 用于重叠/字号复测）

---

## 一句话结论

启动期最大的长任务 **1316ms → 795ms**（「预热」那一步 1317ms → 631ms）；
390x844 竖屏触屏层重叠 **68 → 0**（四画幅全部 0 重叠 / 0 小字 / 0 低对比）；
30 秒战斗 **avgFps 173.4**（p95 8.0ms，>33ms 长帧 2 帧，占 0.04%）。
PWA 17/17 静态检查通过，断网刷新仍能进游戏。

---

## 一、启动长任务（第 1 项）

### 1.1 探针怎么做的

`Page.addScriptToEvaluateOnNewDocument` 在 **navigate 之前** 注入两样东西：
Long Task 观察器；以及劫持 `window.__BOOT` 的 `step` 赋值 —— 这样 main.js 的每一步
（检测图形环境 → 生成新宿废墟 → 构建术式特效 → 合成咒力音频 → 召唤术师 → 展开战场逻辑 →
编排分镜 → 预热 → 完成）都带上了毫秒时间戳，长任务能直接对上号。

### 1.2 修前：启动期长任务清单（844x390 @DPR2）

| 起始 | 持续 | 落在哪一步 |
|---|---|---|
| 656～709ms | **1170～1317ms** | 预热（三帧 warmUp + camInit + applyResize + bindUI） |
| 紧接着 | 248～427ms | 完成（loop2 第一帧，后处理管线首次启用） |
| 251～377ms | 197～258ms | 生成新宿废墟（createCity） |
| 473～591ms | 102～182ms | 构建术式特效（fx/weapons） |
| 151～224ms | 100～143ms | 检测图形环境（createRender） |
| 470ms | 96ms | DOMContentLoaded |

合计 2439～3455ms。

### 1.3 归因：不是 JS 在算，是主线程在等驱动

`_tools/probe-mobile-bootprofile.mjs`（CDP Profiler，200µs 采样，只分析 640～1900ms 窗口）：

| 自耗时 | 占比 | 函数 |
|---|---|---|
| 239.4ms | 56% | `onFirstUse`（three.js：同步 `getProgramParameter(LINK_STATUS)`） |
| 115.0ms | 27% | `getExtension`（three.js 逐个查 WebGL 扩展） |
| 其余 | 17% | 零散 JS |

同时用 WebGL 钩子量了编译本身：`compileShader 94 次 / linkProgram 47 次，合计 0ms` ——
也就是说 Chrome 早就把链接丢给驱动异步做了，three.js 在 `checkShaderErrors=true` 时
**同步等结果**，47 个 program 的等待全压在主线程上。

### 1.4 修法（全部在 `src/mobile.js` 内，不动任何别人的源文件）

`prewarmTick()` 在 **loading 阶段**就把场景渲染出来、并且分帧摊开：

1. 触发信号：`scene.children.length` 变化 **或** `#loading-step` 文案变化（后者能抓到
   「往已有 group 里加内容」的那几步），没变化时每 260ms 兜底一次，最多 16 次。
2. 每次触发渲染一帧，用的是和 main.js `warmUp()` 完全相同的 `renderer.render(scene, godCam)`。
3. 这期间临时把 `renderer.debug.checkShaderErrors` 置 false（避免同步等链接），
   **载入一结束立刻还原**（实测 `restored:true`，不影响后续 shader 报错排查）。
4. 拿不到 API / 抛异常都静默退回原行为；`?prewarm=0` 可一键关掉。

对照实验（`probe-mobile-prewarm.mjs`，同一份产物）：

| 模式 | 预热步骤 | 结论 |
|---|---|---|
| none | 1609ms | 对照组 |
| async（提前 `compileAsync`） | 1527ms | 没用：`compile()` 自己也会同步等链接 |
| render（只分帧渲染） | 1651ms | 更差 |
| **renderquiet（分帧 + 关诊断）** | **806ms** | 采用 |

### 1.5 修后（同一份产物，`?prewarm=0` vs 默认，各两次）

| | 最大长任务 | 预热步骤 | 长任务合计 | 完成时刻 |
|---|---|---|---|---|
| 前 `?prewarm=0` | 1316 / 1137ms | 1317 / 1138ms | 3455 / 2439ms | 2025 / 1729ms |
| 后（默认） | **795 / 841ms** | **631 / 624ms** | 3110 / 3826ms | 2447 / 2460ms |

* 最大长任务 **−33%**，预热那一步 **−48%**，而且冻屏从「最后一步、最显眼」挪到了
  「构建术式特效」阶段（载入条还在动）。
* 总工作量不会凭空消失（就是 47 个 program 的链接时间），现在只是摊到了多帧里；
  长任务合计没有下降，反而略升（分帧带来的额外场景遍历）。
* **剩下的 630ms 是最后一两步新加的内容 + camInit/applyResize/bindUI**。
  想再往下只能改 main.js：把 `warmUp()` 的三次渲染改成 `await` 分帧（见第五节）。

---

## 二、四画幅触屏布局（第 2 项）

复测工具：camera-ui 的 `_tools/probe-hud-audit.mjs`（枚举可见元素两两求交 + 字号 + 对比度），
每个画幅跑 fight / combo / clash / lowhp / pause / result 六个 phase。

| 画幅 | 修前重叠 | 修后重叠 | 小字(<12px) | 低对比(<3) |
|---|---|---|---|---|
| 390×844 竖屏 | **68** | **0** | 0 | 0 |
| 844×390 横屏 | 22~30 | **0** | 0 | 0 |
| 360×640 小竖屏 | 86 | **0** | 0 | 0 |
| 1024×768 平板 | 20 | **0** | 0 | 0 |

### 修了什么

1. **摇杆命中区（Lead 要求 1）**：容器改成「底盘 + 四周各外扩 8px」，用 `margin:-8px`
   抵消掉外扩，底盘视觉位置不变 → 拇指擦边仍可按；同时把旋钮移进底盘内部
   （本来就是包含关系，不该被当成同级重叠）。
2. **竖屏动作键改两行（上 3 下 2）**：5 个键横排会顶到摇杆命中区（实测相交 59.5×70.2），
   两行后最大宽度 3 键；`--t-core-h` 跟着改成 `t-btn-lg + t-btn + gap`
   （「輕」比别人高 12px，少算这 12px 技能栏就会被压住）。
3. **工具键改横排、排在技能栏正上方**：这是横竖屏唯一天然空的区域（顶部是 HUD、
   右边缘是音量坞、底部是动作键）；位置完全由技能格几何推导，不依赖动态测量。
   命中区 30px → **44px**。
4. **提示条 #t-tip**：横屏挂在摇杆上方；竖屏抬到「技能栏 + 工具键」之上，
   并加 `max-width` + 换行，不再压技能栏、也不顶到右边缘音量坞。
5. **字号 ≥12px（Lead 要求 3）**：`.t-tip` 10.14→12、`.t-legend h4` 11→12.5、
   `.t-legend div` 11.5→12.5、`.t-rotate p` 11→12、技能格 `.ab-name` 8.5→12、
   `.ab-cost` 9→12、`.phase-tag` 7/8→12；删掉 9px 的 `.t-joy-hint`（本来没在用）。
   技能格内部给费用/名称写死 `height:12px; line-height:12px`，消掉与字形盒子之间 1～2px 的擦边。
6. 平板：技能格收小到 ≤58px，避免技能栏一路推到左下摇杆身上。

截图：`shots/m10-390x844-0{1,2}.png` `shots/m10-844x390-0{1,2}.png`
`shots/m10-360x640-0{1,2}.png` `shots/m10-1024x768-0{1,2}.png`

---

## 三、性能：30 秒战斗（第 3 项）

探针 `_tools/probe-mobile-perf.mjs`（每帧耗时 + 操作时刻标记），844×390 @DPR2，全程触屏操作：

| 指标 | 值 |
|---|---|
| avgFps | **173.4** |
| avgFrame / p95 | 5.8ms / 8.0ms |
| worstFps（单帧最长 179ms） | 5.6 |
| 长帧 >33ms | **2 帧**（0.04%） |
| 长帧 >100ms | 1 帧 |
| draw calls / 三角面 | 129 / 37.3k |
| 页面错误 | 0 |

* 唯一一次 >100ms 出现在 t=42700ms 的 melee 标记附近，**不是**技能/领域时刻 ——
  技能与领域都打在标记点上，没有对应的长帧。
* 需要盯的只有 **draw calls 129 > 红线 120**（横屏手机档）。这是渲染侧的，不在我的写域，
  已记录；三角面 37.3k 远低于 120k 红线。

---

## 四、PWA 与离线（第 4 项）

`_tools/probe-mobile-pwa.mjs`（起 `deploy/serve.mjs` 到 8188 端口，用 `tmp/ms/site` 私有产物）：

* **静态检查 17/17 通过**：manifest 的 name/short_name/start_url/scope/display(fullscreen)/
  orientation(landscape)/background_color/theme_color/icons 全部就位；
  三个图标都是真 PNG（192×192、512×512、180×180，解析 PNG 头验证过）。
* **Service Worker**：注册 1 个、scope = 站点根、active；缓存 `shinjuku-2026...` 里
  8 个外壳文件（index.html / styles.css / mobile.css / game.js / manifest / 两个图标）。
* **断网刷新**：`Network.emulateNetworkConditions {offline:true}` 后 reload →
  标题正确、`__BOOT.ok = true`、step = 完成、canvas 存在、state = title —— **离线能完整进游戏**。
  截图 `shots/m10-pwa-offline.png`。

---

## 五、超写域、交回 Lead 的

1. **main.js 的 `warmUp()` 还是同步三连渲染**。我这边已经把长任务摊到 795ms，
   但要彻底消掉最后这一下，需要它变成分帧版本：

   `async function warmUp() { applyResize(); for (let i = 0; i < 3; i++) { render.render(scene, godCam, 1/60); await yieldFrame(); } }`

   （`boot()` 里改成 `await warmUp()`）。改完我可以立刻用同一套探针复测。
2. **draw calls 129 > 红线 120**（844×390 手机档，30s 战斗采样）。渲染侧优化，归 vfx/city。

---

## 六、探针清单（都可复跑）

```bash
# 启动长任务清单 + 归因时间线
node _tools/probe-mobile-longtask.mjs --mobile 1 --w 844 --h 390 --dpr 2 --wait 14000 --query "prewarm=0"   # 修前
node _tools/probe-mobile-longtask.mjs --mobile 1 --w 844 --h 390 --dpr 2 --wait 14000                        # 修后

# CPU 采样：1.2s 花在哪个函数
node _tools/probe-mobile-bootprofile.mjs --mobile 1 --w 844 --h 390 --dpr 2 --wait 16000 --top 16

# 修法对照实验（none / quiet / async / render / renderquiet）
node _tools/probe-mobile-prewarm.mjs --mode renderquiet --w 844 --h 390 --dpr 2

# 30 秒战斗帧率
node _tools/probe-mobile-perf.mjs --w 844 --h 390 --dpr 2 --sec 30

# 四画幅重叠/字号（camera-ui 的探针）
node _tools/probe-hud-audit.mjs --w 390 --h 844 --mobile 1 --out shots/hud-390

# PWA + 离线（先起服务）
node deploy/serve.mjs --port 8173
node _tools/probe-mobile-pwa.mjs --url http://127.0.0.1:8173/ --dir dist/site
```
