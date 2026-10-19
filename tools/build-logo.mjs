import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const write = (name, data) => fs.writeFileSync(path.join(root, name), data);
const uri = part => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/lightning-' + part + '.png')).toString('base64');
let css = read('assets/style.css').replaceAll('VELTRIX', 'MSI LIGHTNING').replaceAll('--veltrix-', '--lightning-').replaceAll('334 / 278', '88 / 166').replaceAll('928 / 106', '406 / 55').replaceAll('width: 32px; flex: 0 0 32px;', 'width: 22px; flex: 0 0 22px;');
for (const part of ['mark', 'wordmark']) {
  css = css.replace(new RegExp('--lightning-' + part + ': url\\("[^"\\n]+"\\);'), '--lightning-' + part + ': url("' + uri(part) + '");');
}
write('assets/style.css', css);
write('index.html',read('index.html').replaceAll('VELTRIX', 'MSI LIGHTNING'));
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="MSI LIGHTNING 功耗计算器"><rect width="64" height="64" rx="10" fill="#121212"/><image x="19" y="7" width="26" height="50" href="' + uri('mark') + '"/></svg>\n';
write('favicon.svg', favicon);
let page = read('404.html').replaceAll('VELTRIX','MSI LIGHTNING').replace('width: 70px; height: auto','width: 32px; height: auto').replace('width="70" height="58"','width="32" height="60"').replace('width="210" height="24"','width="210" height="28"');
page = page.replace(/(<link rel="icon"[^>]+href=")[^"]+/, '$1data:image/svg+xml;base64,' + Buffer.from(favicon).toString('base64'));
for (const [cls, part] of [['eye', 'mark'], ['wordmark', 'wordmark']]) page = page.replace(new RegExp('(<img class="' + cls + '" src=")[^"]+'), '$1' + uri(part));
write('404.html', page);
console.log('MSI LIGHTNING：页头、弹窗、favicon 与 404 的 PNG 素材已同步。');
