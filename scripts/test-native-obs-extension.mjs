import {readFile,writeFile,cp} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const workerMode=process.argv.includes('--worker');const recording=process.argv[2];if(!recording)throw Error('Pass native OBS recording');
const mediaFile='artifacts/Freecam-OBS-Private/native-mse.mp4';
await new Promise((resolve,reject)=>{const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',recording,'-t','3.2','-map','0:v:0','-c:v','copy','-an','-movflags','frag_keyframe+empty_moov+default_base_moof',mediaFile],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code?reject(Error('ffmpeg')):resolve());});
const media=await readFile(mediaFile);let requests=0;
const html=`<!doctype html><style>body{margin:0;background:#100c17}.stage{position:relative;width:1100px;height:618.75px}video{width:100%;height:100%}</style><div class="stage"><video muted playsinline></video></div><script>const video=document.querySelector('video');if(${workerMode}){setTimeout(()=>{const w=new Worker('/worker.js',{type:'module'});w.onmessage=e=>{if(e.data.handle)video.srcObject=e.data.handle;};},100);}else{const ms=new MediaSource();video.src=URL.createObjectURL(ms);ms.addEventListener('sourceopen',async()=>{const bytes=await(await fetch('/media')).arrayBuffer();const sb=ms.addSourceBuffer('video/mp4; codecs="avc1.640028"');sb.addEventListener('updateend',()=>ms.endOfStream(),{once:true});sb.appendBuffer(bytes);});}</script>`;
const server=createServer((req,res)=>{if(req.url==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(`const ms=new MediaSource();const handle=ms.handle;postMessage({handle},[handle]);ms.addEventListener('sourceopen',async()=>{const bytes=await(await fetch('/media')).arrayBuffer();const sb=ms.addSourceBuffer('video/mp4; codecs="avc1.640028"');sb.addEventListener('updateend',()=>ms.endOfStream(),{once:true});sb.appendBuffer(bytes);});`);}else if(req.url==='/media'){requests++;res.setHeader('Content-Type','video/mp4');res.end(media);}else{res.setHeader('Content-Type','text/html');res.end(html);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const fixture=path.resolve('.tools/native-obs-extension');await cp('artifacts/Freecam-SEI-Extension',fixture,{recursive:true});
const manifest=JSON.parse(await readFile(fixture+'/manifest.json','utf8'));manifest.host_permissions=['http://127.0.0.1/*'];manifest.permissions.push('scripting');for(const script of manifest.content_scripts)script.matches=['http://127.0.0.1/*'];manifest.background={service_worker:'proof.js'};await writeFile(fixture+'/manifest.json',JSON.stringify(manifest));await writeFile(fixture+'/proof.js','chrome.runtime.onInstalled.addListener(()=>{});');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.tools/playwright-browsers');const {chromium}=await import('@playwright/test');
const context=await chromium.launchPersistentContext(path.resolve('.tools/native-proof-'+Date.now()),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),page=await context.newPage();if(workerMode)await worker.evaluate(()=>chrome.storage.local.set({workerCompatibility:true}));await page.goto(origin);
 const status=()=>worker.evaluate(async origin=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.startsWith(origin));return(await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.FreecamSei.status()}))[0].result;},origin);
 let state;for(let i=0;i<100;i++){state=await status();if(state.received>60&&state.decoded>30)break;await page.waitForTimeout(100);}
 assert.ok(state.decoded>30,JSON.stringify(state));const comparisons=[];
 for(const time of [.8,1.2,1.6,2,2.4,2.8]){
  await page.evaluate(time=>new Promise(resolve=>{const video=document.querySelector('video');video.addEventListener('seeked',resolve,{once:true});video.currentTime=time;}),time);await page.waitForTimeout(100);
  const result=await page.evaluate(()=>{const host=document.querySelector('[data-freecam-sei]');if(!host||host.hidden)return null;const game=host.shadowRoot.querySelector('.game').getContext('2d'),cam=host.shadowRoot.querySelector('.camera canvas').getContext('2d');return {background:[...game.getImageData(100,100,1,1).data],restored:[...game.getImageData(1560,860,1,1).data],camera:[...cam.getImageData(320,180,1,1).data]};});
  if(!result)continue;const error=Math.max(...result.background.slice(0,3).map((n,i)=>Math.abs(n-result.restored[i])));assert.ok(error<=12,JSON.stringify({time,error,...result}));assert.ok(result.camera.slice(0,3).some((n,i)=>Math.abs(n-result.restored[i])>30));comparisons.push({time,error,...result});
 }
 assert.ok(comparisons.length>=4);assert.equal(requests,1);state=await status();assert.ok(state.maxPairDeltaMs<=1);
 await page.screenshot({path:'artifacts/Freecam-OBS-Private/native-viewer-proof.png'});
 const report={scope:'Installed extension decoding one native OBS-produced stream; no separate background request',workerMode,requests,state,comparisons,passed:true};await writeFile('artifacts/Freecam-OBS-Private/native-'+(workerMode?'worker-':'')+'viewer-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,decoded:state.decoded,comparisons:comparisons.length,maxPairDeltaMs:state.maxPairDeltaMs}));
}finally{await context.close();await new Promise(resolve=>server.close(resolve));}
