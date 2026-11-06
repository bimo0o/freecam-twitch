import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RestorationGate,restorationArea} from '../shared/sei-restoration-policy.mjs';
import {makeSei,nals,readSei} from '../shared/covert-sei.mjs';
const small={x:0,y:0,width:640,height:360},big={x:0,y:0,width:1716,height:966};
test('large camera suspends encoding before callback and uses hysteresis to resume',()=>{
  const gate=new RestorationGate();let calls=0;
  const encode=({forceKeyFrame})=>{calls++;return {bytes:new Uint8Array([1]),keyFrame:forceKeyFrame};};
  assert.equal(gate.process({rect:small,timestamp:0,encode}).paused,false);
  assert.equal(gate.process({rect:big,timestamp:33333,encode}).reason,'area');
  assert.equal(gate.process({rect:{...small,width:960,height:480},timestamp:66667,encode}).reason,'area');
  assert.equal(calls,1);
  let forced=false;
  assert.equal(gate.process({rect:small,timestamp:100000,encode:args=>{forced=args.forceKeyFrame;return encode(args);}}).paused,false);
  assert.equal(forced,true);
});
test('budget is bounded over a rolling second and resumes with an independent frame',()=>{
  const gate=new RestorationGate({maxBitsPerSecond:8000});let calls=0;
  const encode=()=>{calls++;return {bytes:new Uint8Array(500),keyFrame:true};};
  assert.equal(gate.process({rect:small,timestamp:0,encode}).paused,false);
  assert.equal(gate.process({rect:small,timestamp:33333,encode}).reason,'budget');
  assert.equal(calls,1);
  assert.equal(gate.process({rect:small,timestamp:1000001,encode:()=>({bytes:new Uint8Array(1),keyFrame:false})}).reason,'keyframe');
  assert.equal(gate.process({rect:small,timestamp:1033333,encode}).paused,false);
});
test('oversized encoded output is dropped and encoder receives its byte allowance',()=>{
  const gate=new RestorationGate({maxBitsPerSecond:8000});let allowance;
  const out=gate.process({rect:small,timestamp:0,encode:({maxBytes})=>{allowance=maxBytes;return {bytes:new Uint8Array(1000),keyFrame:true};}});
  assert.equal(allowance,744);assert.equal(out.paused,true);assert.equal(out.bytes.length,0);
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
