// Opt-in until the actual Twitch bootstrap/CSP paths have been verified.
export function installWorkerBridge(workerSource,post,stats){
 if(!globalThis.Worker||!workerSource)return ()=>{};
 let enabled=false;const NativeWorker=Worker,handleKeys=new WeakMap(),workers=new Map(),blobs=new Map();const createUrl=URL.createObjectURL.bind(URL),revokeUrl=URL.revokeObjectURL.bind(URL);URL.createObjectURL=function(value){const url=createUrl(value);if(value instanceof Blob&&value.size<=8*1024*1024&&!/^(video|audio|image|font)\//i.test(value.type)){if(blobs.size>=128)blobs.delete(blobs.keys().next().value);blobs.set(url,value);}return url;};URL.revokeObjectURL=function(url){blobs.delete(String(url));return revokeUrl(url);};
 const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'srcObject');
 if(descriptor?.set&&descriptor.configurable)Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{...descriptor,set(value){descriptor.set.call(this,value);const key=value&&handleKeys.get(value);if(key)this.dataset.freecamSeiMediaKey=key;else delete this.dataset.freecamSeiMediaKey;}});
 const collect=(value,result=[],seen=new Set(),depth=0)=>{if(!value||typeof value!=='object'||seen.has(value)||depth>5||seen.size>200)return result;seen.add(value);if(Object.prototype.toString.call(value)==='[object MediaSourceHandle]')result.push(value);else if(!ArrayBuffer.isView(value)&&!(value instanceof ArrayBuffer))for(const key of Object.keys(value))collect(value[key],result,seen,depth+1);return result;};
 function WrappedWorker(url,options){
  if(!new.target)throw new TypeError('Worker constructor requires new');
  const absolute=new URL(String(url),document.baseURI);
  if(!enabled||absolute.origin!==location.origin)return Reflect.construct(NativeWorker,[url,options],new.target||NativeWorker);
  const token=crypto.randomUUID();
  const owned=absolute.protocol==='blob:'&&blobs.has(absolute.href)?createUrl(blobs.get(absolute.href)):null;const entry=owned||absolute.href;
  const load=options?.type==='module'?`await import(${JSON.stringify(entry)})`:`importScripts(${JSON.stringify(entry)})`;
  // Queue messages while a module dependency graph is loading; replay only after
  // the application installs its handlers. Transferables stay in the same realm.
  const bootstrap=`self.__freecamWorkerToken=${JSON.stringify(token)};\n${workerSource}\n`+`${options?.type==='module'?'':'(async()=>{'}const early=[];const hold=e=>{early.push(e);e.stopImmediatePropagation()};addEventListener('message',hold);`+
   `const nativeScripts=self.importScripts?.bind(self);if(nativeScripts)self.importScripts=(...urls)=>nativeScripts(...urls.map(url=>new URL(String(url),${JSON.stringify(absolute.href)}).href));`+
   `const nativeFetch=fetch;self.fetch=(url,...args)=>{if(typeof url==='string'){try{url=new URL(url,${JSON.stringify(absolute.href)}).href}catch{}}return nativeFetch(url,...args)};`+
   `try{${load};removeEventListener('message',hold);for(const e of early)dispatchEvent(new MessageEvent('message',{data:e.data,ports:e.ports}));}catch(error){postMessage({__freecamWorker:${JSON.stringify(token)},type:'error',error:'Worker bootstrap: '+String(error)});throw error;}${options?.type==='module'?'': '})()'}`;
  const blob=URL.createObjectURL(new Blob([bootstrap],{type:'text/javascript'}));let worker;
  try{worker=Reflect.construct(NativeWorker,[blob,options],new.target||NativeWorker);}catch(error){URL.revokeObjectURL(blob);if(owned)revokeUrl(owned);stats.lastError=String(error);return Reflect.construct(NativeWorker,[url,options],new.target||NativeWorker);}
  if(workers.size>=32)workers.delete(workers.keys().next().value);workers.set(token,{appends:0,packets:0});
  const terminate=worker.terminate.bind(worker);worker.terminate=()=>{workers.delete(token);URL.revokeObjectURL(blob);if(owned)revokeUrl(owned);terminate();};worker.addEventListener('error',()=>{stats.lastError='Worker compatibility bootstrap failed. Disable the mode and reload the page.';});let pending=[];
  worker.addEventListener('message',event=>{const value=event.data;
   if(value?.__freecamWorker===token){event.stopImmediatePropagation();if(value.type==='handles')pending=value.ids;
    if(value.type==='packet')post('packet',{packet:value.packet});
    if(value.type==='error')stats.lastError=String(value.error).slice(0,200);
    if(value.type==='stats'){workers.set(token,value);stats.workerAppends=[...workers.values()].reduce((n,w)=>n+w.appends,0);stats.workerPackets=[...workers.values()].reduce((n,w)=>n+w.packets,0);}
    return;
   }
   const found=collect(value);for(let i=0;i<found.length&&i<pending.length;i++)handleKeys.set(found[i],token+':'+pending[i]);if(found.length)pending=[];
  });
  // The URL remains valid until the worker has had a chance to load it.
  setTimeout(()=>{URL.revokeObjectURL(blob);if(owned)revokeUrl(owned);},60000);return worker;
 }
 WrappedWorker.prototype=NativeWorker.prototype;Object.setPrototypeOf(WrappedWorker,NativeWorker);globalThis.Worker=WrappedWorker;
 window.addEventListener('message',event=>{if(event.source===window&&event.origin===location.origin&&event.data?.tag==='freecam-worker-config')enabled=event.data.enabled===true;});
 return value=>{enabled=!!value;};
}
