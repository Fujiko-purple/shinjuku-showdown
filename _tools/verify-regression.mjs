/**
 * verify-regression.mjs —— 回归守门（task-6 / verifier）
 * ----------------------------------------------------------------------------
 * 职责：确认新增四个机制没有打破既有系统。把已经存在的验收工具串起来跑一遍，
 * 逐个记录退出码 + 关键输出行，最后汇总成 PASS/FAIL 表。
 *
 * 用法：node _tools/verify-regression.mjs [--file dist/新宿决战.html] [--with-old]
 *   注意：probe-movedir / probe-dash / probe-bgm-dom / probe-hudcollide 这四个老探针
 *   内部硬编码了 dist/新宿决战.html 与各自的 CDP 端口，只有校验共享产物时才有意义，
 *   校验私有产物时会被自动跳过（--with-old 可强制跑）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arg, flag } from './verify-lib.mjs';

const file = arg('file', 'dist/新宿决战.html');
const withOld = flag('with-old');
const isSharedDist = resolve(file) === resolve('dist/新宿决战.html');

const steps = [
  { name: 'smoke', cmd: ['_tools/smoke.mjs', '--file', file, '--port', '9516'] },
  { name: 'acceptance', cmd: ['_tools/acceptance.mjs', '--file', file, '--port', '9517'] },
  { name: 'probe-movedir', old: true, cmd: ['_tools/probe-movedir.mjs'] },
  { name: 'probe-dash', old: true, cmd: ['_tools/probe-dash.mjs'] },
  { name: 'probe-bgm-dom', old: true, cmd: ['_tools/probe-bgm-dom.mjs'] },
  { name: 'probe-hudcollide', old: true, cmd: ['_tools/probe-hudcollide.mjs'] },
  { name: 'probe-mobilecase', old: true, cmd: ['_tools/probe-mobilecase.mjs'] },
  { name: 'probe-frametime', old: true, cmd: ['_tools/probe-frametime.mjs'] },
];

const results = [];
for (const s of steps) {
  const skip = s.old && !isSharedDist && !withOld;
  console.log('');
  console.log('===== ' + s.name + (skip ? ' [SKIP：老探针硬编码 dist]' : '') + ' =====');
  if (skip) { results.push({ name: s.name, status: 'skip' }); continue; }
  if (s.file && !existsSync(resolve(file))) { results.push({ name: s.name, status: 'missing-file' }); continue; }
  const t0 = Date.now();
  const r = spawnSync('node', s.cmd, { stdio: 'inherit', shell: false });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const code = r.status;
  console.log('----- ' + s.name + ' 退出码 ' + code + ' 用时 ' + secs + 's');
  results.push({ name: s.name, status: code === 0 ? 'pass' : 'fail', exit: code, seconds: Number(secs) });
}

console.log('');
const pass = results.filter(r => r.status === 'pass').length;
const fail = results.filter(r => r.status === 'fail').length;
const skip = results.filter(r => r.status === 'skip').length;
console.log('===== 回归汇总: ' + pass + ' pass / ' + fail + ' fail / ' + skip + ' skip =====');
for (const r of results) console.log('  ' + r.status.toUpperCase() + '  ' + r.name + (r.exit !== undefined ? '  exit=' + r.exit + '  ' + r.seconds + 's' : ''));
mkdirSync('_tools/verify-assets', { recursive: true });
writeFileSync('_tools/verify-assets/regression.json', JSON.stringify({ file, results, at: new Date().toISOString() }, null, 2));
process.exit(fail > 0 ? 1 : 0);