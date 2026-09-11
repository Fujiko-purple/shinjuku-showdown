# 架构与接口契约（全员必读）

## 写域（一个文件同一时间只有一个人写）

| 文件 | 独占负责人 |
|---|---|
| `src/city.js` | world-city |
| `src/fx.js` `src/weapons.js` `src/render.js` | vfx-combat |
| `src/fighters.js` | art-fighters |
| `src/camera.js`(新) `src/hud.js`(新) `src/styles.css` `src/body.html` | camera-ui |
| `src/mobile.js`(新) `src/mobile.css`(新) `build/` `deploy/` | mobile-ship |
| `src/main.js` `src/combat.js` `src/cutscene.js` `src/audio.js` `src/contract.js` `src/manifest.json` | Lead |

**越界即冲突。需要改别人文件时，发消息给 Lead 或该文件负责人，不要直接改。**

## 构建

```bash
node build/build.mjs        # src/ -> dist/新宿决战.html（单文件）+ dist/site/
node build/verify-build.mjs # 等价性自检
```

**每个模块必须保持「裸 JS 顶层语句」的写法**：不要写 `import`/`export`。
所有模块被同一层 `(() => { ... })()` 包裹，模块间通过顶层 `var/const/function` 直接互相引用。
需要新增模块时，改 `src/manifest.json` 的 `modules` 数组（**只有 Lead 能改**）。

## 必须遵守的既有全局符号（改名会炸）

- `C`（颜色）、`SIDE`、`SKILL`、`QUALITY4` —— contract.js
- `createCity(opts)` → `{ group, update(t,dt), dispose() }` —— city.js
- `createFx(scene, opts)` —— fx.js
- `createWeapons(opts)` —— weapons.js
- `createFighter(who, opts)` → 含 `{ root, update(dt), play(name,o), setPos, getPos, getYaw, faceTo, moveTowards, hitFlash, setGuard, setAura, setDomained, setVisible, setScale, setMode, setBlindfold, reset, bones, handR, handL, chestPoint }` —— fighters.js
- `createRender(opts)` → `{ renderer, composer, render(scene,camera,dt), resize(w,h,pr), impulse(o), getShake(), setQuality(q), dispose() }` —— render.js
- `cam`（主相机对象，main.js 持有）—— 由 camera.js 提供控制
- `window.__SS` 调试接口 —— **不得删减**，验收依赖它

## 性能红线（移动端要跑得动）

| 指标 | 桌面 | 手机 |
|---|---|---|
| 帧率@1600x900 | ≥ 90 | ≥ 30 |
| draw calls | ≤ 250 | ≤ 120 |
| 三角面 | ≤ 250k | ≤ 120k |

新增内容必须自带降级路径（`QUALITY4` 已提供档位），并在 `window.__SS.stats` 里可见。

## 交付纪律

1. 改完**自测**：`node build/build.mjs` 必须成功。
2. **实机截图**：`node _tools/play.mjs --out shots/<你的名字> --action "..."`，自己看截图挑毛病，改到满意为止。
3. 完成时在 `reviews/` 下写一份 `<你的名字>-report.md`：改了什么、截图路径、还余下什么问题。
4. 任务完成后调用 `team_task_update` 标记 complete，并把报告路径发给 Lead。
