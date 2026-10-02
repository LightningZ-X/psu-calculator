/* ============================================================================
 *  注入与状态净化自检（真浏览器）
 *
 *  威胁模型：**别人发来一条链接**，用户点开。
 *  链接形如 https://lightningz-x.github.io/#c=…&j=<JSON>，其中的
 *  storage / customItems / extras 由发送者完全控制。这些字段会被拼进
 *  innerHTML 的属性位（value="…"），凡是没有「形状校验 + 转义」的落点
 *  都可以闭合属性再注入事件处理器。
 *
 *  这里用真实的无头浏览器跑四条：
 *    ① 恶意 #c= 链接：storage[].qty 注入       → 必须不执行、值被夹住
 *    ② 恶意 #c= 链接：customItems[].watts 注入 → 必须不执行、值被夹住
 *    ③ 被写入恶意内容的 localStorage 存档      → 反馈表格必须转义显示
 *    ④ 正常配置链接仍然照常生效（防止修过头）
 *
 *  运行：node tools/securitycheck.mjs [项目根]
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
const errors = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });

/* 静态服务：file:// 下 sessionStorage 行为不一致，用 http 更贴近线上 */
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psu-sec-'));
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
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  send = (method, params = {}) => new Promise(res => { const n = ++id; pending.set(n, res); socket.send(JSON.stringify({ id: n, method, params })); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const waitFor = async (expr, ms = 20000) => {
    const t0 = Date.now();
    for (;;) { if (await ev(expr)) return true; if (Date.now() - t0 > ms) return false; await pause(50); }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  /* 每次导航都记录「有没有载荷被执行」：载荷统一去写 window.__pwned */
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__pwned = null;
      window.addEventListener('error', function (e) {
        if (e.target && e.target.tagName === 'IMG') window.__pwned = 'img-onerror';
      }, true);`
  });

  const goto = async (url) => {
    await send('Page.navigate', { url });
    const ok = await waitFor(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`);
    await pause(500);
    return ok;
  };
  const INJ_IMG = '\\"><img src=x onerror="window.__pwned=window.__pwned||\'payload\'">';

  /* ---- ① storage[].qty 注入 ---- */
  const jStorage = encodeURIComponent(JSON.stringify({
    storage: [{ id: 'ssd-990pro-2t', qty: INJ_IMG }]
  }));
  await goto(base + '?nodisclaimer=1&noanim=1&t=1#c=cpuId=cu7-270kp&j=' + jStorage);
  let st = await ev(`({ pwned: window.__pwned,
    imgs: document.querySelectorAll('img[src="x"]').length,
    rows: document.querySelectorAll('#storageList .storage-row').length,
    qty: (document.querySelector('#storageList input.s-qty') || {}).value })`);
  check('① storage[].qty 注入未执行（无载荷元素、无事件）',
    st.pwned === null && st.imgs === 0 && st.rows === 1,
    'pwned=' + st.pwned + ' imgs=' + st.imgs + ' rows=' + st.rows);
  check('① 夹成 1–8 的整数（攻击字符串被丢弃）',
    /^\d+$/.test(String(st.qty)) && +st.qty >= 1 && +st.qty <= 8, 'qty=' + JSON.stringify(st.qty));

  /* ---- ② customItems[].watts 注入 ---- */
  const jCustom = encodeURIComponent(JSON.stringify({
    customItems: [{ label: 'x', watts: INJ_IMG }]
  }));
  await goto(base + '?nodisclaimer=1&noanim=1&t=2#c=cpuId=cu7-270kp&j=' + jCustom);
  st = await ev(`({ pwned: window.__pwned,
    imgs: document.querySelectorAll('img[src="x"]').length,
    rows: document.querySelectorAll('#customItems .storage-row').length,
    w: (document.querySelector('#customItems input[data-cw]') || {}).value })`);
  check('② customItems[].watts 注入未执行',
    st.pwned === null && st.imgs === 0 && st.rows === 1,
    'pwned=' + st.pwned + ' imgs=' + st.imgs + ' rows=' + st.rows);
  check('② 攻击字符串被丢弃，夹成 0–5000 的数字（0 按原语义显示为空）',
    st.w === '' || (/^\d+$/.test(String(st.w)) && +st.w <= 5000), 'watts=' + JSON.stringify(st.w));

  /* ---- ③ 被污染的 localStorage 存档：反馈表格必须转义 ---- */
  await goto(base + '?nodisclaimer=1&noanim=1&t=3');
  await ev(`localStorage.setItem('psu-calc-2026-v1', JSON.stringify({
    s: { cpuId: 'cu7-270kp' },
    feedback: [{ type: 'gpu', name: ${JSON.stringify(INJ_IMG)}, watts: ${JSON.stringify(INJ_IMG)}, note: 'n' }]
  }))`);
  await goto(base + '?nodisclaimer=1&noanim=1&t=4');
  await waitFor(`document.querySelectorAll('#fbList tr').length > 1`, 8000);
  st = await ev(`({ pwned: window.__pwned, imgs: document.querySelectorAll('img[src="x"]').length,
    cellText: (document.querySelector('#fbList td.nm') || {}).textContent || '',
    wCell: (document.querySelector('#fbList td.wt') || {}).textContent || '' })`);
  check('③ 被污染的存档未执行注入', st.pwned === null && st.imgs === 0,
    'pwned=' + st.pwned + ' imgs=' + st.imgs);
  check('③ 载荷以纯文本显示（说明走了转义）',
    st.cellText.indexOf('<img') !== -1, 'cell=' + JSON.stringify(st.cellText.slice(0, 40)));
  check('③ 功耗列不再是攻击字符串', !/[<>]/.test(st.wCell), 'w=' + JSON.stringify(st.wCell.slice(0, 40)));

  /* ---- ④ 正常链接仍要生效（防止修过头） ---- */
  await goto(base + '?nodisclaimer=1&noanim=1&t=5#c=cpuId=cu7-270kp&ramKits=2&j='
    + encodeURIComponent(JSON.stringify({ storage: [{ id: 'ssd-990pro-2t', qty: 2 }] })));
  st = await ev(`({ cpu: document.querySelector('#cpuSelect').value,
    kits: document.querySelector('#ramKits').value,
    rows: document.querySelectorAll('#storageList .storage-row').length,
    qty: (document.querySelector('#storageList input.s-qty') || {}).value })`);
  check('④ 合法配置链接照常生效',
    st.cpu === 'cu7-270kp' && st.kits === '2' && st.rows === 1 && st.qty === '2',
    'cpu=' + st.cpu + ' kits=' + st.kits + ' qty=' + st.qty);

  check('全程无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' / '));
} catch (e) {
  results.push({ name: '安全自检异常: ' + e.message, ok: false, detail: '' });
} finally {
  if (send) await send('Browser.close').catch(() => {});
  socket?.close(); browser.kill();
  await new Promise(r => server.close(r));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}

console.log('\n注入与状态净化自检');
for (const r of results) console.log('  ' + (r.ok ? '✓ ' : '✗ ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (failed ? '✗ ' + failed + ' / ' + results.length + ' 项未通过' : '✓ 全部通过（' + results.length + ' 项）'));
process.exit(failed ? 1 : 0);
