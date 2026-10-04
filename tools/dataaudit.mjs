/* ============================================================================
 *  数据库自洽性审计
 *  与 selftest.mjs 的分工：selftest 验证"计算逻辑是否正确"，
 *  本脚本验证"数据本身是否自洽"——不依赖任何具体型号的预期值，
 *  而是检查数据内部的逻辑关系。新增硬件后应同时跑这两个脚本。
 *
 *  运行:  node tools/dataaudit.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DB = require(path.join(__dirname, '..', 'js', 'db.js'));

const problems = [];
const warns = [];
const add = (arr, msg) => arr.push(msg);

/* ------------------------------------------------------------------ CPU -- */
const cpuIds = new Set();
DB.cpus.forEach(c => {
  if (cpuIds.has(c.id)) add(problems, `CPU id 重复: ${c.id}`);
  cpuIds.add(c.id);
  if (!c.name || !c.socket || !c.brand) add(problems, `CPU 字段缺失: ${c.id}`);
  if (!c.source || !DB.sources[c.source]) add(problems, `CPU 来源无效: ${c.id} -> ${c.source}`);
  if (c.maxTurbo < c.tdp) add(problems, `MTP/PPT < PBP/TDP: ${c.id} (${c.maxTurbo} < ${c.tdp})`);
  if (c.unlocked === false && c.ocPeak > c.maxTurbo) {
    add(problems, `锁频型号 ocPeak 超过 MTP: ${c.id} (${c.ocPeak} > ${c.maxTurbo})`);
  }
  if (c.unlocked !== false && c.ocPeak < c.maxTurbo) {
    add(problems, `不锁频型号 ocPeak 低于 MTP: ${c.id} (${c.ocPeak} < ${c.maxTurbo})`);
  }
  if (c.price > 0 && c.price < 100) add(warns, `CPU 价格异常偏低: ${c.id} ¥${c.price}`);
});

/* ------------------------------------------------------------------ GPU -- */
const gpuIds = new Set();
DB.gpus.forEach(g => {
  if (gpuIds.has(g.id)) add(problems, `GPU id 重复: ${g.id}`);
  gpuIds.add(g.id);
  if (!g.connector || !g.pcie) add(problems, `GPU 字段缺失: ${g.id}`);
  if (!g.source || !DB.sources[g.source]) add(problems, `GPU 来源无效: ${g.id} -> ${g.source}`);
  /* 已停产的卡没有「当前零售价」是正常的，不该当成数据缺口刷屏 ——
     它们只在二手市场流通，价格随成色浮动，写一个数字反而是误导。
     老卡的可靠性风险改由 GPU 卡上的「已停产」标注 + 声明弹窗来交代。 */
  if (g.confidence !== 'leak' && g.segment !== 'legacy' && g.price <= 0) {
    add(warns, `已上市 GPU 无参考价: ${g.id}`);
  }
});

/* ------------------------------------------------- 世代分组元数据（CPU/GPU）--
   CPU 与 GPU 现在共用同一套约定：每个型号都要有 gen / genLabel / year，
   且 gen 必须出现在对应的 *_GEN_ORDER 里 —— 否则 UI 的世代下拉会漏掉它，
   用户就永远筛不到这颗 CPU / 这块卡（属于「静默丢数据」，必须报错）。 */
const cpuGenIds = new Set();
DB.cpus.forEach(c => {
  if (!c.gen || !c.genLabel) add(problems, `CPU 缺世代信息: ${c.id}`);
  if (!c.year) add(problems, `CPU 缺上市年份: ${c.id}`);
  if (c.gen && DB.cpuGenOrder.indexOf(c.gen) === -1) {
    add(problems, `CPU 世代不在 cpuGenOrder 里: ${c.id} -> ${c.gen}`);
  }
  if (c.gen) cpuGenIds.add(c.gen);
});
if (DB.cpuGenOrder.length !== cpuGenIds.size) {
  const stray = DB.cpuGenOrder.filter(g => !cpuGenIds.has(g));
  add(problems, `cpuGenOrder 有条目没有任何 CPU: ${stray.join(', ')}`);
}

