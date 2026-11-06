// Preparation for a single isolated character, not an animation atlas.
const {decode,encode,crop}=require('./png.cjs');
const {alphaBounds}=require('./sprite-layout.cjs');
function prepareSingleSprite(bytes){
 const image=decode(bytes),{width,height,data}=image,count=width*height,visited=new Uint8Array(count),queue=new Int32Array(count);let largest=[];
 for(let start=0;start<count;start++){if(visited[start]||data[start*4+3]<16)continue;let head=0,tail=1;queue[0]=start;visited[start]=1;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const n=ny*width+nx;if(!visited[n]&&data[n*4+3]>=16){visited[n]=1;queue[tail++]=n;}}}
  if(tail>largest.length)largest=Array.from(queue.subarray(0,tail));
 }
 if(!largest.length)throw new Error('empty_sprite');const mask=new Uint8Array(count);for(const p of largest)mask[p]=1;
 let removed=0;for(let p=0;p<count;p++)if(!mask[p]){if(data[p*4+3])removed++;data.fill(0,p*4,p*4+4);}
 const b=alphaBounds(data,width,height),pad=Math.max(12,Math.round(Math.max(b.width,b.height)*.06)),x=Math.max(0,b.x-pad),y=Math.max(0,b.y-pad),right=Math.min(width,b.x+b.width+pad),bottom=Math.min(height,b.y+b.height+pad),out=crop(image,{x,y,width:right-x,height:bottom-y});
 return {bytes:encode(out),metadata:{source_width:width,source_height:height,width:out.width,height:out.height,removed_detached_pixels:removed,preparation:'largest-alpha-component-v1'}};
}
module.exports={prepareSingleSprite};
