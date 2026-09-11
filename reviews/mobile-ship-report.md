# mobile-ship 交付报告 · 手机适配 + 触屏操作 + 公开发布管线

负责人：mobile-ship（task-4）｜日期：2026-09-11
写域：`src/mobile.js` `src/mobile.css` `build/` `deploy/` `_tools/play-touch.mjs`

---

## 一、一句话结论

手机能玩了：**左边虚拟摇杆 + 右边 5 个动作键 + 5 个技能格 + 5 个工具键**，全部走多点触控，
横屏 / 竖屏 / 平板三种布局的几何体检全绿；竖屏会弹一张「横屏更爽」的卡片（不挡按钮，进战斗自动收起）。
发布侧产出 `dist/site/` 完整静态站：**首屏 5.63MB → 2.14MB（gzip 传输约 462KB）**，
2.76MB 音频改成首次交互后才加载，另有一键打包 zip 和七个发布目标的 dry-run 脚本。

---

## 二、改了什么

### 1. `src/mobile.js`（新建，约 950 行）
移动端全部逻辑。设计上刻意把与游戏本体的接口压到最窄：

| 接口 | 用途 | 稳定性 |
|---|---|---|
| **合成 KeyboardEvent**（window keydown/keyup） | 所有动作：輕/重/閃/疾/二、蒼赫茈反領、暂停、全屏、跳过播片 | 与真实键盘同构，键位约定不变就一直能用 |
| `window.__TOUCH = {on,mx,mz,camX,camY}` | 摇杆模拟量（Lead 已在 main.js buildInput 接好） | 契约 |
| `window.__PR_MAX` | 渲染分辨率倍率上限（Lead 已在 applyResize 接好） | 契约 |
| `window.__SS.state / .cam` | 读状态、写镜头 yaw/pitch/zoomBias | 架构文档写明的调试接口 |

> **为什么不用直接调用 main.js 的函数**：重构期间踩过一次 real bug —— 我原本直接调
> `skipCutscene()`，Lead 把它改名后触屏「跳过播片」直接
> `ReferenceError` → 被游戏的全局错误处理当成崩溃弹窗。
> 改成合成键盘事件后，任何内部重命名都不影响触屏。所有事件回调另加 `safe()` 包裹，
> 保证移动端代码**不可能**把游戏拖崩。

功能清单：

* **虚拟摇杆**：可达区域比可视底盘大一圈（底盘内缩 9%），死区 0.16，推到底变金色并切换冲刺提示，松手自动归零。
* **动作键组**：`二`（按住蓄力 200% 茈，松手放）、`疾`（疾走开关，常亮表示开着）、
  `閃`（无下限闪避）、`重`、`輕`（最大、最靠右拇指）。
* **技能格**：直接把 HUD 的 `#ability-bar .ab` 当成触屏按钮（`pointer-events:auto` + 委托事件），
  冷却条 / 耗蓝 / 字形 / 禁用态全部复用 updateHUD 的现成渲染，零重复实现。
  按拇指优先级重排：`領`(最靠拇指) → `反` → `蒼` → `赫` → `茈`。
* **工具键**：◎ 锁镜头 / 画 画质三档 / 全 全屏+横屏 / 音 音量面板 / 停 暂停。
* **镜头手势**：拖动画面转视角（单指），双指捏合缩放（直接写 `cam.zoomBias`、clamp 0.35–3.2）。
* **多点触控**：每个 pointerId 绑定一个角色（摇杆 / 按键 / 镜头），互不抢占；`multi` 实测同时按两个键正常。
* **触屏提示本地化**：教学提示和被打时的提示原本写的是键盘键位（"空格：无下限术式"、"按 G 展开"），
  在触屏模式下按文本节点替换成 `閃` / `点 領`（保留 `<b>` 高亮，MutationObserver 跟随变化，
  只在真的变了才写，不会自激）。
