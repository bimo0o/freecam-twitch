import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const p=await b.newPage({viewport:{width:1280,height:900}});await p.goto('http://127.0.0.1:5173/');await p.addScriptTag({path:'browser-extension/edge-core.js'});
 const exact=await p.evaluate(()=>{
  const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});const source=make(1920,1080),s=source.getContext('2d');
  for(let y=0;y<1080;y+=8)for(let x=0;x<1920;x+=8){s.fillStyle=`rgb(${x%256},${y%256},${(x+y)%256})`;s.fillRect(x,y,8,8);}
  const cam=make(640,360);cam.getContext('2d').fillRect(0,0,640,360);
  const l=FreecamEdgeCore.layout('full'),packed=make(1920,1080),out=make(l.game.width,l.game.height),ref=make(l.game.width,l.game.height);
  FreecamEdgeCore.encode(source,cam,'full',packed);FreecamEdgeCore.decode(packed,'full',out);ref.getContext('2d').drawImage(source,0,0,ref.width,ref.height);
  const a=out.getContext('2d').getImageData(0,0,out.width,out.height).data,c=ref.getContext('2d').getImageData(0,0,ref.width,ref.height).data;let errors=0;for(let i=0;i<a.length;i++)if(a[i]!==c[i])errors++;
  return {differentChannels:errors,totalChannels:a.length,marker:FreecamEdgeCore.detect(packed)};
 });assert.equal(exact.differentChannels,0);assert.equal(exact.marker,'full');
 await p.setContent('<div style="position:relative;width:1100px;height:619px"><video muted loop playsinline style="width:100%;height:100%" src="/artifacts/edge-lab/full-1080.mp4"></video></div>');
 await p.addScriptTag({path:'browser-extension/core.js'});await p.addScriptTag({path:'browser-extension/runtime.js'});
 await p.evaluate(async()=>{await document.querySelector('video').play();FreecamPackedController.start();});
 await p.waitForFunction(()=>document.querySelector('[data-freecam-packed]')?.dataset.transport==='edge-full');
 const runtime=await p.evaluate(()=>FreecamPackedController.report());assert.equal(runtime.active,true);
 const host=p.locator('[data-freecam-packed]');const handle=host.locator('.drag');await handle.hover();const box=await handle.boundingBox();await p.mouse.move(box.x+20,box.y+12);await p.mouse.down();await p.mouse.move(box.x-150,box.y-100,{steps:6});await p.mouse.up();
 const moved=await p.evaluate(()=>FreecamPackedController.report());assert.notEqual(moved.placement.x,runtime.placement.x);
 await host.locator('[aria-label="Скрыть камеру"]').click();assert.equal(await p.evaluate(()=>FreecamPackedController.report().placement.hidden),true);
 await p.evaluate(()=>FreecamPackedController.stop());assert.equal(await p.locator('[data-freecam-packed]').count(),0);assert.notEqual(await p.locator('video').evaluate(v=>v.style.opacity),'0');
 // Unmarked content must never be interpreted as a camera/patch transport.
 await p.evaluate(async()=>{const v=document.querySelector('video');v.src='/artifacts/edge-lab/game.mp4';await v.play();FreecamPackedController.start();});await p.waitForTimeout(1200);assert.equal(await p.evaluate(()=>FreecamPackedController.report().active),false);
 const result={exactBeforeCompression:exact,runtime:{active:runtime.active,frames:runtime.frames,drag:true,hide:true,stopRestoresOriginal:true,unmarkedRejected:true}};
 await writeFile('artifacts/edge-lab/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
