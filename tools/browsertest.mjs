/* ============================================================================
 *  浏览器端交互自测
 *  做法：把 index.html 复制一份，在 </body> 前注入测试脚本，用无头 Edge 渲染，
 *        再把结果页里的 <pre id="RESULT"> 抓出来。
 *  运行:  node tools/browsertest.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const SRC = path.join(root, 'index.html');
const TMP = path.join(root, '_browsertest.html');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.CHROME_PATH || ''
];
const edge = EDGE_CANDIDATES.find(p => p && fs.existsSync(p));
if (!edge) { console.error('未找到 Edge / Chrome，跳过浏览器测试'); process.exit(0); }

/* ------------------------------------------------------------ 测试脚本 -- */
const TEST = `
<script>
window.__T = [];
function t(name, cond, extra) {
  window.__T.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}
function $(id) { return document.getElementById(id); }
window.addEventListener('error', function (e) {
  window.__T.push('FAIL | 未捕获的 JS 错误 | ' + e.message);
});

setTimeout(function () {
  try {
    /* --- 0. 页面初始化期间不得有任何被捕获的异常 --- */
    var errs = window.__PSU_ERRORS || [];
    t('初始化无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' ; '));

    /* --- 0b. 空态语义（本轮最重要的修复，必须在载入示例之前验证） ---
       首访必须是干净的空配置：
         · 不得静默灌入旗舰预设
         · 不得打绿勾说「未检测到兼容性问题 · 均匹配」
         · 不得推荐任何电源
         · 数字显示 "—" 而不是 "0 W"                              */
    t('首访未静默载入预设（storage 为空）',
      $('storageList').querySelectorAll('.storage-row').length === 0,
      $('storageList').querySelectorAll('.storage-row').length + ' 行');
    t('首访 CPU 未被预选', !$('cpuSelect').value, $('cpuSelect').value || '(空)');
    t('空态规划功耗显示 — 而非 0 W',
      $('heroPower').textContent.indexOf('0') === -1 &&
      $('heroPower').textContent.indexOf('—') >= 0,
      $('heroPower').textContent.trim());
    t('空态推荐瓦数显示 —',
      $('recoBig').textContent.indexOf('—') >= 0, $('recoBig').textContent.trim());
    t('空态明确写出「尚未选择硬件」',
      $('recoSub').textContent.indexOf('尚未选择硬件') >= 0, $('recoSub').textContent.trim());
    t('空态不打绿勾（兼容性走中性态）',
      $('issues').querySelectorAll('.issue.ok').length === 0 &&
      $('issues').textContent.indexOf('未检测到兼容性问题') === -1,
      $('issues').textContent.replace(/\s+/g, ' ').slice(0, 40));
    t('空态不推荐任何电源',
      $('psuPicks').querySelectorAll('.psu-pick').length === 0 &&
      $('psuPickHint').textContent === '',
      $('psuPicks').textContent.replace(/\s+/g, ' ').slice(0, 40));
    t('空态不给升级建议',
      $('upgradeBox').textContent.indexOf('RTX') === -1,
      $('upgradeBox').textContent.replace(/\s+/g, ' ').slice(0, 40));
    t('空态顶栏答案筹码隐藏', $('answerChip').hidden === true);
    t('空态底部结果条隐藏', $('mobileBar').hidden === true);

    /* --- 0c. 显式载入示例配置（之后所有断言都基于它） --- */
    $('btnQuickStart').click();
    t('点「载入示例配置」后示例已生效',
      $('storageList').querySelectorAll('.storage-row').length === 2,
      $('storageList').querySelectorAll('.storage-row').length + ' 行');
    t('载入后答案筹码显示',
      $('answerChip').hidden === false && $('answerChipValue').textContent.indexOf('W') >= 0,
      $('answerChipValue').textContent.trim());

    /* --- 1. 静态渲染 --- */
    t('cpuSelect 已填充', $('cpuSelect').options.length > 15, $('cpuSelect').options.length + ' 项');
    t('moboSelect 已填充', $('moboSelect').options.length > 15, $('moboSelect').options.length + ' 项');
    t('psuSelect 已填充', $('psuSelect').options.length > 15, $('psuSelect').options.length + ' 项');
    t('ramSelect 已填充', $('ramSelect').options.length > 10, $('ramSelect').options.length + ' 项');
    t('extrasGrid 有 8 个开关', $('extrasGrid').querySelectorAll('[data-x]').length === 8);
    t('数据来源已列出', $('sources').querySelectorAll('li').length >= 10,
       $('sources').querySelectorAll('li').length + ' 条');
    t('场景按钮 4 个', $('scenarios').querySelectorAll('.scenario').length === 4);
    t('场景按钮带图标（模式选择器形态）',
      $('scenarios').querySelectorAll('.scenario .si svg').length === 4);
    t('显卡品牌按钮 4 个（集成显卡 + 3 家 GPU 厂）',
      $('gpuBrand').querySelectorAll('button').length === 4,
       $('gpuBrand').querySelectorAll('button').length + ' 个品牌按钮');
    var visibleH1 = Array.prototype.filter.call(document.querySelectorAll('h1'),
      function (h) { return h.offsetHeight > 0; });
    t('页面上有且仅有一个可见 h1（屏幕阅读器与 SEO 都需要）',
      visibleH1.length === 1, visibleH1.length + ' 个可见 h1 / DOM 内共 ' +
      document.querySelectorAll('h1').length + ' 个');
    t('全站无 emoji 图标',
      !/[\u2728\u26A1\u2600\u{1F9E9}\u{1F534}\u{1F319}\u2605\u2261\u2913\uFF0B]/u.test(document.body.innerText),
      '');

    /* --- 2. 示例配置计算结果 --- */
    t('规划功耗 947.6W', $('heroPower').textContent.indexOf('947.6') >= 0, $('heroPower').textContent.trim());
    t('推荐电源 1300~1500W',
      $('recoBig').textContent.indexOf('1300') >= 0 && $('recoBig').textContent.indexOf('1500') >= 0,
      $('recoBig').textContent.trim());
    t('三档电源卡片 3 张', $('psuPicks').querySelectorAll('.psu-pick').length === 3);
    t('明细表已渲染', $('detailTable').querySelectorAll('tbody tr').length > 10,
       $('detailTable').querySelectorAll('tbody tr').length + ' 行');
    t('升级空间已渲染', $('upgradeBox').textContent.indexOf('可承受显卡') >= 0);
    t('配置平衡建议已渲染', $('adviceBox').querySelectorAll('.issue').length > 0);
    t('旗舰配置无兼容性错误', $('issues').querySelectorAll('.issue.error').length === 0);

    /* --- 3. 场景切换影响冗余系数 --- */
    document.querySelector('.scenario[data-sc="creator"]').click();
    t('切换创作场景 -> 冗余 1.50', $('recoSub').textContent.indexOf('1.50') >= 0);
    document.querySelector('.scenario[data-sc="office"]').click();
    t('切换办公场景 -> 冗余 1.30', $('recoSub').textContent.indexOf('1.30') >= 0);
    document.querySelector('.scenario[data-sc="gaming"]').click();

    /* --- 4. 显卡四级联动：品牌 → 世代 → 型号 → AIC --- */
    document.querySelector('#gpuBrand button[data-b="AMD"]').click();
    t('切 AMD -> 世代列表刷新', $('gpuGen').options.length >= 4,
       $('gpuGen').options.length + ' 个世代');
    /* 需求：老卡必须看得见、够得着。世代下拉的分组名里直写「已停产」，
       用户不必逐个点开猜自己那块 1060 在不在库里。
       注意：optgroup 的 label 是属性，不在 textContent 里，必须读 .label。 */
    var genLabels = function (sel) {
      return Array.prototype.map.call(sel.querySelectorAll('optgroup'), function (o) {
        return o.label;
      }).join(' | ');
    };
    /* 世代名写在 <option> 的文字里，分段名才在 optgroup 的 label 上，两者要分开取 */
    var genOptions = function (sel) {
      return Array.prototype.map.call(sel.options, function (o) { return o.textContent; }).join(' | ');
    };
    t('世代下拉标明「已停产」（老卡可见性）',
       genLabels($('gpuGen')).indexOf('已停产') >= 0, genLabels($('gpuGen')));
    t('世代下拉按「在售 / 已停产 / 未发布」分段',
       genLabels($('gpuGen')).indexOf('当前在售') >= 0 &&
       genLabels($('gpuGen')).indexOf('已停产') >= 0);
    /* 点品牌 / 世代只改筛选条件，不替你选中显卡。
       以前会自动挑该品牌的第一款（最新旗舰）并立刻计入功耗 ——
       用户只是想看看有哪些型号，整机功耗却已经变成 5090 的值了。 */
    t('点品牌不自动选中显卡', !$('gpuModel').value, $('gpuModel').value || '(空)');
    t('未选型号时 AIC 下拉只有一个占位项', $('gpuAib').options.length === 1,
       $('gpuAib').options.length + ' 项');

    var gm0 = $('gpuModel');
    for (var i0 = 0; i0 < gm0.options.length; i0++) {
      if (gm0.options[i0].value === 'rx9070xt') { gm0.value = 'rx9070xt'; break; }
    }
    gm0.dispatchEvent(new Event('change'));
    t('AMD 列表含 RX 9070 XT', $('gpuModel').textContent.indexOf('RX 9070 XT') >= 0);
    t('AIC 列表已填充', $('gpuAib').options.length >= 5, $('gpuAib').options.length + ' 个板型');
    t('AIC 列表含撼讯 / 蓝宝石', $('gpuAib').textContent.indexOf('撼讯') >= 0 &&
       $('gpuAib').textContent.indexOf('蓝宝石') >= 0);
    t('切换型号后 AIC 联动重置',
      (function () {
        var gm = $('gpuModel');
        for (var i = 0; i < gm.options.length; i++) {
          if (gm.options[i].value === 'rx9070') { gm.value = 'rx9070'; break; }
        }
        gm.dispatchEvent(new Event('change'));
        return $('gpuAib').textContent.indexOf('RX 9070') === -1;
      })());

    /* --- 4b. 世代筛选真的会收窄型号列表（这也验证了老卡确实能被筛出来） --- */
    t('世代筛选收窄型号列表且老卡可选中',
      (function () {
        var before = $('gpuModel').options.length;
        var gs = $('gpuGen');
        for (var i = 0; i < gs.options.length; i++) {
          if (gs.options[i].value === 'rx6000') { gs.value = 'rx6000'; break; }
        }
        gs.dispatchEvent(new Event('change'));
        var after = $('gpuModel').options.length;
        var txt = $('gpuModel').textContent;
        var ok = after > 0 && after < before &&
                 txt.indexOf('RX 6800') >= 0 &&           // 老卡进来了
                 txt.indexOf('RX 9070') === -1;            // 别的世代被挡住了
        // 复位到「全部世代」，别影响后面的用例
        gs.value = ''; gs.dispatchEvent(new Event('change'));
        return ok;
      })());

    /* --- 5. 插槽不兼容：AMD CPU + Z890 主板 ---
       注意：CPU 现在是三级筛选（品牌 → 世代 → 型号），
       要先切到 AMD 品牌，型号下拉里才会有 9950X3D2。 */
    document.querySelector('#cpuBrand button[data-b="AMD"]').click();
    t('切 AMD -> CPU 型号列表只剩 AMD',
       $('cpuSelect').textContent.indexOf('Ryzen') >= 0 &&
       $('cpuSelect').textContent.indexOf('Core Ultra') === -1,
       $('cpuSelect').options.length + ' 个型号');
    t('CPU 世代下拉标明「已停产」（老平台可见性）',
       genLabels($('cpuGen')).indexOf('已停产') >= 0, genLabels($('cpuGen')));
    t('点 CPU 品牌不自动选中型号', !$('cpuSelect').value, $('cpuSelect').value || '(空)');

    var cs = $('cpuSelect');
    cs.value = 'r9-9950x3d2'; cs.dispatchEvent(new Event('change'));
    t('CPU 型号已选中', cs.value === 'r9-9950x3d2', cs.value || '(空)');
    var mobo = $('moboSelect');
    mobo.value = 'asus-z890-hero'; mobo.dispatchEvent(new Event('change'));
    t('CPU/主板插槽不兼容 -> 报错', $('issues').textContent.indexOf('CPU 与主板接口不兼容') >= 0);
    t('错误级别样式已渲染', $('issues').querySelectorAll('.issue.error').length >= 1);
    t('给出了 AM5 替代主板建议', $('issues').textContent.indexOf('AM5') >= 0);
    t('错误计数已显示', $('issueCount').textContent.indexOf('错误') >= 0, $('issueCount').textContent.trim());

    /* --- 6. 显卡超长：5090 Astral(357.6mm) + North(355mm) --- */
    var cases = $('caseSelect');
    cases.value = 'case-fractal-north'; cases.dispatchEvent(new Event('change'));
    document.querySelector('#gpuBrand button[data-b="NVIDIA"]').click();
    /* 需求「增加到 900 系到 30 系的老卡数据」的验收点：
       NVIDIA 的世代下拉里必须真的出现这些老世代分组。 */
    t('NVIDIA 世代下拉含 GTX 900 / 10 系老卡分组',
       genOptions($('gpuGen')).indexOf('GTX 900 系') >= 0 &&
       genOptions($('gpuGen')).indexOf('GTX 10 系') >= 0 &&
       genOptions($('gpuGen')).indexOf('RTX 30 系') >= 0,
       genOptions($('gpuGen')));
    var gm2 = $('gpuModel');
    for (var a = 0; a < gm2.options.length; a++) {
      if (gm2.options[a].value === 'rtx5090') { gm2.value = 'rtx5090'; break; }
    }
    gm2.dispatchEvent(new Event('change'));
    var ga = $('gpuAib');
    for (var b = 0; b < ga.options.length; b++) {
      if (ga.options[b].value === 'asus-astral-5090') { ga.value = 'asus-astral-5090'; break; }
    }
    ga.dispatchEvent(new Event('change'));
    t('显卡超长 -> 报错', $('issues').textContent.indexOf('显卡长度超出机箱限长') >= 0);
    t('给出了机箱限长建议', $('issues').textContent.indexOf('限长 ≥') >= 0);

    /* --- 7. 已有电源校验 --- */
    var ps = $('psuSelect');
    ps.value = 'seasonic-focus-gx850'; ps.dispatchEvent(new Event('change'));
    t('850W 电源 -> 判定功率不足', $('issues').textContent.indexOf('所选电源功率不足') >= 0);
    t('电源负载率面板已渲染', $('psuInfo').textContent.indexOf('负载率') >= 0,
       ($('psuInfo').textContent.match(/负载率 \\d+%/) || [''])[0]);
    ps.value = 'seasonic-prime-tx1300'; ps.dispatchEvent(new Event('change'));
    t('1300W 电源 -> 达标不再报错',
      $('issues').textContent.indexOf('所选电源功率不足') === -1);

    /* --- 8. 未收录型号兜底 --- */
    $('gpuCustomName').value = '某未收录 RTX 5090 Ti';
    $('gpuCustomName').dispatchEvent(new Event('input'));
    $('gpuCustomW').value = '700';
    $('gpuCustomW').dispatchEvent(new Event('input'));
    t('未收录型号 -> 提示估算', $('issues').textContent.indexOf('未收录型号') >= 0);
    t('未收录型号仍能算出总功耗', parseFloat($('heroPower').textContent) > 700,
       $('heroPower').textContent.trim());
    $('gpuCustomName').value = ''; $('gpuCustomName').dispatchEvent(new Event('input'));

    /* --- 9. 存储增删 --- */
    var before = $('storageList').querySelectorAll('.storage-row').length;
    $('addStorage').click();
    t('添加硬盘生效', $('storageList').querySelectorAll('.storage-row').length === before + 1);
    var del = $('storageList').querySelectorAll('.del');
    del[del.length - 1].click();
    t('移除硬盘生效', $('storageList').querySelectorAll('.storage-row').length === before);

    /* --- 10. 扩展设备与 ARGB --- */
    var p0 = parseFloat($('heroPower').textContent);
    var chk = $('extrasGrid').querySelector('[data-x="x-usb-pcie"]');
    chk.checked = true; chk.dispatchEvent(new Event('change', { bubbles: true }));
    t('勾选扩展卡 -> 功耗上升', parseFloat($('heroPower').textContent) > p0,
       p0 + ' -> ' + parseFloat($('heroPower').textContent));
    var p1 = parseFloat($('heroPower').textContent);
    var ar = $('argbChannels'); ar.value = '3'; ar.dispatchEvent(new Event('input'));
    t('ARGB 通道 -> 功耗上升', parseFloat($('heroPower').textContent) > p1,
       p1 + ' -> ' + parseFloat($('heroPower').textContent));

    /* --- 11. 超频 --- */
    var p2 = parseFloat($('heroPower').textContent);
    var oc = $('cpuOc'); oc.checked = true; oc.dispatchEvent(new Event('change'));
    t('CPU 超频 -> 功耗上升', parseFloat($('heroPower').textContent) > p2,
       p2 + ' -> ' + parseFloat($('heroPower').textContent));
    t('超频 -> 提示建议更高瓦数', $('issues').textContent.indexOf('超频') >= 0);

    /* --- 12. 反馈入口 --- */
    $('fbType').value = 'gpu';
    $('fbName').value = '某品牌 RTX 5090 Ti';
    $('fbWatts').value = '620';
    $('fbAdd').click();
    t('反馈列表已更新', $('fbList').querySelectorAll('tbody tr').length === 1);

    /* --- 13. 导出内容真实验证 --- */
    t('调试钩子已暴露', !!window.__PSU_DEBUG);
    var rows = window.__PSU_DEBUG.buildReportRows();
    t('报告行数充足', rows.length > 40, rows.length + ' 行');
    var flat = rows.map(function (r) { return r.join('|'); }).join('\\n');
    t('报告含汇总章节', flat.indexOf('—— 汇总 ——') >= 0);
    t('报告含计算逻辑', flat.indexOf('—— 计算逻辑 ——') >= 0);
    t('报告含逐项明细', flat.indexOf('—— 功耗明细 ——') >= 0);
    t('报告含电源方案', flat.indexOf('—— 电源推荐方案 ——') >= 0);
    t('报告含兼容性章节', flat.indexOf('—— 兼容性与风险提示 ——') >= 0);
    t('报告含升级空间', flat.indexOf('—— 未来升级空间 ——') >= 0);
    t('报告含数据来源', flat.indexOf('—— 数据来源 ——') >= 0);
    t('报告含免责声明', flat.indexOf('免责声明') >= 0);
    t('明细包含 RTX 5090 行', flat.indexOf('GeForce RTX 5090') >= 0);
    t('明细标注了置信度', /official|review|estimate|leak/.test(flat));
    t('明细引用了来源 URL', flat.indexOf('http') >= 0);

    var csv = window.__PSU_DEBUG.toCsv();
    t('CSV 已生成', csv.length > 2000, csv.length + ' 字符');
    t('CSV 含逗号分隔结构', csv.indexOf(',') > 0 && csv.indexOf('\\r\\n') > 0);
    // CSV 引号转义正确性：字段内出现引号必须被双写
    var badQuote = /(^|[^"])"([^",\\r\\n]*)"(?!\s*[,;\\r\\n]|$)/.test(csv.split('\\r\\n')[0]);
    t('CSV 首行无畸形引号', !badQuote);
    t('CSV 中文未转义丢失', csv.indexOf('规划功耗') >= 0);
    t('CSV 行数等于报告行数', csv.split('\\r\\n').length === rows.length,
       csv.split('\\r\\n').length + ' vs ' + rows.length);

    t('CSV 导出按钮存在', !!$('btnCsv'));
    t('JSON 导出按钮存在', !!$('btnJson'));
    t('PDF 打印按钮存在', !!$('btnPdf'));

    /* --- 15. 全流程结束后仍无异常 --- */
    t('全流程无 JS 异常', (window.__PSU_ERRORS || []).length === 0,
      (window.__PSU_ERRORS || []).slice(0, 3).join(' ; '));

    /* --- 16. 新增数据库覆盖（AIC 系列 / 老平台 CPU） --- */
    var db = window.__PSU_DEBUG.db;
    t('CPU 库 >= 150 款', db.cpus.length >= 150, db.cpus.length + ' 款');
    t('AIC 板型 >= 800 个', db.aibs.length >= 800, db.aibs.length + ' 个');
    t('AIC 厂商 >= 20 家', db.meta.counts.aibVendors >= 20, db.meta.counts.aibVendors + ' 家');
    t('微星闪电在库', db.aibs.some(function (a) { return a.series === 'Lightning Z'; }));
    t('Halo 系列在库（ROG Matrix / HOF OC Lab / AORUS XTREME / TOXIC）',
      ['ROG Matrix', 'HOF OC Lab', 'AORUS XTREME', 'TOXIC'].every(function (s) {
        return db.aibs.some(function (a) { return a.series === s; });
      }));
    t('耕升中国区命名已修正为 炫光/踏雪/追风',
      db.aibs.some(function (a) { return a.cn === '炫光'; }) &&
      db.aibs.some(function (a) { return a.cn === '追风'; }) &&
      !db.aibs.some(function (a) { return a.cn === '幻影'; }));
    t('无法核实的 Kudan 已移除', !db.aibs.some(function (a) { return a.series === 'Kudan'; }));
    t('AIC 数据可靠性声明已渲染到页面',
      $('aibCatalogNote').textContent.indexOf('规则推算') >= 0 &&
      $('aibCatalogNote').textContent.indexOf('已修正') >= 0,
      $('aibCatalogNote').textContent.replace(/\s+/g, ' ').slice(0, 70));
    t('LGA1200 平台 CPU 已覆盖',
      db.cpus.filter(function (c) { return c.socket === 'LGA1200'; }).length >= 25);
    t('AM4 平台 CPU 已覆盖',
      db.cpus.filter(function (c) { return c.socket === 'AM4'; }).length >= 30);

    /* --- 14. 空配置不崩溃 --- */
    cs.value = ''; cs.dispatchEvent(new Event('change'));
    $('cpuSelect').value = ''; $('cpuSelect').dispatchEvent(new Event('change'));
    t('清空 CPU 后仍能渲染', !!$('heroPower').textContent);

    /* --- 15. 新手引导（面向非专业用户） --- */
    t('新手引导卡片存在', !!$('guideCard') && $('guideCard').style.display !== 'none');
    t('引导含 3 步说明', $('guideCard').querySelectorAll('.guide-steps li').length === 3,
       $('guideCard').querySelectorAll('.guide-steps li').length + ' 步');
    t('术语表条目充足', $('guideCard').querySelectorAll('.glossary dt').length >= 8,
       $('guideCard').querySelectorAll('.glossary dt').length + ' 条');
    t('引导已改为直白短文案',
       $('guideCard').textContent.indexOf('选硬件') >= 0 &&
       $('guideCard').textContent.indexOf('看瓦数') >= 0);
    t('推荐结论直接给出"买多大"',
       $('recoSub').textContent.indexOf('买') >= 0 && $('recoSub').textContent.indexOf('W') >= 0,
       $('recoSub').textContent.replace(/\\s+/g, ' ').slice(0, 56));
    t('核心数字配白话解释',
       $('heroPowerNote').textContent.indexOf('电源至少要扛得住') >= 0,
       $('heroPowerNote').textContent);
    t('瞬时峰值有白话警告',
       $('heroTransientNote').textContent.indexOf('杂牌电源') >= 0);

    // "我不会选，先用示例试试" 必须真的能换配置
    var beforeLabel = $('btnQuickStart').textContent;
    $('btnQuickStart').click();
    t('示例按钮可切换配置', $('btnQuickStart').textContent !== beforeLabel,
       beforeLabel + ' -> ' + $('btnQuickStart').textContent);
    t('示例按钮切换后库仍正常', $('dbCounts').textContent.indexOf('CPU') >= 0);

    // 收起引导后应隐藏
    $('btnHideGuide').click();
    t('可收起新手引导', $('guideCard').style.display === 'none');

    /* --- 17. 改版验收：奥创皮肤 + 排版简化（提示词包 F 清单） --- */
    var resultCol = document.querySelector('.sticky-col');
    var kids = resultCol ? Array.prototype.slice.call(resultCol.children) : [];
    var recoIdx = kids.findIndex(function (n) { return n.classList.contains('reco'); });
    var heroIdx = kids.findIndex(function (n) { return n.classList.contains('hero'); });
    t('推荐瓦数排在结果列最前（答案优先）',
      recoIdx >= 0 && heroIdx >= 0 && recoIdx < heroIdx, 'reco@' + recoIdx + ' hero@' + heroIdx);
    t('推荐瓦数有独立标题', $('recoBig').parentNode.querySelector('.reco-label') !== null);

    // 折叠开关与摘要
    var toggles = document.querySelectorAll('.col-config .card-toggle');
    t('配置卡都有折叠开关（10 张卡 + 引导关闭键 = 11）', toggles.length === 11, toggles.length + ' 个');
    t('每张配置卡都有摘要位', document.querySelectorAll('.col-config .card-summary').length === 10);
    var cfgCards = document.querySelectorAll('.col-config section.card:not(#guideCard)');
    var collapsed = document.querySelectorAll('.col-config .card.is-collapsed');
    /* 需求：打开页面时把选项收起来，供用户自行打开。
       所以默认应该是「全部 10 张都收起」，而不是以前的「前 3 张展开」。 */
    t('默认全部收起（需求：打开页面时选项收起来）', collapsed.length === cfgCards.length,
      '折叠 ' + collapsed.length + ' / 共 ' + cfgCards.length);

    // 点开关能真正展开 / 折叠，且摘要能显示当前选择
    var card1 = cfgCards[0];                       // 使用场景
    var toggle1 = card1.querySelector('.card-toggle');
    t('收起状态下显示已选摘要',
      card1.querySelector('.card-summary').textContent.trim().length > 0,
      card1.querySelector('.card-summary').textContent.trim());
    toggle1.click();
    t('点开关可展开卡片', !card1.classList.contains('is-collapsed'));
    toggle1.click();
    t('再点一次可收起', card1.classList.contains('is-collapsed'));

    // 摘要必须跟随选择变化
    var cpuCard = cfgCards[1];
    var cpuToggle = cpuCard.querySelector('.card-toggle');
    cpuToggle.click();                              // 展开 CPU 卡
    var sumBefore = cpuCard.querySelector('.card-summary').textContent.trim();
    /* 预设可能刚把 CPU 品牌切到了 Intel，9600X 是 AMD 的，
       得先切回 AMD 品牌才在型号下拉里找得到它。 */
    document.querySelector('#cpuBrand button[data-b="AMD"]').click();
    var cs2 = $('cpuSelect');
    cs2.value = 'r5-9600x'; cs2.dispatchEvent(new Event('change', { bubbles: true }));
    var sumAfter = cpuCard.querySelector('.card-summary').textContent.trim();
    t('摘要跟随选择实时更新', sumBefore !== sumAfter, sumBefore + ' -> ' + sumAfter);
    t('摘要内容与所选型号一致', sumAfter.indexOf('9600X') >= 0, sumAfter);
    cpuToggle.click();

    // 冗长说明收纳（只作用于配置列，结果列不动）
    var clamped = document.querySelectorAll('.col-config .note.note-collapsible');
    t('配置列长说明已收纳', clamped.length > 0, clamped.length + ' 块');
    t('结果列说明未被折叠（那是结论的一部分）',
      document.querySelectorAll('.col-result .note.note-collapsible').length === 0);

    /* 数据声明：原来的「数据来源」独立卡片已撤掉，改到打开页面时的声明弹窗里。
       本轮 URL 带了 ?nodisclaimer=1（不带的话弹窗会盖住整页，
       所有布局 / 可见性断言都会失真），所以这里只验证抑制开关与搬迁结果；
       弹窗本身由文件末尾的独立用例验证。 */
    t('?nodisclaimer=1 可抑制声明弹窗',
      !!$('disclaimerModal') && $('disclaimerModal').hidden === true,
      $('disclaimerModal') ? 'hidden=' + $('disclaimerModal').hidden : '节点不存在');
    t('「数据来源」已从页面移入弹窗（不再是独立卡片）',
      !!$('sources') && !!$('sources').closest('#disclaimerModal') &&
      document.querySelector('.col-result #sources') === null,
      $('sources') ? $('sources').querySelectorAll('li').length + ' 条来源' : '节点不存在');
    t('显卡卡里的 AIC 声明已移入弹窗',
      !!$('aibCatalogNote') && !!$('aibCatalogNote').closest('#disclaimerModal'));
    t('反馈表单已收进折叠区',
      $('feedbackCard').closest('details.section-collapse') !== null &&
      !$('feedbackCard').closest('details.section-collapse').hasAttribute('open'));

    // 移动端常驻结果条
    t('移动端结果条存在且数值正确',
      $('mobileBar') !== null && $('mobileBarValue').textContent.indexOf('W') >= 0,
      $('mobileBarValue').textContent.trim());

    // 奥创皮肤是否真的生效（读计算样式，而不是看类名）
    var bodyBg = getComputedStyle(document.body).backgroundColor;
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--rog').trim();
    t('ROG 红主强调色已生效', accent.toLowerCase() === '#ff0033', accent);
    t('页面底色为中性近黑 #121212', bodyBg.indexOf('rgb(18, 18, 18)') >= 0, bodyBg);
    t('推荐瓦数使用等宽数字', getComputedStyle($('recoBig')).fontVariantNumeric.indexOf('tabular-nums') >= 0);

    /* --- 18. 对比度（WCAG，改版硬性要求 ≥4.5:1） --- */
    function srgb(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function lum(rgb) { return 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]); }
    function parseRGB(s) {
      var m = /rgba?\\(([^)]+)\\)/.exec(s);
      if (!m) return null;
      var p = m[1].split(',').map(function (x) { return parseFloat(x); });
      if (p.length > 3 && p[3] === 0) return null;   // 全透明
      return [p[0], p[1], p[2]];
    }
    function effBg(el) {
      var n = el;
      while (n && n !== document.documentElement) {
        var c = parseRGB(getComputedStyle(n).backgroundColor);
        if (c) return c;
        n = n.parentElement;
      }
      return parseRGB(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
    }
    function contrast(el) {
      var fg = parseRGB(getComputedStyle(el).color);
      if (!fg) return 0;
      var bg = effBg(el);
      var a = lum(fg), b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    function colorsOf(el) {
      return getComputedStyle(el).color + ' on ' +
        (function () { var b = effBg(el); return 'rgb(' + b.join(',') + ')'; })();
    }

    function auditContrast(themeName) {
      // 按钮上有 transition: all .18s，切换主题后立即读颜色会读到过渡中间值，
      // 造成假失败。测量期间临时禁用过渡，得到终态颜色。
      var killer = document.createElement('style');
      killer.textContent = '*{transition:none!important;animation:none!important}';
      document.head.appendChild(killer);
      void document.body.offsetHeight;      // 强制样式重算

      var targets = [
        ['正文', document.querySelector('.guide-lead')],
        ['卡片标题', document.querySelector('.col-config .card > h2')],
        ['表单标签', document.querySelector('.field > label')],
        ['次级文字 .hint', document.querySelector('.col-config .card > h2 .hint')],
        ['按钮文字', $('btnReset')],
        ['推荐瓦数数字', $('recoBig')],
        ['说明块 .note', document.querySelector('.col-config .note')]
      ];
      var worst = 99, worstName = '';
      targets.forEach(function (p) {
        if (!p[1]) return;
        var r = contrast(p[1]);
        // 大号数字按 WCAG 大文本标准 3:1，其余 4.5:1
        var min = (p[0].indexOf('数字') >= 0) ? 3 : 4.5;
        t(themeName + ' 对比度：' + p[0] + ' ≥ ' + min + ':1', r >= min,
          r.toFixed(2) + ':1  ' + colorsOf(p[1]));
        if (r < worst) { worst = r; worstName = p[0]; }
      });
      killer.remove();
      return worstName + ' ' + worst.toFixed(2) + ':1';
    }

    var darkWorst = auditContrast('暗色');
    $('btnTheme').click();                      // 切到浅色
    t('主题可切换到浅色', document.documentElement.getAttribute('data-theme') === 'light');
    var lightWorst = auditContrast('浅色');
    $('btnTheme').click();                      // 切回暗色
    t('主题可切回暗色', document.documentElement.getAttribute('data-theme') === 'dark');
    console.log('    最低对比度：暗色 ' + darkWorst + ' / 浅色 ' + lightWorst);

    /* --- 19. 全流程结束仍无异常 --- */
    t('全流程无 JS 异常', (window.__PSU_ERRORS || []).length === 0,
      (window.__PSU_ERRORS || []).slice(0, 3).join(' ; '));
  } catch (e) {
    window.__T.push('FAIL | 测试脚本异常 | ' + e.message + ' @ ' +
      String(e.stack || '').split('\\n')[1]);
  }

  var pre = document.createElement('pre');
  pre.id = 'RESULT';
  pre.textContent = window.__T.join('\\n');
  document.body.appendChild(pre);
}, 800);
<\/script>
`;

