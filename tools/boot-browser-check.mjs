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

export async function checkBootBrowser(root, executable, options = {}) {
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
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
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
    // Playback assertions need normal motion even when the host OS disables
    // animations. The reduced-motion path is exercised explicitly below.
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    check('普通动画用例固定no-preference（隔离系统设置）', await evaluate("!matchMedia('(prefers-reduced-motion: reduce)').matches"));
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
        /* 弹窗打开时会给背景整片加 inert —— 那是它自己的隔离机制，正当。
           而断言想表达的其实是「启动有没有留下 inert 锁」，所以把它减掉单列。
           两套标记的对象都是 body 的直接子元素，可以直接相减。 */
        inertBoot: document.querySelectorAll('[inert]').length - (function () {
          var mm = document.querySelector('#disclaimerModal');
          if (!mm || mm.hidden) return 0;
          return Array.prototype.filter.call(document.body.children, function (el) {
            return el !== mm && el.inert;
          }).length;
        })(),
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
    const click = async selector => {
      const point = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
      })()`);
      if (!point) throw new Error('点击目标不可见: ' + selector);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    };
    const open = async (query = '') => {
      await evaluate(`window.__bootLeaving = true; try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}`);
      await send('Page.navigate', { url: base + query });
      for (let i = 0; i < 150; i++) {
        if (await evaluate(`!window.__bootLeaving && document.readyState === 'complete' && !!document.querySelector('#cpuSelect')`)) break;
        await pause(20);
      }
      await send('Page.bringToFront');
    };
    // 两段都结束：没有启动类名残留、各块也放完了。
    const settled = `document.querySelectorAll('.psu-boot-item').length === 0 &&
      !document.documentElement.classList.contains('psu-boot-hold') &&
      !document.documentElement.classList.contains('psu-boot-active')`;
    const allVisible = s => s.itemOpacity.length === s.itemCount && s.itemOpacity.every(v => v === 1);
    const notShown = s => '未就位=' + s.itemInfo.filter(x => !x.startsWith('0.00')).join(' / ');
    const notSettled = s => '未落位=' + s.itemInfo.filter(x => !x.startsWith('1.00')).join(' / ');

    if (!options.responsiveOnly) {
      await open('');
      check('首访播放开场，须知不会抢先弹出', (await snapshot()).active && !(await snapshot()).modal);
      check('开场视频实际播放', await waitFor('window.__introSeen === true'));
      await shot('01-intro');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      check('键盘可跳过开场，立即恢复页面且不弹须知', await waitFor(settled) && !(await snapshot()).modal && (await snapshot()).inertBoot === 0);
      await shot('02-ready');
      await send('Page.reload');
      await pause(500);
      check('回访不自动播放开场', !(await snapshot()).active && !(await snapshot()).modal);
      await evaluate("document.querySelector('#btnReplayIntro').click()");
      check('用户仍可手动重播', await waitFor("document.documentElement.classList.contains('psu-boot-active')"));
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 50, y: 50, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 50, y: 50, button: 'left', clickCount: 1 });
      check('鼠标可跳过重播且无输入锁残留', await waitFor(settled) && (await snapshot()).inertBoot === 0);
      await evaluate("document.querySelector('#btnDisclaimer').click()");
      check('使用须知可主动打开', await waitFor("!document.querySelector('#disclaimerModal').hidden"));
      await evaluate('window.__PSU_DISCLAIMER__.close()');
      await pause(250);
      await open('?noanim=1');
      check('首访为快速估算，CPU 和显卡直接可填', await evaluate(`document.documentElement.dataset.calcMode === 'quick' && !document.querySelector('#cpuSelect').closest('.card').classList.contains('is-collapsed') && !document.querySelector('#gpuModel').closest('.card').classList.contains('is-collapsed')`));
      check('空状态给出下一步而非电源推荐', await evaluate(`document.querySelector('#recoBig').textContent.includes('—') && document.querySelector('#resultNext').textContent === '选择 CPU'`));
      check('页面留白、页首和待选结果的渐变会自行移动', await evaluate(`new Promise(resolve => {
        const selectors = ['.site-lighting', '.page-intro', '.reco'];
        const read = () => selectors.map(selector => getComputedStyle(document.querySelector(selector), '::before').transform);
        const first = read();
        setTimeout(() => resolve(read().every((value, index) => value !== 'none' && value !== first[index])), 300);
      })`));
      if (await evaluate("matchMedia('(any-hover: hover) and (any-pointer: fine)').matches")) {
        const points = [{ x: 24, y: 192 }, { x: 1390, y: 310 }];
        const followed = [];
        for (const point of points) {
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
          followed.push(await waitFor(`document.querySelector('.site-cursor-light[data-active]')?.style.transform.startsWith('translate3d(${point.x}px, ${point.y}px,')`));
        }
        check('跨页面留白区域移动光标时高光跟随坐标', followed.every(Boolean));
        const pointAt = (selector, fraction) => evaluate(`(() => {
          const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
          return { x: Math.round(rect.left + rect.width * ${fraction}), y: Math.round(rect.top + rect.height / 2) };
        })()`);
        const recoPoint = await pointAt('.reco', .5);
        const recoScale = "getComputedStyle(document.querySelector('.reco')).scale";
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...recoPoint });
        const cardSpring = await waitFor(`parseFloat(${recoScale}) > 1.029`, 900) &&
          await waitFor(`${recoScale} === '1.027'`, 900);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points[0] });
        check('无需点击，推荐面板悬停时弹性放大并在移出后还原', cardSpring &&
          await waitFor(`${recoScale} === 'none'`, 900));

        const modeOption = "#calcMode [data-mode='full']";
        const option = `document.querySelector(${JSON.stringify(modeOption)})`;
        const optionPoint = await pointAt(modeOption, .2);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...optionPoint });
        const expanding = await waitFor(`(() => {
          const option = document.querySelector(${JSON.stringify(modeOption)});
          const fill = getComputedStyle(option, '::before');
          const origin = parseFloat(option.style.getPropertyValue('--option-light-x'));
          return option.hasAttribute('data-option-light') && origin > 16 && origin < 24 &&
            new DOMMatrix(fill.transform).a > .03 && new DOMMatrix(fill.transform).a < 1;
        })()`, 500);
        check('选项悬停时整体弹性放大，无须点击', await waitFor(`
          parseFloat(getComputedStyle(${option}).scale) > 1.05 &&
          ${option}.getAttribute('aria-pressed') === 'false'
        `, 900));
        const expanded = await waitFor(`getComputedStyle(document.querySelector(${JSON.stringify(modeOption)}), '::before').opacity === '1'`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points[0] });
        check('鼠标接触选项后从进入点拉伸填充，移开收回且未选中', expanding && expanded &&
          await waitFor(`(() => {
            const option = document.querySelector(${JSON.stringify(modeOption)});
            return option.getAttribute('aria-pressed') === 'false' &&
              getComputedStyle(option, '::before').opacity === '0';
          })()`));
        const group = "document.querySelector('#calcMode')";
        const trackX = `new DOMMatrix(getComputedStyle(${group}, '::after').transform).m41`;
        const oldTrackX = await evaluate(trackX);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...optionPoint });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...optionPoint, button: 'left', clickCount: 1 });
        check('选项按住压缩，同时保留原选中项', await waitFor(`
          new DOMMatrix(getComputedStyle(${option}).transform).a <= .97 &&
          ${option}.getAttribute('aria-pressed') === 'false'
        `, 1000));
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...optionPoint, button: 'left', clickCount: 1 });
        check('松开时选项回弹，红色选中条滑向新位置', await waitFor(`(() => {
          const track = ${group};
          const targetX = parseFloat(track.style.getPropertyValue('--selection-x'));
          const currentX = ${trackX};
          return ${option}.getAttribute('aria-pressed') === 'true' &&
            new DOMMatrix(getComputedStyle(${option}).transform).a > 1 &&
            currentX > ${oldTrackX} && currentX < targetX;
        })()`, 1000) && await waitFor(`
          Math.abs(${trackX} - parseFloat(${group}.style.getPropertyValue('--selection-x'))) < .5
        `));
        await evaluate("document.querySelector('#calcMode [data-mode=quick]').click()");
      }
      await evaluate(`document.querySelector('#cpuSearch').value = '9600X'; document.querySelector('#cpuSearch').dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#cpuSearch').focus();`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
      check('方向键从搜索框进入结果', await evaluate("!!document.activeElement.closest('#cpuSearchResults')"));
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      check('键盘选入 CPU 后提示选择显卡', await evaluate("document.querySelector('#cpuSelect').value === 'r5-9600x' && document.querySelector('#recoSub').textContent.includes('还差显卡')"));
      await evaluate("document.querySelector('#chooseIgpu').click()");
      check('显式选核显后推荐目标与最低值分开展示', await evaluate(`document.querySelector('#gpuModel').value === '__igpu__' && /^[0-9]+[ ]*W$/.test(document.querySelector('#recoBig').textContent.trim()) && document.querySelector('#recoSub').textContent.includes('最低参考')`));
      await evaluate(`document.querySelector('#gpuSearch').value = '5090'; document.querySelector('#gpuSearch').dispatchEvent(new Event('input', { bubbles: true }));`);
      check('显卡搜索支持型号与板型，结果可继续查看', await evaluate("document.querySelectorAll('#gpuSearchResults button').length === 15 && !document.querySelector('#gpuSearchMore').hidden"));
      await evaluate("document.querySelector('#gpuSearchMore').click()");
      check('查看更多扩展结果并移动焦点', await evaluate("document.querySelectorAll('#gpuSearchResults button').length === 30 && !!document.activeElement.closest('#gpuSearchResults')"));
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      check('Esc 收起搜索结果并恢复输入焦点', await evaluate("!document.querySelector('#gpuSearchResults').children.length && document.activeElement.id === 'gpuSearch'"));
      await evaluate("document.querySelector('#completeConfig').click()");
      check('完善配置保留核心硬件并展开主板', await evaluate("document.documentElement.dataset.calcMode === 'full' && document.querySelector('#cpuSelect').value === 'r5-9600x' && document.activeElement.id === 'moboSelect' && !document.querySelector('#moboSelect').closest('.card').classList.contains('is-collapsed')"));
      await evaluate(`var m = document.querySelector('#moboSelect'); m.value = [...m.options].find(o => o.textContent.includes('Z890')).value; m.dispatchEvent(new Event('change', { bubbles: true }));`);
      check('兼容性冲突成为主状态且有修改入口', await evaluate("document.querySelector('#recoLabel').textContent.includes('先解决') && !document.querySelector('#resolveConflict').hidden && document.querySelector('#recoBig').closest('.reco').classList.contains('has-conflict')"));
      await evaluate("document.querySelector('#resolveConflict').click()");
      check('修改冲突跳转到配置控件', await evaluate("!!document.activeElement.closest('.col-config')"));
      await shot('03-conflict');
      // Legacy links omitted full mode because it used to be the default.
      await send('Page.navigate', { url: base + '?noanim=1#c=cpuId=r5-9600x&gpuId=__igpu__' });
      await waitFor("document.readyState === 'complete' && document.querySelector('#cpuSelect').value === 'r5-9600x'");
      check('旧分享链接保留完整配置语义', await evaluate("document.documentElement.dataset.calcMode === 'full'"));
      await evaluate("document.querySelector('#calcMode [data-mode=quick]').click()");
      check('新分享链接显式保存模式', await evaluate("location.hash.includes('mode=quick')"));
      await evaluate("document.querySelector('#btnQuickStart').click()");
    }
    for (const width of [390, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await pause(200);
      check(width + 'px 页面无横向溢出', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
      check(width + 'px 结果条可达性', await evaluate(`(getComputedStyle(document.querySelector('#mobileBar')).display !== 'none') === (innerWidth <= 1180)`));
      await shot('responsive-' + width);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await evaluate("document.querySelector('#mobileBarAction').click()");
    check('手机结果按钮跳到完整结果', await evaluate("document.activeElement.id === 'resultPanel'"));
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await open('');
    check('减少动态效果时直接显示可操作表单', !(await snapshot()).active && !(await snapshot()).modal && (await snapshot()).inertBoot === 0);
    const ambientStyle = "getComputedStyle(document.querySelector('.site-lighting'), '::before')";
    const cursor = "document.querySelector('.site-cursor-light')";
    const ambientPosition = await evaluate(ambientStyle + '.transform');
    await pause(850);
    check('系统减少动效时仍默认持续流光', await evaluate(`
      ${ambientStyle}.animationDuration === '11s' && ${ambientStyle}.animationIterationCount === 'infinite' &&
      ${ambientStyle}.transform !== ${JSON.stringify(ambientPosition)}`));
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const movePointer = x => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 170 });
    const spotlightAt = x => waitFor(`(() => {
      const light = ${cursor};
      const rect = light.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - ${x}) < 2 && getComputedStyle(light).opacity === '1';
    })()`);
    await movePointer(20);
    const leftSpot = await spotlightAt(20);
    const cardPoint = await evaluate(`(() => {
      const rect = document.querySelector('#cpuSelect').closest('.card').getBoundingClientRect();
      return { x: Math.round(rect.left + 32), y: Math.round(rect.top + 25) };
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...cardPoint });
    const configScale = "getComputedStyle(document.querySelector('#cpuSelect').closest('.card')).scale";
    check('系统减少动效时，光效开关仍可启用弹性放大', await waitFor(`
      parseFloat(${configScale}) > 1.029
    `, 900) && await waitFor(`${configScale} === '1.027'`, 900));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardPoint.x + 1, y: cardPoint.y });
    check('经过卡片时 ROG 红高光定位在卡片内', await waitFor(`(() => {
      const card = document.querySelector('#cpuSelect').closest('.card');
      const rect = card.getBoundingClientRect();
      const spotX = (${cardPoint.x + 1} - rect.left) * card.offsetWidth / rect.width;
      return card.hasAttribute('data-spotlight') && !${cursor}.hasAttribute('data-active') &&
        Math.abs(parseFloat(card.style.getPropertyValue('--spot-x')) - spotX) < 1 &&
        getComputedStyle(card).backgroundImage.includes('rgba(255, 40, 78, 0.19)');
    })()`));
    await movePointer(1410);
    check('系统减少动效时左右留白仍响应真实光标', leftSpot && await spotlightAt(1410) &&
      await waitFor("!document.querySelector('.layout .card[data-spotlight]')"));
    await click('.header-more > summary');
    await click('#btnLightEffects');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardPoint.x, y: cardPoint.y });
    check('关闭光效后停止流光、追光和悬停放大', await waitFor(`
      document.querySelector('#btnLightEffects').getAttribute('aria-pressed') === 'false' &&
      ${ambientStyle}.animationName === 'none' && !${cursor}.hasAttribute('data-active') && ${configScale} === 'none'
    `, 900));
    await evaluate('window.__bootLeaving = true');
    await send('Page.reload');
    check('重载保留光效选择', await waitFor(`!window.__bootLeaving && document.readyState === 'complete' &&
      document.querySelector('#btnLightEffects').getAttribute('aria-pressed') === 'false' && ${ambientStyle}.animationName === 'none'`));
    await click('.header-more > summary');
    await click('#btnLightEffects');
    await movePointer(1410);
    check('重新打开光效后恢复循环和追光', await evaluate(`${ambientStyle}.animationIterationCount === 'infinite'`) && await spotlightAt(1410));
    if (await evaluate("document.querySelector('.header-more').open")) await click('.header-more > summary');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    const replayFrame = `(() => {
      const canvas = document.querySelector('.psu-boot-canvas');
      return canvas.getBoundingClientRect().width > 0 && canvas.bootVideo?.currentTime > 0.8 && Number(canvas.dataset.frame) > 24;
    })()`;
    for (const [label, selector] of [['Logo', '.logo'], ['更多菜单', '#btnReplayIntro']]) {
      if (selector === '#btnReplayIntro') await click('.header-more > summary');
      await click(selector);
      check('减少动态效果时点击' + label + '可手动重播视频', await waitFor(replayFrame, 2200));
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      check('跳过' + label + '重播后恢复页面输入', await waitFor(settled) && (await snapshot()).inertBoot === 0 && (await snapshot()).overlay === 'none');
    }
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    check('打印隐藏搜索与底部操作条', await evaluate("getComputedStyle(document.querySelector('#mobileBar')).display === 'none' && document.querySelector('#cpuSearch').getBoundingClientRect().height === 0"));
    await send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await open('?noanim=1');
    check('视频素材加载失败会结束，不留下黑幕', await evaluate(`new Promise(resolve => {
      const canvas = document.querySelector('.psu-boot-canvas'), src = canvas.dataset.video;
      canvas.dataset.video = 'missing-ux-video.mp4'; let count = 0;
      const stop = startLightningBoot(canvas, () => { count++; });
      setTimeout(() => { stop(); canvas.dataset.video = src; resolve(count === 1); }, 500);
    })`));
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'dist', '整机功耗计算器.html')).href });
    if (!await waitFor("location.protocol === 'file:' && document.readyState === 'complete'")) throw new Error('离线版加载超时');
    check('离线版在减少动态效果时跳过自动播放', !(await snapshot()).active);
    await click('.logo');
    check('离线版点击 Logo 可重播内联视频', await waitFor(replayFrame, 2200));
    check('离线版播放完成后恢复输入', await waitFor(settled, 5000) && (await snapshot()).inertBoot === 0);
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
  console.log('\n开场与快速选型检查（真实浏览器）');
  for (const r of results) console.log('  ' + (r.ok ? '✓ ' : '✗ ') + r.name);
  console.log('  截图与打印证据: ' + artifacts);
  return results.filter(r => !r.ok).length;
}
