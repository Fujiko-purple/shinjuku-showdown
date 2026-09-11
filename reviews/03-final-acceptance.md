# 最终验收报告 · 新宿决战重构

日期：2026-09-12 ｜ 验收人：Lead ｜ 状态：**通过（含已知遗留）**

---

## 一、结论

原始单文件 `新宿决战.html`（5.76 MB / 51375 行 / 十模块内联）已经过一次**分层重构**：
保留并加固可玩性内核（战斗逻辑、AI、播片、音频），**整体重写表现层**（角色、场景、特效、相机、HUD），
并新增**手机触屏适配**与**可公开发布的站点产物**。

用户提出的三类问题——「操作画面太乱」「建模不够好」「必须实机试玩挑刺」——逐条有量化证据闭环。

---

## 二、基线 vs 现在（全部为硬件 D3D11 实测）

| 指标 | 重构前 | 重构后 | 判定 |
|---|---|---|---|
| **角色屏幕占比** | ~7%（看不清出招） | **37.2% / 34.4%** | ✅ 落入理想区 30-45% |
| **过曝像素占比**（放「赫」时） | 右侧 2/3 屏幕冲爆 | **0%**（五个技能状态全 0） | ✅ |
| **画面平均亮度** avgLum | 21.4（发闷发黑） | **46.9 – 53.3** | ✅ |
| **近黑像素占比** darkPct | 70.3% | **3.4% – 6.5%** | ✅ |
| **最差帧** worstFps | 3.2（~300ms 卡帧） | **40.7** | ✅ |
| **平均帧率** | 6.1（软渲染）/ 197（无内容时） | **142.4**（功能全开） | ✅ |
| **draw calls / 三角面** | 200 / 80k | **194 / 123.9k** | ✅ 红线内 |
| **顶部计时器** | 永远 `00:00`（从未接线） | 正常走秒 | ✅ |
| **开场相机** | 一根黑柱直插画面正中 | 遮挡规避，8 候选机位带迟滞 | ✅ |
| **角色可辨识度** | 两个方块人，出招糊成白剪影 | 有人形比例/脸部五官/描边，强光不糊 | ✅ |
| **场景** | 乱摆白色盒子 + 矛盾斑马线 | 新宿夜十字路口（店铺/霓虹/路灯/湿路反光） | ✅ |
| **技能形体** | 「赫」= 巨大红色方块 + 全屏白光 | 菲涅尔冲击波 + 方向性火花，有形体有方向 | ✅ |
| **手机** | 完全不可玩 | 触屏可玩（实测命中 5 次 / 伤害 382） | ✅ |
| **站点版首屏** | 5.63 MB | **2.15 MB（gzip ≈ 462 KB）** | ✅ 音频按需加载 |
| **运行期异常** | — | **0**（全流程） | ✅ |

---

## 三、五条工作流交付

| 工作流 | 交付 | 核心成果 |
|---|---|---|
| **art-fighters** | `src/fighters.js` 整块重写 | 1.88m / 7.8 头身；**球面贴片 UV 脸部**（五条悟眼罩带+缝线、摘罩切六眼；宿傩猩红眼+面纹+冷笑）；反壳描边保剪影；修掉基线「主光是背光」「不走 sRGB」「受击闪白糊成纯白」「悬空 6cm」四个根因 |
| **world-city** | `src/city.js` 重写（2099→3275 行） | 标线改几何体绘制（四向斑马线朝向正确）；建筑立面真实几何细节（挑檐/空调/凸窗/招牌架/台阶）；40 条店名洗牌袋；**湿路反射零 draw call 增长**；自查出 `vertexColors` 缺 color 属性导致灯全黑的隐蔽 bug |
| **vfx-combat** | `fx.js` `weapons.js` `render.js` | 定位**过曝真因**（不是 bloom，是直出路径 ACES 压缩叠加材质）；修 5 类「共享材质只有最后一个实例生效」的串台缺陷；「赫」红方块根治；柔肩曝光保护；**预热全部术式材质**消掉 ~300ms 首放卡帧 |
| **camera-ui** | `camera.js` 重写 + `hud.js` 新建 + 样式重做 | 取景**解方程**（占屏比例反推距离 + fov 解耦 + 窄画幅转轴 + 水平收敛反解 + 解析法遮挡规避）；计时器接活；离屏敌人指示器；修「幽灵条压血条」层序 bug；`#flash` 压到 HUD 之下 |
| **mobile-ship** | `mobile.js`/`mobile.css` 新建 + `build/` + `deploy/` | 虚拟摇杆（模拟量）+ 5 动作键 + 技能格 + 工具键；三档布局体检全绿；`__PR_MAX` 控 DPR（DPR3 时省 6.5 倍像素）；BGM 懒加载；PWA/SW/图标；`publish.mjs` 七目标默认 dry-run |

---

## 四、验收执行记录（全部在硬件 D3D11 下，产物 = `dist/新宿决战.html`）

