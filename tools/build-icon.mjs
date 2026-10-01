/* ============================================================================
 *  生成 iOS 主屏图标：assets/apple-touch-icon.png（180×180）
 *
 *  为什么不复用 favicon.svg：iOS 的 apple-touch-icon **不认 SVG**，
 *  加到主屏只会得到一个空白方块。所以这里单独出一张 PNG：深色底 +
 *  居中的 LIGHTNING 闪电图形（用站点自己那份 assets/lightning-mark.png，
 *  它已经是 ROG 红，不需要再染色）。
 *
 *  渲染沿用项目里其它资产工具的做法：用本机已有的 Edge 无头模式截图，
 *  不引入任何 npm 依赖。
 *
 *  运行：node tools/build-icon.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const SIZE = 180;
const MARK_H = 112;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-'));
const out = path.join(root, 'assets', 'apple-touch-icon.png');

const markPath = path.join(root, 'assets', 'lightning-mark.png');
if (!fs.existsSync(markPath)) {
  console.error('✗ 缺少 assets/lightning-mark.png（主屏图标要居中放这个图形）');
  process.exit(1);
}
const mark = fs.readFileSync(markPath).toString('base64');

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${SIZE}px; height: ${SIZE}px; overflow: hidden; }
  body { background: #121212; display: grid; place-items: center; }
  /* 和站点一样用 mask 取形状、颜色由 background 给。
     直接 <img> 是不行的：lightning-mark.png 是一张 mask 素材，
     它的 RGB 不是品牌红（站点正是靠 background: var(--rog) 上色）。 */
  .mark {
    width: ${MARK_H}px; height: ${MARK_H}px; background: #ff0033;
    -webkit-mask: url(data:image/png;base64,${mark}) center / contain no-repeat;
            mask: url(data:image/png;base64,${mark}) center / contain no-repeat;
  }
</style></head>
<body><span class="mark"></span></body></html>`;

const probe = path.join(tmp, 'icon.html');
fs.writeFileSync(probe, html, 'utf8');
execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--user-data-dir=' + path.join(tmp, 'p'),
  `--window-size=${SIZE},${SIZE}`,
  '--screenshot=' + out,
  '--virtual-time-budget=3000',
  'file:///' + probe.replace(/\\/g, '/')], { stdio: ['ignore', 'pipe', 'ignore'] });
fs.rmSync(tmp, { recursive: true, force: true });

/* 自检：真读 PNG 头，尺寸必须正好 180×180 */
const buf = fs.readFileSync(out);
const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
console.log(`  ${w}×${h}  ${(buf.length / 1024).toFixed(1)} KB  assets/apple-touch-icon.png`);
if (w !== SIZE || h !== SIZE) {
  console.error(`✗ 尺寸应为 ${SIZE}×${SIZE}，实际 ${w}×${h}`);
  process.exit(1);
}
console.log('✓ 主屏图标已生成');
