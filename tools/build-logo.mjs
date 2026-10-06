/* Build all VELTRIX web brand references from the checked-in vector artwork.
 * Usage: node tools/build-logo.mjs
 * Geometry comes from the approved logo; do not substitute a font for the wordmark.
 */
import fs from 'node:fs';
import path from 'node:path';
import {svgDataUri} from './brand-svg.mjs';
const root = process.cwd();
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const uri = svgDataUri;
function write(name, content) {
  const file = path.join(root, name);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) fs.writeFileSync(file, content);
}
const mark = read('assets/veltrix-mark.svg');
const word = read('assets/veltrix-wordmark.svg');
let css = read('assets/style.css');
for (const [part, svg] of [['mark', mark], ['wordmark', word]]) {
  css = css.replace(new RegExp('--(?:lightning|veltrix)-'+part+': url\\("[^"\\n]+"\\);'),
    '--veltrix-'+part+': url("'+uri(svg)+'");');
}
css = css.replaceAll('--lightning-', '--veltrix-')
  .replaceAll('MSI LIGHTNING', 'VELTRIX')
  .replaceAll('闪电标记', '标志')
  .replaceAll('aspect-ratio: 88 / 166', 'aspect-ratio: 334 / 278')
  .replaceAll('aspect-ratio: 406 / 55', 'aspect-ratio: 928 / 106')
  .replaceAll('width: 22px; flex: 0 0 22px;', 'width: 32px; flex: 0 0 32px;');
write('assets/style.css', css);
let idx = read('index.html').replaceAll('MSI LIGHTNING 闪电标记', 'VELTRIX 标志')
  .replaceAll('MSI LIGHTNING 闪电标记与字标', 'VELTRIX 标志与字标')
  .replaceAll('MSI LIGHTNING', 'VELTRIX');
write('index.html', idx);
const markPath = mark.match(/<path[^>]+\/>/)[0];
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="VELTRIX 功耗计算器">'+
  '<rect width="64" height="64" rx="10" fill="#121212"/>'+
  '<g transform="translate(6 10.36) scale(.15569)">'+markPath+'</g></svg>\n';
write('favicon.svg', favicon);
let page404 = read('404.html').replaceAll('MSI LIGHTNING', 'VELTRIX')
  .replaceAll('assets/lightning-*.png', 'assets/veltrix-*.svg')
  .replaceAll('闪电标记', '标志');
page404 = page404.replace(/(<link rel="icon"[^>]+href=")[^"]+("[^>]*>)/, '$1'+uri(favicon)+'$2');
page404 = page404.replace(/(<img class="eye" src=")[^"]+("[^>]*>)/, '$1'+uri(mark)+'$2');
page404 = page404.replace(/(<img class="wordmark" src=")[^"]+("[^>]*>)/, '$1'+uri(word)+'$2');
page404 = page404.replace(/\.lockup \{[^}]+\}/, '.lockup { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 0 auto 22px; }');
page404 = page404.replace(/\.lockup \.eye \{[^}]+\}/, '.lockup .eye { display: block; width: 70px; height: auto; }');
page404 = page404.replace(/\.lockup \.wordmark \{[^}]+\}/, '.lockup .wordmark { display: block; width: 210px; height: auto; }');
page404 = page404.replace('width="84" height="43"', 'width="70" height="58"')
  .replace('width="150" height="31"', 'width="210" height="24"')
  .replace('透明 PNG 纵向组合', '矢量横向组合');
write('404.html', page404);
console.log('VELTRIX 已同步：页头、声明弹窗、favicon 和自包含 404 页。');
