# 设计与数据约束（维护者笔记）

只记录结论与硬规则。过程记录已合并到本文，改动前先读对应小节。

## 1. 设计约束（硬规则）

自检脚本：`node tools/designcheck.mjs`。这几条一旦破，页面立刻回到「一眼 AI」。

**强调色**

- 全局只有一个强调色：ROG 红。token `--rog`，暗色 `#ff0033`，浅色 `#d40029`（`--rog-dim` 只用于 hover 加深）。
- 用量上限 30 处 `var(--rog)`（当前正好 30，已到顶）。新加一处就得先删一处。
- 只允许出现在 1px 描边、指示条、小控件底色（标志、主按钮、开关轨、4px 指示条）。
- 禁止给大容器铺红底；`designcheck` 按选择器黑名单（`body` / `.card` / `.reco` / `.banner` …）拦截，伪元素不算大容器。

**形态与排版**

- 圆角 `--radius: 2px` 为默认；`--radius-lg: 4px` 只给浮起表面（下拉、抽屉、toast）。不允许 ≥5px。
- 全站 px 字号唯一值 ≤6 档（当前 10 / 11 / 12 / 18 / 20 / 22），禁止 0.5px 假层级。
- 字重 ≤3 档（当前 400 / 600 / 700）。要加字号或字重，必须先合并掉一个。
- 禁止渐变、外发光、emoji。唯一允许的渐变是分区标记的 `///`；`designcheck` 把那条规则整段剔除后再要求零 `linear-gradient`（比 stop 白名单更难绕过）。阴影只允许 `--shadow-float`（浮层），平面卡片不得有 shadow。
- 分组靠亮度与细分隔线，不靠「每块都套同一个深色卡片」。

**斜切（只出现在两处）**

| 位置 | 实现 |
|---|---|
| 分区标记 `///` | `.card > h2::before`，三条等距斜杠。两条会被读成快进符号 |
| 选中 / 关键指示条 | `.scenario.on::after`、`.seg button.on::after`、`.reco .big::after`（4px 红条） |

- 面板与容器一律保持干净矩形，不给容器切角。
- 硬约束一：斜切只切形状，不切文字 —— 全站不得有任何 `transform: skew` 落在文本上。
- 硬约束二：不对可聚焦元素本身用 `clip-path` —— 它会连 `:focus-visible` 的焦点环一起裁掉。`button` / `a` / `input` / `select` 保持矩形，斜切只写在它们的 `::after` 上。（`.switch input { clip-path: inset(50%) }` 是视觉隐藏，不属造型。）

**可达性（与上面同一条流水线）**

- `:focus-visible` 必须是 2px outline；禁止 `outline: none` 压制焦点。
- 浅色主题必须覆盖 `--rog`，保证白底对比度。
- 必须保留 `prefers-reduced-motion` 的通配归零规则。

**打印 = 导出 PDF 的唯一实现**

改任何版面后都要回归 `@media print`：隐藏配置列、展开折叠内容（屏幕态靠 `grid-template-rows: 0fr` 收起，打印必须还原行高与透明度 —— 只断言 `display` 会漏掉「内容在 DOM 里但高度为 0」）、取消行数截断、压平渐变与阴影、红色指示条改黑。

## 2. 启动动画契约

**实现**：Canvas 版，无视频解码器。`js/boot-animation.js` 的 `window.startLightningBoot(canvas, onEnd)` 按 121 帧 / 30fps 的时间轴重绘 LIGHTNING 标志，横屏 1280×720、竖屏 720×1280 居中不拉伸，整段约 4.4s。素材 `assets/boot-mark.png`、`assets/boot-wordmark.png` 由 `canvas.dataset` 传入。

**两段流程**（编排在 `js/ui.js` 末尾的 IIFE）

1. 动画收尾 → 遮罩退场 → 声明弹窗接管。每块加 `psu-boot-item` 并写 `--psu-boot-delay`（序号 × 45ms），整页各块已在 DOM 中就位但不可见；派发 `psu:boot-end` 叫起声明弹窗。
2. 关掉声明 → 整页按 DOM 顺序逐块显现。最后一块落位后清掉全部启动类名、解除 `inert`。

