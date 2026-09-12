/**
 * 带锁的构建入口：多个队友同时改代码时，避免并发跑 build/build.mjs
 * 互相覆盖 dist/（构建产物是全局唯一资源）。
 * 用法：node _tools/build-locked.mjs
 * 锁文件里写进程 PID：持有者进程已经死了就直接抢锁，不会卡住所有人。
 */
import { openSync, closeSync, unlinkSync, existsSync, readFileSync, writeSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lock = join(root, '_tools', '.buildlock');
function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
const deadline = Date.now() + 180000;
let fd = null, waited = 0;
while (Date.now() < deadline) {
  try { fd = openSync(lock, 'wx'); break; } catch (e) {
    let holder = 0, age = 0;
    try { holder = parseInt(readFileSync(lock, 'utf8'), 10) || 0; } catch (e2) {}
    try { age = Date.now() - statSync(lock).mtimeMs; } catch (e2) {}
    if (!alive(holder) || age > 150000) { try { unlinkSync(lock); } catch (e2) {} continue; }
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1500)'], { stdio: 'ignore' });
    waited += 1500;
  }
}
if (fd === null) { console.error('BUILD: 等锁超时（有人构建超过 3 分钟）'); process.exit(1); }
try { try { writeSync(fd, String(process.pid)); } catch (e) {}
  const r = spawnSync(process.execPath, [join(root, 'build', 'build.mjs')], { cwd: root, stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
} finally {
  try { closeSync(fd); unlinkSync(lock); } catch (e) {}
}
