/* ============================================================================
 *  回归基线 —— 「数字逐位不变」的门禁
 * ----------------------------------------------------------------------------
 *  改版唯一不能动的就是计算层。但「我没改计算」不能靠嘴说，必须能证明。
 *
 *  用法：
 *    node tools/baseline.mjs --capture    # 抓取当前输出写入 test/baseline.json
 *    node tools/baseline.mjs              # 与基线逐位比对（CI / 每次改版后跑）
 *
 *  设计说明：
 *    · 只冻结「已选硬件」的配置 —— 这些的计算结果任何阶段都不得改变。
 *    · 空配置被刻意排除：修复「空态谎报全部匹配」本来就要改它的输出，
 *      把它冻进基线会让正确的修复反而报错。空态由 selftest 单独断言。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const engine = require(path.join(root, 'js', 'engine.js'));

const BASE_PATH = path.join(root, 'test', 'baseline.json');

/* ------------------------------------------------------------------ 夹具 --
 * 覆盖构建方案 Phase 0.2 要求的十种场景（空配置见文件头说明，此处不含）。
 * ------------------------------------------------------------------------*/
const FIXTURES = {
  '仅 CPU（核显办公）': {
    cpuId: 'r5-9600x', gpuId: '__igpu__', moboId: 'asus-b850-plus',
    ramId: 'ddr5-6000-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-990pro-2t', qty: 1 }],
    coolerId: 'air-pa120-se', fanId: 'fan-nfa12x25', fanQty: 2,
    caseId: 'case-inwin-a5', scenario: 'office'
  },
  '仅显卡（无 CPU）': {
    gpuAibId: 'powercolor-reddevil-9070xt', gpuId: 'rx9070xt',
    caseId: 'case-inwin-a5', scenario: 'gaming'
  },
  '旗舰全套（Intel + 5090）': {
    cpuId: 'cu7-270kp', gpuAibId: 'asus-astral-5090', moboId: 'asus-z890-hero',
    ramId: 'ddr5-7200-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-9100pro-2t', qty: 1 }, { id: 'hdd-exos-20t', qty: 1 }],
    coolerId: 'aio-frozen-warframe-360', fanId: 'fan-tlc12cs', fanQty: 3,
    caseId: 'case-o11d-evo', argbChannels: 1, extras: { 'x-usb-dev': 4 },
    scenario: 'gaming'
  },
  '旗舰超频（闪电 5090 极致）': {
    cpuId: 'cu7-270kp', overclock: true, gpuAibId: 'msi-lightning-z-5090',
    moboId: 'asus-z890-hero', ramId: 'ddr5-7200-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-9100pro-2t', qty: 1 }, { id: 'hdd-exos-20t', qty: 1 }],
    coolerId: 'aio-frozen-warframe-360', fanId: 'fan-tlc12cs', fanQty: 3,
    caseId: 'case-o11d-evo', scenario: 'extreme'
  },
  'ITX 小机箱（集成显卡）': {
    cpuId: 'r7-9700x', gpuId: '__igpu__', moboId: 'asus-b650e-i',
    ramId: 'ddr5-6000-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-990pro-2t', qty: 1 }],
    coolerId: 'air-pa120-se', fanId: 'fan-nfa12x25', fanQty: 2,
    caseId: 'case-lianli-a4h2o', psuId: 'seasonic-sfx-750', scenario: 'gaming'
  },
  '多 Gen5 SSD（4 块）': {
    cpuId: 'i9-14900k', gpuAibId: 'msi-trio-5090', moboId: 'asus-z890-hero',
    ramId: 'ddr5-7200-16x2-kf', ramKits: 2,
    storage: [{ id: 'ssd-9100pro-4t', qty: 2 }, { id: 'ssd-9100pro-2t', qty: 2 }],
    coolerId: 'aio-kraken-elite-360', fanId: 'fan-unifan-sl-inf', fanQty: 6,
    caseId: 'case-o11-vision', argbChannels: 3, scenario: 'creator'
  },
  'ARGB 满载 + 扩展卡': {
    cpuId: 'r9-9950x3d2', gpuAibId: 'sapphire-nitro-9070xt', moboId: 'msi-b850-tomahawk',
    ramId: 'ddr5-6000-32x2-gskill', ramKits: 2,
    storage: [{ id: 'ssd-tipro9000-2t', qty: 1 }],
    coolerId: 'aio-ryujin-iii-360', fanId: 'fan-cm-mf120', fanQty: 8,
    caseId: 'case-masterframe-600', argbChannels: 6,
    extras: { 'x-pcie-net': 1, 'x-capture': 1, 'x-usb-dev': 8, 'x-pump': 1 },
    scenario: 'creator'
  },
  '老平台 DDR4（12 代 + B760）': {
    cpuId: 'i5-12400f', gpuAibId: 'asus-dual-5060ti', moboId: 'msi-pro-b760m-a',
    ramId: 'ddr4-3200-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-870evo-4t', qty: 1 }, { id: 'hdd-ironwolf-8t', qty: 2 }],
    coolerId: 'air-pa120-se', fanId: 'fan-tlc12prov2', fanQty: 3,
    caseId: 'case-inwin-a5', scenario: 'gaming'
  },
  '电源接口不足（触发 error）': {
    cpuId: 'r9-9950x3d2', gpuAibId: 'powercolor-reddevil-9070xt',
    moboId: 'asus-b850-plus', ramId: 'ddr5-6000-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-990pro-2t', qty: 1 }],
    coolerId: 'air-pa120-se', fanId: 'fan-tlc12prov2', fanQty: 2,
    caseId: 'case-inwin-a5', psuId: 'seasonic-focus-gx650', scenario: 'gaming'
  },
  '插槽不兼容（AMD CPU + Intel 板）': {
    cpuId: 'r9-9950x3d2', gpuAibId: 'asrock-taichi-9070xt', moboId: 'asus-z890-hero',
    ramId: 'ddr5-6000-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-990pro-2t', qty: 1 }],
    coolerId: 'air-pa120-se', fanId: 'fan-tlc12prov2', fanQty: 2,
    caseId: 'case-inwin-a5', scenario: 'gaming'
  },
  '未发布硬件（5080 SUPER）': {
    cpuId: 'cu5-250kp', gpuAibId: 'asus-tuf-5080super', moboId: 'asus-b860-plus',
    ramId: 'ddr5-7200-16x2-kf', ramKits: 1,
    storage: [{ id: 'ssd-9100pro-2t', qty: 1 }],
    coolerId: 'aio-galahad-ii-360', fanId: 'fan-tlc12cs', fanQty: 3,
    caseId: 'case-p500a', scenario: 'gaming'
  }
};