就位名单（`window.__PSU_BOOT__.itemSelector`，测试侧从这里读，不要另抄）：`header.top` → `.page-intro` → `.col-config > .card` → `.col-result .sticky-col > *:not(.print-only)` → `details.section-collapse`。

**类名**

| 名称 | 挂在哪 | 作用 |
|---|---|---|
| `.psu-boot` / `.psu-boot-canvas` | 标记 | 全屏黑幕与画布 |
| `psu-boot-active` | html | 锁滚动、动画播放期 |
| `psu-boot-pending` | html | 黑幕显示、其余内容 `opacity: 0` |
| `psu-boot-running` | html | Canvas 动画进行中 |
| `psu-boot-hold` | html | 各块就位但不可见 |
| `psu-boot-fill` | html | 逐块播放 `psu-content-in` |
| `psu-boot-item` / `--psu-boot-delay` | 页面各块 | 参与第二段的块与其延时 |
| `psu-ui-enter` / `psu-ui-feedback` | 局部 | 弹窗与 details 入场、控件改动反馈 |

**关键帧白名单**（`tools/boot-motion-check.mjs`，`designcheck` 与浏览器检查共用）：关键帧体只允许 `opacity` / `transform`；禁止 `infinite`；`cubic-bezier` 四个分量必须在 0..1；必须保留 reduced-motion 通配归零。

**改这些时要同步的位置**

| 改动 | 必须同步 |
|---|---|
| 新增 / 改名关键帧或 animation 声明 | `assets/style.css` 定义 + `tools/boot-motion-check.mjs` 的 `BOOT_NAMES` 与 forms 白名单 |
| 就位名单、逐块间隔 | `js/ui.js` 的 `ITEM_SELECTOR` / `STAGGER_MS` / `ITEM_MS`；`psu-content-in` 的 `.36s` 要与 `ITEM_MS` 对齐，改一处要改两处 |
| 时间轴断言 | `tools/boot-browser-check.mjs`（真实时钟采样：靠页面内 RAF 采样器判定「一部分已出现 + 一部分还没」的中间态；并断言 `psu:boot-end` 恰好派发一次、结束后无启动类名残留、各块 opacity 归 1、弹窗背后没有漏藏的块） |
| Canvas 时间轴与素材 | `js/boot-animation.js`、`assets/boot-*.png` |
| 单文件产物 | `tools/build-standalone.mjs`（JS 顺序与内联清单）+ `tools/browsertest.mjs` 的 `srcFiles` 产物过期检测 |

**跳过与抑制**

- `?noanim=1`（或 `window.__PSU_NOANIM`）、`prefers-reduced-motion`、打印媒体：连「就位隐藏」都不做，页面原样可用。
- `?nodisclaimer=1`（或 `#nodisclaimer`）抑制声明弹窗；此时不留白，直接逐块弹出。
- 启动中任意 pointerdown / click / keydown / touchstart 立即进入第二段；10 秒兜底进入第二段后作废（看声明多久由用户决定）；页面隐藏、卸载、beforeprint 立即收尾。
- 所有截图与浏览器回归都要带 `?nodisclaimer=1`，否则 fixed 弹窗盖住整页会让断言失真（移动端截图曾漏传给 iframe）。
- 整页显现只有一条路径：不再额外放框架淡入，`psu-boot-reveal` / `psu-page-in` 已不参与运行。

**会话偏好（不是永久偏好）**

