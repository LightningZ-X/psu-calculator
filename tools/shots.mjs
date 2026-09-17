/* ============================================================================
 *  截图工具（开发用，非交付物）
 *  生成「空态 / 载入示例 / 移动端 / 打印排版」四张截图，便于人工核对视觉。
 *  运行：node tools/shots.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = path.join(os.tmpdir(), 'psu-shots');
fs.mkdirSync(outDir, { recursive: true });

const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/* 载入示例后再截图 */
const CLICK_QUICK = `<script>
window.addEventListener('load', function () {
  setTimeout(function () { document.getElementById('btnQuickStart').click(); }, 350);
});
<\/script>`;
const loadedHtml = idx.replace('</body>', CLICK_QUICK + '</body>');

/* 浅色主题：确认 ROG 红在浅色下压深后仍然达标、且声明弹窗也换了皮 */
const LIGHT = `<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('btnQuickStart').click();
  }, 350);
});
<\/script>`;
const lightHtml = idx.replace('</body>', LIGHT + '</body>');

/* 打印排版：把 @media print 改写成 @media screen，就能在屏幕上看到 PDF 的样子 */
let css = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
const pi = css.lastIndexOf('@media print {');
css = css.slice(0, pi) + '@media screen {' + css.slice(pi + '@media print {'.length);
const printHtml = loadedHtml.replace(
  '<link rel="stylesheet" href="assets/style.css">',
  '<style>\n' + css + '\n</style>'
);

/* 移动端：无头 Edge 有 ~504px 的最小布局视口，
   必须用 iframe 才能得到真实的 390px（媒体查询按 iframe 宽度生效）。
   注意 iframe 的 src 要自己带 ?nodisclaimer=1&noanim=1 —— 外层包装页上的参数传不进 iframe，
   否则拍出来的「移动端布局」其实是盖在弹窗 / 启动遮罩上面的那一层。 */
const mobileWrapper = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>html,body{margin:0;background:#121212}iframe{border:0;display:block}</style></head>
<body><iframe src="_shot-loaded.html?nodisclaimer=1&amp;noanim=1" width="390" height="1500"></iframe></body></html>`;

const files = {
  '_shot-empty.html': idx,
  '_shot-loaded.html': loadedHtml,
  '_shot-light.html': lightHtml,
  '_shot-print.html': printHtml,
  '_shot-mobile.html': mobileWrapper
};
Object.entries(files).forEach(([f, c]) =>
  fs.writeFileSync(path.join(root, f), c, 'utf8'));

/* 404 页也要跟着一起看：它不引外部样式表，样式全内联，最容易在改版时漏掉 */
fs.copyFileSync(path.join(root, '404.html'), path.join(root, '_shot-404.html'));
files['_shot-404.html'] = '';

function shot(htmlFile, outName, w, h, waitMs, noDisclaimer) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
  const out = path.join(outDir, outName);
  let url = 'file:///' + path.join(root, htmlFile).replace(/\\/g, '/');
  /* 默认跳过数据声明弹窗，否则它会盖住整页（正是我们要看的东西反而看不见）。
     要拍弹窗本身时传 noDisclaimer = false。
     动效一律关掉（noanim=1）：启动遮罩同样会盖住整页，否则截图基线会全是黑屏。 */
  const params = [];
  if (noDisclaimer !== false) params.push('nodisclaimer=1');
  params.push('noanim=1');
  url += '?' + params.join('&');
  try {
    execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--hide-scrollbars', '--allow-file-access-from-files',
      '--user-data-dir=' + prof, `--window-size=${w},${h}`,
      '--screenshot=' + out, `--virtual-time-budget=${waitMs}`, url],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    const kb = (fs.statSync(out).size / 1024).toFixed(1);
    console.log(`  ✓ ${outName}  ${kb} KB  (${w}×${h})`);
  } catch (e) {
    console.log(`  ✗ ${outName}  ${e.message.slice(0, 60)}`);
  }
  fs.rmSync(prof, { recursive: true, force: true });
}

console.log('生成截图到 ' + outDir);
shot('_shot-empty.html', 'rog-empty.png', 1600, 1000, 5000);
shot('_shot-loaded.html', 'rog-loaded.png', 1600, 1100, 6500);
shot('_shot-mobile.html', 'rog-mobile.png', 420, 1560, 7000);
shot('_shot-print.html', 'rog-print.png', 1100, 1500, 6000);
shot('_shot-light.html', 'rog-light.png', 1600, 1100, 6500);
shot('_shot-404.html', 'rog-404.png', 900, 620, 2500);
/* 声明弹窗本身 */
shot('_shot-empty.html', 'rog-disclaimer.png', 1600, 1000, 5000, false);

Object.keys(files).forEach(f => {
  try { fs.unlinkSync(path.join(root, f)); } catch (e) {}
});
console.log('临时探针已清理');
