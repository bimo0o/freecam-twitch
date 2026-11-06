const crcTable=Uint32Array.from({length:256},(_,value)=>{let c=value;for(let bit=0;bit<8;bit++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=(c>>>8)^crcTable[(c^bytes[i])&255];return (c^0xffffffff)>>>0;}
export function annexBUnits(bytes){const nals=[];for(let i=0;i<bytes.length-3;i++){let size=bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1?3:bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===0&&bytes[i+3]===1?4:0;if(size){nals.push({at:i,size,type:bytes[i+size]&31});i+=size-1;}}
 const aud=nals.filter(n=>n.type===9);if(!aud.length)throw Error('H.264 access unit delimiters required');return aud.map((n,i)=>bytes.slice(i===0?0:n.at,i+1<aud.length?aud[i+1].at:bytes.length));}
