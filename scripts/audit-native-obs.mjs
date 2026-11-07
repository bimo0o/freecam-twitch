import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {parseAvcMp4} from '../shared/covert-mp4.mjs';
import {avccNals,readSei,nals} from '../shared/covert-sei.mjs';
const file=process.argv[2];if(!file)throw Error('Pass the local native OBS recording');
const dir='artifacts/Freecam-OBS-Private/audit';await mkdir(dir,{recursive:true});
const ff=args=>new Promise((resolve,reject)=>{const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code?reject(Error('ffmpeg '+code)):resolve());});
await ff(['-i',file,'-t','4','-map','0:v:0','-c:v','copy','-an','-movflags','+faststart',dir+'/main.mp4']);
const positions=await new Promise((resolve,reject)=>{const chunks=[];const child=spawn('ffprobe',['-v','error','-select_streams','v:0','-show_packets','-show_entries','packet=pos,pts_time','-of','json',dir+'/main.mp4'],{windowsHide:true});child.stdout.on('data',b=>chunks.push(b));child.on('error',reject);child.on('exit',code=>code?reject(Error('ffprobe')):resolve(JSON.parse(Buffer.concat(chunks))));});const display=positions.packets.sort((a,b)=>Number(a.pts_time)-Number(b.pts_time));const displayIndex=new Map(display.map((p,i)=>[Number(p.pos),i]));
const mp4=parseAvcMp4(await readFile(dir+'/main.mp4')),entries=[];let hasKey=false,markers=0;
for(let i=0;i<mp4.samples.length;i++){
 const packets=avccNals(mp4.samples[i].data,mp4.lengthSize).flatMap(readSei);
 const packet=packets[0];if(!packet?.bytes.length){markers++;continue;}
 entries.push({i:displayIndex.get(mp4.samples[i].data.byteOffset),packet});
}
entries.sort((a,b)=>a.packet.timestamp-b.packet.timestamp);while(entries.length&&!nals(entries[0].packet.bytes).some(n=>(n.bytes[0]&31)===5))entries.shift();
assert.ok(entries.length>30,'Native OBS output must carry actual compressed backgrounds');
await writeFile(dir+'/patch.h264',Buffer.concat(entries.map(e=>Buffer.from(e.packet.bytes))));
await ff(['-i',dir+'/main.mp4','-vf','crop=2:2:100:100','-pix_fmt','rgb24','-f','rawvideo',dir+'/main.rgb']);
await ff(['-i',dir+'/patch.h264','-vf','crop=2:2:320:180','-pix_fmt','rgb24','-f','rawvideo',dir+'/patch.rgb']);
const main=await readFile(dir+'/main.rgb'),patch=await readFile(dir+'/patch.rgb');
assert.equal(patch.length,entries.length*12,'Every transmitted auxiliary frame must decode');
let maxError=0,badFrames=0;const colors=new Set();
for(let frame=0;frame<entries.length;frame++){
 const source=entries[frame].i;let error=0;colors.add([...main.subarray(source*12,source*12+3)].join(','));
 for(let pixel=0;pixel<12;pixel++)error=Math.max(error,Math.abs(main[source*12+pixel]-patch[frame*12+pixel]));
 maxError=Math.max(maxError,error);if(error>12)badFrames++;
}
const report={scope:'Real isolated OBS native output; changing synthetic background; no public stream',samples:mp4.samples.length,decodedBackgrounds:entries.length,markers,distinctColors:colors.size,maxRgbError:maxError,badFrames,passed:colors.size>=3&&badFrames===0};
await writeFile(dir+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.ok(report.passed,'Background color must match the same main frame, including transitions');
