// Bounded validation for the RGBA8/gray-alpha8 PNG delivery contract.
const {inflateSync}=require('node:zlib');
function inspectMaterial(bytes){
 const fail=()=>{throw new Error('invalid_appearance_material');};
 if(bytes.length<45||bytes.length>4*1048576||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail();
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),channels=bytes[25]===6?4:bytes[25]===4?2:0;
 if(width<512||height<512||width*height>5000000||bytes[24]!==8||!channels||bytes[26]||bytes[27]||bytes[28])fail();
 const parts=[];let ended=false;
 for(let p=8;p+12<=bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);if(n>bytes.length-p-12)fail();if(type==='IDAT')parts.push(bytes.subarray(p+8,p+8+n));p+=n+12;if(type==='IEND'){ended=true;break;}}
 if(!ended||!parts.length)fail();const stride=width*channels,expected=(stride+1)*height;
 let raw;try{raw=inflateSync(Buffer.concat(parts),{maxOutputLength:expected});}catch{fail();}if(raw.length!==expected)fail();
 let previous=Buffer.alloc(stride),clear=0,visible=0;const cells=Array(6).fill(0);
 const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)],line=Buffer.allocUnsafe(stride);if(filter>4)fail();
  for(let x=0;x<stride;x++){const a=x>=channels?line[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0,predict=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);line[x]=(raw[y*(stride+1)+1+x]+predict)&255;}
  for(let x=0;x<width;x++){const alpha=line[x*channels+channels-1];if(alpha===0)clear++;if(alpha>=16){visible++;cells[Math.min(1,Math.floor(y/(height/2)))*3+Math.min(2,Math.floor(x/(width/3)))]++;}}previous=line;
 }
 if(!clear||!visible||cells.some(n=>!n))fail();return {width,height,clear_pixels:clear,visible_pixels:visible,visible_pixels_per_cell:cells};
}
module.exports={inspectMaterial};
