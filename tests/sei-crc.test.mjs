import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crc32} from '../shared/covert-primitives.mjs';
const reference=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
test('table CRC remains wire-compatible for empty, offset and large payloads',()=>{
  let seed=42;const bytes=Uint8Array.from({length:1024*1024},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;});
  for(const length of [0,1,17,255,4096,65536,bytes.length-3]){const view=bytes.subarray(3,3+length);assert.equal(crc32(view),reference(view));}
});
