# 硬件扩充记录（2026-10-27）

数据版本：2026.10.2。新增 32 条可选硬件，原有 ID 保留，已有方案可继续载入。本轮未重新核查整个数据库，也未更新电源专项核查日期（仍为 2026-10-04）。新增型号未采集实时价格，`price: 0` 表示未知，不表示免费。

## 新增显卡：4 款

| 型号 | 基准 TBP | 显存 / 位宽 | 供电 | 厂家依据 |
|---|---:|---|---|---|
| RX 7900 XT | 315W | 20GB / 320-bit | 2×8pin | [AMD](https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-7000-series/amd-radeon-rx-7900-xt.html) |
| RX 7900 GRE | 260W | 16GB / 256-bit | 2×8pin | [AMD](https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7900-gre.html) |
| RX 7700 XT | 245W | 12GB / 192-bit | 2×8pin | [AMD](https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7700-xt.html) |
| RX 7600 XT | 190W | 16GB / 128-bit | 2×8pin | [AMD](https://www.amd.com/en/products/graphics/desktops/radeon/7000-series/amd-radeon-rx-7600-xt.html) |

`official` 对应基准 TBP、显存及供电接口；通用槽宽、瞬态倍率仍为估算，备注中单独说明。AMD 对 7900 XT / 7700 XT / 7600 XT 的整机电源建议分别为 750W / 700W / 600W，基于指定测试平台，存入备注，不冒充任意非公版的厂商建议。

显卡总数 73 → 77。现有 AIC 规则由此新增 73 个估算板型，总数 2439 → 2512；这些组合仍标 `estimate`，不新增“已核板型”承诺。已核 SKU 仍为 24 条，华擎精确覆盖白名单保持原样。本轮没有逐条验证新生成组合的商品存在性、尺寸或 BIOS 功耗墙。

## 新增存储：12 条容量型号

| 系列 | 新增容量 | 规划功耗（与容量同序） | 依据与口径 |
|---|---|---|---|
| KC3000 | 512GB / 1TB / 4TB | 4.1 / 6.3 / 10.2W | [官方数据表](https://www.kingston.com/datasheets/KC3000_en.pdf)，最大写入；1TB / 4TB 对应 1024GB / 4096GB |
| FURY Renegade PCIe 4.0 | 1TB / 2TB / 4TB | 6.3 / 9.9 / 10.2W | [官方数据表](https://www.kingston.com/datasheets/sfyr_en.pdf)，最大写入；不混用 G5 版本 |
| NV3 PCIe 4.0 | 500GB / 1TB / 2TB / 4TB | 5 / 5 / 6 / 7W | [官方数据表](https://www.kingston.com/datasheets/snv3s_en.pdf)只确认型号容量；瓦数为同类无缓存 Gen4 SSD 规划预算，全部标 `estimate` |
| A400 SATA 2.5 英寸 | 480GB / 960GB | 1.535 / 1.535W | [官方数据表](https://www.kingston.com/datasheets/SA400S37_us.pdf)，最大写入，SA400S37 版本 |

存储总数 36 → 48。SSD 不加入机械盘启动功耗；NVMe 继续参与 M.2 插槽校验，A400 参与 SATA 电源口校验。新条目的厂家链接写入运行时来源表，可供界面及导出引用。

## 新增风冷：8 款

| 型号 | 原装风扇数量 | 每只输入功率 | 厂家依据 |
|---|---:|---:|---|
| Noctua NH-U12A | 2 | 最大 1.68W | [数据表](https://www.noctua.at/pub/media/blfa_files/infosheet/noctua_nh_u12a_datasheet_en_v3_web.pdf) |
| Noctua NH-U12S redux | 1 | 最大 1.08W | [散热器规格](https://www.noctua.at/en/products/nh-u12s-redux/specifications)、[原装风扇](https://www.noctua.at/en/products/nf-p12-redux-1700-pwm/specifications) |
| Noctua NH-D12L | 1 | 最大 1.68W | [散热器规格](https://www.noctua.at/en/products/nh-d12l/specifications)、[原装风扇](https://www.noctua.at/en/products/nf-a12x25r-pwm/specifications) |
| Noctua NH-D15 | 2 | 最大 1.56W | [数据表](https://noctua.at/pub/media/blfa_files/infosheet/noctua_nh_d15_datasheet_en_web_3.pdf) |
| Noctua NH-U9S | 1 | 最大 1.2W | [数据表](https://noctua.at/pub/media/blfa_files/infosheet/noctua_nh_u9s_datasheet_en_web_3.pdf) |
| DeepCool AK400 | 1 | 标称 1.56W | [规格](https://deepcool.com/products/Cooling/cpuaircoolers/AK400-Performance-CPU-Cooler-1851-1700-AM5/2024/15222.shtml) |
| DeepCool AK500 | 1 | 标称 1.44W | [规格](https://www.deepcool.com/products/Cooling/cpuaircoolers/AK500-High-Performance-CPU-Cooler-1851-1700-AM5/2022/16040.shtml) |
| DeepCool AK620 | 2 | 标称 1.44W | [规格](https://www.deepcool.com/products/Cooling/cpuaircoolers/AK620-High-Performance-CPU-Cooler-1851-1700-AM5/2024/13067.shtml) |

散热器总数 9 → 17。上述都是无灯、无数显的原版，不混用 DIGITAL、G2 或另售风扇规格。支持本库 LGA1851 / LGA1700 / LGA1200 / AM5 / AM4；旧批次扣具需按厂家升级套件确认，条目均有备注。功率是风扇电气输入，不是 CPU 散热能力；本轮没有新增散热性能或风冷限高模型。

## 新增风扇：8 款

| 型号 | 尺寸 | 输入功率 | 厂家依据与口径 |
|---|---:|---:|---|
| ARCTIC P12 PWM PST | 120mm | 1.2W | [规格](https://www.arctic.de/en/P12-PWM-PST/P12-PWM-PST)，12V × 0.1A |
| ARCTIC P12 Max FDB | 120mm | 3.48W | [数据表](https://www.arctic.de/media/3d/1d/c2/1705490814/Spec_Sheet_P12_Max_EN.pdf)，12V × 0.29A，不混用旧双滚珠批次 |
| ARCTIC P12 Slim PWM PST | 120mm / 厚15mm | 1.44W | [数据表](https://www.arctic.de/media/57/d0/e2/1647521732/Spec_Sheet_P12_Slim_PWM_PST_EN_6years.pdf)，12V × 0.12A |
| Noctua NF-A14 PWM | 140mm | 1.56W | [规格](https://www.noctua.at/en/products/nf-a14-pwm/specifications)，最大输入 |
| Noctua NF-F12 PWM | 120mm | 0.6W | [规格](https://www.noctua.at/en/products/nf-f12-pwm/specifications)，最大输入 |
| Noctua NF-P12 redux-1700 PWM | 120mm | 1.08W | [规格](https://www.noctua.at/en/products/nf-p12-redux-1700-pwm/specifications)，最大输入 |
| Noctua NF-A14x25 G2 PWM | 140mm | 2.28W | [规格](https://www.noctua.at/en/products/nf-a14x25-g2-pwm/specifications)，最大输入 |
| Noctua NF-A12x15 PWM | 120mm / 厚15mm | 1.56W | [规格](https://www.noctua.at/en/products/nf-a12x15-pwm/specifications)，最大输入 |

风扇总数 8 → 16。本轮新增均无 ARGB，不叠加灯效预算。ARCTIC 标称电流折算值不宣称为启动峰值；现有模型未独立建模风扇启动电流。

## 修正旧条目：3 条

- `ssd-kc3000-2t`：7W → 9.9W，改取官方 2048GB 最大写入功率。
- `air-nhd15-g2`：每只 1.7W → 2.28W，双风扇合计 4.56W，依据 [Noctua 数据表](https://noctua.at/pub/media/blfa_files/infosheet/NH-D15_G2_.pdf)。
- `fan-arctic-p14`：2.4W → 1.44W，依据 [官方数据表](https://www.arctic.de/media/1d/98/04/1693306037/Spec_Sheet_P14_PWM_PST_EN.pdf) 的 12V / 0.12A。

三个旧 ID 均不变，改为 `official` 并替换来源；包含这些部件的历史方案重新计算时会采用修正值。

## 验证

- 数据自洽性审计通过；新增四款显卡因未采集参考价产生预期提醒，其余提醒为原有两款显卡无价格、AMD 原装散热器不支持 Intel。
- 引擎自检 229/229、电源专项 39/39、方案浏览器回归 50/50 通过。
- 在隔离的 Edge 配置中逐个搜索并选入新增 32 条硬件，全部成功且计算结果为有限数。
- 完整浏览器检查通过，覆盖常规交互、离线版、窄屏、来源声明及开场流程。
- 基线比对先确认瓦数、明细项数与问题码无变化；唯一目录变化是 ITX 升级候选从 Arc B580（190W）变为新增 RX 7600 XT（190W）。仅更新这一处候选名称预期，再比对 11 组夹具通过；不代表两个型号的性能相等。
- 单文件离线版已重新构建；发布版本为 v3.1.1，数据版本为 2026.10.2。
