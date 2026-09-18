/* ============================================================================
 *  发布到 GitHub Pages
 * ----------------------------------------------------------------------------
 *  目标站点：https://lightningz-msi.github.io/-/  （仓库 LightningZ-MSI/-，
 *  分支 main，GitHub Pages 从分支根目录发布）
 *
 *  为什么要有这个脚本，而不是直接把整个项目推上去：
 *    线上仓库是**只放可运行文件**的发布仓库（用户当初用网页版 "Add files via upload"
 *    传的），里面没有 tools/ docs/ dist/ README.md。
 *    如果直接把项目根推上去，会把构建脚本、核查记录、42KB 的 README 一起公开，
 *    既不是原样，也把仓库搞脏。所以这里用**白名单**：只发布真正被浏览器请求的东西。
 *
 *  安全设计：
 *    · 默认是**预演**（dry run）：克隆到临时目录、复制、打印将要提交的差异，然后停下。
 *      只有显式加 --push 才真的提交并推送。
 *    · 克隆用 --depth 1，不拉历史，快且不占地方。
 *    · 推送前检查白名单里的文件是否都存在，并核对 index.html 引用到的本地资源
 *      是否都在发布清单里 —— 「漏传一个 js 文件」是这类静态站最典型的翻车方式。
 *
 *  用法：
 *    node tools/deploy-pages.mjs           # 预演
 *    node tools/deploy-pages.mjs --push    # 提交并推送
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const REPO = 'https://github.com/LightningZ-MSI/-.git';
const SITE = 'https://lightningz-msi.github.io/-/';
const PUSH = process.argv.includes('--push');

/* ------------------------------------------------------- 发布白名单 ------ */
const FILES = [
  'index.html',
  '404.html',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml'
];
const DIRS = ['assets', 'js'];

/* assets / js 里只有这些会被浏览器请求；工具产出的其它东西不发布。
   ⚠️ 别漏了 js —— 这个白名单同时作用于两个目录，
   漏掉的直接后果是「一个 js 都没发布」，然后页面上线即白屏。 */
const ASSET_ALLOW = f => /\.(css|js|png|svg|ico|webp|jpe?g|woff2?|mp4)$/i.test(f);

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

/* ------------------------------------------------------------ 1. 收集 ---- */
const plan = [];
FILES.forEach(f => {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) { console.error('✗ 白名单文件不存在: ' + f); process.exit(1); }
  plan.push({ rel: f, from: p });
});
DIRS.forEach(d => {
  const dir = path.join(root, d);
  if (!fs.existsSync(dir)) { console.error('✗ 白名单目录不存在: ' + d); process.exit(1); }
  fs.readdirSync(dir).filter(ASSET_ALLOW).sort().forEach(f => {
    plan.push({ rel: d + '/' + f, from: path.join(dir, f) });
  });
});

/* ------------------------------------------- 2. 引用完整性（发布前把关）----
   静态站最典型的翻车方式是「漏传一个文件」：页面在本地好好的，
   线上某个 js 404 就整页白屏。这里把 index.html 里引用到的本地资源
   逐个对照发布清单。 */
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = new Set();
for (const m of idx.matchAll(/(?:src|href)="((?!https?:|data:|#|\/)[^"]+)"/g)) refs.add(m[1]);
const planned = new Set(plan.map(p => p.rel));
const missing = [...refs].filter(r => !planned.has(r) && fs.existsSync(path.join(root, r)));
if (missing.length) {
  console.error('✗ index.html 引用了这些本地文件，但它们不在发布清单里：');
  missing.forEach(m => console.error('   - ' + m));
  process.exit(1);
}
/* CSS 里引用的图片（去掉引号和相对路径）也要在清单里 */
const css = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
const cssRefs = new Set();
for (const m of css.matchAll(/url\(([^)"']+)\)/g)) {
  const u = m[1].trim();
  if (!/^(data:|https?:)/.test(u)) cssRefs.add('assets/' + u.replace(/^\.\//, ''));
}
const cssMissing = [...cssRefs].filter(r => !planned.has(r) && fs.existsSync(path.join(root, r)));
if (cssMissing.length) {
  console.error('✗ style.css 引用了这些图片，但它们不在发布清单里：');
  cssMissing.forEach(m => console.error('   - ' + m));
  process.exit(1);
}

console.log('发布到 GitHub Pages' + (PUSH ? '（正式）' : '（预演，不会推送）'));
console.log('─'.repeat(60));
console.log('  仓库: ' + REPO);
console.log('  站点: ' + SITE);
console.log('  清单: ' + plan.length + ' 个文件');
plan.forEach(p => console.log('    ' + (fs.statSync(p.from).size / 1024).toFixed(1).padStart(8) +
  ' KB  ' + p.rel));

/* --------------------------------------------------------------- 3. 克隆 -- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'psu-pages-'));
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
console.log('\n克隆到 ' + tmp);
try {
  run('git', ['clone', '--depth', '1', REPO, tmp], { env, stdio: 'inherit' });
} catch (e) {
  console.error('✗ 克隆失败（检查网络与 GitHub 凭据）');
  process.exit(1);
}

/* --------------------------------------------------------------- 4. 复制 -- */
plan.forEach(p => {
  const dst = path.join(tmp, p.rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(p.from, dst);
});

/* 线上多出来的文件（不在白名单里）要报出来，避免留下孤儿资源 */
const existing = [];
(function walk(d, base = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(d, e.name), rel);
    else existing.push(rel);
  }
})(tmp);
const orphans = existing.filter(f => !planned.has(f));

/* --------------------------------------------------------------- 5. 差异 -- */
console.log('\n变更内容');
console.log('─'.repeat(60));
const status = run('git', ['-C', tmp, 'status', '--porcelain'], { env });
if (!status.trim()) {
  console.log('  线上已经是最新，无需发布。');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}
status.trim().split('\n').forEach(l => console.log('  ' + l));
if (orphans.length) {
  console.log('\n  线上存在但不在发布清单里的文件（本次不动它们）：');
  orphans.forEach(f => console.log('    ' + f));
}
const stat = run('git', ['-C', tmp, 'diff', '--stat', 'HEAD'], { env });
if (stat.trim()) console.log('\n' + stat.trim());

if (!PUSH) {
  console.log('\n（预演结束）确认无误后加 --push 正式发布：');
  console.log('  node tools/deploy-pages.mjs --push');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

/* --------------------------------------------------------- 6. 提交并推送 -- */
console.log('\n提交并推送');
console.log('─'.repeat(60));
run('git', ['-C', tmp, 'add', '-A'], { env });
const msg = 'ui: publish approved LightningZ V2 startup animation';
run('git', ['-C', tmp, 'commit', '-m', msg], { env, stdio: 'inherit' });
try {
  run('git', ['-C', tmp, 'push', 'origin', 'HEAD:main'], { env, stdio: 'inherit' });
} catch (e) {
  console.error('\n✗ 推送失败。常见原因：凭据过期、网络不通、远端有新提交需要先 pull。');
  console.error('  克隆目录保留在 ' + tmp + '，可进去手动处理。');
  process.exit(1);
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n✓ 已推送。GitHub Pages 通常需要 30~90 秒重新构建。');
console.log('  稍后访问 ' + SITE + ' 查看（建议强制刷新 Ctrl+F5）。');
