/**
 * publish.mjs —— 一键发布脚本（多目标）
 * ----------------------------------------------------------------------------
 * 设计原则（Lead 2026-09-11 拍板）：
 *   · 默认目标 local，默认 --dry-run：只打印将要执行的命令，不真的推送到任何地方。
 *   · 真正发布必须显式 --yes（或 --no-dry-run）。这样"手滑发布"是不可能发生的。
 *   · 不创建远程仓库、不改远端配置；只调用各平台自己的 CLI/git 命令。
 *
 * 用法
 *   node deploy/publish.mjs                        # 本地预览（默认，起 http 服务）
 *   node deploy/publish.mjs --target package       # 打一个 dist/shinjuku-site.zip，手动丢到任意静态托管
 *   node deploy/publish.mjs --target github-pages   # 打印（并可选执行）GitHub Pages 发布步骤
 *   node deploy/publish.mjs --target cloudflare-pages
 *   node deploy/publish.mjs --target netlify
 *   node deploy/publish.mjs --target surge
 *   node deploy/publish.mjs --target cloudflared-tunnel   # 临时公网隧道（本机在线，别人的手机能访问）
 *   加 --yes 才真的执行；加 --no-build 跳过构建；加 --dir 指定站点目录。
 */
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes('--' + n);

const TARGET = arg('target', 'local');
const DIR = resolve(arg('dir', 'dist/site'));
const YES = has('yes') || has('no-dry-run');     // 没写 --yes 就是 dry-run
const BUILD = !has('no-build');
const PORT = arg('port', '8173');

