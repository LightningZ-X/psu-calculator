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
      window.__bootEvents = [];
      document.addEventListener('DOMContentLoaded', () => { window.__bootAt = performance.now(); });
      document.addEventListener('psu:boot-end', () => window.__bootEvents.push(performance.now() - window.__bootAt));
      if (location.search.includes('testFlag=1')) window.__PSU_NOANIM = true;
    ` });
    const snapshot = () => evaluate(`(() => {
      const q = s => document.querySelector(s), style = s => getComputedStyle(q(s));
      return { elapsed: performance.now() - window.__bootAt,
        active: document.documentElement.classList.contains('psu-boot-active'),
        overlay: style('.psu-boot').display, focus: +style('.psu-boot-focus').opacity,
        line: style('.psu-boot-line').transform,
        ticks: [...document.querySelectorAll('.psu-boot-ticks i')].map(e => +getComputedStyle(e).opacity),
        slices: [...document.querySelectorAll('.psu-boot-half')].map(e => getComputedStyle(e).transform),
        sliceOffsets: [...document.querySelectorAll('.psu-boot-half')].map(e => {
          const m = new DOMMatrix(getComputedStyle(e).transform); return [m.e, m.f];
        }),
        sliceTravel: [...document.querySelectorAll('.psu-boot-half')].map(e => {
          const m = new DOMMatrix(getComputedStyle(e).transform); return Math.hypot(m.e, m.f);
        }),
        cut: +getComputedStyle(q('.psu-boot-mark'), '::after').opacity,
        cutSlope: (() => { const m = new DOMMatrix(getComputedStyle(q('.psu-boot-mark'), '::after').transform); return m.b / m.a; })(),
        strikeScale: (() => { const m = new DOMMatrix(getComputedStyle(q('.psu-boot-mark'), '::after').transform); return Math.hypot(m.a, m.b); })(),
        page: +style('.wrap').opacity,
        fills: [...document.querySelectorAll('.psu-boot-item')].map(e => +getComputedStyle(e).opacity),
        inert: document.querySelectorAll('[inert]').length,
        modal: !q('#disclaimerModal').hidden,
        ends: window.__bootEvents || [],
        overflow: document.documentElement.scrollWidth > innerWidth,
        cpu: q('#cpuSelect').value
      };
    })()`);
    const shot = async name => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(r.data, 'base64'));
    };
    const open = async (query = '?nodisclaimer=1', clear = true) => {
      if (clear) await evaluate(`try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}`);
      await send('Page.navigate', { url: base + query });
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`)) break;
        await pause(20);
      }
    };
    const at = async ms => {
      const elapsed = await evaluate('performance.now() - window.__bootAt');
      if (elapsed < ms) await pause(ms - elapsed);
      return snapshot();
    };
    // Normal path includes the automatic disclaimer: it must not preempt the animation.
    await open('');
    let s = await at(150);
    check('0–0.4s 纯黑，声明未抢先打开', s.active && s.focus === 0 && s.page === 0 && !s.modal);
    await shot('01-black');
    s = await at(460);
    check('斜切前上半向右上、下半向左下错开',
      s.cut === 0 && s.sliceOffsets[0][0] > 0 && s.sliceOffsets[0][1] < 0 &&
      s.sliceOffsets[1][0] < 0 && s.sliceOffsets[1][1] > 0);
    check('两半沿同一切线反向错开，保持中心不偏移',
      Math.abs(s.sliceOffsets[0][0] + s.sliceOffsets[1][0]) < .01 &&
      Math.abs(s.sliceOffsets[0][1] + s.sliceOffsets[1][1]) < .01 &&
      Math.abs(s.sliceOffsets[0][1] / s.sliceOffsets[0][0] - Math.tan(-37 * Math.PI / 180)) < .01);
    await shot('02-before-cut');
    s = await at(620);
    // CSS starts on the first rendered frame, which can lag DOMContentLoaded under CI load.
    // Observe within the actual .52–.84s strike window, not a single compositor sample.
    for (let i = 0; i < 7 && s.cut === 0 && s.elapsed < 760; i++) {
      await pause(20); s = await snapshot();
    }
    check('斜贯雷击劈入，LIGHTNING 标志沿切口归位', s.slices.length === 2 && s.cut > 0 && s.slices.some(x => x !== 'matrix(1, 0, 0, 1, 0, 0)'));
    check('切线方向为右上到左下', Math.abs(s.cutSlope - Math.tan(-37 * Math.PI / 180)) < .001);
    check('雷击瞬间贯穿视野，未使用全屏闪光', s.strikeScale > 0 && s.strikeScale <= 1.001);
    check('斜切后的实际位移仍不超过 8px', s.sliceTravel.every(x => x <= 8));
    await shot('02-slash-lock');
    s = await at(650); check('0.4s 后中央标记硬切出现', s.focus === 1 && s.overlay === 'flex'); await shot('02-mark');
    s = await at(1050);
    check('斜切合拢结束后保持稳定，切线消失', s.cut === 0 && s.slices.every(x => x === 'matrix(1, 0, 0, 1, 0, 0)'));
    await shot('02-slash-settled');
    s = await at(2050); check('细线展开中', s.line.startsWith('matrix(') && s.line !== 'matrix(1, 0, 0, 1, 0, 0)'); await shot('03-line');
    s = await at(2950); check('三格进度按先后推进', s.ticks[0] > s.ticks[1] && s.ticks[1] > s.ticks[2]); await shot('04-ticks');
    s = await at(4220);
    // Observe the blackout before 4.4s, allowing the compositor to finish its current frame.
    for (let i = 0; i < 6 && s.focus !== 0 && s.elapsed < 4350; i++) {
      await pause(20); s = await snapshot();
    }
    check('收束后有完整黑场', s.elapsed < 4400 && s.focus === 0 && s.overlay === 'flex' && s.page === 0); await shot('05-blackout');
    s = await at(4700); check('4.4–5s 框架淡入，内容尚未填充', s.overlay === 'none' && s.page > 0 && s.page < 1 && s.fills.every(x => x === 0)); await shot('06-framework');
    s = await at(5500); check('5s 后内容错峰填入且声明仍等待', s.fills.some(x => x > 0) && s.fills.some(x => x === 0) && !s.modal); await shot('07-fill');
    s = await at(6350); check('约 6.2s 清理完毕并打开声明', !s.active && !s.inert && !s.fills.length && s.modal && s.ends.length === 1 && Math.abs(s.ends[0] - 6200) < 300);
    await evaluate('window.__PSU_DISCLAIMER__.close()'); await shot('08-complete');
    check('启动、顶栏、声明使用同一截图提取标记', await evaluate(`
      ['.psu-boot-half', '.logo .mark', '.modal-head .mark'].every(s =>
        getComputedStyle(document.querySelector(s)).maskImage === getComputedStyle(document.querySelector('.logo .mark')).maskImage)
    `));
    await evaluate("document.querySelector('#btnTheme').click()");
    check('浅色主题标记使用原有深红令牌', await evaluate(`
      getComputedStyle(document.querySelector('.logo .mark')).backgroundColor === 'rgb(212, 0, 41)'
    `));
    await shot('09-light-theme');
    await evaluate("document.querySelector('#btnTheme').click()");
    check('呈现过程未擅自选 CPU', (await snapshot()).cpu === '');
    await open('?nodisclaimer=1', false); check('同标签刷新不重复播放', !(await snapshot()).active);

    for (const [label, query] of [['query', '?noanim=1&nodisclaimer=1'], ['flag', '?testFlag=1&nodisclaimer=1']]) {
      await open(query); s = await snapshot();
      check(label + ' 完全跳过、页面可用', !s.active && s.overlay === 'none' && s.page === 1 && !s.inert);
      await shot('skip-' + label);
    }
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await open(); s = await snapshot(); check('系统减少动态效果完全不播', !s.active && s.overlay === 'none' && !s.inert); await shot('reduced-motion');
    await send('Emulation.setEmulatedMedia', { features: [] });

    for (const kind of ['click', 'key', 'touch']) {
      await open(); await at(150);
      if (kind === 'click') await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 200, button: 'left', clickCount: 1 });
      if (kind === 'key') await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      if (kind === 'touch') await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 200 }] });
      s = await snapshot(); check(kind + ' 立即跳过并解除 inert', !s.active && !s.inert && s.page === 1);
      if (kind === 'click') await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 200, button: 'left', clickCount: 1 });
      if (kind === 'key') await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
      if (kind === 'touch') await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await open(); await at(5350);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    s = await snapshot(); check('填充阶段也可立即跳过', !s.active && !s.fills.length && !s.inert);

    await open(); await at(150);
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    s = await snapshot(); check('打印 CSS 在启动中隐藏遮罩并还原结果', s.overlay === 'none' && s.page === 1 && s.fills.every(x => x === 1)); await shot('print');
    const pdf = await send('Page.printToPDF', { printBackground: true });
    fs.writeFileSync(path.join(artifacts, 'print.pdf'), Buffer.from(pdf.data, 'base64'));
    check('打印事件结束启动并释放页面', !(await snapshot()).active);
    await send('Emulation.setEmulatedMedia', { media: '', features: [] });

    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Page.navigate', { url: base }); await pause(400);
    check('禁用 JS 时遮罩隐藏、noscript 提示可见', await evaluate(`getComputedStyle(document.querySelector('.psu-boot')).display === 'none' && document.querySelector('noscript div').offsetHeight > 0`));
    await shot('no-js');
    await send('Emulation.setScriptExecutionDisabled', { value: false });

    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
    await open(); await at(650); check('320px 窄屏启动无横向溢出', !(await snapshot()).overflow); await shot('mobile-mark');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    // CDP acknowledges emulation before Chromium dispatches the MediaQueryList change event.
    for (let i = 0; i < 10 && (await snapshot()).active; i++) await pause(20);
    check('播放中开启减少动态效果立即收尾', !(await snapshot()).active);
    // file:// 下外部 PNG 可被 Image 加载，却会被 CSS mask 的 CORS 规则拦下。
    await send('Emulation.setEmulatedMedia', { features: [] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href + '?noanim=1&nodisclaimer=1' });
    for (let i = 0; i < 100; i++) {
      if (await evaluate("location.protocol === 'file:' && document.readyState === 'complete' && !!document.querySelector('.logo .mark')")) break;
      await pause(20);
    }
    check('本地双击打开时所有 Logo 遮罩可解码且含可见像素', await evaluate(`(async () => {
      for (const selector of ['.psu-boot-half', '.logo .mark', '.logo .wordmark', '.modal-head .mark']) {
        const el = document.querySelector(selector), mask = getComputedStyle(el).maskImage;
        if (!mask.startsWith('url("data:image/png;base64,')) return false;
        const img = new Image(); img.src = mask.slice(5, -2);
        try { await img.decode(); } catch { return false; }
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
        if (!pixels.some((v, i) => i % 4 === 3 && v > 0)) return false;
      }
      const box = document.querySelector('.logo .mark').getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    })()`));
    await shot('local-file-logo');
    check('连续切换选项触发局部反馈', await evaluate(`(() => {
      const el = document.querySelector('select');
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return getComputedStyle(el).animationName === 'psu-ui-feedback';
    })()`));
    await pause(300);
    check('交互反馈完成后清理，不残留透明度或位移', await evaluate(`!document.querySelector('.psu-ui-feedback')`));
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    check('减少动态效果时切换不触发反馈', await evaluate(`(() => {
      document.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));
      return !document.querySelector('.psu-ui-feedback');
    })()`));
    check('浏览器无未捕获异常', errors.length === 0);
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, errors }, null, 2));
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
