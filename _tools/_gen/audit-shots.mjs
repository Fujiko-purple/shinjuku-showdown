import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const b = new Browser({ port: 9395, width: 1280, height: 720 });
await b.launch(); await b.newPage();
const url = 'file:///' + resolve('dist/新宿决战.html').replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(3500);
await b.evaluate('document.getElementById("btn-skip-cine") && document.getElementById("btn-skip-cine").click()');
await sleep(3000);
for (let i = 0; i < 3; i++) {
  await sleep(1800);
  await b.screenshot(resolve('shots/audit-idle-' + i + '.png'));
}
for (const d of [0.90, 0.55, 0.35]) {
  const half = (6 - d / 2).toFixed(2), far = (6 + d).toFixed(2), half2 = (6 + d / 2).toFixed(2), near = (6 - d).toFixed(2);
  const js = '(function(){var g=window.__SS.gojo,s=window.__SS.sukuna;' +
    'g.setPos(0,0,' + half + ');g.faceTo(0,' + far + ',true);' +
    's.setPos(0,0,' + half2 + ');s.faceTo(0,' + near + ',true);return true;})()';
  await b.evaluate(js);
  await sleep(400);
  await b.screenshot(resolve('shots/audit-clip-' + String(d).replace('.', 'p') + '.png'));
}
console.log('done');
await b.close();