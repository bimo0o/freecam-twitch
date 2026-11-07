import {FragmentReader} from '../../shared/covert-fragments.mjs';
// Executed inside a dedicated worker before the player's own entry point.
const token=self.__freecamWorkerToken,send=self.postMessage.bind(self),owners=new WeakMap(),ids=new WeakMap(),handles=new WeakMap(),readers=new WeakMap();
let next=0,appends=0,packets=0;
const id=source=>{if(!ids.has(source))ids.set(source,++next);return ids.get(source);};
const report=(type,data,transfer=[])=>send({__freecamWorker:token,type,...data},transfer);
const collect=(value,result=[],seen=new Set(),depth=0)=>{if(!value||typeof value!=='object'||seen.has(value)||depth>5||seen.size>200)return result;seen.add(value);if(handles.has(value))result.push(id(handles.get(value)));else if(!ArrayBuffer.isView(value)&&!(value instanceof ArrayBuffer))for(const key of Object.keys(value))collect(value[key],result,seen,depth+1);return result;};
if(globalThis.MediaSource&&globalThis.SourceBuffer){
 const descriptor=Object.getOwnPropertyDescriptor(MediaSource.prototype,'handle');
 if(descriptor?.get&&descriptor.configurable)Object.defineProperty(MediaSource.prototype,'handle',{...descriptor,get(){const handle=descriptor.get.call(this);handles.set(handle,this);id(this);return handle;}});
 const add=MediaSource.prototype.addSourceBuffer,append=SourceBuffer.prototype.appendBuffer;
 MediaSource.prototype.addSourceBuffer=function(type){const buffer=Reflect.apply(add,this,[type]);owners.set(buffer,this);return buffer;};
 SourceBuffer.prototype.appendBuffer=function(input){try{appends++;let reader=readers.get(this);if(!reader){const source=id(owners.get(this));reader=new FragmentReader(packet=>{packets++;report('packet',{packet:{...packet,mediaKey:token+':'+source}},[packet.bytes.buffer]);});readers.set(this,reader);}reader.feed(input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength),this.timestampOffset||0);}catch(error){report('error',{error:String(error)});}return Reflect.apply(append,this,[input]);};
 self.postMessage=function(value,...args){const found=collect(value);if(found.length)report('handles',{ids:found});return send(value,...args);};
 setInterval(()=>report('stats',{appends,packets}),1000);
}
