import { Browser, sleep } from './cdp.mjs';
const URL = 'https://inline-concentrate-twin-fridge.trycloudflare.com/';
const b = new Browser({ port: 9471, width: 1280, height: 720 });
const net = [];
try {
  await b.launch(); await b.newPage();
  b.on('Network.responseReceived', (p) => {
    try { net.push({ url: p.response.url.replace(URL, ''), status: p.response.status, type: p.type }); } catch {}
  });
  const t0 = Date.now();
  await b.send('Page.navigate', { url: URL });
  await sleep(20000);
  const state = await b.evaluate(`(() => {
    const c = document.getElementById('crash');
    const l = document.getElementById('loading');
    return {
      title: document.title,
      crashVisible: !!(c && !c.classList.contains('hidden')),
      crashMsg: (document.getElementById('crash-msg')||{}).textContent || '',
      loadingHidden: !!(l && l.classList.contains('hidden')),
      bootStep: (window.__BOOT||{}).step, bootOk: (window.__BOOT||{}).ok,
      hasSS: !!window.__SS,
      bgmLazy: typeof window.__BGM_LAZY !== 'undefined' ? { loaded: window.__BGM_LAZY.loaded } : null,
      bgmSrcBefore: (document.getElementById('bgm')||{}).getAttribute ? document.getElementById('bgm').getAttribute('src') : null,
      swRegistered: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      canvas: (() => { const c2 = document.getElementById('gl'); return c2 ? [c2.width, c2.height] : null; })(),
    };
  })()`);
  console.log('加载耗时 ' + ((Date.now()-t0)/1000).toFixed(1) + 's');
  console.log('STATE ' + JSON.stringify(state, null, 1));
  const failed = net.filter(n => n.status >= 400);
  const total = net.reduce((a,n)=>{a[n.type]=(a[n.type]||0)+1;return a;}, {});
  console.log('资源类型统计 ' + JSON.stringify(total));
  console.log('失败请求 ' + JSON.stringify(failed.slice(0,8)));
  console.log('请求清单 ' + JSON.stringify(net.map(n=>n.type+':'+n.status+':'+n.url).slice(0,14), null, 1));

  // 真的进游戏玩一下
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  await sleep(9000);
  await b.pressKey('KeyJ'); await sleep(200); await b.pressKey('KeyJ'); await sleep(500);
  const play = await b.evaluate(`(() => { const s = window.__SS && window.__SS.snap; return s ? { mode: s.mode, gHp: +s.gojo.hp.toFixed(0), sHp: +s.sukuna.hp.toFixed(0), combo: s.combo } : null; })()`);
  console.log('试玩 ' + JSON.stringify(play));
  await b.screenshot('shots/public-01.png');
  // 交互后 BGM 应该被懒加载
  await sleep(2500);
  const bgm = await b.evaluate(`(() => { const e = document.getElementById('bgm'); return { src: e ? (e.getAttribute('src')||'').slice(0,40) : null, playing: e ? !e.paused : null, t: window.__BGM_LAZY ? window.__BGM_LAZY.loaded : null }; })()`);
  console.log('BGM ' + JSON.stringify(bgm));
  console.log('页面错误 ' + JSON.stringify(b.errors.slice(0,5)));
} catch (e) { console.log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
