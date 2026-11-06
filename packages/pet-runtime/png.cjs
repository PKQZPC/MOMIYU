// Small bounded PNG codec for project-owned RGBA sprite assets; no dependencies.
const {inflateSync,deflateSync}=require('node:zlib');
function decode(bytes){
 const fail=()=>{throw new Error('invalid_sprite_png');};
 if(bytes.length<45||bytes.length>8*1048576||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail();
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),channels=bytes[25]===6?4:bytes[25]===4?2:0;
 if(!width||!height||width*height>5000000||bytes[24]!==8||!channels||bytes[26]||bytes[27]||bytes[28])fail();
 const parts=[];let ended=false;
 for(let p=8;p+12<=bytes.length;){const n=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);if(n>bytes.length-p-12)fail();if(type==='IDAT')parts.push(bytes.subarray(p+8,p+8+n));p+=n+12;if(type==='IEND'){ended=true;break;}}
 if(!ended||!parts.length)fail();const stride=width*channels,expected=(stride+1)*height,raw=inflateSync(Buffer.concat(parts),{maxOutputLength:expected});if(raw.length!==expected)fail();
 const data=Buffer.alloc(width*height*4);let previous=Buffer.alloc(stride);
 const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)],line=Buffer.alloc(stride);if(filter>4)fail();for(let x=0;x<stride;x++){const a=x>=channels?line[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0;line[x]=(raw[y*(stride+1)+1+x]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
  for(let x=0;x<width;x++){const p=(y*width+x)*4,q=x*channels;data[p]=line[q];data[p+1]=channels===4?line[q+1]:line[q];data[p+2]=channels===4?line[q+2]:line[q];data[p+3]=line[q+channels-1];}previous=line;
 }return {width,height,data};
}
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);tag.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([tag,data])),data.length+8);return out;}
function encode({width,height,data}){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)data.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function crop(image,rect){const {x,y,width,height}=rect,data=Buffer.alloc(width*height*4);if(x<0||y<0||x+width>image.width||y+height>image.height)throw new Error('invalid_sprite_crop');for(let j=0;j<height;j++)image.data.copy(data,j*width*4,((y+j)*image.width+x)*4,((y+j)*image.width+x+width)*4);return {width,height,data};}
module.exports={decode,encode,crop};
