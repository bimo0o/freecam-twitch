// K=7, rate 1/2 or 1/3 convolutional code, terminated with six zeros.
const parity=n=>{n^=n>>>4;n^=n>>>2;n^=n>>>1;return n&1;};
export function encode(bytes,rate=2){const gens=rate===3?[0o171,0o133,0o165]:[0o171,0o133];const out=new Uint8Array((bytes.length*8+6)*rate);let state=0,j=0;for(let i=0;i<bytes.length*8+6;i++){const bit=i<bytes.length*8?(bytes[i>>3]>>(7-(i&7)))&1:0;state=((state<<1)|bit)&127;for(const g of gens)out[j++]=parity(state&g);}return out;}
export function decode(bits,byteLength,rate=2,soft=false){const gens=rate===3?[0o171,0o133,0o165]:[0o171,0o133];const n=byteLength*8+6,trace=new Uint8Array(n*64);let previous=new Float64Array(64).fill(1e9),next=new Float64Array(64);previous[0]=0;
 for(let t=0;t<n;t++){for(let state=0;state<64;state++){const p0=state>>1,p1=p0|32,r0=state,r1=state|64;let c0=previous[p0],c1=previous[p1];for(let k=0;k<rate;k++){const b=bits[t*rate+k],v0=parity(r0&gens[k]),v1=parity(r1&gens[k]);c0+=soft?(v0?(1-b):(1+b))*.5:Number(v0!==b);c1+=soft?(v1?(1-b):(1+b))*.5:Number(v1!==b);}next[state]=Math.min(c0,c1);trace[t*64+state]=c1<c0?1:0;}[previous,next]=[next,previous];}
 const bytes=new Uint8Array(byteLength);let state=0;for(let t=n-1;t>=0;t--){if(t<byteLength*8)bytes[t>>3]|=(state&1)<<(7-(t&7));state=(state>>1)|(trace[t*64+state]<<5);}return bytes;
}
export function permutation(n){const p=Uint32Array.from({length:n},(_,i)=>i);let seed=0x341ad731;for(let i=n-1;i>0;i--){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const j=(seed>>>0)%(i+1);[p[i],p[j]]=[p[j],p[i]];}return p;}
