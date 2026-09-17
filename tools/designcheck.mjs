/* ============================================================================
 *  设计铁律自检（对应《01-设计系统-ROG奥创.md》第 4 节）
 *  这三条一旦违反，页面就会重新变成「一眼 AI」。
 *  改动样式后必跑：node tools/designcheck.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { checkBootMotion } from './boot-motion-check.mjs';

const root = process.cwd();
const css = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

let fail = 0;
const ck = (label, ok, extra) => {
  if (!ok) fail++;
  console.log('  ' + (ok ? '\u2713' : '\u2717') + ' ' + label + (extra ? '  [' + extra + ']' : ''));
};

/* 去掉 // 与 /* *\/ 注释后再统计，避免把说明文字算进去 */
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const cssCode = stripComments(css);
const htmlCode = stripComments(html);

console.log('铁律自检（设计系统第 4 节）');
console.log('\u2500'.repeat(58));

/* ---- 铁律② 不要渐变、不要发光、不要 emoji ------------------------------ */
console.log('\n铁律② 无渐变 / 无发光 / 无 emoji');

/* 分区标记（三条斜杠 ///）是唯一允许的渐变 —— 它是 ROG 奥创界面的品牌签名。
   做法：把这条规则整段从扫描范围里剔除，再要求剩下的 CSS 里一个渐变都没有。
   这比「白名单某些 stop 百分比」更严：白名单只要别处照抄一组相同 stop 值就能绕过。
   （初版是两条斜杠 >>，对照真实截图后改成三条 —— 两条会读成「快进符号」。） */