/* ------------------------------------------------------------- 执行 ----- */
/* 测试隔离：无头 Edge 默认复用同一个 profile，会导致上一轮测试通过 localStorage
   save() 下来的状态泄漏到下一轮（表现为"首访竟然已经选好了硬件"）。
   每次运行给一个独立 profile 目录，保证首访真的是首访。 */
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'psu-prof-'));
const PROFILE_ARGS = ['--user-data-dir=' + PROFILE_DIR];
process.on('exit', () => { try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {} });

const html = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(TMP, html.replace('</body>', TEST + '</body>'), 'utf8');

let dom = '';
try {
  dom = execFileSync(edge, [
    '--headless=new', '--disable-gpu', '--no-sandbox', ...PROFILE_ARGS,
    '--virtual-time-budget=9000', '--dump-dom',
    /* ?nodisclaimer=1 跳过「数据声明弹窗」——
       弹窗是 position:fixed + body.modal-open{overflow:hidden}，
       开着的话会盖住整页，让所有布局与可见性断言失真。
       弹窗本身由文件末尾的独立用例验证。 */
    'file:///' + TMP.replace(/\\/g, '/') + '?nodisclaimer=1&noanim=1'
  ], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  console.error('无头浏览器执行失败:', e.message);
  fs.unlinkSync(TMP);
  process.exit(1);
}
fs.unlinkSync(TMP);

const m = /<pre id="RESULT">([\s\S]*?)<\/pre>/.exec(dom);
if (!m) { console.error('未取到测试结果，页面可能未正常初始化'); process.exit(1); }

const lines = m[1].trim().split('\n').map(s =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"'));

let pass = 0, fail = 0;
const failed = [];
console.log('浏览器端交互测试 (' + path.basename(edge) + ')\n');
for (const l of lines) {
  if (l.startsWith('PASS')) { pass++; console.log('  \u2713 ' + l.slice(7)); }
  else if (l.startsWith('FAIL')) { fail++; failed.push(l.slice(7)); console.log('  \u2717 ' + l.slice(7)); }
  else console.log('    ' + l);
}
console.log('\n' + '='.repeat(56));
console.log('通过 ' + pass + ' / ' + (pass + fail) + '  失败 ' + fail);
console.log('='.repeat(56));

/* ==========================================================================
 *  单文件产物冒烟测试
 *  分发出去的其实是 dist/ 里的那个 .html，所以必须验证它**脱离本目录**也能跑。
 *  做法：把产物复制到一个只有它自己的临时目录再渲染，确保没有隐藏的路径依赖。
 * ========================================================================*/
const STANDALONE = path.join(root, 'dist', '整机功耗计算器.html');
let saFail = 0;

if (!fs.existsSync(STANDALONE)) {
  console.log('\n单文件产物冒烟测试：跳过（dist/ 不存在，先运行 build-standalone.mjs）');
} else {
  console.log('\n单文件产物冒烟测试（隔离环境）');
  console.log('\u2500'.repeat(56));

  /* 产物是否已过期：源文件比产物新就说明忘了重新构建 */
  const srcFiles = ['index.html', 'assets/style.css', 'assets/rog-eye.png',
    'js/db-cpus.js', 'js/db-aib.js', 'js/db.js', 'js/engine.js', 'js/app.js', 'js/ui.js']
    .map(f => path.join(root, f));
  const newestSrc = Math.max(...srcFiles.map(f => fs.statSync(f).mtimeMs));
  const builtAt = fs.statSync(STANDALONE).mtimeMs;
  const stale = newestSrc > builtAt + 1000;   // 1 秒容差
  console.log('  ' + (stale ? '\u2717' : '\u2713') + ' 产物是最新的' +
    (stale ? '（源文件已改动，请重新运行 build-standalone.mjs）' : ''));
  if (stale) { saFail++; console.log('\n  产物过期，跳过后续检查'); }

  const isoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psu-iso-'));
  const isoFile = path.join(isoDir, 'standalone.html');
  fs.copyFileSync(STANDALONE, isoFile);

  // 隔离目录里必须只有这一个文件——否则"单文件"就是假的
  const isoEntries = fs.readdirSync(isoDir);
  const isolated = isoEntries.length === 1;
  console.log('  ' + (isolated ? '\u2713' : '\u2717') + ' 隔离目录中只有 1 个文件（真正的单文件）');
  if (!isolated) saFail++;

  let saDom = '';
  try {
    saDom = execFileSync(edge, [
      '--headless=new', '--disable-gpu', '--no-sandbox', ...PROFILE_ARGS,
      '--virtual-time-budget=9000', '--dump-dom',
      'file:///' + isoFile.replace(/\\/g, '/') + '?nodisclaimer=1&noanim=1'
    ], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    console.log('  \u2717 无头浏览器执行失败: ' + e.message);
    saFail++;
  }

  /* 元素内容常含嵌套标签，正则难以可靠取内文；
     改为"在 id 之后的窗口内找关键字"，对结构变化更稳健 */
  const near = (id, needle, win) => {
    const i = saDom.indexOf('id="' + id + '"');
    return i >= 0 && saDom.slice(i, i + (win || 500)).indexOf(needle) >= 0;
  };

  const saChecks = [
    ['页面成功渲染（非空白）', saDom.length > 50000],
    ['样式已生效（配置区渲染）', near('dbCounts', 'CPU', 900)],
    ['CPU 数据库可用', near('dbCounts', '164', 900)],
    ['示例配置已计算', /id="heroPower"[^>]*>\s*\d/.test(saDom)],
    ['电源推荐已给出瓦数', /id="recoBig"[^>]*>[\s\S]{0,120}?W</.test(saDom)],
    ['已内联样式表', saDom.indexOf('--rog:') >= 0],
    ['新手引导已渲染', near('guideCard', '选硬件', 4000)],
    ['中文未乱码', !/\uFFFD/.test(saDom)],
    // canonical / og:url 这类链接不会发起网络请求，只检查真正会加载的资源
    ['无残留本地资源引用',
      !/<link[^>]+rel="stylesheet"[^>]+href="(?!data:)/.test(saDom) &&
      !/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]+href="(?!data:)/.test(saDom) &&
      !/<script[^>]+src=/.test(saDom)],
    ['单文件仍保留 SEO 元信息',
      /<title>[^<]+<\/title>/.test(saDom) && saDom.indexOf('og:image') > 0 &&
      saDom.indexOf('application/ld+json') > 0],
    ['单文件保留 noscript 兜底', saDom.indexOf('<noscript>') > 0]
  ];
  saChecks.forEach(c => {
    const okc = c[1];
    if (!okc) saFail++;
    console.log('  ' + (okc ? '\u2713' : '\u2717') + ' ' + c[0] + (c[2] ? '  [' + c[2] + ']' : ''));
  });

  try { fs.rmSync(isoDir, { recursive: true, force: true }); } catch (e) {}

  const saPass = saChecks.filter(c => c[1]).length;
  console.log('\n  单文件: ' + saPass + ' / ' + saChecks.length + ' 通过' +
              (isolated ? '' : '（含隔离性检查）'));
}

console.log('');

/* ==========================================================================
 *  部署就绪性检查
 *  上线前必须满足的那些条件：SEO 文件齐全、分享图尺寸正确、robots 不误伤。
 *  占位域名未替换会给出提醒（不算失败，因为本地开发时本来就没换）。
 * ========================================================================*/
console.log('部署就绪性检查');
console.log('\u2500'.repeat(56));

let deployFail = 0, deployWarn = 0;
const dcheck = (label, cond, extra) => {
  if (!cond) deployFail++;
  console.log('  ' + (cond ? '\u2713' : '\u2717') + ' ' + label + (extra ? '  [' + extra + ']' : ''));
};

const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 必需文件
['index.html', '404.html', 'favicon.svg', 'robots.txt', 'sitemap.xml',
 'assets/style.css', 'assets/og-image.png'].forEach(f => {
  dcheck('存在 ' + f, fs.existsSync(path.join(root, f)));
});

// SEO 标签
dcheck('有 <title>', /<title>[^<]{10,}<\/title>/.test(idx));
dcheck('有 meta description（长度 60~200）',
  (() => { const m = /name="description"\s+content="([^"]+)"/.exec(idx);
           return m && m[1].length >= 60 && m[1].length <= 200; })(),
  (() => { const m = /name="description"\s+content="([^"]+)"/.exec(idx); return m ? m[1].length + ' 字' : '缺失'; })());
dcheck('有 canonical', /rel="canonical"/.test(idx));
dcheck('有 og:title / og:image / og:url',
  /property="og:title"/.test(idx) && /property="og:image"/.test(idx) && /property="og:url"/.test(idx));
dcheck('有 twitter:card', /name="twitter:card"/.test(idx));
dcheck('有结构化数据 JSON-LD', /application\/ld\+json/.test(idx));
dcheck('有 noscript 兜底', /<noscript>/.test(idx));
dcheck('有 favicon 引用', /rel="icon"/.test(idx));

/* ---------------------------------------------------- DOM 契约（id 对账）----
 * app.js / ui.js 全部靠 getElementById 绑定，所以「JS 引用了某个 id
 * 但 HTML 里已经没有这个节点」是一整类立刻炸掉页面的 bug。
 * 本项目已经踩过两次：
 *   · refreshGpuCascade 引用了不存在的 gpu 变量（整页空白）
 *   · 删掉「数据来源」卡片时若不同时保留 id="sources"，app.js 会 TypeError
 * 这里做静态对账，改版时删元素忘改 JS（或反过来）会立刻被发现。 */
{
  const jsIds = new Set();
  ['js/app.js', 'js/ui.js'].forEach(f => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    // $('x') 与 getElementById('x') 两种写法都要覆盖
    for (const m of src.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) jsIds.add(m[1]);
    for (const m of src.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)) jsIds.add(m[1]);
  });

  const htmlIds = new Set();
  for (const m of idx.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)) htmlIds.add(m[1]);
  // app.js 会动态创建这些节点（JS 里 createElement + 赋 id）
  ['RESULT', 'MOBILE_RESULT', 'MODAL_RESULT'].forEach(x => htmlIds.add(x));
  // ui.js 注入的节点
  ['card-summary', 'card-toggle'].forEach(x => htmlIds.add(x));

  const missing = [...jsIds].filter(x => !htmlIds.has(x)).sort();
  dcheck('JS 引用的每个元素 id 都存在于 index.html', missing.length === 0,
    missing.length ? '缺失: ' + missing.join(', ') : jsIds.size + ' 个 id 全部对得上');

  // 反向：HTML 里有 id 但没人用，属于改版残留（只提醒，不失败）
  const unused = [...htmlIds].filter(x => !jsIds.has(x) &&
    !['RESULT', 'MOBILE_RESULT', 'MODAL_RESULT', 'card-summary', 'card-toggle'].includes(x));
  if (unused.length) console.log('    （提示）HTML 里这些 id 目前没有 JS 引用: ' + unused.join(', '));
}

