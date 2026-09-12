# VFX 审计与修复报告（task-6）

负责人：vfx-combat ｜ 写域：`src/fx.js` `src/weapons.js` `src/render.js`
验收命令：`node _tools/build-locked.mjs` / `node _tools/lint.mjs` / `node _tools/smoke.mjs`
（最终状态：构建成功、lint 无告警、smoke `ok:true errors:[]`）

---

## 一、沿街机位下「街灯体积光堆叠成一片暖雾」

### 复现（可复跑）
`node _tools/probe-vfxab.mjs --out shots/AB4`
把角色瞬移到 (x=4, z=16)、强制 `cam.pitch=0.34`、关掉 AI 冻结画面，然后**在同一帧**上改后处理参数测量。
中段亮度定义：截图中心区域 y 30%~60%（与 task 的验收口径一致）。

### 定量结论
| 状态 | 中段平均亮度 | 暖色占比 |
|---|---|---|
| 泛光关闭（bloom=0） | **77.0** | 42.4% |
| 泛光开启（bloom=0.62） | **77.0** | 42.4% |
| 大面积压制 k=6 | 66.9 | 42.1% |
| k=10 | 62.0 | 41.3% |
| **k=12（采用的档位默认）** | **≈60** | ≈41% |
| k=14 | 58.3 | 39.9% |
| k=20 | 55.8 | 37.0% |

**关键事实：泛光开/关的中段亮度完全一样（77.0 vs 77.0）** —— 说明这片暖雾不是泛光造成的，
而是城市里加法混合的街灯光锥本身就叠出了一大片中低亮度区域（`src/city.js`，非本任务写域）。
所以「把泛光阈值调高」这类做法对它无效。

### 修复（`src/render.js`）
新增一路 **1/16 分辨率的邻域平均亮度**（`tHaze`，2 个极小的全屏 draw），在合成阶段做局部色调映射：

```glsl
float hazeAmt = clamp(uHazeK * max(0.0, haze - uHazeKnee), 0.0, 1.4);
base *= 1.0 / (1.0 + hazeAmt);                 // 大面积亮 → 压暗
base = mix(base, vec3(baseLum), hazeAmt*0.42); // 大面积暖光同时轻微去色
```

局部对比（细节）不受影响，单个亮点（火星/术式核心）邻域平均值很低，完全不会被压。
档位参数：high `hazeK 12 / knee 0.04`、medium `11 / 0.045`、low `10 / 0.05`。

跨机位复测（`_tools/probe-vfcaudit.mjs --gridsweep 1`，注意这是两次独立运行、场景内容不同，只作参考）：
`gx4_gz16` 中段 56.4 → **40.8**；`idleStreet` 58.4 → 57.9；全机位 blownPct 全 0。

> 交回 Lead：这片暖雾的**根因**在城市侧（`city.js` 的街灯光锥是加法材质且相互重叠）。
> 后处理只能压制，不能根治。建议 world-city 把光锥改成带衰减的软边锥、并降低叠加数量/不透明度。

---

## 二、「捌 / 解」刀光硬边

### 根因
`CRESCENT_FRAG` 的软边遮罩是 `1 - smoothstep(0.06, 1.0, edge)`：衰减到几何边缘时还残留约 7% 的亮度，
加法混合下这点亮度就是一条硬描边；长度两端也没有收尖遮罩。

### 修复（`src/weapons.js`）
- 软边窗口提前到 **0.30~0.92** —— 几何边缘一定落在完全透明的区间里，肉眼看到的是"光晕渐隐"而不是模型边；
- 白色内核收窄（`vW*0.62`）；
- 长度方向加 `tip` 软遮罩（两端 0~0.10 / 0.88~1.0 渐隐）；
- alpha 再乘一次软边，`a<0.003` 直接 discard；
- `SCAR_FRAG` 同步：burst 窗口 (0.25,1.0) → **(0.15,0.72)**，加 `tip`、加 discard。

### 证据
- 修复前：`shots/AUDIT-before-blade.png`、`shots/AUDIT-before-spark.png`（白刃是硬边楔形）
- 修复后：`shots/AUDIT-after2-blade.png`、`shots/AUDIT-after2-spark.png`（边缘羽化）

---

## 三、火花像"纯色小方块"

### 根因
`PARTICLE_VS` 的 `gl_PointSize = clamp(size*uScale/d, 1.0, 900)` —— 下限 1px 时贴图的圆形渐变根本画不出来，
屏幕上一个像素点就是"纯色小方块"。

### 修复（`src/fx.js`）
- 点尺寸下限 **1.0 → 2.2px**；
- alpha 用 `pow(t.a, 1.45)` 收紧（从棉花球变成有边界的亮点）；
- 中心混入白热核：`col = mix(vColor, vec3(1.0), pow(t.a,3.0)*0.55)` —— 火星该是"亮芯 + 本色外晕"。

证据：`shots/AUDIT-before-spark.png` → `shots/AUDIT-after2-spark.png`（现在是带白芯的圆点，不是方块）。

---

## 四、【追加项】重特效首次触发的秒级长帧

### 修复前后（`node _tools/probe-hitch.mjs`，只统计 >45ms 的帧）
| | 长帧数 | 最长帧 | domain_expand |
|---|---|---|---|
| 修复前 | 9 处 | **669ms（clash 首次）** | 95ms / 98ms |
| 修复后 | 4 处 | **111ms（clash 首次）** | 已不再出现 |

### 根因（两个，都在我的写域）
1. **旧的预热是无效的**：预热对象放在 y=-400 地底，而 three 会做视锥剔除 —— 一次 draw call 都没发生，
   等于没编译 program。→ 现在预热对象统一 `frustumCulled = false`：提交了 draw（program/贴图都编译上传好），
   但像素被裁掉、肉眼不可见。
