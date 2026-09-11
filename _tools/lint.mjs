/**
 * lint.mjs —— 构建产物的整体语法检查
 *
 * 为什么需要它：src/ 下每个模块都是**片段**（共享同一层 IIFE，末尾的 })(); 只写在 main.js），
 * 单独对某个文件做语法检查必然误报。唯一可靠的检查对象是**拼接后的完整脚本**。
 * build.mjs 目前不做语法检查，语法错误会直接变成线上白屏，所以这里补上。
 *
 * 用法：node _tools/lint.mjs [--file dist/新宿决战.html]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = resolve(arg('file', 'dist/新宿决战.html'));
if (!existsSync(file)) { console.error('找不到 ' + file); process.exit(1); }

const raw = readFileSync(file, 'utf8');
// 取最后一个 <script> ... </script>（主脚本）
const lastOpen = raw.lastIndexOf('<script>');
const lastClose = raw.lastIndexOf('</script>');
if (lastOpen < 0 || lastClose < 0) { console.error('产物里找不到主脚本'); process.exit(1); }
const code = raw.slice(lastOpen + '<script>'.length, lastClose);
const lineOffset = raw.slice(0, lastOpen).split('\n').length;

const problems = [];

// 1) 整体语法
try {
  new Function(code);
  console.log(`✅ 语法检查通过（主脚本 ${(code.length / 1024).toFixed(0)} KB，${code.split('\n').length} 行）`);
} catch (e) {
  problems.push('语法错误: ' + e.message);
  console.log('❌ 语法错误: ' + e.message);
}

// 2) 常见隐患：可疑的 [i % arr.length] 空数组越界（需人工确认，仅提示）
const risky = [];
code.split('\n').forEach((l, i) => {
  if (/\[\s*\w+\s*%\s*\w+\.length\s*\]/.test(l) && !/\bif\b/.test(l)) risky.push({ line: lineOffset + i, code: l.trim().slice(0, 110) });
});
if (risky.length) {
  console.log('\n⚠️  发现 ' + risky.length + ' 处 [i % arr.length] 取下标（数组为空时会得到 undefined，本轮已出过一次崩溃）：');
  for (const r of risky.slice(0, 20)) console.log(`   L${r.line}: ${r.code}`);
}

// 3) 检查 manifest 里声明的模块是否都真的出现在产物里
const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
const missing = manifest.modules.filter((m) => !code.includes('// src/' + m));
if (missing.length) problems.push('产物缺少模块: ' + missing.join(', '));
else console.log(`✅ manifest 声明的 ${manifest.modules.length} 个模块都在产物里`);

process.exit(problems.length ? 1 : 0);
