import {readFile,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const ready=path.resolve('.tools/streamer-app-ready-'+Date.now()+'.txt');
const app=spawn(path.resolve(process.env.FREECAM_APP_OUT||'artifacts/Freecam-Streamer','Freecam Setup.exe'),['--headless',ready],{windowsHide:true,stdio:'ignore'});
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
 const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/setup.spec.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,FREECAM_SETUP_URL:url}});p.on('error',reject);p.on('close',resolve);});
 assert.equal(code,0,'Packaged setup browser test failed');console.log('Packaged EXE: assets, local-only access and OBS wizard verified. Real OBS/Twitch not exercised.');
}finally{app.kill();await unlink(ready).catch(()=>{});}
