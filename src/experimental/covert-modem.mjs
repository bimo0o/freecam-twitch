import {permutation} from '../../scripts/covert-fec.mjs';
const slots=permutation(64800);
export async function createModem(url='/experimental/covert-channel.wasm'){
 const {instance}=await WebAssembly.instantiate(await (await fetch(url)).arrayBuffer()),e=instance.exports,memory=e.memory;
 const basis=new Float32Array(memory.buffer,e.basis_ptr(),128);for(let k=0;k<2;k++){const [u,v]=[[1,2],[2,1]][k];for(let j=0;j<64;j++)basis[k*64+j]=.25*Math.cos((2*(j%8)+1)*u*Math.PI/16)*Math.cos((2*Math.floor(j/8)+1)*v*Math.PI/16);}
 const pixels=new Uint8ClampedArray(memory.buffer,e.frame_ptr(),1920*1080*4),bits=new Uint8Array(memory.buffer,e.bits_ptr(),64800),soft=new Float32Array(memory.buffer,e.soft_ptr(),64800);
 const mask=new Uint8Array(memory.buffer,e.header_ptr(),64800);for(let i=0;i<2048;i++)mask[slots[i]]=1;
 return {embed(image,tx,step,randomized=true){pixels.set(image.data);for(let i=0;i<64800;i++)bits[slots[i]]=tx[i];const at=performance.now();e.embed(2,step,Number(randomized));return {image:new ImageData(new Uint8ClampedArray(pixels),1920,1080),ms:performance.now()-at};},extract(image,step,randomized=true){pixels.set(image.data);const at=performance.now();e.extract(2,step,Number(randomized));return {soft:Float32Array.from(slots,p=>soft[p]),ms:performance.now()-at};}};
}
