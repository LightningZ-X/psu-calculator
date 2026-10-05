/* ============================================================================
 *  PSUEngine 自测脚本 (Node >= 18)
 *  运行:  node tools/selftest.mjs
 * ==========================================================================*/
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const HWDB = require(path.join(__dirname, '..', 'js', 'db.js'));
const engine = require(path.join(__dirname, '..', 'js', 'engine.js'));

let pass = 0, fail = 0;
const failures = [];

function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + label); }
  else {
    fail++;
    failures.push(label + (extra ? ' -> ' + extra : ''));
    console.log('  \u2717 ' + label + (extra ? '  [' + extra + ']' : ''));
  }
}
function section(t) { console.log('\n' + t); }
function codes(r) { return r.issues.map(i => i.code); }

/* ---------------------------------------------------- 1. 数据库完整性 --- */
section('1. 数据库完整性');
ok(HWDB.cpus.length >= 15, 'CPU 条目数 ' + HWDB.cpus.length + ' >= 15');
ok(HWDB.gpus.length >= 15, 'GPU 条目数 ' + HWDB.gpus.length + ' >= 15');
ok(HWDB.aibs.length >= 30, 'AIB 板型条目数 ' + HWDB.aibs.length + ' >= 30');
ok(HWDB.motherboards.length >= 15, '主板条目数 ' + HWDB.motherboards.length + ' >= 15');
ok(HWDB.psus.length >= 15, '电源条目数 ' + HWDB.psus.length + ' >= 15');

// 每个 AIB 必须挂到存在的 GPU 上
const gpuIds = new Set(HWDB.gpus.map(g => g.id));
const orphanAib = HWDB.aibs.filter(a => !gpuIds.has(a.gpuId));
ok(orphanAib.length === 0, '所有 AIB 板型都关联到有效 GPU', orphanAib.map(a => a.id).join(','));

// 所有 source 引用必须存在
const srcKeys = new Set(Object.keys(HWDB.sources));
const badSrc = [];
['cpus','gpus','aibs','motherboards','ram','storage','coolers','fans','cases','psus'].forEach(k => {
  HWDB[k].forEach(e => { if (e.source && !srcKeys.has(e.source)) badSrc.push(k + ':' + e.id + '->' + e.source); });
});
ok(badSrc.length === 0, '所有 source 引用有效', badSrc.join(','));

// 每个主板芯片组必须有平台映射
const platforms = new Set(Object.keys(HWDB.platforms));
const badSock = HWDB.motherboards.filter(m => !platforms.has(m.socket));
ok(badSock.length === 0, '所有主板插槽在 PLATFORMS 中有映射', badSock.map(m => m.id).join(','));

// 2026 新品必须在库
const mustHave = ['cu7-270kp', 'r9-9950x3d2', 'rtx5090', 'rtx5080super', 'rx9070xt'];
const allIds = new Set([...HWDB.cpus, ...HWDB.gpus].map(x => x.id));
mustHave.forEach(id => ok(allIds.has(id), '关键型号在库: ' + id));

// 已取消的型号不应在库
ok(!allIds.has('cu9-290kp') && !allIds.has('cu9-285ks'), '已取消型号 (290K Plus / 285KS) 未入库');

/* -------------------------------------------- 2. 高端游戏整机基准算例 --- */
section('2. 高端游戏整机 (270K Plus + ROG Astral 5090)');
const highEnd = {
  cpuId: 'cu7-270kp', gpuAibId: 'asus-astral-5090', moboId: 'asus-z890-hero',
  ramId: 'ddr5-7200-16x2-kf', ramKits: 1,
  storage: [{ id: 'ssd-9100pro-2t', qty: 1 }, { id: 'hdd-exos-20t', qty: 1 }],
  coolerId: 'aio-frozen-warframe-360', fanId: 'fan-tlc12cs', fanQty: 3,
  caseId: 'case-o11d-evo', scenario: 'gaming', overclock: false,
  argbChannels: 1, extras: { 'x-usb-dev': 4 }
};
const r1 = engine.calculate(highEnd);
console.log('    规划功耗=' + r1.subtotal + 'W  场景预期=' + r1.expected + 'W  瞬时峰值=' + r1.transient + 'W');
console.log('    推荐电源=' + r1.recFloor + '~' + r1.recIdeal + 'W  冗余=' + r1.redundancy);
console.log('    明细: ' + r1.items.map(i => i.label + ' ' + i.watts + 'W').join(' | '));
ok(r1.subtotal > 850 && r1.subtotal < 1050, '规划功耗在合理区间 (850-1050W)', r1.subtotal);
// 947.6W × 1.30 = 1231.9 -> 1300W 安全下限；× 1.40 = 1326.6 -> 1500W 推荐目标
ok(r1.recFloor === 1300, '安全下限 1300W（947.6 × 1.30 上取整）', r1.recFloor);
ok(r1.recIdeal === 1500, '推荐目标 1500W（947.6 × 1.40 上取整）', r1.recIdeal);
ok(r1.recIdeal >= r1.recFloor, '推荐目标不低于安全下限');
ok(r1.expected < r1.subtotal, '场景预期功耗低于规划功耗', r1.expected + ' < ' + r1.subtotal);
ok(r1.transient > r1.subtotal, '瞬时峰值高于规划功耗', r1.transient);
ok(r1.upgrade && r1.upgrade.maxGpu, '可给出升级路径建议');
ok(!r1.hasError, '高端游戏配置无兼容性错误', codes(r1).join(','));
ok(r1.picks.distinctCount >= 2, '三档推荐不是同一个型号（去重后 ' + r1.picks.distinctCount + ' 款）');
console.log('    升级建议: ' + (r1.upgrade ? r1.upgrade.maxGpu + ' | 余量 ' + r1.upgrade.headroomPct + '%' : '无'));
console.log('    推荐: 性价比=' + (r1.picks.value && r1.picks.value.model) +
            ' | 均衡=' + (r1.picks.balanced && r1.picks.balanced.model) +
            ' | 旗舰=' + (r1.picks.flagship && r1.picks.flagship.model));

/* ------------------------------------------------------ 3. 兼容性校验 --- */
section('3. 兼容性校验');
const mismatch = engine.calculate(Object.assign({}, highEnd, {
  cpuId: 'r9-9950x3d2', moboId: 'asus-z890-hero', gpuAibId: 'sapphire-nitro-9070xt'
}));
ok(codes(mismatch).includes('SOCKET_MISMATCH'), 'AMD CPU + Z890 主板 -> 插槽不兼容错误');
const socketIssue = mismatch.issues.find(i => i.code === 'SOCKET_MISMATCH');
ok(socketIssue && socketIssue.fix.includes('AM5'), '不兼容时给出 AM5 替代主板建议');
console.log('    ' + (socketIssue ? socketIssue.detail : ''));

