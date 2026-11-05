import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const out='artifacts/Freecam-Streamer';await mkdir(out,{recursive:true});
const html=await readFile('dist/setup.html','utf8');
const names=new Set([...html.matchAll(/(?:src|href)="\.\/([^"?#]+\.(?:js|css))"/g)].map(m=>m[1]));
// Resolve the setup entry's relative imports without shipping unrelated app views.
for(const name of names){if(name.endsWith('.js')){const source=await readFile(`dist/${name}`,'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+\.js)["']/g))names.add(path.posix.join(path.posix.dirname(name),m[1]));}}
const notices=await readFile('node_modules/vite/LICENSE.md');
const entries=[['/setup.html',Buffer.from(html.replace(/<p><a href="\/packed\.html[^]*?<\/a><\/p>/,'<p><a href="/LICENSE">Лицензия</a> · <a href="/notices.txt">Сторонние компоненты</a></p>'))],['/LICENSE',await readFile('LICENSE')],['/notices.txt',notices]];
for(const name of names)entries.push(['/'+name,await readFile('dist/'+name)]);
const integer=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;};
const bytes=[integer(entries.length)];for(const [name,data]of entries){const n=Buffer.from(name);bytes.push(integer(n.length),n,integer(data.length),data);}
await writeFile('.tools/streamer-assets.bin',Buffer.concat(bytes));
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('close',c=>c?reject(Error(`${cmd}: ${c}`)):resolve());});
await run('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe',['/nologo','/target:winexe','/platform:anycpu','/optimize+','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+path.resolve(out,'Freecam Setup.exe'),'/resource:'+path.resolve('.tools/streamer-assets.bin')+',FreecamAssets',path.resolve('desktop/FreecamSetup.cs')]);
await copyFile('LICENSE',out+'/LICENSE.txt');await writeFile(out+'/THIRD-PARTY-NOTICES.txt',notices);
await writeFile(out+'/НАЧНИ-ЗДЕСЬ.txt','FREECAM ДЛЯ СТРИМЕРА\n\n1. Запустите Freecam Setup.exe. Мастер откроется в браузере; Node.js не нужен.\n2. В OBS 28+ один раз включите Сервис → Настройки сервера WebSocket. Оставьте авторизацию включённой и введите пароль в мастере.\n3. Выберите существующие источники игры и камеры и нажмите «Подготовить и открыть сцену». Если источников ещё нет, добавьте их в OBS.\n\nБудет создана новая сцена. Общий холст и выход OBS изменятся на 1920×1080; эфир и запись должны быть остановлены. Исходные сцены сохраняются. Пароль используется только для локального подключения к OBS.\nПроверьте preview в OBS. Эфир запускается вручную. Не включайте захват экрана с паролями или приватными окнами.\n\nДля зрителя: папка browser-extension загружается как распакованное расширение в Chrome/Edge, затем открывается канал на twitch.tv. Это бета: совместимость с живым Twitch ещё не подтверждена.\n\nПосле настройки приложение можно закрыть. Нужны Windows 10/11 и системный .NET Framework 4.8.\n');
const ext=out+'/browser-extension';await mkdir(ext,{recursive:true});for(const file of await readdir('browser-extension'))if(!file.endsWith('.md'))await copyFile('browser-extension/'+file,ext+'/'+file);
console.log('Portable streamer app: '+path.resolve(out,'Freecam Setup.exe'));
