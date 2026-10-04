/* Manufacturer fact regression + wiring boundary checks. No live network needed. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const db = require('../js/db.js');
const engine = require('../js/engine.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS | ' + name); }
const facts = JSON.parse(fs.readFileSync(new URL('../test/psu-spec-facts.json', import.meta.url)));
for (const fact of facts.facts) test('厂家事实保留：' + fact.id, () => {
  const p = db.psus.find(p => p.id === fact.id);
  assert.ok(p?.verified && p.sourceUrl === fact.source);
  for (const [key, value] of Object.entries(fact.expected)) assert.deepEqual(p[key], value, fact.id + '.' + key);
});
const cfg = { cpuId: 'r5-9600x', gpuId: 'rtx5080', mode: 'full', scenario: 'gaming' };
function result(extra = {}) { return engine.calculate({ ...cfg, ...extra }); }
function issues(r) { return r.issues.map(i => i.code); }
test('300W线缆不能通过360W显卡校验', () => assert.ok(issues(result({ psuId: 'deepcool-pl650d-v2' })).includes('PSU_16PIN_POWER')));
test('容量足够时也排除450W线缆带575W显卡', () => {
  const p = db.psus.find(p => p.id === 'deepcool-pl750d-v2');
  const previous = p.watts;
  try { p.watts = 1600; assert.ok(!result({ gpuId: 'rtx5090' }).picks.list.some(x => x.id === p.id)); }
  finally { p.watts = previous; }
});
test('450W边界通过，开启GPU超频后被额定线缆拦截', () => {
  const atLimit = result({ gpuId: 'rtx4090', psuId: 'deepcool-pl750d-v2' });
  assert.ok(!issues(atLimit).includes('PSU_16PIN_POWER'));
  assert.ok(issues(result({ gpuId: 'rtx4090', psuId: 'deepcool-pl750d-v2', gpuOc: true })).includes('PSU_16PIN_POWER'));
});
test('600W单线缆满足575W公版，双输入显卡仍需两条线', () => {
  assert.ok(!issues(result({ gpuId: 'rtx5090', psuId: 'seasonic-prime-tx1300' })).includes('PSU_16PIN_POWER'));
  const dual = result({ gpuAibId: 'msi-lightning-z-5090' });
  assert.ok(dual.picks.list.length && dual.picks.list.every(p => p.conn12v2x6 >= 2 && p.connector16Watts.length >= 2));
});
test('ATX 3.1无16-pin的款式不会推荐给16-pin显卡', () => assert.ok(!result().picks.list.some(p => !p.conn12v2x6)));
test('未知线缆额定功率不参与16-pin推荐，也不能确认复用', () => {
  const r = result({ gpuId: 'rtx5070', psuId: 'fsp-vita-gm750' });
  assert.ok(issues(r).includes('PSU_16PIN_UNVERIFIED'));
  assert.equal(r.existingPsu.reusable, null);
  assert.ok(!r.picks.list.some(p => p.id === 'fsp-vita-gm750'));
});
test('待核旧型号不会变成购买候选或通过安装校验', () => {
  const r = result({ psuId: 'sama-xp1000', caseId: 'case-nr200p' });
  assert.equal(r.existingPsu.reusable, null);
  assert.ok(issues(r).includes('PSU_SPEC_UNVERIFIED'));
  assert.ok(!issues(r).includes('PSU_FORMFACTOR'));
  assert.ok(r.picks.list.every(p => p.verified));
});
test('SATA硬盘按供电口筛选，NVMe不占SATA供电', () => {
  const hdd = result({ gpuId: '__igpu__', storage: [{ id: 'ssd-870evo-1t', qty: 7 }], psuId: 'msi-mag-a550bn' });
  assert.ok(issues(hdd).includes('PSU_SATA_COUNT'));
  assert.ok(hdd.picks.list.every(p => p.sata >= 7));
  const nvme = result({ gpuId: '__igpu__', storage: [{ id: db.storage.find(d => d.kind === 'NVMe').id, qty: 7 }], psuId: 'msi-mag-a550bn' });
  assert.ok(!issues(nvme).includes('PSU_SATA_COUNT'));
});
test('未拆分SATA数量显示未知，不能判定复用', () => {
  const r = result({ gpuId: '__igpu__', psuId: 'seasonic-core-gc650-atx31', storage: [{ id: 'ssd-870evo-1t', qty: 1 }] });
  assert.ok(issues(r).includes('PSU_SATA_UNVERIFIED'));
  assert.equal(r.existingPsu.reusable, null);
});
test('低功耗办公配置有450–650W预算型号', () => {
  const r = result({ gpuId: '__igpu__', mode: 'quick', scenario: 'office' });
  assert.ok(r.picks.value.watts <= 650 && r.picks.value.price < 400);
});
test('显存版本不会共用错误功耗', () => {
  assert.equal(result({ gpuId: 'rx9060xt-8gb' }).gpuWatts, 150);
  assert.equal(result({ gpuId: 'rx9060xt' }).gpuWatts, 160);
  assert.equal(result({ gpuId: 'rtx4060ti-8gb' }).gpuWatts, 160);
  assert.equal(result({ gpuId: 'rtx4060ti' }).gpuWatts, 165);
});
test('PPT和额外超频假设不冒充厂家实测', () => {
  assert.equal(result().items.find(i => i.label === 'CPU').confidence, 'estimate');
  assert.equal(result({ gpuOc: true }).items.find(i => i.label === '显卡').confidence, 'estimate');
});
test('生成显卡尺寸超限为待核警告，非已核物理错误', () => {
  const a = db.aibs.find(a => a.generated && a.length > 322 && a.confidence === 'estimate');
  assert.ok(a);
  const r = result({ gpuAibId: a.id, caseId: 'case-nr200p' });
  assert.equal(r.issues.find(i => i.code === 'GPU_TOO_LONG')?.level, 'warn');
});
test('未知价格不会以0元占据性价比推荐', () => {
  const p = db.psus.find(p => p.id === 'xpg-pylon450'), price = p.price;
  try { p.price = 0; assert.notEqual(result({ gpuId: '__igpu__', mode: 'quick' }).picks.value?.id, p.id); }
  finally { p.price = price; }
});
console.log('电源专项回归 ' + checks + ' / ' + checks + ' 通过');
