/* Build browser favicons from the original LIGHTNING artwork.
 * Content-addressed PNG and ICO URLs invalidate icons cached by older releases. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root = process.cwd();
const mark = fs.readFileSync(path.join(root, 'assets/lightning-mark.png')).toString('base64');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightning-favicon-'));
const edge = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const probe = path.join(temp, 'render.html');
fs.writeFileSync(probe, `<!doctype html><pre id="out"></pre><script>
const image = new Image(); image.onload = () => {
 const results = [16,32,48,64].map(size => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const height = size * .9, width = height * image.width / image.height;
  ctx.drawImage(image, (size-width)/2, (size-height)/2, width, height);
  return {size, png:canvas.toDataURL('image/png').split(',')[1]};
 });
 document.getElementById('out').textContent = JSON.stringify(results);
}; image.src = 'data:image/png;base64,${mark}';
</script>`);
let frames;
try {
 const dom = execFileSync(edge, ['--headless=new','--disable-gpu','--no-sandbox','--user-data-dir='+path.join(temp,'profile'),'--virtual-time-budget=3000','--dump-dom','file:///'+probe.replaceAll('\\','/')], {encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']});
 frames = JSON.parse(dom.match(/<pre id="out">([^<]+)<\/pre>/)[1]).map(f=>({size:f.size,png:Buffer.from(f.png,'base64')}));
} finally { fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100}); }
const icon = frames.find(f=>f.size===32).png;
const hash = createHash('sha256').update(icon).digest('hex').slice(0,12);
const name = 'favicon-lightning-32-'+hash+'.png';
fs.writeFileSync(path.join(root,'assets',name), icon);
const header = Buffer.alloc(6 + frames.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);
let offset = header.length;
frames.forEach((f,i)=>{const p=6+i*16;header[p]=header[p+1]=f.size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(f.png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=f.png.length;});
fs.writeFileSync(path.join(root,'favicon.ico'),Buffer.concat([header,...frames.map(f=>f.png)]));
let html = fs.readFileSync(path.join(root,'index.html'),'utf8');
html = html.replace(/<link rel="icon"[^>]*>\s*/g,'');
html = html.replace('<!-- -------------------------------------------------------------- 图标 -- -->', '<!-- -------------------------------------------------------------- 图标 -- -->\n<link rel="icon" type="image/x-icon" href="favicon.ico?v='+hash+'">\n<link rel="icon" type="image/png" sizes="32x32" href="assets/'+name+'">');
fs.writeFileSync(path.join(root,'index.html'),html);
let page = fs.readFileSync(path.join(root,'404.html'),'utf8');
page = page.replace(/<link rel="icon"[^>]*>/,'<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,'+icon.toString('base64')+'">');
fs.writeFileSync(path.join(root,'404.html'),page);
console.log('已生成 '+name+' 和 favicon.ico（16/32/48/64px），页面引用已同步。');
