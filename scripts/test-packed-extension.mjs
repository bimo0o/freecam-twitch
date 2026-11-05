import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
const fixture=path.resolve('.tools/extension-proof'),profile=path.resolve('.tools/extension-proof-profile');await mkdir(fixture,{recursive:true});
for(const file of ['core.js','runtime.js','autostart.js','popup.html','popup.js'])await copyFile(path.join('browser-extension',file),path.join(fixture,file));
const manifest=JSON.parse(await readFile('browser-extension/manifest.json','utf8'));
// Only the test fixture receives localhost host access and a worker for automation.
manifest.host_permissions=['http://127.0.0.1/*'];manifest.background={service_worker:'proof.js'};
manifest.content_scripts=[{matches:['http://127.0.0.1/*'],js:['core.js','runtime.js','autostart.js'],run_at:'document_idle'}];
await writeFile(path.join(fixture,'manifest.json'),JSON.stringify(manifest));await writeFile(path.join(fixture,'proof.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
try {
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/packed.html?demo=1');
  await page.waitForFunction(()=>document.querySelector('video')?.videoWidth===1920);
  await page.waitForFunction(()=>document.querySelector('[data-freecam-packed]')?.dataset.state==='active');
  const report=await worker.evaluate(async()=>{
    const tab=(await chrome.tabs.query({})).find(t=>t.url?.includes('/packed.html'));
    const result=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.FreecamPackedController.report()}))[0].result;
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.FreecamPackedAuto.disable(true)});return result;
  });
  await page.waitForFunction(()=>!document.querySelector('[data-freecam-packed]'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('video')?.videoWidth===1920);
  const disabled=await worker.evaluate(async()=>Boolean((await chrome.storage.local.get('freecam-disabled:/packed.html'))['freecam-disabled:/packed.html']));
  if(!disabled||await page.locator('[data-freecam-packed]').count())throw Error('Disabled channel preference not respected');
  await worker.evaluate(async()=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.includes('/packed.html'));await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.FreecamPackedAuto.disable(false)});});
  await page.waitForFunction(()=>document.querySelector('[data-freecam-packed]')?.dataset.state==='active');
  console.log(JSON.stringify({extensionLoaded:true,automaticActivation:report.active,frames:report.frames,originalRestored:true,disablePersists:true,testOnlyLocalhostPermission:true}));
}finally{await context.close();}