const tooLong = engine.calculate(Object.assign({}, highEnd, { caseId: 'case-fractal-north' }));
ok(codes(tooLong).includes('GPU_TOO_LONG'), '5090 Astral(357.6mm) + North(355mm) -> 显卡超长错误');
console.log('    ' + (tooLong.issues.find(i => i.code === 'GPU_TOO_LONG') || {}).detail);

const itxPsu = engine.calculate(Object.assign({}, highEnd, {
  caseId: 'case-lianli-a4h2o', moboId: 'asus-b650e-i', coolerId: 'air-pa120-se', psuId: 'seasonic-prime-tx1300'
}));
ok(codes(itxPsu).includes('PSU_FORMFACTOR'), 'ITX 机箱 + ATX 电源 -> 电源规格不匹配');

const noM2 = engine.calculate(Object.assign({}, highEnd, {
  storage: [{ id: 'ssd-9100pro-2t', qty: 4 }], moboId: 'gigabyte-b860m-elite', gpuId: '', gpuAibId: ''
}));
ok(codes(noM2).includes('M2_NOT_ENOUGH'), '4 块 NVMe + B860M(3 个 M.2) -> 触发 M.2 插槽不足');
ok(codes(noM2).includes('M2_GEN5_LIMIT'), '4 块 Gen5 SSD + B860M(1 个 Gen5 槽) -> 提示降速运行');

const ramTooBig = engine.calculate(Object.assign({}, highEnd, { ramId: 'ddr5-cudimm-128x1', ramKits: 4 }));
ok(codes(ramTooBig).includes('RAM_SLOTS') || codes(ramTooBig).includes('RAM_CAPACITY'),
   '128GB×4 -> 触发内存插槽/容量校验');

const weakPsu = engine.calculate(Object.assign({}, highEnd, { psuId: 'seasonic-focus-gx850' }));
ok(codes(weakPsu).includes('PSU_TIGHT'), '5090 搭配 850W 电源 -> 提示余量不足');
ok(weakPsu.existingPsu && weakPsu.existingPsu.utilization > 100,
   '已有电源负载率计算正确', weakPsu.existingPsu && weakPsu.existingPsu.utilization + '%');

const amdPcie = engine.calculate(Object.assign({}, highEnd, {
  cpuId: 'r9-9950x3d2', moboId: 'asus-b650e-i', gpuAibId: 'powercolor-reddevil-9070xt', caseId: 'case-inwin-a5',
  psuId: 'seasonic-focus-gx650'
}));
ok(!codes(amdPcie).includes('PSU_PCIE_COUNT'),
   'Red Devil 需 3×8pin，电源正好 3 个 -> 不应报接口不足', '实际: ' + codes(amdPcie).join(','));

const amdPcieShort = engine.calculate(Object.assign({}, highEnd, {
  cpuId: 'r9-9950x3d2', moboId: 'asus-b850-plus', gpuAibId: 'powercolor-reddevil-9070xt',
  caseId: 'case-inwin-a5', psuId: 'seasonic-focus-gx650', scenario: 'gaming'
}));
console.log('    9070 XT Red Devil 整机规划功耗=' + amdPcieShort.subtotal + 'W  推荐=' +
            amdPcieShort.recFloor + '~' + amdPcieShort.recIdeal + 'W');
ok(amdPcieShort.subtotal > 500 && amdPcieShort.subtotal < 800,
   'AMD 中高端平台规划功耗合理', amdPcieShort.subtotal);
ok(!codes(amdPcieShort).includes('SOCKET_MISMATCH'), 'AM5 CPU + B850 主板 -> 插槽匹配');
ok(codes(amdPcieShort).includes('HIGH_TDP_CPU'), '9950X3D2 (TDP 200W) -> 提示平台功耗最高');

/* -------------------------------------------------- 4. 超频与未发布 ------ */
section('4. 超频 / 未发布硬件');
const ocCfg = Object.assign({}, highEnd, { overclock: true, scenario: 'extreme' });
const rOc = engine.calculate(ocCfg);
console.log('    超频后 规划功耗=' + rOc.subtotal + 'W  推荐=' + rOc.recMin + 'W  冗余=' + rOc.redundancy);
ok(rOc.subtotal > r1.subtotal, '超频后规划功耗上升', rOc.subtotal + ' > ' + r1.subtotal);
ok(rOc.redundancy >= 1.5, '超频后冗余系数 >= 1.50', rOc.redundancy);
ok(rOc.recMin >= r1.recMin, '超频后推荐瓦数不降低', rOc.recMin + ' >= ' + r1.recMin);
ok(codes(rOc).includes('OC_NOTICE'), '超频时给出提示');

const leakCfg = Object.assign({}, highEnd, { gpuAibId: 'asus-tuf-5080super' });
const rLeak = engine.calculate(leakCfg);
ok(codes(rLeak).includes('UNRELEASED'), '选用未发布的 5080 SUPER -> 明确标注未发布风险');
console.log('    ' + (rLeak.issues.find(i => i.code === 'UNRELEASED') || {}).detail);

const novaCfg = engine.calculate(Object.assign({}, highEnd, { cpuId: 'nova-lake-flagship' }));
ok(codes(novaCfg).includes('SOCKET_MISMATCH'), 'Nova Lake (LGA1954) + Z890 -> 插槽不兼容');
ok(codes(novaCfg).includes('UNRELEASED_PLATFORM'), '未发布平台有独立提示');

/* ---------------------------------------------------- 5. 未收录型号 ----- */
section('5. 未收录型号兜底');
const unknown = engine.calculate(Object.assign({}, highEnd, {
  cpuId: '', cpuName: '某未发布 CPU X1', cpuCustomWatts: 210,
  gpuAibId: '', gpuId: '', gpuName: '某未收录显卡 Y2', gpuCustomWatts: 480
}));
ok(codes(unknown).includes('UNKNOWN_MODEL'), '未收录型号 -> 提示按同类均值估算');
ok(unknown.subtotal > 0, '未收录型号仍能算出结果', unknown.subtotal + 'W');
console.log('    ' + (unknown.issues.find(i => i.code === 'UNKNOWN_MODEL') || {}).detail);

/* ---------------------------------------------------- 6. 低功耗与 iGPU --- */
section('6. 低功耗办公机 / 核显');
const office = engine.calculate({
  cpuId: 'r5-9600x', gpuId: '__igpu__', moboId: 'asus-b850-plus',
  ramId: 'ddr5-6000-16x2-kf', ramKits: 1, storage: [{ id: 'ssd-990pro-2t', qty: 1 }],
  coolerId: 'air-pa120-se', fanId: 'fan-nfa12x25', fanQty: 2, caseId: 'case-inwin-a5',
  scenario: 'office', overclock: false
});
console.log('    规划功耗=' + office.subtotal + 'W  推荐=' + office.recMin + 'W~' + office.recMax + 'W');
ok(office.subtotal < 200, '核显办公机规划功耗 < 200W', office.subtotal);
ok(office.recMin >= 450, '推荐瓦数不低于最小标准瓦数', office.recMin);
ok(!office.hasError, '办公配置无错误', codes(office).join(','));

