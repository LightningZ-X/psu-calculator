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
 *    1. 给左列 10 张卡注入折叠开关 + 已选摘要；默认全部收起，由用户自己展开
 *    2. 用 IntersectionObserver 高亮当前正在看的卡片
 *    3. 把配置列里冗长的 .note 说明收成两行 + ⓘ 展开（结果列的说明不动，
 *       因为那是"答案的一部分"，折叠它反而有害）
 *    4. 移动端底部常驻条，同步显示推荐瓦数
 *    5. 精简使用须知弹窗（启动后展示，也可主动打开）
 *
 *  在 head 加载以决定首帧；DOMContentLoaded 初始化时 app.js 已渲染 DOM。
 * ==========================================================================*/
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------ 配置 --- */
  var LS_KEY = 'psu-calc-2026-v1-ui';

  /* 默认展开的卡片序号。空数组 = 打开页面时所有选项都收起来，
     由用户自己点开需要填的那几步。
     注意这里给的是「默认值」：用户手动展开过的那张卡会记在 localStorage 里，
     下次打开保持用户自己的状态，不会又被强行收起。 */
  var ALWAYS_OPEN = [];

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
      no++;
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
      no++;

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

      // 初始状态：优先用记忆值，否则按 ALWAYS_OPEN 决定（现在是全部收起）
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

  function setupMobileBar() {
    var bar = $('mobileBar');
    var out = $('mobileBarValue');
    var chip = $('answerChip');
    var src = $('answerChipValue') || $('recoBig');
    if (!bar || !out || !src) return;

    function sync() {
      if (chip && chip.hidden) { bar.hidden = true; return; }
      var t = (src.textContent || '').replace(/\s+/g, ' ').trim();
      // 保留数字、区间连接符（- – ~ ～）、小数点与 W
      var clean = t.replace(/[^\d\-–~～.W\s]/g, '').trim();
      if (!/\d/.test(clean)) { bar.hidden = true; return; }
      var html = escHtml(clean) + (/W/.test(clean) ? '' : '<span> W</span>');
      if (out.innerHTML !== html) out.innerHTML = html;
      if (bar.hidden) bar.hidden = false;
    }

    if ('MutationObserver' in window) {
      new MutationObserver(sync).observe(src, {
        childList: true, characterData: true, subtree: true
      });
      if (chip) {
        new MutationObserver(sync).observe(chip, {
          attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true
        });
      }
    }
    sync();
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
    /* 是不是「启动结束后自动弹出」的那一次。
       只有这一次的关闭才需要在背后把卡片逐个放出来；用户从顶栏重开再关不该重播。 */
    var openedAuto = false;
    var never = $('dmNever');
    var preferenceKey = 'psu-calc-2026-v1-disclaimer';
    /* 「不再提示」只在本次会话（这一个标签页）内有效。
       原来存 localStorage：一次误勾就永久生效，而启动动画是每个标签页只播一次 ——
       两者对不上，结果是动画照旧在播、说明却再也不出现，用户看到的就是
       「启动完直接进界面」。存 sessionStorage 后，每个标签页至少完整走一遍
       「动画 → 说明 → 关掉 → 依次显现」。 */
    try { if (localStorage.getItem(preferenceKey) !== null) localStorage.removeItem(preferenceKey); } catch (e) {}
    function version() { return window.HWDB && window.HWDB.meta.version || '1'; }
    /* hash 里现在还会放配置短码（#c=…），所以按 token 判断，
       不能再拿 location.hash 跟 '#nodisclaimer' 整体比较。 */
    function hashHas(token) {
      return (location.hash || '').replace(/^#/, '').split('&').indexOf(token) !== -1;
    }
    function suppressed() {
      if (new URLSearchParams(location.search).get('nodisclaimer') === '1' || hashHas('nodisclaimer')) return true;
      try { return sessionStorage.getItem(preferenceKey) === version(); } catch (e) { return false; }
    }

    function isOpen() { return !m.hidden; }

    /* 两个事件把「弹窗开合」广播给启动流程（ui.js 第二个 IIFE）：
       psu:disclaimer-open / psu:disclaimer-closed，detail.auto 标明是不是自动弹出的那次。 */
    function announce(type) {
      document.dispatchEvent(new CustomEvent(type, { detail: { auto: openedAuto } }));
    }

    /* 「不再提示」是会话内的偏好，勾选框必须反映它的真实状态。
       不回填的话这个开关就是单向的：一旦记住，用户再打开弹窗看到的仍是
       「不勾选」的样子，点确定也只会……什么都不会发生，于是再也关不掉。 */
    function syncNever() {
      if (!never) return;
      try { never.checked = sessionStorage.getItem(preferenceKey) === version(); } catch (e) {}
    }

    function open(fromAuto) {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; m.classList.remove('is-closing'); return; }
      if (isOpen()) return;
      openedAuto = !!fromAuto;
      syncNever();
      lastFocus = document.activeElement;
      m.hidden = false;
      document.body.classList.add('modal-open');
      if (body) body.scrollTop = 0;
      if (okBtn) { try { okBtn.focus({ preventScroll: true }); } catch (e) { okBtn.focus(); } }
      announce('psu:disclaimer-open');
    }

    function close() {
      if (!isOpen() || closeTimer) return;
      if (never) {
        try {
          if (never.checked) sessionStorage.setItem(preferenceKey, version());
          else sessionStorage.removeItem(preferenceKey);   // 取消勾选要能真的取消
        } catch (e) {}
      }
      function finishClose() {
        closeTimer = null;
        m.hidden = true;
        m.classList.remove('is-closing');
        document.body.classList.remove('modal-open');
        if (lastFocus && lastFocus.focus) {
          try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
        }
        lastFocus = null;
        announce('psu:disclaimer-closed');
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) finishClose();
      else {
        m.classList.add('is-closing');
        closeTimer = setTimeout(finishClose, 160);
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

    function autoOpen() { if (!suppressed()) open(true); }
    if (document.documentElement.classList.contains('psu-boot-active')) {
      document.addEventListener('psu:boot-end', autoOpen, { once: true });
    } else autoOpen();

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
      setupMobileBar();
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

/* 一次性启动，分两段：
   ① 原生 Canvas V2 动画 → 遮罩退场、框架淡入 → 声明弹窗接管；
   ② 用户关掉声明之后，左右两栏的卡片按 DOM 顺序依次弹出。
   跳过、失败、打印与减少动态效果都必须能立刻恢复到常态页面。 */
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
  /* 启动动画按「标签页」记一次：新开标签页会完整播一遍，同一标签页里
     刷新（F5）不重播。
     中途曾改成 localStorage + 24 小时「同一台机器只放一次」，结果是用户
     打开网页看不到启动动画了 —— 对一个靠开场动画立住调性的站点来说，
     「打开就有」比「少看几遍」重要得多，所以退回按标签页。
     同时清掉那个 24 小时的旧标记，免得它继续压着动画不放。 */
  var key = 'psu-boot-seen-native-v5';
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var seen = false;
  try {
    seen = sessionStorage.getItem(key) === '1';
    localStorage.removeItem('psu-boot-seen-native-v4');
  } catch (e) {}

  // 硬跳过：这些入口下连「就位隐藏」都不做，页面必须原样可用。
  if (window.__PSU_NOANIM || new URLSearchParams(location.search).get('noanim') === '1' ||
      motion.matches || window.matchMedia('print').matches) return;

  /* 声明关掉之后才依次出现的整页块：顶栏 → 页首引导语 → 左栏配置卡 →
     右栏结果块（推荐电源、三个数字、各卡）→ 反馈入口。
     取的是 DOM 顺序，也就是从上到下、先左后右。
     间隔与 @keyframes psu-content-in 的 .36s 对齐，改一处要改两处。 */
  var ITEM_SELECTOR = [
    'header.top',
    '.page-intro',
    '.col-config > .card',
    '.col-result .sticky-col > *:not(.print-only)',
    'details.section-collapse'
  ].join(', ');
  var STAGGER_MS = 45;
  var ITEM_MS = 360;

  /* 测试侧从这里读选择器，省得两边各抄一份然后慢慢走散。 */
  window.__PSU_BOOT__ = {
    itemSelector: ITEM_SELECTOR,
    items: function () { return Array.prototype.slice.call(document.querySelectorAll(ITEM_SELECTOR)); },
    replay: replayIntro
  };
  /* 同一会话里已经看过动画：这次不放黑幕，「关掉声明再逐个弹出」照常。
     刷新一下就整段失效，是这套东西最容易踩空的地方。 */
  var introRan = !seen;
  if (introRan) root.classList.add('psu-boot-active', 'psu-boot-pending');
  var done = false, staged = false, timers = [], inertNodes = [], items = [], stopAnimation = null;
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
  function clearItems() {
    items.forEach(function (el) {
      el.classList.remove('psu-boot-item');
      el.style.removeProperty('--psu-boot-delay');
    });
    items = [];
  }

  /* 收尾：清掉全部启动期类名，页面回到常态。
     只有延迟交给声明弹窗的那条路径需要额外派发 psu:boot-end 把弹窗叫起来。 */
  function release(dispatchEnd) {
    if (done) return;
    done = true;
    if (stopAnimation) { stopAnimation(); stopAnimation = null; }
    clearTimers();
    clearItems();
    root.classList.remove('psu-boot-active', 'psu-boot-pending', 'psu-boot-running',
      'psu-boot-hold', 'psu-boot-fill');
    releaseInput();
    detachInput();
    document.removeEventListener('psu:disclaimer-closed', onDisclaimerClosed);
    motion.removeEventListener('change', onMotion);
    window.removeEventListener('beforeprint', onAbort);
    window.removeEventListener('pagehide', onAbort);
    document.removeEventListener('visibilitychange', onVisibility);
    try { sessionStorage.setItem(key, '1'); } catch (e) {}
    if (dispatchEnd) document.dispatchEvent(new Event('psu:boot-end'));
  }

  /* 第一段收束：遮罩退场、框架淡入，把页面交给声明弹窗。
     卡片在这里就位（先压成不可见 + 排好各自的延时），但先不播放。 */
  function enterDialogStage(event, replayMode) {
    if (done || staged) return;
    staged = true;
    // 跳过手势不穿透到页面按钮或随后出现的声明弹窗。
    if (event && inputEvents.indexOf(event.type) !== -1) {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (stopAnimation) { stopAnimation(); stopAnimation = null; }
    // 10 秒兜底就此作废：声明看多久由用户决定，不能把动画一并收走。
    clearTimers();
    detachInput();
    root.classList.remove('psu-boot-active', 'psu-boot-pending', 'psu-boot-running');
    // 这里不再单独放「框架淡入」：顶栏与两栏的每一块都进了就位名单，
    // 关掉声明后由 psu-content-in 逐块带出来，再加一层淡入只会互相打架。
    releaseInput();
    root.classList.add('psu-boot-hold');
    items = Array.prototype.slice.call(document.querySelectorAll(ITEM_SELECTOR));
    items.forEach(function (el, i) {
      el.classList.add('psu-boot-item');
      el.style.setProperty('--psu-boot-delay', (i * STAGGER_MS) + 'ms');
    });
    /* 手动重播不派发 psu:boot-end：那是「把声明弹窗叫起来」的信号，
       重播只要视觉上的两段，别再把声明吵出来。 */
    if (replayMode) { playFill(); return; }
    document.dispatchEvent(new Event('psu:boot-end'));
    var d = window.__PSU_DISCLAIMER__;
    if (d && d.isOpen()) document.addEventListener('psu:disclaimer-closed', onDisclaimerClosed);
    else playFill();  // 声明被抑制（?nodisclaimer=1 / 不再提示）时不留白，直接逐个弹出
  }

  /* 第二段：卡片依次弹出，最后一张落位后收尾。 */
  function playFill() {
    if (done) return;
    document.removeEventListener('psu:disclaimer-closed', onDisclaimerClosed);
    if (!items.length || motion.matches) { release(false); return; }
    root.classList.add('psu-boot-fill');
    later(function () { release(false); }, (items.length - 1) * STAGGER_MS + ITEM_MS + 80);
  }

  function onDisclaimerClosed(event) {
    if (!event.detail || !event.detail.auto) return;
    playFill();
  }
  function onSkip(event) { enterDialogStage(event); }
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
    // 没有动画可放（本会话已看过 / 取不到 canvas / 脚本缺失）也照样走第二段：
    // 声明弹窗一出就把卡片就位，用户关掉它时依然逐个弹出。
    if (!introRan || !canvas || !window.startLightningBoot) { enterDialogStage(null); return; }
    holdInput();
    root.classList.add('psu-boot-running');
    stopAnimation = window.startLightningBoot(canvas, function () { enterDialogStage(null); });
  }

  /* ---- 手动重播：点顶栏 logo。
     只重放视觉上的两段（Canvas 开场 + 逐块显现），不重开声明弹窗，
     也不动本会话的「已看过」标记 —— 那是按标签页的自然计次，和本功能无关。 */
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
      stopAnimation = window.startLightningBoot(canvas, function () { enterDialogStage(null, true); });
    } else {
      enterDialogStage(null, true);
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

/* 用户改变选项后提供局部确认；不订阅结果重算，避免批量渲染闪烁。 */
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  function clear() {
    document.querySelectorAll('.psu-ui-feedback').forEach(function (el) { el.classList.remove('psu-ui-feedback'); });
  }
  document.addEventListener('change', function (event) {
    if (reduced.matches || document.documentElement.classList.contains('psu-boot-active')) return;
    var input = event.target;
    if (!input.matches('select, input[type="checkbox"], input[type="radio"], input[type="number"]')) return;
    var target = input.closest('.switch') || input;
    target.classList.remove('psu-ui-feedback');
    void target.offsetWidth; // 重新触发有限动画；快速连续切换也只保留当前反馈。
    target.classList.add('psu-ui-feedback');
  });
  document.addEventListener('animationend', function (event) {
    if (event.animationName === 'psu-ui-feedback') event.target.classList.remove('psu-ui-feedback');
  });
  reduced.addEventListener('change', clear);
  window.addEventListener('beforeprint', clear);
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

/* 推荐数值真实变化时做一次局部反馈；不滚动数字，不修改结果。 */
(function () {
  function setup() {
    var target = document.getElementById('recoBig');
    if (!target) return;
    var last = target.textContent;
    new MutationObserver(function () {
      var value = target.textContent;
      if (value === last) return;
      last = value;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('psu-boot-active')) return;
      target.classList.remove('psu-ui-feedback');
      void target.offsetWidth;
      target.classList.add('psu-ui-feedback');
    }).observe(target, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
