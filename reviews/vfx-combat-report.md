# vfx-combat 交付报告：特效形体化 + 后处理曝光保护

任务：task-3 ｜ 负责人：vfx-combat ｜ 写域：`src/fx.js` `src/weapons.js` `src/render.js`

---

## 一、实测到的根因（全部有实机证据，不是推测）

| # | 现象 | 根因 | 证据 |
|---|---|---|---|
| 1 | 「赫」时右侧 2/3 屏幕被青白色冲爆 | 不是 bloom。默认渲染路径下 three.js **只在直出屏幕时**做 ACES tonemap，而术式材质是加法混合、亮度动辄 3~10 ⇒ 全部被压成纯白 | `src/vendor.three.js:12885-12890`（`currentRenderTarget === null` 才取 toneMapping）+ 基线截图 `shots/base-03-red.png` |
| 2 | HUD 被淹没 | `main.js` 在 `!POST_ON` 时用 DOM `#flash` 叠全屏色块，opacity = uFlash × 0.72 | `main.js:789-799`（已由 Lead 降为 0.32、并请 camera-ui 调整 z-index） |
| 3 | 冲击波永远是白青色、且**从不衰减** | `ShockPool` 从来没有人写材质 uniform（`ctx2.mats.shock` 全文件零引用写点）⇒ uLife 恒为 1、颜色恒为默认白/青，最大半径 40m 的白环一路扫过屏幕 | `src/fx.js` 旧 `ShockPool.update()`；本条是"青白色冲爆"的第二主犯 |
| 4 | 红球显白、白球乱闪 | `SpherePool` 所有球共用一份材质，`update()` 只把"最大那个"的参数写进去 | 旧 `SpherePool.update()`（本次重写） |
| 5 | 屏幕被红色方块糊住（Lead 的第一轮 P0） | `combat.js:992` 的 `fx.debris({count:24, color:C.SCARLET})` → `DebrisPool` 是**正立方体** + 纯红 + 用"视线方向"当光照；且尺寸/速度过大、会飘到镜头前 | 探针实测 `/Scene/fx-group/Mesh[x256]` 24 个实例色 `[0.81,0.02,0.02]`；截图 `shots/acc1-02-red.png` |
| 6 | 整体偏暗（darkPct 53~70%） | 场景本身偏暗，后处理没有任何暗部抬升 | Lead 的 `_tools/acceptance.mjs` 基线读数 |
| 7 | worstFps 3.2（300ms 卡顿帧） | three 是"第一次画到才编译 program"，第一次放技能时现编译着色器 | 本次加入 fx 预热后 worstFps 提到 39~66 |

---

## 二、改了什么

### `src/render.js`（后处理管线整体重写）

**曝光保护四道闸**
1. 亮部提取阈值 0.95 → **1.15**，膝部 0.55 → 0.5，并新增每通道软限幅 `uCap=1.35`（泛光源头本身不再是一坨纯白）与高光去彩噪。
2. 泛光叠加每像素封顶 `uBloomCap`（0.45~0.68），泛光再也无法把整片暗部提亮成灰白。
3. **柔肩**（核心）：超过 `uKnee` 的亮度按 `1/(1+k·over)` 压缩，单调连续可导，数学上不可能出现"一片像素卡在 1.0 的死白"。柔肩是乘性的，色相比例不变，特效颜色仍读得出来。
4. 退路钳制 `uCeil`（2.2~2.6）：任何像素都不会超过这个线性亮度。

**曝光抬升（顺序刻意放在柔肩之后）**
`col = col·uExposure + uLift`，再 `pow(col, uGamma)`。这样暗部/中间调抬起来、高光仍被柔肩锁着，不会回到整体过曝。
分档参数用实机标定（`shots/vfx-combat/_tune.mjs`，1600x900）：

| exposure / lift / gamma | avgLum | darkPct | blownPct |
|---|---|---|---|
| 1.40 / 0.0055 / 0.80 | 77.0 | 0.5% | 0%（太亮发灰） |
| **1.08 / 0.0018 / 0.885（采用，high）** | **50~53** | **4~6%** | **0%** |
| 1.05 / 0.0015 / 0.90 | 49.6 | 6.9% | 0% |

