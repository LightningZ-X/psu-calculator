/* ============================================================================
 *  构建单文件版本
 *  把 index.html + assets/style.css + js/*.js 全部内联成一个自包含的 .html，
 *  对方双击即可使用，无需解压、无需联网、无需任何环境。
 *
 *  运行:  node tools/build-standalone.mjs
 *  输出:  dist/整机功耗计算器.html
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUT_DIR = path.join(root, 'dist');
const OUT_NAME = '整机功耗计算器.html';

/* ------------------------------------------------------------------ 读取 */
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let html = read('index.html');
for (const name of ['boot-mark.png', 'boot-wordmark.png']) {
  html = html.replace('assets/' + name, 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', name)).toString('base64'));
}

const css = read('assets/style.css');
const JS_ORDER = ['js/db-cpus.js', 'js/db-aib.js', 'js/db.js', 'js/engine.js', 'js/app.js', 'js/boot-animation.js', 'js/ui.js'];
const jsSources = JS_ORDER.map(f => ({ file: f, code: read(f) }));

/* --------------------------------------------------- 校验：不能有遗漏 */
const problems = [];

// 1. 只校验 rel="stylesheet" 的 link（canonical / icon 等不是要内联的资源）
const sheetRe = /<link[^>]+rel="stylesheet"[^>]*>/g;
const scriptRe = /<script[^>]+src="([^"]+)"[^>]*><\/script>/g;
const foundSheets = [...html.matchAll(sheetRe)].map(m => (/href="([^"]+)"/.exec(m[0]) || [])[1]);
const foundScripts = [...html.matchAll(scriptRe)].map(m => m[1]);

foundSheets.forEach(href => {
  if (href !== 'assets/style.css') problems.push(`未处理的样式表引用: ${href}`);
});
foundScripts.forEach(src => {
  if (!JS_ORDER.includes(src)) problems.push(`未处理的脚本引用: ${src}（不在 JS_ORDER 中）`);
});
JS_ORDER.forEach(src => {
  if (!foundScripts.includes(src)) problems.push(`JS_ORDER 中的 ${src} 未在 index.html 中引用`);
});

// 本地图标必须存在，否则内联步骤会失败
if (!fs.existsSync(path.join(root, 'favicon.svg'))) {
  problems.push('favicon.svg 不存在（单文件版需要内联它）');
}
// MSI LIGHTNING 透明 PNG 会被 CSS 的 mask 引用，必须一起内联。
['lightning-mark.png', 'lightning-wordmark.png'].forEach(f => {
  if (!fs.existsSync(path.join(root, 'assets', f))) {
    problems.push('assets/' + f + ' 不存在（需要经用户授权提取的标志文件）');
  }
});

