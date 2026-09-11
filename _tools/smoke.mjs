/**
 * smoke.mjs —— 构建产物快速健康检查（Lead 每次集成后跑）
 * 用法：node _tools/smoke.mjs [--file dist/新宿决战.html]
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync as exists } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
if (!exists(file)) { console.error('找不到 ' + file); process.exit(1); }

const b = new Browser({ port: parseInt(arg('port', '9411'), 10), width: 1280, height: 720 });
const out = { file, ok: false };
try {
  await b.launch();
  await b.newPage();
  await b.send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/') });
  await sleep(11000);
  out.state = await b.evaluate(`(() => {
    const crash = document.getElementById('crash');
    const loading = document.getElementById('loading');
    return {
      crashVisible: !!(crash && !crash.classList.contains('hidden')),
      crashMsg: (document.getElementById('crash-msg') || {}).textContent || '',
      loadingHidden: !!(loading && loading.classList.contains('hidden')),
      bootStep: (window.__BOOT || {}).step || null,
      bootErr: (window.__BOOT || {}).err || null,
      hasSS: !!window.__SS,
      hasTouch: '__TOUCH' in window,
      prMax: window.__PR_MAX === undefined ? null : window.__PR_MAX,
      titleVisible: !!(document.getElementById('title') && !document.getElementById('title').classList.contains('hidden')),
      buttons: ['btn-start','btn-skip-cine'].filter(id => document.getElementById(id)),
    };
  })()`);
  out.errors = b.errors.slice(0, 6);
  out.ok = !out.state.crashVisible && out.state.loadingHidden && out.errors.length === 0;
} catch (e) { out.fatal = String(e && e.stack || e); }
finally { await b.close(); }
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
