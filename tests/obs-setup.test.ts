import {test} from 'node:test';import assert from 'node:assert/strict';import {prepareObs} from '../src/obs-setup.js';
const hint={hintFile:'D:/Freecam/obs-hint.html'};
const transform=(x=0,y=0,w=1280,h=720)=>({positionX:x,positionY:y,rotation:0,scaleX:1,scaleY:1,boundsType:'OBS_BOUNDS_NONE',boundsWidth:0,boundsHeight:0,sourceWidth:w,sourceHeight:h,cropLeft:0,cropTop:0,cropRight:0,cropBottom:0,alignment:5});
function fixture(active=false,fail=false){
 const settings=new Map<string,any>();const calls:{type:string,data:any}[]=[];let id=20,video:any={baseWidth:1280,baseHeight:720,outputWidth:1280,outputHeight:720};
 const item=(sourceName:string,n:number,t=transform(),extra:any={})=>({sourceName,sceneItemId:n,sceneItemIndex:n-1,sceneItemEnabled:true,sceneItemLocked:false,sceneItemTransform:t,...extra});
 const scenes=new Map<string,any[]>([['Original',[item('Game',1),item('Chat',2,transform(900,50,300,600),{sceneItemLocked:true}),item('Camera group',3,transform(960,500,320,180),{isGroup:true})]],['Camera group',[item('Cam',4,{...transform(0,0,320,180),cropLeft:12}),item('Frame',5,transform(0,0,320,180))]]]);
 const api={request:async(type:string,data:any={})=>{calls.push({type,data:structuredClone(data)});switch(type){
 case'GetStreamStatus':return{outputActive:active};case'GetRecordStatus':return{outputActive:false};
 case'GetInputList':return{inputs:['Game','Cam','Chat','Frame'].map(inputName=>({inputName}))};
 case'GetInputKindList':return{inputKinds:['color_source_v3','browser_source']};
 case'GetVideoSettings':return{...video};case'GetCurrentProgramScene':return{currentProgramSceneName:'Original'};
 case'GetSceneList':return{scenes:[{sceneName:'Original'}]};case'SetVideoSettings':video={...video,...data};return{};
 case'GetSceneItemList':case'GetGroupSceneItemList':return{sceneItems:structuredClone(scenes.get(data.sceneName)||[])};
 case'GetSourceFilterList':return{filters:data.sourceName==='Original'?[{filterName:'Tone',filterKind:'color_filter',filterIndex:0,filterEnabled:true,filterSettings:{gamma:.1}}]:[]};
 case'GetSceneItemBlendMode':return{sceneItemBlendMode:'OBS_BLEND_NORMAL'};
 case'CreateScene':scenes.set(data.sceneName,[]);return{};
 case'GetInputSettings':return{inputSettings:settings.get(data.inputName)};
 case'CreateSceneItem':case'CreateInput':{if(type==='CreateInput')settings.set(data.inputName,data.inputSettings);const list=scenes.get(data.sceneName)!;const n=++id;list.push(item(data.sourceName||data.inputName,n));return{sceneItemId:n};}
 case'SetSceneItemTransform':{if(fail)throw Error('transform failed');const found=scenes.get(data.sceneName)!.find(v=>v.sceneItemId===data.sceneItemId);found.sceneItemTransform={...found.sceneItemTransform,...data.sceneItemTransform};return{};}
 case'GetSceneItemTransform':return{sceneItemTransform:scenes.get(data.sceneName)!.find(v=>v.sceneItemId===data.sceneItemId).sceneItemTransform};
 default:return{};}}};return{api,calls,scenes};
}
const prepare=(f:ReturnType<typeof fixture>,sceneName?:string)=>prepareObs(f.api,'Game','Cam',{...hint,sceneName});
test('OBS setup packs game and camera with an animated local hint; leaves canvas dimensions unchanged',async()=>{const f=fixture();await prepare(f);assert.equal(f.calls.filter(v=>v.type==='CreateSceneItem').length,2);const banner=f.calls.find(v=>v.type==='CreateInput'&&v.data.inputKind==='browser_source')!;assert.equal(banner.data.inputSettings.local_file,hint.hintFile);assert.equal(banner.data.inputSettings.width,1420);assert.equal(f.calls.find(v=>v.type==='SetVideoSettings')!.data.baseWidth,undefined);assert.ok(!f.calls.some(v=>v.type==='StartStream'||v.type==='StartRecord'));});
test('scene copy nests the entire composition inside the game region and isolates camera groups',async()=>{
 const f=fixture();const original=structuredClone([...f.scenes]);await prepare(f,'Original');
 const output=f.scenes.get('Freecam')!,composite=output.find(v=>v.sourceName?.includes('Original'))!;
 const t=composite.sceneItemTransform;assert.equal(t.positionX,0);assert.equal(t.positionY,0);assert.ok(Math.abs(t.boundsWidth-1280*5/6)<.001);assert.equal(t.boundsHeight,600);
 const copy=f.scenes.get(composite.sourceName)!;assert.deepEqual(copy.map(v=>v.sourceName).slice(0,2),['Game','Chat']);assert.deepEqual(copy[1].sceneItemTransform,original[0][1][1].sceneItemTransform);
 const groupCopy=f.scenes.get(copy[2].sourceName)!;assert.deepEqual(groupCopy.map(v=>v.sourceName),['Frame']);assert.equal(copy[2].sceneItemTransform.cropRight,1280-320);
 assert.equal(output.find(v=>v.sourceName==='Cam').sceneItemTransform.cropLeft,12);
 assert.deepEqual(f.scenes.get('Original'),original[0][1]);assert.deepEqual(f.scenes.get('Camera group'),original[1][1]);
 assert.ok(f.calls.some(v=>v.type==='CreateSourceFilter'&&v.data.filterName==='Tone'));
 assert.ok(f.calls.some(v=>v.type==='SetSceneItemLocked'&&v.data.sceneItemLocked===true));
 assert.ok(!f.calls.some(v=>/^(SetSceneItem|RemoveSceneItem)/.test(v.type)&&['Original','Camera group'].includes(v.data.sceneName)));
});
test('OBS setup refuses to mutate a live broadcast',async()=>{const f=fixture(true);await assert.rejects(prepare(f));assert.ok(!f.calls.some(v=>v.type==='CreateScene'||v.type==='SetVideoSettings'));});
test('OBS setup rolls back its own scene and resolution without deleting original sources',async()=>{const f=fixture(false,true);await assert.rejects(prepare(f));assert.ok(f.calls.some(v=>v.type==='RemoveScene'));assert.ok(f.calls.filter(v=>v.type==='RemoveInput').every(v=>!['Game','Cam','Chat','Frame'].includes(v.data.inputName)));assert.equal(f.calls.filter(v=>v.type==='SetVideoSettings').at(-1)?.data.outputWidth,1280);});
test('failed scene copy removes every temporary scene and restores the previous output',async()=>{const f=fixture();const originalRequest=f.api.request;f.api.request=async(type,data={})=>{if(type==='CreateSourceFilter')throw Error('Filter failed');return originalRequest(type,data);};await assert.rejects(prepare(f,'Original'));const made=f.calls.filter(v=>v.type==='CreateScene').map(v=>v.data.sceneName);const removed=f.calls.filter(v=>v.type==='RemoveScene').map(v=>v.data.sceneName);assert.deepEqual(new Set(removed),new Set(made));assert.ok(!removed.includes('Original'));assert.equal(f.calls.filter(v=>v.type==='SetVideoSettings').at(-1)?.data.outputWidth,1280);});
