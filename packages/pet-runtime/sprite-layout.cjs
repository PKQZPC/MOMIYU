(function(root){
 function alphaBounds(rgba,width,height,threshold=16){let left=width,top=height,right=-1,bottom=-1;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=threshold){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}return right<0?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};}
 function groundedRect(bounds,scale,width,height){const w=bounds.width*scale,h=bounds.height*scale;return {x:(width-w)/2,y:height*.91-h,width:w,height:h};}
 // Assign whole connected components before cropping. A tail can extend across
 // a nominal grid boundary; slicing the grid first puts it in the next pose.
 function poseRegions(rgba,width,height,columns=3,rows=2,threshold=16){
  const count=width*height,labels=new Uint8Array(count),queue=new Int32Array(count),bounds=Array.from({length:columns*rows},()=>({left:width,top:height,right:-1,bottom:-1}));
  for(let start=0;start<count;start++){
   if(labels[start]||rgba[start*4+3]<threshold)continue;
   let head=0,tail=1,sumX=0,sumY=0,left=width,top=height,right=-1,bottom=-1;queue[0]=start;labels[start]=255;
   while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);sumX+=x;sumY+=y;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const next=ny*width+nx;if(!labels[next]&&rgba[next*4+3]>=threshold){labels[next]=255;queue[tail++]=next;}}
   }
   const group=Math.min(rows-1,Math.floor(sumY/tail/(height/rows)))*columns+Math.min(columns-1,Math.floor(sumX/tail/(width/columns))),b=bounds[group];
   for(let i=0;i<tail;i++)labels[queue[i]]=group+1;
   b.left=Math.min(b.left,left);b.top=Math.min(b.top,top);b.right=Math.max(b.right,right);b.bottom=Math.max(b.bottom,bottom);
  }
  return {labels,regions:bounds.map(b=>b.right<0?null:{x:b.left,y:b.top,width:b.right-b.left+1,height:b.bottom-b.top+1})};
 }
 const api={alphaBounds,groundedRect,poseRegions};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MomiyuSpriteLayout=api;
})(globalThis);