* **空闲淡出**：手指离开 1.4 秒后控件整体降到 55% 不透明度，把战场让出来，一碰立刻回亮。
* **其它**：切后台自动暂停、首次进战斗提示、手感反馈振动（`navigator.vibrate`）。

### 2. `src/mobile.css`（新建，约 22KB）
全部规则锁在 `html.is-touch` 之下，并且追加在 `styles.css` 之后 —— **桌面端一个像素都不变**。
`touch-action` 只写在 `#gl/#hud/#touch-ui` 上（写在 html 上会连带禁掉子元素的手势恢复，这个坑踩过）。

### 3. `build/build.mjs`（重写扩展）
* 模块顺序 = `src/manifest.json`，`mobile.js` 自动接在最后（它要跑在 main.js 之后）。
* 剥掉模块自带的首行 `// src/xxx.js` 注释，避免产物里出现两行同名注释、切分工具丢模块首行。
* 新增 `--out <路径>`（Lead 要求：5 人并行时不互相覆盖 dist 产物）与 `--lenient`（队友文件没落地时跳过并告警）。
* 站点版：`index.html` + 分离 CSS + 抽出音频 + 懒加载器 + PWA 清单 + SW + 自生成 PNG 图标 + robots/_headers/404。
* **踩坑**：three.js 不能拆成独立 `<script>` —— `vendor.three.js` 依赖 `_script-prefix.js` 里的
  `__defProp/__export`，而 IIFE 作用域无法跨文件共享（实测 `ReferenceError: __export is not defined`）。
  所以站点版 `assets/game.js` = 前缀 + three.js + 全部模块，与单文件版是同一段代码。

### 4. `build/verify-build.mjs`（按 Lead 要求改语义）
不再比对「原始 baseline」（我们本来就在有意改 src，必然 DIFF），
改成**构建保真自检**：dist 产物里每个模块的内容必须与 `src/` 下对应文件逐字节一致，样式块 = styles.css + mobile.css。
当前结果：**13 个模块 + 样式块全部 OK**。

