# 第四轮：玩家视角实测 → 修掉 4 个"动作/操作"硬伤

本轮不再看静态截图下结论，全部改成**在真实浏览器里跑起来量数据**（硬件 D3D11，200 FPS）。
新增探针都在 `_tools/`，可复跑。

## 1. 攻击/技能/受击之后角色永远僵在最后一帧 —— 已修

**症状（用户原话）**：「人物在经过玩家操作攻击 释放技能等行为的时候，就会陷入某个僵硬动作迟迟不能回复正常」。

**定位**（`src/fighters.js`）：
`update2()` 里一次性动作播完的分支只做了三件事：`curT = dur`、`ended = true`、调 `onEndCb`。
但 `combat.js` 的动作流程（`_start → cast → active → recover → _finish`）**从来不回调播放 idle**，
`onActionEnd()` 也只关了个光环。于是 `curName` 永远停在 `punch` / `hit_light`。
同一处还有第二个洞：`moveTowards()` 里"速度驱动步态"的守卫写成
`if (curName === "idle" || curName === "walk" || curName === "run")` —— `punch` 不匹配，
所以**卡住之后连走路动画都接管不了**，腿一步不摆。

**修法**：
- 一次性动作播完、且回调没有接手新动作（`curName === finishedName`）时，自动 `play2("idle", {loop:true})`；
  倒地/胜负这类必须保持末帧的姿势进 `HOLD_AFTER_END` 白名单，不回 idle。
- `moveTowards()` 的守卫放宽：`!curLoop && ended && !HOLD_AFTER_END[curName]` 也允许接管。

**实测**（`_tools/probe-animrecover.mjs`）：

| 场景 | 修前 | 修后 |
|---|---|---|
| 站立出拳后回到 idle | 4 s 以上仍卡在 `hit_light` | **298 ms** |
| 移动中出拳，腿是否还在摆 | `curName` 卡死，thigh 静止 | thighL 摆幅 **1.178 rad**，kneeL 0.754 rad |
| 放「苍」后回到 idle | 卡在 `cast_point` | 回到 idle |

## 2. 松开方向键后"站着不动、腿却停在迈步中间帧" —— 已修

**症状**：站着不动时 `anim` 仍是 `walk`/`run`（`_tools/shots-final2.mjs` 里抓到的 `run/idle`、`walk/idle`）。

**根因**：`fighters.js` 的 `if (!cmdMove)` 分支只做速度指数衰减，**没有回收步态动画**；
玩家一松手，`moveTowards()` 不再被调用，动画就定格在最后一帧。

**修法**：速度低于 0.9 且当前是 walk/run（或已播完的一次性动作）时回 idle。

**实测**（`_tools/probe-release.mjs`）：走路松手、冲刺松手、出拳后、放术后、AI 混战连招后 ——
五个场景 `anim` 全部回到 `idle`。

## 3. 移动方向「打斗之后变反」 —— 已修并复测

`combat.js` 原来把 `inp.moveX/moveZ` 当**世界坐标**用，实际是屏幕空间。开局相机正好在角色正后方
（yaw≈0）两套坐标巧合一致，一打起来镜头跟着对手转，方向就反了。现在按相机偏航旋转到世界坐标。

**实测**（`_tools/probe-move2.mjs`，判据 = 位移向量 · "远离相机方向"的**归一化**点积）：

| 输入 | 期望 | 实测 |
|---|---|---|
| W（开局） | ≈ +1 | **+0.934** |
| S（开局） | ≈ −1 | **−0.982** |
| W（打斗一套连招之后） | ≈ +1 | **+0.914** |

## 4. 镜头"整屏都是柏油路"、看不见新宿 —— 已改并逐档实拍

上一版把俯角调到 0.54 rad（31°）来换"空旷感"，实测结果是**天际线和霓虹全被切到画外**，
画面就是一张灰色地面贴图。五档实拍对比（0.54 / 0.46 / 0.40 / 0.34 / 0.28）后定在 **0.34 rad（19.5°）**：
画面上方重新露出临街楼体与霓虹招牌，街道纵深更电影感，角色仍只占屏高 ~15%（实测 12.7%–15.1%）。

