# 新宿决战 · 部署与本地预览

本目录（`deploy/`）负责「把游戏变成别人能打开的网址」这件事。
所有脚本零第三方依赖，只用 Node 22 内置模块。

## 一、产物长什么样

```
node build/build.mjs
```

一次构建产出两份：

| 产物 | 用途 |
|---|---|
| `dist/新宿决战.html` | 单文件版：JS/CSS/音频全内联，双击即开，离线也能听 BGM |
| `dist/site/` | 可静态托管的站点版（**首屏 2.2MB，音频 2.76MB 首次交互后才下载**） |

`dist/site/` 结构：

```
index.html               入口（全相对路径，丢到任意子目录/CDN 路径都能跑）
assets/game.js           前缀 + three.js + 11 个游戏模块（同一段代码，必须放一个文件里）
assets/styles.css        基础样式
assets/mobile.css        移动端样式（触屏 UI / 响应式 / 旋转提示）
assets/bgm.m4a           2.76MB 音频，<audio data-src> 首次交互后才真的请求
manifest.webmanifest     PWA：可「添加到主屏幕」，横屏全屏启动
sw.js                    Service Worker：外壳预缓存 + 音频运行时缓存（离线可玩）
icons/*.png              192 / 512 / 180 图标（构建时用内置 PNG 编码器生成，无依赖）
robots.txt  _headers  404.html
```

## 二、本机预览（给用户的唯一一条命令）

```
node deploy/publish.mjs --yes
```

它会先构建，再起静态服务并打印两个地址：

* `http://127.0.0.1:8173/` —— 本机浏览器直接打开
* `http://<你的内网IP>:8173/` —— **手机连同一个 Wi-Fi 打开这个地址就能用手机玩**

> 不要用 `file://` 直接打开 `index.html`：
> 浏览器不允许 file:// 页面注册 Service Worker，且相对路径行为不一致。
> 单文件版 `dist/新宿决战.html` 则可以用 file:// 直接开。

只想起服务、不构建：`node deploy/serve.mjs --port 8173`。

## 三、发布（目前默认 dry-run）

```
node deploy/publish.mjs                                  # 默认 local + dry-run，只打印命令
node deploy/publish.mjs --target package --yes           # 打 dist/shinjuku-site.zip，手动传到任意静态托管
node deploy/publish.mjs --target github-pages            # 打印 GitHub Pages 的 git 步骤
node deploy/publish.mjs --target cloudflare-pages --yes  # npx wrangler pages deploy
node deploy/publish.mjs --target netlify --yes
node deploy/publish.mjs --target surge --yes
node deploy/publish.mjs --target cloudflared-tunnel --yes # 临时公网隧道，别人的手机能直接打开
```

* **不带 `--yes` 一律只打印，不执行任何构建/发布动作。**
* 脚本不会创建远程仓库、不会改远端配置；GitHub Pages 目标只打印命令，等你确认仓库地址后再手动执行。

## 四、为什么音频要拆出来

原交付物是单个 5.63MB 的 HTML，其中 **3.77MB（49%）是一段内联 base64 音频**。
手机在 4G 上光下载这段音频就要十几秒，而玩家进游戏前十几秒里根本听不到声音。

构建时把 base64 抽成 `assets/bgm.m4a`，并把 `<audio>` 改成：

```html
<audio id="bgm" loop preload="none" data-src="assets/bgm.m4a">
```

再由一小段**捕获阶段**的脚本在「第一次真实交互」时赋值 src 并 play（必须早于游戏自己的
`startBGM`，否则会被浏览器的自动播放策略拦下）。实测：

| 指标 | 单文件版 | 站点版 |
|---|---|---|
| 首屏字节 | 5.63 MB | **2.14 MB** |
| 首屏 gzip 传输 | —— | **≈462 KB** |
| 音频 | 内联 | 交互后按需 2.76 MB |

## 五、常见问题

**Q：手机上打开是黑屏/一直转圈？**
先确认地址是 `http://` 而不是 `file://`；再看是否被浏览器插件拦截。
站点版带了一个引导看门狗，会把失败原因直接写在载入界面上。

**Q：想强制低画质？**
URL 加 `?q=low`。触屏设备的渲染分辨率倍率由 `src/mobile.js` 写 `window.__PR_MAX`，
右上角「画」按钮可以在低/中/高三档之间切。

**Q：竖屏能玩吗？**
能。会自动抬 FOV 补偿横向视野，并压窄 HUD；首次进入会弹一张「横屏更爽」的卡片（不挡按钮，进战斗自动收起）。
