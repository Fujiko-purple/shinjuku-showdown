/**
 * probe-cine-full.mjs —— 验证播片「自然走完」这条路径
 * 之前只验证过「按空格跳过」，但玩家不跳过的路径同样必须正确收尾。
 * 顺带抓 impact / shock 镜头的帧，确认命中演出还在。
 */
import { Browser, sleep } from './cdp.mjs';
const b = new Browser({ port: 9492, width: 1280, height: 720 });
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html' });
  await sleep(11000);
  await b.evaluate(`document.getElementById('btn-start').click(); true`);
  const t0 = Date.now();
  let enteredAt = null;
  let last = null;
  const grabbed = [];
  for (let i = 0; i < 70; i++) {
    await sleep(1000);
    const st = await b.evaluate(`(() => {
      const c = window.__SS && window.__SS.cutscene;
      return { state: window.__SS && window.__SS.state, ct: c ? +c.time.toFixed(1) : null,
               shot: c ? c.shotId : null, fin: c ? c.finished : null };
    })()`);
    last = st;
    if (st.state === 'fight') { enteredAt = (Date.now()-t0)/1000; break; }
    // 抓 impact（26.5-29.1）与 shock（29.1-32.1）各一帧
    if (st.ct >= 27 && !grabbed.includes('impact')) {
      await b.screenshot('shots/cine-full-impact.png'); grabbed.push('impact');
    }
    if (st.ct >= 30 && !grabbed.includes('shock')) {
      await b.screenshot('shots/cine-full-shock.png'); grabbed.push('shock');
    }
  }
  console.log('播片自然结束用时: ' + (enteredAt ? enteredAt.toFixed(1) + 's（镜头总长 35.5s + 加载）' : '❌ 70s 内未进入战斗'));
  console.log('最后采样: ' + JSON.stringify(last));
  if (enteredAt) {
    await sleep(2000);
    const after = await b.evaluate(`(() => { const s = window.__SS && window.__SS.snap; return s ? { mode: s.mode, gHp: +s.gojo.hp.toFixed(0), sHp: +s.sukuna.hp.toFixed(0), invG: null } : null; })()`);
    console.log('进入战斗后: ' + JSON.stringify(after));
    await b.screenshot('shots/cine-full-fight.png');
  }
  console.log('抓帧: ' + JSON.stringify(grabbed));
  console.log('页面错误: ' + JSON.stringify(b.errors.slice(0,3)));
} catch (e) { console.log('FATAL ' + String(e).slice(0,200)); }
finally { await b.close(); }
