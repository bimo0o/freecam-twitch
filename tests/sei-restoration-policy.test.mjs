import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RestorationGate,restorationArea,restorationPercent,viewerAllowsRestoration} from '../shared/sei-restoration-policy.mjs';
import {makeSei,nals,readSei} from '../shared/covert-sei.mjs';
const small={x:0,y:0,width:640,height:360},big={x:0,y:0,width:1716,height:966};
test('large camera suspends encoding before callback and uses hysteresis to resume',()=>{
  const gate=new RestorationGate({maxArea:.25,resumeArea:.20});let calls=0;
  const encode=({forceKeyFrame})=>{calls++;return {bytes:new Uint8Array([1]),keyFrame:forceKeyFrame};};
  assert.equal(gate.process({rect:small,timestamp:0,encode}).paused,false);
  assert.equal(gate.process({rect:big,timestamp:33333,encode}).reason,'area');
  assert.equal(gate.process({rect:{...small,width:960,height:480},timestamp:66667,encode}).reason,'area');
  assert.equal(calls,1);
  let forced=false;
  assert.equal(gate.process({rect:small,timestamp:100000,encode:args=>{forced=args.forceKeyFrame;return encode(args);}}).paused,false);
  assert.equal(forced,true);
});
test('producer has no forced area cutoff or rolling bitrate budget by default',()=>{
  const gate=new RestorationGate();
  for(let i=0;i<3;i++){
    const result=gate.process({rect:big,timestamp:i*33333,encode:args=>{assert.equal(args.maxBytes,undefined);return {bytes:new Uint8Array(200000),keyFrame:true};}});
    assert.equal(result.paused,false);assert.equal(result.bytes.length,200000);
  }
});
test('viewer percentage is validated and applies to the original camera area',()=>{
  assert.equal(restorationPercent(80),80);assert.equal(restorationPercent(100),100);
  for(const value of [0,101,NaN,'80',2.5])assert.equal(restorationPercent(value),25);
  assert.equal(viewerAllowsRestoration(big,25),false);assert.equal(viewerAllowsRestoration(big,80),true);
  assert.equal(viewerAllowsRestoration(small,10),false);assert.equal(viewerAllowsRestoration(small,12),true);
  assert.equal(viewerAllowsRestoration({x:0,y:0,width:1920,height:1080},100),true);
});
test('area validation scales with output resolution and enforces frame boundaries',()=>{
  assert.equal(restorationArea({x:0,y:0,width:1280,height:720},{width:2560,height:1440}),.25);
  assert.throws(()=>restorationArea({...small,x:1900}),/Invalid/);
  const gate=new RestorationGate();gate.process({rect:small,timestamp:0,encode:()=>({bytes:new Uint8Array([1]),keyFrame:true})});
  assert.throws(()=>gate.process({rect:small,timestamp:0,encode(){}}),/increase/);
});
test('pause marker survives SEI wrapping without a video payload',()=>{
  const packets=readSei(nals(makeSei(1,new Uint8Array(),big))[0].bytes);
  assert.equal(packets.length,1);assert.equal(packets[0].bytes.length,0);assert.equal(packets[0].width,1716);
});