### 5. `_tools/play-touch.mjs`（新建，触屏验证工具）
复用 `cdp.mjs`，新增触屏动作：`tap` `tapxy` `hold` `stick`（摇杆拖动）` `drag` `pinch`（双指）` `multi`（双指同时按）` `release` `waitfor`（条件等待）` `audit`（布局体检）` `probe` `fps` `orient` `eval`。
**没有改动 `_tools/play.mjs`**（另外 3 个 teammate 在用）。

### 6. `deploy/`（新建）
* `serve.mjs`：零依赖静态服务器，按 gzip 输出并打印内网地址（手机同 Wi-Fi 直接访问），退出时打印真实传输统计。
* `publish.mjs`：`local | package | github-pages | cloudflare-pages | netlify | surge | cloudflared-tunnel` 七目标，
  **默认 local + 默认 dry-run**，不带 `--yes` 只打印命令，绝不碰远端（按 Lead 的托管决策）。
  `package` 目标用内置极简 ZIP 编码器（zlib deflate + 自写 CRC32）产出 `dist/shinjuku-site.zip`。
* `README.md`：产物结构、本机预览命令、发布命令、体积对比、常见问题。

---

## 三、实测证据

### 3.1 布局体检（`__MOBILE.audit()`，真几何重叠检测，不是"看着还行"）

| 视口 | 控件数 | 遮挡面积 | 战场净空 | 结果 |
|---|---|---|---|---|
| 横屏 844×390 @DPR2 | 16 | 15% | 252px（65% 屏高） | ✅ 无重叠 / 无越界 |
| 竖屏 390×844 @DPR2 | 16 | 13% | 604px | ✅ 无重叠 / 无越界 |
| 平板 1024×768 @DPR2 | 16 | 12% | 510px | ✅ 无重叠 / 无越界 |

体检会同时检查：控件越界、控件互相重叠、控件压住 HUD、HUD 自身互相重叠（竖屏血条面板与中央计时器
原本会撞在一起，已靠 `mobile.css` 压窄三块解决）、战场净空 ≥50% 屏高、遮挡面积 ≤34%。

### 3.2 触屏真的能玩（`dist/新宿决战.html`，844×390 @DPR2）

* 触屏操作打完一轮：**宿傩 1800 → 1362**、五条 1310（AI 同时在打），combo 走到 14，
  页面错误 0、控制台告警 0，FPS 194（p95 6.6ms，最低 89）。
* 更长的一条对拼（45 秒触屏压制 + 90 秒等待结算）：**宿傩 1800 → 1300**、五条被 AI 打到 603，
  全程 0 错误 0 告警，控件浮层始终可点。
  截图 `shots/ms-match-02-mid.png`。
  **诚实说明**：这条自动脚本没能把对手打死，所以我没有截到「结算画面」——
  不是触屏坏了，是我的脚本打得不够好（AI 强度不低）。结算页的「再战 / 返回标题」是原生 DOM 按钮，
  不经过我的触屏层，也不受 `pointer-events` 影响；「暂停 → 结算页 → 继续」这条链路是实测通过的。
* 工具键逐个验证：暂停（state=paused）→ 结算页「继续」恢复、音量面板（`audio-panel t-sheet`）、
  锁镜头（`cam.lockOn=true`）、画质（`__PR_MAX` 1.25 → 1.5）。
* 截图：`shots/ms-play-01-melee.png`（近战连段）、`ms-play-04-purple.png`（茈蓄力）、
  `ms-play-05-multi.png`（双指同时按键）、`ms-util-02-sound.png`（音量面板）、
  `ms-port-02.png`（竖屏战斗）、`ms-port-00-rotate.png`（横屏引导卡片）、
  `ms-tab-01.png`（平板）。

### 3.3 性能（`window.__PR_MAX`）

| 场景 | `__PR_MAX` | 实际画布 |
|---|---|---|
| 桌面 `?touch=0`，DPR2 | **2** | 与改动前一致（Lead 定的默认值） |
| 手机触屏，模拟 DPR3 | **1.25** | 844×390（无上限时是 2532×1170，**像素量差 6.5 倍**） |

档位：低端 1.0 / 中端 1.25 / 旗舰（平板·非手机 UA）1.5；自适应：帧率窗口 <27 就往下压（最低 0.6），
>52 连续 4 个窗口再回升，`window.__SS.stats.mobile` 暴露 `pr / scale / fps / dropped / raised`。

### 3.4 站点版（`http://127.0.0.1:8173/`）

* **音频懒加载真的懒**：交互前 `__BGM_LAZY.loaded=false`、`<audio>` 无 src；
  任意一次交互后 `src=assets/bgm.m4a`、`playing=true`、`duration=225.5s`（3:45，音频本身完好）。
* **首屏传输（gzip）**：styles.css 9KB + mobile.css 7KB + game.js 440KB + manifest 1KB + icon 5KB ≈ **462KB**；
  2.76MB 音频只在交互后下载。
* Service Worker 注册成功，导航 network-first / 静态 cache-first / 音频 runtime cache。
* 站点版同为 200 FPS、无错误、布局体检绿。

### 3.5 体积

| | 单文件版 | 站点版 |
|---|---|---|
| 首屏 | 5.63 MB（音频内联） | **2.14 MB** |
| 音频 | 内联 3.77MB base64 | 2.76MB，交互后按需 |
| gzip 传输 | —— | ≈462 KB |
| 打包件 | —— | `dist/shinjuku-site.zip` 3.13 MB |

---

## 四、还剩什么问题（不美化）

1. **没有跑出「一局打到结算画面」的自动脚本**（上面 3.2 已说明）。触屏的每一个输入通道都单独验证过、
   长对拼也验证过伤害真的打出去了，但"打完整一局"这条我只能给到"能一直打、不崩、伤害有效"，
   给不到"我把它打死了"的截图。要补的话需要一段会走位会闪避的 AI 操作脚本，成本高于收益。
