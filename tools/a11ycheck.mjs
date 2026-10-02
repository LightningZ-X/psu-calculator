/* ============================================================================
 *  无障碍常驻自检（真浏览器，纯 DOM 断言，不做时序采样所以不会飘）
 *
 *  为什么单独立一个：这类问题「视觉上看不出来」，评审与截图都发现不了，
 *  只有测量才能守住。断言清单对应 WCAG：
 *    ① 每个表单控件都有可访问名称（4.1.2 / 1.3.1）—— 静态控件与
 *       **动态生成的行**都要测（硬盘行、自定义设备行是 JS 拼出来的）
 *    ② aria-hidden 子树里不得有可聚焦元素（硬错误）
 *    ③ 每个 role="group" 都要有名称（否则读屏只报「分组」）
 *    ④ 图形/图片要有替代名称
 *
 *  运行：node tools/a11ycheck.mjs [项目根]
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';

const root = process.argv[2] || process.cwd();
const EDGE = process.env.PSU_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

/* 在页面里跑的「可访问名称」计算器：只认 aria-label / aria-labelledby /
   label[for] / 包裹式 label（以及按钮自身的文字）。刻意不认 title —— 它
   只是最后兜底，不足以当作标签。 */
const NAME_PROBE = `(() => {
  const named = el => {
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return true;
    const lb = el.getAttribute('aria-labelledby');
    if (lb && lb.split(/\\s+/).some(id => { const t = document.getElementById(id); return t && t.textContent.trim(); })) return true;
    if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return true;
    if (el.closest('label')) return true;
    if (el.tagName === 'BUTTON' && el.textContent.trim()) return true;
    return false;
  };
  const controls = [...document.querySelectorAll('select, textarea, input:not([type=hidden]), button')]
    .filter(el => !el.closest('[inert]') || true);   // inert 与否都要有名称
  const unnamed = controls.filter(el => !named(el)).map(el => {
    const row = el.closest('[data-si],[data-qi],[data-di],[data-cl],[data-cw],[data-cd]') ? '(动态行) ' : '';
    return row + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '');
  });
  const focusables = 'a[href],button,input,select,textarea,[tabindex]';
  const hiddenFocus = [...document.querySelectorAll('[aria-hidden="true"]')]
    .flatMap(h => [...h.querySelectorAll(focusables)].filter(e => e.tabIndex >= 0))
    .map(e => (e.tagName + (e.id ? '#' + e.id : '')).toLowerCase());
  const groups = [...document.querySelectorAll('[role="group"]')];
  const unnamedGroups = groups.filter(g => !(g.getAttribute('aria-label') || '').trim() &&
    !(g.getAttribute('aria-labelledby') || '').split(/\\s+/).some(id => {
      const t = document.getElementById(id); return t && t.textContent.trim();
    })).map(g => '#' + (g.id || g.className));
  const graphics = [...document.querySelectorAll('img, [role="img"], svg')]
    .filter(el => !el.closest('[aria-hidden="true"]'));
  const unnamedGraphics = graphics.filter(el => {
    if (el.tagName === 'IMG') return !(el.getAttribute('alt') || '').trim();
    return !((el.getAttribute('aria-label') || '').trim() ||
             (el.querySelector('title') || {}).textContent);
  }).length;
  return { total: controls.length, unnamed, hiddenFocus, groups: groups.length, unnamedGroups,
           graphics: graphics.length, unnamedGraphics };
})()`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psu-a11y-'));
const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });

let socket, send;
try {
  const pf = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(pf) && i < 120; i++) await pause(100);
  const port = fs.readFileSync(pf, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  let id = 0; const pending = new Map();
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); socket.send(JSON.stringify({ id: n, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const waitFor = async (expr, ms = 20000) => {
    const t0 = Date.now();
    for (;;) { if (await ev(expr)) return true; if (Date.now() - t0 > ms) return false; await pause(50); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const goto = async (q) => {
    await send('Page.navigate', { url: base + '?nodisclaimer=1&noanim=1' + q });
    return waitFor(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`);
  };

  /* ---- ① 静态控件 ---- */
  await goto('&t=1');
  let s = await ev(NAME_PROBE);
  check('① 静态表单控件都有可访问名称', s.unnamed.length === 0,
    s.unnamed.length ? '未命名 ' + s.unnamed.length + ': ' + s.unnamed.slice(0, 6).join(', ') : '共 ' + s.total + ' 个控件');
  check('① aria-hidden 子树内没有可聚焦元素', s.hiddenFocus.length === 0,
    s.hiddenFocus.slice(0, 5).join(', '));
  check('① role=group 都有名称', s.unnamedGroups.length === 0,
    s.unnamedGroups.slice(0, 5).join(', ') + ' （共 ' + s.groups + ' 组）');
  check('① 图形/图片都有替代名称', s.unnamedGraphics === 0, '未命名 ' + s.unnamedGraphics + ' / ' + s.graphics);

  /* ---- ① 动态生成的行：硬盘行 + 自定义设备行 ---- */
  const j = encodeURIComponent(JSON.stringify({
    storage: [{ id: 'ssd-990pro-2t', qty: 2 }, { id: 'hdd-exos-20t', qty: 1 }],
    customItems: [{ label: '采集卡', watts: 25 }]
  }));
  await goto('&t=2#c=cpuId=cu7-270kp&j=' + j);
  await waitFor(`document.querySelectorAll('#storageList .storage-row').length === 2`, 8000);
  await waitFor(`document.querySelectorAll('#customItems .storage-row').length === 1`, 8000);
  s = await ev(NAME_PROBE);
  check('① 动态行（硬盘 / 自定义设备）也有可访问名称', s.unnamed.length === 0,
    s.unnamed.length ? '未命名 ' + s.unnamed.length + ': ' + s.unnamed.slice(0, 6).join(', ') : '共 ' + s.total + ' 个控件');

  /* ---- ② 声明弹窗的背景 inert ---- */
  /* 尚未实现，这里刻意不放断言：留一条永远红的检查只会被忽略。
     实现 ② 时在下面补上（打开弹窗 → header.top/.wrap 必须 inert 且弹窗自身可用，
     关闭后必须解除）。 */
} catch (e) {
  results.push({ name: '无障碍自检异常: ' + e.message, ok: false, detail: '' });
} finally {
  if (send) await send('Browser.close').catch(() => {});
  socket?.close(); browser.kill();
  await new Promise(r => server.close(r));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}

console.log('\n无障碍常驻自检');
for (const r of results) console.log('  ' + (r.ok ? '✓ ' : '✗ ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (failed ? '✗ ' + failed + ' / ' + results.length + ' 项未通过' : '✓ 全部通过（' + results.length + ' 项）'));
process.exit(failed ? 1 : 0);