const MARKER_RE = /\.card > h2::before,[\s\S]*?\n\}/;
const markerRule = MARKER_RE.exec(cssCode);
const cssNoMarker = markerRule ? cssCode.replace(markerRule[0], '') : cssCode;
const strayGradients = [...cssNoMarker.matchAll(/linear-gradient\(/g)];
ck('除分区标记外无渐变', strayGradients.length === 0,
   strayGradients.length ? strayGradients.length + ' 处' : '仅分区标记');
ck('分区标记是三条斜杠 ///（对照奥创真实界面）',
   !!markerRule && (markerRule[0].match(/linear-gradient\(/g) || []).length === 3,
   markerRule ? (markerRule[0].match(/linear-gradient\(/g) || []).length + ' 条' : '规则缺失');

const motionErrors = checkBootMotion(css);
ck('仅允许有限启动动画白名单 / 无越界缓动 / 保留减少动态效果', !motionErrors.length, motionErrors.join(' | '));
ck('白名单能拦截未知名称、无限循环、越界缓动和非合成属性', [
  css.replace('@keyframes psu-page-in', '@keyframes unexpected'),
  css.replace('psu-page-in .6s linear both', 'psu-page-in .6s linear infinite'),
  css.replace('cubic-bezier(.4, 0, .2, 1)', 'cubic-bezier(.4, 0, .2, 1.2)'),
  css.replace('from { opacity: 0; }', 'from { width: 0; }')
].every(s => checkBootMotion(s).length > 0));
// 浮层阴影（下拉/抽屉/toast）是允许的；禁止的是平面卡片与外发光
const glows = [...cssCode.matchAll(/box-shadow:\s*([^;]+)/g)]
  .map(m => m[1].replace(/!important/g, '').trim())
  .filter(v => v !== 'none' && v !== 'var(--shadow-float)');
ck('无装饰性外发光（平面元素不加阴影）', glows.length === 0,
   glows.length ? glows.slice(0, 2).join(' | ') : '仅浮层阴影');

const EMOJI = /[\u2728\u26A1\u2600\uFE0F\u{1F9E9}\u{1F534}\u{1F319}\u2605\u2261\u2913\uFF0B\u00A7\u2705\u2714\u2716]/u;
ck('index.html 无 emoji 图标', !EMOJI.test(htmlCode));
ck('app.js 生成的 UI 无 emoji 图标', !EMOJI.test(appjs));

/* ---- 铁律① 一种强调色且极小面积 --------------------------------------- */
console.log('\n铁律① 单一强调色 / 红色面积 < 3%');

ck('ROG 红 token 已定义', /--rog:\s*#ff0033/.test(css));
ck('旧青色强调色已清除', !/#00d4ff|#35d0a5|#4c9aff|#a97bff/i.test(cssCode));
ck('无紫色等冗余 token', !/--purple/.test(cssCode));

/* 关键不是「出现几次」，而是「有没有大面积色块」。
   1px 描边、指示条、小开关都是允许的；禁止的是给大容器铺红色底。 */
const rogUses = (cssCode.match(/var\(--rog\)/g) || []).length;
ck('var(--rog) 用量克制（≤ 30 处，多为 1px 描边与指示条）', rogUses <= 30, rogUses + ' 处');

const fillRules = [...cssCode.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(m =>
  /background(?:-color)?:\s*var\(--rog\)/.test(m[2]));
const bigSurface = /(^|[,\s])(body|html|\.wrap|\.card|\.card-body|\.layout|header|\.col-config|\.col-result|\.sticky-col|\.reco|\.issue|\.banner|\.hero|\.psu-pick)([,\s{]|$)/;
// 伪元素（::after / ::before）按构造就是小标记（指示条、双斜杠），不算大容器
const offenders = fillRules.filter(m =>
  !/::(?:after|before)/.test(m[1]) && bigSurface.test(m[1]));
ck('红色实底未用于任何大容器', offenders.length === 0,
   offenders.length ? offenders.map(m => m[1].trim()).join(' | ')
                    : fillRules.length + ' 处均为小元素（logo 30px / 主按钮 / 开关轨 / 4px 指示条）');

/* ---- 铁律③ 形态多样化（分组靠亮度，不靠卡片）------------------------- */
console.log('\n铁律③ 形态多样化');

ck('圆角收到 ≤ 4px', /--radius:\s*2px/.test(css) && !/--radius:\s*(?:[5-9]|1[0-9])px/.test(css));
// 卡片不应全部同构：至少要有表格行 / 数据行 / 设置行 / 折叠区等不同形态
['.hero > div', '.field', 'table.detail', '.scenario', '.psu-pick'].forEach(sel => {
  ck('存在非卡片形态: ' + sel, css.includes(sel));
});
const cardBorder = [...cssCode.matchAll(/\.card\s*\{[^}]*\}/g)]
  .some(m => /border:\s*1px solid/.test(m[0]));
ck('卡片不再套完整矩形边框（改用顶部细线）', !cardBorder);

/* ---- 排版收敛 --------------------------------------------------------- */
console.log('\n排版收敛');
const fs1 = [...cssCode.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => m[1]);
const uniqFs = [...new Set(fs1)].map(Number).sort((a, b) => a - b);
ck('px 字号唯一值 ≤ 6 档', uniqFs.length <= 6, uniqFs.join(' / ') + ' px');
ck('无 0.5px 假层级', !fs1.some(v => v.includes('.')));

const fw = [...new Set([...cssCode.matchAll(/font-weight:\s*(\d+)/g)].map(m => m[1]))].map(Number).sort();
ck('字重 ≤ 3 档', fw.length <= 3, fw.join(' / '));

/* ---- 可达性 ----------------------------------------------------------- */
console.log('\n可达性');
ck(':focus-visible 存在且非 none', /:focus-visible\s*\{[^}]*outline:\s*2px/.test(cssCode));
ck('prefers-reduced-motion 已处理', /prefers-reduced-motion/.test(css));
ck('无 outline:none 压制焦点', !/outline:\s*none/.test(cssCode));
ck('浅色主题覆盖 ROG 红（对比度达标）', /--rog:\s*#d40029/.test(css));

/* ---- 打印保障 --------------------------------------------------------- */
console.log('\n打印保障（导出 PDF 的唯一实现）');
const pi = css.lastIndexOf('@media print');
const pb = pi >= 0 ? css.slice(pi) : '';
ck('存在 @media print', pi >= 0);
ck('打印隐藏配置列', /\.layout\s*>\s*\.col-config/.test(pb));
/* 屏幕态的收起是靠 grid-template-rows:0fr 做的（为了能做高度过渡），不是 display:none。
   所以打印时必须把行高与透明度都还原 ——
   只断言 display 会漏掉「内容在 DOM 里但高度是 0」这种 PDF 缺内容的情况。 */
ck('打印展开折叠内容',
  /\.card\.is-collapsed\s*>\s*\.card-body\s*\{[^}]*grid-template-rows:\s*1fr\s*!important/.test(pb) &&
  /\.card\.is-collapsed\s*>\s*\.card-body\s*\{[^}]*opacity:\s*1\s*!important/.test(pb));
ck('打印取消行数截断', /-webkit-line-clamp:\s*unset\s*!important/.test(pb));
ck('打印压平渐变辉光', /background-image:\s*none\s*!important/.test(pb) && /box-shadow:\s*none\s*!important/.test(pb));
ck('打印压平红色指示条', /\.reco \.big::after\s*\{\s*background:\s*#000\s*!important/.test(pb));

console.log('\n' + '\u2500'.repeat(58));
if (fail) { console.log('\u2717 ' + fail + ' 项未通过'); process.exit(1); }
console.log('\u2713 三条铁律与可达性/打印保障全部通过');
