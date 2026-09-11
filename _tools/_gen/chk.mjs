import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const R = process.cwd();
const parts = ['src/_script-prefix.js','src/vendor.three.js','src/contract.js','src/fighters.js','_tools/artview-app.js'];
for (let n=1;n<=parts.length;n++){
  let body = '';
  for (const p of parts.slice(0,n)) body += readFileSync(join(R,p),'utf8') + '\n';
  body += '})();\n';
  const f = '_tools/_gen/check'+n+'.js';
  writeFileSync(f, body);
  try { execFileSync(process.execPath, ['--check', f], {stdio:'pipe'}); console.log(n, parts[n-1], 'OK'); }
  catch(e){ console.log(n, parts[n-1], 'FAIL', String(e.stderr||e.message).split('\n').slice(0,4).join(' | ')); }
}
