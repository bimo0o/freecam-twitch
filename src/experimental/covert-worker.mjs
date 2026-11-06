import {createModem} from './covert-modem.mjs';
import {PacketReceiver} from '../../shared/covert-protocol.mjs';
let modem,receiver,decoder,canvas,ctx,config,expected=0,needsKey=true;
const isKey=b=>{for(let i=0;i<b.length-4;i++)if(b[i]===0&&b[i+1]===0&&((b[i+2]===1&&(b[i+3]&31)===5)||(b[i+2]===0&&b[i+3]===1&&(b[i+4]&31)===5)))return true;return false;};
function reset(){receiver=new PacketReceiver();expected=0;needsKey=true;if(decoder&&decoder.state!=='closed')decoder.close();decoder=new VideoDecoder({output:frame=>postMessage({type:'patch',id:Math.round(frame.timestamp*config.fps/1e6),frame},[frame]),error:e=>postMessage({type:'error',message:String(e)})});decoder.configure({codec:config.codec,optimizeForLatency:true});}
self.onmessage=async({data})=>{try{
 if(data.type==='init'){config=data.config;modem=await createModem();canvas=new OffscreenCanvas(1920,1080);ctx=canvas.getContext('2d',{willReadFrequently:true});reset();postMessage({type:'ready'});return;}
 if(data.type==='reset'){reset();return;}
 if(data.type==='frame'){
  const t=performance.now();ctx.drawImage(data.frame,0,0);data.frame.close();const ex=modem.extract(ctx.getImageData(0,0,1920,1080),config.step),r=receiver.push(ex.soft);
  if(r.packet){if(r.packet.start!==expected)needsKey=true;for(let j=0;j<r.packet.units.length;j++){const bytes=r.packet.units[j],key=isKey(bytes);if(needsKey&&!key)continue;if(key)needsKey=false;decoder.decode(new EncodedVideoChunk({type:key?'key':'delta',timestamp:Math.round((r.packet.start+j)*1e6/config.fps),data:bytes}));}expected=r.packet.start+r.packet.units.length;}
  postMessage({type:'processed',id:data.id,header:r.header,packet:r.packet?.id??null,ms:performance.now()-t,extractMs:ex.ms,stats:receiver.stats});
 }
}catch(e){data.frame?.close?.();postMessage({type:'error',message:String(e)});}};
