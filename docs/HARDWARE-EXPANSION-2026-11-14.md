# 硬件扩充记录（2026-11-14）

发布版本 v3.1.2，数据版本 2026.11.1。新增 29 条：17 个电源版本、4 条存储容量型号、3 款散热器、2 款风扇、3 款机箱。另为 2 个旧微星电源 ID 补齐官方规格。CPU / GPU / AIC / 主板 / 内存本轮未变。

电源总数 71 → 88；有厂家依据的条目 38 → 57；待核旧型号 33 → 31。保留旧 ID 以兼容本地存档，但不把未分年份的旧 `corsair-rm1000e` 自动解释为 2025 款。

## 电源

下表是设备侧随附接头，不是电源侧插座。`未知`表示所查厂家资料尚未确认额定功率，不是 0W；此类电源可按已知规格校验普通 8pin 显卡，不能确认用于 16pin 显卡。所有本轮新增/补录条目价格均设未知，不凭汇率或系列定位编造人民币报价。

| 型号与版本 | 总瓦数 | 16pin数量 / 线缆额定 | PCIe 6+2 / EPS / SATA | 厂家依据 |
|---|---:|---|---|---|
| MPG A750G PCIE5，ATX 3.0 | 750W | 1 / 450W | 6 / 2 / 8 | [MSI规格](https://www.msi.com/Power-Supply/MPG-A750G-PCIE5/Specification) |
| MPG A850G PCIE5，ATX 3.0 | 850W | 1 / 600W | 6 / 2 / 8 | [MSI规格](https://www.msi.com/Power-Supply/MPG-A850G-PCIE5/Specification)、[ATX版本PDF](https://storage-asset.msi.com/datasheet/power-supply/in/MPG-A850G-PCIE5.pdf) |
| MPG A1000G PCIE5，ATX 3.0，旧ID补录 | 1000W | 1 / 600W | 6 / 2 / 12 | [MSI规格](https://www.msi.com/Power-Supply/MPG-A1000G-PCIE5/Specification) |
| MAG A1000GL PCIE5，ATX 3.1，旧ID补录 | 1000W | 1 / 600W | 4 / 2 / 12 | [MSI规格](https://www.msi.com/Power-Supply/MAG-A1000GL-PCIE5/Specification)、[产品页](https://www.msi.com/Power-Supply/MAG-A1000GL-PCIE5) |
| MAG A1250GL PCIE5，ATX 3.1 | 1250W | 1 / 600W | 4 / 2 / 12 | [MSI规格](https://www.msi.com/Power-Supply/MAG-A1250GL-PCIE5/Specification) |
| PN750M，黑色 | 750W | 1 / 450W | 3 / 2 / 8 | [DeepCool](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PN750M-ATX3.1-Modular-Power-Supply/2023/17877.shtml) |
| PN1000M | 1000W | 1 / 600W | 3 / 2 / 8 | [DeepCool](https://deepcool.com/products/PowerSupplyUnits/powersupplyunits/PN1000M-ATX3.1-Modular-Power-Supply/2024/18962.shtml) |
| PN1200M | 1200W | 1 / 600W | 3 / 2 / 8 | [DeepCool](https://deepcool.com/products/PowerSupplyUnits/powersupplyunits/PN1200M-ATX3.1-Modular-Power-Supply/2024/18963.shtml) |
| PQ650M，ATX 2.4 | 650W | 0 / — | 3 / 2 / 8 | [DeepCool](https://cn.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PQ650M-80-PLUS-Gold-Modular-Power-Supply/2021/14042.shtml) |
| PQ750M，ATX 2.4 | 750W | 0 / — | 3 / 2 / 8 | [DeepCool](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PQ750M-80-PLUS-Gold-Modular-Power-Supply/2021/14031.shtml) |
| PQ850M，ATX 2.4 | 850W | 0 / — | 3 / 2 / 10 | [DeepCool](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PQ850M-80-PLUS-Gold-Modular-Power-Supply/2021/14032.shtml) |
| SF750 Platinum，2024 / SFX | 750W | 1 / 未知 | 2 / 2 / 8 | [Corsair线缆表](https://www.corsair.com/us/en/explorer/diy-builder/power-supply-units/sf750sf850sf1000-platinum-atx-31-everything-you-need-to-know/) |
| SF850 Platinum，2024 / SFX | 850W | 1 / 未知 | 3 / 2 / 8 | [Corsair线缆表](https://www.corsair.com/us/en/explorer/diy-builder/power-supply-units/sf750sf850sf1000-platinum-atx-31-everything-you-need-to-know/) |
| RM650e，2025 | 650W | 1 / 未知 | 1 / 2 / 6 | [Corsair手册](https://www.corsair.com/us/en/explorer/diy-builder/power-supply-units/corsair-rme-series-2025/) |
| RM750e，2025 | 750W | 1 / 600W | 2 / 2 / 6 | [Corsair产品页](https://www.corsair.com/us/en/p/psu/cp-9020295-na/rme-series-rm750e-fully-modular-low-noise-atx-power-supply-cp-9020295-na) |
| RM850e，2025 | 850W | 1 / 600W | 2 / 2 / 6 | [Corsair产品页](https://www.corsair.com/us/en/p/psu/cp-9020296-na/rme-series-rm850e-fully-modular-low-noise-atx-power-supply-cp-9020296-na) |
| RM1000e，2025 | 1000W | 1 / 600W | 2 / 2 / 6 | [Corsair产品页](https://www.corsair.com/us/en/p/psu/cp-9020297-na/rme-series-rm1000e-fully-modular-low-noise-atx-power-supply-cp-9020297-na) |
| PRIME-750G，当前ATX 3.1版 | 750W | 1 / 未知 | 2 / 2 / 5 | [ASUS规格](https://www.asus.com/ie/motherboards-components/power-supply-units/prime/prime-750g/techspec/)、[全模组说明](https://www.asus.com/motherboards-components/power-supply-units/prime/prime-750g/) |
| PRIME-850G，当前ATX 3.1版 | 850W | 1 / 600W | 3 / 2 / 5 | [ASUS规格](https://www.asus.com/motherboards-components/power-supply-units/prime/prime-850g/techspec/)、[600W说明](https://www.asus.com/motherboards-components/power-supply-units/prime/prime-850g/) |

### 不混用的规格

- MPG G 记录 PCIE5 / ATX 3.0 资料版本；MAG GL 记录当前官网 ATX 3.1 版本，购买时核对实际包装。MPG 的 6+2 总数按厂家线缆表，包含替代接法，不宣称可与 16pin 同时全部使用；未确认的独立线束数量仍为 `null`。
- PN750M 黑色版按 450W；不把旧库 PN750M WH 的 600W 数据套给黑色版。
- SF750 / SF850 严格区分随附 2 / 3 个普通 PCIe 接头。不根据 ATX 3.1 或 SF1000 推定它们的 16pin 功率。
- RMe 2025 的认证按厂家记为 `Cybenetics 金牌`，不改写成 80 PLUS。既有认证排序仅定义 80 PLUS 等级，本轮未建立跨认证等价评分。普通 PCIe 数不叠加另附 16pin 转双8pin线，因为它与直连16pin共用插座；未扩展替代线束拓扑求解。RM650e 的双 EPS 是同一线束串接，不等同两根独立线。
- PRIME 750G / 850G 均全模组，CPU 双接头是同一线束；850G 产品介绍明确写出 600W，750G 本轮来源未确认额定值，保留未知。
- PQ 系列按各自当前产品页记录随附线缆，不套用另售/客服升级线缆后的接头数。

## 其他硬件

| 类别 | 新增 | 功耗或兼容性口径 | 厂家依据 |
|---|---|---|---|
| SATA SSD | KC600 256GB / 512GB / 1TB / 2TB | 2.5英寸版本，每盘最大写入3.2W；1/2TB对应1024/2048GB；不混用mSATA | [Kingston数据表](https://www.kingston.com/datasheets/KC600_en.pdf) |
| 风冷 | Phantom Spirit 120 SE | 无灯双风扇，每只0.20A；按12V折算2.4W预算，标`estimate` | [Thermalright](https://www.thermalright.com/product/phantom-spirit-120-se/) |
| 风冷 | Assassin X 120 Refined SE，AM4/AM5专版 | 单风扇0.20A，仅AMD扣具；按12V折算2.4W预算，标`estimate` | [Thermalright](https://www.thermalright.com/product/assassin-x-120-refined-se-am4am5/) |
| 风冷 | Peerless Assassin 120 MINI BLACK | 单风扇0.20A，不按常规PA120双风扇；按12V折算2.4W预算，标`estimate` | [Thermalright](https://www.thermalright.com/product/peerless-assassin-120-mini-black/) |
| 风扇 | NF-A8 PWM / NF-A9 PWM | 80 / 92mm，12V版最大0.96 / 1.2W，非5V版本 | [A8规格](https://www.noctua.at/en/products/nf-a8-pwm/specifications)、[A9规格](https://www.noctua.at/en/products/nf-a9-pwm/specifications) |
| 机箱 | North XL TG 原版 | E-ATX≤330mm，默认显卡限长413mm；前置420/360冷排时380mm | [Fractal数据表](https://www.fractal-design.com/app/uploads/2024/02/North-XL_Product-Sheet_EN.pdf) |
| 机箱 | Pop Air 无RGB原版 | ATX/mATX/ITX；默认显卡限长405mm，前置冷排另扣厚度 | [Fractal数据表](https://assets.fractal-design.com/files/uxzbxy2o/production/aee3c31f032ec28432cd15cf6396576b01b43ec4.pdf)、[安装条件](https://support.fractal-design.com/support/solutions/articles/4000184345-pop-gpu-maximum-length) |
| 机箱 | Meshify 2 Compact 无RGB原版 | ATX/mATX/ITX；默认限长341mm，移除前风扇为360mm；非Lite/RGB | [Fractal数据表](https://www.fractal-design.com/app/uploads/2021/02/Meshify-2-Compact_Product-Sheet_EN.pdf)、[安装条件](https://support.fractal-design.com/support/solutions/articles/4000174759-meshify-2-compact) |

机箱原装风扇仍须在风扇项录入，本轮不改变既有计算方式。前置冷排对显卡空间的影响、电源长度、风冷限高和内存遮挡仅记录在备注，当前引擎未自动校验这些条件。全部新增机箱选无灯版本，灯带预算为0；全部新增硬件价格未知。

## 日期与存档

`HWDB.meta.psuCheckedAt` 表示最新一次补录日期；各电源自身 `checkedAt` 及其来源标签仍使用逐条核对日期。2026-10-04的旧行没有被本轮批量改成新日期。已有配置继续使用相同ID，两个旧微星型号重新计算时可获得已核规格；其他31条待核旧电源继续隔离。

## 验证

- 数据自洽性审计通过；六款显卡缺参考价、两款AMD专用散热器不支持Intel插槽是预期提醒。
- 引擎自检229项、电源专项63项、方案浏览器50项、安全19项、无障碍9项通过；11组计算基线无任何差异，未重抓基线。
- 网页版和单文件离线版分别逐个验证本轮31条新增/补录条目的型号名称搜索、选入、计算及版本计数；全部通过。
- 完整浏览器检查覆盖开场、离线版和响应式布局。首次运行的三项开场失败源于宿主系统启用`prefers-reduced-motion: reduce`；最小浏览器探针确认该值为true。测试现在先显式设置`no-preference`，随后另测`reduce`，两条路径均通过；未修改产品动画或系统设置。
- 离线版已重新构建，随 v3.1.2 发布。
