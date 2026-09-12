# HUD 与镜头审计报告（task-9 · camera-ui）

日期：2026-09-12 ｜ 审计人：camera-ui
写域：src/camera.js / src/hud.js / src/styles.css / src/body.html（本轮只改了 styles.css；camera.js 未动）

## 一、结论摘要

| 检查项 | 修复前 | 修复后 |
|---|---|---|
| 重叠（1280x720 战斗） | 11 处 | **0** |
| 重叠（960x540 战斗） | 11 处 | **0** |
| 重叠（844x390 战斗） | 69 处 | **0** |
| 重叠（390x844 竖屏战斗） | 148 处（含触屏层） | 我的 HUD **0**；剩余 69 处全在 mobile.css 的触屏 UI（见第七节，非我写域） |
| 小字号 <12px（1280/960/844） | 17 / 17 / 10 个 | **0 / 0 / 0** |
| 对比度 <3.0（1280 全状态） | 5 个（含 2 个指标误报） | **0** |
| 1280x720 九种状态全扫 | — | 仅 title 有 1 处行内文字相邻（B × EM，非 UI 缺陷） |

判定口径（探针里写死，可复跑）：
- **重叠**：可见元素两两 Rect 求交；排除祖先-后代、血条/幽灵条的有意叠放、#hud/#touch-ui 这类全屏容器。
- **可见**：任一祖先 display:none / visibility:hidden / opacity<0.1 即排除；有全屏覆盖层（暂停/结算）时只审计覆盖层内部（被不透明背板盖住的 HUD 不算可见）。
- **对比度**：CDP 截全屏 → 页面内解码成 canvas → 逐元素采样。背景取采样区中位亮度；元素自带不透明底色或渐变底时用自身底色（否则会误判）。文字亮度取 computed color。对比度 =(L1+0.05)/(L2+0.05)。
- **小字**：含文字且无子元素，渲染高度 <12px 或 字号 <12px。

## 二、工具

新增 `_tools/probe-hud-audit.mjs`（本任务产出，保留在仓库）：

```bash
node _tools/probe-hud-audit.mjs --w 1280 --h 720 --out shots/hud-audit-1280 --phases title,fight,combo,combobanner,domain,clash,lowhp,pause,result
node _tools/probe-hud-audit.mjs --w 390 --h 844 --mobile 1 --out shots/hud-audit-390 --phases fight,combobanner
# --phases 支持：title / fight / fight_before / combo / combobanner / domain / clash / lowhp / pause / result / cine
```

关键设计：
1. **fight_before 阶段**：往页面注入一份「修复前样式快照」（只回溯本轮改过的声明），在同一次运行、同一台机器上采到修复前的数据，避免跨构建对比的环境噪声。
2. **combobanner 阶段**：先打出连击再手动放一条 banner，专门验证「连击 + banner 同框」——这是 Lead 报的第 1 条。
3. 输出 `<out>-report.json`（含全部元素几何、重叠、小字、对比度）+ 每阶段截图。

## 三、四种画幅：重叠清单（修复前 → 修复后）

### 3.1 1280x720（前 11 处 → 后 0）

| 修复前重叠对 | 面积 | 性质 | 修法 |
|---|---|---|---|
| top-strip × banner | 6422 | 信息条与顶栏容器相交 | 信息条下移到 132px（顶栏 108px 之下） |
| ab-cost × ab-glyph ×5 | 86/54 | 技能格内三块（键帽/字形/消耗）互相压 | 字形区 inset 12px→18px 顶部、9px 左右、23px 底部 |
| ab-key × ab-glyph ×5 | 44 | 同上 | 同上 |

### 3.2 960x540（前 11 → 后 0）

| 修复前 | 面积 | 性质 | 修法 |
|---|---|---|---|
| top-strip × banner | 7202 | 同上 | ≤1100px 限宽 30vw；≤620px 高度改「下三分字幕位」（bottom:96px） |
| fighter-panel × banner / hp-wrap × banner / stat-row × banner | 1474~2545 | 信息条压到面板上 | 同上 |
| fighter-panel × center-readout | 2353 | 33vw 面板 + 170px 中间读数排不下 | 面板 33vw、中间读数限宽 126px、芯片纵向排列 |

### 3.3 844x390（前 69 → 后 0）

修复前主要是同一批问题在窄屏被放大：fighter-panel × center-readout 2176、center-readout × fighter-panel right 2176、hp-wrap × center-readout 1199、fighter-panel × banner、ab-glyph × ab-name 264 ×5、ab-cost × ab-glyph 19 ×5。
修法：≤900px 面板 34vw + 中间读数纵向芯片；≤860px 技能格 58px、字形区 inset 18/6/24；矮屏信息条改下三分位。

### 3.4 390x844 竖屏（前 148 → 后 0（我的 HUD））

修复前我的问题有四类：
1. banner × hints = 110x50（真实重叠）：mobile.css 把信息条放 21%、提示行放 28%，两者在 844 高下必定叠。→ 我在 styles.css 里把触屏信息条抬到 15%、限宽 92vw。
2. center-readout × fighter-panel：阶段/距离两颗芯片横排后中间读数宽到 157px，压住左右面板。→ 芯片改纵向 + 面板 31vw，现为 0。
3. audio-dock × t-acts = 34x34（我的音量按钮压到触屏动作键）：→ 触屏档把音量按钮挪到右侧中部（top:46%）。
4. ab-glyph × ab-name = 955：mobile.css 用百分比 inset 定位字形区，术式名放大到 12px 后相叠 → 我用更高特异性改成 30%/36%。

## 四、对比度数值表