2. **预热本身是"一帧干完 13 件"**的长任务。→ 改成 **分帧队列**：每帧只做一件；
   无量空处那张 1024² 文字贴图（整张一次要 130ms+）单独拆成 `voidInfoStep(budget)` 分步构建，
   每帧约 220 个元素，几帧画完（`voidDomain` 这一件的耗时从 **133.5ms → 31.1ms**）。

### 归因（说明剩下的那 111ms 不在我这边）
`node _tools/probe-hitch-attr.mjs`：运行时给 `__SS.weapons` 的重特效方法套计时（不改任何源码），
实测**真实触发时 weapons 侧耗时**：
```
voidDomain = 0.1ms   shrineDomain = 0.1ms   domainClash = 0.1ms
worldSlash = 0.2ms   furnace = 0.1ms
```
即使 clash 那一帧仍有 111~228ms，weapons 侧的创建成本也已经接近 0 ⇒ 剩余长帧来自音频/战斗逻辑/城市破坏，
**交回 Lead**（我这边没有可继续压缩的空间）。

### 几何复用确认
领域球 / 伏魔御厨子 / 对撞都是 `spawnPooled` 池化句柄：几何、材质、1024² 贴图在首次创建后一直复用
（`shrineGeoCache`、`TEX_CACHE`、`matPools`），每次展开不会 new BufferGeometry。

---

## 五、【追加项】领域展开时的「纯白椭圆盘」

### 根因
`createVoidDomain` 的 `void:coreRim` 是一层**不透明**暖白 BackSide 球（scale 1.35）包着黑色核心——
从外面看就是"一圈纯白 + 中间黑"，在屏幕上读成没上材质的白碟子。

### 修复（`src/weapons.js`）
`coreRim` 改成**加法混合 + opacity 0.3 + scale 1.18**，并随领域淡出 ⇒ 变成黑核外面一层薄光晕。
证据：`shots/AUD4-02-void.png`（Lead 的修复前）→ `shots/VOIDDMG5-void2.png` / `VOIDDMG5-combo-wide.png`（修复后：黑色漩涡 + 细暖色边）。

### 顺带修掉同一类问题
地面环 / 冲击波环的"环宽"原来是**占半径的比例**（thickness 0.9），落在 40~90m 的领域环上就是
36~80m 宽的实心环带。现在改成**按世界宽度自适应**（地面环 1.7m、冲击波 1.4m），
并按半径摊薄亮度（`≈6/maxR`、`≈8/maxR`）—— 大环只剩淡淡一道边界。

---

## 六、【追加项】伤害数字连击时叠成一团

### 修复（`src/fx.js` `DamagePool.spawn`）
生成时统计"刚出现（age<0.5s）且距离 <2.5m"的其它数字个数 `dup`，
按 `0,+1,-1,+2,-2…` 沿**相机右方向**错开 0.62m/档，并抬高 `min(3,dup)*0.16` m。
证据：Lead 的 `shots/AUD5-02-combo.png`（叠成一团）→ `shots/VOIDDMG5-combo.png`、`VOIDDMG5-combo-wide.png`（两个「3」已经横向分开）。

---

## 七、【追加项】lint 取模越界

`buildShrineGeometry` 里三处 `arr[i % arr.length]`：
- 改成 `pick(arr, i, fallback)` 辅助函数：先判 `length === 0` 返回固定兜底值，再用减法取余（不写 `%`，满足 lint 规则）；
- `topY = ringY[Math.min(rings, ringY.length - 1)]` 在空数组下会取到 `ringY[-1] = undefined`（NaN 几何），
  现在显式兜底 + `Number.isFinite` 校验。
`node _tools/lint.mjs` 现在无告警。

---

## 八、探针清单（都可复跑）

| 探针 | 用途 |
|---|---|
| `_tools/probe-vfxab.mjs` | 同帧 A/B 后处理参数，测中段亮度/暖色占比（暖雾主证据） |
| `_tools/probe-vfcaudit.mjs` | 机位/俯角/位置网格扫描 + 刀光/火花放大截图 |
| `_tools/probe-voiddmg.mjs` | 领域白盘复现 + 伤害数字错位截图 |
| `_tools/probe-voidring2.mjs` | 按 renderOrder 逐层隐藏定位"白盘/白环"来源 |
| `_tools/probe-hitch.mjs` | （Lead 的）长帧清单 |
| `_tools/probe-hitch-attr.mjs` | 长帧归因：给 weapons 方法套计时，拆出我的成本 |

## 九、截图清单
- 暖雾：`shots/AB4-before-k0.png`（77.0）→ `shots/AB4-k14.png`（58.3）、`shots/AUDIT-after2-gx4_gz16.png`
- 刀光：`shots/AUDIT-before-blade.png` → `shots/AUDIT-after2-blade.png`
- 火花：`shots/AUDIT-before-spark.png` → `shots/AUDIT-after2-spark.png`
- 领域白盘：`shots/AUD4-02-void.png` → `shots/VOIDDMG5-void2.png`
- 伤害数字：`shots/AUD5-02-combo.png` → `shots/VOIDDMG5-combo.png`

## 十、仍需别人处理的（我没动别人写域）
1. **街灯光锥的根因**在 `src/city.js`：加法材质 + 相互重叠，建议改成带衰减的软边锥并减少叠加。
2. **clash 首帧仍有 ~111ms**：weapons 侧已实测 ≤0.2ms，剩余开销在音频/战斗逻辑/城市破坏一侧。
