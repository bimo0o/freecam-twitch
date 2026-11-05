import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
await mkdir('.tools/hero-frames',{recursive:true});await mkdir('docs/assets',{recursive:true});
const fps=12, duration=8, frameCount=fps*duration, timeline=[];
const browser=await chromium.launch({executablePath:process.env.BROWSER_BIN||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:5173/packed.html?demo=1&presentation=1&compose=1');
 await page.waitForFunction(()=>document.querySelector('[data-freecam-packed]')?.dataset.state==='active');
 await page.evaluate(()=>{const video=document.getElementById('source');video.pause();video.loop=false;video.controls=false;});
 const sourceDuration=await page.locator('#source').evaluate(video=>video.duration);
 if(sourceDuration<duration)throw Error(`Presentation needs ${duration}s of continuous footage; source has ${sourceDuration}s.`);
 await page.evaluate(()=>{
  const stage=document.getElementById('stage');document.body.replaceChildren();
  const style=document.createElement('style');style.textContent=`*{box-sizing:border-box}body{width:1000px;height:800px;margin:0;padding:32px 40px;color:#f5f0ff;font:16px 'Segoe UI',sans-serif;background:radial-gradient(ellipse at 90% 10%,#442066,transparent 55%),#100c17}header{display:flex;align-items:center;justify-content:space-between;color:#ddc7ff;font-size:15px;letter-spacing:3px}.brand{font-weight:800;font-size:24px;letter-spacing:-.4px}.brand i{font-style:normal;color:#bd8dff}.pill{font-size:11px;letter-spacing:1.6px;background:#a970ff25;border:1px solid #bd8dff50;border-radius:20px;padding:8px 12px}h1{font-size:44px;letter-spacing:-1.6px;line-height:1.15;margin:23px 0 8px}h1 span{color:#c79aff}.subtitle{color:#bfb0d2;margin:0 0 22px;font-size:17px}.stage{position:relative;width:920px;height:517.5px;background:#07050b;border:1px solid #b78aea65;border-radius:14px;overflow:hidden;box-shadow:0 18px 70px #0007}.stage video{width:100%;height:100%;display:block;object-fit:contain}.footer{display:flex;align-items:center;justify-content:space-between;margin-top:18px;color:#d6c3eb;font-size:14px}.note{color:#8e7ca2;font-size:11px}.cursor{position:fixed;z-index:999;pointer-events:none;width:15px;height:15px;border:2px solid white;background:#a970ff;border-radius:50%;box-shadow:0 0 0 5px #a970ff40}.cursor.down{background:white;box-shadow:0 0 0 8px #a970ff66}`;
  document.head.append(style);const header=document.createElement('header');header.innerHTML='<div class="brand"><i>◈</i> freecam</div><div class="pill">ОДИН ПОТОК · ЛИЧНОЕ УПРАВЛЕНИЕ</div>';
  const title=document.createElement('h1');title.innerHTML='Твоя камера. <span>Твоё место.</span>';
  const subtitle=document.createElement('p');subtitle.className='subtitle';subtitle.textContent='Перемещай вебку туда, куда хочешь';
  const footer=document.createElement('div');footer.className='footer';footer.innerHTML='<span id="caption">Перетащи камеру туда, где она не мешает.</span>';
  document.body.append(header,title,subtitle,stage,footer);const cursor=document.createElement('div');cursor.className='cursor';document.body.append(cursor);
  document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});document.addEventListener('mousedown',()=>cursor.classList.add('down'));document.addEventListener('mouseup',()=>cursor.classList.remove('down'));
 });
 const host=page.locator('[data-freecam-packed]');await host.locator('.camera').hover();
 let from,to;
 for(let frame=0;frame<frameCount;frame++){
  if(frame===5||frame===31){const h=await host.getByRole('button',{name:'Переместить камеру',exact:true}).boundingBox();from={x:h.x+25,y:h.y+12};to=frame===5?{x:from.x-90,y:from.y-240}:{x:105,y:640};await page.mouse.move(from.x,from.y);await page.mouse.down();}
  if(frame>=5&&frame<=24){const t=(frame-5)/19,s=t*t*(3-2*t);await page.mouse.move(from.x+(to.x-from.x)*s,from.y+(to.y-from.y)*s);}
  if(frame===24||frame===50)await page.mouse.up();
  if(frame>=31&&frame<=50){const t=(frame-31)/19,s=t*t*(3-2*t);await page.mouse.move(from.x+(to.x-from.x)*s,from.y+(to.y-from.y)*s);}
  if(frame===53){await host.locator('.camera').hover();const h=await host.getByRole('button',{name:'Изменить размер камеры'}).boundingBox();from={x:h.x+6,y:h.y+6};to={x:from.x+115,y:from.y+55};await page.mouse.move(from.x,from.y);await page.mouse.down();await page.locator('#caption').evaluate(el=>el.textContent='Меняй размер. Твои настройки остаются у тебя.');}
  if(frame>=53&&frame<=69){const t=(frame-53)/16;await page.mouse.move(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t);}
  if(frame===69)await page.mouse.up();
  if(frame===73){await page.mouse.move(940,760);await page.locator('#caption').evaluate(el=>el.textContent='Игра и камера — из одного кадра. Без второй видеодоставки.');}
  // Drive the paused source by the GIF timeline, not by screenshot wall-clock time.
  // Both crops are still rendered by the actual runtime from one decoded frame.
  const time=(frame+.5)/fps;
  await page.locator('#source').evaluate((video,time)=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Video seek timed out')),5000);
   video.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});
   video.currentTime=time;
  }),time);
  await page.waitForFunction(time=>{
   const host=document.querySelector('[data-freecam-packed]');
   return host?.dataset.state==='active'&&Math.abs(Number(host.dataset.mediaTime)-time)<1/30+.005;
  },time,{timeout:5000}).catch(async error=>{throw Error(`Frame ${frame}, target ${time}: ${JSON.stringify(await host.evaluate(el=>({...el.dataset})))}; ${error.message}`);});
  const renderedTime=await host.getAttribute('data-media-time');
  timeline.push({frame,time,renderedTime:Number(renderedTime)});
  await page.screenshot({path:`.tools/hero-frames/${String(frame).padStart(3,'0')}.png`});
 }
}finally{await browser.close();}
await writeFile('.tools/hero-timeline.json',JSON.stringify({fps,duration,frames:timeline},null,2));
await new Promise((resolve,reject)=>{const p=spawn(process.env.FFMPEG_BIN||'ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i','.tools/hero-frames/%03d.png','-filter_complex','[0:v]scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle','-frames:v',String(frameCount),'-loop','0','docs/assets/freecam-preview.gif'],{stdio:'inherit'});p.on('error',reject);p.on('close',c=>c?reject(Error(`FFmpeg ${c}`)):resolve());});
console.log('README presentation generated from the working single-stream renderer.');
