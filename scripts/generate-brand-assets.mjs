import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const symbol=await readFile('public/brand/symbol.svg','utf8');
for(const [name,color]of [['symbol-white','#F5F0FF'],['symbol-black','#100C17']])await writeFile(`public/brand/${name}.svg`,symbol.replace('#C79AFF',color));
const browser=await chromium.launch({executablePath:process.env.BROWSER_BIN||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:640,height:160},deviceScaleFactor:1});
 const font=(await readFile('public/brand/Manrope.ttf')).toString('base64');
 await page.setContent(`<style>@font-face{font-family:Manrope;src:url(data:font/ttf;base64,${font});font-weight:200 800}*{box-sizing:border-box}body{margin:0;background:transparent}#logo{width:640px;height:160px;display:flex;align-items:center;gap:20px;padding:20px;color:#F5F0FF;font:800 100px Manrope;letter-spacing:-4px}svg{width:156px;flex-shrink:0}</style><div id="logo">${symbol}<span>freecam</span></div>`);
 await page.evaluate(()=>document.fonts.ready);await page.locator('#logo').screenshot({path:'public/brand/logo.png',omitBackground:true});
 await mkdir('browser-extension/icons',{recursive:true});
 for(const size of [16,24,32,48,128,256]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${symbol}`);
  await page.screenshot({path:`browser-extension/icons/${size}.png`,omitBackground:true});
 }
 const sizes=[16,32,48,256],images=await Promise.all(sizes.map(s=>readFile(`browser-extension/icons/${s}.png`)));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((size,i)=>{const j=6+i*16;header[j]=size===256?0:size;header[j+1]=size===256?0:size;header.writeUInt16LE(1,j+4);header.writeUInt16LE(32,j+6);header.writeUInt32LE(images[i].length,j+8);header.writeUInt32LE(offset,j+12);offset+=images[i].length;});
 await writeFile('public/brand/freecam.ico',Buffer.concat([header,...images]));
 await copyFile('browser-extension/icons/128.png','public/brand/icon.png');
}finally{await browser.close();}
await mkdir('browser-extension/brand',{recursive:true});
for(const name of ['logo.png','Manrope.ttf','OFL.txt','FONTLOG.txt'])await copyFile('public/brand/'+name,'browser-extension/brand/'+name);
console.log('Drag vector master, wordmark, monochromes and icons generated.');
