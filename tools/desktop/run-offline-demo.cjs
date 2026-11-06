// A reproducible synthetic walkthrough. Does not read or register local accounts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const {decode,encode,crop}=require('../../packages/pet-runtime/png.cjs');
const {createOfflineModel}=require('../../demo_data/offline-model.cjs');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'demo_data/.local/runs/offline_walkthrough');fs.mkdirSync(base,{recursive:true});
const directory=fs.mkdtempSync(path.join(base,'run-')),profile=path.join(directory,'profile');
const load=id=>{
 const dir=path.join(root,'demo_data/scenarios',id,'v001'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 assert.equal(manifest.provenance,'synthetic');
 return manifest.files.map(f=>{const bytes=fs.readFileSync(path.join(dir,f.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);return JSON.parse(bytes);});
};
const egg=load('egg_journey'),practice=load('skill_practice'),backend=createOfflineModel();
const atlas=decode(fs.readFileSync(path.join(root,'demos/pet-animation/assets/body-poses.png'))),sleep=decode(fs.readFileSync(path.join(root,'demos/pet-animation/assets/sleep.png')));
const w=atlas.width/3,h=atlas.height/2,design=encode(crop(atlas,{x:0,y:0,width:w,height:h}));
const scale=Math.min((w-24)/sleep.width,(h-24)/sleep.height),sw=Math.floor(sleep.width*scale),sh=Math.floor(sleep.height*scale);
for(let y=0;y<h;y++)atlas.data.fill(0,((h+y)*atlas.width)*4,((h+y)*atlas.width+w)*4);
for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const s=(Math.floor(y/scale)*sleep.width+Math.floor(x/scale))*4,d=((h+Math.floor((h-sh)/2)+y)*atlas.width+Math.floor((w-sw)/2)+x)*4;sleep.data.copy(atlas.data,d,s,s+4);}
const material=encode(atlas),off=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
const r=new Runtime(profile,{startObservers:false,observerFactory:off,screenFactory:off,model:backend.model,imageGenerator:async(_settings,input)=>input.stage==='materials'?material:design});
const report={provenance:'synthetic',model:'scripted-offline-responses',external_calls:0,actual_tokens:0,stages:[]};
const oldFetch=global.fetch;global.fetch=()=>{throw Error('offline_demo_must_not_use_network');};
const importBatch=batch=>{for(const record of batch.records)r.store.add('manual_note','user',record.description,{demo_record_id:record.id,process:record.process,statistics:record.statistics,occurred_at:record.occurred_at});};
(async()=>{try{
 r.chooseEgg('ivory');r.store.db.prepare("INSERT OR REPLACE INTO meta VALUES('demo_dataset',?)").run(JSON.stringify({id:'offline_walkthrough',version:'v001',provenance:'synthetic',model:'scripted'}));
 r.settings({saveNotes:true,sendNotes:true,modelEnabled:true,imageGeneration:true});
 for(const batch of egg.slice(0,2)){importBatch(batch);await r.sleep();report.stages.push({stage:batch.id,appearance:r.store.currentAppearance().id,growth:r.store.jobs()[0].growth_state});r.wake();}
 assert.equal(r.store.appearanceData().kind,'character');
 r.settings({imageGeneration:false});backend.state.learnCandidate=true;importBatch(practice[0]);await r.sleep();
 const candidate=r.store.life().skills[0];assert.ok(candidate);assert.equal(candidate.assessment,null);report.stages.push({stage:'candidate',learned:false});
 r.settings({imageGeneration:true});assert.equal((await r.prepareSkill(candidate.id)).mode,'ready');r.settings({imageGeneration:false});
 assert.equal((await r.useSkill({id:candidate.id,goal:'请根据社团活动记录准备交接说明。'})).status,'completed');await r.sleep();
 importBatch(practice[1]);await r.sleep();const learned=r.store.skill(candidate.id);assert.equal(learned.assessment.learned,true);report.stages.push({stage:'later-observation-checked',learned:true,proficiency:learned.assessment.proficiency});
 assert.equal((await r.useSkill({id:candidate.id,goal:'请根据读书会记录准备新的交接说明。'})).status,'completed');
 report.stages.push({stage:'learned-skill-executed',taskStatus:r.store.life().tasks[0].status});
 report.status='completed';report.profile=path.relative(root,profile);report.scripted_model_calls=backend.state.calls.length;report.taskFiles=r.store.life().tasks.flatMap(t=>t.payload.artifacts.map(a=>a.relative_path));
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}finally{
 r.settings({modelEnabled:false,imageGeneration:false,resting:false,saveNotes:false});r.close();global.fetch=oldFetch;
 fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(report.status==='completed')console.log('\nOpen the synthetic desktop profile (close any other MOMIYU window first):\n.\\tools\\desktop\\start.ps1 -DataDirectory "'+profile+'"');
}})();
