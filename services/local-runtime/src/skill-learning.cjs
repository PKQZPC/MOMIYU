const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {maySend}=require('./analysis.cjs');
const {parseAgentJSON}=require('./agent-json.cjs');
const prompt=name=>fs.readFileSync(path.join(__dirname,'../prompts',name+'.txt'),'utf8');
const json=value=>parseAgentJSON(value.text);
const bounded=(value,max=2000)=>typeof value==='string'&&value.length>0&&value.length<=max;
function processEvidence(store,row){
 const result={id:row.id,source:row.source,role:row.role,content:row.content,created_at:row.created_at};
 if(row.metadata?.process)result.process=row.metadata.process;
 if(row.metadata?.statistics)result.statistics=row.metadata.statistics;
 if(row.source==='system_interface'&&row.metadata?.event_id){const evidence=store.systemEvidence(row.metadata.event_id,row.metadata.received_seq);const view=require('./conversation-evidence.cjs').presentInterface(evidence.view);result.process={checkpoint:evidence.seq,event:evidence.event,view:view?{...view,text:view.text.slice(0,1600),excerpt:view.text.length>1600}:null};}
 return result;
}
async function consolidateSkills(runtime,jobId,{signal}){
 const store=runtime.store,settings=store.settings(),epoch=store.epoch();
 const guard=()=>{if(signal.aborted||runtime.closed||epoch!==store.epoch())throw new Error('request_cancelled');};
 const ask=async(name,input)=>{guard();const response=await runtime.model(settings,prompt(name),JSON.stringify(input),{signal});guard();return json(response);};
 store.phase(jobId,'skills','running');
 try{
  const life=store.lifeContext(settings),rows=store.jobRows(jobId).filter(r=>maySend(r,settings));
  const workflows=life.entries.filter(x=>x.job_id===jobId&&x.kind==='workflow');
  // A resource cap, not a learning threshold. Later cycles can handle other skills.
  for(const skill of [...life.skills].sort((a,b)=>Number(!!b.assets)-Number(!!a.assets)).slice(0,2)){
   if(!skill.assets){
    if(!store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get()){
    const dataUrl='data:image/png;base64,'+fs.readFileSync(store.currentAppearance().filename).toString('base64');
    const response=await runtime.model(settings,prompt('skill-motion'),JSON.stringify({skill:skill.payload}),{signal,images:[{id:'current_pet_poses',dataUrl}]});guard();const motion=json(response);
    if(!Number.isFinite(motion.fps)||motion.fps<1||motion.fps>12||!bounded(motion.description,1000)||['startup','running','success','failed','cancelled'].some(k=>!Array.isArray(motion[k])||motion[k].length<2||motion[k].length>12||motion[k].some(n=>!Number.isInteger(n)||n<0||n>5)))throw new Error('invalid_skill_motion');
    store.db.prepare('INSERT INTO skill_assets VALUES(?,?)').run(skill.id,JSON.stringify(motion));skill.assets=motion;
    }
   }
   for(const workflow of workflows.slice(0,1)){
    const evidence=rows.filter(r=>workflow.payload.source_refs.includes(r.id));
    if(evidence.length<2||evidence.some(r=>r.sequence<=skill.cutoff)||evidence.some(r=>r.source==='system_screenshot'||r.role==='assistant'))continue;
    let check=store.db.prepare('SELECT * FROM skill_checks WHERE version_id=? AND workflow_id=?').get(skill.id,workflow.id);
    // Never send the workflow description, cycle summary, current memory or
    // continuation to prediction. Only the first observed prefix is available.
    if(!check){const prefix=evidence.slice(0,1).map(r=>processEvidence(store,r));const prediction=await ask('skill-predict',{skill:skill.payload,prefix});if(typeof prediction.applicable!=='boolean'||!bounded(prediction.reason)||!bounded(prediction.next_step)||!bounded(prediction.expected_result))throw new Error('invalid_skill_prediction');check={id:randomUUID(),prediction:JSON.stringify({value:prediction,prefix_refs:prefix.map(r=>r.id),checkpoint:evidence[0].sequence}),verdict:null};store.db.prepare('INSERT INTO skill_checks VALUES(?,?,?,?,?,NULL)').run(check.id,skill.id,jobId,workflow.id,check.prediction);}
    if(!check.verdict){const prediction=JSON.parse(check.prediction);let verdict;
     if(!prediction.value.applicable)verdict={verdict:'inconclusive',reason:prediction.value.reason,supported_scope:'不适用',limitations:'未核对该任务'};
     else verdict=await ask('skill-compare',{skill:skill.payload,prediction,continuation:evidence.slice(1).map(r=>processEvidence(store,r)),workflow:workflow.payload});
     if(!['supported','contradicted','inconclusive'].includes(verdict.verdict)||!bounded(verdict.reason)||!bounded(verdict.supported_scope)||!bounded(verdict.limitations))throw new Error('invalid_skill_verdict');store.db.prepare('UPDATE skill_checks SET verdict=? WHERE id=?').run(JSON.stringify(verdict),check.id);
    }
   }
   const checks=store.db.prepare('SELECT prediction,verdict,job_id FROM skill_checks WHERE version_id=? AND verdict IS NOT NULL ORDER BY rowid DESC LIMIT 6').all(skill.id).filter(x=>store.jobRows(x.job_id).every(r=>maySend(r,settings))).map(x=>({prediction:JSON.parse(x.prediction),verdict:JSON.parse(x.verdict)}));
   const runs=store.db.prepare("SELECT payload FROM task_runs WHERE version_id=? AND status='completed' ORDER BY rowid DESC LIMIT 2").all(skill.id).map(x=>JSON.parse(x.payload)).filter(run=>(run.evidence_refs||[]).every(id=>{const row=store.db.prepare('SELECT source FROM observations WHERE id=?').get(id);return row&&maySend(row,settings);})).map(run=>({goal:run.goal.slice(0,800),result:run.result?.slice(0,1600),steps:run.steps.map(s=>({tool:s.tool,message:s.message})),artifacts:run.artifacts,trial:run.trial,excerpt:true}));
   // These are necessary types of evidence, not sufficient point/count rules.
   if(!checks.some(x=>x.verdict.verdict==='supported')||!runs.length||!skill.assets)continue;
   const previous=store.db.prepare('SELECT payload FROM skill_assessments WHERE version_id=? ORDER BY rowid DESC LIMIT 1').get(skill.id);const fingerprint=createHash('sha256').update(JSON.stringify({checks,runs})).digest('hex');
   if(previous&&JSON.parse(previous.payload).evidence_fingerprint===fingerprint)continue;
   const parent=skill.payload.related_skill_id&&life.skills.find(x=>x.id===skill.payload.related_skill_id);
   const assessment=await ask('skill-assess',{skill:skill.payload,checks,executions:runs,previous:previous?JSON.parse(previous.payload):null,parent_version:parent||null});
   if(typeof assessment.learned!=='boolean'||!bounded(assessment.proficiency,120)||!bounded(assessment.reason))throw new Error('invalid_skill_assessment');assessment.evidence_fingerprint=fingerprint;
   if(parent?.assessment?.learned&&assessment.preserves_learned_scope!==true){assessment.learned=false;assessment.reason+='；原有已学会范围尚待回归核对，旧版本保持可用。';}
   store.db.prepare('INSERT INTO skill_assessments VALUES(?,?,?,?)').run(randomUUID(),skill.id,jobId,JSON.stringify(assessment));
  }
  guard();store.phase(jobId,'skills','completed');
 }catch(error){if(!runtime.closed)store.phase(jobId,'skills','failed',signal.aborted?'cancelled':'analysis_failed');throw error;}
}
module.exports={consolidateSkills};