**闪光重新定标**
- 上限 0.55 → 0.42，且改成**按已有亮度分配**：`gain = 0.06 + 0.60·flashLum`。
  夜里给暗部无条件加 0.26 线性红 = 一整屏红色滤镜（实测就是「赫」命中那一帧），按亮度分配后只有亮的东西吃大头，暗部只留一点点全屏提亮。
- 中心保护：屏幕中心（战斗焦点）再减 50%，角色永远看得见。
- 衰减改为半衰期 ~0.09s："啪"一下，而不是糊半秒。

**其它**：`setQuality(q)` 以前忽略实参（永远用闭包里的 Q），已修；新增 `setPost/setGuard/setFlashSource/exposure` 调试接口；低配档位单独标定。
**渲染路径**：A(完整后处理) / B(保护直出) / C(裸直出，逃生开关) 三条路都保留，默认走 A/B，曝光保护恒定生效。

### `src/fx.js`

- **SpherePool 整体重写**：每实例一份材质（同 program，不增编译）；内层加**暗核实体**、外壳只画边缘光 + 迎风面亮斑（中心留暗 ⇒ 有剪影）；速度低通求出运动方向、沿方向拉长成彗星体；**spawn 自带去重**（同色同量级半径且距离近的活跃球直接复用并刷新寿命）⇒ combat.js 每帧补的 `life:0.1` 球不再叠成纯白团，**不需要改 combat.js**。迎风面高光取该术式自己的核心色（红技不再顶白帽）。
- **ShockPool**：每实例材质 + 正确的「前缘短促、尾部拉长、越远越弱」亮度包络；RING 着色器新增 `uArc/uArcDir` **方向性扇区**（斥力波前）。
- **BeamPool / SlashPool / AuraPool / GroundRingPool**：同样改为每实例材质并逐实例写 uniform（这几处和 SpherePool 是同一类"共享材质串台"缺陷，不改的话两个技能同屏必然串色）。
- **DebrisPool（P0 修复）**：几何从正立方体改为**顶点随机推歪的混凝土块**；光照从"视线方向"改为**固定主光 + 天空补光**（碎片终于有明暗面）；请求色只占 35%（其余是混凝土灰），刚炸开时按 `heatT` 烧红、0.3~0.6s 内冷却成灰；尺寸/速度/寿命全部收窄；**距相机 1.6m 内的碎块直接缩到 0**（"巨大红色多边形糊屏"就是这么来的）。
- **hitSpark**：有 `dir` 时收束成**锥形**火花（看得出拳从哪来），环状火花绕受击方向成冲击环；白闪粒子从 3~6 颗减到 1~2 颗并砍半尺寸；命中点贴地时自动补**扬尘 + 地面灼痕**。
- **screen()**：统一闸门 —— flash ≤ 0.42、shake ≤ 1.15、blur ≤ 0.30、chroma ≤ 1.2、vignette ≤ 0.7（旧版原样透传，术式动辄 flash=1.0/shake=1.6/blur=0.5）。
- **着色器预热**：创建时点亮"每种 program 一个"的替身网格（11 个 draw call），加载帧里编译完，第一帧 update 收起。第一次放技能不再卡一帧。

### `src/weapons.js`

- **苍（引力球）**：暗核 + **细锐边环**（形体）+ 有螺旋缝隙的吸积盘（差速旋转）+ 螺旋吸入粒子 + 极淡扭曲雾；峰值 alpha 从"满值三层叠"降到 ~0.5/0.66/0.4，吸积盘另加 `uGain`；整体亮度约旧版 45%，靠结构与色彩对比而不是亮度抢画面。DISK 着色器重写：径向窗口只在中段环带显形、细密螺旋缝隙切碎盘面。
- **赫（斥力冲击）整体重建**：暗核 + 裂纹壳（热值大幅调低，不再烤成橙色火球）+ **斥力面**（局部 XY 平面、法线即运动方向的"活塞面"，爆发瞬间外扩）+ **尾部三圈锥环**（越远越大越淡 = 拖尾方向）；爆发时沿运动方向喷**锥形火花** + 冲击环 + 地面灼痕环（细环，soft 0.26，不再是粉色大饼）。半径从 2.2 收到 1.62。
- **CRACK_FRAG**：`uHot·crack·2.6` → `·0.75`，热只留在裂纹本身。
- `createRed` 尾部补上由 setPos 位置差推导的 `_dirVec`，爆发火花才有方向。