/* ---------------------------------------------------- 7. 接口生态检查 --- */
section('7. 电源接口生态检查');
console.log('    5090 需要 12V-2x6: ' + engine.needs12v2x6('1× 12V-2x6 (16pin)'));
console.log('    Red Devil 需要 8pin 数: ' + engine.requiredPcie8pin('3× 8pin'));
ok(engine.needs12v2x6('1× 12V-2x6 (16pin)') === true, '识别 12V-2x6 接口');
ok(engine.needs12v2x6('2× 8pin') === false, '识别 8pin 接口');
ok(engine.requiredPcie8pin('3× 8pin') === 3, '解析 3× 8pin 数量');
ok(engine.requiredPcie8pin('1× 12V-2x6') === 0, '12V-2x6 不计入 8pin 数量');

const noNative = engine.calculate(Object.assign({}, highEnd, { psuId: 'msi-meg-ai1300p' }));
ok(codes(noNative).includes('PSU_NOT_ATX31'), 'ATX 3.0 电源 + 50 系显卡 -> 建议 ATX 3.1');
const idle12v = engine.calculate(Object.assign({}, highEnd, {
  gpuAibId: '', gpuId: 'rx9060xt', psuId: 'seasonic-prime-tx1300'
}));
ok(codes(idle12v).includes('PSU_12V2X6_IDLE'), '8pin 显卡 + 12V-2x6 电源 -> 提示接口闲置');

/* 板型 ID 失效（数据库升级后旧配置残留）必须回退而不是静默按 0W 计算 */
const stale = engine.calculate(Object.assign({}, highEnd, {
  gpuId: 'rtx5090', gpuAibId: 'aib-that-no-longer-exists'
}));
ok(codes(stale).includes('STALE_AIB'), '失效板型 ID -> 提示已回退到公版功耗');
ok(stale.gpuWatts === 575, '失效板型 ID -> 显卡按公版 575W 而非 0W 计算', stale.gpuWatts + 'W');
console.log('    ' + (stale.issues.find(i => i.code === 'STALE_AIB') || {}).detail);

/* ---------------------------------------------------- 8. 标准瓦数取整 --- */
section('8. 标准瓦数取整与容差');
[[100, 450], [450, 450], [451, 500], [660, 750], [1295, 1300], [1301, 1500]].forEach(([i, o]) => {
  ok(engine.roundUpStandard(i) === o, 'roundUpStandard(' + i + ') = ' + o, engine.roundUpStandard(i));
});
// 1% 容差：1606.6W 不应跳到 2000W（1600 → 2000 跨度 25%，跳档代价过大）
ok(engine.roundUpStandard(1606.6, 0.01) === 1600, '1% 容差：1606.6W -> 1600W 而非 2000W',
   engine.roundUpStandard(1606.6, 0.01));
ok(engine.roundUpStandard(1606.6) === 2000, '无容差时 1606.6W 仍严格取 2000W',
   engine.roundUpStandard(1606.6));
// 容差不得侵蚀 1.30 与 1.40 之间的档位差（7.7%）
ok(engine.roundUpStandard(1326.6, 0.01) === 1500, '容差不侵蚀 1.30/1.40 档位差',
   engine.roundUpStandard(1326.6, 0.01));

/* ---------------------------------------------------- 9. 预算建议引擎 --- */
section('9. 预算建议引擎');
const adv = engine.advise(highEnd, 30000);
ok(adv.tips.length >= 2, '给出 ' + adv.tips.length + ' 条建议');
adv.tips.forEach(t => console.log('    [' + t.level + '] ' + t.title));

/* ------------------------------------------------- 10. 空态语义（关键）-- */
section('10. 空态：绝不能谎报「全部匹配」');
const empty = engine.calculate({});
ok(empty.subtotal === 0, '空配置功耗为 0', empty.subtotal);
ok(empty.hasSelection === false, '空配置 hasSelection 为 false');
ok(empty.recMin === 0 && empty.recIdeal === 0,
   '空配置不给出任何推荐瓦数（原缺陷：roundUpStandard(0) 取到 450W）',
   empty.recMin + '~' + empty.recIdeal);
ok(!empty.picks.value && !empty.picks.balanced && !empty.picks.flagship,
   '空配置不推荐任何电源（原缺陷：会推 3 款「负载率 0%」的电源）');
ok(empty.picks.distinctCount === 0, '空配置推荐型号数为 0');
ok(empty.upgrade === null,
   '空配置不给出升级建议（原缺陷：会推荐「可升级到 RTX 4080 SUPER」）');
ok(empty.issues.length === 0, '空配置不产生 issues（交由 UI 走中性态）');
ok(empty.hasError === false, '空配置无错误');

// 只选了 CPU、没选显卡：这属于「有选择」，应当正常给推荐
const cpuOnly = engine.calculate({ cpuId: 'r5-9600x' });
ok(cpuOnly.hasSelection === true, '只选 CPU 也算已选择');
ok(cpuOnly.recIdeal === 0 && !cpuOnly.canRecommend, '只选 CPU 显示部分功耗，等待显卡选择后推荐', cpuOnly.recIdeal);
console.log('    空态：规划 0W，推荐 0 款电源，无升级建议，issues 为空');

/* ---------------------------------------------- 11. 民用级 CPU 全覆盖 -- */
section('11. 处理器覆盖率');
const bySocket = {};
HWDB.cpus.forEach(c => { bySocket[c.socket] = (bySocket[c.socket] || 0) + 1; });
console.log('    平台分布: ' + JSON.stringify(bySocket));
ok(bySocket.LGA1851 >= 14, 'LGA1851 (Core Ultra 200S / 200S Plus) >= 14 款', bySocket.LGA1851);
ok(bySocket.LGA1700 >= 50, 'LGA1700 (12/13/14 代) >= 50 款', bySocket.LGA1700);
ok(bySocket.LGA1200 >= 25, 'LGA1200 (10/11 代) >= 25 款', bySocket.LGA1200);
ok(bySocket.AM5 >= 25, 'AM5 >= 25 款', bySocket.AM5);
ok(bySocket.AM4 >= 30, 'AM4 >= 30 款', bySocket.AM4);
ok(HWDB.cpus.length >= 150, 'CPU 总数 >= 150', HWDB.cpus.length);

// 已上市平台的 CPU 必须能找到匹配主板，否则工具给出的是死配置
// （未发布平台如 LGA1954 暂无主板，这是有意为之：引擎会给出 SOCKET_MISMATCH + 未发布提示）
const moboSockets = new Set(HWDB.motherboards.map(m => m.socket));
const releasedSockets = new Set(HWDB.cpus.filter(c => c.released !== '待发布').map(c => c.socket));
const orphan = [...releasedSockets].filter(s => !moboSockets.has(s));
ok(orphan.length === 0, '每个已上市 CPU 平台都有配套主板可选', orphan.join(','));
ok(!moboSockets.has('LGA1954'),
   '未发布的 LGA1954 暂无主板（引擎会提示平台未发布，而非给出错误配置）');

