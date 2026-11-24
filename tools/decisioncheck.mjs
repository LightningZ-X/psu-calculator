/* 方案管理、搜索、升级模拟与输入焦点的浏览器回归。隔离 profile，不接触用户存档。 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edge = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));
if (!edge) throw new Error('未找到 Edge / Chrome，请设置 CHROME_PATH');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psu-decision-'));
const tmp = path.join(root, '_decisioncheck.html');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tests = String.raw`
<script>
setTimeout(async function () {
  var results = [], $ = function (id) { return document.getElementById(id); };
  function t(name, ok) { results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name); }
  function set(id, value, event) { $(id).value = value; $(id).dispatchEvent(new Event(event || 'change', { bubbles: true })); }
  function click(id) { $(id).click(); }
  var dbg = window.__PSU_DEBUG;
  try {
    t('首访不自动选入方案或硬件', dbg.plans().length === 0 && !dbg.result().hasSelection);
    document.querySelector('#calcMode [data-mode="quick"]').click();
    t('空配置快速模式不生成默认部件', !dbg.result().hasSelection && dbg.result().assumptions.length === 0);
    set('hardwareSearch', '9600x', 'input');
    t('搜索跨品牌匹配 AMD 型号', $('hardwareResults').textContent.includes('9600X'));
    document.querySelector('#hardwareResults button').click();
    t('搜索选入 CPU，未误选显卡', dbg.state.cpuId === 'r5-9600x' && !dbg.result().canRecommend);
    document.querySelector('#gpuBrand [data-b="__igpu__"]').click();
    t('快速模式补入明示默认值', dbg.result().assumptions.length === 5 && dbg.result().subtotal === 150);
    set('psuSelect', 'deepcool-pl650d-v2');
    t('已核型号展示线缆300W及厂家来源', $('psuInfo').textContent.includes('300 W') && $('psuInfo').textContent.includes('2026-10-04') && $('psuInfo').querySelector('a').href.includes('deepcool.com'));
    set('psuSelect', 'greatwall-x4-550');
    t('待核型号显示未知接头且不判定可复用', $('psuInfo').textContent.includes('具体规格待核实') && !$('psuInfo').textContent.includes('0 个') && dbg.result().existingPsu.reusable == null);
    t('推荐排除待核型号，卡片注明预算估值', dbg.result().picks.list.every(p => p.verified) && $('psuPicks').textContent.includes('预算估值') && $('psuPicks').textContent.includes('非报价'));
    var psuRows = dbg.buildReportRows();
    t('CSV无16-pin款不导出孤立W字符', psuRows.some(row => row[0] === '性价比之选' && row[11] === '无16-pin线缆'));
    t('CSV保留核对日期与厂家链接', psuRows.some(row => row[0] === '性价比之选' && row[13] === '2026-10-04' && row[14].startsWith('https://')));
    set('searchCategory', 'aib'); set('hardwareSearch', '5090 夜神', 'input');
    t('板型搜索支持型号和中文名多词组合', $('hardwareResults').textContent.includes('Astral'));
    set('searchCategory', 'psu'); set('hardwareSearch', 'GX-650', 'input');
    document.querySelector('#hardwareResults button').click();
    t('电源搜索选入原电源', dbg.state.psuId === 'seasonic-focus-gx650');
    set('planName', '原配置 <b>测试</b>', 'input'); click('savePlan');
    var baseId = $('savedPlan').value, savedPower = dbg.result().subtotal;
    t('保存快照并转义方案名称', dbg.plans().length === 1 && !$('savedPlan').querySelector('b'));
    var snap = JSON.stringify(dbg.plans()[0].state), current = JSON.stringify(dbg.state);
    set('upgradeGpu', 'rtx5090');
    t('升级模拟不改编辑区或保存快照', JSON.stringify(dbg.state) === current && JSON.stringify(dbg.plans()[0].state) === snap);
    t('升级模拟识别旧电源不满足要求', $('compareOutput').textContent.includes('原电源不满足'));
    click('applyUpgrade');
    t('主动载入升级方案才更换显卡', dbg.state.gpuId === 'rtx5090' && dbg.result().subtotal > savedPower);
    set('planName', '升级方案', 'input'); click('savePlan');
    var targetId = $('savedPlan').value;
    set('compareBase', baseId); set('compareTarget', targetId);
    t('两个已存方案可对比功耗变化', $('compareOutput').textContent.includes('+575 W'));
    set('savedPlan', baseId); click('loadPlan');
    t('载入方案完整恢复模式与电源', dbg.state.mode === 'quick' && dbg.state.gpuId === '__igpu__' && dbg.state.psuId === 'seasonic-focus-gx650');
    set('planName', '原电脑', 'input'); click('renamePlan');
    t('重命名不更改硬件快照', dbg.plans().find(p => p.id === baseId).name === '原电脑' && JSON.stringify(dbg.plans().find(p => p.id === baseId).state) === snap);
    click('deletePlan'); t('删除方案保留编辑区', dbg.plans().length === 1 && dbg.state.cpuId === 'r5-9600x');
    click('undoPlanDelete'); t('可撤销删除', dbg.plans().length === 2);
    set('savedPlan', baseId); set('planName', '更新原电脑', 'input'); click('updatePlan');
    t('显式更新不会复制方案', dbg.plans().length === 2 && dbg.plans().find(p => p.id === baseId).name === '更新原电脑');
    var setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('quota'); };
    set('planName', '不能保存', 'input'); click('savePlan');
    t('保存失败不伪装成功且不更改方案库', dbg.plans().length === 2 && $('planStatus').textContent.includes('未保存'));
    Storage.prototype.setItem = setItem;
    document.querySelector('#calcMode [data-mode="full"]').click();
    click('addCustomItem');
    var input = document.querySelector('#customItems [data-cl]'); input.focus();
    input.value = '采'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    input.value = '采集卡'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
    t('中文连续输入保留节点与焦点', document.activeElement === input && input.isConnected && dbg.state.customItems[0].label === '采集卡');
    input.blur(); click('addStorage');
    var qty = document.querySelector('#storageList .s-qty'); qty.focus(); qty.value = '7'; qty.dispatchEvent(new Event('input', { bubbles: true }));
    t('存储数量输入不重建焦点节点', qty.isConnected && document.activeElement === qty && dbg.state.storage[0].qty === 7);
    [['99', 8], ['', 1], ['2.6', 3]].forEach(function (pair) {
      qty.focus(); qty.value = pair[0]; qty.dispatchEvent(new Event('input', { bubbles: true })); qty.blur();
      var stored = JSON.parse(localStorage.getItem('psu-calc-2026-v1') || 'null');
      t('数量失焦校正 ' + JSON.stringify(pair[0]), qty.isConnected && qty.value === String(pair[1]) &&
        dbg.state.storage[0].qty === pair[1] && stored.s.storage[0].qty === pair[1] && dbg.result().items.some(it => it.name.endsWith('×' + pair[1])));
    });
    qty.blur(); document.querySelector('#storageList .del').click();
    t('移除存储立即更新列表', dbg.state.storage.length === 0 && !document.querySelector('#storageList .s-qty'));
    dbg.applyPreset('flagship');
    var cpuW = dbg.result().cpuWatts;
    $('gpuOc').checked = true; $('gpuOc').dispatchEvent(new Event('change', { bubbles: true }));
    t('界面只开显卡超频不影响 CPU', dbg.result().cpuWatts === cpuW);
    $('gpuOc').checked = false; $('gpuOc').dispatchEvent(new Event('change', { bubbles: true }));
    var gW = dbg.result().gpuWatts;
    $('cpuOc').checked = true; $('cpuOc').dispatchEvent(new Event('change', { bubbles: true }));
    t('界面只开 CPU 超频不影响显卡', dbg.result().gpuWatts === gW);
    set('cpuCustomW', '65', 'input');
    t('自定义 CPU 功耗在信息与结果中一致', dbg.result().cpuWatts === 65 && $('cpuInfo').textContent.includes('65 W'));
    var sameCpu = dbg.state.cpuId;
    set('cpuSelect', sameCpu);
    t('下拉重选同型号保留自定义功耗与超频', dbg.state.cpuCustomW === '65' && dbg.state.cpuOc);
    set('searchCategory', 'cpu'); set('hardwareSearch', '9950x3d2', 'input');
    document.querySelector('#hardwareResults button').click();
    t('搜索换 CPU 清除旧功耗墙和超频并同步输入框', dbg.state.cpuId === 'r9-9950x3d2' && !dbg.state.cpuCustomW && !dbg.state.cpuOc &&
      $('cpuCustomW').value === '' && !$('cpuOc').checked && dbg.result().cpuWatts === HWDB.cpus.find(c => c.id === 'r9-9950x3d2').maxTurbo);
    set('cpuCustomW', '65', 'input'); $('cpuOc').checked = true; $('cpuOc').dispatchEvent(new Event('change'));
    set('hardwareSearch', '9950x3d2', 'input'); document.querySelector('#hardwareResults button').click();
    t('搜索重选同型号保留设置', dbg.state.cpuCustomW === '65' && dbg.state.cpuOc);
    set('savedPlan', baseId); click('updatePlan');
    set('cpuSelect', 'r5-9600x');
    t('下拉换 CPU 清除旧功耗墙和超频', !dbg.state.cpuCustomW && !dbg.state.cpuOc && dbg.result().cpuWatts !== 65);
    click('loadPlan');
    t('载入方案仍完整恢复功耗墙与超频', dbg.state.cpuCustomW === '65' && dbg.state.cpuOc && dbg.result().cpuWatts === 65 && $('cpuCustomW').value === '65' && $('cpuOc').checked);
    dbg.applyPreset('office');
    set('gpuCustomName', '自定义显卡', 'input'); set('gpuCustomW', '300', 'input'); set('psuSelect', 'msi-mag-a650gl');
    set('compareBase', ''); set('compareTarget', '');
    t('自定义显卡的已有电源与对比结论均不确认复用', dbg.result().existingPsu.reusable === null && $('psuInfo').textContent.includes('显卡接口尚未核实') && $('compareOutput').textContent.includes('显卡接口尚未核实'));
    t('自定义显卡的主推荐与完整候选注明接口待核', $('psuPicks').textContent.includes('显卡接口需核实') && $('allPsuCandidates').textContent.includes('显卡接口需核实'));
    var blobs = [], originalCreate = URL.createObjectURL, originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    URL.createObjectURL = function (b) { blobs.push(b); return originalCreate.call(URL, b); };
    click('backupPlans'); var backup = JSON.parse(await blobs[0].text());
    t('备份包含全部方案和可重新计算的状态', backup.schema === 1 && backup.plans.length === 2 && backup.plans[0].state.cpuId);
    URL.createObjectURL = originalCreate;
    HTMLAnchorElement.prototype.click = originalClick;
    var beforeImport = JSON.stringify(dbg.state);
    async function importObject(obj) {
      var transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(obj)], '配置.json', { type: 'application/json' }));
      await new Promise(function (resolve) {
        var observer = new MutationObserver(function () { observer.disconnect(); resolve(); });
        observer.observe($('planStatus'), { childList: true, subtree: true });
        $('planImportFile').files = transfer.files; $('planImportFile').dispatchEvent(new Event('change'));
      });
    }
    await importObject({ dbVersion: '2025.01', exportedAt: '2025-01-01T00:00:00Z', config: { cpuId: 'r5-9600x', gpuId: '__igpu__', mode: 'constructor', fanQty: 1e9, customItems: [{ label: '<img src=x onerror="alert(1)">', watts: 'bad' }] } });
    t('导入净化枚举与数值，不修改当前编辑区', dbg.plans().length === 3 && dbg.plans()[2].state.mode === 'full' && dbg.plans()[2].state.fanQty === 30 && JSON.stringify(dbg.state) === beforeImport);
    t('导入保留原数据版本与保存日期', dbg.plans()[2].dbVersion === '2025.01' && dbg.plans()[2].updatedAt.startsWith('2025-01-01'));
    await importObject({ result: { subtotal: 123 } });
    t('无效导入不损坏已有方案', dbg.plans().length === 3 && $('planStatus').textContent.includes('导入失败'));
    var tooMany = { plans: Array.from({ length: 12 }, () => ({ name: 'x', state: backup.plans[0].state })) };
    await importObject(tooMany);
    t('超量导入明确拒绝而非静默截断', dbg.plans().length === 3 && $('planStatus').textContent.includes('12'));
    var report = dbg.buildReportRows().flat().join(' ');
    t('CSV 报告包括区间与假设口径', report.includes('场景功耗区间（部件侧）') && report.includes('工程假设'));
    t('候选按接口要求完整过滤', dbg.result().picks.list.every(p => p.conn12v2x6 >= dbg.result().picks.need12Count));
    var transientButton = document.createElement('button'); document.body.appendChild(transientButton);
    transientButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    var pressedAnimations = transientButton.getAnimations().length;
    transientButton.remove(); document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    // 云端 Windows 的无障碍设置可能禁用动画；此时应从一开始就没有动画。
    // 普通模式仍要求先有一个按压动画，移除后两种模式都必须完全清理。
    var motionSuppressed = matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden || matchMedia('print').matches;
    t('按压过程中移除按钮会清理受管动画（尊重减少动画设置）', pressedAnimations === (motionSuppressed ? 0 : 1) && transientButton.getAnimations().length === 0);
    t('无捕获异常', (window.__PSU_ERRORS || []).length === 0);
    dbg.applyPreset('office'); set('planName', '恢复验证', 'input'); click('savePlan');
  } catch (e) { results.push('FAIL | 自检异常：' + e.message + ' @ ' + e.stack); }
  var pre = document.createElement('pre'); pre.id = 'DECISION_RESULT'; pre.textContent = results.join('\n'); document.body.appendChild(pre);
}, 600);
</script>`;
const restore = String.raw`<script>setTimeout(function () {
  var d = window.__PSU_DEBUG, results = [];
  results.push((d.plans().length === 4 ? 'PASS' : 'FAIL') + ' | 刷新后方案库从存档恢复');
  results.push((d.state.scenario === 'office' && d.result().canRecommend ? 'PASS' : 'FAIL') + ' | 不带配置链接也恢复当前编辑区');
  var p = document.createElement('pre'); p.id = 'DECISION_RESULT'; p.textContent = results.join('\n'); document.body.appendChild(p);
}, 600);</script>`;
let failed = 0, count = 0;
function run(test) {
  fs.writeFileSync(tmp, source.replace('<head>', '<head><script>window.__PSU_NOANIM=true;window.__PSU_NODISCLAIMER=true;</script>').replace('</body>', test + '</body>'));
  const dom = execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--user-data-dir=' + profile, '--virtual-time-budget=7000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/') + '?nodisclaimer=1&noanim=1'],
    { encoding: 'utf8', timeout: 25000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const match = /<pre id="DECISION_RESULT">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) { failed++; console.error('FAIL | 浏览器未产生自检结果'); return; }
  const lines = match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').split('\n');
  for (const line of lines) { count++; if (line.startsWith('FAIL')) failed++; console.log(line); }
}
try { run(tests); run(restore); }
finally {
  fs.rmSync(tmp, { force: true });
  const target = path.resolve(profile), parent = path.resolve(os.tmpdir()) + path.sep;
  if (target.startsWith(parent) && path.basename(target).startsWith('psu-decision-')) {
    try { fs.rmSync(target, { recursive: true, force: true }); } catch {}
  }
}
console.log('方案 C 浏览器回归：' + (count - failed) + ' / ' + count + ' 通过');
process.exit(failed ? 1 : 0);
