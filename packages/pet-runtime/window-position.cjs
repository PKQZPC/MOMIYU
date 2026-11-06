function dragPosition(bounds,origin,cursor,area){
 if(!bounds||!origin||!cursor||!area)return null;
 const values=[bounds.x,bounds.y,bounds.width,bounds.height,origin.x,origin.y,cursor.x,cursor.y,area.x,area.y,area.width,area.height];
 if(values.some(x=>!Number.isFinite(x)||Math.abs(x)>2147483647)||bounds.width<=0||bounds.height<=0||area.width<=0||area.height<=0)return null;
 const x=Math.round(Math.max(area.x,Math.min(area.x+Math.max(0,area.width-bounds.width),bounds.x+cursor.x-origin.x)));
 const y=Math.round(Math.max(area.y,Math.min(area.y+Math.max(0,area.height-bounds.height),bounds.y+cursor.y-origin.y)));
 return Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&Math.abs(x)<=2147483647&&Math.abs(y)<=2147483647?{x,y}:null;
}
module.exports={dragPosition};