// 每个 CPU 必须带来源与置信度
const badCpu = HWDB.cpus.filter(c => !c.source || !c.confidence || !c.socket || !c.name);
ok(badCpu.length === 0, '所有 CPU 条目字段完整', badCpu.map(c => c.id).join(','));
// 锁频型号不得给出高于 MTP 的超频建议值
const badLocked = HWDB.cpus.filter(c => c.unlocked === false && c.ocPeak > c.maxTurbo);
ok(badLocked.length === 0, '锁频 CPU 的 ocPeak 未超过 MTP', badLocked.map(c => c.id).join(','));

/* ------------------------------------------- 12. AIC 厂商 / 系列覆盖 -- */
section('12. AIC 厂商与系列覆盖');
const vendors = [...new Set(HWDB.aibs.map(a => a.vendor))];
console.log('    ' + vendors.length + ' 家厂商 / ' + HWDB.aibSeries.length + ' 个系列 / ' +
            HWDB.aibs.length + ' 个板型组合');
ok(vendors.length >= 20, 'AIC 厂商 >= 20 家', vendors.length);
ok(HWDB.aibSeries.length >= 60, 'AIC 系列 >= 60 个', HWDB.aibSeries.length);

// 需求点名的 Halo 系列必须存在（大小写不敏感）
const seriesNames = HWDB.aibSeries.map(s => (s.series + '|' + (s.cn || '')).toLowerCase());
[['Lightning Z', '闪电'], ['ROG Matrix', '骇客'], ['HOF OC Lab', '名人堂 OC Lab'],
 ['AORUS XTREME', '超级雕'], ['Red Devil', '红魔'], ['TOXIC', '毒药'], ['SUPRIM', '超龙'],
 ['GAMING TRIO', '魔龙'], ['VENTUS', '万图师'], ['Hellhound', '暗黑犬'], ['NITRO+', '超白金'],
 ['Taichi', '太极'], ['MERCURY', '海外版'], ['iCHILL X3', '冰龙 X3'], ['iCraft', '电竞之心'],
 ['Vulcan', '火神'], ['Neptune', '水神'], ['Battle-Ax', '战斧'], ['Metal Master', '金属大师']].forEach(([en, cn]) => {
  ok(seriesNames.some(s => s.indexOf((en + '|' + cn).toLowerCase()) === 0),
     '系列在库: ' + en + ' / ' + cn);
});

// 耕升中国区命名必须正确（曾误写为全球市场的 Phantom/Ghost/Python）
[['Glare', '炫光'], ['Taxue', '踏雪'], ['Wind', '追风']].forEach(([en, cn]) => {
  ok(seriesNames.some(s => s.indexOf((en + '|' + cn).toLowerCase()) === 0),
     '耕升中国区命名在库: ' + en + ' / ' + cn);
});
ok(!seriesNames.some(s => s.startsWith('phantom|幻影')), '已移除错误的耕升 Phantom/幻影 命名');
ok(!seriesNames.some(s => s.startsWith('python|蟒蛇')), '已移除错误的耕升 Python/蟒蛇 命名');

/* 中文名三态核实 —— 这是最容易被当成"官方名"传播的信息，单独锁死 */
const seriesById = {};
HWDB.aibSeries.forEach(s => { seriesById[s.id] = s; });
const cnOf = id => (seriesById[id] || {}).cn;
const typeOf = id => (seriesById[id] || {}).cnType;

ok(cnOf('asus-rog-astral') === '夜神', 'ROG Astral 官方中文名是「夜神」而非「星曜」',
   cnOf('asus-rog-astral'));
ok(typeOf('asus-rog-astral') === 'official', 'ROG Astral 中文名标记为官方');
ok(cnOf('msi-inspire') === '硬派师', 'MSI INSPIRE 官方中文名是「硬派师」', cnOf('msi-inspire'));
ok(cnOf('msi-vanguard') === '神龙', 'MSI VANGUARD（神龙）已补入库', cnOf('msi-vanguard'));
ok(cnOf('msi-shadow') === '幻影师', 'MSI SHADOW（幻影师）已补入库', cnOf('msi-shadow'));
ok(!cnOf('asus-dual') && !cnOf('asus-turbo'),
   'ASUS DUAL / TURBO 已清空臆造的中文名', cnOf('asus-dual') + '/' + cnOf('asus-turbo'));

// 技嘉：gigabyte.cn 无中文系列名，全部只能标"俗称"
['gigabyte-aorus-xtreme', 'gigabyte-aorus-master', 'gigabyte-aorus-elite',
 'gigabyte-gaming-oc', 'gigabyte-eagle', 'gigabyte-windforce'].forEach(id => {
  ok(typeOf(id) === 'colloquial', id + ' 中文名已标记为玩家俗称', typeOf(id));
});
// 未核实的系列必须标 unverified，不能默认当官方名
ok(typeOf('galax-hof') === 'unverified', '未核实的系列标记为 unverified', typeOf('galax-hof'));
ok(HWDB.aibSeries.filter(s => s.cnType === 'official').length >= 14,
   '官方中文名数量 >= 14',
   HWDB.aibSeries.filter(s => s.cnType === 'official').length);
// 展示串必须体现三态
const lzSeries = HWDB.aibs.find(a => a.id === 'msi-lightning-z-5090');
ok(lzSeries && lzSeries.cnLabel === '（闪电）', '官方名展示串不带额外标记', lzSeries && lzSeries.cnLabel);
const hofAib = HWDB.aibs.find(a => a.series === 'HOF');
ok(hofAib && hofAib.cnLabel.indexOf('未核实') > 0, '未核实的中文名带「未核实」标记',
   hofAib && hofAib.cnLabel);

// MSI 不做 Radeon RX 9000，不应生成 MSI 的 AMD 显卡板型
ok(!HWDB.aibs.some(a => a.vendor === '微星 MSI' && a.gpuId === 'rx9070xt'),
   'MSI 未生成 Radeon RX 9000 板型（MSI 不做该系列）');

/* 显卡型号覆盖范围核实 —— 系列不能覆盖它并不生产的型号 */
const coversOf = seriesName => HWDB.aibs.filter(a => a.series === seriesName)
  .map(a => a.gpuId).sort();
ok(coversOf('Lightning Z').join(',') === 'rtx5090',
   '微星闪电只覆盖 RTX 5090（官方仅一个 SKU）', coversOf('Lightning Z').join(','));
ok(coversOf('Noctua Edition').join(',') === 'rtx5080',
   '华硕 Noctua Edition 只覆盖 RTX 5080', coversOf('Noctua Edition').join(','));