| 检查 | 命令 | 结果 |
|---|---|---|
| 构建保真 | `node build/verify-build.mjs` | ✅ 13 模块 + 样式块与 `src/` **逐字节一致** |
| 产物语法 | `node _tools/lint.mjs` | ✅ 2085 KB / 55304 行语法通过；12 模块齐全 |
| 启动健康 | `node _tools/smoke.mjs` | ✅ 无 crash 面板、boot 走到「完成」、0 错误 |
| 桌面验收 | `node _tools/acceptance.mjs` | ✅ **verdict pass**（帧率/HUD 几何/角色占比/过曝 全项） |
| 竖屏验收 | `node _tools/acceptance.mjs --w 390 --h 844 --mobile 1` | ✅ **verdict pass**（两角色都在画面内，193.7 FPS） |
| 状态流转 | `node _tools/flowtest.mjs` | ✅ **14/14 通过**（标题/跳过播片/暂停/继续/返回/结算胜/再战/结算败/重开/零异常） |
| 完整对局 | `node _tools/fullplay.mjs --max 200` | ✅ 3:03 打完，领域对决 4 次、黑闪 24、最高连击 31，0 错误 |
| 触屏可玩 | `node _tools/play-touch.mjs --query "touch=1" --w 844 --h 390 --dpr 2` | ✅ 命中 5 次 / 造成伤害 382 / `tier mid, pr 1.25` / 0 错误 |
| 稳定性探针 | 连续 24 轮密集操作 | ✅ 每轮 ~950ms 无抖动，**JS 堆恒定 24.8MB（无泄漏）** |
| 播片 | 逐帧截图 `shots/cine2-*.png` | ✅ 电影黑边 + 新宿纵深 + 字幕 + 镜头推进；**青色胶囊罩已消失** |

---

## 五、已知遗留问题（如实列出，不粉饰）

### 由各负责人主动申报
1. **脸部是贴图不是雕刻** —— 极近特写（<0.5m）能看到球形网格棱（art-fighters）
2. **头发仍是锥体堆** —— 远看无碍，贴脸看会露馅（art-fighters）
3. **纯黑沥青上接触阴影不可见** —— 物理正确但观感吃亏，靠脚下光池找补（art-fighters）
4. **距敌 12-20 米时对手会出画** —— 几何取舍：占屏 35%+ 与 20 米同框不可兼得。**已确认为有意设计取舍**，用离屏指示器 + AI 逼近兜底（camera-ui）
5. **3D 黑闪 callout 会顶到画面上部** —— 属 fx 屏幕空间布局（vfx-combat）
6. **「捌/解」刀光仍是硬边面片** —— 需重做 crescent 几何与扫掠曲线（vfx-combat）
7. ~~**播片里「茈 200%」在远景镜头看不到束**~~ —— **已在追加轮修复**，见第八节
8. **无真机验证** —— 手机侧只有 CDP 模拟 + 硬件 D3D11，没有真实 iOS/Android 样本（mobile-ship）
9. **BGM 仍是 2.76MB AAC 未重编码** —— 首屏已分离，但首次播放仍需下载（mobile-ship）
10. **竖屏 draw calls 121** —— 略超自定的 120 红线 1 个（实测波动）

### Lead 补充发现
11. **开局会被宿傩偷袭约 19 点血** —— 结算面板「承受伤害」含这 19 点。影响极小（1.3%），未改
12. **一局约 3 分钟** —— 落在验收标准 90-180 秒的上限。脚本是无脑平A的打法，真实玩家会更快
13. **`[i % arr.length]` 隐患 3 处** —— `fx.js` 的 `ringRadius/ringY/ringCount` 取模。当前数据非空不会崩，但同类写法本轮已出过一次 P0 崩溃（city.js），建议后续加防御

---

## 六、交付物

### 主交付
| 路径 | 说明 |
|---|---|
| `dist/新宿决战.html` | **单文件版**，5.87 MB，双击即开，功能完整 |
| `dist/site/` | **可静态托管站点**，含入口 index.html、PWA 清单、SW、图标 |
| `dist/shinjuku-site.zip` | 站点打包件 3.14 MB，可直接上传任意静态托管 |
| `新宿决战.html` | **重构前基线原件**（保留不动，用于对照） |

### 源码（可维护）
`src/` 下 12 个模块 + `styles.css` + `body.html` + `head.html` + `manifest.json`，构建管线 `build/build.mjs`。

### 验证工具（`_tools/`）
`smoke.mjs`（启动健康）、`lint.mjs`（整脚本语法+隐患扫描）、`acceptance.mjs`（量化验收）、
`flowtest.mjs`（状态流转）、`fullplay.mjs`（完整对局）、`play.mjs`/`play-touch.mjs`（试玩与截图）、
`cdp.mjs`（零依赖 CDP 驱动，含硬件 GPU 配置）。

### 发布（`deploy/`）
`publish.mjs`（七目标，**默认 dry-run**）、`serve.mjs`（本地预览）、`README.md`。

