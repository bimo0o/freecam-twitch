import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { defaults } from '../shared/model';
test('real HLS frames, viewer isolation, drag, resize, persistence, hide and reconnect', async ({ browser, request }) => {
  const channel = process.env.LOCAL_CHANNEL_ID || '1';
  const api = 'http://127.0.0.1:3000';
  const headers = { 'X-Local-Admin': process.env.LOCAL_ADMIN_SECRET! };
  const original = await (await request.get(`${api}/api/channels/${channel}`)).json();
  const enabled = { ...defaults, enabled: true, delay: 3 };
  expect((await request.put(`${api}/api/admin/${channel}`, { headers, data: enabled })).ok()).toBeTruthy();
  const a = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const b = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  try {
    const page = await a.newPage(), second = await b.newPage();
    page.on('pageerror',e=>console.log('Page error:',e.message));
    page.on('response',r=>{if(r.url().includes('/media/')&&r.status()>=400) console.log('Media response:',r.status(),new URL(r.url()).pathname);});
    await page.goto(`/?channel=${channel}`); await second.goto(`/?channel=${channel}`);
    await page.bringToFront();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 45000 }).toBe(1280);
    const firstTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15000 }).toBeGreaterThan(firstTime + .5);
    const camera = page.locator('.camera'), before = (await camera.boundingBox())!;
    await camera.hover(); const drag = page.getByRole('button', { name: 'Переместить камеру', exact: true });
    const box = (await drag.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x - 200, box.y - 100, { steps: 12 }); await page.mouse.up();
    const moved = (await camera.boundingBox())!;
    expect(moved.x).toBeLessThan(before.x - 100);
    await camera.hover(); const handle = (await page.getByRole('button', { name: 'Изменить размер камеры' }).boundingBox())!;
    await page.mouse.move(handle.x+5, handle.y+5); await page.mouse.down(); await page.mouse.move(handle.x+85, handle.y+45,{steps:10}); await page.mouse.up();
    const resized = (await camera.boundingBox())!; expect(resized.width).toBeGreaterThan(moved.width+50);
    const storageKey = `freecam:v1:${channel}`;
    await expect.poll(() => page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).width,storageKey)).toBeGreaterThan(.28);
    const saved = await page.evaluate(key=>localStorage.getItem(key),storageKey);
    const other = await second.evaluate(key=>JSON.parse(localStorage.getItem(key)!),storageKey);
    expect(other.width).toBe(.25); expect(other.x).toBe(.96);
    await page.reload(); await expect(camera).toBeVisible();
    expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBe(saved);
    await camera.hover(); await page.getByRole('button',{name:'Скрыть камеру'}).click(); await expect(video).toHaveCount(0);
    await page.getByRole('button',{name:/Показать камеру/}).click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement)=>v.videoWidth),{timeout:30000}).toBe(1280);
    await page.setViewportSize({width:640,height:900});
    const final = (await camera.boundingBox())!, stage = (await page.locator('.stage').boundingBox())!;
    expect(final.x+final.width).toBeLessThanOrEqual(stage.x+stage.width+1);
    expect(final.y+final.height).toBeLessThanOrEqual(stage.y+stage.height+1);
    await page.screenshot({path:'test-results/freecam-verified.png',fullPage:true});
    // Force an HLS connection failure, restore the origin, and let the SAME video instance retry.
    await page.route('**/media/**', route=>route.abort());
    await camera.hover(); await page.getByRole('button',{name:'Скрыть камеру'}).click();
    await page.getByRole('button',{name:/Показать камеру/}).click();
    await expect(page.getByRole('status').filter({hasText:'повторное подключение'})).toBeVisible({timeout:45000});
    await page.unroute('**/media/**');
    await expect.poll(()=>page.locator('video').evaluate((v: HTMLVideoElement)=>v.videoWidth),{timeout:30000}).toBe(1280);
  } finally {
    await a.close(); await b.close();
    await request.put(`${api}/api/admin/${channel}`,{headers,data:original});
  }
});