2. **没有真机验证**。所有结论来自 CDP 设备模拟 + 硬件 D3D11，`navigator.vibrate`、iOS 的
   `screen.orientation.lock`、真实触摸采样率都只做了代码路径保护，没在真手机上跑过。
   本机预览器已经能把内网地址打出来（`node deploy/publish.mjs --yes`），有手机就能验。
3. **触屏桌面机（带触摸屏的笔记本）分辨率上限会被压到 1.5**（原本 2）。DPR=1 的机器完全无影响。
4. **暂停时触屏控件会隐藏**（暂停面板自带「继续」按钮），暂停面板是半透明的，控件会在背后隐约可见 —— 属观感小瑕疵，不影响操作。
5. `play.mjs` 的 `skip` 动作在播片阶段点不到（它点的是标题页的「直接进入战斗」按钮）；
   播片中要跳过请用 `key:Space` 或我的 `#t-skip`（`play-touch` 里是 `skipcine`）。
6. **200% 茈（L）在 HUD 技能栏里没有格子**（combat 的 `SKILL_BAR` 只有 5 项），
   我在触屏端单独补了 `二` 动作键；桌面端仍然只有键盘 L，这是既有的 HUD 缺口。
7. 触屏提示的键位替换依赖 `#hints` / `#banner` 这两个 ID；camera-ui 若改名，替换会静默失效（已用 `filter(Boolean)` 兜住，不会报错）。
8. `build/_fixture.mjs` 是我在队友模块半成品期间的开发夹具（拿旧单文件 + 注入移动层），
   不是交付物；验收请用 `dist/新宿决战.html` 或 `dist/site/`。
9. BGM 仍是 2.76MB 的 AAC，没有重新编码压缩（本机没有 ffmpeg 可用）；换成 96kbps 大概能到 1.5MB，
   但会影响音质，建议保持。

---

## 五、交付物清单

```
src/mobile.js                     移动端逻辑（新建）
src/mobile.css                    移动端样式（新建）
build/build.mjs                   构建：单文件 + dist/site（含 --out）
build/verify-build.mjs            构建保真自检（按 Lead 改语义）
build/_fixture.mjs                开发夹具（非交付）
_tools/play-touch.mjs             触屏验证工具（新建）
deploy/serve.mjs                  本地预览服务器
deploy/publish.mjs                一键发布（默认 local + dry-run）
deploy/README.md                  部署说明
deploy/site-shell/                站点外壳模板（懒加载/SW/头/404/图标）
dist/新宿决战.html                 单文件版（5.73MB）
dist/site/                        可托管站点（首屏 2.14MB）
dist/shinjuku-site.zip            打包件（3.13MB）
```

### 给团队的验收命令

```bash
# 触屏（推荐，能验证「真的能玩」）
node _tools/play-touch.mjs --file "dist/新宿决战.html" --query "touch=1" --w 844 --h 390 --dpr 2 \
  --out shots/v --rects \
  --action 'wait:22000,start,wait:2500,skipcine,wait:3000,stick:0:-80:600:keep,tap:[data-act=light],wait:200,release,audit,probe,shot:01'

# 竖屏（不需要手动关引导层，背景已 pointer-events:none）
node _tools/play-touch.mjs --file "dist/新宿决战.html" --query "touch=1" --w 390 --h 844 --dpr 2 --out shots/vp --action 'wait:22000,skip,wait:4000,audit,shot:01'

# 站点版（本机预览，先另开一个终端跑服务）
node deploy/serve.mjs --port 8173
node _tools/play-touch.mjs --url "http://127.0.0.1:8173/" --w 844 --h 390 --dpr 2 --out shots/vs --action 'wait:9000,probe,skip,wait:5000,shot:01,probe'
```
