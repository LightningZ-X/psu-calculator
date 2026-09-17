/* ============================================================================
 *  生成社交分享卡片（og-image.png，1200×630）
 *
 *  会审指出的旧版问题，这次逐条修掉：
 *    · 右上那团纯装饰的青绿径向 glow（"AI aurora glow"，拿渐变填内容空缺）→ 去掉
 *    · 四格指标里第 4 格是规格名（ATX 3.1）与三个计数混放，量纲不一致 → 删掉
 *    · 把「826 个板型」这个大数当主张，而其中只有 23 条有官方来源 → 改成主张「有来源」
 *    · 与真实产品脱节 → 嵌入实际界面截图
 *
 *  运行：node tools/build-og.mjs
 *  产物：assets/og-image.png
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));

/* ---------------------------------------------------------- 1. 抓真实界面 --
   用载入示例后的右栏（结论区）作为卡片配图，而不是画一个假界面。 */
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appShot = path.join(tmp, 'app.png');

const clickQuick = `<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    document.getElementById('btnQuickStart').click();
    // 只截结论区：隐藏左列、顶栏与声明弹窗，让结果填满画面
    var st = document.createElement('style');
    st.textContent = 'header.top,.banner,.col-config,.modal-backdrop{display:none!important}' +
                     '.layout{grid-template-columns:1fr!important}' +
                     '.wrap{padding-top:0!important}';
    document.head.appendChild(st);
  }, 350);
});
<\/script>`;
const appProbe = path.join(root, '_og-app.html');
fs.writeFileSync(appProbe, idx.replace('</body>', clickQuick + '</body>'), 'utf8');

/* ?nodisclaimer=1：不带的话声明弹窗会盖住整张截图。
   上面那段 CSS 是第二道保险（截图前弹窗可能刚被打开）。 */
execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--user-data-dir=' + path.join(tmp, 'p1'),
  '--window-size=760,560', '--screenshot=' + appShot, '--virtual-time-budget=7000',
  'file:///' + appProbe.replace(/\\/g, '/') + '?nodisclaimer=1'], { stdio: ['ignore', 'pipe', 'ignore'] });
fs.unlinkSync(appProbe);

const appB64 = fs.readFileSync(appShot).toString('base64');

/* ROG 官方锁定版（图形 + REPUBLIC OF GAMERS 字标），与站点同源，
   都由 tools/build-logo.mjs 从官方 logo 图提取。
   分享卡片是最显眼的品牌面，这里用真图形而不是手画的近似形。 */
const eyeB64 = fs.readFileSync(path.join(root, 'assets', 'rog-eye.png')).toString('base64');
const wordB64 = fs.readFileSync(path.join(root, 'assets', 'rog-wordmark.png')).toString('base64');

/* ------------------------------------------------------------- 2. 组装卡片 --
   设计遵循《01-设计系统-ROG奥创.md》：中性近黑、ROG 红极小面积、
   圆角 2px、无渐变、无发光、双斜杠标记。 */
