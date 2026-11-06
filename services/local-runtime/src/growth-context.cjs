const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {prepareGrowth}=require('./growth.cjs');
const {maySend}=require('./analysis.cjs');
const root=path.resolve(__dirname,'../../..');
function growthContext(store,jobId,settings){
 const job=store.job(jobId);if(!job?.result)throw new Error('missing_growth_job');
 const current=store.currentAppearance(),input=prepareGrowth({...job.result,growth:{...job.result.growth,should_change:true}},root,current);
 const context=store.modelLifeContext(settings),parents=new Set();
 input.request.pet_context=context.entries.filter(x=>['pet','shared_memory'].includes(x.kind)).map(x=>x.kind==='pet'?x.payload.personality:x.payload.description).join('\n');
 const historyNotes=store.appearanceHistory().filter(x=>x.state==='active').slice(0,6).reverse().map(x=>x.id+'（'+x.created_at+'）：'+String(x.payload.reason||'').slice(0,300)).join('\n');
 if(historyNotes)input.request.pet_context+='\n此前已采用的成长记录：\n'+historyNotes;
 const learned=context.skills.filter(x=>x.learned);if(learned.length)input.request.pet_context+='\n已经学会的技能：'+learned.map(x=>x.payload.name+'：'+x.payload.description).join('；');
 const expressed=new Set(),queue=store.appearanceHistory().filter(x=>x.state==='active').map(x=>x.job_id);
 while(queue.length){const id=queue.pop();if(expressed.has(id))continue;expressed.add(id);for(const d of store.db.prepare('SELECT depends_on FROM job_dependencies WHERE job_id=?').all(id))queue.push(d.depends_on);}
 const accumulation=[];let bytes=0;
 const candidates=store.db.prepare("SELECT id FROM jobs WHERE status='completed' AND json_array_length(json_extract(result,'$.experiences'))>0 ORDER BY rowid DESC LIMIT 100").all();
 for(const {id} of candidates){
  const prior=store.job(id);
  if(prior.id===jobId||prior.status!=='completed'||expressed.has(prior.id)||!prior.result?.experiences?.length||!store.jobRows(prior.id).every(r=>maySend(r,settings)))continue;
  const entry={job_id:prior.id,time_context:prior.created_at,experiences:prior.result.experiences};
  const cost=Buffer.byteLength(JSON.stringify(entry));if(bytes+cost>6000)continue;
  accumulation.push(entry);parents.add(prior.id);bytes+=cost;if(accumulation.length===4)break;
 }
 const historic=store.appearanceHistory().filter(x=>x.state==='active'&&x.id!==current.id)[0];
 const references=[{id:'image_current',bytes:fs.readFileSync(current.filename)}];
 if(current.job_id)parents.add(current.job_id);
 if(historic){
  const filename=path.join(root,historic.path),data=fs.readFileSync(filename);parents.add(historic.job_id);
  input.request.visual_references.push({image_id:'image_historical',role:'historical_form',description:'当前版本链中更早的已生效形象，用于理解此前设计发展，不替代本轮起点。',version:historic.id});
  input.attachments.push({image_id:'image_historical',relative_path:historic.path,sha256:createHash('sha256').update(data).digest('hex')});
  references.push({id:'image_historical',bytes:data});
 }else if(store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get()&&!current.id.startsWith('egg_')){
  const origin=JSON.parse(store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get().value),{eggAsset,eggVersionId}=require('./egg.cjs'),filename=eggAsset(path.dirname(store.filename),origin.color,origin.style||'soft'),data=fs.readFileSync(filename),relative_path=path.relative(root,filename);
  input.request.visual_references.push({image_id:'image_historical',role:'historical_form',description:'这个体最初的蛋。',version:eggVersionId(origin)});input.attachments.push({image_id:'image_historical',relative_path,sha256:createHash('sha256').update(data).digest('hex')});references.push({id:'image_historical',bytes:data});
 }else if(!store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get()&&current.id!=='sample_appearance_v1'){
  const relative_path='demos/pet-animation/assets/body-poses.png',data=fs.readFileSync(path.join(root,relative_path));
  input.request.visual_references.push({image_id:'image_historical',role:'historical_form',description:'当前版本链的初始参考形象，仅提供历史背景。',version:'sample_appearance_v1'});
  input.attachments.push({image_id:'image_historical',relative_path,sha256:createHash('sha256').update(data).digest('hex')});references.push({id:'image_historical',bytes:data});
 }
 input.request.delivery_requirements={purpose:'桌宠完整六姿态素材图集',canvas:'1536×1024 PNG',composition:'3 列×2 行等大单元，同一宠物各自完整呈现，无文字与格线。0 号为日常待机，其余姿态和表达由你结合经历、现有姿态与技能自主设计。',background:'透明背景。'};
 const judgment={task:input.request.task,experiences:input.request.experiences,user_understanding:input.request.user_understanding||[],pet_context:input.request.pet_context,unexpressed_accumulation:accumulation,visual_references:input.request.visual_references};
 // Accumulation is historical context, never an extra occurrence/count.
 input.request.experiences=[...input.request.experiences,...accumulation.flatMap(x=>x.experiences.map(e=>({...e,time_context:'此前整理于 '+x.time_context})))];
 return {input,judgment,references,parents:[...parents].filter(x=>x&&x!==jobId)};
}
module.exports={growthContext};
