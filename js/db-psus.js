/* PSU specification audit, 2026-10-04.
 * Counts refer to supplied device-side connectors, not sockets on the PSU.
 * Prices are budget estimates, never live retailer quotes. Unknown cable ratings
 * remain null; an ATX version does not imply a 600 W cable or a 16-pin cable.
 */
(function (root) {
  'use strict';
  var checkedAt = '2026-10-04';
  var rows = [];
  function add(id, brand, series, model, watts, efficiency, atx, modular,
               pin16, pcie, eps, sata, rating, cables, price, url, revision, extra) {
    rows.push(Object.assign({ id: id, brand: brand, series: series, model: model,
      watts: watts, efficiency: '80 PLUS ' + efficiency, atx: atx, modular: modular,
      formFactor: 'ATX', conn12v2x6: pin16, pcie8pin: pcie, eps8pin: eps, sata: sata,
      connector16Watts: pin16 ? (rating == null ? null : Array.isArray(rating) ? rating : [rating]) : [],
      pcie8pinCables: cables, price: price, priceKind: 'budget-estimate',
      confidence: 'official', verified: true, checkedAt: checkedAt,
      revision: revision, tier: watts <= 750 ? '基础' : watts <= 1200 ? '均衡' : '旗舰',
      sourceUrl: url, connector16Type: pin16 ? '16-pin' : '无随附16-pin线缆'
    }, extra || {}));
  }
  var msi = '微星 MSI', dc = '九州风神 DeepCool', ss = '海韵 Seasonic';
  var cm = '酷冷至尊 Cooler Master';
  add('msi-mag-a550bn', msi, 'MAG BN', 'MAG A550BN', 550, '铜牌', 'ATX（细版本未公布）', '非模组',
    0, 2, 1, 5, null, null, 269, 'https://us.msi.com/Power-Supply/MAG-A550BN/Specification', 'A550BN');
  add('msi-mag-a650bn', msi, 'MAG BN', 'MAG A650BN', 650, '铜牌', 'ATX（细版本未公布）', '非模组',
    0, 2, 1, 5, null, null, 299, 'https://us.msi.com/Power-Supply/MAG-A650BN/Specification', 'A650BN');
  add('msi-mag-a650gl', msi, 'MAG GL', 'MAG A650GL（无16-pin）', 650, '金牌', 'ATX（细版本未公布）', '全模组',
    0, 4, 2, 6, null, null, 449, 'https://us.msi.com/Power-Supply/MAG-A650GL/Specification', 'A650GL，非 PCIE5 / II');
  add('msi-mag-a750gl-pcie5', msi, 'MAG GL', 'MAG A750GL PCIE5（ATX 3.1版）', 750, '金牌', 'ATX 3.1', '全模组',
    1, 3, 2, 8, 450, 2, 549, 'https://us.msi.com/Power-Supply/MAG-A750GL-PCIE5', '官网当前 ATX 3.1 版本；旧批次 ATX 3.0 不混用',
    { connector16Type: '12V-2x6', note: '随附16-pin线缆450W；购买时核对包装版本。' });
  add('msi-mag-a850gl-pcie5', msi, 'MAG GL', 'MAG A850GL PCIE5', 850, '金牌', 'ATX（按包装核对版本）', '全模组',
    1, 4, 2, 8, 600, null, 649, 'https://us.msi.com/Power-Supply/MAG-A850GL-PCIE5/Specification', 'PCIE5，非 PCIE5 II',
    { note: '规格页确认随附16-pin线缆600W；ATX细版本须核对实际包装。' });
  add('deepcool-pl550d-v2', dc, 'PL-D V2', 'PL550D V2', 550, '铜牌', 'ATX 3.1', '非模组',
    1, 3, 2, 6, 300, 2, 279, 'https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PL550D-V2-ATX3.1-Direct-Power-Supply/2024/19090.shtml', 'V2 / ATX 3.1，非旧款 PL-D', { connector16Type: '12V-2x6' });
  add('deepcool-pl650d-v2', dc, 'PL-D V2', 'PL650D V2', 650, '铜牌', 'ATX 3.1', '非模组',
    1, 3, 2, 6, 300, 2, 329, 'https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PL650D-V2-ATX3.1-Direct-Power-Supply/2024/19091.shtml', 'V2 / ATX 3.1，非旧款 PL-D', { connector16Type: '12V-2x6' });
  add('deepcool-pl750d-v2', dc, 'PL-D V2', 'PL750D V2', 750, '铜牌', 'ATX 3.1', '非模组',
    1, 3, 2, 8, 450, 2, 379, 'https://deepcool.com/products/PowerSupplyUnits/powersupplyunits/PL750D-V2-ATX3.1-Direct-Power-Supply/2024/19092.shtml', 'V2 / ATX 3.1，非旧款 PL-D', { connector16Type: '12V-2x6' });
  add('deepcool-pn650m', dc, 'PN-M', 'PN650M', 650, '金牌', 'ATX 3.1', '全模组',
    1, 3, 2, 8, 450, 3, 449, 'https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PN650M-ATX3.1-Modular-Power-Supply/2023/17878.shtml', 'R-PN650M-FC0B', { connector16Type: '12V-2x6' });
  add('deepcool-pn850m', dc, 'PN-M', 'PN850M', 850, '金牌', 'ATX 3.1', '全模组',
    1, 3, 2, 8, 600, 3, 599, 'https://deepcool.com/products/PowerSupplyUnits/powersupplyunits/PN850M-ATX3.1-Modular-Power-Supply/2023/17874.shtml', 'R-PN850M-FC0B', { connector16Type: '12V-2x6' });
  add('deepcool-pn750m-white', dc, 'PN-M', 'PN750M WH（白色）', 750, '金牌', 'ATX 3.1', '全模组',
    1, 3, 2, 8, 600, 3, 549, 'https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/2024/19529.shtml', 'PN750M WH，单独按白色版页面核对', { connector16Type: '12V-2x6' });
  add('coolermaster-mwe550-bronze-v3-230v', cm, 'MWE Bronze V3', 'MWE Bronze 550 V3 230V', 550, '铜牌', 'ATX 3.1', '非模组',
    0, 2, 2, 6, null, null, 269, 'https://www.coolermaster.com/en-in/products/mwe-bronze-550-v3-230v.html', 'MPE-5501-ACABW-3B', { inputVoltage: '200–240V', note: '230V版；无随附16-pin线缆。' });
  add('coolermaster-mwe650-bronze-v3-230v', cm, 'MWE Bronze V3', 'MWE Bronze 650 V3 230V', 650, '铜牌', 'ATX 3.1', '非模组',
    0, 4, 2, 6, null, null, 319, 'https://www.coolermaster.com/en-in/products/mwe-bronze-650-v3-230v.html', 'MPE-6501-ACABW-3B', { inputVoltage: '200–240V', note: '230V版；无随附16-pin线缆。' });
  add('coolermaster-mwe750-bronze-v3-230v', cm, 'MWE Bronze V3', 'MWE Bronze 750 V3 230V', 750, '铜牌', 'ATX 3.1', '非模组',
    0, 4, 2, 6, null, null, 369, 'https://www.coolermaster.com/en-au/products/mwe-bronze-750-v3-230v.html', 'MPE-7501-ACABW-3B', { inputVoltage: '200–240V', note: '230V版；无随附16-pin线缆。' });
  add('fsp-vita-gm650', '全汉 FSP', 'VITA GM', 'VITA GM 650W（非 GEN5）', 650, '金牌', 'ATX 3.1', '全模组',
    0, 4, 2, 8, null, 2, 399, 'https://www.fsplifestyle.com/en/product/VITAGM650W.html', 'VITA-650GM，非 GEN5');
  add('fsp-vita-gm650-gen5', '全汉 FSP', 'VITA GM', 'VITA GM 650W GEN5', 650, '金牌', 'ATX 3.1', '全模组',
    1, 4, 2, 8, null, 2, 449, 'https://www.fsplifestyle.com/en/product/VITAGM650WGEN5.html', 'VITA-650GM GEN5',
    { connector16Type: '12V-2x6', note: '随附16-pin线缆数量已核；额定功率未确认，不进入16-pin显卡的自动推荐。' });
  add('fsp-vita-gm750', '全汉 FSP', 'VITA GM', 'VITA GM 750W', 750, '金牌', 'ATX 3.1', '全模组',
    1, 4, 2, 8, null, 2, 499, 'https://www.fsplifestyle.com/en/product/VITAGM750W.html', 'VITA-750GM',
    { connector16Type: '12V-2x6', note: '16-pin额定功率未确认，不进入16-pin显卡的自动推荐。' });
  add('fsp-vita-gm850-white', '全汉 FSP', 'VITA GM', 'VITA GM 850W White', 850, '金牌', 'ATX 3.1', '全模组',
    1, 4, 2, 8, null, null, 599, 'https://www.fsplifestyle.com/us/product/VITAGM850W_WHITE.html', 'VITA-850GM White Edition',
    { connector16Type: '12V-2x6', inputVoltage: '中国版200–240V；其他地区100–240V', note: '16-pin额定功率未确认，不进入16-pin显卡的自动推荐。' });
  var xpg = 'https://www.xpg.com/us/xpg/670?tab=spec';
  var xpgNote = { additionalSources: ['https://www.adata.com/upload/downloadfile/Datasheet_XPG_PYLON_PSU.pdf'], note: 'ATX 2.4（时序按2.52）；650/750W的第二个CPU接头为整8pin，非4+4。' };
  add('xpg-pylon450', '威刚 XPG', 'PYLON', 'PYLON 450', 450, '铜牌', 'ATX 2.4', '非模组', 0, 2, 1, 5, null, null, 239, xpg, 'PYLON / 2022后5年保修版本', xpgNote);
  add('xpg-pylon550', '威刚 XPG', 'PYLON', 'PYLON 550', 550, '铜牌', 'ATX 2.4', '非模组', 0, 2, 1, 5, null, null, 279, xpg, 'PYLON / 2022后5年保修版本', xpgNote);
  add('xpg-pylon650', '威刚 XPG', 'PYLON', 'PYLON 650', 650, '铜牌', 'ATX 2.4', '非模组', 0, 4, 2, 8, null, null, 329, xpg, 'PYLON / 2022后5年保修版本', xpgNote);
  add('xpg-pylon750', '威刚 XPG', 'PYLON', 'PYLON 750', 750, '铜牌', 'ATX 2.4', '非模组', 0, 4, 2, 8, null, null, 379, xpg, 'PYLON / 2022后5年保修版本', xpgNote);
  var core = 'https://seasonic.com/core-gc-atx-3-1/';
  add('seasonic-core-gc650-atx31', ss, 'CORE GC', 'CORE GC-650 ATX 3.1', 650, '金牌', 'ATX 3.1', '非模组', 0, 2, 2, null, null, 1, 399, core, 'ATX 3.1，非旧款 CORE GC', { note: '无随附16-pin；官网混合SATA/Molex总数未拆分，SATA数量暂不填。' });
  add('seasonic-core-gc750-atx31', ss, 'CORE GC', 'CORE GC-750 ATX 3.1', 750, '金牌', 'ATX 3.1', '非模组', 1, 2, 2, null, 450, 1, 449, core, 'ATX 3.1，非旧款 CORE GC', { connector16Type: '12V-2x6', note: '官网混合SATA/Molex总数未拆分，SATA数量暂不填。' });
  add('seasonic-core-gc850-atx31', ss, 'CORE GC', 'CORE GC-850 ATX 3.1', 850, '金牌', 'ATX 3.1', '非模组', 1, 3, 2, null, 600, 2, 499, core, 'ATX 3.1，非旧款 CORE GC', { connector16Type: '12V-2x6', note: '官网混合SATA/Molex总数未拆分，SATA数量暂不填。' });
  var focus = 'https://seasonic.com/wp-content/uploads/2024/07/ATX3.1-FOCUS-GX.pdf';
  add('seasonic-focus-gx750', ss, 'FOCUS GX', 'FOCUS GX-750 ATX 3.1（2024）', 750, '金牌', 'ATX 3.1', '全模组',
    1, 2, 2, 8, null, 2, 749, focus, '2024 / v4，非 v5', { connector16Type: '12V-2x6', rail12vWatts: 744 });
  add('seasonic-focus-gx850', ss, 'FOCUS GX', 'FOCUS GX-850 ATX 3.1（2024）', 850, '金牌', 'ATX 3.1', '全模组',
    1, 3, 2, 8, null, 3, 899, focus, '2024 / v4，非 v5', { connector16Type: '12V-2x6', rail12vWatts: 840 });
  add('seasonic-focus-gx1000', ss, 'FOCUS GX', 'FOCUS GX-1000 ATX 3.1（2024）', 1000, '金牌', 'ATX 3.1', '全模组',
    1, 3, 2, 8, null, 3, 1099, focus, '2024 / v4，非 v5', { connector16Type: '12V-2x6', rail12vWatts: 996 });
  var prime = 'https://seasonic.com/wp-content/uploads/2025/03/Prime-TX-ATX-3.0-2024-v2.pdf';
  add('seasonic-prime-tx1300', ss, 'PRIME TX', 'PRIME TX-1300 ATX 3.1', 1300, '钛金', 'ATX 3.1', '全模组',
    1, 6, 3, 18, null, 6, 3299, prime, '2025规格表 / ATX 3.1', { connector16Type: '12V-2x6' });
  add('seasonic-prime-tx1600', ss, 'PRIME TX', 'PRIME TX-1600 ATX 3.1', 1600, '钛金', 'ATX 3.1', '全模组',
    2, 6, 3, 18, null, 6, 5299, prime, '2025规格表 / ATX 3.1', { connector16Type: '12V-2x6' });
  add('seasonic-prime-px1600', ss, 'PRIME PX', 'PRIME PX-1600 ATX 3.1', 1600, '铂金', 'ATX 3.1', '全模组',
    2, 6, 3, 18, null, 6, 4299, 'https://seasonic.com/atx3-1-prime-px/', 'ATX 3.1', { connector16Type: '12V-2x6' });
  // Manufacturer's cable guide explicitly rates the native PRIME / FOCUS
  // 16-pin cables at 600 W. Do not apply this to CORE GC (450 W at 750 W).
  rows.filter(function (p) { return p.brand === ss && /^(PRIME|FOCUS)/.test(p.series); }).forEach(function (p) {
    p.connector16Watts = Array.from({ length: p.conn12v2x6 }, function () { return 600; });
    p.additionalSources = ['https://knowledge.seasonic.com/article/72-psu-recommendations-for-nvidia-rtx-4000-cards'];
  });
  add('seasonic-focus-gx650', ss, 'FOCUS GX', 'FOCUS GX-650（旧版，无16-pin）', 650, '金牌', 'ATX 2.x（细版本未标）', '全模组',
    0, 4, 2, 10, null, 2, 599, 'https://seasonic.com/wp-content/uploads/2024/04/FOCUS-GX-FX.pdf', '旧版 FOCUS GX / FX；非ATX 3.1', { rail12vWatts: 648 });
  add('seasonic-sfx-750', ss, 'SGX', 'FOCUS SGX-750（2021 / SFX）', 750, '金牌', 'ATX 2.x（细版本未标）', '全模组',
    0, 4, 2, 6, null, 3, 1199, 'https://seasonic.com/focus-sgx-2021/', '2021，非旧SGX SFX-L', { formFactor: 'SFX', rail12vWatts: 744 });
  add('deepcool-pq1000m', dc, 'PQ', 'PQ1000M（ATX 2.4，无16-pin）', 1000, '金牌', 'ATX 2.4', '全模组',
    0, 6, 2, 10, null, 3, 899, 'https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PQ1000M-80-PLUS-Gold-Modular-Power-Supply/2021/14033.shtml', 'R-PQA00M-FA0B');
  add('corsair-sf1000', '海盗船 Corsair', 'SF', 'SF1000 Platinum（2024 / SFX）', 1000, '铂金', 'ATX 3.1', '全模组',
    1, 4, 2, 8, 600, 4, 1599, 'https://www.corsair.com/us/en/p/psu/cp-9020257-na/sf-series-sf1000-fully-modular-80-plus-platinum-sfx-power-supply-cp-9020257-na', 'CP-9020257 / 2024',
    { formFactor: 'SFX', connector16Type: 'Type-5直连16-pin', additionalSources: ['https://help.corsair.com/hc/en-us/articles/45351527323793-CORSAIR-Spare-Parts-List'], note: '标准SFX；请勿与SF-L系列混用规格。' });
  add('asus-rog-thor-1200p2', '华硕 ASUS', 'ROG THOR', 'ROG THOR 1200P2 GAMING', 1200, '铂金', 'ATX（官网未标3.x）', '全模组',
    1, 8, 2, 12, null, null, 2999, 'https://rog.asus.com/br/power-supply-units/rog-thor/rog-thor-1200p2-gaming-model/spec/', '1200P2，非1600T / THOR III',
    { connector16Type: '随附16-pin直连线', note: '铂金认证；显卡侧16-pin线缆不代表PSU有原生16-pin插座，也不代表ATX 3.1。' });
  add('msi-meg-ai1300p', msi, 'MEG', 'MEG Ai1300P PCIE5（ATX 3.0版）', 1300, '铂金', 'ATX 3.0', '全模组',
    1, 8, 2, 16, 600, null, 2799, 'https://us.msi.com/Power-Supply/MEG-Ai1300P-PCIE5/Specification', 'PCIE5 / ATX 3.0资料版本，非PCIE5 II', { connector16Type: '12VHPWR', additionalSources: ['https://storage-asset.msi.com/datasheet/power-supply/ca/MEG-Ai1300P-PCIE5.pdf'], note: '按ATX 3.0版PDF记录；不同地区官网有3.1文案，购买时核对包装批次。' });
  add('msi-meg-ai1000p', msi, 'MEG', 'MEG Ai1000P PCIE5（ATX 3.0版）', 1000, '铂金', 'ATX 3.0', '全模组',
    1, 8, 2, 12, 600, null, 1999, 'https://us.msi.com/Power-Supply/MEG-Ai1000P-PCIE5/Specification', 'PCIE5 / ATX 3.0资料版本，非PCIE5 II', { connector16Type: '12VHPWR', additionalSources: ['https://storage-asset.msi.com/datasheet/power-supply/ca/MEG-Ai1000P-PCIE5.pdf'], note: '按ATX 3.0版PDF记录；不同地区官网有3.1文案，购买时核对包装批次。' });

  root.HWDB_PSU_AUDIT = {
    checkedAt: checkedAt,
    apply: function (legacy, sources) {
      var audited = {};
      rows.forEach(function (p) {
        p.source = 'psu:' + p.id;
        sources[p.source] = { label: p.brand + ' — ' + p.model + ' 厂家规格（' + checkedAt + '核对）', url: p.sourceUrl };
        audited[p.id] = p;
      });
      var result = legacy.map(function (p) {
        if (audited[p.id]) { var updated = audited[p.id]; delete audited[p.id]; return updated; }
        // Preserve IDs for saved plans, but do not present unverified legacy
        // specifications as facts or use them to certify reuse/recommendations.
        return Object.assign({}, p, { verified: false, confidence: 'estimate', source: null,
          atx: '待核实', efficiency: '认证待核实', modular: '待核实', formFactor: null,
          conn12v2x6: null, pcie8pin: null, eps8pin: null, sata: null,
          connector16Watts: null, pcie8pinCables: null, priceKind: 'budget-estimate',
          note: '具体版本与厂家规格待核实；保留旧方案引用，不进入自动推荐，不能确认可复用。' });
      });
      Object.keys(audited).forEach(function (id) { result.push(audited[id]); });
      return result;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