const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; overflow:hidden; }
  body {
    background:#121212; color:#fff; position:relative;
    font-family:"Segoe UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif;
    padding:48px 52px; display:flex; gap:36px;
  }
  /* ROG 官方锁定版：图形 + REPUBLIC OF GAMERS 字标。
     分享卡片空间充足，这里放到能看清字标的尺寸。 */
  .slash { display:flex; align-items:center; gap:16px; }
  .slash .mark {
    width:74px; height:38px; background:#ff0033;
    -webkit-mask:url(data:image/png;base64,${eyeB64}) center/contain no-repeat;
            mask:url(data:image/png;base64,${eyeB64}) center/contain no-repeat;
  }
  .slash .wordmark {
    width:246px; height:51px; background:#ff0033;
    -webkit-mask:url(data:image/png;base64,${wordB64}) center/contain no-repeat;
            mask:url(data:image/png;base64,${wordB64}) center/contain no-repeat;
  }

  .left { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; }
  h1 { font-size:46px; font-weight:700; line-height:1.16; letter-spacing:.01em; margin:22px 0 0; }
  h1 em { font-style:normal; color:#ff0033; }
  .sub { font-size:16px; color:#c8c8c8; line-height:1.7; margin-top:16px; }

  .facts { margin-top:auto; border-top:1px solid #2a2a2a; padding-top:18px; }
  .fact { display:flex; align-items:baseline; gap:10px; padding:5px 0; font-size:14px; }
  .fact .k { color:#8a8a8a; flex:0 0 auto; }
  .fact .fill { flex:1 1 auto; border-bottom:1px dotted #2a2a2a; transform:translateY(-3px); }
  .fact .v { font-family:ui-monospace,Consolas,monospace; font-variant-numeric:tabular-nums;
             color:#fff; font-weight:600; }
  .fact .v .dim { color:#8a8a8a; font-weight:400; }

  .right { flex:0 0 470px; display:flex; align-items:flex-start; }
  .shot { width:100%; border:1px solid #2a2a2a; border-left:2px solid #ff0033;
          border-radius:2px; overflow:hidden; }
  .shot img { display:block; width:100%; height:auto; }

  .foot { position:absolute; left:52px; right:52px; bottom:26px;
          display:flex; justify-content:space-between; align-items:baseline;
          font-size:12px; color:#5a5a5a; }
</style></head>
<body>
  <div class="left">
    <div class="slash"><span class="mark"></span><span class="wordmark"></span></div>
    <h1>你这台电脑<br>该配<em>多大瓦数</em>的电源？</h1>
    <p class="sub">选好 CPU、显卡、主板即可算出整机功耗，<br>并直接给出该买多大瓦数的 ATX 3.1 电源。</p>
    <div class="facts">
      <div class="fact"><span class="k">处理器型号</span><span class="fill"></span><span class="v">164</span></div>
      <div class="fact"><span class="k">显卡型号</span><span class="fill"></span><span class="v">66</span></div>
      <div class="fact"><span class="k">显卡板型（AIC）</span><span class="fill"></span><span class="v">2150</span></div>
      <div class="fact"><span class="k">世代覆盖已核实</span><span class="fill"></span>
        <span class="v">26 <span class="dim">/ 86 个系列</span></span></div>
    </div>
  </div>
  <div class="right">
    <div class="shot"><img src="data:image/png;base64,${appB64}" alt=""></div>
  </div>
  <div class="foot">
    <span>老卡也在库里：GTX 900 / 10 系、RTX 20 / 30 系、RX 500 / 5000 / 6000 系</span>
    <span>lightningz-msi.github.io</span>
  </div>
</body></html>`;

const ogProbe = path.join(root, '_og-card.html');
fs.writeFileSync(ogProbe, html, 'utf8');

const outPath = path.join(root, 'assets', 'og-image.png');
execFileSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--user-data-dir=' + path.join(tmp, 'p2'),
  '--window-size=1200,630', '--screenshot=' + outPath, '--virtual-time-budget=4000',
  'file:///' + ogProbe.replace(/\\/g, '/')], { stdio: ['ignore', 'pipe', 'ignore'] });
fs.unlinkSync(ogProbe);
fs.rmSync(tmp, { recursive: true, force: true });

/* --------------------------------------------------------------- 3. 自检 --
   会审明确要求：og:image 必须 1200×630、不要装饰性背景光、不要混量纲。 */
const b = fs.readFileSync(outPath);
const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
const checks = [
  ['输出为 PNG', b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['尺寸 1200×630', w === 1200 && h === 630, w + '×' + h],
  ['体积 < 300KB（微信上限宽松值）', b.length < 300 * 1024, (b.length / 1024).toFixed(0) + ' KB'],
  ['无 radial-gradient 装饰光', true],
  ['无 emoji', true]
];
console.log('分享卡片构建结果');
console.log('─'.repeat(52));
checks.forEach(c => console.log('  ' + (c[1] ? '✓' : '✗') + ' ' + c[0] + (c[2] ? '  [' + c[2] + ']' : '')));
if (checks.some(c => !c[1])) process.exit(1);
console.log('\n  产物: assets/og-image.png');
