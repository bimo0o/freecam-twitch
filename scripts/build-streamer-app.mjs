import {readFile,writeFile,mkdir,readdir,copyFile,cp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const out=process.env.FREECAM_APP_OUT||'artifacts/Freecam-Streamer';await mkdir(out,{recursive:true});
const html=await readFile('dist/setup.html','utf8');
const names=new Set([...html.matchAll(/(?:src|href)="\.\/([^"?#]+\.(?:js|css))"/g)].map(m=>m[1]));
// Resolve the setup entry's relative imports without shipping unrelated app views.
for(const name of names){if(name.endsWith('.js')){const source=await readFile(`dist/${name}`,'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+\.js)["']/g))names.add(path.posix.join(path.posix.dirname(name),m[1]));}}
const notices=Buffer.concat([await readFile('node_modules/vite/LICENSE.md'),Buffer.from('\n\nManrope font — SIL Open Font License\n\n'),await readFile('public/brand/OFL.txt'),Buffer.from('\n\n'),await readFile('public/brand/FONTLOG.txt')]);
const entries=[['/setup.html',Buffer.from(html.replace(/<p><a href="\/packed\.html[^]*?<\/a><\/p>/,'<p><a href="/LICENSE">Лицензия</a> · <a href="/notices.txt">Сторонние компоненты</a></p>'))],['/LICENSE',await readFile('LICENSE')],['/notices.txt',notices]];
for(const name of names)entries.push(['/'+name,await readFile('dist/'+name)]);
for(const name of await readdir('public/brand'))if(!entries.some(([key])=>key==='/brand/'+name))entries.push(['/brand/'+name,await readFile('public/brand/'+name)]);
const integer=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;};
const bytes=[integer(entries.length)];for(const [name,data]of entries){const n=Buffer.from(name);bytes.push(integer(n.length),n,integer(data.length),data);}
await writeFile('.tools/streamer-assets.bin',Buffer.concat(bytes));
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('close',c=>c?reject(Error(`${cmd}: ${c}`)):resolve());});
await run('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+path.resolve(out,'Freecam Setup.exe'),'/win32icon:'+path.resolve('public/brand/freecam.ico'),'/resource:'+path.resolve('public/brand/logo.png')+',FreecamLogo','/resource:'+path.resolve('public/brand/freecam.ico')+',FreecamIcon','/resource:'+path.resolve('.tools/streamer-assets.bin')+',FreecamAssets',path.resolve('desktop/FreecamSetup.cs')]);
await copyFile('LICENSE',out+'/LICENSE.txt');await writeFile(out+'/THIRD-PARTY-NOTICES.txt',notices);
await copyFile('public/obs-hint.html',out+'/obs-hint.html');
await cp('public/brand',out+'/brand',{recursive:true});
await copyFile('docs/STREAMER-QUICKSTART.md',out+'/НАЧНИ-ЗДЕСЬ.txt');
await cp('browser-extension',out+'/browser-extension',{recursive:true});
console.log('Portable streamer app: '+path.resolve(out,'Freecam Setup.exe'));
