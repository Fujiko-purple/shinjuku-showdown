import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9510, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.goto('https://shinjuku-showdown.pages.dev/?diag=' + Date.now(), { waitMs: 25000 });
  const st = await b.evaluate(`(async () => {
    const out = {};
    out.crashVisible = !!(document.getElementById('crash') && !document.getElementById('crash').classList.contains('hidden'));
    out.crashMsg = ((document.getElementById('crash-msg')||{}).textContent || '').slice(0, 300);
    out.hasSS = !!window.__SS; out.boot = window.__BOOT || null;
    out.scripts = Array.from(document.scripts).map(s => s.src || '(inline ' + (s.textContent||'').length + 'B)');
    try { const r = await fetch('assets/game.js?t=' + Date.now(), { cache: 'no-store' }); out.gameStatus = r.status; const t = await r.text(); out.gameBytes = t.length; out.gameHead = t.slice(0, 120); out.hasMahoraga = t.includes('MahoragaPhase'); } catch (e) { out.gameErr = String(e); }
    try { const r = await fetch('assets/styles.css?t=' + Date.now(), { cache: 'no-store' }); out.cssStatus = r.status; out.cssBytes = (await r.text()).length; } catch (e) { out.cssErr = String(e); }
    try { const r = await fetch('index.html?t=' + Date.now(), { cache: 'no-store' }); const h = await r.text(); out.idxBytes = h.length; out.idxRefsGame = h.includes('assets/game.js'); } catch (e) { out.idxErr = String(e); }
    return out;
  })()`);
  console.log(JSON.stringify(st, null, 1).slice(0, 2200));
  console.log('ERRORS', JSON.stringify(b.errors.slice(0, 6).map(e => (e.text || String(e)).slice(0, 200))));
  console.log('FAILED_REQ', JSON.stringify((b.failedRequests || []).slice(0, 6)));
} catch (e) { console.log('FATAL', String(e).slice(0, 300)); } finally { await b.close(); }
