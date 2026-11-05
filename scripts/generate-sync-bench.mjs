import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await mkdir('.tools/sync-frames',{recursive:true});
await mkdir('docs/assets',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_BIN||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  await page.setContent('<body style="margin:0"><canvas id="c"></canvas></body>');
  await page.evaluate(()=>{
    const c=document.getElementById('c');c.width=1600;c.height=900;const x=c.getContext('2d');
    x.fillStyle='#101019';x.fillRect(0,0,1600,900);
    for(let i=0;i<1600;i+=50){x.strokeStyle='#242035';x.beginPath();x.moveTo(i,0);x.lineTo(i,900);x.stroke();}
    for(let i=0;i<900;i+=50){x.strokeStyle='#242035';x.beginPath();x.moveTo(0,i);x.lineTo(1600,i);x.stroke();}
    const g=x.createRadialGradient(1100,430,10,1100,430,650);g.addColorStop(0,'#45216c');g.addColorStop(1,'#14111c');x.fillStyle=g;x.fillRect(540,0,1060,900);
    x.fillStyle='#b591ff';x.font='600 23px Segoe UI';x.fillText('FREECAM  /  SINGLE STREAM LAB',96,85);
    x.fillStyle='#f7f4ff';x.font='700 65px Segoe UI';x.fillText('Один кадр. Две области.',96,180);
    x.fillStyle='#a9a1bb';x.font='26px Segoe UI';x.fillText('Сравните счётчики эталона и перемещаемой камеры.',96,230);
    x.fillStyle='#c3abff';x.font='600 19px Segoe UI';x.fillText('ЭТАЛОН · АНИМАЦИЯ ИЗ ТОГО ЖЕ КАДРА',96,279);
    x.strokeStyle='#b591ff';x.lineWidth=2;x.strokeRect(93,297,326,186);
    x.fillStyle='#a9a1bb';x.font='24px Segoe UI';x.fillText('Вспышка + звуковой импульс каждые 2 секунды',96,560);
    x.fillStyle='#d4c3fa';x.font='600 30px Segoe UI';x.fillText('1 видеопоток',96,690);x.fillText('1 декодер',520,690);x.fillText('0 отдельных потоков камеры',850,690);
    x.fillStyle='#777087';x.font='20px Segoe UI';x.fillText('ДИАГНОСТИЧЕСКИЙ СТЕНД • это не запись живого Twitch-эфира',96,810);
  });
  await page.locator('canvas').screenshot({path:'.tools/sync-background.png'});
  await page.evaluate(()=>{const c=document.getElementById('c');c.width=1420;c.height=132;const x=c.getContext('2d');x.fillStyle='#171020';x.fillRect(0,0,1420,132);x.fillStyle='#d8b5ff';x.font='600 34px Segoe UI';x.fillText('Установите Freecam — перемещайте вебку',20,40);x.fillStyle='#c8bdd6';x.font='25px Segoe UI';x.fillText('github.com/bimo0o/freecam-twitch',20,80);x.fillText('Chrome / Edge → значок расширений → Freecam',20,115);});
  await page.locator('canvas').screenshot({path:'.tools/install-hint.png'});
  for(let i=0;i<60;i++) {
    await page.evaluate(frame=>{
      const c=document.getElementById('c');c.width=320;c.height=180;const x=c.getContext('2d');
      x.fillStyle=frame<2?'#f7efff':'#20152f';x.fillRect(0,0,320,180);
      x.strokeStyle=frame<2?'#8b5cf6':'#634d83';x.lineWidth=2;x.strokeRect(1,1,318,178);
      x.fillStyle=frame<2?'#28163f':'#d5bdff';x.font='600 12px Segoe UI';x.fillText('FREECAM / SYNC SIGNAL',16,25);
      x.font='700 29px Consolas';x.fillText('FRAME '+String(frame).padStart(3,'0'),16,66);
      x.fillStyle=frame<2?'#a463ff':'#66ecd4';x.beginPath();x.arc(30+260*(1-Math.abs(frame/30-1)),112,14,0,Math.PI*2);x.fill();
      x.fillStyle='#50405e';x.fillRect(16,142,288,3);x.fillStyle='#bb8bff';x.fillRect(16,142,288*frame/59,3);
      for(let bit=0;bit<6;bit++){x.fillStyle=(frame>>bit)&1?'#ffffff':'#160d20';x.fillRect(16+bit*22,154,18,18);}
      x.fillStyle=frame<2?'#28163f':'#c9b1e8';x.font='12px Consolas';x.fillText((frame/30).toFixed(2)+' s',226,169);
    },i);
    await page.locator('canvas').screenshot({path:`.tools/sync-frames/${String(i).padStart(3,'0')}.png`});
  }
} finally {await browser.close();}
function job(args){return new Promise((resolve,reject)=>{const p=spawn(process.env.FFMPEG_BIN||'ffmpeg',args,{stdio:'inherit'});p.on('error',reject);p.on('close',code=>code?reject(Error(`FFmpeg exit ${code}`)):resolve());});}
await job(['-hide_banner','-loglevel','error','-y','-framerate','30','-i','.tools/sync-frames/%03d.png','-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0','docs/assets/sync-camera.gif']);
console.log('Sync GIF and background generated.');
