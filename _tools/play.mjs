/**
 * play.mjs —— 试玩 / 截图 / 诊断工具（团队共用）
 *
 * 用法：
 *   node _tools/play.mjs --file <html路径> --out <截图目录前缀> [--action <动作序列>]
 *
 * 动作序列（逗号分隔）：
 *   wait:<ms>        等待
 *   shot:<名字>      截图
 *   start            点「开战」
 *   skip             点「直接进入战斗」
 *   key:<KeyName>    按一次键
 *   hold:<KeyName>:<ms>  按住某键
 *   move:<w|a|s|d>:<ms>  按住移动键 ms 秒
 *   combo            打一套 J-J-J-K
 *   skill:<u|i|o|h|g|l>  放技能
 *   probe            输出诊断信息（状态/HUD 可见性/日志）
 */
import { Browser, sleep } from './cdp.mjs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : def;
}

const file = resolve(arg('file', '新宿决战.html'));
const outPrefix = arg('out', 'shots/run');
const actions = arg('action', 'wait:4000,shot:01-initial,skip,wait:6000,shot:02-battle,probe').split(',').filter(Boolean);
const W = parseInt(arg('w', '1600'), 10);
const H = parseInt(arg('h', '900'), 10);
const mobile = arg('mobile', '') === '1';
const port = parseInt(arg('port', '9334'), 10);

if (!existsSync(file)) { console.error('找不到文件: ' + file); process.exit(1); }

const b = new Browser({ port, width: W, height: H });
const report = { file, actions: [], state: {}, errors: [], logs: [], shots: [] };

try {
  await b.launch();
  await b.newPage();
  if (mobile) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  const url = 'file:///' + file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  await b.send('Page.navigate', { url });
  await sleep(2000);
  report.url = url;

  let shotIdx = 0;
  for (const act of actions) {
    const [cmd, a1, a2] = act.split(':');
    const t0 = Date.now();
    switch (cmd) {
      case 'wait': await sleep(parseInt(a1, 10)); break;
      case 'shot': {
        const p = `${outPrefix}-${a1 || String(++shotIdx).padStart(2, '0')}.png`;
        await b.screenshot(p);
        report.shots.push(p);
        break;
      }
      case 'start': case 'skip': {
        const id = cmd === 'start' ? 'btn-start' : 'btn-skip-cine';
        const box = await b.evaluate(`(() => { const e = document.getElementById('${id}'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2, vis: r.width > 0 }; })()`);
        if (box && box.vis) await b.click(box.x, box.y);
        else await b.evaluate(`document.getElementById('${id}') && document.getElementById('${id}').click()`);
        break;
      }
      case 'key': await b.pressKey(a1); break;
      case 'hold': await b.pressKey(a1, parseInt(a2, 10) || 200); break;
      case 'move': {
        const k = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD' }[a1] || 'KeyW';
        await b.keyDown(k); await sleep(parseInt(a2, 10) || 500); await b.keyUp(k);
        break;
      }
      case 'combo': {
        for (const k of ['KeyJ', 'KeyJ', 'KeyJ']) { await b.pressKey(k, 50); await sleep(180); }
        await b.pressKey('KeyK', 60); await sleep(300);
        break;
      }
      case 'skill': {
        const m = { u: 'KeyU', i: 'KeyI', o: 'KeyO', h: 'KeyH', g: 'KeyG', l: 'KeyL' };
        await b.pressKey(m[a1] || 'KeyU', parseInt(a2, 10) || 80);
        break;
      }
      case 'probe': {
        const st = await b.evaluate(`(() => {
          const hud = document.getElementById('hud');
          const txt = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
          return {
            fps: window.__FPS || null,
            hudClass: hud ? hud.className : null,
            hpGojo: txt('hp-gojo'), hpSukuna: txt('hp-sukuna'),
            timer: txt('timer'), phase: txt('phase-tag'),
            banner: txt('banner'), hints: txt('hints'),
            abilityBtns: document.querySelectorAll('#ability-bar .ab, #ability-bar > *').length,
            visibleScreens: [...document.querySelectorAll('.screen')].filter(e => !e.classList.contains('hidden')).map(e => e.id),
            fpsHud: txt('fps'), renderInfo: txt('render-info'),
          };
        })()`);
        report.state = { ...report.state, ...st };
        break;
      }
      default: console.error('未知动作: ' + act);
    }
    report.actions.push({ act, ms: Date.now() - t0 });
  }

  const finalState = await b.evaluate(`(() => ({ fps: window.__FPS || null, hud: document.getElementById('hud').className, screens: [...document.querySelectorAll('.screen')].filter(e=>!e.classList.contains('hidden')).map(e=>e.id) }))()`);
  report.state = { ...report.state, ...finalState };
  report.errors = b.errors.slice(0, 30);
  report.logs = b.logs.filter(l => l.type === 'error' || l.type === 'warning').slice(0, 40);
} catch (e) {
  report.fatal = String(e && e.stack || e);
} finally {
  await b.close();
}

console.log(JSON.stringify(report, null, 2));
