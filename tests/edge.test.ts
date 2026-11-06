import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const scope:any={};runInNewContext(readFileSync('browser-extension/edge-core.js','utf8'),scope);
for(const id of ['full','compact','soft'])test(`edge ${id}: every patch pixel has one border slot, no game or marker overwritten`,()=>{
 const l=scope.FreecamEdgeCore.layout(id),covered=new Uint8Array(l.pw*l.ph),dest=new Set<number>();
 for(const s of l.segments)for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
  const px=s.sx+x,py=s.sy+y,dx=s.dx+x,dy=s.dy+y;
  assert.ok(px>=0&&px<l.pw&&py>=0&&py<l.ph);assert.ok(dx>=0&&dx<1920&&dy>=0&&dy<1080);
  covered[py*l.pw+px]++;const key=dy*1920+dx;assert.ok(!dest.has(key));dest.add(key);
  assert.ok(dx<l.game.x||dx>=l.game.x+l.game.width||dy<l.game.y||dy>=l.game.y+l.game.height);
  assert.ok(dx>=96||dy>=16);
 }
 assert.ok(covered.every(n=>n===1));assert.equal(dest.size,l.pw*l.ph);
 assert.equal(l.game.width/l.game.height,16/9);
});