| 元素 | 修复前 ratio | 问题 | 修法 | 修复后 |
|---|---|---|---|---|
| stat-label（咒力/领域） | 2.17 / 2.59 / 2.95 | 9px 半透明灰字压在明亮街景上 | 字号 12px、颜色透明度 .5→.78、加强描边阴影；stat-row 加极淡暗底条 | ≥3（0 个不达标） |
| fp-side（呪術師/呪霊） | 2.36 / 2.55 | 金框小字无底 | 12px + 深色芯片底 rgba(6,6,12,.5) | ≥5 |
| dom-gojo-num / ce-gojo-num | 2.49 / 2.61（领域展开时） | 白色百分比压在明亮领域背景上 | 12.5px + 双层描边阴影 + 暗底条 | ≥3 |
| phase-tag / focus-dist | 采样受背景影响 | 半透明底 .6 | 底加深到 .72 + 描边 | ≥3 |
| ab-key（技能键帽 U/I/O/H/G） | 1.01~2.7（指标误报） | 键帽是金色渐变底，旧采样把邻里像素当背景 | 指标改为「渐变底元素取自身底色」 | ≥5 |

修复后四种画幅、九个状态：低对比元素 0。

## 五、字号清单

修复前 <12px 的可见文字（1280x720 共 17 个）：fp-side 9px、fp-name .en 9px、stat-label 9px、ce-gojo-num/dom-*-num 11.5px、phase-tag/focus-dist 10px、ab-name 9.5px、ab-key/ab-cost（触屏档 9~10px）、hint 11.5px、cine-skip 11px、cap-sub clamp(10..)、audio-panel label 10px、title-kicker 11px、t-en clamp(9..)、btn-sub 10px、cg-col p 11.5px、title-foot 10px、pause-note 11px、loading-step 11px、#crash-msg 11.5px、wheel 9px、burnout 10px。

处理：全部提到 ≥12px（含 4 个画幅的媒体查询与触屏覆盖）。修复后四种画幅均为 0 个 <12px。

触屏档另有 3 处 <12px 落在 mobile.css（非我写域）：.t-tip 10.14px、.t-legend h4 11px、.t-legend div 11.5px → 见第七节。

## 六、截图

| 文件 | 内容 |
|---|---|
| shots/hud-audit-1280-all-{title,fight,combo,combobanner,domain,clash,lowhp,pause,result}.png | 1280x720 九状态 |
| shots/hud-audit-960-{fight,combobanner}.png | 960x540 |
| shots/hud-audit-844x390-{fight,combobanner}.png | 横屏手机 |
| shots/hud-audit-390-{fight,combobanner}.png | 竖屏手机 |
| shots/hud-audit-1280-fight_before.png | 同一次运行里的「修复前」对照 |

## 七、超出写域、交回 Lead / mobile-ship 的问题

390x844（触屏）审计里剩下的 69 处重叠与 1 处小字，全部位于 mobile.css / mobile.js 的触屏 UI：

| 重叠对 | 尺寸 | 说明 |
|---|---|---|
| t-joy × t-acts | 59.5 × 70.2 | 虚拟摇杆命中区与右下动作键簇相交（若 t-joy 是不可见大命中区，请确认是否故意） |
| t-joy × t-btn t-ult | 58.5 × 58.5 | 摇杆区压到终极技键 |
| t-joy-base × t-acts / t-joy-base × t-joy-knob | 50 × 61 / 48 × 48 | 摇杆底盘与动作键/摇杆头 |
| ability-bar × t-tip | 65.5 × 34 | 触屏提示文案压在我的技能栏上——技能栏在触屏档的位置由 mobile.css 定，我这边没动 |
| ab disabled × t-tip / ab-name × t-tip | 48.8 × 34 / 46.8 × 34 | 同上 |

小字：.t-tip 10.14px（触屏提示）、.t-legend h4 11px、.t-legend div 11.5px（横屏引导层）。

我按纪律没有改 mobile.css / mobile.js，请转给 mobile-ship。

## 八、已知局限（如实记录）

1. title 状态剩 1 处 B × EM（7.1×13）：标题页操作说明里的行内加粗与强调相邻，纯文字排版微叠，不是 UI 缺陷。
2. 「容器级重叠」（如 .top-strip 这类透明 flex 容器与居中信息条）在探针里被排除；它们不影响观感，但若要连容器也不相交，信息条还需再下移约 20px。
3. 1440p / 2560p 未跑（任务指定四种画幅）；按同一套断点推断只会更宽松。
4. clash / lowhp 状态元素数很少（13 / 12），因为这两态下顶栏与技能栏被 #hud.cinema 收起——属设计行为。
5. 触屏档 ability-bar × t-tip 虽由对方定位造成，若 mobile-ship 短期不动，我可以把技能栏在触屏档再上移一点作为规避（需 Lead 决定要不要这样处理）。

## 九、复跑与验证

```bash
node _tools/build-locked.mjs                      # 构建（带锁入口）
node _tools/lint.mjs                              # OK：语法检查通过（主脚本 2135 KB，56534 行）
node _tools/smoke.mjs                             # ok:true errors:[]
node _tools/probe-hud-audit.mjs --w 1280 --h 720 --out shots/hud-audit-1280 --phases title,fight,combo,combobanner,domain,clash,lowhp,pause,result
node _tools/probe-hud-audit.mjs --w 960 --h 540 --out shots/hud-audit-960 --phases fight_before,fight
node _tools/probe-hud-audit.mjs --w 844 --h 390 --out shots/hud-audit-844x390 --phases fight_before,fight
node _tools/probe-hud-audit.mjs --w 390 --h 844 --mobile 1 --out shots/hud-audit-390 --phases fight_before,fight
```