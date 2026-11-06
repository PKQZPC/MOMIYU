// Explicit, bounded real-model run using an immutable synthetic dataset.
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const {requestModel}=require('../../services/local-runtime/src/model.cjs');
const {generateAppearance}=require('../../services/local-runtime/src/appearance.cjs');
const root=path.resolve(__dirname,'../..'),args=process.argv.slice(2);
const arg=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
if(!args.includes('--run')||!arg('--proxy-config'))throw new Error('Explicit --run --proxy-config PATH required');
const inside=p=>{const full=path.resolve(root,p);if(!full.startsWith(root+path.sep))throw new Error('path_outside_project');return full;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestPath=inside(arg('--dataset')||'demo_data/scenarios/evolution_journey/v001/manifest.json');
const manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes);
if(manifest.schema_version!==1||manifest.provenance!=='synthetic'||![manifest.scenario_id,manifest.dataset_version].every(x=>/^[a-zA-Z0-9_-]+$/.test(x)))throw new Error('invalid_dataset');
const records=[];for(const item of manifest.files){const filename=inside(path.join(path.dirname(manifestPath),item.path));if(!filename.startsWith(path.dirname(manifestPath)+path.sep))throw new Error('invalid_dataset_path');const bytes=fs.readFileSync(filename);if(hash(bytes)!==item.sha256)throw new Error('dataset_hash_mismatch');records.push(...JSON.parse(bytes).records);}
if(records.length!==manifest.record_count||new Set(records.map(x=>x.id)).size!==records.length)throw new Error('invalid_dataset_records');
const out=inside(arg('--resume')||path.join('demo_data/.local/runs',manifest.scenario_id,manifest.dataset_version,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)));fs.mkdirSync(out,{recursive:true});
const ledgerPath=path.join(out,'ledger.json'),resuming=Boolean(arg('--resume'));
const previous=arg('--previous-run')?JSON.parse(fs.readFileSync(path.join(inside(arg('--previous-run')),'ledger.json'),'utf8')):null;
if(previous&&previous.dataset.manifest_sha256!==hash(manifestBytes))throw new Error('previous_dataset_mismatch');
let ledger=resuming?JSON.parse(fs.readFileSync(ledgerPath,'utf8')):{schema_version:1,dataset:{id:manifest.scenario_id,version:manifest.dataset_version,manifest_sha256:hash(manifestBytes),records:records.length},model:'gpt-5.6-luna',model_call_limit:previous?previous.model_call_limit-previous.model_calls.length:10,image_call_limit:previous?previous.image_call_limit-previous.image_calls.length:1,previous_run:arg('--previous-run'),automatic_retries:0,personal_data:false,model_calls:[],image_calls:[],events:[],code_sha256:{}};
if(ledger.dataset.manifest_sha256!==hash(manifestBytes))throw new Error('resume_dataset_mismatch');
for(const file of ['services/local-runtime/src/runtime.cjs','services/local-runtime/src/appearance.cjs','services/local-runtime/src/growth-context.cjs','services/local-runtime/prompts/sleep.txt','services/local-runtime/prompts/growth-judge.txt','services/local-runtime/prompts/image-agent.txt','services/local-runtime/prompts/appearance-review.txt']){const digest=hash(fs.readFileSync(path.join(root,file)));if(resuming&&ledger.code_sha256[file]!==digest)throw new Error('resume_code_mismatch');ledger.code_sha256[file]=digest;}
const save=()=>fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');save();
const disabledObserver=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
let lastState='';const runtime=new Runtime(path.join(out,'profile'),{observerFactory:disabledObserver,screenFactory:disabledObserver,changed:s=>{const state=s.jobs[0]?.growth_state||s.busy||'ready';if(state!==lastState){lastState=state;ledger.events.push({state,at:new Date().toISOString()});save();console.log('Evolution: '+state);}},
 model:async(settings,system,input,options)=>{if(ledger.model_calls.length>=ledger.model_call_limit)throw new Error('demo_model_budget_exhausted');const call={agent:system.split('\n')[0],status:'reserved',images:options.images?.length||0};ledger.model_calls.push(call);save();try{const result=await requestModel(settings,system,input,options);call.status='completed';call.usage=result.usage;fs.writeFileSync(path.join(out,'model-'+ledger.model_calls.length+'.json'),JSON.stringify(result));return result;}catch(e){call.status='failed';throw e;}finally{save();}},
 imageGenerator:async(...params)=>{if(ledger.image_calls.length>=ledger.image_call_limit)throw new Error('demo_image_budget_exhausted');const call={status:'reserved',model:'gpt-image-1.5',quality:'low',at:new Date().toISOString()};ledger.image_calls.push(call);save();fs.writeFileSync(path.join(out,'generation-input.json'),JSON.stringify(params[1],null,2));try{const bytes=await generateAppearance(...params);call.status='completed';call.sha256=hash(bytes);return bytes;}catch(e){call.status='failed';throw e;}finally{save();}}
});
(async()=>{try{
 runtime.settings({modelEnabled:true,imageGeneration:true,model:ledger.model,proxyConfig:path.resolve(arg('--proxy-config')),saveNotes:true,sendNotes:true});
 runtime.store.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('demo_dataset',JSON.stringify({id:manifest.scenario_id,version:manifest.dataset_version}));
 if(!resuming)for(const record of records){if(typeof record.description!=='string'||!Number.isFinite(Date.parse(record.occurred_at)))throw new Error('invalid_demo_record');const row=runtime.store.add('manual_note','user',record.description,{demo_record_id:record.id,process:record.process,statistics:record.statistics,object:record.object});runtime.store.db.prepare('UPDATE observations SET created_at=? WHERE id=?').run(record.occurred_at,row.id);}
 const result=await runtime.sleep(),state=runtime.snapshot(),job=state.jobs[0];
 ledger.result={mode:result.mode,job_id:job?.id,analysis_status:job?.status,growth_state:job?.growth_state,growth_judgment:job?.growth_input?.growth_judgment,current_appearance:state.appearance.id,history:state.appearance.history};
 ledger.status=job?.growth_state==='published'?'published':job?.growth_state==='accumulating'?'accumulating':'incomplete';
 if(job?.growth_state==='published'){fs.copyFileSync(runtime.store.currentAppearance().filename,path.join(out,'published.png'));fs.writeFileSync(path.join(out,'published.json'),JSON.stringify(runtime.store.appearanceData().id));}
}catch(error){ledger.status='failed_or_partial';ledger.error=/^[a-z_]+(?:_\d{3})?$/.test(error.message)?error.message:'demo_failed';process.exitCode=1;}
finally{runtime.settings({modelEnabled:false,imageGeneration:false});runtime.close();ledger.total_tokens=ledger.model_calls.reduce((n,c)=>n+(c.usage?.total_tokens||0),0);save();console.log(JSON.stringify({status:ledger.status,model_calls:ledger.model_calls.length,image_calls:ledger.image_calls.length,total_tokens:ledger.total_tokens,error:ledger.error,result:ledger.result,run_directory:path.relative(root,out)}));}})();
