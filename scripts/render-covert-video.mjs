import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {encode,permutation} from './covert-fec.mjs';
const dir='artifacts/covert-video',frameDir='.tools/covert-video',seconds=8,fps=30;
await mkdir(dir,{recursive:true});await mkdir(frameDir,{recursive:true});
const ff=args=>new Promise((ok,bad)=>{const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});p.on('error',bad);p.on('exit',c=>c?bad(Error('FFmpeg '+c)):ok());});
await ff(['-i','C:/Users/POWER PC TYUMEN/Downloads/dwitch_yb1vdrfq.opt.mp4','-t',String(seconds),'-vf','fps=30,scale=1920:1080,setsar=1','-an','-c:v','libx264','-crf','16',dir+'/source-game.mp4']);
await ff(['-i','C:/Users/POWER PC TYUMEN/Downloads/bratishkin.opt.mp4','-t',String(seconds),'-vf','fps=30,scale=640:360,setsar=1','-an','-c:v','libx264','-crf','16',dir+'/source-camera.mp4']);
const coded=encode(await readFile('artifacts/covert-probe/payload-original.jpg'),3),perm=permutation(8*64800),tx=Uint8Array.from(perm,i=>i<coded.length?coded[i]:((i*1103515245>>>8)&1));
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{const page=await b.newPage();await page.goto('http://127.0.0.1:5173/');
await page.evaluate(async bits=>{
 document.body.innerHTML='<video id="g" muted></video><video id="c" muted></video><canvas id="o" width="1920" height="1080"></canvas>';
 for(const [id,file]of [['g','source-game'],['c','source-camera']]){const v=document.getElementById(id);v.src='/artifacts/covert-video/'+file+'.mp4';await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=bad;});}
 globalThis.tx=bits;globalThis.basis=[[1,2],[2,1]].map(([u,v])=>Float64Array.from({length:64},(_,i)=>.25*Math.cos((2*(i%8)+1)*u*Math.PI/16)*Math.cos((2*Math.floor(i/8)+1)*v*Math.PI/16)));
 globalThis.seek=async(v,t)=>{if(Math.abs(v.currentTime-t)<.00001)return;await new Promise(ok=>{v.onseeked=ok;v.currentTime=t;});};
},Array.from(tx));
for(let f=0;f<seconds*fps;f++){
 const png=await page.evaluate(async f=>{
  const g=document.getElementById('g'),cam=document.getElementById('c'),o=document.getElementById('o'),ctx=o.getContext('2d',{willReadFrequently:true});await Promise.all([seek(g,(f+.05)/30),seek(cam,(f+.05)/30)]);ctx.drawImage(g,0,0,1920,1080);ctx.drawImage(cam,1240,680,640,360);
  const image=ctx.getImageData(0,0,1920,1080),d=image.data,w=image.width,ys=new Float64Array(64),delta=new Float64Array(64);
  for(let by=0;by<1080;by+=8)for(let bx=0;bx<w;bx+=8){const block=(by/8)*(w/8)+bx/8;delta.fill(0);
   for(let j=0;j<64;j++){const i=((by+(j>>3))*w+bx+(j%8))*4;ys[j]=.299*d[i]+.587*d[i+1]+.114*d[i+2];}
   for(let k=0;k<2;k++){let c=0;for(let j=0;j<64;j++)c+=ys[j]*basis[k][j];let q=Math.round(c/32);const bit=tx[(f%8)*64800+block*2+k];if((q&1)!==bit){const a=(q-1)*32,b=(q+1)*32;q=Math.abs(c-a)<Math.abs(c-b)?q-1:q+1;}for(let j=0;j<64;j++)delta[j]+=(q*32-c)*basis[k][j];}
   for(let j=0;j<64;j++){const i=((by+(j>>3))*w+bx+(j%8))*4;for(let k=0;k<3;k++)d[i+k]+=delta[j];}
  }ctx.putImageData(image,0,0);return o.toDataURL('image/png').split(',')[1];
 },f);await writeFile(`${frameDir}/${String(f).padStart(3,'0')}.png`,Buffer.from(png,'base64'));
 if(f%30===29)console.log(`Hidden data rendered: ${f+1}/${seconds*fps} frames`);
}
}finally{await b.close();}
const codec=['-an','-c:v','libx264','-preset','fast','-b:v','6M','-maxrate','6M','-bufsize','12M','-pix_fmt','yuv420p','-g','60','-movflags','+faststart'];
await ff(['-i',dir+'/source-game.mp4','-i',dir+'/source-camera.mp4','-filter_complex','[0:v][1:v]overlay=1240:680:shortest=1[out]','-map','[out]',...codec,dir+'/normal-1080.mp4']);
await ff(['-framerate','30','-i',frameDir+'/%03d.png',...codec,dir+'/hidden-1080.mp4']);
const label=text=>`pad=1920:1144:0:64:color=0x100c17,drawtext=fontfile=public/brand/Manrope.ttf:text='${text}':x=32:y=15:fontsize=28:fontcolor=0xc79aff`;
await ff(['-i',dir+'/normal-1080.mp4','-i',dir+'/hidden-1080.mp4','-filter_complex',`[0:v]${label('Обычный стрим')}[a];[1:v]${label('Со скрытыми данными — QIM 32')}[b];[a][b]hstack=inputs=2[out]`,'-map','[out]','-an','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',dir+'/side-by-side.mp4']);
await ff(['-i',dir+'/normal-1080.mp4','-i',dir+'/hidden-1080.mp4','-filter_complex',`[0:v]crop=640:360:240:240,scale=1280:720:flags=neighbor,pad=1280:784:0:64:color=0x100c17,drawtext=fontfile=public/brand/Manrope.ttf:text='Обычный — участок 2x':x=24:y=16:fontsize=28:fontcolor=0xc79aff[a];[1:v]crop=640:360:240:240,scale=1280:720:flags=neighbor,pad=1280:784:0:64:color=0x100c17,drawtext=fontfile=public/brand/Manrope.ttf:text='Скрытые данные — участок 2x':x=24:y=16:fontsize=28:fontcolor=0xc79aff[b];[a][b]hstack=inputs=2[out]`,'-map','[out]','-an','-c:v','libx264','-crf','16','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',dir+'/side-by-side-detail.mp4']);
await ff(['-ss','3','-i',dir+'/side-by-side.mp4','-frames:v','1',dir+'/poster.png']);
await writeFile(dir+'/manifest.json',JSON.stringify({seconds,fps,step:32,sameEncoding:'libx264 preset fast, target/max 6Mbps, buffer 12Mbps, GOP 60, yuv420p',payload:'same JPEG packet repeated every 8 frames, not a live changing restoration patch',source:'user-provided clips, consecutive first 8 seconds',audio:false,visualOnly:true},null,2));
console.log('Created '+dir+'/side-by-side.mp4 and side-by-side-detail.mp4');
