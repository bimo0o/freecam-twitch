import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {annexBUnits,packetBytes,codePacket,makeHeader,writeFrameBits,WINDOW} from '../shared/covert-protocol.mjs';
const args=process.argv.slice(2),get=(n,d)=>args.includes(n)?args[args.indexOf(n)+1]:d;
const step=Number(get('--step','24')),count=Number(get('--frames','96')),total=count+WINDOW;
if(count%WINDOW||count<8||count>216)throw Error('Use 8..216 source frames in groups of 8');
const dir=`artifacts/covert-stream-${step}`,frames=`.tools/covert-stream-${step}`;
await mkdir(dir,{recursive:true});await mkdir(frames,{recursive:true});
const ff=a=>new Promise((ok,bad)=>{const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...a],{stdio:'inherit',windowsHide:true});p.on('error',bad);p.on('exit',c=>c?bad(Error('ffmpeg '+c)):ok());});
await ff(['-i','artifacts/covert-video/source-game.mp4','-frames:v',String(count),'-vf','crop=640:360:1240:680','-an','-c:v','libx264','-preset','fast','-crf','32','-bf','0','-g','30','-x264-params','aud=1:repeat-headers=1','-f','h264',dir+'/reference-patch.h264']);
const units=annexBUnits(new Uint8Array(await readFile(dir+'/reference-patch.h264')));if(units.length!==count)throw Error('H.264 unit count mismatch');
const packets=[];for(let n=0;n<count;n+=WINDOW){const bytes=packetBytes(n/WINDOW,n,units.slice(n,n+WINDOW));packets.push({bytes,bits:codePacket(bytes)});}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/');
 await page.evaluate(async()=>{const {createModem}=await import('/src/experimental/covert-modem.mjs');globalThis.modem=await createModem();document.body.innerHTML='<video id="g" muted></video><video id="c" muted></video><canvas id="out" width="1920" height="1080"></canvas>';for(const [id,url]of [['g','source-game'],['c','source-camera']]){const v=document.getElementById(id);v.src='/artifacts/covert-video/'+url+'.mp4';await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=bad;});}globalThis.seek=async(v,t)=>{if(Math.abs(v.currentTime-t)<1e-5)return;await new Promise(ok=>{v.onseeked=ok;v.currentTime=t;});};});
 const timings=[];let mse=0;
 if(!args.includes('--reuse-frames'))for(let n=0;n<total;n++){
  const packet=packets[Math.floor(n/WINDOW)-1],header=makeHeader({frameId:n,packetId:packet?Math.floor(n/WINDOW)-1:0xffffffff,startFrame:packet?(Math.floor(n/WINDOW)-1)*WINDOW:0,byteLength:packet?.bytes.length||0,chunk:n%WINDOW,step}),bits=writeFrameBits(header,packet?.bits);
  const result=await page.evaluate(async({n,bits,step})=>{const g=document.getElementById('g'),c=document.getElementById('c'),o=document.getElementById('out'),ctx=o.getContext('2d',{willReadFrequently:true});await Promise.all([seek(g,(n+.05)/30),seek(c,(n+.05)/30)]);ctx.drawImage(g,0,0,1920,1080);ctx.drawImage(c,1240,680,640,360);const original=ctx.getImageData(0,0,1920,1080),r=modem.embed(original,new Uint8Array(bits),step);let error=0;for(let i=0;i<original.data.length;i+=4)for(let k=0;k<3;k++)error+=(original.data[i+k]-r.image.data[i+k])**2;ctx.putImageData(r.image,0,0);return {png:o.toDataURL('image/png').split(',')[1],ms:r.ms,mse:error/(1920*1080*3)};},{n,bits:Array.from(bits),step});
  await writeFile(`${frames}/${String(n).padStart(3,'0')}.png`,Buffer.from(result.png,'base64'));timings.push(result.ms);mse+=result.mse;
  if(n%24===23)console.log(`Encoded ${n+1}/${total} frames, modem ${result.ms.toFixed(1)}ms`);
 }
 const codec=['-c:v','libx264','-preset','fast','-b:v','6M','-maxrate','6M','-bufsize','12M','-pix_fmt','yuv420p','-g','60'];
 // A diagnostic impulse is in the SAME MP4 as the video. No second audio connection.
 const audio=['-f','lavfi','-i',"aevalsrc='if(lt(mod(t,0.266666667),0.025),0.15*sin(2*PI*880*t),0)':s=48000"];
 await ff(['-framerate','30','-i',frames+'/%03d.png',...audio,'-t',String(total/30),...codec,'-c:a','aac','-b:a','96k','-movflags','+faststart',dir+'/stream.mp4']);
 await ff(['-i','artifacts/covert-video/source-game.mp4','-i','artifacts/covert-video/source-camera.mp4','-filter_complex','[0:v][1:v]overlay=1240:680:shortest=1[out]','-map','[out]','-t',String(total/30),'-an',...codec,'-movflags','+faststart',dir+'/normal.mp4']);
 const manifest={step,fps:30,window:WINDOW,sourceFrames:count,totalFrames:total,delayFrames:32,codec:'avc1.64001e',width:1920,height:1080,camera:{x:1240,y:680,width:640,height:360},patchCrf:32,packetSizes:packets.map(p=>p.bytes.length),video:'stream.mp4'};
 await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2));
 const report=await page.evaluate(async({dir,step,total})=>{const {PacketReceiver}=await import('/shared/covert-protocol.mjs'),rx=new PacketReceiver(),v=document.getElementById('g');v.src='/'+dir+'/stream.mp4';await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=bad;});const o=document.getElementById('out'),ctx=o.getContext('2d',{willReadFrequently:true}),samples=[],received=[],decoded=[];let decodeError=null;
  const decoder=new VideoDecoder({output:frame=>{decoded.push({timestamp:frame.timestamp,width:frame.codedWidth,height:frame.codedHeight});frame.close();},error:e=>decodeError=String(e)});decoder.configure({codec:'avc1.64001e',optimizeForLatency:true});let needsKey=true;
  const isKey=b=>{for(let i=0;i<b.length-4;i++)if(b[i]===0&&b[i+1]===0&&((b[i+2]===1&&(b[i+3]&31)===5)||(b[i+2]===0&&b[i+3]===1&&(b[i+4]&31)===5)))return true;return false;};
  for(let n=0;n<total;n++){await seek(v,(n+.05)/30);ctx.drawImage(v,0,0,1920,1080);const t=performance.now(),ex=modem.extract(ctx.getImageData(0,0,1920,1080),step),r=rx.push(ex.soft),ms=performance.now()-t;samples.push({frame:n,extractMs:ex.ms,totalMs:ms,header:r.header?.frameId??null});if(r.packet){received.push({id:r.packet.id,start:r.packet.start,receivedAt:n,ms});r.packet.units.forEach((bytes,j)=>{const key=isKey(bytes);if(needsKey&&!key)return;if(key)needsKey=false;decoder.decode(new EncodedVideoChunk({type:key?'key':'delta',timestamp:Math.round((r.packet.start+j)*1e6/30),data:bytes}));});}else if(rx.stats.corrupt&&n%8===7)needsKey=true;}
  if(decoder.state==='configured')await decoder.flush();decoder.close();return {stats:rx.stats,received,decoded,decodeError,samples};
 },{dir,step,total});
 report.embedMs=timings;report.coverPsnrBeforeEncoding=timings.length?10*Math.log10(255**2/(mse/timings.length)):null;report.kind='Offline sequential extraction, not live throughput or actual Twitch';await writeFile(dir+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({stats:report.stats,decodedFrames:report.decoded.length,decodeError:report.decodeError,coverPsnr:report.coverPsnrBeforeEncoding,packets:manifest.packetSizes,embedMean:timings.reduce((a,b)=>a+b,0)/timings.length,extractMean:report.samples.reduce((a,b)=>a+b.extractMs,0)/report.samples.length,processingMax:Math.max(...report.samples.map(s=>s.totalMs))}));
}finally{await browser.close();}