---

## 三、量化验收（Lead 的 `_tools/acceptance.mjs`）

最终一轮（dist/新宿决战.html，1600x900，D3D11 硬件）：

| 状态 | avgLum | blownPct | darkPct |
|---|---|---|---|
| melee | 50.1 | **0** | 4.7 |
| blue | 50.9 | **0** | 4.3 |
| red | 47.6 | **0** | 6.3 |
| purple | 43.3 | **0** | 6.1 |
| domain | 53.2 | **0** | 5.1 |

- `avgFps 138.3 / worstFps 54.6`（基线 worstFps 3.2）
- `draws 196 / tris 124k / programs 53`（红线：桌面 ≤250 / ≤250k）
- `verdict.pass = true`；`charRatio`：五条悟 38.4% 屏高、宿傩 36.0%
- 低配档位单独跑（860x480 → QUALITY4=low）：avgLum 41~47、blown 0、darkPct 1.3~5.5、`avgFps 175 / worstFps 66.7`、`calls 122 / tris 34k`
- 移动端竖屏 390x844 的 acceptance **被 mobile-ship 的横屏引导弹窗挡住**（截图 `shots/vfx-combat/accm-01-fight.png` 是"横屏更爽"弹窗），那组 avgLum 15.8 是弹窗本身的读数，不是游戏画面，需要 mobile-ship 处理弹窗后再测。

---

## 四、截图路径（都可用 read_image 直接看）

- 基线复查：`shots/base-03-red.png`（冲爆）→ `shots/vfx-combat/r14-02.png`、`r15-02.png`（同技能现在）
- 「赫」飞行/命中：`shots/vfx-combat/r12-02.png`、`r13-02.png`、`r14-02.png`、`r15-02.png`
- 「苍」：`shots/vfx-combat/r12-07.png`、`r14-07.png`
- 咒力球形体（新 SpherePool）：`shots/vfx-combat/r11-01.png`
- 方向性命中火花：`shots/vfx-combat/r12-09.png`
- 完整试玩：`shots/vfx-combat/play-01..10.png`
- 最终验收留档：`shots/vfx-combat/acc-final-*.png`、低配 `shots/vfx-combat/acclow-*.png`
- 标定曲线：`shots/vfx-combat/_tune.mjs`（自带 avgLum/darkPct 表）

私有工具（不进交付物，放在 shots/vfx-combat/ 下）：`_probe.mjs`（截图 + 场景内省 + forceSkill + apart）、`_tune.mjs`（曝光标定）、`_sandbox.mjs`（用基线城市/角色拼可运行页面，绕开队友半成品模块）。

---

## 五、还剩什么问题（诚实清单）

1. ~~「赫」在飞行段仍偏"白热彗星"~~ → **Lead 已采纳建议**，把 `combat.js:969` 的 `coreColor` 从 `C.GOLD` 改成 `C.SCARLET`，金色迎风面消失，色调回到赤红。
2. **「捌/解」的刀光仍是硬边大面片**：`CRESCENT_FRAG` 的刀身在近距离看是"红白翅膀"，形体偏硬。要做得更像斩击需要重做 crescent 几何与扫掠曲线，本轮时间不够，只保证了它不再糊屏。
3. ~~无限护盾球偏不透明~~ → **已在 Lead 要求下补做（task-3 标 complete 之后追加）**，见下面第七节。
4. **cutscene 里的「茈 200%」看不出效果**：`play-04/06.png` 有字幕但画面里没有湮灭束（远景镜头 + 时机问题，播片属 Lead/cutscene 写域）。需要和 Lead 对一下播片里武器调用的时间点是否落在镜头内。
5. **移动端覆盖率未验证**：被横屏引导弹窗挡住；另外 `QUALITY4=low` 时我的泛光/颗粒关掉、曝光略低，但**没有在真机（触屏 + 竖屏）上跑过**。
6. **泛光在默认路径下仍取决于 main.js 的 `POST_ON`**：我保留了 `post:false → 保护直出（无泛光）` 的语义，若 Lead 之后把 POST_ON 关掉，泛光会消失但曝光保护仍在。
7. **命中顿帧**：我只做了"闪光 + 震动 + 顿帧状态位（`screenState.freeze`）"，真正的时间缩放/顿帧由 combat.js 的 `hitstop` 控制（Lead 写域），我没动。

