import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../src/extension-sei/tap.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
function fixture(){
  const messages=[];let feeds=0,appends=0,lastPayload;
  class SourceBuffer {appendBuffer(bytes){appends++;assert.ok(bytes.byteLength);if(this.reject)throw Error('Native rejection');}}
  class MediaSource {addSourceBuffer(){return new SourceBuffer();}}
  class FragmentReader {constructor(onPacket){this.onPacket=onPacket;}feed(){feeds++;lastPayload=new Uint8Array([1,2,3]);this.onPacket({bytes:lastPayload,presentationTime:0});}}
  const context={installWorkerBridge:()=>{},SourceBuffer,MediaSource,FragmentReader,ArrayBuffer,Uint8Array,location:{origin:'https://www.twitch.tv'},URL:{createObjectURL:()=> 'blob:fixture'},window:{postMessage(message,_origin,transfer){messages.push(structuredClone(message,{transfer}));}},setInterval(){}};
  vm.runInNewContext(source,context);
  const media=new MediaSource();context.URL.createObjectURL(media);
  return {media,messages,stats:()=>({feeds,appends,detached:lastPayload?.byteLength})};
}
test('SEI tap transfers its own payload and leaves the native video buffer intact',()=>{
  const f=fixture(),input=new Uint8Array([9,8,7]);f.media.addSourceBuffer('video/mp4').appendBuffer(input);
  assert.deepEqual(f.stats(),{feeds:1,appends:1,detached:0});
  assert.deepEqual([...input],[9,8,7]);assert.deepEqual([...f.messages.find(m=>m.type==='packet').packet.bytes],[1,2,3]);
  assert.equal(f.messages.find(m=>m.type==='packet').packet.mediaUrl,'blob:fixture');
});
test('audio buffers bypass SEI parsing and preserve native append errors',()=>{
  const f=fixture(),audio=f.media.addSourceBuffer('audio/mp4');audio.appendBuffer(new Uint8Array([1]));
  audio.reject=true;assert.throws(()=>audio.appendBuffer(new Uint8Array([1])),/Native rejection/);
  assert.equal(f.stats().feeds,0);assert.equal(f.stats().appends,2);assert.equal(f.messages.filter(m=>m.type==='packet').length,0);
});

test('tap heartbeat confirms injection independently from player buffer activity',()=>{const f=fixture();const status=f.messages.find(m=>m.type==='status').stats;assert.equal(status.ready,true);assert.equal(status.hookIntact,true);assert.equal(status.appends,0);});

test('tap parses accepted non-audio MIME types and ignores leading whitespace',()=>{for(const type of [' video/mp4; codecs="avc1.640028"','application/mp4','video/mp4']){const f=fixture();f.media.addSourceBuffer(type).appendBuffer(new Uint8Array([1]));assert.equal(f.stats().feeds,1);}});