- 启动动画「已看过」存 sessionStorage `psu-boot-seen-native-v5`：**按标签页**记一次，新开标签页会完整播一遍，同一标签页刷新不重播。曾经改成 localStorage + 24 小时「同一台机器只放一次」，结果是用户打开网页看不到动画了 —— 对一个靠开场动画立住调性的站点，「打开就有」比「少看几遍」重要得多，所以退回按标签页（并顺手清掉那个会继续压着动画的旧 localStorage 标记）。遮罩右下角有「点击任意处跳过」的纯视觉提示：跳过动作对所有输入方式都已可用（点任意位置 / 按任意键），所以那行提示用 `span` 且不进无障碍树，避免「aria-hidden 里放可聚焦元素」。
- **这里踩过的坑，改动画前必读**：跳过 canvas 只省掉开场那一段，弹窗编排照旧 —— 所以当时 40 条启动用例**没有一条**能发现「动画被整段跳过」，它们全都在断言各块就位 / 弹窗 / 逐块显现，而这些在跳过后照样成立。现在 `tools/boot-browser-check.mjs` 用 `window.__introSeen` 闩锁（rAF 采样 `psu-boot-running` 类名与 canvas 实际宽度）在正常路径与 `file://` 上断言「开场真的在放」，并在同标签刷新那条上断言 `introSeen === false`。别删这几条。
- 注入脚本（`Page.addScriptToEvaluateOnNewDocument`）第一次是**同步**执行的，那时 `documentElement` 还是 `null`：不要在里面无条件访问 `document.documentElement`，否则整个 rAF 采样链当场死掉，表现为所有依赖采样的用例集体失败。
- 声明的「不再提示」存 sessionStorage `psu-calc-2026-v1-disclaimer`，存的是**数据版本号**而不是布尔值：数据库升版会再提示一次；取消勾选会真的清掉；旧 localStorage 键会被主动删除。

## 3. 状态、输入与检查契约

**所有外来状态必须过净化层**

两个来源都不可信：别人发来的 `#c=` 配置链接、本机 localStorage 存档。它们都要经过 `js/app.js` 的 `sanitizeState()` / `sanitizeFeedback()`，再由 `applyClean()` 逐键写回；三条入口分别是 `load()`、`#c=` 应用、`hashchange` 监听。

- 只认 `defaultState()` 认识的键，值按默认值的类型转换；复合字段（`storage` / `customItems` / `extras`）逐元素校形状、限条数、夹数值范围。
- 数值上限**只能比界面更宽，绝不能更窄** —— 更窄会把合法存档静默改小。`index.html` 里 `ramKits` max=4、`fanQty` max=12、`argbChannels` max=12，净化层取 8 / 30 / 24。
- 枚举字段必须用 `Object.prototype.hasOwnProperty.call()` 判定，**不能用 `dict[k]`**：`constructor` / `__proto__` / `toString` 这些继承键都是真值，会绕过白名单，让 `render()` 抛错、结果区**永久停更**（`scenario` 上已实测复现，引擎侧同样要判）。
- 外来值最终会进 HTML 属性位（`value="…"`），每个落点都要 `esc()`。`esc()` 转义 `& < > " '` 五个字符，用它就是完整的。

**条数上限**

`MAX_ROWS = 24`（`js/app.js`）是三处引用的同一个数：界面拒绝添加、净化层截断、提示文案。它存在的唯一理由是**链接长度**。界面拒绝是第一道，净化层的 `slice` 只是防手工构造链接的兜底 —— 曾经只有后者，结果是加到 25 条时链接与刷新会静默砍到 24 条，还被 `save()` 写回存档，数据真的丢失。

**声明弹窗的 inert**

`js/ui.js` 的 `holdBackground()` / `releaseBackground()` 在弹窗打开/关闭时给 `body` 子元素加解 `inert`。两个不能动的细节：只记录并解除**自己动过**的节点（启动序列另有一套 inert，各自无脑清空会互相解除）；解除必须排在**恢复焦点之前**，否则 `lastFocus` 还在 inert 子树里，`focus()` 会被拒绝、焦点就丢了。

**没有 JS 时**

`<html>` 默认带 `no-js` 类，`<head>` **最前面**的内联脚本摘掉它（脚本能跑就说明有 JS），`assets/style.css` 据此收起 `.layout` 与 `.top-actions`，只留 `<noscript>` 的说明。那段脚本必须排在样式表之前，否则会先闪一帧空壳表单。

**无障碍不靠眼看**

标签必须**程序化关联**：`label[for]` 或包裹式；`placeholder` 与 `title` 都不算标签。动态生成的行（硬盘、自定义设备）同样要带名称。`.logo` **不能**加 `role="button"` —— 它内部是 `<h1>`，按钮角色不允许包含标题，会同时破坏标题语义与 HTML 有效性；键盘入口是顶栏那枚 `#btnReplayIntro`（对应 `window.__PSU_BOOT__.replay`）。

