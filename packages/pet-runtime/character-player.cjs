(function(root){
 class CharacterPlayer{
  async load(data){this.kind=data.kind;this.data=data;this.frames=[];this.key='';this.last=0;
   const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
   if(data.kind==='egg'){this.egg=await load(data.dataUrl);const canvas=document.createElement('canvas');canvas.width=this.egg.width;canvas.height=this.egg.height;const ctx=canvas.getContext('2d');ctx.drawImage(this.egg,0,0);this.eggBounds=root.MomiyuSpriteLayout.alphaBounds(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);return;}
   for(const src of data.pages||[]){const image=await load(src),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),split=root.MomiyuSpriteLayout.poseRegions(pixels.data,canvas.width,canvas.height);
    this.frames.push(split.regions.map((b,i)=>{if(!b)throw new Error('missing_pose');const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const target=c.getContext('2d'),out=target.createImageData(b.width,b.height);for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){const p=(b.y+y)*canvas.width+b.x+x;if(split.labels[p]===i+1)out.data.set(pixels.data.subarray(p*4,p*4+4),(y*b.width+x)*4);}target.putImageData(out,0,0);return c;}));
   }
  }
  draw(ctx,binding,now,w,h){const key=JSON.stringify(binding);if(key!==this.key){this.key=key;this.started=now;}
   if(this.kind==='egg'){const b=this.eggBounds,scale=Math.min(w*.63/b.width,h*.7/b.height),rect=root.MomiyuSpriteLayout.groundedRect(b,scale,w,h);ctx.save();ctx.translate(rect.x+rect.width/2,rect.y+rect.height);ctx.rotate(binding?.motion==='rock'?Math.sin((now-this.started)/140)*.075:0);ctx.drawImage(this.egg,b.x,b.y,b.width,b.height,-rect.width/2,-rect.height,rect.width,rect.height);ctx.restore();return rect;}
   const frames=binding?.frames||[{page:0,pose:0}],n=Math.floor((now-this.started)/1000*(binding?.fps||4)),frame=frames[binding?.loop?n%frames.length:Math.min(n,frames.length-1)],image=this.frames[frame.page||0]?.[frame.pose];if(!image)return null;
   const all=this.frames.flat(),scale=Math.min(w*.87/Math.max(...all.map(x=>x.width)),h*.86/Math.max(...all.map(x=>x.height))),rect=root.MomiyuSpriteLayout.groundedRect({width:image.width,height:image.height},scale,w,h);ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height);return rect;
  }
 }
 const api={CharacterPlayer};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MomiyuCharacterPlayer=api;
})(globalThis);
