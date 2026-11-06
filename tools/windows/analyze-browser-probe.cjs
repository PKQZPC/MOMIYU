// Explicit real-model acceptance of the owned native-browser probe only.
// No private browser data, image generation or automatic transport retries.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const {requestModel}=require('../../services/local-runtime/src/model.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.local/windows-capture/browser-live');
const read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8').replace(/^\uFEFF/,''));
const fake=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
async function run(){
 assert.equal(read('report.json').status,'passed');
 const ledgerFile=path.join(out,'analysis-ledger.json');
 const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{limit:3,calls:[],created_at:new Date().toISOString()};
 const continuing=process.argv.includes('--continue');
 if(ledger.calls.length&&!continuing)throw new Error('validation_already_started_review_existing_ledger');
 if(ledger.calls.length>=ledger.limit)throw new Error('approved_analysis_budget_exhausted');
 const profile=continuing?path.resolve(root,ledger.profile):fs.mkdtempSync(path.join(out,'analysis-profile-'));
 const save=()=>fs.writeFileSync(ledgerFile,JSON.stringify(ledger,null,2));ledger.profile=path.relative(root,profile);save();
 const model=async(settings,instructions,input,options)=>{
   if(ledger.calls.length>=ledger.limit)throw new Error('approved_analysis_budget_exhausted');
   const call={number:ledger.calls.length+1,started_at:new Date().toISOString(),status:'started'};ledger.calls.push(call);save();
   try{const response=await requestModel(settings,instructions,input,options);call.status='completed';call.usage=response.usage;save();return response;}
   catch(error){call.status='failed';call.error=error.message;save();throw error;}
 };
 const runtime=new Runtime(profile,{model,observerFactory:fake,screenFactory:fake});
 try{
   if(!continuing)runtime.chooseEgg('ivory');runtime.settings({saveSystem:true,systemApps:'msedge'});
   const events=read('events.json').filter(x=>x.type==='event');
   if(!continuing)for(const event of events)runtime.store.ingestSystem(event.value);
   const rows=runtime.store.observations(200);assert.ok(rows.some(x=>x.metadata.submission));
   assert.ok(!JSON.stringify(rows).includes('UNSENT_DRAFT_SENTINEL'));assert.ok(!JSON.stringify(rows).includes('PASSWORD_CAPTURE_SENTINEL'));
   const operation=events.find(x=>x.value.kind==='action'&&x.value.target?.name==='Only accessible routes');
   assert.ok(operation);const saved=runtime.store.db.prepare('SELECT seq FROM system_events WHERE id=?').get(operation.value.event_id);
   assert.ok(!JSON.stringify(runtime.store.systemEvidence(operation.value.event_id,saved.seq)).includes('Filter applied'));
   runtime.settings({modelEnabled:true,model:'gpt-5.6-luna',sendSystem:true,proxyConfig:'D:\\paper\\CLIProxyAPI\\config.yaml',imageGeneration:false});
   const result=await runtime.sleep();const job=runtime.store.jobs().find(x=>x.id===result.id);
   assert.equal(job.status,'completed');assert.ok(job.result.experiences.length);
   const report={status:'passed',model:runtime.store.settings().model,calls:ledger.calls.length,observations:rows.length,submitted_texts:rows.filter(x=>x.metadata.submission).length,job_id:result.id,analysis:job.result,remaining_records:runtime.store.pendingCount(),prefix_isolated:true,image_calls:0,profile:path.relative(root,profile)};
   fs.writeFileSync(path.join(out,continuing?'sleep-continuation-report.json':'sleep-report.json'),JSON.stringify(report,null,2));
   ledger.status='completed';save();console.log(JSON.stringify({status:report.status,calls:report.calls,observations:report.observations,submitted_texts:report.submitted_texts,job_id:report.job_id,remaining_records:report.remaining_records}));
 }finally{runtime.settings({modelEnabled:false,sendSystem:false,saveSystem:false});runtime.close();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