---

## 七、验收通过后的追加整改（Lead 第二轮要求）

Lead 在 cine 截图里看到"五条悟整个人被封在一个青色胶囊里"，要求再收一档。已做：

1. **护盾皮层换成纯菲涅尔轮廓着色器** `INF_SKIN_FRAG`（新增）。旧版用 `SHELL_FRAG`，alpha 里带 **0.10 的常量底**，正面朝向相机也有一层薄雾，叠上 3 层网格就成了青色胶囊。新版：`a = (rim^1.5 · 0.85 + 噪声·rim·0.30) · uAlpha`，**正面朝向相机时 rim→0 ⇒ alpha→0**（`if (a < 0.004) discard`），只有轮廓处发亮。
2. **网格层 alpha 0.75/0.59/0.43 → 0.50/0.37/0.24**，多层叠加不再糊住主角。
3. **播片/标题状态强制关闭**：护盾 `update` 里读 `window.__SS.state`（只读、防御式判断），`cutscene/title/loading` 时整组 `g.visible = false`，切回战斗自动恢复。护盾是战斗中的被动，不该出现在播片里。
4. 顺手收掉一个新的过亮项：`hitSpark` 的贴地灼痕 `maxRadius` 从 `clamp(size*9,1.2,4.5)` 收到 `clamp(size*4.2,0.8,2.2)`、`soft` 0.5→0.3。原来它在路面糊出一块盖住半条街的深红大圆盘（`inf3-03.png`）。

**验证**：`shots/vfx-combat/inf3-04.png`（护盾现在是能看到里面角色的透明泡壳）、`inf4-03.png`（灼痕只剩脚下一小圈，斩击本体清晰）、`inf-01-cine.png` / `inf-02-cine.png`（播片里不再有护盾）。

5. **顺手把 worstFps 尖峰彻底消掉（weapons 侧着色器预热）**：上一轮我把 fx 的 program 预编译做掉了，
   但术式材质是"第一次放技能才建"的，acceptance 里仍有 `worstFps 6.2~7.4`（130~160ms 卡帧）。
   现在 `createWeapons` 在标题画面阶段（第一次 `update`）把常用术式各生成一次：
   苍 / 赫 / 茈(orb+line) / 解 / 捌 / 开 / 扩张解 / 无下限护盾 / **无量空处 / 伏魔御厨子**，
   全部放在 y=-400 的地底、life 0.01，下一帧自动回收；材质留在池里复用，等于把编译成本前移到加载阶段。
   领域那一项尤其关键：无量空处要现场画 1024² 的"情报"文字贴图（900 次 fillText），不预热必然卡 100ms+。

**最终一轮 acceptance（`shots/vfx-combat/acc-final2-*.png`）**：

| 状态 | avgLum | blownPct | darkPct |
|---|---|---|---|
| melee | 50.3 | 0 | 4.3 |
| blue | 50.7 | 0 | 4.2 |
| red | 46.8 | 0 | 6.6 |
| purple | 52.5 | 0 | 3.6 |
| domain | 51.0 | 0 | 3.5 |

`avgFps 156.9 / worstFps 64.1`（预热前是 6.2~7.4）、`calls 194 / tris 123.5k / consoleIssues []`、`verdict.pass = true`。

---

## 八、第二轮用户反馈回修（打击感 / 曝光 / 护盾时机）

### 8.1 把「打击瞬间的峰值」还回去（问题是持续的过曝，不是瞬时的冲击）
- FLASH_MAX **0.42 → 1.15**（原版 1.6）。
- 合成里的闪光分配从 0.06+0.60·lum 改成 0.10+0.85·lum —— 峰值给足，但仍按「已有亮度 + 屏幕中心」分配，暗部与大面积的夜街不会被洗白。
- fx.screen() 的闸门同步放开：flash ≤ 0.95、shake ≤ 1.35、blur ≤ 0.34、chroma ≤ 1.4；并做 **×1.7 前置放大**。
  原因：实测 combat/main 发来的闪光请求多在 0.35~0.45，经一帧指数衰减后真正打到屏幕上的峰值只有 0.24~0.33，这就是「打起来像敲棉花」的直接原因。