ok(coversOf('ROG Matrix').join(',') === 'rtx5090',
   'ROG Matrix 只覆盖 RTX 5090', coversOf('ROG Matrix').join(','));
const xtreme = HWDB.aibSeries.find(s => s.id === 'gigabyte-aorus-xtreme');
ok(xtreme && xtreme.liquid === true, '技嘉 AORUS XTREME 已按 WATERFORCE 水冷建模');
ok(!HWDB.aibSeries.some(s => s.series === 'AI TOP'),
   '技嘉 AI TOP 已移除（实为 AMD Radeon AI PRO R9700 工作站卡，不在消费级库内）');
ok(HWDB.aibSeries.some(s => s.series === 'AERO' && s.vendor === '技嘉 GIGABYTE'),
   '技嘉 AERO 系列已补入');

/* ------------- 华擎 ASRock：覆盖型号已按官网型号表逐条核实 ------------- */
section('12b. 华擎 ASRock 覆盖型号（官网核实）');
const asrockCovers = seriesName => HWDB.aibs
  .filter(a => a.vendor === '华擎 ASRock' && a.series === seriesName)
  .map(a => a.gpuId).sort();
ok(HWDB.aibSeries.some(s => s.series === 'AQUA' && s.vendor === '华擎 ASRock'),
   '缺少的 AQUA（水冷旗舰）系列已补入');
const aqua = HWDB.aibSeries.find(s => s.id === 'asrock-aqua');
ok(aqua && aqua.liquid === true && aqua.radiator === 360, 'AQUA 已按水冷形态建模');
ok(asrockCovers('AQUA').join(',') === 'rx7900xtx',
   'AQUA 仅覆盖 RX 7900 XTX（官网型号表）', asrockCovers('AQUA').join(','));
ok(asrockCovers('Taichi').join(',') === 'rx7900xtx,rx9070xt',
   'Taichi 仅覆盖 RX 9070 XT 与 RX 7900 XTX（区间无法表达，故用 onlyGpus）',
   asrockCovers('Taichi').join(','));
ok(asrockCovers('Phantom Gaming').indexOf('rx9070xt') === -1,
   'Phantom Gaming 未覆盖 RX 9070 XT（官网显示 RX 9000 改用 Taichi/Steel Legend/Challenger）',
   asrockCovers('Phantom Gaming').join(','));
ok(asrockCovers('Phantom Gaming').indexOf('arc-b580') >= 0,
   'Phantom Gaming 覆盖 Intel Arc（华擎确实做 Arc 卡）');
ok(asrockCovers('Steel Legend').indexOf('arc-b580') >= 0 &&
   asrockCovers('Steel Legend').indexOf('rx9060xt') >= 0,
   'Steel Legend 覆盖 Arc B580 与 RX 9060 XT');
ok(asrockCovers('Challenger').length >= 6,
   'Challenger 覆盖型号最多（含 Arc A770/B580/B570）', asrockCovers('Challenger').join(','));
// 核实过的系列不得再靠 minTbp 区间"猜"覆盖
['asrock-aqua', 'asrock-taichi', 'asrock-steel-legend', 'asrock-challenger', 'asrock-phantom-gaming']
  .forEach(id => {
    const s = HWDB.aibSeries.find(x => x.id === id);
    ok(!!(s && s.onlyGpus), '华擎 ' + s.series + ' 使用 onlyGpus 精确覆盖而非区间猜测');
  });

/* 七彩虹 Kudan 未发现 RTX 50 系产品，必须已从目录移除 */
ok(!seriesNames.some(s => s.startsWith('kudan|')), '已移除无法核实的 Kudan（九段）系列');
ok(!HWDB.aibs.some(a => a.series === 'Kudan'), '没有任何 Kudan 板型被生成');

// AIC 目录必须带可靠性声明
ok(HWDB.aibCatalogMeta && HWDB.aibCatalogMeta.unverifiedNote,
   'AIC 系列目录带有可靠性声明');
ok(HWDB.aibCatalogMeta.explicitCount === HWDB.aibs.filter(a => !a.generated).length,
   '声明中的手写条目数与实际一致',
   HWDB.aibCatalogMeta.explicitCount + ' vs ' + HWDB.aibs.filter(a => !a.generated).length);

// 微星闪电必须有 RTX 5090 的具体条目
const lightning = HWDB.aibs.filter(a => a.series === 'Lightning Z' && a.gpuId === 'rtx5090');
ok(lightning.length === 1, '微星闪电 RTX 5090 在库', lightning.length + ' 条');
ok(lightning[0] && lightning[0].tbp >= 700, '闪电 5090 功耗墙 >= 700W', lightning[0] && lightning[0].tbp);
ok(lightning[0] && engine.needs12v2x6(lightning[0].connector), '闪电 5090 使用 12V-2x6 供电');

// 规则生成条目必须标注为估算，且不得伪造来源
const gen = HWDB.aibs.filter(a => a.generated);
ok(gen.length > 500, '规则生成板型数量 > 500', gen.length);
ok(gen.every(a => a.confidence === 'estimate'), '规则生成条目全部标记为 estimate');
ok(gen.every(a => !a.source), '规则生成条目不伪造数据来源');
ok(gen.every(a => a.tbp > 0 && a.ocLimit >= a.tbp), '规则生成条目功耗墙单调性正确');
// 功耗墙排序必须符合定位：低定位的最高值不得超过高定位的最低值
// （同一定位下允许多个系列，例如 ROG Astral 与 ROG Strix 同为旗舰款）
const tierRank = { value: 0, blower: 0, mainstream: 1, flagship: 2, halo: 3 };
['rtx5090', 'rtx5080', 'rx9070xt', 'rtx5060ti'].forEach(gpuId => {
  const list = HWDB.aibs.filter(a => a.gpuId === gpuId && a.tier);
  const byVendor = {};
  list.forEach(a => { (byVendor[a.vendor] = byVendor[a.vendor] || []).push(a); });
  const bad = [];
  Object.keys(byVendor).forEach(v => {
    const groups = {};
    byVendor[v].forEach(a => { (groups[a.tier] = groups[a.tier] || []).push(a.tbp); });
    const tiers = Object.keys(groups).sort((x, y) => tierRank[x] - tierRank[y]);
    for (let i = 1; i < tiers.length; i++) {
      const loMax = Math.max(...groups[tiers[i - 1]]);
      const hiMin = Math.min(...groups[tiers[i]]);
      if (hiMin < loMax) bad.push(v + ' ' + tiers[i - 1] + '(max ' + loMax + ') > ' +
                                  tiers[i] + '(min ' + hiMin + ')');
    }
  });
  ok(bad.length === 0, gpuId + ' 功耗墙随定位单调递增', bad.slice(0, 2).join(' | '));
});