**三个检查的分工**

| 工具 | 覆盖 | 在 CI 里 |
|---|---|---|
| `tools/securitycheck.mjs` | 注入、原型链绕过、数值夹紧、条数上限、输入后回复位 | 阻断 |
| `tools/a11ycheck.mjs` | 控件名称（含动态行）、`aria-hidden` 可聚焦、分组名称、弹窗 inert、无 JS 兜底 | 阻断 |
| `tools/browsertest.mjs` | 交互与启动全流程 | **非阻断** |

`browsertest` 里有一批断言靠 rAF 采样「部分已出现 + 部分还没出现」的中间帧，在虚拟化的 runner 上会漏采样（单文件与 `file://` 那几节尤甚），属环境性失败而非产品缺陷：**真机上的 `node tools/browsertest.mjs` 才是它的正式闸门**，CI 里只作提示。另注意 `boot-browser-check` 里的 `inertBoot`：`s.inert` 会把弹窗自己加的隔离 inert 一起算进去，两者必须分开计量，否则「启动必须释放锁」与「弹窗必须隔离背景」会互相抵消。

## 4. 数据置信度模型

| 值 | 含义 | 界面呈现 |
|---|---|---|
| `official` | 厂商官方规格页 / 官方发布信息 | 徽标「官方」 |
| `review` | 权威评测实测 | 徽标「评测」 |
| `estimate` | 推算值（规则生成或经验换算） | 徽标「估算」；规则生成的板型另有「规则生成条目」说明块 |
| `leak` | 未发布型号，来自爆料或第三方录入 | 徽标「未发布」，型号标签带 `[未发布]` |

`js/app.js` 的 `confBadge()` 是徽标的唯一出口；CSV 导出带 confidence 与来源引用；声明弹窗里必须有解释这四个值的一段（`index.html` 的「数据来源与标记说明」）。

**AIC 显卡功耗墙的两层**

- **EXPLICIT（24 条）**：有官方规格或权威评测来源的 SKU，逐条手写，每条都必须带可用的 `source`（来源表 key）。分布：official 3 / review 13 / estimate 7 / leak 1。它覆盖 `build()` 的同名结果。
- **SERIES（86 个系列）+ `build()`**：按系列定位倍率推算其余板型。算出来的条目一律 `confidence: 'estimate'`，且 **`source` 必须为空** —— 不伪造来源，系列名称的来源另存 `seriesSource`。
- 档位倍率（以 RTX 5090 公版 575W 校准）：blower ×1.00/×1.00、value ×1.00/×1.05、mainstream ×1.02/×1.09、flagship ×1.05/×1.13、halo ×1.20/×1.15。Halo 离散度极大（同档可差 200W），有数据的 Halo 必须进 EXPLICIT。
- 组合约束都写在 `build()` 里：`brands`、`since` 起始年份、`gens` 世代白名单、`exceptGpus`、`minTbp` / `maxTbp`、`onlyGpus`。缺 `since` 就会把 2025 年的 ROG Astral / 闪电挂到 2014 年的 GTX 970 上。

**不变量**（`tools/dataaudit.mjs` 守）

- 规则生成条目 confidence 必须是 `estimate` 且 source 为空；手写条目 source 必须在来源表里。
- 同厂商内功耗墙必须随定位单调递增，不允许主流款高过旗舰款。

## 5. 数据核实状态

**已核实**

- AMD 桌面 CPU 的 `Default TDP`：amd.com 产品页可抓取，Ryzen 9000 / 8000 / 7000 与部分 5000 系逐条比对通过。AMD 官方只列 TDP，不列 PPT。
- AIC 系列覆盖范围：华擎全部系列逐条核对官网型号表；华硕 / 技嘉 / 撼讯 / 蓝宝石 / 瀚铠 的世代级覆盖范围按官方新闻稿与产品页核实（26 / 86 系列带 `coverageVerified`）。官方中文名：华硕与微星。
- 微星 Lightning Z 5090：官方发布信息（双 12V-2x6、默认 800W / 极致 1000W、360 水冷、厂商建议 1600W）。
- 耕升中国区命名：炫光 / 踏雪 / 追风。

**未核实或受限**

