/* ============================================================================
 *  ui.js —— 改版增强层
 * ----------------------------------------------------------------------------
 *  设计原则（与改版提示词包的硬性约束一致）：
 *    · 不修改任何 id / name / data-* 属性 —— app.js 靠 getElementById 绑定
 *    · 不参与任何计算 —— 只读取 app.js 渲染出来的 DOM 文本
 *    · 不改动 engine.js / db*.js、不改动 app.js
 *    · 全部效果都能在 @media print 里被压平（见 style.css 打印段）
 *
 *  它只做五件事：
 *    1. 给配置卡注入折叠开关与已选摘要；默认展开核心填写，记住用户偏好
 *    2. 用 IntersectionObserver 高亮当前正在看的卡片
 *    3. 把配置列里冗长的 .note 说明收成两行 + ⓘ 展开（结果列的说明不动，
 *       因为那是"答案的一部分"，折叠它反而有害）
 *    4. 响应式与结果状态由 app.js 同步
 *    5. 使用须知由用户主动打开
 *
 *  在 head 加载以决定首帧；DOMContentLoaded 初始化时 app.js 已渲染 DOM。
 * ==========================================================================*/
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------ 配置 --- */
  var LS_KEY = 'psu-calc-2026-v1-ui';

  // 默认展开用途、CPU 和显卡；其余保留用户的折叠偏好。
  var ALWAYS_OPEN = [1, 2, 3];

  // 折叠态摘要：按卡片序号读对应控件的当前值
  var SUMMARY_RULES = {
    1: function () {
      var on = document.querySelector('.scenario.on b');
      return on ? on.textContent.trim() : '未选择';
    },
    2: function () {
      var head = optionHead($('cpuSelect'));
      if (head) return head;
      // 只选了品牌/世代还没选型号时，把当前筛选条件显示出来，
      // 否则收起状态下用户看不出「我已经筛到 Intel 12 代」了
      var b = $('cpuBrand') ? $('cpuBrand').querySelector('button.on') : null;
      var bTxt = b ? b.textContent.trim() : '';
      var g = $('cpuGen');
      var gTxt = (g && g.value) ? (g.options[g.selectedIndex] || {}).textContent || '' : '';
      gTxt = gTxt.split(' · ')[0].trim();
      var parts = [bTxt, gTxt].filter(Boolean);
      return parts.length ? parts.join(' / ') + ' · 未选型号' : '未选择';
    },
    3: function () {
      var m = $('gpuModel');
      if (!m) return '';
      if (m.value === '__igpu__') return '集成显卡';
      var aib = $('gpuAib');
      if (aib && aib.value) return optionHead(aib) || '未指定板型';
      var head = optionHead(m);
      if (head) return head;
      var b = $('gpuBrand') ? $('gpuBrand').querySelector('button.on') : null;
      return b ? b.textContent.trim() + ' · 未选型号' : '未选择';
    },
    4: function () { return optionHead($('moboSelect')) || '未选择'; },
    5: function () {
      var head = optionHead($('ramSelect'));
      if (!head) return '未选择';
      var kits = $('ramKits') ? (parseInt($('ramKits').value, 10) || 1) : 1;
      return head + ' ×' + kits + ' 套';
    },
    6: function () {
      var rows = document.querySelectorAll('#storageList .storage-row');
      if (!rows.length) return '未添加';
      var n = 0;
      Array.prototype.forEach.call(rows, function (r) {
        var q = r.querySelector('.s-qty');
        n += parseInt(q && q.value, 10) || 1;
      });
      return n + ' 块硬盘 / SSD';
    },
    7: function () {
      var c = optionHead($('coolerSelect'));
      var fans = $('fanQty') ? (parseInt($('fanQty').value, 10) || 0) : 0;
      return (c ? c + ' · ' : '') + fans + ' 只机箱风扇';
    },
    8: function () { return optionHead($('caseSelect')) || '未选择'; },
    9: function () {
      var n = document.querySelectorAll('#extrasGrid input[type="checkbox"]:checked').length;
      var c = document.querySelectorAll('#customItems .storage-row').length;
      var ar = $('argbChannels') ? (parseInt($('argbChannels').value, 10) || 0) : 0;
      var parts = [];
      if (n) parts.push('扩展 ' + n + ' 项');
      if (c) parts.push('自定义 ' + c + ' 项');
      if (ar) parts.push('ARGB ' + ar + ' 路');
      return parts.length ? parts.join(' · ') : '未添加';
    },
    10: function () {
      var v = optionHead($('psuSelect'));
      return v ? v : '暂不校验';
    }
  };

  /* 从 select 的当前选中项取出「·」之前的主名称 */
  function optionHead(sel) {
    if (!sel || !sel.value) return '';
    var op = sel.options[sel.selectedIndex];
    if (!op) return '';
    return (op.textContent || '').split('·')[0].trim();
  }

  /* -------------------------------------------------------- 折叠控制 --- */
  var cards = [];              // { el, no, summaryEl, toggleEl }
  var noteDone = new WeakSet(); // 已处理过的说明块，避免重复扫描

  function readState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeState(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* 每个配置分区的图标（参考 MSI 电源计算器的「图标 + 分组名」左栏）。
     内联 SVG、单色描边，颜色跟随 currentColor —— 与全站图标同一套做法。 */
  var SEC_ICON = {
    1: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    2: '<rect x="7" y="7" width="10" height="10"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
    3: '<rect x="3" y="7" width="18" height="10" rx="1"/><circle cx="9" cy="12" r="2.4"/><path d="M16 10v4"/>',
    4: '<rect x="4" y="4" width="16" height="16" rx="1"/><rect x="8" y="8" width="5" height="5"/><path d="M16 8h.01M16 12h.01M16 16h.01M8 16h5"/>',
    5: '<path d="M3 8h18v8H3z"/><path d="M7 8v8M11 8v8M15 8v8"/>',
    6: '<rect x="3" y="5" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="5" rx="1"/><path d="M7 8.5h.01M7 16.5h.01"/>',
    7: '<circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>',
    8: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h6M9 11h6M12 15v3"/>',
    9: '<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="4"/>',
    10: '<path d="M4 8h16v10H4z"/><path d="M8 8V5h8v3M8 13h8"/>'
  };

  function injectIcons() {
    var col = document.querySelector('.col-config');
    if (!col) return;
    var no = 0;
    Array.prototype.forEach.call(col.querySelectorAll('section.card'), function (sec) {
      if (sec.id === 'guideCard') return;
      no = +(sec.querySelector('.idx') || {}).textContent || no + 1;
      var h2 = sec.querySelector('h2');
      var path = SEC_ICON[no];
      if (!h2 || !path || h2.querySelector('.sec-ico')) return;
      var ico = document.createElement('span');
      ico.className = 'sec-ico';
      ico.setAttribute('aria-hidden', 'true');
      ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
      h2.insertBefore(ico, h2.firstChild);
    });
  }

  function setupCards() {
    var col = document.querySelector('.col-config');
    if (!col) return;

    var sections = col.querySelectorAll('section.card');
    var state = readState();
    var no = 0;   // 显式计数，不依赖 DOM 索引（guideCard 不参与编号）

    Array.prototype.forEach.call(sections, function (sec) {
      if (sec.id === 'guideCard') return;   // 引导卡有自己的关闭按钮
      no = +(sec.querySelector('.idx') || {}).textContent || no + 1;

      var h2 = sec.querySelector('h2');
      if (!h2) return;

      /* 把卡片内容包一层，好让「展开 / 收起」能有平滑的高度过渡。
         display:none 是没法过渡的；用 grid-template-rows 从 0fr 到 1fr
         可以让高度自然动画，且不需要事先知道内容有多高。
         这一层只是包装，不动任何 id —— app.js 全程按 id 取元素，不受影响。 */
      var body = sec.querySelector('.card-body');
      if (body && !body.firstElementChild?.classList?.contains('card-body-in')) {
        var inner = document.createElement('div');
        inner.className = 'card-body-in';
        while (body.firstChild) inner.appendChild(body.firstChild);
        body.appendChild(inner);
      }

      /* 摘要与折叠键挂在**分区**上而不是 h2 上：
         参考 MSI 的布局后，h2 变成左侧窄栏（图标 + 分组名），
         右侧那一大片留给字段。摘要与折叠键属于「右侧那一列」，
         放进窄栏会把分组名挤爆。 */
      var sum = document.createElement('span');
      sum.className = 'card-summary';
      sec.appendChild(sum);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-toggle';
      btn.setAttribute('aria-label', '折叠 / 展开');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCard(sec, btn);
      });
      sec.appendChild(btn);

      // 点标题栏任意位置也能折叠，更符合直觉
      h2.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('a')) return;
        toggleCard(sec, btn);
      });
      // 收起状态下整行都可点，不用非得瞄准标题
      sec.addEventListener('click', function (e) {
        if (!sec.classList.contains('is-collapsed')) return;
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.card-body')) return;
        toggleCard(sec, btn);
      });

      var rec = { el: sec, no: no, summaryEl: sum, toggleEl: btn };
      cards.push(rec);

      // 初始状态：优先用记忆值，否则展开核心填写
      var remembered = state['c' + no];
      var open = (remembered === undefined) ? (ALWAYS_OPEN.indexOf(no) !== -1) : !!remembered;
      setCollapsed(sec, btn, !open);
    });

    refreshSummaries();
  }

  function setCollapsed(sec, btn, collapsed) {
    sec.classList.toggle('is-collapsed', collapsed);
    if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function toggleCard(sec, btn) {
    var collapsed = !sec.classList.contains('is-collapsed');
    setCollapsed(sec, btn, collapsed);

    /* 展开后如果标题已经被顶出视口上方，把它拉回来 ——
       否则用户点了最后一张卡，内容在屏幕外长出来，看起来像「没反应」。 */
    if (!collapsed) {
      var r = sec.getBoundingClientRect();
      if (r.top < 64) {
        try { sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { sec.scrollIntoView(); }
      }
    }

    for (var i = 0; i < cards.length; i++) {
      if (cards[i].el === sec) {
        var s = readState();
        s['c' + cards[i].no] = collapsed ? 0 : 1;
        writeState(s);
        break;
      }
    }
  }

  /* -------------------------------------------------------- 摘要刷新 --- */
  function refreshSummaries() {
    cards.forEach(function (c) {
      var rule = SUMMARY_RULES[c.no];
      if (!rule) return;
      var txt = '';
      try { txt = rule() || ''; } catch (e) { txt = ''; }
      // 只在内容真的变了时才写 DOM，避免触发 MutationObserver 死循环
      if (c.summaryEl.textContent !== txt) c.summaryEl.textContent = txt;
    });
  }

  /* ------------------------------------------------------ 视口高亮 ---- */
  function setupActiveHighlight() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          cards.forEach(function (c) { c.el.classList.remove('is-active'); });
          en.target.classList.add('is-active');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    cards.forEach(function (c) { io.observe(c.el); });
  }

  /* ------------------------------------------------------ 说明收纳 ---- */
  /* 只处理「配置列」里的说明块。
     结果列里的 .note 是结论的一部分（如升级建议、方案说明），折叠它反而有害。 */
  function collapseNotes() {
    var col = document.querySelector('.col-config');
    if (!col) return;
    var notes = col.querySelectorAll('.note');
    Array.prototype.forEach.call(notes, function (n) {
      if (noteDone.has(n)) return;
      if (n.closest('.glossary') || n.closest('.banner')) { noteDone.add(n); return; }
      // 只有真正长的纯文字说明才收纳；含表格/列表的保持完整
      var len = (n.textContent || '').trim().length;
      if (len < 90 || n.querySelector('dl, table, ul, ol')) { noteDone.add(n); return; }
      noteDone.add(n);
      n.classList.add('note-collapsible');
      n.addEventListener('click', function () { n.classList.toggle('open'); });
    });
  }

  /* -------------------------------------------------- 移动端结果条 ---- */
  /* 数值统一取自顶栏答案筹码（app.js 维护）。
     两者同源，避免各自解析导致不一致；筹码隐藏即空态，底栏也不显示。 */
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* -------------------------------------------------------- 数据声明 ----
     打开页面时自动出现的声明弹窗。原来的「数据来源」卡片与显卡卡里的两段
     声明都搬进了这里，所以 id="sources" / id="aibCatalogNote" 都还在原位
     （只是换了父节点），app.js 一行都不用改。

     启动结束后展示；支持不再提示和主动打开。 */

  function setupDisclaimer() {
    var m = $('disclaimerModal');
    var openBtn = $('btnDisclaimer');
    if (!m || !openBtn) return;

    var body = $('dmBody');
    var okBtn = $('dmOk');
    var xBtn = $('dmClose');
    var lastFocus = null;
    var closeTimer = null;
    function isOpen() { return !m.hidden; }
    function announce(type) { document.dispatchEvent(new Event(type)); }

    /* 弹窗打开时把背景整片标 inert。
       已有的手写 Tab 陷阱只拦得住 Tab 键，拦不住读屏的虚拟光标 ——
       它照样能读到底层那二十几个控件和整张配置表单，对屏幕阅读器用户来说
       弹窗等于没生效。inert 才是真正的隔离。
       只记录并解除自己动过的节点，免得和启动序列那套 inert 互相解除。 */
    var inertNodes = [];
    function holdBackground() {
      Array.prototype.forEach.call(document.body.children, function (el) {
        if (el === m || el.matches('script, noscript, style') || el.inert) return;
        el.inert = true;
        inertNodes.push(el);
      });
    }
    function releaseBackground() {
      inertNodes.forEach(function (el) { el.inert = false; });
      inertNodes = [];
    }

    function open() {
      if (closeTimer) {
        clearTimeout(closeTimer); closeTimer = null; m.classList.remove('is-closing');
        if (window.__PSU_MOTION__) window.__PSU_MOTION__.surface(m.querySelector('.modal-card'), true);
        return;
      }
      if (isOpen()) return;
      lastFocus = document.activeElement;
      m.hidden = false;
      document.body.classList.add('modal-open');
      holdBackground();
      if (window.__PSU_MOTION__) window.__PSU_MOTION__.surface(m.querySelector('.modal-card'), true);
      if (body) body.scrollTop = 0;
      if (okBtn) { try { okBtn.focus({ preventScroll: true }); } catch (e) { okBtn.focus(); } }
      announce('psu:disclaimer-open');
    }

    function close() {
      if (!isOpen() || closeTimer) return;
      function finishClose() {
        if (m.hidden) return;
        clearTimeout(closeTimer);
        closeTimer = null;
        m.hidden = true;
        if (window.__PSU_MOTION__) window.__PSU_MOTION__.stop(m.querySelector('.modal-card'));
        m.classList.remove('is-closing');
        document.body.classList.remove('modal-open');
        /* 必须在恢复焦点之前解除：lastFocus 多半在背景里，
           还带着 inert 的话 focus() 会被拒绝，焦点就丢了。 */
        releaseBackground();
        if (lastFocus && lastFocus.focus) {
          try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
        }
        lastFocus = null;
        announce('psu:disclaimer-closed');
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) finishClose();
      else {
        m.classList.add('is-closing');
        if (window.__PSU_MOTION__) window.__PSU_MOTION__.surface(m.querySelector('.modal-card'), false);
        closeTimer = setTimeout(finishClose, 180);
      }
    }

    openBtn.addEventListener('click', open);
    document.querySelectorAll('.usage-open').forEach(function (button) { button.addEventListener('click', open); });
    if (okBtn) okBtn.addEventListener('click', close);
    if (xBtn) xBtn.addEventListener('click', close);

    // 点遮罩（卡片之外）关闭
    m.addEventListener('mousedown', function (e) {
      if (e.target === m) close();
    });

    // Esc 关闭 + 焦点锁在弹窗内（Tab 不跑到背后的配置表单上）
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = m.querySelectorAll('button, input, summary, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
      var list = Array.prototype.filter.call(f, function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // 使用须知由页内入口主动打开，首次填写不再被弹窗阻塞。

    // 供自动化测试 / 其他脚本调用
    window.__PSU_DISCLAIMER__ = { open: open, close: close, isOpen: isOpen };
  }

  /* ------------------------------------------------------------ 启动 --- */
  function boot() {
    try {
      injectIcons();
      setupCards();
      setupActiveHighlight();
      collapseNotes();
        setupDisclaimer();

      // 控件值变化 → 刷新摘要
      // 用捕获阶段监听，不影响 app.js 自己的监听器
      ['change', 'input'].forEach(function (ev) {
        document.addEventListener(ev, refreshSummaries, true);
      });

      // 动态增删的存储行 / 自定义设备行不会触发 change，需要观察 DOM。
      // refreshSummaries 内部有"内容没变就不写"的判断，不会自激。
      var col = document.querySelector('.col-config');
      if (col && 'MutationObserver' in window) {
        new MutationObserver(function () {
          refreshSummaries();
          collapseNotes();
        }).observe(col, { childList: true, subtree: true });
      }
    } catch (e) {
      // ui.js 是增强层，任何异常都不能影响主计算功能
      console.error('[ui.js]', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* 首访开场可随时跳过，结束后立即恢复表单；须知由用户主动打开。 */
(function () {
  'use strict';
  var root = document.documentElement;
  // 首次设置折叠态也不应在 noanim 路径上闪出一次收起过渡。
  root.classList.add('psu-ui-initializing');
  function settleInitialLayout() {
    void document.body.offsetHeight;
    root.classList.remove('psu-ui-initializing');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', settleInitialLayout, { once: true });
  else settleInitialLayout();
  // 首次访问播放一次，后续可从顶栏重播。
  var key = 'psu-boot-seen-lightning-video-v7';
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var seen = false;
  try {
    seen = localStorage.getItem(key) === '1';
    localStorage.removeItem('psu-boot-seen-native-v4');
  } catch (e) {}

  // 硬跳过：这些入口下连「就位隐藏」都不做，页面必须原样可用。
  if (window.__PSU_NOANIM || new URLSearchParams(location.search).get('noanim') === '1' ||
      motion.matches || window.matchMedia('print').matches) return;

  // 暴露页面区域供浏览器检查验证可见性。
  var ITEM_SELECTOR = [
    'header.top',
    '.page-intro',
    '.decision-toolbar',
    '.col-config > .card',
    '.col-result .sticky-col > *:not(.print-only)',
    'details.section-collapse'
  ].join(', ');

  /* 测试侧从这里读选择器，省得两边各抄一份然后慢慢走散。 */
  window.__PSU_BOOT__ = {
    itemSelector: ITEM_SELECTOR,
    items: function () { return Array.prototype.slice.call(document.querySelectorAll(ITEM_SELECTOR)); },
    replay: replayIntro
  };
  var introRan = !seen;
  if (introRan) root.classList.add('psu-boot-active', 'psu-boot-pending');
  var done = false, staged = false, timers = [], inertNodes = [], stopAnimation = null;
  var inputEvents = ['pointerdown', 'click', 'keydown', 'touchstart'];

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* 启动期间整页 inert：动画之外的控件既点不到也 Tab 不到。 */
  function holdInput() {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (!el.matches('.psu-boot, script, noscript, style') && !el.inert) {
        el.inert = true;
        inertNodes.push(el);
      }
    });
  }
  function releaseInput() {
    inertNodes.forEach(function (el) { el.inert = false; });
    inertNodes = [];
  }
  function detachInput() {
    inputEvents.forEach(function (type) { document.removeEventListener(type, onSkip, true); });
  }
  // 结束或跳过开场时恢复页面与输入。
  function release(dispatchEnd) {
    if (done) return;
    done = true;
    if (stopAnimation) { stopAnimation(); stopAnimation = null; }
    clearTimers();
    root.classList.remove('psu-boot-active', 'psu-boot-pending', 'psu-boot-running',
      'psu-boot-hold', 'psu-boot-fill');
    releaseInput();
    detachInput();
    motion.removeEventListener('change', onMotion);
    window.removeEventListener('beforeprint', onAbort);
    window.removeEventListener('pagehide', onAbort);
    document.removeEventListener('visibilitychange', onVisibility);
    try { localStorage.setItem(key, '1'); } catch (e) {}
    if (dispatchEnd) document.dispatchEvent(new Event('psu:boot-end'));
  }

  function finishIntro(event) {
    if (done || staged) return;
    staged = true;
    // 跳过手势不穿透到页面按钮。
    if (event && inputEvents.indexOf(event.type) !== -1) {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (stopAnimation) { stopAnimation(); stopAnimation = null; }
    // 正常结束后取消加载超时兜底。
    clearTimers();
    detachInput();
    root.classList.remove('psu-boot-active', 'psu-boot-pending', 'psu-boot-running');
    release(true);
  }

  function onSkip(event) { finishIntro(event); }
  function onMotion(event) { if (event.matches) release(true); }
  function onAbort() { release(true); }
  function onVisibility() { if (document.hidden) release(true); }

  inputEvents.forEach(function (type) {
    document.addEventListener(type, onSkip, { capture: true, passive: false });
  });
  motion.addEventListener('change', onMotion);
  window.addEventListener('beforeprint', onAbort);
  window.addEventListener('pagehide', onAbort);
  document.addEventListener('visibilitychange', onVisibility);
  // 数据脚本下载异常时也不留下永久黑幕。
  later(function () { release(true); }, 10000);

  function start() {
    if (done) return;
    if (window.__PSU_NOANIM || motion.matches) { release(true); return; }
    var canvas = document.querySelector('.psu-boot-canvas');
    // 回访或缺少动画脚本时直接显示页面。
    if (!introRan || !canvas || !window.startLightningBoot) { finishIntro(null); return; }
    holdInput();
    root.classList.add('psu-boot-running');
    stopAnimation = window.startLightningBoot(canvas, function () { finishIntro(null); });
  }

  // 顶栏 logo 与菜单中的重播入口共用相同的播放和清理流程。
  function replayIntro() {
    if (window.__PSU_NOANIM || motion.matches) return;
    if (root.classList.contains('psu-boot-active') || root.classList.contains('psu-boot-hold')) return;
    done = false;
    staged = false;
    root.classList.add('psu-boot-active', 'psu-boot-pending');
    inputEvents.forEach(function (type) {
      document.addEventListener(type, onSkip, { capture: true, passive: false });
    });
    motion.addEventListener('change', onMotion);
    window.addEventListener('beforeprint', onAbort);
    window.addEventListener('pagehide', onAbort);
    document.addEventListener('visibilitychange', onVisibility);
    later(function () { release(true); }, 10000);
    var canvas = document.querySelector('.psu-boot-canvas');
    if (canvas && window.startLightningBoot) {
      holdInput();
      root.classList.add('psu-boot-running');
      stopAnimation = window.startLightningBoot(canvas, function () { finishIntro(null); });
    } else {
      finishIntro(null);
    }
  }

  /* 事件委托。启动/重播期间 logo 的点击会被 onSkip 的捕获阶段先拦下
     （stopImmediatePropagation 挡住后续冒泡），不会递归触发重播；
     收尾后 onSkip 已摘除，这里才接管。 */
  document.addEventListener('click', function (event) {
    var t = event.target;
    if (!t || !t.closest) return;
    if (t.closest('.logo') || t.closest('#btnReplayIntro')) replayIntro();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* 参考澎湃 OS 的连续响应。独立呈现层：从当前帧接续，不改文本或计算结果。 */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var printing = false;
  var active = new Map(), pressed = new Set(), folds = new Map();
  var ENTER = 'cubic-bezier(.16, 1, .3, 1)', FAST = 'cubic-bezier(.2, 0, .2, 1)';
  var EXIT = 'cubic-bezier(.4, 0, 1, 1)';
  function enabled(surface) {
    return !reduced.matches && !printing && !document.hidden && !matchMedia('print').matches &&
      (surface || !document.documentElement.classList.contains('psu-boot-active'));
  }
  function stop(el) {
    var old = active.get(el);
    if (old) { active.delete(el); old.cancel(); }
  }
  function play(el, frames, duration, easing, done, hold) {
    if (!el || typeof el.animate !== 'function') return;
    stop(el);
    var animation = el.animate(frames, { duration: duration, easing: easing, fill: 'forwards' });
    active.set(el, animation);
    animation.finished.then(function () {
      if (active.get(el) !== animation) return;
      if (hold) return;
      active.delete(el); animation.cancel();
      if (done) done();
    }, function () { if (active.get(el) === animation) active.delete(el); });
  }
  function pulse(el) {
    if (!enabled() || !el || !el.isConnected || !el.getClientRects().length) return;
    var style = getComputedStyle(el), running = active.has(el);
    play(el, [
      { opacity: running ? style.opacity : .82, transform: running ? style.transform : 'translateY(3px)' },
      { opacity: 1, transform: 'none' }
    ], 280, ENTER);
  }
  function press(el) {
    if (!enabled() || !el || el.disabled || el.getAttribute('aria-disabled') === 'true' || pressed.has(el)) return;
    pressed.add(el);
    play(el, [{ transform: getComputedStyle(el).transform }, { transform: 'scale(.975)' }], 80, FAST, null, true);
  }
  function release(el) {
    if (!pressed.delete(el)) return;
    if (!el.isConnected) { stop(el); return; }
    if (!enabled()) { stop(el); return; }
    // 小幅回弹采用有限关键帧；重入时采样当前 transform，避免跳回第一帧。
    play(el, [
      { transform: getComputedStyle(el).transform, offset: 0 },
      { transform: 'scale(1.006)', offset: .58 },
      { transform: 'scale(1)', offset: 1 }
    ], 360, ENTER);
  }
  function releaseAll() { Array.from(pressed).forEach(release); }
  function buttonFrom(event) { return event.target.closest && event.target.closest('button, .btn'); }
  document.addEventListener('pointerdown', function (event) {
    if (event.isPrimary && event.button === 0) press(buttonFrom(event));
  });
  document.addEventListener('pointerup', releaseAll);
  document.addEventListener('pointercancel', releaseAll);
  document.addEventListener('pointerout', function (event) {
    var button = buttonFrom(event);
    if (button && (!event.relatedTarget || !button.contains(event.relatedTarget))) release(button);
  });
  document.addEventListener('keydown', function (event) {
    if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) press(buttonFrom(event));
  });
  document.addEventListener('keyup', function (event) { if (event.key === ' ' || event.key === 'Enter') releaseAll(); });
  window.addEventListener('blur', releaseAll);

  function surface(el, opening) {
    if (!el || !enabled(true)) return;
    var current = getComputedStyle(el), running = active.has(el);
    play(el, [
      { opacity: running ? current.opacity : (opening ? 0 : 1),
        transform: running ? current.transform : (opening ? 'translateY(12px) scale(.96)' : 'none') },
      { opacity: opening ? 1 : 0, transform: opening ? 'none' : 'translateY(8px) scale(.98)' }
    ], opening ? 340 : 180, opening ? ENTER : EXIT, null, !opening);
  }
  window.__PSU_MOTION__ = { surface: surface, stop: stop };

  document.addEventListener('change', function (event) {
    var input = event.target;
    if (!input.matches || !input.matches('select, input[type="checkbox"], input[type="radio"], input[type="number"]')) return;
    pulse(input.closest('.switch')?.querySelector('.track') || input);
  });

  // 原生 details 的最终结构不变；仅在过渡期间固定高度，快速反向从当前高度接续。
  document.addEventListener('click', function (event) {
    var summary = event.target.closest && event.target.closest('summary');
    var el = summary && summary.parentElement;
    if (!el || el.tagName !== 'DETAILS' || event.defaultPrevented ||
        event.target.closest('button, a, input, select, textarea') || !enabled() || typeof el.animate !== 'function') return;
    event.preventDefault();
    var old = folds.get(el), opening = old ? !old.opening : !el.open;
    var start = el.getBoundingClientRect().height;
    var contentFrames = new Map();
    if (old) Array.from(el.children).forEach(function (child) {
      var style = getComputedStyle(child); contentFrames.set(child, { opacity: style.opacity, transform: style.transform });
    });
    if (old) old.restore();
    stop(el);
    var height = el.style.height, overflow = el.style.overflow, expanded = summary.getAttribute('aria-expanded');
    var contents = Array.from(el.children).filter(function (child) { return child !== summary; });
    var record = { opening: opening, restore: function () {
      stop(el); contents.forEach(stop); el.style.height = height; el.style.overflow = overflow;
      if (expanded === null) summary.removeAttribute('aria-expanded'); else summary.setAttribute('aria-expanded', expanded);
      folds.delete(el);
    }, finish: function () { record.restore(); el.open = opening; } };
    if (!opening && el.contains(document.activeElement)) summary.focus({ preventScroll: true });
    el.open = opening;
    var end = el.getBoundingClientRect().height;
    if (!opening) el.open = true;
    summary.setAttribute('aria-expanded', String(opening));
    el.style.overflow = 'hidden';
    folds.set(el, record);
    if (Math.abs(end - start) > 1000) { record.finish(); return; }
    contents.forEach(function (child) {
      play(child, [contentFrames.get(child) || { opacity: opening ? 0 : 1, transform: 'none' },
        { opacity: opening ? 1 : 0, transform: opening ? 'none' : 'translateY(-4px)' }], opening ? 300 : 180, ENTER, null, !opening);
    });
    play(el, [{ height: start + 'px' }, { height: end + 'px' }], opening ? 340 : 220, opening ? ENTER : FAST, record.finish);
  });

  function clear() {
    Array.from(folds.values()).forEach(function (record) { record.finish(); });
    active.forEach(function (animation) { animation.cancel(); }); active.clear(); pressed.clear();
    document.querySelectorAll('.psu-ui-feedback').forEach(function (el) { el.classList.remove('psu-ui-feedback'); });
  }
  reduced.addEventListener('change', clear);
  document.addEventListener('visibilitychange', function () { if (document.hidden) clear(); });
  window.addEventListener('beforeprint', function () { printing = true; clear(); });
  window.addEventListener('afterprint', function () { printing = false; });

  function setup() {
    if (typeof document.documentElement.animate === 'function') document.documentElement.classList.add('psu-motion-ready');
    ['recoBig', 'heroPower', 'heroExpected', 'heroTransient', 'answerChipValue'].forEach(function (id) {
      var target = document.getElementById(id);
      if (!target) return;
      var last = target.textContent;
      new MutationObserver(function () {
        var value = target.textContent;
        if (value === last) return;
        last = value; pulse(target);
      }).observe(target, { childList: true, subtree: true, characterData: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();

/* 结果分层只整理呈现，不改计算；保留用户主动展开的风险详情。 */
(function () {
  function setup() {
    var root = document.querySelector('.col-result');
    if (!root) return;
    var states = new Map();
    var observer = new MutationObserver(refresh);
    function refresh() {
      observer.disconnect();
      root.querySelectorAll('.psu-pick').forEach(function (pick) {
        if (pick.querySelector('details')) return;
        var specs = pick.querySelectorAll('.sp, .pr');
        if (!pick.querySelector('.w') || !specs.length) return;
        var detail = document.createElement('details'); detail.className = 'pick-specs';
        var summary = document.createElement('summary'); summary.textContent = '规格与参考价';
        detail.appendChild(summary);
        specs.forEach(function (el) { detail.appendChild(el); });
        pick.appendChild(detail);
      });
      var explanation = root.querySelector('.explain-content');
      var previous = explanation.querySelector('.recommendation-math');
      var formula = root.querySelector('#recoSub > span');
      if (formula) {
        if (previous) previous.remove();
        formula.classList.add('recommendation-math'); explanation.appendChild(formula);
      } else if (!root.querySelector('#recoSub b') && previous) previous.remove();
      root.querySelectorAll('.result-fold').forEach(function (fold) {
        var summary = fold.querySelector('summary'), status = summary.querySelector('.fold-status');
        if (!status) { status = document.createElement('span'); status.className = 'fold-status'; summary.appendChild(status); }
        var upgrade = fold.querySelector('#upgradeBox');
        var advice = fold.querySelector('#adviceBox');
        if (upgrade) {
          var values = upgrade.querySelectorAll('dd');
          status.textContent = values.length ? '余量 ' + values[0].textContent : '待选配置';
        } else if (advice) {
          var count = advice.querySelectorAll('.issue').length;
          status.textContent = count ? count + ' 条建议' : '待选配置';
        }
      });
      root.querySelectorAll('#issues .issue:not(.error):not(.ok)').forEach(function (issue) {
        if (issue.querySelector('details')) return;
        var content = issue.querySelector(':scope > div'), title = content && content.querySelector('b');
        if (!title || title.textContent === '尚未选择硬件') return;
        var key = issue.className + ':' + title.textContent;
        var details = document.createElement('details'), summary = document.createElement('summary');
        summary.appendChild(title); details.appendChild(summary);
        while (content.firstChild) details.appendChild(content.firstChild);
        details.open = states.get(key) === true;
        details.addEventListener('toggle', function () { states.set(key, details.open); });
        content.appendChild(details);
      });
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
