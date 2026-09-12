import { readFileSync, writeFileSync } from 'node:fs';
let b = readFileSync('src/body.html', 'utf8');
const mark = '  <!-- 音量：默认收在右下角一枚按钮里，点开才展开（战斗中不常驻挡视野） -->';
const i = b.indexOf(mark);
if (i < 0) { console.error('找不到 dock 标记'); process.exit(1); }
const region = b.slice(i);
console.log('将被替换的区域长度: ' + region.length + ' 字符');
console.log('区域尾部: ' + JSON.stringify(region.slice(-120)));
b = b.slice(0, i) + "  <!-- 音量：默认收在右下角一枚按钮里，点开才展开（战斗中不常驻挡视野） -->\n  <div class=\"audio-dock\">\n    <button id=\"audio-toggle\" class=\"audio-toggle\" type=\"button\" aria-label=\"音量设置\">♪</button>\n    <div class=\"audio-panel\" data-page-node-id=\"XJ2Em1gcDY39YJOOaW7ggK\">\n      <label data-page-node-id=\"ctxZrJKn3618DpbHBKAxB6\">音<i id=\"vol-master-label\" data-page-node-id=\"z11my6pZlLqBXi5bOpuCBn\">70</i><input id=\"vol-master\" type=\"range\" min=\"0\" max=\"100\" value=\"70\" data-page-node-id=\"tuCwnDrd07v2xdkgP0fbzU\"></label>\n      <label data-page-node-id=\"QuX1St52vMiJ1kfIEK56DY\">乐<i id=\"vol-music-label\" data-page-node-id=\"uBa3n9V8Cf5mepV2BqD4X3\">55</i><input id=\"vol-music\" type=\"range\" min=\"0\" max=\"100\" value=\"55\" data-page-node-id=\"Kb9jKlYZYbdMS0Zn93pFFc\"></label>\n      <div class=\"bgm-pick hidden\" id=\"bgm-pick\" role=\"group\" aria-label=\"背景音乐\"></div>\n      <label data-page-node-id=\"YHrmb7NZ2vU0HePzPtBHbi\">效<i id=\"vol-sfx-label\" data-page-node-id=\"K2yHlEpnFAjZmZYtu0cXLA\">85</i><input id=\"vol-sfx\" type=\"range\" min=\"0\" max=\"100\" value=\"85\" data-page-node-id=\"Vi0WTRMjnEU63S5AOQPcuD\"></label>\n    </div>\n  </div>" + String.fromCharCode(10);
writeFileSync('src/body.html', b);
const check = (re) => (b.match(re) || []).length;
console.log('校验: audio-dock=' + check(/class="audio-dock"/g) + '  audio-panel=' + check(/class="audio-panel"/g) + '  vol-master=' + check(/id="vol-master"/g) + '  vol-music=' + check(/id="vol-music"/g) + '  vol-sfx=' + check(/id="vol-sfx"/g) + '  bgm-pick=' + check(/id="bgm-pick"/g) + '  bgm2=' + check(/id="bgm2"/g));
const opens = (b.match(/<div/g) || []).length, closes = (b.match(/<\/div>/g) || []).length;
console.log('div 开合: ' + opens + ' / ' + closes + (opens === closes ? '  ✅ 平衡' : '  ❌ 不平衡'));