// 分享图必须是 1200×630 的真实 PNG
const ogPath = path.join(root, 'assets/og-image.png');
if (fs.existsSync(ogPath)) {
  const b = fs.readFileSync(ogPath);
  const isPng = b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  const w = isPng ? b.readUInt32BE(16) : 0;
  const h = isPng ? b.readUInt32BE(20) : 0;
  dcheck('分享图是合法 PNG', isPng);
  dcheck('分享图尺寸 1200×630', w === 1200 && h === 630, w + '×' + h);
  dcheck('分享图体积 < 300KB（微信有上限）', b.length < 300 * 1024,
    (b.length / 1024).toFixed(0) + ' KB');
}

// robots.txt 不得把自己挡住
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
dcheck('robots 允许抓取根目录', /Allow:\s*\//.test(robots) && !/^Disallow:\s*\/\s*$/m.test(robots));
dcheck('robots 指向 sitemap', /Sitemap:/.test(robots));

// sitemap 格式
const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
dcheck('sitemap 是合法 urlset', sm.indexOf('<urlset') > 0 && sm.indexOf('</urlset>') > 0);
dcheck('sitemap 含 <loc>', /<loc>[^<]+<\/loc>/.test(sm));

// 占位域名检查（提醒，不算失败——本地开发时本来就该是占位符）
const placeholders = [];
['index.html', 'sitemap.xml', 'robots.txt'].forEach(f => {
  const c = fs.readFileSync(path.join(root, f), 'utf8');
  const n = (c.match(/example\.com/g) || []).length;
  if (n) placeholders.push(f + ' ×' + n);
});
if (placeholders.length) {
  deployWarn++;
  console.log('  \u26a0 上线前需替换占位域名 example.com：' + placeholders.join('、'));
  console.log('    （详见 DEPLOY.md「部署前必做」）');
} else {
  console.log('  \u2713 占位域名已全部替换');
}

dcheck('有部署说明文档', fs.existsSync(path.join(root, 'DEPLOY.md')));

/* ---------------------------------------------------------------- 打印 --
   @media print 是导出 PDF 的唯一实现。改版最容易把它改坏，
   所以这里逐条断言关键规则还在（静态检查，不依赖浏览器）。 */
const css = fs.readFileSync(path.join(root, 'assets/style.css'), 'utf8');
const printIdx = css.lastIndexOf('@media print');
const printBlock = printIdx >= 0 ? css.slice(printIdx) : '';

dcheck('存在 @media print 块', printIdx >= 0);
dcheck('打印时隐藏配置列', /\.layout\s*>\s*\.col-config/.test(printBlock));
dcheck('打印时隐藏按钮与移动端条', /button/.test(printBlock) && /\.mobile-bar/.test(printBlock));
dcheck('打印时隐藏折叠开关', /\.card-toggle/.test(printBlock));
/* 屏幕态的收起靠 grid-template-rows:0fr 实现（为了能做高度过渡），
   不是 display:none。所以打印时必须把行高、透明度、pointer-events 都还原 ——
   只断言 display 会漏掉「内容在 DOM 里但高度是 0」这种 PDF 缺内容的情况。 */
dcheck('打印时展开被折叠的卡片',
  /\.card\.is-collapsed\s*>\s*\.card-body\s*\{[^}]*grid-template-rows:\s*1fr\s*!important/.test(printBlock) &&
  /\.card\.is-collapsed\s*>\s*\.card-body\s*\{[^}]*opacity:\s*1\s*!important/.test(printBlock));
dcheck('打印时展开 details 折叠区', /details[^{]*\{[^}]*display:\s*block\s*!important/.test(printBlock));
dcheck('打印时取消说明块的行数截断', /-webkit-line-clamp:\s*unset\s*!important/.test(printBlock));
dcheck('打印时压平渐变与辉光',
  /background-image:\s*none\s*!important/.test(printBlock) && /box-shadow:\s*none\s*!important/.test(printBlock));
dcheck('打印时大数字转黑', /text-shadow:\s*none\s*!important/.test(printBlock));
dcheck('打印时显示 .print-only 报表抬头', /\.print-only\s*\{\s*display:\s*block\s*!important/.test(printBlock));

/* ------------------------------------------------- 窄屏防溢出的关键规则 -- */
dcheck('grid 子项已归零 min-width（防 select 撑破布局）',
  /\.layout\s*>\s*\*\s*\{\s*min-width:\s*0/.test(css));
dcheck('select 限制最大宽度', /select\s*\{\s*max-width:\s*100%/.test(css));
dcheck('存在 1180 / 640 / 420 三档断点',
  /max-width:\s*1180px/.test(css) && /max-width:\s*640px/.test(css) && /max-width:\s*420px/.test(css));
dcheck('尊重 prefers-reduced-motion', /prefers-reduced-motion/.test(css));

/* -------------------------------------------------------- 奥创令牌 ------ */
dcheck('ROG 红主强调色已定义', /--rog:\s*#ff0033/.test(css));
dcheck('圆角收到 ≤4px', /--radius:\s*2px/.test(css));
dcheck('无装饰性呼吸动画', !/animation:\s*\w/.test(css));
dcheck('浅色主题覆盖同名变量（未增删变量名）', /html\[data-theme="light"\]/.test(css));
const rootVars = (css.slice(0, css.indexOf('html[data-theme="light"]')).match(/--[a-z0-9-]+:/g) || [])
  .map(s => s.replace(':', '')).sort();
const lightVars = (css.slice(css.indexOf('html[data-theme="light"]'), css.indexOf('/* ====') === -1
  ? css.indexOf('* { box-sizing') : css.indexOf('* { box-sizing'))
  .match(/--[a-z0-9-]+:/g) || []).map(s => s.replace(':', ''));
const missingInLight = rootVars.filter(v => lightVars.indexOf(v) === -1 && v !== '--ease');
dcheck('浅色主题覆盖了所有暗色令牌', missingInLight.length === 0,
  missingInLight.join(',') || '全部覆盖');

console.log('\n  部署检查: ' + (deployFail ? deployFail + ' 项未通过' : '全部通过') +
            (deployWarn ? '（' + deployWarn + ' 项提醒）' : ''));
console.log('');

/* ==========================================================================
 *  窄屏横向溢出检查
 *  ⚠️ 无头 Edge 有约 504px 的最小布局视口：--window-size=390 只会把截图裁成
 *     390px 宽，布局视口仍是 504px，因此 CLI 参数无法真正测窄屏。
 *     改用 iframe（媒体查询按 iframe 宽度生效），并用
 *     --allow-file-access-from-files 才能读取其 contentDocument。
 * ========================================================================*/
const MOBILE_W = 390;
console.log('窄屏横向溢出检查（iframe 视口 ' + MOBILE_W + 'px）');
console.log('\u2500'.repeat(56));

let mobFail = 0;
{
  const probe = path.join(root, '_probe-mobile.html');
  const inject = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>vp</title>
<style>html,body{margin:0}iframe{border:0;display:block}</style></head>
<body>
<iframe id="f" src="index.html?nodisclaimer=1&amp;noanim=1" width="${MOBILE_W}" height="844"></iframe>
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    try {
      var d = document.getElementById('f').contentDocument;
      var root = d.documentElement;
      var vw = root.clientWidth;
      out.push('VIEWPORT=' + vw);
      out.push('SCROLLWIDTH=' + root.scrollWidth);
      out.push('PAGEHEIGHT=' + root.scrollHeight);
      out.push('HASBAR=' + (d.getElementById('mobileBar') ? 1 : 0));
      out.push('BARVISIBLE=' + (d.getElementById('mobileBar') &&
        d.defaultView.getComputedStyle(d.getElementById('mobileBar')).display !== 'none' ? 1 : 0));
      var bad = [];
      d.querySelectorAll('body *').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (d.defaultView.getComputedStyle(el).position === 'fixed') return;
        if (r.right > vw + 1) {
          var cls = (typeof el.className === 'string' && el.className)
            ? '.' + el.className.trim().split(/[ \\t]+/).join('.') : '';
          var n = el.id ? '#' + el.id : (cls || el.tagName);
          bad.push(n + '@' + Math.round(r.right) + '>vw' + vw);
        }
      });
      out.push('OVERFLOW=' + (bad.slice(0, 5).join(' | ') || 'NONE'));

      // 触控目标只检查「可见」控件——默认折叠卡片里的控件高度为 0 属正常
      var small = [], checked = 0;
      ['cpuSelect', 'gpuModel', 'gpuAib', 'moboSelect', 'psuSelect',
       'btnQuickStart', 'btnHideGuide', 'fbAdd'].forEach(function (id) {
        var el = d.getElementById(id);
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (r.height === 0) return;            // 在折叠卡片里，跳过
        checked++;
        if (r.height < 44) small.push(id + '=' + Math.round(r.height));
      });
      out.push('SMALLTARGET=' + small.join(','));
      out.push('CHECKEDTARGET=' + checked);

      // 常驻条诊断
      var bar = d.getElementById('mobileBar');
      out.push('BAR_EXISTS=' + (bar ? 1 : 0));
      out.push('BAR_HIDDEN_ATTR=' + (bar && bar.hasAttribute('hidden') ? 1 : 0));
      out.push('BAR_DISPLAY=' + (bar ? d.defaultView.getComputedStyle(bar).display : 'n/a'));
      out.push('BAR_TEXT=' + (bar ? bar.textContent.replace(/[ \\n]+/g, ' ').trim() : ''));
      out.push('UIJS_ERRORS=' + ((d.defaultView.__UI_ERRORS || []).length));
    } catch (e) {
      out.push('IFRAME_BLOCKED=' + e.message);
    }
    var p = document.createElement('pre');
    p.id = 'MOBILE_RESULT';
    p.textContent = out.join('\\n');
    document.body.appendChild(p);
  }, 900);
});
<\/script></body></html>`;
  fs.writeFileSync(probe, inject, 'utf8');

  let mdom = '';
  try {
    mdom = execFileSync(edge, [
      '--headless=new', '--disable-gpu', '--no-sandbox', ...PROFILE_ARGS, '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--virtual-time-budget=10000', '--dump-dom',
      'file:///' + probe.replace(/\\/g, '/') + '?noanim=1'
    ], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    console.log('  \u2717 窄屏渲染失败: ' + e.message);
    mobFail++;
  }
  fs.unlinkSync(probe);

  const mm = /<pre id="MOBILE_RESULT">([\s\S]*?)<\/pre>/.exec(mdom);
  if (!mm) {
    console.log('  \u2717 未取到窄屏测量结果');
    mobFail++;
  } else {
    // ⚠️ dump-dom 在 Windows 上是 CRLF，必须按 /\r?\n/ 切，否则每行尾部残留 \r
    const lines = mm[1].trim().split(/\r?\n/);
    const val = k => {
      const l = lines.find(x => x.startsWith(k + '='));
      return l ? l.slice(k.length + 1).trim() : '';
    };
    const chk = (label, ok, extra) => {
      if (!ok) mobFail++;
      console.log('  ' + (ok ? '\u2713' : '\u2717') + ' ' + label + (extra ? '  [' + extra + ']' : ''));
    };

    const vw = parseInt(val('VIEWPORT'), 10) || 0;
    const sw = parseInt(val('SCROLLWIDTH'), 10) || 0;
    const ph = parseInt(val('PAGEHEIGHT'), 10) || 0;
    const overflow = val('OVERFLOW');
    const small = val('SMALLTARGET');

    chk('iframe 视口确为 ' + MOBILE_W + 'px（移动端断点已触发）',
        vw > 0 && vw <= MOBILE_W + 1, vw + 'px');
    chk('页面无横向滚动', sw <= vw + 1, 'scrollWidth=' + sw + ' vs viewport=' + vw);
    chk('无元素越出右边界', overflow === 'NONE', overflow === 'NONE' ? '' : overflow);
    chk('底部常驻结果条在该断点下可见',
        val('BAR_DISPLAY') === 'flex' && val('BAR_HIDDEN_ATTR') === '0',
        'display=' + val('BAR_DISPLAY') + ' hidden=' + val('BAR_HIDDEN_ATTR') +
        ' 内容="' + val('BAR_TEXT') + '"');
    chk('常驻条显示的瓦数有效', /[0-9]/.test(val('BAR_TEXT')), val('BAR_TEXT'));
    chk('主要控件触控高度 ≥44px', !small,
        (small || '全部达标') + '（已测 ' + val('CHECKEDTARGET') + ' 个可见控件）');
    chk('ui.js 无异常', val('UIJS_ERRORS') === '0', 'errors=' + val('UIJS_ERRORS'));
    console.log('    页面总高 ' + ph + 'px（移动端单列）');
  }
  console.log('\n  窄屏检查: ' + (mobFail ? mobFail + ' 项未通过' : '全部通过'));
}

console.log('');

/* ==========================================================================
 *  布局检查
 *  起因：重写样式表时把 `.layout { display:grid; grid-template-columns:... }`
 *  整条规则弄丢了，整页退化成单列 —— 而截图看不出来（内容铺满宽度像是正常的），
 *  只有量 grid-template-columns 才会暴露。所以必须有一道断言守着。
 * ========================================================================*/
console.log('布局检查（宽屏双列）');
console.log('\u2500'.repeat(56));

let layFail = 0;
{
  const probe = path.join(root, '_probe-layout.html');
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const inject = `<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    var lay = document.querySelector('.layout');
    var cs = getComputedStyle(lay);
    out.push('DISPLAY=' + cs.display);
    out.push('COLS=' + cs.gridTemplateColumns);
    var cfg = document.querySelector('.col-config').getBoundingClientRect();
    var res = document.querySelector('.col-result').getBoundingClientRect();
    out.push('CFG_W=' + Math.round(cfg.width));
    out.push('RES_W=' + Math.round(res.width));
    out.push('SIDE_BY_SIDE=' + (res.left > cfg.right - 2 ? 1 : 0));
    // 结果列在宽屏必须在右栏，不能被推到配置列下面
    out.push('RES_TOP=' + Math.round(res.top));
    out.push('CFG_BOTTOM=' + Math.round(cfg.bottom));
    var p = document.createElement('pre'); p.id = 'L';
    p.textContent = out.join('\\n');
    document.body.appendChild(p);
  }, 900);
});
<\/script>`;
  fs.writeFileSync(probe, src.replace('</body>', inject + '</body>'), 'utf8');

  let dom = '';
  try {
    dom = execFileSync(edge, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', ...PROFILE_ARGS,
      '--window-size=1440,900', '--virtual-time-budget=7000', '--dump-dom',
      'file:///' + probe.replace(/\\/g, '/') + '?noanim=1'
    ], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    console.log('  \u2717 渲染失败: ' + e.message.slice(0, 50));
    layFail++;
  }
  fs.unlinkSync(probe);

  const m = /<pre id="L">([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) { console.log('  \u2717 未取到布局测量结果'); layFail++; }
  else {
    const lines = m[1].trim().split(/\r?\n/);
    const v = k => { const l = lines.find(x => x.startsWith(k + '=')); return l ? l.slice(k.length + 1).trim() : ''; };
    const chk = (label, ok, extra) => {
      if (!ok) layFail++;
      console.log('  ' + (ok ? '\u2713' : '\u2717') + ' ' + label + (extra ? '  [' + extra + ']' : ''));
    };
    const cols = v('COLS');
    const nCols = cols && cols !== 'none' ? cols.split(' ').filter(Boolean).length : 0;
    chk('.layout 是 grid 容器', v('DISPLAY') === 'grid', v('DISPLAY'));
    chk('.layout 在宽屏解析为 2 列（规则没被弄丢）', nCols === 2, cols + ' → ' + nCols + ' 列');
    chk('结果列在配置列右侧（未被推到下方）', v('SIDE_BY_SIDE') === '1',
        'cfg=' + v('CFG_W') + 'px res=' + v('RES_W') + 'px');
  }
  console.log('\n  布局检查: ' + (layFail ? layFail + ' 项未通过' : '全部通过'));
}

/* ==========================================================================
 *  数据声明弹窗专项
 *  ⚠️ 这一轮**故意不带** ?nodisclaimer=1：弹窗必须在打开页面时自动出现。
 *     其余所有用例都带这个参数把它关掉，否则它会盖住整页。
 * ========================================================================*/
console.log('\n数据声明弹窗检查（不带 ?nodisclaimer=1）');
console.log('\u2500'.repeat(56));

let dmFail = 0;
{
  const probe = path.join(root, '_probe-modal.html');
  const inject = `
