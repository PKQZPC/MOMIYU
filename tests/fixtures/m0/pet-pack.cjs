// Procedural diagnostic shapes only, not AI-generated pet art.
const fs=require('node:fs');
const path=require('node:path');
const png=require('../../../packages/pet-runtime/png.cjs');
function sheet(width,height,frames,color) {
  const image={width:width*frames,height,data:Buffer.alloc(width*frames*height*4)};
  for(let frame=0;frame<frames;frame++) for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    if((x-width/2)**2+(y-height/2)**2 < (Math.min(width,height)*.35)**2 && !(frame===1&&Math.abs(x-width/2)<5&&Math.abs(y-height/2)<5)) image.data.set([...color,255],(y*image.width+frame*width+x)*4);
  }
  return png.encode(image);
}
function createPack(root,version=1) {
  fs.mkdirSync(root,{recursive:true});
  const height=version===1?32:48;
  const raw={name:`Synthetic v${version}`,sprite:'sprite.png',preview:'preview.png',frame:{width:32,height},columns:4,
    sheets:{main:{file:'sprite.png',frame:{width:32,height},columns:4},skill:{file:'skill.png',frame:{width:48,height:48},columns:3}},
    states:{idle:{row:0,frames:4,interval:100,loop:true},activate:{sheet:'skill',row:0,frames:3,interval:100,loop:false}},
    skills:{'skill:synthetic-search':'activate'}};
  fs.writeFileSync(path.join(root,'character.json'),JSON.stringify(raw));
  fs.writeFileSync(path.join(root,'sprite.png'),sheet(32,height,4,[191,177,214]));
  fs.writeFileSync(path.join(root,'skill.png'),sheet(48,48,3,[80,190,210]));
  fs.writeFileSync(path.join(root,'preview.png'),sheet(32,32,1,[191,177,214]));
  return raw;
}
function decode(bytes){try {const image=png.decode(bytes); return {width:image.width,height:image.height};}catch{return null;}}
module.exports={createPack,decode};
