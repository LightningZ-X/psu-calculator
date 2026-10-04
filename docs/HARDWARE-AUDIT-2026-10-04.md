# 2026-10-04 硬件参数专项审计

本次更新重点是电源选型。原库46条电源，新补25条，共71条：38条已逐型号核对厂家资料中的关键规格，33条旧记录缺少明确版本或可靠规格来源，暂列待核实。后者仅保留旧方案的ID、名称及原录功率/预算值；错误或无依据的规范、认证、接口数不再展示或参与推荐。数据版本为2026.10.1。

“有厂家依据”不表示每个字段都已经确定。未公布的ATX细版本、独立线束数量、16-pin额定功率、混合SATA/Molex接头数量明确保留未知值。网页可能随批次变更，按记录的版本核对实物包装。

## 新增25条

| 系列 | 本次型号 | 关键区别 | 厂家资料 |
| --- | --- | --- | --- |
| MSI MAG BN | A550BN、A650BN | 铜牌非模组；1个EPS、2个PCIe、5个SATA；无16-pin | [A550BN](https://us.msi.com/Power-Supply/MAG-A550BN/Specification)、[A650BN](https://us.msi.com/Power-Supply/MAG-A650BN/Specification) |
| MSI MAG GL | A650GL、A750GL PCIE5、A850GL PCIE5 | A650GL无16-pin且SATA为6个；A750GL的16-pin为450W；A850GL为600W。PCIE5、II与包装版本分开核对 | [650](https://us.msi.com/Power-Supply/MAG-A650GL/Specification)、[750](https://us.msi.com/Power-Supply/MAG-A750GL-PCIE5)、[850](https://us.msi.com/Power-Supply/MAG-A850GL-PCIE5/Specification) |
| DeepCool PL-D V2 | PL550D、PL650D、PL750D V2 | ATX3.1铜牌非模组，550/650W的16-pin为300W，750W为450W；不是旧款ATX3.0 PL-D | [550](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PL550D-V2-ATX3.1-Direct-Power-Supply/2024/19090.shtml)、[650](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PL650D-V2-ATX3.1-Direct-Power-Supply/2024/19091.shtml)、[750](https://deepcool.com/products/PowerSupplyUnits/powersupplyunits/PL750D-V2-ATX3.1-Direct-Power-Supply/2024/19092.shtml) |
| DeepCool PN-M | PN650M、PN750M WH、PN850M | 金牌全模组；650W线缆450W，750W白色与850W线缆600W；2个EPS、3个PCIe、8个SATA | [650](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PN650M-ATX3.1-Modular-Power-Supply/2023/17878.shtml)、[750白色](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/2024/19529.shtml)、[850](https://deepcool.com/products/PowerSupplyUnits/powersupplyunits/PN850M-ATX3.1-Modular-Power-Supply/2023/17874.shtml) |
| Cooler Master MWE Bronze V3 230V | 550、650、750W | ATX3.1不代表有16-pin；此系列没有随附16-pin；输入200–240V，不能写成全球宽幅版 | [550](https://www.coolermaster.com/en-in/products/mwe-bronze-550-v3-230v.html)、[650](https://www.coolermaster.com/en-in/products/mwe-bronze-650-v3-230v.html)、[750](https://www.coolermaster.com/en-au/products/mwe-bronze-750-v3-230v.html) |
| FSP VITA GM | 650W非GEN5、650W GEN5、750W、850W White | 650非GEN5无16-pin，其余有；16-pin额定功率暂未确认，不能自动推荐给16-pin显卡 | [650](https://www.fsplifestyle.com/en/product/VITAGM650W.html)、[650 GEN5](https://www.fsplifestyle.com/en/product/VITAGM650WGEN5.html)、[750](https://www.fsplifestyle.com/en/product/VITAGM750W.html)、[850白色](https://www.fsplifestyle.com/us/product/VITAGM850W_WHITE.html) |
| XPG PYLON | 450、550、650、750W | 铜牌非模组；450/550的EPS、PCIe、SATA为1/2/5；650/750为2/4/8。官网写ATX2.4、时序符合2.52，资料表有2.52文案；记录版本差异 | [规格页](https://www.xpg.com/us/xpg/670?tab=spec)、[资料表](https://www.adata.com/upload/downloadfile/Datasheet_XPG_PYLON_PSU.pdf) |
| Seasonic CORE GC ATX3.1 | 650、750、850W | 金牌非模组；650无16-pin；750线缆450W，850线缆600W。官网混合SATA/Molex数量未拆分，SATA暂留未知 | [厂家规格及线材表](https://seasonic.com/core-gc-atx-3-1/) |

## 纠正的旧型号

- THOR 1200P2是铂金，不能混入THOR 1600T的钛金认证；厂家列8个PCIe、12个SATA。随附显卡侧16-pin线缆不代表PSU有原生16-pin插座或符合ATX3.1。[ASUS规格](https://rog.asus.com/br/power-supply-units/rog-thor/rog-thor-1200p2-gaming-model/spec/)
- SF1000 2024是SFX、ATX3.1，4个PCIe、8个SATA，不能混为SFX-L。[Corsair规格](https://www.corsair.com/us/en/p/psu/cp-9020257-na/sf-series-sf1000-fully-modular-80-plus-platinum-sfx-power-supply-cp-9020257-na)
- FOCUS SGX-750 2021是标准SFX，没有随附16-pin；更早SGX系列有SFX-L版本，不能混用。[Seasonic规格](https://seasonic.com/focus-sgx-2021/)
- FOCUS GX-650旧版不属于2024 ATX3.1 FOCUS GX（该版只有750/850/1000W）；旧650W有4个PCIe、2个EPS、10个SATA。2024的750W为2个PCIe，850/1000W为3个，均为8个SATA。[旧版表](https://seasonic.com/wp-content/uploads/2024/04/FOCUS-GX-FX.pdf)、[2024表](https://seasonic.com/wp-content/uploads/2024/07/ATX3.1-FOCUS-GX.pdf)
- PRIME TX-1300/1600 ATX3.1分别有1/2条16-pin，均6个PCIe、3个EPS、18个SATA（含2个SATA3.3）；PX1600同样18个SATA。[TX表](https://seasonic.com/wp-content/uploads/2025/03/Prime-TX-ATX-3.0-2024-v2.pdf)、[PX规格](https://seasonic.com/atx3-1-prime-px/)。[厂家线材指南](https://knowledge.seasonic.com/article/72-psu-recommendations-for-nvidia-rtx-4000-cards)补充原厂16-pin线材600W额定值；不将此值套用到CORE GC750。
- PQ1000M是ATX2.4，没有随附16-pin；6个PCIe、10个SATA。[DeepCool规格](https://www.deepcool.com/products/PowerSupplyUnits/powersupplyunits/PQ1000M-80-PLUS-Gold-Modular-Power-Supply/2021/14033.shtml)
- MEG Ai1300P/Ai1000P PCIE5均8个PCIe，SATA分别16/12。按ATX3.0 PDF资料版本记录，网页有3.1文案冲突，提示按包装批次核对。[1300规格](https://us.msi.com/Power-Supply/MEG-Ai1300P-PCIE5/Specification)、[1000规格](https://us.msi.com/Power-Supply/MEG-Ai1000P-PCIE5/Specification)

## CPU、显卡和其他硬件的检查边界

全库执行ID唯一性、型号关联、功耗/接口字段范围、插槽映射、内存规格及发布文案计数的自洽检查。自洽通过不等于全部164款CPU、73款GPU、2439个AIC组合及其他部件都经厂家逐项复核。

- RX9060XT拆为8GB 150W和16GB 160W起；RTX4060Ti拆为8GB 160W、16GB 165W。保留原ID给16GB，新增8GB ID，避免破坏已存方案。[AMD发布表](https://www.amd.com/zh-tw/newsroom/press-releases/2025-5-20-amd-introduces-new-radeon-graphics-cards-and-ryzen.html)、[NVIDIA规格](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/)
- AMD的TDP不作为PPT的官方依据；当前PPT用于规划估算。额外CPU/GPU超频值及显卡瞬时倍率明确为工程假设，估算占比不再沿用厂家置信度。自定义功耗墙以用户实际设置核对。
- 规则生成AIC的功耗墙、接口、长度和槽厚不是已核SKU规格；估算长度超限降为待核警告，不据此声称已确认装不下。实物安装、独立线束、BIOS支持仍需按具体SKU核对。
- 未发布/泄露型号保留推演标记；本次不声称已复核其发布状态。主板/机箱/内存/散热器来源覆盖尚未完成全量逐SKU审计。

## 推荐与预算口径

仅有厂家依据的电源进入候选。按实际显卡功耗值（包括超频取值）、随附16-pin数量与额定功率、EPS、机箱电源规格、SATA硬盘数量筛选。16-pin保守按整卡功耗预留，不扣PCIe插槽供电；双输入按每条至少承担一半规划功耗检查，实际功率分配仍以显卡说明为准。

独立PCIe线束数与接头数分别记录；接头足量但需串接时发出待核提示，不据此确认直接复用。缺少SATA/16-pin功率资料的型号在对应需求下不自动推荐；选择待核旧型号时不把未知规格当0或ATX默认值。

**所有电源价格均为预算占位估值，未核对2026-10-04中国商家到手价。** 日期只表示规格核对时间，不表示价格采样时间；性价比排序是预算辅助，不是市场最低价或质量排名。无价条目不能当0元电源赢得性价比推荐。

## 验证依据

`test/psu-spec-facts.json`保存独立人工摘录的25组厂家事实；`tools/psucheck.mjs`校验事实与14项实际选型边界。该离线回归防止以后误改，并不替代厂家网页核对。原计算回归中的逐项瓦数、规划值、场景值、瞬时值和推荐瓦数区间未变化；购买候选瓦数/型号和线束问题码因本次资料修正而改变，重抓基线前审阅并记录差异。

本次最终验证：引擎225/225、电源专项39/39、方案与导出40/40、主页面交互144/144、单文件11/11；数据自洽性、11组计算基线、安全净化、无障碍、设计、320/390px窄屏、双列布局及动效检查通过。数据库仍提示两个新增8GB显卡未收录参考价，以及AMD原装散热器不支持Intel插槽；保留这些真实限制，不补猜测值。
