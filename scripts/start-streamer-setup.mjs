import {spawn} from 'node:child_process';
const url='http://127.0.0.1:5173/setup.html';
const ready=async()=>{try{const response=await fetch(url,{signal:AbortSignal.timeout(700)});return response.ok&&(await response.text()).includes('Freecam · Подготовка OBS');}catch{return false;}};
const open=()=>{const [command,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];const child=spawn(command,args,{stdio:'ignore',windowsHide:true});child.on('error',()=>console.log(`Откройте ${url}`));child.unref();};
if(await ready()){open();console.log(`Мастер уже работает: ${url}`);}else{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{stdio:'inherit',windowsHide:true});let exited=false;
 server.on('error',()=>{exited=true;console.error('Не удалось запустить Freecam. Выполните npm ci.');process.exitCode=1;});
 server.on('exit',code=>{exited=true;if(code)process.exitCode=code;});
 const started=Date.now();while(!exited&&Date.now()-started<12000){if(await ready()){open();console.log('Мастер готов. Это окно можно закрыть после настройки OBS.');break;}await new Promise(resolve=>setTimeout(resolve,200));}
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill());
}
