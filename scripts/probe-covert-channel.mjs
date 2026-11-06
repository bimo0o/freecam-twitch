// Capacity screening only. Known pseudorandom payload, NOT a webcam restoration product.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {encode,decode,permutation} from './covert-fec.mjs';
const dir='artifacts/covert-probe',frames=8;
const fec=process.argv.includes('--fec');
await mkdir(dir,{recursive:true});
const ff=args=>new Promise((ok,bad)=>{const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});p.on('error',bad);p.on('exit',c=>c?bad(Error('ffmpeg '+c)):ok());});
// Representative patch bitrate, including a real compressed payload's container overhead.
await ff(['-i','artifacts/edge-lab/game.mp4','-vf','crop=640:360:1240:680','-an','-c:v','libx264','-crf','23','-preset','fast','-movflags','+faststart',dir+'/patch-reference.mp4']);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
const p=await browser.newPage();await p.goto('http://127.0.0.1:5173/');
await p.evaluate(async()=>{
 document.body.innerHTML='<video id="g" muted></video><video id="c" muted></video><canvas id="out" width="1920" height="1080"></canvas>';
 for(const [id,file]of [['g','game'],['c','camera']]){const v=document.getElementById(id);v.src='/artifacts/edge-lab/'+file+'.mp4';await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=bad;});}
 globalThis.seek=async(v,t)=>{if(Math.abs(v.currentTime-t)<.00001)return;await new Promise(ok=>{v.onseeked=ok;v.currentTime=t;});};
 globalThis.basis=[[1,2],[2,1]].map(([u,v])=>Float64Array.from({length:64},(_,i)=>.25*Math.cos((2*(i%8)+1)*u*Math.PI/16)*Math.cos((2*Math.floor(i/8)+1)*v*Math.PI/16)));
 globalThis.bit=(block,k)=>{let x=Math.imul(block+1,0x45d9f3b)^Math.imul(k+1,0x119de1f3);x^=x>>>16;return x&1;};
 globalThis.embed=(image,step)=>{
  const d=image.data,w=image.width;let error=0;
  for(let by=0;by<image.height;by+=8)for(let bx=0;bx<w;bx+=8){const block=(by/8)*(w/8)+bx/8,ys=new Float64Array(64),delta=new Float64Array(64);
   for(let j=0;j<64;j++){const i=((by+(j>>3))*w+bx+(j%8))*4;ys[j]=.299*d[i]+.587*d[i+1]+.114*d[i+2];}
   for(let k=0;k<2;k++){let c=0;for(let j=0;j<64;j++)c+=ys[j]*basis[k][j];let q=Math.round(c/step);if((q&1)!==bit(block,k)){const a=(q-1)*step,b=(q+1)*step;q=Math.abs(c-a)<Math.abs(c-b)?q-1:q+1;}for(let j=0;j<64;j++)delta[j]+=(q*step-c)*basis[k][j];}
   for(let j=0;j<64;j++){const i=((by+(j>>3))*w+bx+(j%8))*4;for(let k=0;k<3;k++){const prev=d[i+k];d[i+k]=prev+delta[j];error+=(d[i+k]-prev)**2;}}
  }return {image,mse:error/(image.width*image.height*3)};
 };
 globalThis.recover=(image,step)=>{const d=image.data,w=image.width;let errors=0,total=0;
  for(let by=0;by<image.height;by+=8)for(let bx=0;bx<w;bx+=8){const block=(by/8)*(w/8)+bx/8;
   for(let k=0;k<2;k++){let coeff=0;for(let j=0;j<64;j++){const i=((by+(j>>3))*w+bx+(j%8))*4;coeff+=(.299*d[i]+.587*d[i+1]+.114*d[i+2])*basis[k][j];}if((Math.round(coeff/step)&1)!==bit(block,k))errors++;total++;}
  }return {errors,total};
 };
});
const report={kind:'short local DCT/QIM channel screening; not real Twitch; no restoration decoder or error correction',frames,fps:30,rawBitsPerFrame:64800,rawBitsPerSecond:1944000,results:[]};
let payload,coded,perm,tx;
if(fec){
 const jpeg=await p.evaluate(async()=>{const v=document.getElementById('g');await seek(v,.5);const c=document.createElement('canvas');c.width=640;c.height=360;c.getContext('2d').drawImage(v,1240,680,640,360,0,0,640,360);return c.toDataURL('image/jpeg',.5).split(',')[1];});
 payload=Buffer.from(jpeg,'base64');coded=encode(payload,3);const n=frames*64800;if(coded.length>n)throw Error('Payload does not fit probe');perm=permutation(n);tx=Uint8Array.from(perm,i=>i<coded.length?coded[i]:((i*1103515245>>>8)&1));
 await writeFile(dir+'/payload-original.jpg',payload);await p.evaluate(bits=>{globalThis.tx=bits;globalThis.frameIndex=0;globalThis.bit=(block,k)=>tx[frameIndex*64800+block*2+k];},Array.from(tx));
 report.kind='Actual JPEG payload, K7 rate 1/3 convolutional FEC, soft decisions and interleaving; short local screening, not live restoration';report.payloadBytes=payload.length;report.codedBits=coded.length;report.payloadSha256=createHash('sha256').update(payload).digest('hex');
}
for(const step of (fec?[16,32]:[8,16,32,64])){
 const folder=`.tools/covert-${step}`;await mkdir(folder,{recursive:true});let coverMse=0,uncompressedErrors=0;
 for(let i=0;i<frames;i++){
  const r=await p.evaluate(async({t,step,i})=>{globalThis.frameIndex=i;const g=document.getElementById('g'),c=document.getElementById('c'),o=document.getElementById('out'),ctx=o.getContext('2d',{willReadFrequently:true});await Promise.all([seek(g,t),seek(c,t)]);ctx.drawImage(g,0,0,1920,1080);ctx.drawImage(c,1240,680,640,360);const result=embed(ctx.getImageData(0,0,1920,1080),step);const check=recover(result.image,step);ctx.putImageData(result.image,0,0);return {png:o.toDataURL('image/png').split(',')[1],mse:result.mse,errors:check.errors};},{t:.5+i/30,step,i});
  coverMse+=r.mse;uncompressedErrors+=r.errors;await writeFile(`${folder}/${String(i).padStart(3,'0')}.png`,Buffer.from(r.png,'base64'));
 }
 await ff(['-framerate','30','-i',folder+'/%03d.png','-an','-c:v','libx264','-preset','fast','-b:v','6M','-maxrate','6M','-bufsize','12M','-pix_fmt','yuv420p','-movflags','+faststart',`${dir}/qim-${step}.mp4`]);
 const decoded=await p.evaluate(async({url,step,frames,fec})=>{const v=document.createElement('video');v.muted=true;v.src=url;await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=bad;});const o=document.getElementById('out'),ctx=o.getContext('2d',{willReadFrequently:true});let errors=0,total=0;const bits=[];
  for(let i=0;i<frames;i++){globalThis.frameIndex=i;await seek(v,(i+.05)/30);ctx.drawImage(v,0,0,1920,1080);const image=ctx.getImageData(0,0,1920,1080),r=recover(image,step);errors+=r.errors;total+=r.total;
   if(fec){const d=image.data,w=image.width;for(let by=0;by<image.height;by+=8)for(let bx=0;bx<w;bx+=8)for(let k=0;k<2;k++){let coeff=0;for(let j=0;j<64;j++){const at=((by+(j>>3))*w+bx+(j%8))*4;coeff+=(.299*d[at]+.587*d[at+1]+.114*d[at+2])*basis[k][j];}const q=coeff/step,even=2*Math.round(q/2),odd=2*Math.round((q-1)/2)+1;bits.push((q-even)**2-(q-odd)**2);}}
  }return {errors,total,bitErrorRate:errors/total,...(fec?{bits}:{})};
 },{url:`/artifacts/covert-probe/qim-${step}.mp4`,step,frames,fec});
 let payloadResult={};if(fec){const rx=new Float32Array(tx.length);decoded.bits.forEach((b,j)=>rx[perm[j]]=b);delete decoded.bits;const recovered=decode(rx,payload.length,3,true),exact=Buffer.from(recovered).equals(payload);await writeFile(`${dir}/payload-recovered-${step}.jpg`,recovered);payloadResult={payloadExact:exact,sha256:createHash('sha256').update(recovered).digest('hex')};}
 const r={step,coverPsnrBeforeEncoding:10*Math.log10(255**2/(coverMse/frames)),uncompressedBitErrorRate:uncompressedErrors/(64800*frames),...decoded,...payloadResult};report.results.push(r);console.log(JSON.stringify(r));
 await writeFile(dir+(fec?'/report-fec.json':'/report.json'),JSON.stringify(report,null,2));
}
}finally{await browser.close();}