- 衰减曲线保持半衰期 ~0.087s：0.15s 后剩 ~30%、0.3s 后基本看不见。
  **实机逐帧记录 uFlash**：赫+连招峰值 **0.57**、茈峰值 **0.41**，150ms 内回落到 0.23。

### 8.2 把对比度还给画面
曝光重新配比：**少用 gamma 抬中间调（那才是画面被抬平的元凶），改用线性增益抬整体**。

| 档位 | exposure | lift | gamma | bloom | 实测 avgLum | darkPct | blownPct |
|---|---|---|---|---|---|---|---|
| high | 1.30 | 0.0008 | 0.935 | 0.62 | 40~47 | 2.5~10% | **0** |
| medium | 1.28 | 0.0008 | 0.94 | 0.52 | — | — | 0 |
| low | 1.25 | 0.0008 | 0.945 | 0.40 | — | — | 0 |

avgLum 从上一轮的 51~54 降到 39~43 是**有意为之**：上一轮为满足 avgLum 45~60 把中间调整体抬平了，画面发灰、没有夜战味。
这一轮换成「保住黑位 + 提高线性增益」，blownPct 依然全 0。若认为偏暗，只需三档 exposure 各 +0.08，**不要动 lift/gamma**。

### 8.3 冲击波「越扩越细」
uSoft（环带占半径的比例）从恒定改成随扩张衰减到 0.12：半径 16m 的冲击波如果还保持 0.42 的 soft，环带本身就有 7m 厚 —— 屏幕上就是一张盖住半边的实心大饼（用户报的「青色半透明椭球胀到半屏」）。

### 8.4 无下限护盾：确认时机 + 再收一档
- **时机**：startInfinity() 只在「按空格闪避且 CD 就绪」时调用（combat.js:2391），寿命 TUNE.INFINITY_TIME = 0.4s。
  实机逐帧验证：闪避后 0.15s 时 4 个网格在画（weapons.activeCount=1），**0.55s 后归零**；待机/移动时不存在。
- 视觉再收一档：半径 ×0.84、网格 alpha 0.27/0.19/0.11、皮层 0.19、淡出从寿命 55% 就开始。截图 shots/vfx-combat/sh2-01.png（闪避瞬间）、sh2-03.png（已消失）。
- 播片/标题/加载仍然强制隐藏（只读 window.__SS.state）。

### 8.5 长帧定位（worstFps 归因）
页面内长帧记录器（记录每帧 >33ms + 当时游戏状态）实测：
- 加载 + 标题窗口（前 9 秒）：**长帧 0 个** ⇒ 我的预热没有产生长帧，覆盖完整（含本轮补充的 domainClash）。
- t≈9.37s / state=fight / **356ms**：正好是「直接进入战斗」那一刻。
- t≈18.99s / state=fight / **174ms**：进战斗约 2 秒后。
两个尖峰都在战斗开始或技能首次触发，不在我的特效首次使用点（那些已在标题窗口预编译完）。最大嫌疑是战斗开始时的音频（内联 3.77MB base64 MP3 的首次 loop + AudioContext 建图/解码），属 audio.js/main.js 写域。

---

## 六、给 Lead 的接口说明

- `render.composite.uniforms` 仍然存在且 `uFlash` 仍是 DOM 闪光的数据源（上限已提到 1.15，见第八节）；新增只读调试口 `render.exposure`（quality/post/guard/flash/knee/shoulder/ceil/bloom/threshold/exposure/lift/gamma）。
- `render.setPost(true|false)`、`render.setGuard(true|false)`、`render.setFlashSource('dom'|'post')`、`render.setQuality('low'|'medium'|'high')`（本轮修复：以前完全忽略实参）。
- `fx.screen()` 的上限是刻意收紧的（见上），需要更强表现请调"形状/时长"，不要调这几个上限。
- `fx.sphere()` 现在会**合并**同色同尺寸的近距球（一颗球跟着弹体飞），这是 combat.js 不需要改动就能消掉白团的关键；如果将来需要"连续爆裂"的效果，可以给 spawn 传不同的 color/radius 来避免合并。