- **Intel 全系 PBP / MTP**：intel.com 的 products/sku 与 compare 页一律 HTTP 403，读不到 ARK；库里的值来自 Intel ARK 与历代评测，属间接来源。
- **msi.com 对抓取返回 403（Akamai）**，Lightning Z 没有可引用的独立官方产品页（msi.cn 候选项 404）。
- **TDP → PPT 换算**：65W→88W、120W→162W 有明确引文；105W→142W 无引文；170W 有 230W 与 200–230W 两种说法并存。
- **AIC 系列目录**的覆盖型号、散热形态、尺寸多数是按领域知识整理的，未逐条查证；中文名分「官方 / 俗称 / 未核实」三态（15 / 8 / 59）。七彩虹 Kudan 因未发现 RTX 50 系产品已移除。
- HEDT 与工作站平台不在核实范围。可抓取的站点：amd.com、msi.cn、asus.com.cn、gigabyte.cn；不可达：en.wikipedia.org、en.wikichip.org。

**`docs/asrock-gpu-models.txt` 是什么**

asrock.com 官网显卡产品页逐条抓取的型号表（104 行，格式「完整型号名 | 所属 GPU | 厂内 SKU 代号」）。它是唯一逐条核实过覆盖型号的 AIC 厂商证据，`js/db-aib.js` 里 `asrock-*` 系列的 `onlyGpus` 由它生成。文件行尾是 CRLF / LF 混用，这是原始证据的样子，不要当成编码问题去修，也不要删。

标志素材的来源记在 `assets/lightning-source.md`（用户提供的截图，未声称为官方下载件）；品牌标志属商标，商用前自行确认授权。

## 6. 已知遗留

1. CPU 覆盖不含 LGA1151 / LGA1150 / AM3+ 等更早平台；显卡反过来覆盖到 GTX 900 与 RX 500，因为「我这块老卡多少瓦」是升级时最常见的问题。
2. 单文件产物冒烟测试与主测试共用同一个 `--user-data-dir`（`PROFILE_ARGS`），主测试写进 localStorage 的状态会留给单文件测试，所以「示例配置已计算」这条实际可能验证的是「状态恢复」而非「载入示例」。
3. **404 页样式表被静默截断的根因没有定位**：最小复现里各种 mask 写法、引号、data URI 长度都正常。现在的规避是 404 页用 `<img>` 承载标志，并加了常驻断言（规则数 ≥200、尾部规则仍生效、mask 真的生效、图片真的加载、404 规则数 ≥11）。再遇到「某些规则整段失效但页面不报错」，先查这个方向。
4. `tools/dataaudit.mjs` 有一条不阻断提醒：`air-stock-amd` 散热器没有 Intel 插槽（缺 LGA1851 / 1700 / 1200）。
5. 资产与命名：品牌已换成 MSI LIGHTNING，但强调色 token 仍叫 `--rog`（全站 `var(--rog)` 用量已到 30 处上限，新增红色用法要先腾位置）。三份无引用的死资产（`lightningz-boot-v2.mp4`、`power-z-mark.svg`、`power-z-wordmark.svg`）已删除，`ASSET_ALLOW` 仍然放开 `.svg/.mp4` 是为了将来不因为加一种媒体类型就要改发布白名单。

## 7. v3 配置与升级决策契约

用户选定方案 C 后，本次允许改计算口径，旧版“改版只动呈现、数字不变”不适用于这次功能升级。仍保留回归基线；重抓前必须审阅差异并在基线 `_revisionNote` 中记录原因。