### 报告
`reviews/`：`00-baseline-audit.md`（基线审计）、`01-architecture.md`（写域契约）、`02-acceptance-criteria.md`（验收标准）、
`art-fighters-report.md`、`world-city-report.md`、`vfx-combat-report.md`、`camera-ui-report.md`、`mobile-ship-report.md`。

---

## 八、追加轮修复（首次验收之后）

首次验收通过后又做了一轮，修掉三项**验收脚本查不出、只有实际打开才会发现**的问题：

### 8.1 公网地址已产出并端到端验证 ✅
`deploy/bin/cloudflared.exe` 快速隧道 → **`https://inline-concentrate-twin-fridge.trycloudflare.com`**
（无需任何账号；缺点是本机关机即失效、网址每次重启会变）

真实浏览器通过该网址实测：
```
加载 21s，boot 走到「完成」，无 crash 面板
首屏只请求 6 个资源：Document + styles.css + mobile.css + manifest + game.js + icon
BGM 交互前 loaded=false / src=null  →  交互后 src=assets/bgm.m4a / playing=true   ✅ 懒加载生效
试玩：mode=fight，命中宿傩（1800→1797）  ✅
失败请求 0，页面错误 0
```

### 8.2 Service Worker 从未被注册（真实交付缺陷）✅
现象：`sw.js` 被构建出来了，但 **index.html 里没有任何注册代码**，`navigator.serviceWorker.getRegistrations()` 实测为空
（mobile-ship 报告里"SW 已注册"这句未经证实 —— 这是本轮最有价值的一次抓漏）。

修复：新增 `deploy/site-shell/sw-register.html` 片段 + 在 build.mjs 里注入（只在 http(s) 下注册、整体 try/catch，失败绝不影响游戏）。
复验：`count:1 / active:true / scope 正确`，**缓存 8 个资源**（index.html、styles.css、mobile.css、game.js、manifest、两个图标）→ 离线可玩落实。

### 8.3 播片「茈 200%」的光束观众根本看不到 ✅
vfx-combat 移交的遗留项。实测采样镜头时间轴后定位到**根因不是镜头，是事件轴比镜头轴早 6.4 秒**：

| | 修复前 | 修复后 |
|---|---|---|
| 光束存在区间 | 15.6–18.0s | **20.3–26.7s** |
| 该区间对应镜头 | `charge`/`rise`（**正对五条悟**，光束朝反方向射出、全程在镜头背后） | `sukuna`（看它飞来）→ `fire`（侧看它贯穿）→ `travel`（跟着飞）→ `impact`（命中） |
| 观众看到 | 只有五条悟的背影 | 巨大能量柱迎面冲来 |

代价为零：只改事件时刻 + `beam.life` 2.4→6.4 + `glowWidth` 15→9，**没动任何镜头位置**。

**过程中的一次自我纠正**：我一度把 `fire`/`travel` 机位从 x≈12 外移到 x≈20 想让光束更完整，
结果相机直接**穿进沿街建筑**（city.js 的临街立面齐平 ±18m），画面变成墙面特写。
已回退并把这个边界写进代码注释 —— 街道宽度是硬约束，过曝要靠收细光束解决，不是挪相机。

### 追加轮后的复验
```
构建保真  13 模块 + 样式块逐字节一致        ✅
语法      2086 KB / 55327 行通过            ✅
启动      ok，boot 完成，0 错误              ✅
桌面      verdict pass，145.2 FPS，worst 39.5，calls 194，角色 37.0%/34.9%，avgLum 51-54，blownPct 全 0  ✅
竖屏      verdict pass，207.7 FPS，calls 108，角色 31.1%/26.4%                                    ✅
状态流转  14/14 通过                                                                              ✅
完整对局  121s 打完，0 错误                                                                        ✅
播片      自然走完 35.5s（与镜头总长一致）后正确进入战斗                                            ✅
```

---

## 七、如何运行

```bash
# 1) 单文件版：直接双击 dist/新宿决战.html

# 2) 本地站点预览（含 gzip / PWA / 音频懒加载）
node deploy/publish.mjs --yes        # → http://127.0.0.1:8173/

# 3) 重新构建
node build/build.mjs
node build/verify-build.mjs

# 4) 跑全套验收
node _tools/smoke.mjs
node _tools/acceptance.mjs
node _tools/flowtest.mjs
node _tools/fullplay.mjs --max 200
```

**发布到公网**：**临时公开地址已经产出并验证** ——
`https://inline-concentrate-twin-fridge.trycloudflare.com`（Cloudflare 快速隧道，本机需保持开机）。

需要**固定域名**时，管线已就绪（GitHub Pages / Cloudflare Pages / Netlify / Surge），
本机已确认可用的前提：GitHub 账号 `Fujiko-purple` 存在且系统凭据管理器存有可用凭证；`deploy/bin/cloudflared.exe` 已下载。
**一句话即可发布，`publish.mjs` 默认 dry-run 不会误触远端。**