/* ---------------------------------------- 13. 新增兼容性校验（DDR4/锁频/水冷） */
section('13. 新增兼容性校验');
const ddr4OnDdr5 = engine.calculate(Object.assign({}, highEnd, {
  ramId: 'ddr4-3200-16x2-kf', moboId: 'asus-z890-hero'
}));
ok(codes(ddr4OnDdr5).includes('RAM_TYPE'), 'DDR4 内存 + DDR5 主板 -> 类型不兼容错误');

const ddr5OnDdr4 = engine.calculate({
  cpuId: 'i5-12400f', moboId: 'msi-pro-b760m-a', ramId: 'ddr5-6000-16x2-kf',
  gpuId: '', gpuAibId: '', coolerId: 'air-pa120-se', caseId: 'case-inwin-a5', scenario: 'office'
});
ok(codes(ddr5OnDdr4).includes('RAM_TYPE'), 'DDR5 内存 + DDR4 主板 -> 类型不兼容错误');

const ddr4Ok = engine.calculate({
  cpuId: 'i5-12400f', moboId: 'msi-pro-b760m-a', ramId: 'ddr4-3200-16x2-kf',
  gpuId: '', gpuAibId: '', coolerId: 'air-pa120-se', caseId: 'case-inwin-a5', scenario: 'office'
});
ok(!codes(ddr4Ok).includes('RAM_TYPE'), 'DDR4 内存 + DDR4 主板 -> 无类型错误');
ok(!ddr4Ok.hasError, '老平台 DDR4 配置可正常计算', codes(ddr4Ok).join(','));
console.log('    i5-12400F + B760M DDR4 办公机规划功耗 = ' + ddr4Ok.subtotal + 'W');

// 锁频 CPU 超频开关应无效（引擎按 cfg.overclock 判定）
const lockedOc = engine.calculate({
  cpuId: 'i5-12400f', overclock: true, cpuCustomWatts: 200,
  moboId: 'msi-pro-b760m-a', ramId: 'ddr4-3200-16x2-kf', gpuId: '', gpuAibId: '',
  coolerId: 'air-pa120-se', caseId: 'case-inwin-a5', scenario: 'office'
});
ok(!codes(lockedOc).includes('CPU_LOCKED'), '明确自定义功耗时不宣称按原 MTP 计算');
ok(lockedOc.cpuWatts === 200, '锁频 CPU 允许用户设置功耗墙，取 200W', lockedOc.cpuWatts + 'W');
ok(codes(lockedOc).includes('OC_NOTICE'), '旧版 overclock 同时启用显卡开关，独立提示');

// 锁频 CPU 走 AM4 平台再验证一次（5700X3D 为锁频 3D 缓存型号）
const lockedAm4 = engine.calculate({
  cpuId: 'r7-5700x3d', overclock: true, moboId: 'msi-b550-tomahawk', ramId: 'ddr4-3200-16x2-kf',
  gpuId: '', gpuAibId: '', coolerId: 'air-pa120-se', caseId: 'case-inwin-a5', scenario: 'gaming'
});
ok(lockedAm4.cpuWatts === 142, '5700X3D 超频后仍按 142W 计算', lockedAm4.cpuWatts + 'W');

// 不锁频型号必须仍然正常应用超频
const unlockedOc = engine.calculate({
  cpuId: 'r5-9600x', overclock: true, moboId: 'asus-b850-plus', ramId: 'ddr5-6000-16x2-kf',
  gpuId: '', gpuAibId: '', coolerId: 'air-pa120-se', caseId: 'case-inwin-a5', scenario: 'gaming'
});
ok(unlockedOc.cpuWatts === 142 && !codes(unlockedOc).includes('CPU_LOCKED'),
   '不锁频 CPU 超频正常生效（9600X -> 142W）', unlockedOc.cpuWatts + 'W');

// 水冷显卡冷排校验
const liquidGpu = engine.calculate(Object.assign({}, highEnd, {
  gpuAibId: 'asus-rog-matrix-5090', caseId: 'case-inwin-a5'
}));
ok(codes(liquidGpu).includes('GPU_LIQUID_RAD'), 'ROG Matrix 5090（水冷）+ 机箱 -> 提示冷排位需求');
console.log('    ' + (liquidGpu.issues.find(i => i.code === 'GPU_LIQUID_RAD') || {}).title);

// 闪电 vs 骇客：同为 5090 顶级非公，功耗墙应显著高于公版
const hof = engine.calculate(Object.assign({}, highEnd, { gpuAibId: 'galax-hof-5090' }));
ok(hof.gpuWatts >= 600, 'HOF OC Lab 5090 功耗墙 >= 600W', hof.gpuWatts);
const matrix = engine.calculate(Object.assign({}, highEnd, { gpuAibId: 'asus-rog-matrix-5090' }));
ok(matrix.recIdeal >= r1.recIdeal, 'Halo 级显卡不会降低电源推荐', matrix.recIdeal + ' vs ' + r1.recIdeal);
console.log('    公版 5090=' + r1.recIdeal + 'W 推荐 | 闪电=' +
  engine.calculate(Object.assign({}, highEnd, { gpuAibId: 'msi-lightning-z-5090' })).recIdeal +
  'W | 骇客=' + matrix.recIdeal + 'W');

/* ---------------------------------- 14. 微星闪电 5090（真实规格核对） --- */
section('14. 微星闪电 Lightning Z 5090 规格与推荐收敛');
const lz = HWDB.aibs.find(a => a.id === 'msi-lightning-z-5090');
ok(!!lz, '闪电 5090 条目存在');
ok(lz && lz.tbp === 800, '默认功耗墙 800W', lz && lz.tbp);
ok(lz && lz.ocLimit === 1000, '极致预设功耗墙 1000W', lz && lz.ocLimit);
ok(lz && lz.liquid === true && lz.radiator === 360, '标配 360mm 一体式水冷');
ok(lz && lz.recPsu === 1600, '厂商建议电源 1600W', lz && lz.recPsu);
ok(lz && lz.confidence === 'official', '规格来源标记为 official', lz && lz.confidence);
ok(lz && engine.needs12v2x6(lz.connector), '双 12V-2x6 供电被正确识别');
ok(lz && engine.requiredPcie8pin(lz.connector) === 0, '双 12V-2x6 不计入 PCIe 8pin 数量');

// 关键验证：本工具算出的推荐电源应等于微星官方建议的 1600W
const lzCfg = Object.assign({}, highEnd, { gpuAibId: 'msi-lightning-z-5090' });
const lzR = engine.calculate(lzCfg);
console.log('    规划功耗 ' + lzR.subtotal + 'W -> 推荐 ' + lzR.recFloor + '~' + lzR.recIdeal + 'W' +
            '（微星官方建议 1600W）');
ok(lzR.recIdeal === 1600, '本工具推荐 1600W，与微星官方建议一致', lzR.recIdeal);
ok(lzR.gpuWatts === 800, '闪电 5090 按 800W 计入整机功耗', lzR.gpuWatts);

