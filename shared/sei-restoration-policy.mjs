export const RESTORATION_LIMITS=Object.freeze({maxArea:1,resumeArea:1});

export function restorationArea(rect,frame={width:1920,height:1080}){
  if(![frame.width,frame.height,rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||frame.width<=0||frame.height<=0||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||rect.x+rect.width>frame.width||rect.y+rect.height>frame.height)throw Error('Invalid restoration rectangle');
  return rect.width*rect.height/(frame.width*frame.height);
}

// Producer-side guard. Check before invoking the patch encoder, not after delivery.
// The callback must emit an independently decodable keyframe when forceKeyFrame is true.
export class RestorationGate {
  constructor({frame={width:1920,height:1080},...limits}={}){
    this.frame=frame;this.limits={...RESTORATION_LIMITS,...limits,resumeArea:limits.resumeArea??limits.maxArea??RESTORATION_LIMITS.resumeArea};
    if(![this.limits.resumeArea,this.limits.maxArea].every(Number.isFinite)||!(this.limits.resumeArea>0&&this.limits.resumeArea<=this.limits.maxArea&&this.limits.maxArea<=1))throw Error('Invalid restoration limits');
    this.areaPaused=false;this.needsKey=true;this.lastTime=-1;
  }
  process({rect,timestamp,encode}){
    if(!Number.isSafeInteger(timestamp)||timestamp<0||timestamp<=this.lastTime)throw Error('Frame timestamps must increase');
    this.lastTime=timestamp;
    const area=restorationArea(rect,this.frame);
    this.areaPaused=this.areaPaused?area>this.limits.resumeArea:area>this.limits.maxArea;
    const pause=reason=>{this.needsKey=true;return {paused:true,reason,area,bytes:new Uint8Array()};};
    if(this.areaPaused)return pause('area');
    const forceKeyFrame=this.needsKey;
    const packet=encode({forceKeyFrame});
    if(!(packet.bytes instanceof Uint8Array)||packet.bytes.byteLength>1024*1024)throw Error('Invalid encoded patch');
    if(!packet.bytes.byteLength)return pause('missing');
    if(forceKeyFrame&&!packet.keyFrame)return pause('keyframe');
    this.needsKey=false;
    return {paused:false,area,bytes:packet.bytes,keyFrame:packet.keyFrame};
  }
}

export const DEFAULT_RESTORATION_PERCENT=25;
export function restorationPercent(value){return Number.isInteger(value)&&value>=1&&value<=100?value:DEFAULT_RESTORATION_PERCENT;}
export function viewerAllowsRestoration(rect,percent){return restorationArea(rect)<=restorationPercent(percent)/100;}
