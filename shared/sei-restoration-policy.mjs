export const RESTORATION_LIMITS=Object.freeze({maxArea:.25,resumeArea:.20,maxBitsPerSecond:1_200_000});

export function restorationArea(rect,frame={width:1920,height:1080}){
  if(![frame.width,frame.height,rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||frame.width<=0||frame.height<=0||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||rect.x+rect.width>frame.width||rect.y+rect.height>frame.height)throw Error('Invalid restoration rectangle');
  return rect.width*rect.height/(frame.width*frame.height);
}

// Producer-side guard. Check before invoking the patch encoder, not after delivery.
// The callback must emit an independently decodable keyframe when forceKeyFrame is true.
export class RestorationGate {
  constructor({frame={width:1920,height:1080},...limits}={}){
    this.frame=frame;this.limits={...RESTORATION_LIMITS,...limits};
    if(![this.limits.resumeArea,this.limits.maxArea,this.limits.maxBitsPerSecond].every(Number.isFinite)||!(this.limits.resumeArea>0&&this.limits.resumeArea<=this.limits.maxArea&&this.limits.maxArea<=1&&this.limits.maxBitsPerSecond>0))throw Error('Invalid restoration limits');
    this.areaPaused=false;this.needsKey=true;this.window=[];this.lastTime=-1;
  }
  process({rect,timestamp,encode}){
    if(!Number.isSafeInteger(timestamp)||timestamp<0||timestamp<=this.lastTime)throw Error('Frame timestamps must increase');
    this.lastTime=timestamp;
    const area=restorationArea(rect,this.frame);
    this.areaPaused=this.areaPaused?area>this.limits.resumeArea:area>this.limits.maxArea;
    const pause=reason=>{this.needsKey=true;return {paused:true,reason,area,bytes:new Uint8Array()};};
    if(this.areaPaused)return pause('area');
    this.window=this.window.filter(p=>p.timestamp>timestamp-1_000_000);
    // Reserve 256 bytes/frame for SEI headers/escaping at the gate; the final
    // transport meter must also account for container and network overhead.
    const used=this.window.reduce((n,p)=>n+p.bits,0),remainingBits=this.limits.maxBitsPerSecond-used;
    if(remainingBits<=2048)return pause('budget');
    const forceKeyFrame=this.needsKey;
    const packet=encode({forceKeyFrame,maxBytes:Math.floor(remainingBits/8)-256});
    if(!(packet.bytes instanceof Uint8Array)||packet.bytes.byteLength>1024*1024)throw Error('Invalid encoded patch');
    const bits=(packet.bytes.byteLength+256)*8;
    if(!packet.bytes.byteLength||used+bits>this.limits.maxBitsPerSecond)return pause('budget');
    if(forceKeyFrame&&!packet.keyFrame)return pause('keyframe');
    this.needsKey=false;this.window.push({timestamp,bits});
    return {paused:false,area,bytes:packet.bytes,keyFrame:packet.keyFrame};
  }
}