同时把占屏比从 0.115 提到 **0.15**（解析距离 ≈14 m）：0.105 那一档把相机推到 23 m，
**相机退到临街楼体后面，截图里出现整块黑色楼板糊住上半屏**，而且人物小到看不清动作。

## 5. 「黑闪 / BLACK FLASH」大字压住计时器和血条 —— 已修

`_tools/probe-hudcollide.mjs` 把 DOM HUD 的元素盒全部量出来做两两求交，DOM 之间零重叠；
真正打架的是 **canvas 里的世界空间大字**（`fx.js` 的 `CalloutPool`）：它锚在角色胸口上方，
角色一旦走到画面上缘，大字就顶到顶部的计时器/血条上（截图证据：`shots/FIN-04-combo.png` 里
"BLACK FLASH" 直接压在 "00:05" 上）。

**修法**：每帧把已越过安全线的 callout 沿世界 Y 拉回，安全线 = NDC y 0.46。
**实测**（`_tools/probe-callout.mjs`，把镜头压到最低俯角逼出极端情形）：callout 投影 NDC y = **0.46**，不再越界。

## 6. 手机「点全屏并横屏」不自动横屏 —— 已重写

原来走的是 `tapKey("KeyF")`，而 F 是**切换**键：用户如果本来就是全屏（先按过一次、或系统已全屏），
点这个按钮会被 toggle 成**退出全屏**，随后 `lock()` 因为不在全屏而必然失败 —— 现象就是
"点了既没全屏也没横屏"。

**修法**（`src/mobile.js`）：
- 直连 `documentElement.requestFullscreen({navigationUI:"hide"})`，不再经过 F 键；
- 已全屏则跳过全屏直接锁方向；
- `lock("landscape")` 失败重试 2 次（有些机型第一次会因切换动画未结束而失败）；
- 直连被拒时退回 F 键路径再试一次；
- `orientationchange` / `visibilitychange` 回前台各补锁一次（系统会重置方向锁）；
- iPhone（无 Screen Orientation API）给出可执行提示：手动横屏，或「添加到主屏幕」（manifest 已声明 `orientation:"landscape"`）。

**实测**（`_tools/probe-fs2.mjs`，模拟 390×844 竖屏手机 + 真实触摸事件）：
`{"fsl":{"requested":true,"fs":"ok"},"full":true}`，`requestFullscreen` 成功、无崩溃、无页面错误
（headless Chrome 里 `lock` 报 `NotSupportedError` 属预期，真实安卓机支持）。

## 回归验证

| 项目 | 结果 |
|---|---|
| `node build/build.mjs` | 13 模块全部内联，样式 52141 B |
| `node _tools/lint.mjs` | 语法通过（主脚本 2109 KB / 55909 行） |
| `node _tools/smoke.mjs` | ok=true, errors=[] |
| `node _tools/acceptance.mjs` | verdict.pass = true；角色占屏 heightPct 21.5 / 20.8，screenY ≈ 0.02 居中 |
| `node _tools/play-touch.mjs` | 手机档 avgFps 200.1 / minFps 91.7，193 draw calls，无脚本错误 |
| 相机（`window.__CAMUI`） | pitch 0.343–0.35，frac 12.7–15.1，occl 0 |

## 仍未解决 / 已知限制

1. iPhone Safari 不支持 `screen.orientation.lock`，只能手动横屏或装到主屏幕（已给提示）。
2. 没有真机测试条件，手机侧全部是 CDP 设备模拟（390×844 / 触屏事件）。
3. 启动期仍有一个 1.19 s 的长任务（分镜编排 → 完成），首屏会有一次可感知的停顿。
4. 两名角色贴身时模型会互相穿插（`shots/FIN-04-combo.png`），碰撞半径 0.55 偏小。
5. 「捌 / 解」刀光边缘仍是硬边（无软边遮罩）。