const gpuGenIds = new Set();
DB.gpus.forEach(g => {
  if (!g.gen || !g.genLabel) add(problems, `GPU 缺世代信息: ${g.id}`);
  if (g.gen && DB.gpuGenOrder.indexOf(g.gen) === -1) {
    add(problems, `GPU 世代不在 gpuGenOrder 里: ${g.id} -> ${g.gen}`);
  }
  if (g.gen) gpuGenIds.add(g.gen);
});
if (DB.gpuGenOrder.length !== gpuGenIds.size) {
  const stray = DB.gpuGenOrder.filter(g => !gpuGenIds.has(g));
  add(problems, `gpuGenOrder 有条目没有任何 GPU: ${stray.join(', ')}`);
}
/* gpuGenMeta 的 year 会被 GPU 世代下拉直接显示，缺了会印出 "（undefined 年）" */
Object.keys(DB.gpuGenMeta).forEach(k => {
  if (!DB.gpuGenMeta[k].year) add(problems, `gpuGenMeta[${k}] 缺 year`);
  if (!DB.gpuGenMeta[k].label) add(problems, `gpuGenMeta[${k}] 缺 label`);
});

/* ------------------------------------------------ AIC 覆盖范围核实 ------
   规则生成器按「品牌 + TBP 区间」组合系列与 GPU，会造出厂商根本没发表的型号
   （典型：华硕 ROG Strix RX 9070 XT）。db-aib.js 的 COVERAGE 表里是逐代核实过的
   系列，这里守住三条不变量：
     · 已核实覆盖的系列必须真的带 gens 约束 —— 否则「核实」等于没做
     · onlyGpus / exceptGpus 引用的 GPU id 必须真实存在 ——
       拼错 id 不会报错，只会静默失效，那是最难发现的一类数据错误
     · 已核实系列的数量不能掉到 0 —— 防有人把整张 COVERAGE 表删掉 */
const verifiedSeries = DB.aibSeries.filter(s => s.coverageVerified);
if (verifiedSeries.length < 10) {
  add(problems, `已核实覆盖范围的系列只有 ${verifiedSeries.length} 个（应 ≥10），COVERAGE 表可能被误删`);
}
DB.aibSeries.forEach(s => {
  if (s.coverageVerified && !s.gens) {
    add(problems, `已核实覆盖范围但缺 gens 约束: ${s.id}`);
  }
  (s.onlyGpus || []).forEach(id => {
    if (!gpuIds.has(id)) add(problems, `${s.id} 的 onlyGpus 引用了不存在的 GPU: ${id}`);
  });
  (s.exceptGpus || []).forEach(id => {
    if (!gpuIds.has(id)) add(problems, `${s.id} 的 exceptGpus 引用了不存在的 GPU: ${id}`);
  });
  (s.gens || []).forEach(gen => {
    if (DB.gpuGenOrder.indexOf(gen) === -1) {
      add(problems, `${s.id} 的 gens 引用了不存在的世代: ${gen}`);
    }
  });
});

/* 老卡存量：需求要求「关切久远硬件的参与」，
   若哪天有人误删了 legacy 数据，这条会立刻失败。 */
const legacyGpus = DB.gpus.filter(g => g.segment === 'legacy').length;
if (legacyGpus < 30) add(problems, `已停产 GPU 存量不足（${legacyGpus} < 30），老卡数据可能被误删`);
const legacyCpus = DB.cpus.filter(c => c.segment === 'legacy').length;
if (legacyCpus < 20) add(problems, `已停产 CPU 存量不足（${legacyCpus} < 20），老平台数据可能被误删`);

/* ------------------------------------------------------------------ AIB -- */
const aibIds = new Set();
DB.aibs.forEach(a => {
  if (aibIds.has(a.id)) add(problems, `AIB id 重复: ${a.id}`);
  aibIds.add(a.id);
  if (!gpuIds.has(a.gpuId)) add(problems, `AIB 关联了不存在的 GPU: ${a.id} -> ${a.gpuId}`);
  if (!a.connector) add(problems, `AIB 缺少供电接口: ${a.id}`);
  if (a.tbp <= 0) add(problems, `AIB 功耗墙 <= 0: ${a.id}`);
  if (a.ocLimit < a.tbp) add(problems, `AIB OC 上限低于出厂功耗墙: ${a.id}`);
  if (!(a.length > 0) || !(a.slots > 0)) add(problems, `AIB 尺寸缺失: ${a.id}`);
  // 规则生成条目必须诚实
  if (a.generated) {
    if (a.confidence !== 'estimate') add(problems, `规则生成条目置信度不是 estimate: ${a.id}`);
    if (a.source) add(problems, `规则生成条目伪造了来源: ${a.id} -> ${a.source}`);
  } else {
    if (!a.source || !DB.sources[a.source]) add(problems, `手写 AIB 来源无效: ${a.id} -> ${a.source}`);
  }
  // 功耗墙不应低于同型号公版（允许 2% 容差）
  const g = DB.gpus.find(x => x.id === a.gpuId);
  if (g && a.tbp < g.tbp * 0.98) {
    add(problems, `AIB 功耗墙明显低于公版: ${a.id} (${a.tbp} < ${g.tbp})`);
  }
  // 水冷型号必须标注冷排尺寸
  if (a.liquid && !(a.radiator > 0)) add(problems, `水冷板型缺少 radiator: ${a.id}`);
});