// 水冷显卡必须触发机箱冷排校验
const lzCase = engine.calculate(Object.assign({}, lzCfg, { caseId: 'case-inwin-a5' }));
ok(codes(lzCase).includes('GPU_LIQUID_RAD'), '闪电（水冷）+ 机箱 -> 触发冷排位校验');

// 极致模式（1000W）会超出消费级电源常规范围，应如实告知而非给出买不到的瓦数
const lzExtreme = engine.calculate(Object.assign({}, lzCfg, { overclock: true }));
console.log('    极致模式 ' + lzExtreme.subtotal + 'W -> 推荐 ' +
            lzExtreme.recFloor + '~' + lzExtreme.recIdeal + 'W');
ok(lzExtreme.gpuWatts === 1000, '开启超频后按极致预设 1000W 计算', lzExtreme.gpuWatts);
ok(codes(lzExtreme).includes('BEYOND_CONSUMER_PSU'),
   '超出 2000W 时提示超出消费级电源范围');
ok(lzExtreme.recIdeal === 2000, '推荐值被约束到真实存在的最大标准规格 2000W',
   lzExtreme.recIdeal);
console.log('    ' + (lzExtreme.issues.find(i => i.code === 'BEYOND_CONSUMER_PSU') || {}).detail);

/* ============================================ 15. AIC 覆盖范围核实 =======
 *  这一组守着的是**「厂商根本没发表的型号」**这一类错误。
 *  规则生成器按「品牌 + TBP 区间」组合系列与 GPU，会造出不存在的产品：
 *  最典型的就是用户报上来的「ASUS ROG Strix RX 9070 XT」——
 *  ASUS 官网筛选 ROG Strix + AMD 返回 0 项，RX 7000 / RX 9000 只有 TUF（与 Prime）。
 *  下面每条断言都对应一个已核实的厂商产品线事实。
 * ======================================================================*/
console.log('\n15. AIC 覆盖范围核实（不得出现厂商没做过的型号）');

const aibsOf = id => HWDB.aibs.filter(a => a.gpuId === id);
const seriesOf = (id, vendorRe) =>
  aibsOf(id).filter(a => vendorRe.test(a.vendor)).map(a => a.series).sort();

// 用户报的那个具体错误
ok(seriesOf('rx9070xt', /华硕/).join('/') === 'Prime/TUF Gaming',
   'RX 9070 XT 的华硕型号只有 TUF Gaming 与 Prime（没有 ROG Strix / Dual）',
   seriesOf('rx9070xt', /华硕/).join(' / ') || '(无)');
ok(!HWDB.aibs.some(a => a.series === 'ROG Strix' &&
     /^rx(9000|7000)/.test((HWDB.gpus.find(g => g.id === a.gpuId) || {}).gen || '')),
   'ROG Strix 不得出现在任何 RX 7000 / RX 9000 上');
ok(HWDB.aibs.filter(a => a.series === 'ROG Strix' && /^rx/.test(a.gpuId)).length > 0,
   'ROG Strix 的 RX 6000 / 5000 等历史型号应保留（不是一刀切删掉 AMD）');

// ROG Strix 在 RTX 50 上只做 5070 Ti / 5070
const strixRTX50 = aibsOf('rtx5090').concat(aibsOf('rtx5080'), aibsOf('rtx5060ti'), aibsOf('rtx5060'))
  .filter(a => a.series === 'ROG Strix');
ok(strixRTX50.length === 0,
   'ROG Strix 不得出现在 5090 / 5080 / 5060 Ti / 5060 上（这几档走 Astral 与 TUF）',
   strixRTX50.map(a => a.gpuId).join(',') || '无');
ok(aibsOf('rtx5070ti').some(a => a.series === 'ROG Strix') &&
   aibsOf('rtx5070').some(a => a.series === 'ROG Strix'),
   'ROG Strix 应覆盖 5070 Ti 与 5070');

// ROG Astral 只做 5090 / 5080 及其 SUPER
ok(aibsOf('rtx5070ti').every(a => a.series !== 'ROG Astral'),
   'ROG Astral 不得出现在 5070 Ti 上');

// 技嘉
ok(!HWDB.aibs.some(a => a.series === 'AORUS MASTER' && /^rx/.test(a.gpuId)),
   'AORUS MASTER 不得出现在任何 AMD 卡上');
ok(seriesOf('rx9070xt', /技嘉/).join('/') === 'AORUS ELITE/GAMING OC',
   'RX 9070 XT 的技嘉型号只有 GAMING OC 与 AORUS ELITE',
   seriesOf('rx9070xt', /技嘉/).join(' / ') || '(无)');
ok(seriesOf('rtx5090', /技嘉/).indexOf('AORUS XTREME') >= 0 &&
   seriesOf('rtx5090', /技嘉/).indexOf('AORUS ELITE') === -1,
   '技嘉 5090 有 AORUS XTREME、没有 AORUS ELITE',
   seriesOf('rtx5090', /技嘉/).join(' / '));

// 撼讯：RX 9070 XT 是 Red Devil / Hellhound / Reaper
ok(seriesOf('rx9070xt', /撼讯/).join('/') === 'Hellhound/Reaper/Red Devil',
   'RX 9070 XT 的撼讯型号是 Red Devil / Hellhound / Reaper',
   seriesOf('rx9070xt', /撼讯/).join(' / ') || '(无)');

// 微星不做 RDNA4
ok(aibsOf('rx9070xt').every(a => !/微星/.test(a.vendor)),
   '微星不做 RX 9000 系列，不得出现微星型号');

// 蓝宝石 RX 9000 是 NITRO+ / PULSE / PURE，没有 TOXIC
ok(seriesOf('rx9070xt', /蓝宝石/).join('/') === 'NITRO+/PULSE/PURE',
   'RX 9070 XT 的蓝宝石型号是 NITRO+ / PULSE / PURE',
   seriesOf('rx9070xt', /蓝宝石/).join(' / ') || '(无)');

// 覆盖范围已核实的组合要带标记，未核实的必须标「推算」
ok(HWDB.aibs.some(a => a.generated && a.coverageVerified),
   '存在已核实覆盖范围的规则生成条目');
ok(HWDB.aibs.some(a => a.generated && !a.coverageVerified),
   '也存在尚未核实覆盖范围的条目（界面会标「推算」）');

section('17. 方案 C 计算回归');
const splitBase = { cpuId: 'cu7-270kp', gpuId: 'rtx5090', scenario: 'gaming' };
const splitStock = engine.calculate(splitBase);
const gpuOnlyOc = engine.calculate({ ...splitBase, cpuOc: false, gpuOc: true });
const cpuOnlyOc = engine.calculate({ ...splitBase, cpuOc: true, gpuOc: false });
ok(gpuOnlyOc.cpuWatts === splitStock.cpuWatts && gpuOnlyOc.gpuWatts > splitStock.gpuWatts,
  '只开显卡超频不会抬高 CPU 功耗');
