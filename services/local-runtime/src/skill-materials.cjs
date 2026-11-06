const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {parseAgentJSON}=require('./agent-json.cjs'),{maySend}=require('./analysis.cjs');
const {validatePlan,bindingsFor}=require('./action-contract.cjs');
const root=path.resolve(__dirname,'../../..'),statuses=['startup','running','success','failed','cancelled'];
const prompt=n=>fs.readFileSync(path.join(__dirname,'../prompts',n+'.txt'),'utf8');
async function prepareSkillMaterials(runtime,id,{signal}){
 const store=runtime.store,settings=store.settings(),epoch=store.epoch(),skill=store.skill(id),current=store.currentAppearance();
 if(!settings.modelEnabled||!settings.imageGeneration)throw new Error('image_generation_disabled');
 const rows=store.jobRows(skill.job_id);if(!rows.length||!rows.every(r=>maySend(r,settings)))throw new Error('skill_source_not_authorized');
 if(store.appearanceData().kind!=='character')throw new Error('skill_requires_hatched_pet');
 if(skill.assets?.base_appearance_id===current.id)return {mode:'ready',id};
 const guard=()=>{if(signal.aborted||runtime.closed||store.epoch()!==epoch)throw new Error('request_cancelled');if(store.currentAppearance().id!==current.id)throw new Error('stale_candidate');};
 const row=store.db.prepare('SELECT * FROM skill_material_jobs WHERE version_id=?').get(id);let input=row?JSON.parse(row.input):{base_version:current.id};
 if(row&&input.base_version!==current.id)throw new Error('stale_candidate');
 if(row&&['generating','interrupted_no_retry','failed_no_retry','rejected'].includes(row.state))throw new Error('skill_material_review_required');
 const state=value=>{guard();store.db.prepare('INSERT OR REPLACE INTO skill_material_jobs VALUES(?,?,?)').run(id,value,JSON.stringify(input));runtime.notify();};
 const ask=async(n,value,images)=>{guard();const r=await runtime.model(settings,prompt(n),JSON.stringify(value),{signal,images,maxOutputTokens:3600});guard();return parseAgentJSON(r.text);};
 const directory=require('../../../apps/desktop/paths.cjs').projectDirectory(root,path.join(path.dirname(store.filename),'appearances'));fs.mkdirSync(directory,{recursive:true});
 const bytes=fs.readFileSync(current.filename),image=(id,bytes)=>({id,dataUrl:'data:image/png;base64,'+bytes.toString('base64')});let phase='planning';
 try{
  const required=statuses.map(s=>'skill.'+id+'.'+s);
  if(!input.plan){state('planning');const raw=await ask('skill-action-plan',{skill:skill.payload,current_actions:store.appearanceData().actions,required_actions:required},[image('current',bytes)]);if(!Array.isArray(raw.poses)||raw.actions?.length!==5||raw.actions.some(a=>!required.includes(a.id)))throw new Error('invalid_skill_motion');input.plan=validatePlan(raw,{actions:[]},{availablePages:1,required});state('awaiting_materials');}
  if(!input.page){phase='generating';state('generating');const b=await runtime.imageGenerator(settings,{stage:'materials',request:{appearance_context:{skill:skill.payload},actions:input.plan.actions,page:0,slots:input.plan.poses}},bytes,{signal});guard();require('./appearance-material.cjs').inspectMaterial(b);const filename=path.join(directory,randomUUID()+'.png');fs.writeFileSync(filename,b,{flag:'wx'});input.page=path.relative(root,filename);state('awaiting_review');}
  phase='reviewing';if(!input.review){state('reviewing');input.review=await ask('skill-material-review',{skill:skill.payload,plan:input.plan},[image('current',bytes),image('materials',fs.readFileSync(path.join(root,input.page)))]);if(typeof input.review.accepted!=='boolean'||typeof input.review.reason!=='string'||!Array.isArray(input.review.action_checks)||required.some(id=>!input.review.action_checks.some(c=>c.id===id&&typeof c.accepted==='boolean'&&typeof c.reason==='string')))throw new Error('invalid_skill_material_review');state('awaiting_review');}
  if(!input.review.accepted||input.review.action_checks.some(x=>!x.accepted)){state('rejected');return {mode:'rejected',id};}
  const bindings=bindingsFor(input.plan),assets={base_appearance_id:current.id,material_pages:[input.page],actions:input.plan,pose_bindings:Object.fromEntries(statuses.map(s=>[s,bindings['skill.'+id+'.'+s]])),description:skill.payload.description};
  guard();store.transaction(()=>{store.db.prepare('INSERT OR REPLACE INTO skill_assets VALUES(?,?)').run(id,JSON.stringify(assets));state('ready');});runtime.notify();return {mode:'ready',id};
 }catch(error){if(!runtime.closed&&store.epoch()===epoch)store.db.prepare('INSERT OR REPLACE INTO skill_material_jobs VALUES(?,?,?)').run(id,phase==='generating'?'failed_no_retry':'pending',JSON.stringify(input));throw error;}
}
module.exports={prepareSkillMaterials};
