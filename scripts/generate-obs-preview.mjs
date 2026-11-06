import {chromium} from '@playwright/test';import {mkdir} from 'node:fs/promises';import {spawn} from 'node:child_process';
await mkdir('.tools/hint-frames',{recursive:true});await mkdir('docs/assets',{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{const p=await b.newPage({viewport:{width:1420,height:132}});await p.goto('http://127.0.0.1:5173/obs-hint.html');await p.evaluate(()=>document.fonts.ready);
for(let i=0;i<200;i++){await p.evaluate(t=>{for(const a of document.getAnimations()){a.pause();a.currentTime=t;}},i*40);await p.screenshot({path:`.tools/hint-frames/${String(i).padStart(3,'0')}.png`,omitBackground:true});}
await p.setViewportSize({width:320,height:900});await p.goto('http://127.0.0.1:5173/viewer-panel.html');await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:'.tools/viewer-panel.png'});
}finally{await b.close();}
async function ff(args){await new Promise((resolve,reject)=>{const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('close',c=>c?reject(Error('FFmpeg '+c)):resolve());});}
await ff(['-framerate','25','-i','.tools/hint-frames/%03d.png','-filter_complex','[0:v]scale=1065:-1,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=bayer','-frames:v','200','-loop','0','docs/assets/stream-banner.gif']);
await ff(['-i','.tools/packed-presentation.mp4','-loop','1','-i','.tools/viewer-panel.png','-framerate','25','-i','.tools/hint-frames/%03d.png','-filter_complex','[0:v][1:v]overlay=1600:0[a];[a][2:v]overlay=32:930','-t','8','-r','25','-an','-c:v','libx264','-crf','21','-movflags','+faststart','docs/assets/obs-preview.mp4']);
await ff(['-ss','2','-i','docs/assets/obs-preview.mp4','-frames:v','1','docs/assets/obs-preview.png']);
