// Experimental E1: visual transport. Every piece belongs to the same video frame.
(() => {
  const W=1920,H=1080;
  const profiles={full:{id:'full',mx:64,my:36,scale:1,color:[0,255,0]},compact:{id:'compact',mx:32,my:18,scale:.5,color:[255,255,0]},soft:{id:'soft',mx:32,my:18,scale:.5,gain:.35,color:[0,128,255]}};
  const colors=[[144,64,224],[0,255,255],[255,255,255],[0,0,0],[255,0,0]];
  const layouts=new Map(),scratch=new Map();let marker;
  function layout(id='full') {
    if(layouts.has(id))return layouts.get(id);
    const p=profiles[id]; if(!p)throw Error('Unknown edge profile');
    const game={x:p.mx,y:p.my,width:W-2*p.mx,height:H-2*p.my};
    const camera={x:game.width-680,y:game.height-400,width:640,height:360};
    // 16-high runs retain local image structure after downscaling, unlike 4px strips.
    const tile=16,pw=camera.width*p.scale,dataHeight=camera.height*p.scale,ph=Math.ceil(dataHeight/tile)*tile;
    const slabs=[{x:0,y:H-p.my,w:W,h:Math.floor(p.my/tile)*tile},{x:96,y:0,w:W-96,h:Math.floor(p.my/tile)*tile},{x:0,y:p.my,w:p.mx,h:Math.floor(game.height/tile)*tile},{x:W-p.mx,y:p.my,w:p.mx,h:Math.floor(game.height/tile)*tile}];
    const segments=[];let sx=0,sy=0;
    outer:for(const slab of slabs)for(let y=0;y<slab.h;y+=tile){let x=0;while(x<slab.w){const width=Math.min(pw-sx,slab.w-x);segments.push({sx,sy,dx:slab.x+x,dy:slab.y+y,width,height:tile});sx+=width;x+=width;if(sx===pw){sx=0;sy+=tile;if(sy===ph)break outer;}}}
    if(sy!==ph)throw Error('Insufficient border capacity');
    const result={...p,game,camera,pw,ph,dataHeight,segments};layouts.set(id,result);return result;
  }
  function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function encode(gameSource,cameraSource,id,out) {
    const l=layout(id),g=l.game,c=l.camera;out.width=W;out.height=H;const ctx=out.getContext('2d',{alpha:false});
    ctx.fillStyle='#15101f';ctx.fillRect(0,0,W,H);ctx.drawImage(gameSource,0,0,gameSource.width||gameSource.videoWidth,gameSource.height||gameSource.videoHeight,g.x,g.y,g.width,g.height);
    const patch=surface(l.pw,l.ph),pc=patch.getContext('2d',{alpha:false});pc.drawImage(out,g.x+c.x,g.y+c.y,c.width,c.height,0,0,l.pw,l.dataHeight);
    ctx.globalAlpha=l.gain||1;
    for(const s of l.segments)ctx.drawImage(patch,s.sx,s.sy,s.width,s.height,s.dx,s.dy,s.width,s.height);
    ctx.globalAlpha=1;
    ctx.drawImage(cameraSource,g.x+c.x,g.y+c.y,c.width,c.height);
    [...colors,l.color].forEach((rgb,i)=>{ctx.fillStyle=`rgb(${rgb})`;ctx.fillRect(i*16,0,16,16);});return l;
  }
  function detect(frame) {
    const c=marker||(marker=surface(96,16)),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(frame,0,0,frame.width*96/W,frame.height*16/H,0,0,96,16);
    const d=ctx.getImageData(0,0,96,16).data,match=(rgb,i)=>rgb.every((v,k)=>Math.abs(v-d[(8*96+i*16+8)*4+k])<65);
    if(!colors.every(match))return null;
    return Object.values(profiles).find(p=>match(p.color,5))?.id||null;
  }
  function decode(frame,id,out,cam) {
    const l=layout(id),g=l.game,c=l.camera,rx=frame.width/W,ry=frame.height/H;
    let patch=scratch.get(id);if(!patch){patch=surface(l.pw,l.ph);scratch.set(id,patch);}const pc=patch.getContext('2d',{alpha:false});
    for(const s of l.segments)pc.drawImage(frame,s.dx*rx,s.dy*ry,s.width*rx,s.height*ry,s.sx,s.sy,s.width,s.height);
    if(l.gain){const pixels=pc.getImageData(0,0,l.pw,l.ph),d=pixels.data,bg=[21,16,31];for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)d[i+k]=(d[i+k]-bg[k]*(1-l.gain))/l.gain;pc.putImageData(pixels,0,0);}
    const ctx=out.getContext('2d',{alpha:false});ctx.drawImage(frame,g.x*rx,g.y*ry,g.width*rx,g.height*ry,0,0,out.width,out.height);
    ctx.drawImage(patch,0,0,l.pw,l.dataHeight,c.x*out.width/g.width,c.y*out.height/g.height,c.width*out.width/g.width,c.height*out.height/g.height);
    if(cam)cam.getContext('2d',{alpha:false}).drawImage(frame,(g.x+c.x)*rx,(g.y+c.y)*ry,c.width*rx,c.height*ry,0,0,cam.width,cam.height);
    return l;
  }
  globalThis.FreecamEdgeCore={profiles,layout,encode,decode,detect};
})();