<script>
window.__M = [];
function m(name, cond, extra) { window.__M.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : '')); }
function $(id) { return document.getElementById(id); }
window.addEventListener('error', function (e) { window.__M.push('FAIL | 未捕获的 JS 错误 | ' + e.message); });

setTimeout(function () {
  try {
    var md = $('disclaimerModal');
    /* role / aria-modal / aria-labelledby 挂在内层的 .modal-card 上
       （#disclaimerModal 只是遮罩层），所以要从遮罩里往下找。 */
    var card = md.querySelector('[role="dialog"]');
    m('打开页面时自动弹出声明', md && !md.hidden);
    m('弹窗是 role=dialog + aria-modal',
      !!card && card.getAttribute('aria-modal') === 'true',
      card ? card.getAttribute('role') + '/' + card.getAttribute('aria-modal') : '未找到 dialog');
    m('弹窗标题可被无障碍读取',
      !!card && !!$('dmTitle') && card.getAttribute('aria-labelledby') === 'dmTitle');
    m('弹窗打开了 body.modal-open（背后页面不滚动）',
      document.body.classList.contains('modal-open'));

    /* 数据来源确实搬进来了 —— 这是需求「去除数据来源界面」的验收点 */
    var src = $('sources');
    m('数据来源已在弹窗内', !!src && !!src.closest('#disclaimerModal'));
    m('数据来源条目充足', src && src.querySelectorAll('li').length >= 10,
      src ? src.querySelectorAll('li').length + ' 条' : 'n/a');
    /* 显卡卡里的 AIC 声明也搬进来了 —— 需求「把 GPU 页面的声明加入弹窗」 */
    var note = $('aibCatalogNote');
    m('AIC 可靠性声明已在弹窗内', !!note && !!note.closest('#disclaimerModal'));
    m('AIC 声明内容已渲染', note && note.textContent.indexOf('规则推算') >= 0 &&
      note.textContent.indexOf('已修正') >= 0,
      note ? note.textContent.replace(/\\s+/g, ' ').slice(0, 50) : 'n/a');
    m('弹窗写明了老卡 / 二手的局限',
      $('dmBody') && $('dmBody').textContent.indexOf('已停产') >= 0 &&
      $('dmBody').textContent.indexOf('二手') >= 0);

    /* 关闭路径 */
    m('弹窗关闭按钮存在', !!$('dmClose'));
    $('dmClose').click();
    m('点关闭后弹窗隐藏', md.hidden === true);
    m('关闭后恢复页面滚动', !document.body.classList.contains('modal-open'));
    m('关闭后仍可从顶栏重开', !!$('btnDisclaimer'));
    $('btnDisclaimer').click();
    m('顶栏「数据声明」可重新打开', md.hidden === false);

    /* 遮罩点击关闭 */
    md.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    m('点遮罩关闭弹窗', md.hidden === true);

    /* 勾了「不再提示」才写入 localStorage */
    $('btnDisclaimer').click();
    m('重开后「不再提示」默认未勾选', $('dmNever').checked === false);
    $('dmNever').checked = true;
    $('dmOk').click();
    var stored = null;
    try { stored = localStorage.getItem('psu-calc-2026-v1-disclaimer'); } catch (e) {}
    m('勾选「不再提示」后记住了当前数据版本', stored === (window.HWDB.meta.version),
      String(stored) + ' vs ' + window.HWDB.meta.version);

    /* 其余用例都会带 ?nodisclaimer=1，验证抑制开关本身有效 */
    m('window.__PSU_DISCLAIMER__ 调试接口已暴露',
      !!window.__PSU_DISCLAIMER__ && typeof window.__PSU_DISCLAIMER__.open === 'function');
  } catch (e) {
    window.__M.push('FAIL | 弹窗用例抛异常 | ' + e.message);
  }
  var p = document.createElement('pre');
  p.id = 'MODAL_RESULT';
  p.textContent = window.__M.join('\\n');
  document.body.appendChild(p);
}, 900);
<\/script>`;
  fs.writeFileSync(probe, fs.readFileSync(SRC, 'utf8').replace('</body>', inject + '</body>'), 'utf8');

  let dom = '';
  try {
    dom = execFileSync(edge, [
      '--headless=new', '--disable-gpu', '--no-sandbox', ...PROFILE_ARGS,
      '--virtual-time-budget=9000', '--dump-dom',
      'file:///' + probe.replace(/\\/g, '/') + '?noanim=1'
    ], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    console.log('  \u2717 渲染失败: ' + e.message.slice(0, 60));
    dmFail++;
  }
  fs.unlinkSync(probe);

  const mm = /<pre id="MODAL_RESULT">([\s\S]*?)<\/pre>/.exec(dom);
  if (!mm) { console.log('  \u2717 未取到弹窗测试结果'); dmFail++; }
  else {
    for (const l of mm[1].trim().split(/\r?\n/)) {
      if (l.startsWith('PASS')) console.log('  \u2713 ' + l.slice(7));
      else if (l.startsWith('FAIL')) { dmFail++; console.log('  \u2717 ' + l.slice(7)); }
    }
  }
  console.log('\n  声明弹窗检查: ' + (dmFail ? dmFail + ' 项未通过' : '全部通过'));
}

/* ==========================================================================
 *  品牌标志与样式表完整性
 * ----------------------------------------------------------------------------
 *  为什么单独立一段：改版时踩了一个「样式表被静默截断」的坑 ——
 *  404 页 `<style>` 里某条声明让 CSS 解析器把后面的规则全吞了，
 *  表现是「标志变成一块红矩形 + 按钮掉回浏览器默认样式」。
 *  这种失败**不会报错**，只能靠「后面那条规则到底生效没有」来发现。
 *  所以这里同时钉住两件事：
 *    · ROG 之眼确实渲染出来了（mask 生效 / 图片加载成功，不是一块实心方块）
 *    · 样式表尾部的规则仍然生效（解析没有被截断）
 * ========================================================================*/
console.log('\n品牌标志与样式表完整性检查');
console.log('\u2500'.repeat(56));

let logoFail = 0;
{
  /* ---- 1. 首页：mask 版标志 + 样式表完整性 ---- */
  const probe = path.join(root, '_probe-logo.html');
  const inject = `