/* 2. 源码里不得残留任何外部资源引用（这是"能离线用"的根本保证） */
const allCode = [css, ...jsSources.map(j => j.code)].join('\n');
const externalRefs = [
  ...allCode.matchAll(/https?:\/\/[^\s"'`)]+/g)
].map(m => m[0]);

// 允许出现在数据里的"来源链接"（它们只是文本/超链接，不会在加载时被请求）
const ALLOWED_HOSTS = [
  'wap.yesky.com', 'm.ithome.com', 'pc.zol.com.cn', 'www.techpowerup.com',
  'www.guru3d.com', 'rog.asus.com', 'www.hartware.de', 'seasonic.com',
  'www.intel.com', 'www.amd.com', 'www.c114.net.cn', 'www.163.com',
  'www.msi.com'
];
const suspicious = externalRefs.filter(u => {
  // 只关心会在页面加载时被请求的资源
  return /\.(js|css|woff2?|ttf|png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(u);
});
if (suspicious.length) {
  problems.push('发现外部资源引用（会导致离线无法使用）: ' + suspicious.slice(0, 5).join(', '));
}

if (problems.length) {
  console.error('\n✗ 构建前校验失败：');
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}

/* --------------------------------------------------------------- 内联 */
/* Logo 遮罩已内嵌在源 CSS 中，网页和单文件版共用同一数据。 */
const cssInlined = css;
for (const part of ['mark', 'wordmark']) {
  const data = fs.readFileSync(path.join(root, 'assets', 'lightning-' + part + '.png')).toString('base64');
  if (!css.includes('data:image/png;base64,' + data)) {
    throw new Error('CSS 中的 LIGHTNING 遮罩与素材不一致: ' + part);
  }
}

// 1. 样式
html = html.replace(
  /<link[^>]+href="assets\/style\.css"[^>]*>/,
  '<style>\n' + cssInlined + '\n</style>'
);

// 2. favicon 必须内联成 data URI，否则单文件版会残留一个外部引用（自检会拦下）
const faviconPath = path.join(root, 'favicon.svg');
if (fs.existsSync(faviconPath)) {
  const favSvg = fs.readFileSync(faviconPath, 'utf8').trim();
  const favData = 'data:image/svg+xml;base64,' +
    Buffer.from(favSvg, 'utf8').toString('base64');
  const before = html;
  html = html.replace(/href="favicon\.svg"/g, 'href="' + favData + '"');
  if (html === before) problems.push('index.html 中未找到 favicon.svg 引用（可能已被移除）');
}

// 2. 脚本（保持顺序，用独立 <script> 块以免作用域互相污染）
// 原位内联，保留 ui.js 的 head 首帧判断及 body 中的数据/计算加载顺序。
for (const j of jsSources) {
  html = html.replace('<script src="' + j.file + '"></script>',
    () => '<!-- ' + j.file + ' -->\n<script>\n' + j.code + '\n</script>');
}

/* ----------------------------------------------------- 加上离线标记 */
html = html.replace(
  '<head>',
  '<head>\n<!--\n' +
  '  单文件离线版 —— 由 tools/build-standalone.mjs 自动生成，请勿直接编辑本文件。\n' +
  '  修改请改源文件后重新运行构建脚本。\n' +
  '  包含：样式表 + 5 个 JS 模块（CPU/AIC 数据库、硬件总库、计算引擎、交互层）\n' +
  '  无任何外部依赖，可完全离线使用。\n' +
  '-->\n'
);

/* --------------------------------------------------------------- 输出 */
fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, OUT_NAME);
fs.writeFileSync(outPath, html, 'utf8');

/* --------------------------------------------------- 产物自检（重要） */
const built = fs.readFileSync(outPath, 'utf8');
const checks = [];

/* 只检查"会发起网络请求"的资源引用。
   canonical / og:url 这类 <link> 与 <meta> 不会请求任何东西，保留是正确的。 */
const localRefPatterns = [
  /<link[^>]+rel="stylesheet"[^>]+href="(?!data:)/,
  /<link[^>]+rel="(?:icon|apple-touch-icon|preload|manifest)"[^>]+href="(?!data:)/
];
checks.push(['无残留本地样式表引用', !localRefPatterns[0].test(built)]);
checks.push(['无残留本地图标引用', !localRefPatterns[1].test(built)]);
checks.push(['无残留 <script src>', !/<script[^>]+src=/.test(built)]);
checks.push(['favicon 已内联为 data URI', built.indexOf('data:image/svg+xml;base64,') > 0]);
checks.push(['无残留 favicon.svg 引用', built.indexOf('href="favicon.svg"') === -1]);
checks.push(['MSI LIGHTNING 图形已内联为 data URI', built.indexOf('data:image/svg+xml;base64,') > 0]);
checks.push(['无残留 lightning-mark.png 相对引用', built.indexOf('url(lightning-mark.png)') === -1]);
checks.push(['无残留 lightning-wordmark.png 相对引用', built.indexOf('url(lightning-wordmark.png)') === -1]);
checks.push(['logo 仍用 mask 引用 logo 图（未变成死引用）',
  ['mark', 'wordmark'].every(part => built.includes('mask-image: var(--lightning-' + part + ')') &&
    built.includes('--lightning-' + part + ': url("data:image/png;base64,'))]);
// SEO 元信息必须完整保留
checks.push(['title 已保留', /<title>[^<]+<\/title>/.test(built)]);
checks.push(['meta description 已保留', /name="description"[^>]+content="[^"]{20,}"/.test(built)]);
checks.push(['OG 分享标签已保留', built.indexOf('og:image') > 0]);
checks.push(['结构化数据已保留', built.indexOf('application/ld+json') > 0]);
checks.push(['noscript 兜底已保留', built.indexOf('<noscript>') > 0]);
// 内联内容确实进去了
checks.push(['样式已内联', built.includes('.hero {') || built.includes('.hero{')]);
checks.push(['CPU 库已内联', built.includes('Core Ultra 7 270K Plus')]);
checks.push(['AIC 库已内联', built.includes('Lightning Z')]);
checks.push(['引擎已内联', built.includes('PSUEngine')]);
checks.push(['交互层已内联', built.includes('__PSU_DEBUG')]);
// 结构完整
checks.push(['HTML 结构完整', built.trimEnd().endsWith('</html>')]);
checks.push(['<style> 标签配平',
  (built.match(/<style[\s>]/g) || []).length === (built.match(/<\/style>/g) || []).length]);
checks.push(['<script> 标签配平',
  (built.match(/<script[\s>]/g) || []).length === (built.match(/<\/script>/g) || []).length]);

// 中文没有损坏
checks.push(['中文编码正常', !/\uFFFD/.test(built)]);

const failed = checks.filter(c => !c[1]);
console.log('\n单文件构建结果');
console.log('─'.repeat(58));
console.log('  输出    : dist/' + OUT_NAME);
console.log('  体积    : ' + (Buffer.byteLength(built, 'utf8') / 1024).toFixed(1) + ' KB');
console.log('  内联    : 1 个样式表 + ' + jsSources.length + ' 个脚本');
console.log('─'.repeat(58));
checks.forEach(c => console.log('  ' + (c[1] ? '✓' : '✗') + ' ' + c[0]));

if (failed.length) {
  console.log('\n✗ ' + failed.length + ' 项自检失败');
  process.exit(1);
}
console.log('\n✓ 构建完成，该文件可脱离本目录独立运行');
