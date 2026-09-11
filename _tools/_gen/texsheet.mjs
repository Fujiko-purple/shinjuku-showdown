import { Browser, sleep } from '../cdp.mjs';
import { resolve } from 'node:path';
const b = new Browser({ port: 9352, width: 1100, height: 760 });
await b.launch(); await b.newPage();
const p = resolve('_tools/_gen/artview.html');
const url = 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
await b.send('Page.navigate', { url });
await sleep(2500);
for (const who of ['gojo', 'sukuna']) {
  await b.evaluate('window.VIEW.apply(' + JSON.stringify({ who, quality: 'high', anim: 'idle', t: 0.4, dist: 4, ty: 1 }) + ')');
  await b.evaluate('window.VIEW.texSheet("' + who + '")');
  await sleep(120);
  await b.screenshot(resolve('shots/art-fighters-tex-' + who + '.png'));
  await b.evaluate('window.VIEW.hideSheet()');
}
console.log('errs', JSON.stringify(b.errors.slice(0, 3)));
await b.close();
