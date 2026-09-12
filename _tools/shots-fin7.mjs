import { Browser, sleep } from './cdp.mjs';
const URL = 'file:///C:/Users/Administrator/Desktop/dsh/%E6%96%B0%E5%AE%BF%E5%AF%B9%E5%86%B3/dist/%E6%96%B0%E5%AE%BF%E5%86%B3%E6%88%98.html';
const b = new Browser({ port: 9755, width: 1280, height: 720 });
const log = (...a) => console.log(...a);
try {
  await b.launch(); await b.newPage();
  await b.send('Page.navigate', { url: URL });
  await sleep(15000);
  await b.evaluate(`document.getElementById('btn-skip-cine').click(); true`);
  for (let i = 0; i < 90; i++) { await sleep(400); if ((await b.evaluate('window.__SS.state')) === 'fight') break; }
  await sleep(2500);
  await b.evaluate(`(() => { const d = window.__SS.combat; d.setAiEnabled(false); d.setInvincible("gojo", true); return true; })()`);
  await sleep(1000);
  await b.screenshot('shots/FIN7-01-fight.png');
  await b.keyDown('KeyW'); await sleep(1400); await b.screenshot('shots/FIN7-02-walk.png'); await b.keyUp('KeyW');
  await sleep(800);
  const near = () => b.evaluate(`(() => { const S = window.__SS; const sp = S.sukuna.root.position; S.gojo.setPos(sp.x, 0, sp.z + 1.3); S.gojo.faceTo(sp.x, sp.z, true); return true; })()`);
  for (let i = 0; i < 5; i++) { await near(); await b.pressKey('KeyJ', 40); await sleep(240); }
  await sleep(120); await b.screenshot('shots/FIN7-03-combo.png');
  await sleep(1200);
  await b.evaluate('window.__SS.combat.forceSkill("void","gojo")');
  await sleep(1800); await b.screenshot('shots/FIN7-04-void.png');
  await sleep(1200); await b.screenshot('shots/FIN7-05-void2.png');
  log('领域 ' + await b.evaluate('window.__SS.snap.gojoDomain'));
  await b.evaluate('window.__SS.combat.forceSkill("shrine","sukuna")');
  await sleep(2200); await b.screenshot('shots/FIN7-06-clash.png');
  await sleep(4000); await b.screenshot('shots/FIN7-07-clash2.png');
  log('clash ' + await b.evaluate('window.__SS.snap.clashActive'));
  log('错误 ' + JSON.stringify(b.errors.slice(0,4)));
} catch (e) { log('FATAL ' + String(e).slice(0,300)); }
finally { await b.close(); }
