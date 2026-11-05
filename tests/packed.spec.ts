import { test, expect } from '@playwright/test';
test('paused seeks refresh both crops without restarting or looping the source',async({page})=>{
  await page.goto('/packed.html?demo=1&sync=1&compose=1');
  const host=page.locator('[data-freecam-packed]');await expect(host).toHaveAttribute('data-state','active');
  await page.locator('video').evaluate((video:HTMLVideoElement)=>video.pause());
  const frames:number[]=[];
  for(const time of [.5,1.2,2.4]){
    await page.locator('video').evaluate((video:HTMLVideoElement,time)=>{video.currentTime=time;},time);
    await expect.poll(async()=>Number(await host.getAttribute('data-media-time'))).toBeCloseTo(time,2);
    await expect(host).toHaveAttribute('data-state','active');
    const sample=await page.evaluate(()=>{
      const video=document.querySelector('video')!,root=document.querySelector('[data-freecam-packed]')!.shadowRoot!;
      const cam=root.querySelector('.cam') as HTMLCanvasElement;
      const source=document.createElement('canvas');source.width=320;source.height=180;
      const context=source.getContext('2d')!;context.drawImage(video,1600,900,320,180,0,0,320,180);
      let original=0,rendered=0;
      for(let bit=0;bit<6;bit++){
        if(context.getImageData(25+bit*22,163,1,1).data[0]>160)original|=1<<bit;
        if(cam.getContext('2d')!.getImageData(25+bit*22,163,1,1).data[0]>160)rendered|=1<<bit;
      }
      return {original,rendered,paused:video.paused};
    });
    expect(sample.paused).toBe(true);expect(sample.rendered).toBe(sample.original);frames.push(sample.rendered);
  }
  expect(new Set(frames).size).toBeGreaterThan(1);
});
test('animated GIF reference and movable camera retain the same frame IDs',async({page})=>{
  await page.goto('/packed.html?demo=1&sync=1&compose=1');
  const host=page.locator('[data-freecam-packed]');await expect(host).toHaveAttribute('data-state','active');
  const samples=await page.evaluate(()=>new Promise<{reference:number,camera:number}[]>(resolve=>{
    const v=document.querySelector('video')!,root=document.querySelector('[data-freecam-packed]')!.shadowRoot!;
    const game=root.querySelector('.game') as HTMLCanvasElement,cam=root.querySelector('.cam') as HTMLCanvasElement;
    const out:{reference:number,camera:number}[]=[];
    function sample(){let a=0,b=0;for(let bit=0;bit<6;bit++){
      const c=cam.getContext('2d')!.getImageData(25+bit*22,163,1,1).data;
      const g=game.getContext('2d')!.getImageData(Math.floor((96+25+bit*22)/1600*game.width),Math.floor((300+163)/900*game.height),1,1).data;
      if((c[0]+c[1]+c[2])/3>160)b|=1<<bit;if((g[0]+g[1]+g[2])/3>160)a|=1<<bit;
    }out.push({reference:a,camera:b});if(out.length===16)resolve(out);else v.requestVideoFrameCallback(sample);}
    v.requestVideoFrameCallback(sample);
  }));
  expect(new Set(samples.map(v=>v.camera)).size).toBeGreaterThan(4);for(const pair of samples)expect(pair.camera).toBe(pair.reference);
  expect(await page.locator('video').count()).toBe(1);
  await page.evaluate(()=>{const label=document.createElement('span');label.dataset.aTarget='video-ad-label';label.id='test-ad';label.textContent='Diagnostic ad marker';document.body.append(label);});
  await expect(host).toHaveAttribute('data-state','waiting');
  await page.evaluate(()=>document.getElementById('test-ad')!.remove());await expect(host).toHaveAttribute('data-state','active');
  await page.screenshot({path:'test-results/packed-sync-proof.png',fullPage:true});
});
test('one encoded video supplies both surfaces, movement persists, missing marker restores original', async ({ browser }) => {
  const a = await browser.newContext({viewport:{width:1280,height:1000}}), b=await browser.newContext({viewport:{width:1280,height:1000}});
  try {
    const page = await a.newPage(); await page.goto('/packed.html?demo=1');
    await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.videoWidth),{timeout:15000}).toBe(1920);
    await page.getByRole('button',{name:'Собрать игру и камеру'}).click();
    const host=page.locator('[data-freecam-packed]');
    await expect(host).toHaveAttribute('data-state','active');
    await expect.poll(async()=>Number(await host.getAttribute('data-frames'))).toBeGreaterThan(5);
    expect(await page.locator('video').count()).toBe(1);
    expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.muted)).toBe(true);
    // The source camera center and rendered camera center are sampled while paused.
    await page.locator('video').evaluate((v:HTMLVideoElement)=>v.pause());
    const pixels=await page.evaluate(()=>{
      const v=document.querySelector('video')!;
      const root=document.querySelector('[data-freecam-packed]')!.shadowRoot!;
      const cam=root.querySelector('.cam') as HTMLCanvasElement;
      const probe=document.createElement('canvas'); probe.width=probe.height=1;
      const ctx=probe.getContext('2d')!; ctx.drawImage(v,1760,990,1,1,0,0,1,1);
      return {source:[...ctx.getImageData(0,0,1,1).data],rendered:[...cam.getContext('2d')!.getImageData(160,90,1,1).data]};
    });
    for(let i=0;i<3;i++) expect(Math.abs(pixels.source[i]-pixels.rendered[i])).toBeLessThan(15);
    const camera=host.locator('.camera'), before=(await camera.boundingBox())!;
    await camera.hover(); const handle=(await host.getByRole('button',{name:'Переместить камеру'}).boundingBox())!;
    await page.mouse.move(handle.x+20,handle.y+12);await page.mouse.down();await page.mouse.move(handle.x-150,handle.y-70,{steps:10});await page.mouse.up();
    expect((await camera.boundingBox())!.x).toBeLessThan(before.x-100);
    await camera.hover();const resize=(await host.getByRole('button',{name:'Изменить размер камеры'}).boundingBox())!;
    await page.mouse.move(resize.x+5,resize.y+5);await page.mouse.down();await page.mouse.move(resize.x+70,resize.y+40,{steps:10});await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('freecam-packed:v1:127.0.0.1:/packed.html') || 'null')?.width || 0)).toBeGreaterThan(.3);
    const saved=(await camera.boundingBox())!;
    await page.getByRole('button',{name:'Исходная компоновка OBS'}).click();await expect(host).toHaveCount(0);
    expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.style.opacity)).toBe('');
    await page.getByRole('button',{name:'Собрать игру и камеру'}).click();await expect(host).toHaveAttribute('data-state','active');
    await expect.poll(async()=>Math.round((await host.locator('.camera').boundingBox())!.width)).toBe(Math.round(saved.width));
    const other=await b.newPage();await other.goto('/packed.html?demo=1');await other.getByRole('button',{name:'Собрать игру и камеру'}).click();
    expect(await other.evaluate(()=>localStorage.getItem('freecam-packed:v1:127.0.0.1:/packed.html'))).toBeNull();
    await page.bringToFront();await host.locator('.camera').hover();await host.getByRole('button',{name:'Скрыть камеру'}).click();await expect(host.locator('.camera')).toBeHidden();
    await host.getByRole('button',{name:'Показать камеру'}).click();await expect(host.locator('.camera')).toBeVisible();
    await page.setViewportSize({width:640,height:900}); const cam=(await host.locator('.camera').boundingBox())!, stage=(await page.locator('.stage').boundingBox())!;
    expect(cam.x+cam.width).toBeLessThanOrEqual(stage.x+stage.width+1);expect(cam.y+cam.height).toBeLessThanOrEqual(stage.y+stage.height+1);
    await page.screenshot({path:'test-results/packed-single-stream.png',fullPage:true});
    await page.locator('video').evaluate((v:HTMLVideoElement)=>{v.src='/.tools/packed-unmarked.mp4';return v.play();});
    await expect(host).toHaveAttribute('data-state','waiting');expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.style.opacity)).toBe('');
    await page.locator('video').evaluate((v:HTMLVideoElement)=>{v.src='/.tools/packed-demo.mp4';return v.play();});await expect(host).toHaveAttribute('data-state','active');
  } finally {await a.close();await b.close();}
});