- `cpuOc` 和 `gpuOc` 分开传给引擎；旧 `overclock` 仅作分项字段缺席时的兼容回退。自定义 CPU 功耗墙独立于倍频解锁。
- `hasSelection` 只表示有已填功耗，`canRecommend` 表示 CPU 与显卡选择均已完成。只有后一状态才推荐电源；超过推荐范围时不列出合格候选。
- `mode` 只有 `full` 与 `quick`。快速模式缺项用明示辅助预算补入，不生成虚构硬件 ID；具体部件替代默认项，不叠加。隐藏的具体配置仍计入结果。
- `expectedRange` 为分项工程假设区间，不是实测误差区间。旧 `expected` 为中点；页面、CSV 与打印统一显示区间。插座侧按用户假设效率另行折算。
- 检查范围逐项显示已检查/未检查。没有冲突不能宣称全部匹配；未知显卡接口不能确认原电源可直接复用。规则生成板型不能把公版来源冒充板型功耗来源。
- `psu-calc-plans-v1` 独立于当前编辑区的 `psu-calc-2026-v1`。方案是净化后的深度快照，最多 12 个。编辑不自动覆盖方案；保存失败不更改内存方案库、不提示成功；导入整体校验后合并，超量不静默截断。
- 对比与升级模拟只使用副本。`applyUpgrade` 才载入模拟结果；更换 CPU/GPU 会清除对应旧功耗覆盖值与超频设置，保留主板、机箱等用于发现不兼容。
- 自定义名称与数量输入时不重建输入节点，中文组合输入必须保留焦点；加载整套配置时先解除旧输入焦点再刷新。
- `.decision-toolbar` 加入启动就位名单，避免声明弹窗期间漏出新工具区；打印隐藏方案操作、保留结果与比较数据。
- 新增 `tools/decisioncheck.mjs`，检查方案生命周期、保存失败、输入节点保留、搜索、独立超频、导入净化、备份与刷新恢复。数据日期不因功能升级而更新，工具版本升到 3.0.0。

## 8. 澎湃 OS 参考动效（2026-10-04）

用户授权调整 UI 与动效，并要求布局保持原样。参考 [小米澎湃 OS 4 官方展示](https://os.mi.com/) 的操作回应与连续流转；曲线、时间和幅度为本站自行调校，不宣称复刻系统参数。

- 不改变分区、列宽、间距、字体、按钮尺寸、默认展开状态或计算层。背景柔化仅用于既有声明遮罩。
- 按压 80ms，保持 0.975 倍至松手；松手 360ms 回弹，上限 1.006 倍。鼠标、触摸、键盘共享反馈；取消指针或失焦均释放。
- `ui.js` 用 Web Animations API 管理局部过渡，同一元素最多一个受管动画；中断时读取当前样式，避免回到初始帧。数值真实变动才触发 280ms 淡入，答案文本始终即时更新。
- 配置卡保持原有 grid 折叠结构；原生 details 开关在过渡期间使用临时高度，展开 340ms、收起 220ms。反向操作从当前高度接续，落位后移除临时样式；超过 1000px 的高度变化直接落位。
- 弹窗 340ms 入场、180ms 退场；关闭中重新打开会取消旧定时器。维持 inert、焦点归还与声明事件契约。
- CSS 白名单新增 `psu-ui-exit`，入场改为 `.32s var(--motion-enter)`；有限关键帧仍只用 opacity / transform。只有 details 的临时高度涉及文档重排，不动画模糊半径或大面积阴影。
- 减少动态效果、隐藏页面、打印会清理受管动画并完成折叠意图。浏览器无 Web Animations API 时保留原生 details 和 CSS 反馈。
- `tools/boot-browser-check.mjs` 增加真实时间回归：长按、连续重按、指针取消、键盘、折叠反向、数值重复渲染、弹窗重入、减少动态效果与打印中断。

## 9. 启动动画屏幕适配

- 启动画布铺满遮罩，由实际可见尺寸确定绘制区域，不再把横屏分镜二次缩进固定 9:16 画布。
- 标志与文字作为同一主体等比缩放：横屏以 1280×720 为参考，竖屏按 480px 参考宽度放大主体，同时受可见高度及 1.5 倍上限约束。光束与氛围允许延伸至屏幕边缘，主体保持居中且完整可见。
- Canvas 按设备像素密度绘制，最高取 2 倍，兼顾文字清晰度与手机绘制开销。窗口、可见视口及画布尺寸变化时更新绘制尺寸，横竖屏切换不重启时间轴；结束时清理尺寸监听。
- 跳过提示避开屏幕安全区域。减少动态效果、跳过、声明弹窗和内容逐块出现沿用原有行为。
- 浏览器回归检查桌面、超宽屏、平板、普通手机、小屏手机及手机横屏的实际像素边界、主体尺寸与居中情况，并检查播放中旋转。
