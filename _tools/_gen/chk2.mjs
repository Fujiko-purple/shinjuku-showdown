import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const h = readFileSync('_tools/_gen/artview.html','utf8');
const i = h.indexOf('<script>'), j = h.lastIndexOf('</script>');
console.log('len', h.length, 'i', i, 'j', j);
const body = h.slice(i+8, j);
writeFileSync('_tools/_gen/extract.js', body);
console.log('bodyLen', body.length, 'lines', body.split('\n').length);
try { execFileSync(process.execPath, ['--check', '_tools/_gen/extract.js'], {stdio:'pipe'}); console.log('OK'); }
catch(e){ console.log('FAIL', String(e.stderr||e.message).split('\n').slice(0,6).join(' | ')); }
console.log('tail:', JSON.stringify(body.slice(-200)));
