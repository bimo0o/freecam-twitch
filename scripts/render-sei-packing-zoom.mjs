import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const dir='artifacts/covert-sei';await mkdir(dir,{recursive:true});
const ff=a=>new Promise((ok,bad)=>{const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...a],{stdio:'inherit',windowsHide:true});p.on('error',bad);p.on('exit',c=>c?bad(Error('ffmpeg '+c)):ok());});
// Flat blue plus sharp geometry: same 320x180 rectangle, nearest-neighbour x3.
const region={x:400,y:280,width:320,height:180,scale:3};
const label=text=>`crop=${region.width}:${region.height}:${region.x}:${region.y},scale=960:540:flags=neighbor,pad=960:604:0:64:color=0x100c17,drawtext=fontfile=public/brand/Manrope.ttf:text='${text}':x=22:y=18:fontsize=25:fontcolor=0xc79aff`;
await ff(['-i',dir+'/normal.mp4','-i',dir+'/stream.mp4','-filter_complex',`[0:v]${label('Оригинал — 3x')}[a];[1:v]${label('Данные упакованы в SEI — 3x')}[b];[a][b]hstack=inputs=2[out]`,'-map','[out]','-map','0:a:0','-t','3.2','-r','30','-c:v','libx264','-crf','12','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',dir+'/packing-zoom-3x.mp4']);
// Independent full-frame comparison, BEFORE the presentation re-encode.
await ff(['-i',dir+'/normal.mp4','-i',dir+'/stream.mp4','-filter_complex','[0:v][1:v]blend=all_mode=difference,signalstats,metadata=print:file=artifacts/covert-sei/packing-difference.txt','-an','-frames:v','96','-f','null','-']);
const stats=await readFile(dir+'/packing-difference.txt','utf8');const maxima=[...stats.matchAll(/lavfi\.signalstats\.(?:YMAX|UMAX|VMAX)=(\d+)/g)].map(m=>Number(m[1]));if(maxima.length!==96*3||maxima.some(n=>n!==0))throw Error('Decoded pictures differ');
await ff(['-ss','1','-i',dir+'/packing-zoom-3x.mp4','-frames:v','1',dir+'/packing-zoom-3x.png']);
await writeFile(dir+'/packing-zoom-report.json',JSON.stringify({left:'normal.mp4',right:'stream.mp4',stage:'before restoration',region,frames:96,decodedPixelDifferenceMax:0,video:'packing-zoom-3x.mp4',meaning:'SEI is bitstream metadata, not a pixel region. This compares decoded image, not file bytes.'},null,2));
console.log('Packing zoom created; full-frame decoded difference is zero on 96 frames.');
