const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {maySend}=require('./analysis.cjs');
const {projectDirectory}=require('../../../apps/desktop/paths.cjs');
const {parseAgentJSON}=require('./agent-json.cjs');
const root=path.resolve(__dirname,'../../..');
async function executeSkill(runtime,versionId,goal,{signal,resumeTaskId=null}){
 const store=runtime.store,settings=store.settings(),epoch=store.epoch(),skill=store.skill(versionId);
 if(!settings.modelEnabled)throw new Error('model_disabled');
 if(!skill.assets)throw new Error('skill_assets_pending');
 if(!store.jobRows(skill.job_id).length||!store.jobRows(skill.job_id).every(r=>maySend(r,settings)))throw new Error('skill_source_not_authorized');
 if(typeof goal!=='string'||!goal.trim()||goal.length>4000)throw new Error('invalid_text');
 const previous=resumeTaskId?store.db.prepare('SELECT * FROM task_runs WHERE id=?').get(resumeTaskId):null;
 if(resumeTaskId&&(!previous||previous.version_id!==versionId||!['failed','partial','interrupted','cancelled','blocked'].includes(previous.status)||JSON.parse(previous.payload).goal!==goal))throw new Error('invalid_task_resume');
 const id=previous?.id||randomUUID(),directory=projectDirectory(root,path.join(path.dirname(store.filename),'tasks',id));fs.mkdirSync(directory,{recursive:true});
 const payload=previous?JSON.parse(previous.payload):{goal,skill_name:skill.payload.name,trial:!skill.assessment?.learned,steps:[],artifacts:[],evidence_refs:[],result:null,started_at:new Date().toISOString()};
 if(previous){const authorized=new Set(store.observations(200).filter(r=>maySend(r,settings)).map(r=>r.id));if((payload.evidence_refs||[]).some(id=>!authorized.has(id)))throw new Error('skill_source_not_authorized');(payload.resume_history||=[]).push({status:previous.status,error:payload.error,result:payload.result,steps:payload.steps.length,at:new Date().toISOString()});delete payload.error;store.db.prepare('UPDATE task_runs SET status=?,payload=? WHERE id=?').run('running',JSON.stringify(payload),id);}else store.db.prepare('INSERT INTO task_runs VALUES(?,?,?,?)').run(id,versionId,'running',JSON.stringify(payload));runtime.notify();
 const guard=()=>{if(signal.aborted||runtime.closed||epoch!==store.epoch())throw new Error('request_cancelled');};
 const save=status=>{guard();store.db.prepare('UPDATE task_runs SET status=?,payload=? WHERE id=?').run(status,JSON.stringify(payload),id);runtime.notify();};
 const allowed=()=>store.observations(200).filter(r=>r.source!=='system_screenshot'&&maySend(r,store.settings()));
 const aliases=new Map(Object.entries(payload.record_aliases||{})),reverse=new Map([...aliases].map(([id,ref])=>[ref,id]));const reference=id=>{if(!aliases.has(id)){const ref='r'+String(aliases.size+1).padStart(3,'0');aliases.set(id,ref);reverse.set(ref,id);payload.record_aliases=Object.fromEntries(aliases);}return aliases.get(id);};const resolve=id=>reverse.get(id)||id;const present=value=>Array.isArray(value)?value.map(present):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='id'&&typeof v==='string'?reference(resolve(v)):present(v)])):value;
 const write=(name,content)=>{guard();if(typeof name!=='string'||!/^[\p{L}\p{N}_-]{1,60}\.(md|txt|json)$/u.test(name)||typeof content!=='string'||!content.trim()||Buffer.byteLength(content)>32000)throw new Error('invalid_task_artifact');const requested=name;if(!/^[a-zA-Z0-9_-]+\.(md|txt|json)$/.test(name))name='artifact-'+createHash('sha256').update(name).digest('hex').slice(0,12)+path.extname(name);const filename=path.join(directory,name);fs.writeFileSync(filename,content,{flag:'wx'});payload.artifacts.push({name,display_name:requested,relative_path:path.relative(root,filename)});return {saved:true,name,display_name:requested};};
 try{
  for(let step=payload.steps.length;step<=6;step++){
   guard();const history=payload.steps.slice(-4).map(s=>({tool:s.tool,arguments:s.tool==='save_result'?{name:s.arguments.name}:present(s.arguments),result:JSON.stringify(present(s.result)).slice(0,1800),excerpt:JSON.stringify(s.result).length>1800}));
   const available_experiences=allowed().slice(-6).map(r=>({id:reference(r.id),source:r.source,content:r.content.slice(0,500),excerpt:r.content.length>500}));
   let response;if(step<6&&payload.pending_tool_calls?.length)response={toolCall:payload.pending_tool_calls.shift()};else response=await runtime.model(settings,fs.readFileSync(path.join(__dirname,'../prompts/skill-execute.txt'),'utf8'),JSON.stringify({skill:{name:skill.payload.name,description:skill.payload.description,method:skill.payload.method},task:goal,available_experiences,history}),{signal,tools:require('./skill-tools.cjs').filter(t=>payload.steps.length||t.name!=='save_result'),toolChoice:step===6?'none':payload.steps.length?'auto':'required',toolHistory:payload.steps.filter(s=>s.call_id).slice(-6).flatMap(s=>[{type:'function_call',call_id:s.call_id,name:s.tool,arguments:JSON.stringify(s.arguments)},{type:'function_call_output',call_id:s.call_id,output:JSON.stringify(s.result)}]),outputSchema:require('./skill-action-schema.cjs')});guard();if(response.toolCalls?.length>1)payload.pending_tool_calls=response.toolCalls.slice(1);const parsed=response.toolCall?{type:'tool',tool:response.toolCall.name,arguments:parseAgentJSON(response.toolCall.arguments),message:'正在执行'+response.toolCall.name}:parseAgentJSON(response.text),action=parsed.action||parsed;
   payload.evidence_refs.push(...available_experiences.map(x=>resolve(x.id)));
   if(action.type==='blocked'){payload.result=String(action.reason||'缺少资料或工具').slice(0,2000);save('blocked');return {id,status:'blocked'};}
   if(action.type==='complete'){
    if(typeof action.result!=='string'||!action.result.trim()||action.result.length>16000||typeof action.summary!=='string')throw new Error('invalid_task_result');if(step<6||!payload.artifacts.length)write(fs.existsSync(path.join(directory,'result.md'))?'result-final-'+randomUUID().slice(0,8)+'.md':'result.md',action.result);payload.result=action.result;payload.summary=action.summary.slice(0,1000);save('completed');store.phase(skill.job_id,'skills','pending');return {id,status:'completed'};
   }
   if(step===6){payload.result='工具步骤已用完，已完成的文件与进度已经保留。';save('partial');return {id,status:'partial'};}
   if(action.type!=='tool'||!['search_experiences','read_experience','save_result'].includes(action.tool))throw new Error('unsupported_tool');
   const args=action.arguments||{};let result;
   if(action.tool==='search_experiences'){if(typeof args.query!=='string'||args.query.length>120)throw new Error('invalid_tool_input');const terms=args.query.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0,12);result=allowed().map(r=>({r,score:terms.length?terms.filter(t=>r.content.toLowerCase().includes(t)).length:1})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6).map(({r})=>({id:reference(r.id),source:r.source,content:r.content.slice(0,600),truncated:r.content.length>600}));}
   if(action.tool==='read_experience'){const row=allowed().find(r=>r.id===resolve(args.id));if(!row)throw new Error('unauthorized_experience');payload.evidence_refs.push(row.id);result={id:reference(row.id),source:row.source,content:row.content};}
   if(action.tool==='search_experiences')payload.evidence_refs.push(...result.map(x=>resolve(x.id)));
   if(action.tool==='save_result')result=write(args.name,args.content);
   payload.steps.push({tool:action.tool,call_id:response.toolCall?.call_id,arguments:args,result,message:String(action.message||'正在整理线索……').slice(0,200)});save('running');
  }
  payload.result='这次先停在这里，已完成的整理留在任务详情中。';save('partial');return {id,status:'partial'};
 }catch(error){if(!runtime.closed&&epoch===store.epoch()){payload.error=signal.aborted?'cancelled':'execution_failed';store.db.prepare('UPDATE task_runs SET status=?,payload=? WHERE id=?').run(signal.aborted?'cancelled':'failed',JSON.stringify(payload),id);}throw error;}
}
module.exports={executeSkill};
