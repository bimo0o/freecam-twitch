import {ObsClient} from '../src/obs-client.ts';
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
const config=JSON.parse(await readFile('.tools/native-ws-test.json','utf8'));
for(let attempt=0;;attempt++){const probe=new ObsClient();try{await probe.connect(config.password,config.port);probe.close();break;}catch(error){probe.close();if(attempt===49)throw error;await new Promise(resolve=>setTimeout(resolve,200));}}
const address=path.resolve('.tools/native-setup-address.json');
await writeFile(address,'');
const host=spawn(path.resolve('artifacts/Freecam-OBS-0.5.0/Freecam Native Setup.exe'),['--headless',address],{windowsHide:true,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 let url;for(let i=0;i<100;i++){try{url=(await readFile(address,'utf8')).trim();if(url)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}if(!url){let error='';try{error=await readFile(address+'.error.txt','utf8');}catch{}throw Error('Native host did not start: '+host.exitCode+' '+error);}
 const page=await browser.newPage();await page.goto(url);await page.locator('#password').fill(config.password);await page.locator('#port').fill(String(config.port));await page.click('#connect');
 await page.waitForFunction(()=>!document.getElementById('prepare').disabled,{timeout:20000});
 const cameras=await page.locator('#camera option').allTextContents();const camera=cameras.find(name=>name.includes('FreecamSelftestCamera'));assert.ok(camera);await page.selectOption('#camera',{label:camera});const control=new ObsClient();await control.connect(config.password,config.port);const original=await control.request('GetSceneItemList',{sceneName:await page.locator('#scene').inputValue()});await page.click('#prepare');
 await page.waitForFunction(()=>document.getElementById('status').dataset.ready==='true',{timeout:10000});assert.equal(await page.locator('#password').inputValue(),'');
 const panel=await page.locator('#panel').getAttribute('href');assert.ok(panel.startsWith('http://127.0.0.1:'));const before=await(await fetch(panel+'status')).json();assert.equal(before.prepared,true);
 await control.request('StartRecord');await page.waitForTimeout(4000);const live=await(await fetch(panel+'status')).json();assert.ok(live.totalMbps>0&&live.freecamMbps>0&&live.paired>0);assert.equal(live.streamMbps,0);assert.ok(live.recordMbps>0);await control.request('StopRecord');for(let i=0;i<100;i++){if(!(await control.request('GetRecordStatus')).outputActive)break;await page.waitForTimeout(100);}const after=await control.request('GetSceneItemList',{sceneName:await page.locator('#scene').inputValue()});assert.deepEqual(original.sceneItems,after.sceneItems);control.close();
 await page.screenshot({path:'artifacts/Freecam-OBS-0.5.0/setup-proof.png',fullPage:true});
 await page.click('#stop');await page.waitForFunction(()=>document.getElementById('status').dataset.ready==='false',{timeout:10000});
 const stopped=await(await fetch(panel+'status')).json();assert.equal(stopped.prepared,false);
 await writeFile('artifacts/Freecam-OBS-0.5.0/setup-report.json',JSON.stringify({realObsWebSocket:true,embeddedDesktopHost:true,prepared:true,stopped:true,originalScenePreserved:true,passwordCleared:true,localRecording:true,liveTelemetry:live},null,2));console.log('Native desktop setup and authenticated OBS commands passed.');
}finally{await browser.close();host.kill();}