/* ------------------------------------------------------------- 提取指纹 --
 * 只取「计算结论」，不含任何与渲染相关的东西。
 * ------------------------------------------------------------------------*/
function fingerprint(cfg) {
  const r = engine.calculate(cfg);
  return {
    subtotal: r.subtotal,
    expected: r.expected,
    transient: r.transient,
    redundancy: r.redundancy,
    recFloor: r.recFloor,
    recIdeal: r.recIdeal,
    gpuWatts: r.gpuWatts,
    cpuWatts: r.cpuWatts,
    upgradeHeadroom: r.upgrade ? r.upgrade.headroomWatts : null,
    upgradeMaxGpu: r.upgrade ? r.upgrade.maxGpu : null,
    itemCount: r.items.length,
    // 逐项功耗：任何一项变化都要能定位到
    items: r.items.map(i => i.label + '=' + i.watts),
    issueCodes: r.issues.map(i => i.code).sort(),
    pickWatts: {
      value: r.picks.value ? r.picks.value.watts : null,
      balanced: r.picks.balanced ? r.picks.balanced.watts : null,
      flagship: r.picks.flagship ? r.picks.flagship.watts : null
    }
  };
}

function captureAll() {
  const out = {};
  for (const [name, cfg] of Object.entries(FIXTURES)) out[name] = fingerprint(cfg);
  return out;
}

/* ------------------------------------------------------------------ 比对 */
function compare(a, b, pathStr, diffs) {
  if (a === b) return;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    diffs.push(`${pathStr}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) compare(a[k], b[k], pathStr + '.' + k, diffs);
}

/* ------------------------------------------------------------------ 主流程 */
const mode = process.argv[2];
const current = captureAll();

if (mode === '--capture') {
  fs.mkdirSync(path.dirname(BASE_PATH), { recursive: true });
  const doc = {
    _comment: '计算层回归基线。功能升级的计算口径变更必须先审阅差异并记录原因。' +
              '重新生成：node tools/baseline.mjs --capture',
    _revisionNote: 'v3.0.0 保留方案 C 的场景区间、完整性和超频规则。2026.10.1 用户授权扩充电源与核对参数：新增25款电源，38款按厂家版本记录，33款旧资料待核并退出推荐。重抓前 baseline-diff 有8处字段差异：6处推荐候选瓦数变化及问题码数组新增PSU_PCIE_CABLES造成的2处移位；全部夹具的subtotal、expected、transient、逐项瓦数、recFloor/recIdeal、升级余量不变。接口线束与300/450/600W功率边界由psucheck独立覆盖；厂家事实见test/psu-spec-facts.json，审计边界见docs/HARDWARE-AUDIT-2026-10-04.md。',
    _capturedAt: new Date().toISOString().slice(0, 10),
    fixtures: FIXTURES,
    expected: current
  };
  fs.writeFileSync(BASE_PATH, JSON.stringify(doc, null, 2), 'utf8');
  console.log('✓ 基线已写入 test/baseline.json');
  console.log('  夹具 ' + Object.keys(current).length + ' 组');
  Object.entries(current).forEach(([k, v]) => {
    console.log('    ' + k.padEnd(30) + ' 规划 ' + String(v.subtotal).padStart(7) +
                'W  推荐 ' + v.recFloor + '~' + v.recIdeal + 'W');
  });
  process.exit(0);
}

if (!fs.existsSync(BASE_PATH)) {
  console.error('✗ 基线不存在，先运行：node tools/baseline.mjs --capture');
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));
const diffs = [];
compare(base.expected, current, '', diffs);

console.log('计算层回归基线比对');
console.log('─'.repeat(58));
console.log('  基线抓取于 ' + base._capturedAt + '，共 ' + Object.keys(base.expected).length + ' 组夹具');

if (diffs.length) {
  console.log('\n✗ 发现 ' + diffs.length + ' 处计算输出变化：');
  diffs.slice(0, 25).forEach(d => console.log('  - ' + d));
  if (diffs.length > 25) console.log('  ... 另有 ' + (diffs.length - 25) + ' 处');
  console.log('\n  这说明计算层被改动了。改版绝不允许影响任何数字。');
  process.exit(1);
}
console.log('\n✓ 全部 ' + Object.keys(base.expected).length + ' 组夹具的数字逐位不变');
process.exit(0);
