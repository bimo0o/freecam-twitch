import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root='artifacts/edge-lab',fps=30,seconds=4;
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const ids=arg('--only','full,compact,soft').split(',');
const game=arg('--game','C:/Users/POWER PC TYUMEN/Downloads/dwitch_yb1vdrfq.opt.mp4'),cam=arg('--camera','C:/Users/POWER PC TYUMEN/Downloads/bratishkin.opt.mp4');
async function ff(args){await new Promise((ok,bad)=>{const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});p.on('error',bad);p.on('exit',c=>c?bad(Error('ffmpeg '+c)):ok());});}
await mkdir(root,{recursive:true});
if(!args.includes('--skip-input')){
 await ff(['-i',game,'-t',String(seconds),'-vf',`fps=${fps},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1`,'-an','-c:v','libx264','-crf','16',`${root}/game.mp4`]);
 await ff(['-i',cam,'-t',String(seconds),'-vf',`fps=${fps},scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1`,'-an','-c:v','libx264','-crf','16',`${root}/camera.mp4`]);
}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.goto('http://127.0.0.1:5173/');
 await page.addScriptTag({path:'browser-extension/edge-core.js'});
 await page.evaluate(async()=>{document.body.innerHTML='<video id="g" muted></video><video id="c" muted></video><canvas id="out"></canvas>';for(const [id,url]of [['g','game'],['c','camera']]){const v=document.getElementById(id);v.src='/artifacts/edge-lab/'+url+'.mp4';await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=bad;});}globalThis.seek=async(v,t)=>{if(Math.abs(v.currentTime-t)<.00001)return;await new Promise(ok=>{v.onseeked=ok;v.currentTime=t;});};});
 for(const id of ids){
  const frames=`.tools/edge-${id}`;await mkdir(frames,{recursive:true});
  for(let i=0;i<fps*seconds;i++){
   const data=await page.evaluate(async({t,id})=>{const g=document.getElementById('g'),c=document.getElementById('c'),o=document.getElementById('out');await Promise.all([seek(g,t),seek(c,t)]);FreecamEdgeCore.encode(g,c,id,o);return o.toDataURL('image/png').split(',')[1];},{t:(i+.05)/fps,id});
   await writeFile(`${frames}/${String(i).padStart(3,'0')}.png`,Buffer.from(data,'base64'));
  }
  console.log(`Rendered ${id}: ${fps*seconds} frames`);
  for(const [q,rate,size]of [['1080','6M','1920:1080'],['720','3M','1280:720'],['480','1500k','854:480']]){
   // Encode first as an OBS-like 6 Mbps source, then resize/re-encode lower qualities.
   const input=q==='1080'?['-framerate',String(fps),'-i',`${frames}/%03d.png`]:['-i',`${root}/${id}-1080.mp4`];
   await ff([...input,'-vf','scale='+size,'-an','-c:v','libx264','-preset','fast','-b:v',rate,'-maxrate',rate,'-bufsize',q==='1080'?'12M':q==='720'?'6M':'3M','-pix_fmt','yuv420p','-g','60','-movflags','+faststart',`${root}/${id}-${q}.mp4`]);
  }
 }
 let report={kind:'local H.264 simulation, not Twitch verification',seconds,fps,results:[]};
 if(args.includes('--only')){try{report=JSON.parse(await readFile(`${root}/report.json`,'utf8'));report.results=report.results.filter(r=>!ids.includes(r.id));}catch{}}
 for(const id of ids)for(const q of ['1080','720','480']){
  const r=await page.evaluate(async({id,q})=>{
   const v=document.createElement('video');v.muted=true;v.src=`/artifacts/edge-lab/${id}-${q}.mp4`;await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=bad;});
   const frame=document.createElement('canvas');frame.width=v.videoWidth;frame.height=v.videoHeight;
   const l=FreecamEdgeCore.layout(id),out=document.createElement('canvas'),expected=document.createElement('canvas');out.width=expected.width=l.game.width;out.height=expected.height=l.game.height;
   let sum=0,match=0,exact=0;const samples=[];
   for(const t of [.5,1,1.5,2,2.5,3,3.5]){await Promise.all([seek(v,t+.001),seek(document.getElementById('g'),t+.001)]);frame.getContext('2d').drawImage(v,0,0);const detected=FreecamEdgeCore.detect(frame);if(detected===id)match++;
    FreecamEdgeCore.decode(frame,id,out);expected.getContext('2d').drawImage(document.getElementById('g'),0,0,expected.width,expected.height);
    const c=l.camera,a=out.getContext('2d').getImageData(c.x,c.y,c.width,c.height).data,b=expected.getContext('2d').getImageData(c.x,c.y,c.width,c.height).data;let mse=0;for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++){mse+=(a[i+k]-b[i+k])**2;if(a[i+k]===b[i+k])exact++;}mse/=c.width*c.height*3;const psnr=10*Math.log10(255**2/mse);samples.push({t,psnr});sum+=psnr;
   }return {id,quality:q,markerSamples:match,totalSamples:7,patchPsnrMean:sum/7,samples};
  },{id,q});report.results.push(r);console.log(JSON.stringify(r));
 }
 await writeFile(`${root}/report.json`,JSON.stringify(report,null,2));
 await page.goto('http://127.0.0.1:5173/edge-lab.html');await page.waitForFunction(()=>document.getElementById('base')?.currentTime>0);
 await page.locator('#play').click();await page.screenshot({path:`${root}/comparison-original.png`,fullPage:true});
 await page.locator('#view').click();await page.waitForTimeout(200);await page.screenshot({path:`${root}/comparison-restored.png`,fullPage:true});
 console.log('Open http://127.0.0.1:5173/edge-lab.html');
}finally{await browser.close();}
