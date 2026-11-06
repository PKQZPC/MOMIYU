// Pixel check against the actual pet renderer. No model or collection service.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'.local/egg-render-check');
app.disableHardwareAcceleration();require('../../apps/desktop/paths.cjs').configurePaths(app,root,{dataDirectory:path.join(directory,'profile')});
let window;
app.whenReady().then(async()=>{try{
 const {eggAsset,eggPlan}=require('../../services/local-runtime/src/egg.cjs'),data={id:'egg_ivory',kind:'egg',dataUrl:'data:image/png;base64,'+fs.readFileSync(eggAsset(directory,'ivory')).toString('base64'),actions:eggPlan()},state={settings:{resting:false},appearance:{id:'egg_ivory'},motion:null};
 ipcMain.handle('momiyu:invoke',(_e,op)=>({ok:true,value:op==='appearance'?data:state}));
 window=new BrowserWindow({show:false,transparent:true,backgroundColor:'#00000000',width:240,height:240,webPreferences:{preload:path.join(root,'apps/desktop/preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false,offscreen:true}});
 await window.loadFile(path.join(root,'apps/desktop/renderer/pet.html'));
 const result=await window.webContents.executeJavaScript(`(async()=>{
  await petActor.ready;const pause=ms=>new Promise(r=>setTimeout(r,ms));
  for(let n=0;n<60&&petActor.state().kind!=='egg';n++)await pause(50);
  if(petActor.state().kind!=='egg')throw new Error('egg_not_loaded');
  const canvas=document.getElementById('pet-canvas'),ctx=canvas.getContext('2d');
  const center=()=>[...ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data];
  await pause(80);const baseline=center();petActor.setHovered(true);
  const frames=[];for(let n=0;n<70;n++){await pause(20);frames.push({pixel:center(),action:petActor.state().action});}
  return {baseline,frames};
 })()`);
 const minAlpha=Math.min(...result.frames.map(x=>x.pixel[3]));assert.ok(result.frames.some(x=>x.action==='base.greet'));assert.ok(result.frames.some(x=>x.action==='base.idle'));assert.ok(minAlpha>=result.baseline[3]-2,'egg becomes transparent during rocking transition');
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({status:'passed',baseline_alpha:result.baseline[3],minimum_alpha:minAlpha,frames:result.frames.length,checks:['actual pet renderer loads the egg','hover triggers rocking and returns to idle','no opacity dip in either transition'],external_calls:0},null,2));console.log('Egg renderer: 70 sampled frames, center alpha '+minAlpha+' / baseline '+result.baseline[3]+', no transition opacity dip.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{window?.destroy();app.quit();}});