<pre id="L">x</pre>
<script>
var out = [];
try {
  var total = 0;
  for (var i = 0; i < document.styleSheets.length; i++) {
    try { total += document.styleSheets[i].cssRules.length; } catch (e) {}
  }
  out.push('RULES=' + total);

  var mark = document.querySelector('.logo .mark');
  if (!mark) { out.push('MARK=missing'); }
  else {
    var cs = getComputedStyle(mark);
    var mi = cs.maskImage || cs.webkitMaskImage || 'none';
    out.push('MARK_MASK=' + (mi.indexOf('none') === 0 ? 'none' : 'set'));
    out.push('MARK_BG=' + cs.backgroundColor);
    var r = mark.getBoundingClientRect();
    out.push('MARK_SIZE=' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  /* 字标：官方 REPUBLIC OF GAMERS 图形。窄屏会被隐藏，这里在宽视口下断言它可见 */
  var wm = document.querySelector('.logo .wordmark');
  if (!wm) { out.push('WORDMARK=missing'); }
  else {
    var ws = getComputedStyle(wm);
    var wi = ws.maskImage || ws.webkitMaskImage || 'none';
    out.push('WORDMARK_MASK=' + (wi.indexOf('none') === 0 ? 'none' : 'set'));
    var wr = wm.getBoundingClientRect();
    out.push('WORDMARK_SIZE=' + Math.round(wr.width) + 'x' + Math.round(wr.height));
    /* 字标是细笔画定制字形，太小就糊了 —— 这里钉住最小可读宽度 */
    out.push('WORDMARK_W=' + Math.round(wr.width));
  }
  /* mask 图能否真的取到：用 Image 探一次（mask 加载失败不抛错，只能主动探） */
  window.__maskProbe = 'pending';
  window.__wmProbe = 'pending';
  function probeMask(sel, slot) {
    var el = document.querySelector(sel);
    if (!el) return;
    var u = (getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage || '')
      .replace(/^url\\(["']?/, '').replace(/["']?\\)$/, '');
    if (!u || u === 'none') return;
    var im = new Image();
    im.onload = function () { window[slot] = 'ok:' + im.naturalWidth + 'x' + im.naturalHeight; };
    im.onerror = function () { window[slot] = 'fail'; };
    im.src = u;
  }
  probeMask('.modal-head .mark', '__maskProbe');
  probeMask('.modal-head .wordmark', '__wmProbe');

  /* 样式表尾部规则是否还活着：挑几条位于文件末尾的规则来验 */
  out.push('MODAL_BACKDROP=' + getComputedStyle(document.getElementById('disclaimerModal')).position);
  out.push('TOAST=' + getComputedStyle(document.getElementById('toast')).position);
  out.push('PRINT_RULE=' + [].some.call(document.styleSheets, function (s) {
    try { return [].some.call(s.cssRules, function (r) { return r.type === 4; }); } catch (e) { return false; }
  }));
} catch (e) { out.push('ERR=' + e.message); }
setTimeout(function () {
  out.push('MASK_PROBE=' + window.__maskProbe);
  out.push('WM_PROBE=' + window.__wmProbe);
  document.getElementById('L').textContent = out.join('\\n');
}, 600);
<\/script>`;
  fs.writeFileSync(probe, fs.readFileSync(SRC, 'utf8').replace('</body>', inject + '</body>'), 'utf8');

  let dom = '';
  try {
    dom = execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--allow-file-access-from-files', ...PROFILE_ARGS,
      '--virtual-time-budget=9000', '--dump-dom',
      'file:///' + probe.replace(/\\/g, '/') + '?nodisclaimer=1&noanim=1'],
      { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { console.log('  \u2717 渲染失败: ' + e.message.slice(0, 60)); logoFail++; }
  fs.unlinkSync(probe);

  const mm = /<pre id="L">([\s\S]*?)<\/pre>/.exec(dom);
  const val = k => {
    if (!mm) return '';
    const l = mm[1].split(/\r?\n/).find(x => x.startsWith(k + '='));
    return l ? l.slice(k.length + 1).trim() : '';
  };
  const chk = (label, ok, extra) => {
    if (!ok) logoFail++;
    console.log('  ' + (ok ? '\u2713' : '\u2717') + ' ' + label + (extra ? '  [' + extra + ']' : ''));
  };

  const rules = parseInt(val('RULES'), 10) || 0;
  /* 230 是当前值。给一点余量，但不能低太多 ——
     低于这个量级基本就是样式表被从中间截断了。 */
  chk('首页样式表解析完整（未被静默截断）', rules >= 200, rules + ' 条规则');
  chk('顶栏标志是用官方之眼图形 + CSS mask 上色',
    val('MARK_MASK') === 'set' && val('MARK_BG') !== 'rgba(0, 0, 0, 0)',
    'mask=' + val('MARK_MASK') + ' bg=' + val('MARK_BG'));
  chk('顶栏标志尺寸正常（没有被 mask 撑成一整块）',
    /^\d+x\d+$/.test(val('MARK_SIZE')) && parseInt(val('MARK_SIZE'), 10) > 0, val('MARK_SIZE'));
  chk('Rog 字标 REPUBLIC OF GAMERS 已渲染',
    val('WORDMARK_MASK') === 'set', val('WORDMARK_MASK') + ' ' + val('WORDMARK_SIZE'));
  /* 字标是细笔画定制字形，低于 120px 就开始糊 —— 顶栏里必须给它足够宽度 */
  chk('字标宽度足够看清定制字形（≥120px）',
    (parseInt(val('WORDMARK_W'), 10) || 0) >= 120, val('WORDMARK_W') + 'px');
  chk('标志图形文件能真正被取到（不是死引用）',
    val('MASK_PROBE').indexOf('ok:') === 0, val('MASK_PROBE'));
  chk('字标图形文件能真正被取到（不是死引用）',
    val('WM_PROBE').indexOf('ok:') === 0, val('WM_PROBE'));
  chk('样式表尾部规则仍生效（弹窗遮罩是 fixed）', val('MODAL_BACKDROP') === 'fixed', val('MODAL_BACKDROP'));
  chk('样式表尾部规则仍生效（toast 是 fixed）', val('TOAST') === 'fixed', val('TOAST'));
  chk('@media print 规则仍存在', val('PRINT_RULE') === 'true');

  /* ---- 2. 404 页：标志图片 + 尾部规则 ---- */
  const p404 = path.join(root, '_probe-404.html');
  fs.writeFileSync(p404, fs.readFileSync(path.join(root, '404.html'), 'utf8').replace('</body>', `
<pre id="L">x</pre><script>
setTimeout(function () {
  var o = [];
  /* 404 页显示的是官方纵向锁定版：图形在上、字标在下，两张图都要真的加载出来 */
  var imgs = document.querySelectorAll('.lockup img');
  o.push('IMG_COUNT=' + imgs.length);
  var okAll = imgs.length === 2, sizes = [];
  for (var i = 0; i < imgs.length; i++) {
    var im = imgs[i];
    var ok = im.complete && im.naturalWidth > 0;
    if (!ok) okAll = false;
    sizes.push((im.className || '?') + '=' + (ok ? im.naturalWidth + 'x' + im.naturalHeight : 'BROKEN'));
  }
  o.push('IMG_OK=' + okAll);
  o.push('IMG_SIZES=' + sizes.join(' '));
  o.push('IMG_ALT_ALL=' + [].every.call(imgs, function (im) {
    return (im.getAttribute('alt') || '').length > 0;
  }));
  var a = document.querySelector('a.home');
  o.push('LINK_BG=' + getComputedStyle(a).backgroundColor);
  o.push('LINK_DECOR=' + getComputedStyle(a).textDecorationLine);
  o.push('LINK_HREF=' + a.getAttribute('href'));
  o.push('RULES=' + document.styleSheets[0].cssRules.length);
  document.getElementById('L').textContent = o.join('\\n');
}, 500);
<\/script></body>`), 'utf8');

  let d404 = '';
  try {
    d404 = execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox', ...PROFILE_ARGS,
      '--virtual-time-budget=6000', '--dump-dom',
      'file:///' + p404.replace(/\\/g, '/')],
      { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { console.log('  \u2717 404 页渲染失败: ' + e.message.slice(0, 50)); logoFail++; }
  fs.unlinkSync(p404);

  const m4 = /<pre id="L">([\s\S]*?)<\/pre>/.exec(d404);
  const v4 = k => {
    if (!m4) return '';
    const l = m4[1].split(/\r?\n/).find(x => x.startsWith(k + '='));
    return l ? l.slice(k.length + 1).trim() : '';
  };
  const chk4 = (label, ok, extra) => {
    if (!ok) logoFail++;
    console.log('  ' + (ok ? '\u2713' : '\u2717') + ' ' + label + (extra ? '  [' + extra + ']' : ''));
  };

  chk4('404 页显示官方纵向锁定版（图形 + 字标两张图）',
    v4('IMG_COUNT') === '2', v4('IMG_COUNT') + ' 张');
  chk4('404 页两张图都真的加载出来了（不是 alt 文字 / 也不是一块实心红）',
    v4('IMG_OK') === 'true', v4('IMG_SIZES'));
  chk4('404 页标志都带无障碍名称', v4('IMG_ALT_ALL') === 'true');
  chk4('404 页尾部的按钮样式生效（样式表没被截断）',
    v4('LINK_BG') === 'rgb(255, 0, 51)' && v4('LINK_DECOR') === 'none',
    v4('LINK_BG') + ' / ' + v4('LINK_DECOR'));
  /* 本站是 GitHub Pages 的「项目子路径站点」（/‑/）。
     根绝对的 "/" 会跳到账号根 https://<user>.github.io/ —— 那是另一个地方；
     相对路径又会随出错地址的深度乱跑。只有带项目名的绝对路径是对的。 */
  chk4('404 页「回到首页」指向项目根 /-/（不是账号根 /）',
    v4('LINK_HREF') === '/-/', v4('LINK_HREF'));
  /* 404 页的样式表规则数是固定的（少了就是被截断） */
  chk4('404 页样式表规则齐全', (parseInt(v4('RULES'), 10) || 0) >= 11, v4('RULES') + ' 条');

  console.log('\n  标志与样式表检查: ' + (logoFail ? logoFail + ' 项未通过' : '全部通过'));
}

console.log('');
process.exit((fail || saFail || deployFail || mobFail || layFail || dmFail || logoFail) ? 1 : 0);
