import {test} from 'node:test';import assert from 'node:assert/strict';
import {repairHints,checkHintSettings} from '../src/obs-hint';
test('repair replaces only generated Freecam hint paths, preserves scenes and verifies persisted settings',async()=>{
 const own='Freecam · 091f2db1 Подсказка',other='Donation widget';const calls:any[]=[];let settings:any={is_local_file:true,local_file:'C:/Temp/Rar$EX/obs-hint.html'};
 const obs={request:async(type:string,data:any={})=>{calls.push({type,data});if(type==='GetInputList')return{inputs:[{inputName:own,inputKind:'browser_source'},{inputName:other,inputKind:'browser_source'},{inputName:'Freecam custom Подсказка',inputKind:'browser_source'}]};if(type==='SetInputSettings'){assert.equal(data.inputName,own);settings={...settings,...data.inputSettings};}if(type==='GetInputSettings')return{inputSettings:settings};return{};}};
 const count=await repairHints(obs,{hintFile:'C:/LocalAppData/Freecam/assets/hash/obs-hint.html'});assert.equal(count,1);
 assert.ok(calls.filter(v=>v.type==='SetInputSettings').every(v=>v.data.inputName===own));assert.ok(!calls.some(v=>/Scene|VideoSettings|RemoveInput/.test(v.type)));
 assert.equal(settings.local_file,'C:/LocalAppData/Freecam/assets/hash/obs-hint.html');
});
test('failed readback rejects setup rather than claiming the hint is configured',async()=>{
 const obs={request:async()=>({inputSettings:{width:1420,height:132,is_local_file:true,local_file:'C:/Temp/wrong.html'}})};
 await assert.rejects(checkHintSettings(obs,'hint',{hintFile:'C:/Freecam/obs-hint.html'}));
});
