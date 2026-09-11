# 第六轮：攻击/重击之后"动作僵硬"的**真正根因**（每帧更新两次）+ 打击感

用户反馈：「用攻击和重击也会出现这种情况 都是点击某个按键导致后面的动作都不正常 而且攻击也没有打击感」。

这一轮找到的根因比前五轮都硬，而且**是我之前在 fighters.js 里加"松手回收步态"时踩进去的**。

## 一、真凶：角色每帧被 update 了两次

```
main.js 主循环：
  combat.update(inputSnapshot, sdt, gameT)   →  combat.js 内部对每个角色调 c.ctrl.update(d)
  gojo.update(sdt)      ← main.js:834，无条件
  sukuna.update(sdt)    ← main.js:835
```

也就是说**同一个 `update2()` 每帧跑两遍**。第一次（combat 内）消费掉 `moveTowards()` 刚设的 `cmdMove = true`；
第二次（main.js）看到 `cmdMove` 已经是 false，于是：

1. **速度被每帧指数衰减一次** —— 实测 `sp` 只有 **0.19~0.42 m/s**，而设定值是 4.8 m/s。角色实际是用 1/12 的速度在挪。
2. **"松手回收步态动画"被误触发** —— 第一次刚把 `walk` 切好，第二次立刻 `play2("idle")` 打回去。
   实测 `name` 在 idle/walk 之间每帧来回跳，`blend` 永远停在 0.07~0.75（混合权重到不了 1），
   骨骼几乎不动 —— **这就是"点了攻击/闪避/疾跑之后动作僵硬不变"的真身**，跟哪个键无关，只是按键让它暴露出来。

### 修法
1. 删掉 combat.js 里那次重复的 `c.ctrl.update(d)`（`c.p.copy(c.ctrl.getPos())` 保留；一帧一次交给 main.js）。
2. 加兜底：只有**连续两次**更新都没有移动指令，才认为玩家真的松手（`cmdAge >= 2`），
   这样即使将来又出现重复更新，速度衰减和步态回收也不会被误触发。

### 实测（`_tools/probe-dbg.mjs`，出拳后立刻按 W）

| 指标 | 修前 | 修后 |
|---|---|---|
| `sp`（实际速度） | 0.19 → 0.42 m/s | **4.8 m/s**（等于设定值） |
| `blend`（姿态混合权重） | 0.07 → 0.75 反复横跳 | **1.0**（稳定到位） |
| anim | idle 卡到 1.45s 才勉强 walk | **0.25s walk → 0.45s run** 稳定 |
| `blocked`（被冷却挡下的切换） | 每帧 +1，累计 239 | 停在 14 |

## 二、打击感：重击和轻击走的是**完全相同的反馈分支**

`apply()` 里判断重击的唯一依据是 `h.dmg >= TUNE.HEAVY_DMG_LINE(150)`，
而玩家轻击约 35、重击约 60 —— **永远判不出来**。后果：重击和轻击同样的火花数量、同样的 0.3 震动、
同一个 `hit_light` 音效。玩家当然"感觉不到打在身上"。

### 修法
- 近战命中显式带上 `heavyFlag: !!a.flow.heavy`，`heavy` 判据优先看它；
- 反馈整体加强并拉开档次：
  | 项目 | 轻击 | 重击 |
  |---|---|---|
  | 命中闪白 | 1.4 | 2.2 |
  | 火花数量 / 尺寸 | 26 / 0.72 | 44 / 1.05 |
  | 屏幕震动 | 0.62 | 1.20 |
  | 伤害数字 | 白色 | **金色暴击** |
  | 冲击波 | — | 半径 8 |
  | 镜头冲量 | 0.30 | 0.55 |
- **新增方向性镜头冲量**：命中瞬间把镜头沿"受击方向"顶一下再回弹（`cam.panX/panZ`）。
  全向震动只说明"有事发生"，只有方向性位移才能让玩家读出"这一拳从哪儿打进去"。

### 实测（`_tools/probe-impact.mjs`）
```
轻击: shake=0.597  cam kick=0.298  hitSpark=26  damageNumber=3(白)
重击: shake=1.180  cam kick=0.656  hitSpark=44  damageNumber=4(金) shockwave r=8
```

## 三、顺带修掉的两个隐藏 bug

1. **`ctrl` 的只读属性全部是"创建时的快照"**：`get quality/mode/guard/aura/domained` 写在
   `Object.assign(ctrl, {...})` 字面量里 —— `Object.assign` 会**求值**取值器再把结果当普通属性拷进去，
   所以 `ctrl.mode` 永远是 `"normal"`、`ctrl.guard` 永远是 `false`。改成 `Object.defineProperties`。
2. **新增只读诊断出口 `ctrl.dbg`**（`window.__SS.gojo.dbg`）：动作状态全是闭包变量，外部脚本看不到，
   前几轮排查只能靠猜。现在可以直接读到 `name/loop/ended/t/blend/sp/cd/blocked/wantAnim`。

## 回归

| 项目 | 结果 |
|---|---|
| `probe-mash.mjs`（狂点轻击×12 / 重击×8 / 轻重交替×20） | 全部回到 idle；"出拳后立刻前进"从 `idle/0.5rad` 变成 **`run`/1.817 rad** |
| `probe-fuzz.mjs`（随机输入 57s / 9000 帧） | 僵硬滑行窗口 **2 个，时长 0.00~0.03s**（前一轮是 5 个、最长 0.65s 滑 2.6m） |
| `probe-mobilecase.mjs`（手机档） | 闪避后立刻前进 位移 6.68m / 腿摆幅 2.240 / 末态 `run` |
| `probe-release.mjs` | 走路/冲刺/出拳/放术/混战连招 5 场景全部回 idle |
| smoke / acceptance | `ok:true errors:[]` / `pass:true` |

## 已知残留

- 贴身时两名角色模型仍会互相穿插（碰撞半径 0.55）。
- 低俯角下沿街视角的街灯体积光会在个别机位堆成暖色泛光。
- 启动期 1.19s 长任务。
- 玩家对宿傩的实际 DPS 很低（轻击 3 点 / 1800 血），这是原版就有的数值设计（`INCOMING_SCALE: 0.1`
  与原版逐字节一致，本轮没有改）。如果要缩短 TTK，需要单独调这个旋钮。
