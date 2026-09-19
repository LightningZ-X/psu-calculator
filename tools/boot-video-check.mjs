/* Real wall-clock Chromium checks. Native Node/CDP only; no npm dependencies. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';

export async function checkBootBrowser(root, executable) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psu-boot-browser-'));
  const artifacts = process.env.PSU_BOOT_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), 'psu-boot-evidence-'));
  fs.mkdirSync(artifacts, { recursive: true });
  const results = [], errors = [];
  const check = (name, ok) => results.push({ name, ok: !!ok });
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let socket, send;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await pause(100);
    if (!fs.existsSync(portFile)) throw new Error('浏览器未提供 CDP 端口');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
        if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
      }
    };
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => { pending.delete(n); reject(new Error('CDP timeout: ' + method)); }, 15000);
      pending.set(n, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: n, method, params }));
    });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.bringToFront');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      if (location.search.includes('geometry=1')) sessionStorage.clear();
      window.__bootEvents = [];
      document.addEventListener('DOMContentLoaded', () => { window.__bootAt = performance.now(); });
      document.addEventListener('psu:boot-end', () => window.__bootEvents.push(performance.now() - window.__bootAt));
      if (location.search.includes('testFlag=1')) window.__PSU_NOANIM = true;
    ` });
    const state = () => evaluate(`(() => { const v=document.querySelector('.psu-boot-video'); return {active:document.documentElement.classList.contains('psu-boot-active'), time:v.currentTime, width:v.videoWidth, muted:v.muted, inert:document.querySelectorAll('[inert]').length, ends:window.__bootEvents.length, modal:!document.querySelector('#disclaimerModal').hidden}; })()`);
    const open = async (query='?nodisclaimer=1') => {
      await evaluate('try {sessionStorage.clear();localStorage.clear()} catch(e){}');
      await send('Page.navigate',{url:base+query});
      for(let i=0;i<100;i++){if(await evaluate(`document.readyState==='complete' && !!document.querySelector('#cpuSelect')`))break;await pause(30);}
    };
    await open(); await pause(900);
    let st=await state(); check('V2 muted video plays during locked startup',st.active && st.time>0 && st.width===1280 && st.muted && st.inert>0);
    await pause(3700); st=await state();check('Ended restores calculator exactly once',!st.active && st.inert===0 && st.ends===1);
    check('Calculator keeps empty initial selection',await evaluate(`document.querySelector('#cpuSelect').value===''`));
    await send('Page.reload');await pause(400);check('Same session skips replay',!(await state()).active);
    await open();await pause(200);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:300,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:400,y:300,button:'left',clickCount:1});
    st=await state();check('Pointer skips and removes inert',!st.active && st.inert===0 && st.ends===1);
    await open('?noanim=1&nodisclaimer=1');check('noanim bypass',!(await state()).active);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await open();check('Reduced motion bypass',!(await state()).active);
    await send('Emulation.setEmulatedMedia',{features:[]});
    await open();await evaluate(`document.querySelector('.psu-boot-video').dispatchEvent(new Event('error'))`);st=await state();check('Media failure restores calculator',!st.active && st.inert===0);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await open();await pause(800);
    check('Mobile plays without overflow',await evaluate(`document.querySelector('.psu-boot-video').currentTime>0 && document.documentElement.scrollWidth<=innerWidth`));
    await pause(3800);check('Mobile completes',!(await state()).active);
    await open('?notice=1');await pause(4600);check('Disclaimer opens after video', (await state()).modal);
    for (const [width,height] of [[320,568],[390,844],[430,932],[844,390],[768,1024],[1440,900]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});
      await open('?nodisclaimer=1&geometry=1'); await pause(900);
      const geometry=await evaluate(`(() => {const v=document.querySelector('.psu-boot-video').getBoundingClientRect(),o=document.querySelector('.psu-boot').getBoundingClientRect();return {ratio:v.width/v.height,cx:v.x+v.width/2,cy:v.y+v.height/2,ow:o.width,oh:o.height,vw:v.width,vh:v.height,sw:document.documentElement.scrollWidth,iw:innerWidth};})()`);
      console.log(width,height,geometry);
      check('Proportional centered video '+width+'x'+height,Math.abs(geometry.ratio-16/9)<.002 && Math.abs(geometry.cx-width/2)<1 && Math.abs(geometry.cy-height/2)<1 && geometry.sw<=geometry.iw && (width>=height || Math.abs(geometry.vh-width)<1));
      if(width===390){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(artifacts,'portrait.png'),Buffer.from(shot.data,'base64'));}
    }
    check('No browser exceptions',errors.length===0);
  } catch (e) { results.push({ name: e.stack, ok: false }); }
  finally {
    if (send) await send('Browser.close').catch(() => {});
    socket?.close();
    browser.kill();
    await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  console.log('\n启动与降级检查（真实时间轴）');
  for (const r of results) console.log('  ' + (r.ok ? '✓ ' : '✗ ') + r.name);
  console.log('  截图与打印证据: ' + artifacts);
  return results.filter(r => !r.ok).length;
}

process.exitCode = await checkBootBrowser(process.cwd(), process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') ? 1 : 0;