ok(cpuOnlyOc.gpuWatts === splitStock.gpuWatts && cpuOnlyOc.cpuWatts > splitStock.cpuWatts,
  '只开 CPU 超频不会抬高显卡功耗');
const explicitOff = engine.calculate({ ...splitBase, overclock: true, cpuOc: false, gpuOc: false });
ok(explicitOff.subtotal === splitStock.subtotal, '显式分项关闭优先于旧 overclock 字段');
const limited = engine.calculate({ ...splitBase, cpuCustomWatts: 65 });
ok(limited.cpuWatts === 65 && limited.items[0].source === null, '限功耗不要求开启超频，不继承厂商来源');
const fanOnly = engine.calculate({ fanId: 'fan-tlc12cs', fanQty: 1 });
ok(fanOnly.hasSelection && !fanOnly.canRecommend && fanOnly.recIdeal === 0 && fanOnly.picks.list.length === 0,
  '只选风扇不能给出整机电源推荐');
const quickCfg = { cpuId: 'r5-9600x', gpuId: '__igpu__', mode: 'quick', scenario: 'office' };
const quick = engine.calculate(quickCfg);
const fullCore = engine.calculate({ ...quickCfg, mode: 'full' });
ok(quick.assumptions.length === 5 && quick.subtotal - fullCore.subtotal === 62,
  '快速估算逐项补入 62W 辅助设备预算');
const quickSpecific = engine.calculate({ ...quickCfg, moboId: 'asus-b850-plus' });
ok(quickSpecific.assumptions.length === 4 && quickSpecific.items.filter(i => i.label === '主板').length === 1,
  '填写具体主板替代默认主板，不双计');
ok(quick.coverage.every(c => !c.checked), '默认项不冒充真实兼容性检查');
ok(quick.expectedRange.low <= quick.expected && quick.expected <= quick.expectedRange.high,
  '场景参考值落在分项区间内');
ok(quick.expectedRange.high < quick.subtotal * 0.75, '办公场景不再按整机上限的 75% 估算');
const noIgpu = engine.calculate({ cpuId: 'i5-12400f', gpuId: '__igpu__' });
ok(codes(noIgpu).includes('NO_INTEGRATED_GPU'), '无核显 CPU 选择集成显卡时提示错误');
ok(engine.required12v2x6('2× 12V-2x6') === 2 && engine.required12v2x6('12VHPWR') === 1 && engine.required12v2x6('3×8pin') === 0,
  '原生 16pin 供电按数量解析');
const dualGpu = engine.calculate({ ...splitBase, gpuAibId: 'msi-lightning-z-5090' });
ok(dualGpu.picks.list.length > 0 && dualGpu.picks.list.every(p => p.conn12v2x6 >= 2),
  '双 16pin 显卡不会被推荐单接口电源');
const oneNative = engine.calculate({ ...splitBase, gpuAibId: 'msi-lightning-z-5090', psuId: 'seasonic-prime-tx1300' });
const oneNativePsu = HWDB.psus.find(p => p.conn12v2x6 === 1 && p.pcie8pin < 4);
const insufficientNative = engine.calculate({ ...splitBase, gpuAibId: 'msi-lightning-z-5090', psuId: oneNativePsu.id });
ok(insufficientNative.issues.some(i => i.code === 'PSU_NO_12V2X6' && i.level === 'error'),
  '原生接口不足且无法满足转接数量时为错误');
ok(!insufficientNative.existingPsu.reusable, '接口不合格电源不能判为可复用');
ok(dualGpu.picks.list.every(p => p.watts >= dualGpu.recFloor && p.eps8pin >= 2),
  '候选同时满足功率和高功耗 CPU 供电筛选规则');
ok(splitStock.reasons.some(s => s.includes('工具保守规则')) && !splitStock.reasons.some(s => s.includes('显卡厂商建议')),
  '无具体来源的 1000W 兜底规则不冒充厂商建议');
const generatedAib = HWDB.aibs.find(a => a.generated);
const generatedResult = engine.calculate({ cpuId: 'r5-9600x', gpuAibId: generatedAib.id });
ok(generatedResult.items.find(i => i.label === '显卡').source === null,
  '生成板型不继承公版来源作为自身证据');
ok(generatedResult.confidence.estimatedPercent > 0 && generatedResult.confidence.sensitivityWatts >= generatedResult.subtotal,
  '估算项目暴露功耗占比与敏感性推演');
const overRange = engine.calculate({ ...splitBase, otherCustom: [{ label: '额外负载', watts: 3000 }] });
ok(overRange.beyond && overRange.picks.list.length === 0 && overRange.upgrade === null,
  '超出推荐范围时不再把 2000W 当合格候选或升级依据');
const invalidScenario = engine.calculate({ ...quickCfg, scenario: 'constructor' });
ok(invalidScenario.scenario === 'gaming' && Number.isFinite(invalidScenario.expectedRange.low),
  '场景区间也防止原型链枚举绕过');
ok(JSON.stringify(quickCfg) === JSON.stringify({ cpuId: 'r5-9600x', gpuId: '__igpu__', mode: 'quick', scenario: 'office' }),
  '快速估算保持输入配置不变');

const customGpuConfig = { cpuId: 'r5-9600x', gpuName: '自定义显卡', gpuCustomWatts: 300,
  psuId: 'msi-mag-a650gl', mode: 'quick' };
const customGpuReuse = engine.calculate(customGpuConfig);
ok(!customGpuReuse.gpuConnectorKnown && !customGpuReuse.existingPsu.verificationComplete &&
  customGpuReuse.existingPsu.reusable === null && customGpuReuse.existingPsu.level === 'warn',
  '自定义显卡功率达标但接口未知时不能确认复用');
ok(engine.calculate({ ...customGpuConfig, gpuCustomWatts: 600 }).existingPsu.reusable === false,
  '接口未知不能覆盖已确定的功率不足');
const knownGpuReuse = engine.calculate({ cpuId: 'r5-9600x', gpuId: 'rtx4060',
  psuId: 'msi-mag-a650gl', mode: 'quick' });
ok(knownGpuReuse.gpuConnectorKnown && knownGpuReuse.existingPsu.reusable === true,
  '已知显卡接口与功率满足时仍可确认复用');
ok(engine.calculate({ cpuId: 'r5-9600x', gpuId: '__igpu__', psuId: 'msi-mag-a650gl', mode: 'quick' }).existingPsu.reusable === true,
  '明确使用核显无需独立显卡接口');

/* ------------------------------------------------------------ 汇总 ----- */
console.log('\n' + '='.repeat(56));
console.log('通过 ' + pass + ' / ' + (pass + fail) + '  失败 ' + fail);
if (fail) { console.log('\n失败项:'); failures.forEach(f => console.log('  - ' + f)); }
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