/* --------------------------------- 同厂商内功耗墙随定位单调递增 ------- */
const tierRank = { blower: 0, value: 0, mainstream: 1, flagship: 2, halo: 3 };
const byGpuVendor = {};
DB.aibs.forEach(a => {
  const k = a.gpuId + '|' + a.vendor;
  (byGpuVendor[k] = byGpuVendor[k] || []).push(a);
});
Object.keys(byGpuVendor).forEach(k => {
  const groups = {};
  byGpuVendor[k].forEach(a => { (groups[a.tier] = groups[a.tier] || []).push(a.tbp); });
  const tiers = Object.keys(groups).sort((x, y) => tierRank[x] - tierRank[y]);
  for (let i = 1; i < tiers.length; i++) {
    const loMax = Math.max(...groups[tiers[i - 1]]);
    const hiMin = Math.min(...groups[tiers[i]]);
    if (hiMin < loMax) {
      add(problems, `功耗墙未随定位单调递增: ${k} ${tiers[i - 1]}(max ${loMax}) > ${tiers[i]}(min ${hiMin})`);
    }
  }
});

/* ------------------------------------------------- 每个 GPU 的板型覆盖 -- */
const aibPerGpu = {};
DB.aibs.forEach(a => { aibPerGpu[a.gpuId] = (aibPerGpu[a.gpuId] || 0) + 1; });
DB.gpus.forEach(g => {
  const n = aibPerGpu[g.id] || 0;
  if (n < 5) add(problems, `GPU 可选板型过少: ${g.id} 仅 ${n} 个`);
});
const vendors = [...new Set(DB.aibs.map(a => a.vendor))];
if (vendors.length < 20) add(problems, `AIC 厂商数不足: ${vendors.length}`);

/* ---------------------------------------------------------------- 主板 -- */
const moboIds = new Set();
DB.motherboards.forEach(m => {
  if (moboIds.has(m.id)) add(problems, `主板 id 重复: ${m.id}`);
  moboIds.add(m.id);
  if (!DB.platforms[m.socket]) add(problems, `主板插槽无平台映射: ${m.id} -> ${m.socket}`);
  if (!(m.watts > 0)) add(problems, `主板功耗缺失: ${m.id}`);
  if (!(m.ramSlots > 0) || !(m.maxRam > 0)) add(problems, `主板内存规格缺失: ${m.id}`);
  if (!m.moboSupportFor) { /* 机箱侧检查 */ }
});

/* CPU ↔ 主板 双向可达性：每个已上市平台都必须有主板 */
const moboSockets = new Set(DB.motherboards.map(m => m.socket));
DB.cpus.filter(c => c.released !== '待发布').forEach(c => {
  if (!moboSockets.has(c.socket)) add(problems, `CPU 平台无配套主板: ${c.id} (${c.socket})`);
});
/* 反向：每块主板都必须有至少一款 CPU 能用 */
const cpuSockets = new Set(DB.cpus.map(c => c.socket));
DB.motherboards.forEach(m => {
  if (!cpuSockets.has(m.socket)) add(problems, `主板无可用 CPU: ${m.id} (${m.socket})`);
});
/* 每块主板的内存类型都必须有对应内存条 */
const ramTypes = new Set(DB.ram.map(r => r.type || 'DDR5'));
DB.motherboards.forEach(m => {
  if (!ramTypes.has(m.ramType)) add(problems, `主板内存类型无对应内存条: ${m.id} (${m.ramType})`);
});

