/* Real wall-clock Chromium checks. Native Node/CDP only; no npm dependencies.
 *
 * 覆盖两段式启动：
 *   ① Canvas 动画 → 遮罩退场 → 声明弹窗接管（此时整页各块已就位但全部不可见）
 *   ② 关掉声明之后，顶栏 / 引导语 / 左右两栏各块按 DOM 顺序依次出现
 *
 * 「依次出现」靠页面内的 RAF 采样器判定：只要某一帧同时存在「已出现的块」和
 * 「还没出现的块」，就说明确实是一块一块来的，而不是一次性淡入。这比在测试侧
 * 轮询取快照稳得多 —— 中间态只有 45ms × 22 ≈ 1s，轮询很容易整个错过。
 *
 * 就位名单由页面通过 window.__PSU_BOOT__ 发布，测试侧不另抄一份，避免走散。
 */
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
  const check = (name, ok, extra) => results.push({ name: name + (extra ? ' | ' + extra : ''), ok: !!ok });

  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(path.resolve(root) + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const mime = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
        '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4'
      };
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
      const timer = setTimeout(() => { pending.delete(n); reject(new Error('CDP timeout: ' + method)); }, 20000);
      pending.set(n, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: n, method, params }));
    });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expression, timeout = 12000) => {
      const started = Date.now();
      for (;;) {
        if (await evaluate(expression)) return true;
        if (Date.now() - started > timeout) return false;
        await pause(40);
      }
    };

    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.bringToFront');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__bootAt = 0; window.__bootEnds = [];
      window.__holdSeen = false; window.__staggerSeen = false;
      document.addEventListener('DOMContentLoaded', () => { window.__bootAt = performance.now(); });
      document.addEventListener('psu:boot-end', () => window.__bootEnds.push(performance.now() - window.__bootAt));
      if (location.search.includes('testFlag=1')) window.__PSU_NOANIM = true;
      /* 采样「开场 Canvas 动画真的在放」。
         补这个闩锁的原因：在此之前 40 条用例全都在断言「各块就位 / 弹窗 / 逐块显现」，
         而这些在动画被整段跳过时**照样成立**（跳过只省掉 canvas 那一段，弹窗编排照旧），
         所以「一打开网页动画没了」这类回归没有任何用例能发现，直到用户报上来。
         ui.js 只在真播动画时才加 psu-boot-running。 */
      window.__introSeen = false;
      (function sample() {
        /* 这段是 addScriptToEvaluateOnNewDocument 注入的，第一次是同步跑的，
           那时 documentElement 还是 null —— 不判空会当场抛异常，
           整个 rAF 采样链就此死掉（表现为所有依赖采样的用例集体失败）。 */
        const de = document.documentElement;
        if (de && de.classList.contains('psu-boot-running')) window.__introSeen = true;
        const cv = document.querySelector('.psu-boot-canvas');
        if (cv && cv.getBoundingClientRect().width > 0) window.__introSeen = true;
        const marked = document.querySelectorAll('.psu-boot-item');
        if (marked.length) {
          window.__holdSeen = true;
          let shown = 0, hidden = 0;
          for (const el of marked) {
            const o = +getComputedStyle(el).opacity;
            if (o > 0.02) shown++;
            if (o < 0.98) hidden++;
          }
          if (shown > 0 && hidden > 0) window.__staggerSeen = true;
        }
        requestAnimationFrame(sample);
      })();
    ` });

    const snapshot = () => evaluate(`(() => {
      const root = document.documentElement;
      const q = s => document.querySelector(s);
      const items = window.__PSU_BOOT__ ? window.__PSU_BOOT__.items() : [];
      return {
        elapsed: performance.now() - window.__bootAt,
        active: root.classList.contains('psu-boot-active'),
        pending: root.classList.contains('psu-boot-pending'),
        hold: root.classList.contains('psu-boot-hold'),
        fill: root.classList.contains('psu-boot-fill'),
        overlay: getComputedStyle(q('.psu-boot')).display,
        page: +getComputedStyle(q('.wrap')).opacity,
        modal: !q('#disclaimerModal').hidden,
        /* hidden=false 不等于看得见：遮罩被 opacity/display 压掉也算「没弹」，
           而 psu-boot-pending 那条 opacity:0 正好会命中 .modal-backdrop。 */
        modalVisible: (() => {
          const el = q('#disclaimerModal');
          if (el.hidden) return false;
          const c = getComputedStyle(el), r = el.getBoundingClientRect();
          return c.display !== 'none' && c.visibility !== 'hidden' &&
            +c.opacity > 0.5 && r.width > 0 && r.height > 0;
        })(),
        inert: document.querySelectorAll('[inert]').length,
        marked: document.querySelectorAll('.psu-boot-item').length,
        itemCount: items.length,
        itemOpacity: items.map(e => +getComputedStyle(e).opacity),
        itemInfo: items.map(e => (+getComputedStyle(e).opacity).toFixed(2) + ' ' +
          e.tagName.toLowerCase() + '.' + String(e.getAttribute('class') || '').split(' ')[0]),
        holdSeen: !!window.__holdSeen,
        staggerSeen: !!window.__staggerSeen,
        introSeen: !!window.__introSeen,
        ends: window.__bootEnds || [],
        overflow: root.scrollWidth > innerWidth
      };
    })()`);

    const shot = async name => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(r.data, 'base64'));
    };
    const open = async (query = '') => {
      await evaluate(`try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}`);
      await send('Page.navigate', { url: base + query });
      for (let i = 0; i < 150; i++) {
        if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`)) break;
        await pause(20);
      }
    };
    // 两段都结束：没有启动类名残留、各块也放完了。
    const settled = `document.querySelectorAll('.psu-boot-item').length === 0 &&
      !document.documentElement.classList.contains('psu-boot-hold') &&
      !document.documentElement.classList.contains('psu-boot-active')`;
    const allVisible = s => s.itemOpacity.length === s.itemCount && s.itemOpacity.every(v => v === 1);
    const notShown = s => '未就位=' + s.itemInfo.filter(x => !x.startsWith('0.00')).join(' / ');
    const notSettled = s => '未落位=' + s.itemInfo.filter(x => !x.startsWith('1.00')).join(' / ');

    /* ------------------------------------------------ A. 正常路径（含自动声明） */
    await open('');
    let s = await snapshot();
    check('启动中：遮罩压住整页、声明未抢先打开、各块还没就位',
      s.active && s.pending && s.overlay === 'flex' && s.page === 0 && !s.modal && s.marked === 0,
      'elapsed=' + Math.round(s.elapsed) + 'ms');
    await shot('01-intro');

    const entered = await waitFor(`document.documentElement.classList.contains('psu-boot-hold')`);
    s = await snapshot();
    check('第一段收束：遮罩退场、声明接管，整页（顶栏 / 引导语 / 两栏各块）一块都还没出现',
      entered && !s.active && !s.pending && s.overlay === 'none' && s.hold && !s.fill &&
      s.modalVisible && s.marked > 0 && s.marked === s.itemCount && s.itemOpacity.every(v => v === 0),
      s.itemCount + ' 块 | ' + notShown(s));
    check('弹窗出现时页面已解除 inert', s.inert === 0);
    /* 关键：确认开场那一段 Canvas 动画真的放了。
       少了这条，即使动画被整段跳过（比如「已看过」标记一直压着不放），
       上面几条也全部会通过。 */
    check('开场真的在放：Canvas 闪电动画跑起来了（不是直接跳到声明）', s.introSeen === true,
      'introSeen=' + s.introSeen);
    await shot('02-dialog');

    /* 就位名单必须覆盖页面上每一块真正会画东西的内容，否则弹窗背后会露出没藏住的块。
       按「有背景 / 有边框 / 有直接文字」判定会画东西，纯容器（.layout、.col-config 等）不算。
       不用像素比对：实测同一状态连拍两张的 PNG 字节与像素都不一致，那个路子不成立。 */
    check('就位名单覆盖了页面上每一块会画东西的内容（没有漏网的块）', await evaluate(`(() => {
      const transparent = v => !v || /^(transparent|rgba?\\(0, 0, 0, 0\\))$/.test(v.trim());
      const paints = el => {
        if (el.closest('.print-only')) return false;            // 只在打印媒体里出现
        const c = getComputedStyle(el);
        if (c.display === 'none' || c.visibility === 'hidden') return false;
        if (!transparent(c.backgroundColor)) return true;
        if (['Top', 'Right', 'Bottom', 'Left'].some(s =>
          parseFloat(c['border' + s + 'Width']) > 0 && !transparent(c['border' + s + 'Color']))) return true;
        return [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      };
      const roots = [document.querySelector('header.top'), document.querySelector('.wrap')].filter(Boolean);
      const all = roots.concat(roots.flatMap(r => [...r.querySelectorAll('*')]));
      const stray = all.filter(paints).filter(el => !el.closest('.psu-boot-item'));
      return stray.length === 0;
    })()`));
    await shot('02b-behind-modal');

    await evaluate('window.__PSU_DISCLAIMER__.close()');
    check('关掉声明后整页逐块出现（采样到「部分已出现 + 部分还没」的中间态）',
      await waitFor(`window.__staggerSeen === true`, 5000));
    await shot('03-stagger');

    const doneAll = await waitFor(settled, 6000);
    s = await snapshot();
    check('出现结束后全部落位、无启动状态残留',
      doneAll && !s.active && !s.hold && !s.fill && s.marked === 0 && s.inert === 0 && allVisible(s),
      'ends=' + s.ends.length + ' | ' + notSettled(s));
    check('psu:boot-end 恰好派发一次', s.ends.length === 1);
    check('呈现过程未擅自选 CPU', (await evaluate(`document.querySelector('#cpuSelect').value`)) === '');
    await shot('04-settled');

    /* ------------------------------------- B. 顶栏重开声明不该再重播一遍动画 */
    await evaluate(`document.querySelector('#btnDisclaimer').click()`);
    await pause(60);
    await evaluate('window.__PSU_DISCLAIMER__.close()');
    await pause(320);
    s = await snapshot();
    check('从顶栏重开声明再关掉不重播出现动画', !s.hold && s.marked === 0 && allVisible(s), notSettled(s));

    /* ------------------------------- C. 声明被抑制时启动结束后照常逐块出现 */
    await open('?nodisclaimer=1');
    s = await snapshot();
    check('抑制声明时启动一开始同样全黑', s.active && !s.modal && s.marked === 0);
    const cHeld = await waitFor(`window.__holdSeen === true`);
    const cStagger = await waitFor(`window.__staggerSeen === true`, 5000);
    check('抑制声明时整页仍然逐块出现（不需要关弹窗也会放）', cHeld && cStagger);
    const cDone = await waitFor(settled, 6000);
    s = await snapshot();
    check('抑制声明时最终无残留、各块全部可见',
      cDone && s.marked === 0 && !s.hold && s.inert === 0 && allVisible(s), notSettled(s));

    /* ------------------------------------------------ D. 启动中点击即跳过 */
    await open('');
    await pause(700);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 200, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 200, button: 'left', clickCount: 1 });
    s = await snapshot();
    check('启动中点击立即进入声明阶段',
      !s.active && !s.pending && s.hold && s.modal && s.inert === 0 && s.marked === s.itemCount,
      'elapsed=' + Math.round(s.elapsed) + 'ms');
    await evaluate('window.__PSU_DISCLAIMER__.close()');
    check('跳过启动后关掉声明依然逐块出现', await waitFor(`window.__staggerSeen === true`, 5000));

    /* ------------------------------------- E. 硬跳过路径不该隐藏任何内容 */
    for (const [label, query] of [['query', '?noanim=1&nodisclaimer=1'], ['flag', '?testFlag=1&nodisclaimer=1']]) {
      await open(query);
      s = await snapshot();
      check(label + ' 完全跳过：不播启动、页面可用、一块内容都没被藏起来',
        !s.active && !s.pending && !s.hold && s.overlay === 'none' && s.page === 1 &&
        s.inert === 0 && s.marked === 0 && !s.holdSeen && allVisible(s), notSettled(s));
    }

    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await open();
    s = await snapshot();
    check('系统减少动态效果：不播启动、也不隐藏任何内容',
      !s.active && !s.hold && s.overlay === 'none' && s.inert === 0 && !s.holdSeen && allVisible(s));
    await shot('reduced-motion');
    await send('Emulation.setEmulatedMedia', { features: [] });

    /* ---------------------------------------- F. 打印媒体下必须看到整页内容 */
    await open();
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    s = await snapshot();
    check('打印媒体下遮罩隐藏、内容全部可见、一块不少',
      s.overlay === 'none' && s.page === 1 && !s.holdSeen && allVisible(s));
    const pdf = await send('Page.printToPDF', { printBackground: true });
    fs.writeFileSync(path.join(artifacts, 'print.pdf'), Buffer.from(pdf.data, 'base64'));
    s = await snapshot();
    check('打印事件结束启动并释放页面',
      !s.active && !s.pending && !s.hold && s.inert === 0 && allVisible(s));
    await send('Emulation.setEmulatedMedia', { media: '' });

    /* ---------------------------------------------------------- G. 窄屏 */
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
    await open('?noanim=1&nodisclaimer=1');
    check('320px 窄屏无横向溢出', !(await snapshot()).overflow);
    await shot('mobile');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    /* ---- H. 同一标签页刷新：启动动画不重播，但关掉声明同样要逐块出现 ---- */
    await open('');
    await waitFor(settled, 15000);
    await send('Page.navigate', { url: base });   // 故意不清理 sessionStorage，等价于按 F5
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`);
    const hHeld = await waitFor(`window.__holdSeen === true`, 3000);
    s = await snapshot();
    check('同标签刷新：不重播启动动画，但各块同样先就位隐藏',
      !s.active && s.overlay === 'none' && s.modalVisible && hHeld && s.marked === s.itemCount &&
      s.introSeen === false,
      'held=' + hHeld + ' marked=' + s.marked + ' introSeen=' + s.introSeen);
    await evaluate('window.__PSU_DISCLAIMER__.close()');
    check('同标签刷新后关掉声明依然逐块出现', await waitFor(`window.__staggerSeen === true`, 5000));
    check('同标签刷新后同样收尾干净', await waitFor(settled, 6000));

    /* ---- I. 本地双击 index.html（file://）：两段照常 + Logo 遮罩可解码 ---- */
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href });
    for (let i = 0; i < 150; i++) {
      if (await evaluate(`location.protocol === 'file:' && document.readyState === 'complete' && !!document.querySelector('.logo .mark')`)) break;
      await pause(20);
    }
    const fHeld = await waitFor(`window.__holdSeen === true`, 12000);
    s = await snapshot();
    check('本地双击打开：启动照常播完并把各块就位',
      fHeld && !s.active && s.modalVisible && s.marked === s.itemCount && s.introSeen === true,
      'marked=' + s.marked + ' introSeen=' + s.introSeen);
    await evaluate('window.__PSU_DISCLAIMER__.close()');
    check('本地双击打开：关掉声明依然逐块出现', await waitFor(`window.__staggerSeen === true`, 5000));
    check('本地双击打开：Logo 遮罩可解码且含可见像素', await evaluate(`(async () => {
      for (const selector of ['.logo .mark', '.logo .wordmark', '.modal-head .mark']) {
        const mask = getComputedStyle(document.querySelector(selector)).maskImage;
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
    await shot('local-file');

    /* ---- J. 单文件产物（dist/整机功耗计算器.html）：两段必须同样成立 ---- */
    const standalone = path.join(root, 'dist', '整机功耗计算器.html');
    if (fs.existsSync(standalone)) {
      await send('Page.navigate', { url: pathToFileURL(standalone).href });
      for (let i = 0; i < 150; i++) {
        if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`)) break;
        await pause(20);
      }
      /* 这里只验证「两段照常 + 各块就位」，不断言开场动画是否重播：
         单文件与上一段共用 file:// 的存储区，而这一段已经是在同一浏览器里
         第 17 次页面加载，实测「清存储 + 重载」也拿不到稳定的结果。
         单文件的动画本身已用全新 profile 单独验证过（startLightningBoot 是函数、
         canvas 有尺寸、psu-boot-running 出现、无异常），那才是可靠的证据。 */
      const jHeld = await waitFor(`window.__holdSeen === true`, 12000);
      s = await snapshot();
      check('单文件产物：启动照常播完并把各块就位',
        jHeld && !s.active && s.modalVisible && s.marked === s.itemCount,
        'held=' + jHeld + ' modal=' + s.modal + ' marked=' + s.marked);
      await evaluate('window.__PSU_DISCLAIMER__.close()');
      check('单文件产物：关掉声明依然逐块出现', await waitFor(`window.__staggerSeen === true`, 5000));
      await shot('standalone');
    }

    /* ---- K. 勾过「不再提示」：本次会话内不再自动弹，但整页照常逐块出现 ---- */
    await open('');                                  // 先干净加载一次，拿到数据版本号
    await evaluate(`sessionStorage.setItem('psu-calc-2026-v1-disclaimer', window.HWDB.meta.version)`);
    await send('Page.navigate', { url: base });       // 只保留会话存储，等价于同一标签页刷新
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`);
    const kStagger = await waitFor(`window.__staggerSeen === true`, 12000);
    const kSettled = await waitFor(settled, 6000);
    s = await snapshot();
    check('会话内勾过「不再提示」：声明不再自动弹（设计如此），顶栏按钮仍可随时打开',
      !s.modal && kStagger && kSettled && !s.hold && allVisible(s),
      'modal=' + s.modal + ' stagger=' + kStagger + ' settled=' + kSettled);
    await evaluate(`document.querySelector('#btnDisclaimer').click()`);
    check('会话内勾过「不再提示」后仍能从顶栏手动打开声明', (await snapshot()).modal);
    check('弹窗打开时「不再提示」勾选框反映真实偏好（否则这个开关是单向的）',
      await evaluate(`document.querySelector('#dmNever').checked === true`));
    await evaluate(`document.querySelector('#dmNever').checked = false; window.__PSU_DISCLAIMER__.close();`);
    await pause(320);
    check('取消勾选并关闭会清掉偏好',
      (await evaluate(`sessionStorage.getItem('psu-calc-2026-v1-disclaimer')`)) === null);
    await send('Page.navigate', { url: base });
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`);
    check('清掉偏好后声明恢复自动弹出',
      await waitFor(`!document.querySelector('#disclaimerModal').hidden`, 8000));

    /* ---- L. 老版本存下的 localStorage 偏好必须被忽略，不能一口吃掉整段编排 ---- */
    await open('');
    await waitFor(settled, 15000);
    await evaluate(`localStorage.setItem('psu-calc-2026-v1-disclaimer', window.HWDB.meta.version)`);
    await evaluate(`try { sessionStorage.clear(); } catch (e) {}`);
    await send('Page.navigate', { url: base });
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`);
    const lModal = await waitFor(`!document.querySelector('#disclaimerModal').hidden`, 12000);
    const lHeld = await waitFor(`window.__holdSeen === true`, 3000);
    s = await snapshot();
    check('旧 localStorage 偏好不再吞掉自动声明（动画 → 声明 → 关掉 → 依次显现）',
      lModal && lHeld && s.marked === s.itemCount, 'modal=' + lModal + ' held=' + lHeld);
    await evaluate('window.__PSU_DISCLAIMER__.close()');
    check('这段流程关掉声明后整页依然逐块出现', await waitFor(`window.__staggerSeen === true`, 6000));

    check('浏览器无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' / '));
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  } catch (e) {
    results.push({ name: e.stack, ok: false });
  } finally {
    if (send) await send('Browser.close').catch(() => {});
    socket?.close();
    browser.kill();
    await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  console.log('\n启动与逐块出现检查（真实时间轴）');
  for (const r of results) console.log('  ' + (r.ok ? '✓ ' : '✗ ') + r.name);
  console.log('  截图与打印证据: ' + artifacts);
  return results.filter(r => !r.ok).length;
}
