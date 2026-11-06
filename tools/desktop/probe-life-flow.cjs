// Explicit live API check. Only project-owned/synthetic data, no paid image generation.
const fs=require('node:fs'),path=require('node:path');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const {requestModel}=require('../../services/local-runtime/src/model.cjs');
const args=process.argv.slice(2),at=args.indexOf('--proxy-config');if(!args.includes('--run')||at<0)throw new Error('Explicit --run --proxy-config PATH required');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.local/life-flow-probe');fs.mkdirSync(out,{recursive:true});
const ledgerPath=path.join(out,'ledger.json'),resume=args.includes('--continue');if(fs.existsSync(ledgerPath)&&!resume)throw new Error('live_validation_already_reserved');
const ledger=resume?JSON.parse(fs.readFileSync(ledgerPath,'utf8')):{model:'gpt-5.6-luna',request_limit:6,automatic_retries:0,image_generation_calls:0,personal_data:false,attempts:[]};
if(resume){ledger.previous_status=ledger.status;delete ledger.error;delete ledger.error_detail;}
const write=()=>fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));write();
const fake=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
const runtime=new Runtime(path.join(out,'profile'),{observerFactory:fake,screenFactory:fake,model:async(settings,system,input,options)=>{
 if(ledger.attempts.length>=ledger.request_limit)throw new Error('validation_budget_exhausted');
 const entry={agent:system.split('\n')[0].slice(0,65),status:'reserved',images:options.images?.length||0};ledger.attempts.push(entry);write();
 try{const response=await requestModel(settings,system,input,options);entry.status='completed';entry.usage=response.usage;fs.writeFileSync(path.join(out,'response-'+ledger.attempts.length+'.json'),JSON.stringify(response));return response;}
 catch(error){entry.status='failed';entry.error=/^[a-z_]+(?:_\d{3})?$/.test(error.message)?error.message:'request_failed';throw error;}
 finally{write();}
}});
(async()=>{try{
 runtime.settings({modelEnabled:true,model:'gpt-5.6-luna',proxyConfig:path.resolve(args[at+1]),saveNotes:true,sendNotes:true,saveScreenshots:true,sendScreenshots:true,imageGeneration:false});
 ledger.connection=await runtime.checkConnection();write();
 if(!resume){runtime.note('合成流程案例：整理两份本地记录时，我先按事实与推断分类，再给每一项保留来源。对于资料甲“已经完成核对”，我标成事实；对于资料乙“可能更省时间”，我标成待验证推断。');
 runtime.note('合成流程案例的后续：我将上述事实与推断分别写成两组笔记，保留资料甲/资料乙标记，并列出“省时间”的验证问题。这个可复用方法是先辨认事实与推断，再分类、保留来源并列待核实事项。');
 const png=fs.readFileSync(path.join(root,'apps/desktop/assets/brand/momiyu.png'));
 runtime.store.ingestScreen({event_id:'project-owned-pet-image',occurred_at:new Date().toISOString(),screenshot:{png:png.toString('base64'),width:512,height:512,reason:'baseline_30m'}});
 const sleep=await runtime.sleep();ledger.sleep={mode:sleep.mode,jobs:runtime.snapshot().jobs.map(x=>({status:x.status,growth_state:x.growth_state})),phases:runtime.snapshot().life.phases};write();}
 const skill=runtime.snapshot().life.skills.find(x=>x.assets);
 if(skill){runtime.wake();const task=await runtime.useSkill({id:skill.id,goal:'请仅使用已经保存的合成流程案例，按事实/推断分类的方法整理一份短笔记，保留来源和待核实事项，输出实际文本结果。不检索网络。'});ledger.task={status:task.status,artifacts:runtime.snapshot().life.tasks[0].payload.artifacts};}
 ledger.status=ledger.sleep.jobs[0]?.status==='completed'?'passed':'incomplete';
}catch(error){ledger.status='failed_or_partial';ledger.error=/^[a-z_]+(?:_\d{3})?$/.test(error.message)?error.message:'validation_failed';ledger.error_detail={name:error.name,frames:String(error.stack||'').split('\n').filter(x=>x.includes('/src/')||x.includes('\\src\\')).slice(0,6)};process.exitCode=1;}
finally{ledger.total_tokens=ledger.attempts.reduce((n,x)=>n+(x.usage?.total_tokens||0),0);runtime.close();write();console.log(JSON.stringify({status:ledger.status,requests:ledger.attempts.length,total_tokens:ledger.total_tokens,image_generation_calls:0,task:ledger.task?.status,error:ledger.error}));}})();