/* ---------------------------------------------------------------- 内存 -- */
DB.ram.forEach(r => {
  if (!(r.wattsPerStick > 0)) add(problems, `内存功耗缺失: ${r.id}`);
  if (!(r.capacityPerStick > 0) || !(r.sticks > 0)) add(problems, `内存容量/条数缺失: ${r.id}`);
  const t = r.type || 'DDR5';
  if (t === 'DDR4' && r.speed > 5333) add(warns, `DDR4 频率异常: ${r.id} ${r.speed}`);
  if (t === 'DDR5' && r.speed < 4000) add(warns, `DDR5 频率异常: ${r.id} ${r.speed}`);
});

/* ---------------------------------------------------------------- 存储 -- */
DB.storage.forEach(s => {
  if (!(s.watts > 0)) add(problems, `存储功耗缺失: ${s.id}`);
  if (s.kind === 'HDD' && !(s.spinUp > 0)) add(problems, `机械硬盘缺少启动功耗: ${s.id}`);
  if (s.kind !== 'HDD' && s.spinUp > 0) add(warns, `非机械硬盘却有启动功耗: ${s.id}`);
});

/* ------------------------------------------------------ 散热器 / 机箱 -- */
// 只检查已上市插槽：未发布平台（如 LGA1954）的扣具规格尚未公开，不应据此报警
const allSockets = new Set(DB.cpus.filter(c => c.released !== '待发布').map(c => c.socket));
DB.coolers.forEach(c => {
  const miss = [...allSockets].filter(s => c.sockets.indexOf(s) === -1);
  if (miss.length) add(warns, `散热器不支持部分已上市插槽: ${c.id} 缺 ${miss.join('/')}`);
  if (c.kind === 'AIO' && !(c.radiator > 0)) add(problems, `水冷缺少冷排尺寸: ${c.id}`);
});
const formFactors = ['E-ATX', 'ATX', 'M-ATX', 'ITX'];
DB.motherboards.forEach(m => {
  if (formFactors.indexOf(m.formFactor) === -1) add(problems, `未知板型: ${m.id} ${m.formFactor}`);
  const fits = DB.cases.some(c => c.moboSupport.indexOf(m.formFactor) !== -1);
  if (!fits) add(problems, `没有机箱能装下该板型: ${m.id} (${m.formFactor})`);
});
DB.cases.forEach(c => {
  if (!(c.gpuMaxLen > 0)) add(problems, `机箱显卡限长缺失: ${c.id}`);
  if (!c.psuFormFactor.length) add(problems, `机箱电源规格缺失: ${c.id}`);
});

