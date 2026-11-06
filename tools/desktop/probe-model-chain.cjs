// Explicit live validation only. No image calls, user data or automatic retry.
const fs=require('node:fs');
const path=require('node:path');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.local/model-chain-20261101');
const args=process.argv.slice(2),configIndex=args.indexOf('--proxy-config');
if(!args.includes('--run')||configIndex<0||!args[configIndex+1])throw new Error('Explicit --run --proxy-config PATH required');
fs.mkdirSync(out,{recursive:true});
const ledgerPath=path.join(out,'ledger.json'),lockPath=path.join(out,'request.lock');
const lock=fs.openSync(lockPath,'wx');fs.closeSync(lock);
if(fs.existsSync(ledgerPath)){fs.unlinkSync(lockPath);throw new Error('validation_budget_already_reserved');}
const write=value=>{fs.writeFileSync(ledgerPath+'.tmp',JSON.stringify(value,null,2));fs.renameSync(ledgerPath+'.tmp',ledgerPath);};
const ledger={synthetic_only:true,model:'gpt-5.6-luna',automatic_retries:0,image_calls:0,attempts:[]};
let runtime;
async function stage(name,fn){
  const entry={stage:name,status:'reserved',started_at:new Date().toISOString()};ledger.attempts.push(entry);write(ledger);
  try{const value=await fn();entry.status='completed';entry.result=value;}
  catch(error){entry.status='failed_or_unknown';entry.error=/^[a-z_]+(?:_\d{3})?$/.test(error.message)?error.message:'validation_failed';throw error;}
  finally{entry.finished_at=new Date().toISOString();write(ledger);}
}
(async()=>{
  try{
    if(fs.existsSync(ledgerPath))throw new Error('validation_budget_already_reserved');
    runtime=new Runtime(path.join(out,'profile'));
    runtime.settings({model:'gpt-5.6-luna',proxyConfig:path.resolve(args[configIndex+1]),modelEnabled:true,saveChat:true,sendChat:true,saveFiles:true,sendFiles:true});
    ledger.connection=await runtime.checkConnection();if(ledger.connection.status!=='ready')throw new Error('model_not_available');
    const filename=path.join(out,'synthetic-process.txt');fs.writeFileSync(filename,'合成测试记录：我需要整理一份小型清单。先按名称排序，发现重复条目后进行核对，再保留不同的条目。');runtime.watchFile(filename);
    await stage('chat',async()=>{const result=await runtime.chat('这是一条合成测试消息。我刚整理好一份清单，请用一句简短中文回应，不要执行任务。');if(result.mode!=='model')throw new Error('live_model_required');return result;});
    await stage('sleep',async()=>{const result=await runtime.sleep(),job=runtime.snapshot().jobs[0];if(result.mode!=='analyzed'||job?.status!=='completed')throw new Error('analysis_not_completed');return {mode:result.mode,job_id:job.id,summary:job.result.summary,experience_count:job.result.experiences.length,workflow_candidate_count:job.result.workflow_candidates.length,skill_candidate_count:job.result.skill_candidates.length,growth:job.result.growth,growth_state:job.growth_state,usage:job.usage};});
    ledger.status='passed';
  }catch{ledger.status='failed_or_blocked';process.exitCode=1;}
  finally{runtime?.close();write(ledger);fs.unlinkSync(lockPath);console.log(JSON.stringify({status:ledger.status,stages:ledger.attempts.map(item=>({stage:item.stage,status:item.status,error:item.error})),image_calls:0}));}
})();
