const fs=require('node:fs'),path=require('node:path');
const {decode,encode,crop}=require('../../../packages/pet-runtime/png.cjs');
const {alphaBounds}=require('../../../packages/pet-runtime/sprite-layout.cjs');
const root=path.resolve(__dirname,'../../..');
const styles={soft:{name:'柔和款'},pearl:{name:'珠光款'}};
const assetNames={ivory:'white',mint:'green',lavender:'purple',red:'red',blue:'blue'};
const eggVersionId=origin=>'egg_'+((origin.style||'soft')==='pearl'?'pearl_':'')+origin.color;
const colors={ivory:{name:'白',original:true},mint:{name:'绿'},lavender:{name:'紫'},red:{name:'红'},blue:{name:'蓝'}};
function eggAsset(directory,color='ivory',style='soft'){
 if(!Object.hasOwn(colors,color))throw new Error('invalid_egg_color');
 if(!Object.hasOwn(styles,style))throw new Error('invalid_egg_style');
 require('../../../apps/desktop/paths.cjs').projectDirectory(root,directory);
 const curated=path.join(root,'apps/desktop/assets/eggs/v001',style,assetNames[color]+'.png');if(fs.existsSync(curated))return curated;
 if(style!=='soft'||color!=='ivory')throw new Error('egg_assets_pending');
 const filename=path.join(directory,'origin','egg-palette-v4-'+color+'.png');if(fs.existsSync(filename))return filename;
 const source=decode(fs.readFileSync(path.join(root,'demos/pet-animation/assets/reference-atlas.png')));
 // Only the previously approved egg in the first atlas cell, never the example growth route.
 const cell=crop(source,{x:0,y:0,width:Math.floor(source.width/4),height:Math.floor(source.height/2)}),b=alphaBounds(cell.data,cell.width,cell.height),padding=12;
 const image=crop(cell,{x:Math.max(0,b.x-padding),y:Math.max(0,b.y-padding),width:Math.min(cell.width,b.x+b.width+padding)-Math.max(0,b.x-padding),height:Math.min(cell.height,b.y+b.height+padding)-Math.max(0,b.y-padding)});
 fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,encode(image),{flag:'wx'});return filename;
}
function eggPlan(){return {schema_version:2,bindings:{'base.idle':{asset:'egg',motion:'still'},'base.greet':{asset:'egg',motion:'rock'},'sleep.rest':{asset:'egg',motion:'still'},'sleep.wake':{asset:'egg',motion:'rock'}},actions:[
 {id:'base.greet',name:'轻轻摇晃',description:'蛋左右轻摇，随后停稳。',trigger:'靠近互动或唤醒时',change:'initial',reason:'蛋时期只有这一项动态回应。'}],states:[
 {id:'base.idle',name:'待机',description:'保持静止。'},
 {id:'sleep.rest',name:'休息',description:'保持静止，暂停互动回应；没有独立睡姿。'},
 {id:'sleep.wake',name:'唤醒',description:'复用轻摇回应，不是新增动作。'}],missing:[]};}
module.exports={eggAsset,eggPlan,colors,styles,eggVersionId};
