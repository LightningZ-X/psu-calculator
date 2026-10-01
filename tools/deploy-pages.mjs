/* ============================================================================
 *  发布到 GitHub Pages
 * ----------------------------------------------------------------------------
 *  目标站点：https://lightningz-x.github.io/  （仓库 LightningZ-X/LightningZ-X.github.io，
 *  账号的「用户站」仓库，分支 main，GitHub Pages 从分支根目录发布。
 *  早先发布在仓库 LightningZ-X/- 下，网址是 https://lightningz-x.github.io/-/ ——
 *  那个名字只是个没意义的短横线，念不出来也记不住，所以搬到了用户站根路径。）
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
 *    node tools/deploy-pages.mjs                 # 预演
 *    node tools/deploy-pages.mjs --push          # 提交并推送
 *    node tools/deploy-pages.mjs --push --prune  # 顺便删掉线上不在白名单里的孤儿文件
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const DB = require(path.join(root, 'js', 'db.js'));

const REPO = 'https://github.com/LightningZ-X/LightningZ-X.github.io.git';
const SITE = 'https://lightningz-x.github.io/';
const PUSH = process.argv.includes('--push');
const PRUNE = process.argv.includes('--prune');
/* CI（GitHub Actions）往另一个仓库推送时没有本机凭据，靠这个 token 认证；
   本地没有它时照旧走本机 git 凭据管理器。token 只用来拼 clone URL，从不打印。 */
const DEPLOY_TOKEN = process.env.DEPLOY_TOKEN || '';
const CLONE_URL = DEPLOY_TOKEN
  ? REPO.replace('https://', 'https://x-access-token:' + DEPLOY_TOKEN + '@')
  : REPO;

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
  run('git', ['clone', '--depth', '1', CLONE_URL, tmp], { env, stdio: 'inherit' });
  /* CI 上没有全局 git 身份，先给这个临时仓库配上才能提交 */
  run('git', ['-C', tmp, 'config', 'user.name', 'LightningZ-X'], { env });
  run('git', ['-C', tmp, 'config', 'user.email', 'yao080120@qq.com'], { env });
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

/* sitemap 的 lastmod 每次发布自动按「源头最后一次提交的日期」写，省得忘了手改。
   用提交日期而不是数据库的数据截止日：lastmod 的语义是「本页最后改动时间」，
   拿数据截止日会把日期往回调。用提交日期还有个好处 —— 它只在真有新提交时才变，
   否则每次跑发布都会产生一个只有日期不同的 diff，把「无需发布」的判断顶掉。
   改的是克隆里的那一份，源文件不动。 */
let srcDate = '';
try { srcDate = run('git', ['-C', root, 'show', '-s', '--format=%cs', 'HEAD'], { env }).trim(); } catch (e) {}
const smPath = path.join(tmp, 'sitemap.xml');
if (srcDate && fs.existsSync(smPath)) {
  const before = fs.readFileSync(smPath, 'utf8');
  const after = before.replace(/(<lastmod>)[^<]*(<\/lastmod>)/, '$1' + srcDate + '$2');
  if (after !== before) {
    fs.writeFileSync(smPath, after, 'utf8');
    console.log('  sitemap lastmod -> ' + srcDate + '（源头最后一次提交的日期）');
  }
}

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
  if (PRUNE) {
    console.log('\n  --prune：删除线上这些不在发布清单里的文件');
    orphans.forEach(f => { fs.rmSync(path.join(tmp, f), { force: true }); console.log('    - ' + f); });
  } else {
    console.log('\n  线上存在但不在发布清单里的文件（加 --prune 可删除）：');
    orphans.forEach(f => console.log('    ' + f));
  }
}
/* 首次发布到空仓库时没有 HEAD（分支还没出生），直接 diff HEAD 会 fatal，
   所以先探一下再说。 */
let hasHead = true;
try { run('git', ['-C', tmp, 'rev-parse', '--verify', 'HEAD'], { env }); } catch (e) { hasHead = false; }
if (hasHead) {
  const stat = run('git', ['-C', tmp, 'diff', '--stat', 'HEAD'], { env });
  if (stat.trim()) console.log('\n' + stat.trim());
} else {
  console.log('\n  远端仓库还是空的：本次是首次发布，' + planned.size + ' 个文件全部新增。');
}

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
/* 提交信息按实际变更生成，并带上源头提交号 —— 发布仓库的历史要能回溯到源码。
   以前这里是一条写死的字符串，不管发布什么内容，历史里全是同一句话。 */
const changed = run('git', ['-C', tmp, 'diff', '--cached', '--name-only'], { env })
  .trim().split('\n').filter(Boolean);
let srcSha = '';
try { srcSha = run('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { env }).trim(); } catch (e) {}
const shown = changed.slice(0, 5).join(', ') + (changed.length > 5 ? ' 等' : '');
const msg = 'publish: ' + shown + '（' + changed.length + ' 个文件' +
  (srcSha ? '，源头 ' + srcSha : '') + '，数据 ' + DB.meta.version + '）';
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