/* ---------------------------------------------------------------- 电源 -- */
const psuIds = new Set();
DB.psus.forEach(p => {
  if (psuIds.has(p.id)) add(problems, `电源 id 重复: ${p.id}`);
  psuIds.add(p.id);
  if (!(p.watts > 0)) add(problems, `电源瓦数缺失: ${p.id}`);
  if (!p.atx || !p.efficiency) add(problems, `电源规范/认证缺失: ${p.id}`);
  if (!p.verified) {
    if (p.source || p.conn12v2x6 != null || p.pcie8pin != null || p.eps8pin != null) add(problems, `待核电源仍宣称有规格依据: ${p.id}`);
    return;
  }
  for (const field of ['conn12v2x6', 'pcie8pin', 'eps8pin']) {
    if (!Number.isInteger(p[field]) || p[field] < 0) add(problems, `电源接口数量不合法: ${p.id}.${field}`);
  }
  if (p.sata != null && (!Number.isInteger(p.sata) || p.sata < 0)) add(problems, `SATA数量不合法: ${p.id}`);
  if (!p.checkedAt || !p.revision || !DB.sources[p.source] || !/^https:\/\//.test(p.sourceUrl)) add(problems, `已核电源缺少版本/日期/厂家来源: ${p.id}`);
  if (p.connector16Watts != null && (p.connector16Watts.length !== p.conn12v2x6 || p.connector16Watts.some(w => !(w > 0 && w <= 600)))) add(problems, `16-pin线缆功率与数量不自洽: ${p.id}`);
  if (p.pcie8pinCables != null && (!Number.isInteger(p.pcie8pinCables) || p.pcie8pinCables < 0 || p.pcie8pinCables > p.pcie8pin)) add(problems, `PCIe线束数量不自洽: ${p.id}`);
  if (p.rail12vWatts != null && !(p.rail12vWatts > 0 && p.rail12vWatts <= p.watts)) add(problems, `12V输出超过额定功率: ${p.id}`);
  if (p.priceKind !== 'budget-estimate') add(problems, `未注明价格估算口径: ${p.id}`);
  if (!['ATX', 'SFX', 'SFX-L'].includes(p.formFactor || 'ATX')) {
    add(problems, `未知电源规格: ${p.id} ${p.formFactor}`);
  }
});
/* ITX 机箱必须有 SFX 电源可用 */
DB.cases.forEach(c => {
  const onlyItx = c.moboSupport.length === 1 && c.moboSupport[0] === 'ITX';
  if (!onlyItx) return;
  const ok = DB.psus.some(p => c.psuFormFactor.indexOf(p.formFactor || 'ATX') !== -1);
  if (!ok) add(problems, `ITX 机箱无可用电源: ${c.id}`);
});
/* 瓦数覆盖度：至少要有 550/650/750/850/1000/1200/1300 级别 */
const wattSet = new Set(DB.psus.map(p => p.watts));
[550, 650, 750, 850, 1000, 1200, 1300].forEach(w => {
  if (!wattSet.has(w)) add(warns, `缺少 ${w}W 档位电源`);
});
/* 高端显卡必须有能带动它的电源候选 */
DB.gpus.forEach(g => {
  if (g.tbp < 400) return;
  const need = Math.ceil(g.tbp * 1.5 / 100) * 100;
  if (!DB.psus.some(p => p.watts >= need)) {
    add(problems, `GPU ${g.id} 需要 ${need}W，但无对应电源候选`);
  }
});

/* ------------------------------------------------ 发布文案与数据库对账 --
   index.html 的 meta 描述与结构化数据里印的计数，必须等于数据库的真实计数。
   这类字面量漂移过：数据扩到 71 款显卡 / 2386 个板型之后，结构化数据里
   还写着 66 款 / 2427 个板型（分享卡片上更早还印着 2150）。
   错的是给搜索引擎和分享卡片看的文案，页面上看不见，靠人眼审不出来。 */
const published = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const real = {
  cpu: DB.cpus.length, gpu: DB.gpus.length,
  aib: DB.aibs.length, series: DB.aibSeries.length, vendors: vendors.length
};
const knownCounts = new Set(Object.values(real));
for (const m of published.matchAll(/(\d+)\s*(款|个板型|家)/g)) {
  if (!knownCounts.has(+m[1])) {
    add(problems, `index.html 文案里的「${m[0]}」不是数据库计数` +
      `（CPU ${real.cpu} / GPU ${real.gpu} / AIC ${real.aib} / 系列 ${real.series} / 厂商 ${real.vendors}）`);
  }
}
[`${real.cpu} 款 CPU`, `${real.gpu} 款`, `${real.aib} 个板型`, `${real.vendors} 家`]
  .filter(t => !published.includes(t))
  .forEach(t => add(problems, `index.html 文案缺少最新计数，应包含「${t}」`));

/* ------------------------------------------------------------- 汇总输出 -- */
const C = { r: '\x1b[31m', y: '\x1b[33m', g: '\x1b[32m', d: '\x1b[2m', x: '\x1b[0m' };
console.log('\n数据库自洽性审计');
console.log(C.d + '─'.repeat(58) + C.x);
console.log(`  CPU ${DB.cpus.length} · GPU ${DB.gpus.length} · AIC ${DB.aibs.length}` +
            `（${vendors.length} 厂商 / ${DB.aibSeries.length} 系列）` +
            ` · 主板 ${DB.motherboards.length} · 内存 ${DB.ram.length}` +
            ` · 存储 ${DB.storage.length} · 散热 ${DB.coolers.length}` +
            ` · 风扇 ${DB.fans.length} · 机箱 ${DB.cases.length} · 电源 ${DB.psus.length}`);
console.log(C.d + '─'.repeat(58) + C.x);

if (problems.length) {
  console.log(C.r + `\n✗ 发现 ${problems.length} 处数据问题：` + C.x);
  problems.forEach(p => console.log('  ' + p));
} else {
  console.log(C.g + '\n✓ 数据自洽性检查全部通过' + C.x);
}
if (warns.length) {
  console.log(C.y + `\n! ${warns.length} 处提醒（不阻断）：` + C.x);
  warns.forEach(w => console.log('  ' + w));
}
console.log('');
process.exit(problems.length ? 1 : 0);
