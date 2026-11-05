import {readFile,unlink,mkdir,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const ready=path.resolve('.tools/streamer-app-ready-'+Date.now()+'.txt');
// Run only the EXE from an archive-like path, without any adjacent HTML or brand folder.
const archive=path.resolve('.tools/Rar$EX test кириллица '+Date.now());await mkdir(archive,{recursive:true});
const executable=path.join(archive,'Freecam Setup.exe');await copyFile(path.resolve(process.env.FREECAM_APP_OUT||'artifacts/Freecam-Streamer','Freecam Setup.exe'),executable);
const app=spawn(executable,['--headless',ready],{windowsHide:true,stdio:'ignore'});
let persistentFile;
let startError;app.on('error',e=>{startError=e;});
try{
 let url;
 for(let i=0;i<80;i++){if(startError)throw startError;if(app.exitCode!==null)throw Error('App exited: '+app.exitCode);try{url=await readFile(ready,'utf8');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(url,'App readiness timed out');
 const response=await fetch(url);assert.equal(response.status,200);const html=await response.text();
 assert.ok(html.includes('Подготовка OBS'));assert.ok(!html.includes('/packed.html'));assert.ok(response.headers.get('content-security-policy').includes('ws://127.0.0.1:*'));
 for(const m of html.matchAll(/(?:src|href)="\.\/([^"?#]+\.(?:js|css))"/g)){
  const asset=await fetch(new URL(m[1],url));assert.equal(asset.status,200);assert.ok((await asset.text()).length>100);
 }
 assert.equal((await fetch(new URL('/not-a-file',url))).status,404);
 assert.equal((await fetch(url,{headers:{Origin:'https://example.com'}})).status,403);
 const runtime=await (await fetch(new URL('/runtime.json',url))).json();
 assert.equal(runtime.hintReady,true);persistentFile=runtime.obsHintPath;
 assert.ok(persistentFile.startsWith(path.resolve('.tools/app-assets')+path.sep));assert.ok(!persistentFile.startsWith(archive));
 const hint=await readFile(persistentFile,'utf8');
 assert.equal(createHash('sha256').update(hint).digest('hex'),runtime.hintSha256);
 assert.ok(hint.includes('data:font/ttf;base64,'));assert.ok(hint.includes('data:image/png;base64,'));
 assert.ok(!hint.includes('href="brand/'));assert.ok(!hint.includes('src="brand/'));
 await unlink(persistentFile);await fetch(new URL('/runtime.json',url));assert.equal(await readFile(persistentFile,'utf8'),hint);
 const browser=await chromium.launch({executablePath:process.env.BROWSER_BIN||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{const page=await browser.newPage({viewport:{width:1420,height:132}});await page.goto(pathToFileURL(persistentFile).href);await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.locator('.brand img').evaluate(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.locator('.panel').evaluate(el=>Math.round(el.getBoundingClientRect().height)),132);
  await page.screenshot({path:'test-results/persistent-hint.png',omitBackground:true});
 }finally{await browser.close();}
 const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/setup.spec.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,FREECAM_SETUP_URL:url}});p.on('error',reject);p.on('close',resolve);});
 assert.equal(code,0,'Packaged setup browser test failed');console.log('Packaged EXE: archive-only launch, self-contained persistent hint, hash, asset recovery, local rendering and OBS wizard verified. Real OBS/Twitch not exercised.');
}finally{app.kill();await unlink(ready).catch(()=>{});}
assert.ok((await readFile(persistentFile,'utf8')).includes('freecam'),'Hint must survive app exit');
