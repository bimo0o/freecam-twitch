// Exact-frame matching only. No nearest-neighbour patch substitution.
export class FrameTimeline{
 constructor(limit=40){this.limit=limit;this.frames=new Map();this.patches=new Map();this.evicted=0;}
 put(map,id,value){if(!Number.isInteger(id)||id<0){value.close?.();return;}map.get(id)?.close?.();map.set(id,value);while(map.size>this.limit){const oldest=Math.min(...map.keys());map.get(oldest)?.close?.();map.delete(oldest);this.evicted++;}}
 frame(id,value){this.put(this.frames,id,value);} patch(id,value){this.put(this.patches,id,value);}
 pick(id){return {frame:this.frames.get(id),patch:this.patches.get(id),restorable:this.frames.has(id)&&this.patches.has(id)};}
 discardBefore(id){for(const map of [this.frames,this.patches])for(const [key,value]of map)if(key<id){value.close?.();map.delete(key);}}
 reset(){for(const map of [this.frames,this.patches]){for(const value of map.values())value.close?.();map.clear();}}
}
export function presentationFrame(mediaTime,delaySeconds,outputLagSeconds=0,fps=30){return Math.floor((mediaTime-delaySeconds-Math.max(0,outputLagSeconds))*fps+1e-4);}
