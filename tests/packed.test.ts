import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const context: any = {};
runInNewContext(readFileSync('browser-extension/core.js', 'utf8'), context);
const core = context.FreecamPackedCore;
test('packed layout regions do not overlap and stay inside one frame', () => {
  const { game, camera, marker, width, height } = core.layout;
  for (const r of [game, camera, marker]) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height);
  for (const [a, b] of [[game,camera],[game,marker],[camera,marker]]) assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
});
test('packed camera remains bounded and proportional across viewport and source quality changes', () => {
  for (const w of [320,640,1920]) for (const h of [180,500,1080]) for (const x of [0,.5,1]) for (const y of [0,.5,1]) {
    const r = core.rect(core.placement({x,y,width:.65}),w,h);
    assert.ok(r.left+r.width<=w+.001 && r.top+r.height<=h+.001);
    assert.ok(Math.abs(r.width/r.height-16/9)<.001);
  }
  assert.equal(core.crop(core.layout.camera,960,540)[0],800);
  assert.equal(core.quality(1280,720).cameraWidth,213);
  assert.equal(core.quality(1920,1080).cameraWidth,320);
  assert.equal(core.placement({x:NaN,width:Infinity}).width,.28);
});
test('marker accepts codec variation but rejects ordinary or missing content', () => {
  const pixels = new Uint8ClampedArray(8*8*4);
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) { const color = y<4 ? (x<4?[0,255,0]:[255,0,255]) : (x<4?[0,255,255]:[255,255,255]); pixels.set([...color,255],(y*8+x)*4); }
  assert.ok(core.markerMatches(pixels));
  pixels[0]=30; assert.ok(core.markerMatches(pixels));
  pixels.fill(0); assert.equal(core.markerMatches(pixels),false);
});
