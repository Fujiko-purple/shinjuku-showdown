
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function tryFlags(name, flags, port) {
  const dir = mkdtempSync(join(tmpdir(),'gl-'));
  const p = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--remote-debugging-port='+port, '--user-data-dir='+dir, '--no-sandbox', '--mute-audio', ...flags, 'about:blank'
  ], { stdio:'ignore', windowsHide:true });
  let ok = false;
  for (let i=0;i<60;i++){ try { const r = await fetch('http://127.0.0.1:'+port+'/json/version'); if (r.ok){ok=true;break;} } catch{} await sleep(200); }
  if (!ok) { p.kill(); return { name, error:'no devtools' }; }
  const r = await fetch('http://127.0.0.1:'+port+'/json/new?about:blank', { method:'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(res=>ws.addEventListener('open',res,{once:true}));
  let id=0; const pend=new Map();
  ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);} });
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  await send('Runtime.enable');
  const res = await send('Runtime.evaluate', { expression: `(() => { const c=document.createElement('canvas'); c.width=64;c.height=64; const gl=c.getContext('webgl2')||c.getContext('webgl'); if(!gl) return {webgl:false}; const d=gl.getExtension('WEBGL_debug_renderer_info'); return { webgl:true, ver: gl.getParameter(gl.VERSION), renderer: d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER) }; })()`, returnByValue:true });
  ws.close(); p.kill(); await sleep(300); try{rmSync(dir,{recursive:true,force:true});}catch{}
  return { name, ...(res.result && res.result.result ? res.result.result.value : { raw: res.result }) };
}
console.log(JSON.stringify(await tryFlags('auto-default', [], 9351), null, 2));
console.log(JSON.stringify(await tryFlags('swiftshader', ['--use-angle=swiftshader','--enable-unsafe-swiftshader'], 9352), null, 2));
console.log(JSON.stringify(await tryFlags('gpu-enabled', ['--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'], 9353), null, 2));
console.log(JSON.stringify(await tryFlags('d3d11', ['--use-angle=d3d11','--enable-gpu'], 9354), null, 2));