const C = { g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', r: '\x1b[31m', d: '\x1b[2m', x: '\x1b[0m' };
const log = (s) => console.log(s);
const run = (cmd, args, opts = {}) => {
  const line = cmd + ' ' + args.join(' ');
  if (!YES) { log(C.y + '  [dry-run] ' + line + C.x); return { status: 0, dry: true }; }
  log(C.c + '  $ ' + line + C.x);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  return { status: r.status === null ? 1 : r.status };
};

/* ---------- 0. 构建 ---------- */
if (BUILD) {
  log(C.g + '▸ 构建站点（src/ → dist/site/）' + C.x);
  const r = run(process.execPath, ['build/build.mjs']);
  if (r.status) { log(C.r + '构建失败，终止。' + C.x); process.exit(1); }
}
if (!existsSync(DIR)) { log(C.r + '站点目录不存在: ' + DIR + '（先 node build/build.mjs）' + C.x); process.exit(1); }

/* ---------- 体积体检 ---------- */
function walk(dir, base = dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, base, out);
    else out.push({ rel: relative(base, p).replace(/\\/g, '/'), bytes: s.size });
  }
  return out;
}
const files = walk(DIR).sort((a, b) => b.bytes - a.bytes);
const total = files.reduce((s, f) => s + f.bytes, 0);
const audio = files.find((f) => /bgm\./.test(f.rel));
const shell = files.filter((f) => /bgm\./.test(f.rel) === false).reduce((s, f) => s + f.bytes, 0);
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
log(C.g + '\n▸ 产物体检  ' + DIR + C.x);
log('  全部文件  ' + String(files.length).padStart(3) + ' 个  合计 ' + mb(total));
log('  首屏（不含音频）         ' + mb(shell) + '   ← 用户第一次打开只下载这些');
if (audio) log('  音频（首次交互后才下载） ' + mb(audio.bytes) + '   ' + audio.rel + '（懒加载已验证）');
log(C.d + '  最大的几个文件: ' + files.slice(0, 6).map((f) => f.rel + ' ' + mb(f.bytes)).join(' | ') + C.x);

/* ---------- 目标分发 ---------- */
log('');
switch (TARGET) {
  case 'local': {
    log(C.g + '▸ 目标：本地预览（默认）' + C.x);
    log('  启动静态服务后，本机浏览器打开 http://127.0.0.1:' + PORT + '/');
    log('  手机在同一 Wi-Fi 下打开控制台打印的内网地址（服务会自己列出来）');
    log(C.d + '  Service Worker 只在 http(s) 下注册，所以别用 file:// 打开 index.html' + C.x);
    if (!YES) { log(C.y + '  [dry-run] node deploy/serve.mjs --port ' + PORT + C.x); log(C.y + '\n  真正启动请加 --yes（会占用当前终端）' + C.x); }
    else run(process.execPath, ['deploy/serve.mjs', '--port', PORT]);
    break;
  }
  case 'package': {
    const zip = resolve('dist/shinjuku-site.zip');
    log(C.g + '▸ 目标：打包成压缩包（丢给任何静态托管都能用）' + C.x);
    log('  输出 ' + zip);
    if (!YES) { log(C.y + '  [dry-run] 生成 zip（内部用 deflate 压缩）' + C.x); break; }
    writeZip(DIR, files, zip);
    log(C.g + '  ✓ 已生成 ' + mb(statSync(zip).size) + '（解压后 ' + mb(total) + '）' + C.x);
    break;
  }
  case 'github-pages': {
    log(C.g + '▸ 目标：GitHub Pages' + C.x);
    log('  前提：本机已登录 git 凭据，且目标仓库已存在（本脚本不创建远程仓库）');
    log('  推荐流程（把站点目录内容作为仓库根，或放到 /docs 再用 Pages 指向它）：');
    run('git', ['-C', DIR, 'init']);
    run('git', ['-C', DIR, 'add', '-A']);
    run('git', ['-C', DIR, 'commit', '-m', 'deploy: 新宿决战 静态站点']);
    run('git', ['-C', DIR, 'branch', '-M', 'gh-pages']);
    log(C.d + '  然后（把 <repo-url> 换成你的仓库地址）:' + C.x);
    log(C.d + '    git -C ' + DIR + ' remote add origin <repo-url>' + C.x);
    log(C.d + '    git -C ' + DIR + ' push -u origin gh-pages --force' + C.x);
    log(C.d + '  访问地址： https://<用户名>.github.io/<仓库名>/' + C.x);
    log(C.y + '  ⚠ 需要你确认仓库地址后才发；本脚本默认不推送到任何远端。' + C.x);
    break;
  }
  case 'cloudflare-pages': {
    log(C.g + '▸ 目标：Cloudflare Pages' + C.x);
    log('  首次会打开浏览器登录 Cloudflare 账号，之后无需重复');
    run('npx', ['--yes', 'wrangler@3', 'pages', 'deploy', DIR, '--project-name', arg('project', 'shinjuku-showdown'), '--branch', 'main']);
    log(C.d + '  访问地址： https://<project>.pages.dev/' + C.x);
    break;
  }
  case 'netlify': {
    log(C.g + '▸ 目标：Netlify' + C.x);
    run('npx', ['--yes', 'netlify-cli', 'deploy', '--dir', DIR, '--prod']);
    break;
  }
  case 'surge': {
    log(C.g + '▸ 目标：Surge' + C.x);
    run('npx', ['--yes', 'surge', DIR, arg('domain', 'shinjuku-showdown.surge.sh')]);
    break;
  }
  case 'cloudflared-tunnel': {
    const bin = existsSync('deploy/bin/cloudflared.exe') ? 'deploy/bin/cloudflared.exe' : 'cloudflared';
    log(C.g + '▸ 目标：Cloudflare 临时隧道（本机在线，别人手机可直接访问）' + C.x);
    log('  需要先在本机跑着静态服务：node deploy/serve.mjs --port ' + PORT);
    log('  cloudflared 会打印一个 https://xxxx.trycloudflare.com 的临时地址，关掉就失效');
    if (!YES) { log(C.y + '  [dry-run] ' + bin + ' tunnel --url http://127.0.0.1:' + PORT + C.x); }
    else run(bin, ['tunnel', '--url', 'http://127.0.0.1:' + PORT]);
    break;
  }
  default:
    log(C.r + '未知目标: ' + TARGET + C.x);
    log('可选: local | package | github-pages | cloudflare-pages | netlify | surge | cloudflared-tunnel');
    process.exit(1);
}

log('');
log(C.d + '提示：本脚本默认 dry-run。确认无误后加 --yes 才会真的构建/发布。' + C.x);

/* ---------- 极简 ZIP 打包器（不引第三方依赖） ---------- */
function writeZip(root, list, outPath) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff); return b; };
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const f of list) {
    const name = Buffer.from(f.rel, 'utf8');
    const data = readFileSync(join(root, f.rel));
    const crc = crc32(data);
    const comp = deflateRawSync(data, { level: 9 });
    const useDeflate = comp.length < data.length;
    const body = useDeflate ? comp : data;
    const method = useDeflate ? 8 : 0;
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0), name, body,
    ]);
    chunks.push(local);
    central.push(Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(list.length), u16(list.length),
    u32(centralBuf.length), u32(offset), u16(0),
  ]);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, Buffer.concat([...chunks, centralBuf, end]));
}
