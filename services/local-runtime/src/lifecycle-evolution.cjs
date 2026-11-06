const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {parseAgentJSON}=require('./agent-json.cjs');
const {decode}=require('../../../packages/pet-runtime/png.cjs');
const {validatePlan,bindingsFor}=require('./action-contract.cjs');
const {POLICY,validateCharacterReview}=require('./character-review.cjs');
const {validateDesignConcept,designReferences}=require('./character-design.cjs');
const root=path.resolve(__dirname,'../../..');
const prompt=name=>fs.readFileSync(path.join(__dirname,'../prompts',name+'.txt'),'utf8');
const image=(id,bytes)=>({id,dataUrl:'data:image/png;base64,'+bytes.toString('base64')});
async function evolveLifecycle(runtime,jobId,{signal,reconcileMaterials=false,reviewOnly=false,recheckCandidate=false,deferImages=false}){
 const store=runtime.store,settings=store.settings(),epoch=store.epoch();let row=store.db.prepare('SELECT * FROM growth_requests WHERE job_id=?').get(jobId);
 if(!settings.imageGeneration||!row||!['awaiting_image_generation','judgment_failed','awaiting_review','awaiting_materials',...(reviewOnly||recheckCandidate?['rejected']:[])].includes(row.state))return;
 let input=JSON.parse(row.input),stage='judging_growth';
 const guard=()=>{if(signal.aborted||runtime.closed||store.epoch()!==epoch)throw new Error('request_cancelled');};
 const state=value=>{guard();store.db.prepare('UPDATE growth_requests SET state=?,input=? WHERE job_id=?').run(value,JSON.stringify(input),jobId);runtime.notify();};
 const ask=async(name,value,images)=>{guard();const r=await runtime.model(settings,prompt(name),JSON.stringify(value),{signal,images,maxOutputTokens:name==='action-plan'?6000:name==='action-reconcile'?3600:2200});guard();return parseAgentJSON(r.text);};
 const check=r=>{if(typeof r.accepted!=='boolean'||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>3000)throw new Error('invalid_lifecycle_review');return r;};
 try{
  if(!input.lifecycle?.judged){const context=require('./growth-context.cjs').growthContext(store,jobId,settings);input=context.input;input.lifecycle={base_version:store.currentAppearance().id,pages:[],reviews:[]};state('judging_growth');
   const judgment=await ask('growth-judge',context.judgment,context.references.map(x=>image(x.id,x.bytes)));if(typeof judgment.should_change!=='boolean'||typeof judgment.reason!=='string'||!judgment.reason.trim())throw new Error('invalid_growth_judgment');
   input.growth_judgment=judgment;input.lifecycle.judged=true;for(const parent of context.parents)store.db.prepare('INSERT OR IGNORE INTO job_dependencies VALUES(?,?)').run(jobId,parent);
   if(!judgment.should_change){state('accumulating');return {mode:'accumulating'};}input.request.growth_context=judgment.reason;
  }
  const l=input.lifecycle,current=store.currentAppearance();if(l.base_version!==current.id){state('stale_candidate');return {mode:'stale_candidate'};}
  const currentBytes=fs.readFileSync(current.filename),currentData=store.appearanceData(),directory=path.join(path.dirname(store.filename),'appearances');fs.mkdirSync(directory,{recursive:true});
  const persist=(bytes)=>{const filename=path.join(directory,randomUUID()+'.png');fs.writeFileSync(filename,bytes,{flag:'wx'});return path.relative(root,filename);};
  const read=p=>fs.readFileSync(path.join(root,p));
  if(!l.design){if(reviewOnly)throw new Error('review_only_requires_saved_design');input.request.delivery_requirements={purpose:'形象设计参考图',canvas:'1024×1024 PNG',composition:'单个完整角色，四周留空，完整展示本轮设计。',background:'透明背景。'};
   const references=designReferences(input,currentBytes);
   if(!l.design_concept){stage='planning_design';state('planning_design');const result=await runtime.model(settings,prompt('character-design')+'\n'+prompt('image-agent'),JSON.stringify(input.request),{signal,images:references.map(x=>({...image(x.id,x.bytes),detail:x.detail})),maxOutputTokens:4000});guard();l.design_concept=validateDesignConcept(parseAgentJSON(result.text),{revision:!!input.request.task.previous_candidate_review});l.design_concept_usage=result.usage;l.design_reference_ids=references.map(x=>x.id);state('awaiting_image_generation');}
   if(deferImages){state('awaiting_image_generation');return {mode:'awaiting_image_generation'};}
   stage='generating';state('generating');const history=references.find(x=>x.id==='image_historical'),previous=references.find(x=>x.id==='image_previous_candidate');
   const bytes=await runtime.imageGenerator(settings,{...input,design_concept:l.design_concept},currentBytes,{signal,historicalBytes:history?[history.bytes]:[],previousCandidateBytes:previous?.bytes});guard();const png=decode(bytes);if(png.width<512||png.height<512)throw new Error('invalid_design_dimensions');l.design_dimensions={width:png.width,height:png.height};l.design=persist(bytes);state('awaiting_review');
  }
  const design=read(l.design);stage='reviewing';
  if(l.design_review?.policy_version!==POLICY){
   if(l.design_review)(l.prior_design_reviews||=[]).push(l.design_review);state('reviewing');
   const historic=input.attachments.find(x=>x.image_id==='image_historical'),reviewImages=[...(historic?[image('image_historical',read(historic.relative_path))]:[]),{...image('image_current',currentBytes),detail:'high'},{...image('image_candidate',design),detail:'high'}];
   l.design_review=validateCharacterReview(await ask('lifecycle-review',{mode:'design',comparison_base_version:current.id,design_concept:l.design_concept?{concept:l.design_concept.concept,experience_basis:l.design_concept.experience_basis,continuity:l.design_concept.continuity}:undefined,task:{kind:input.request.task.kind,development_context:input.request.task.development_context},experiences:input.request.experiences,pet_context:input.request.pet_context,growth_context:input.request.growth_context,visual_references:[...input.request.visual_references.filter(x=>x.role!=='previous_candidate'),{image_id:'image_candidate',role:'candidate_form',description:'本轮待检查的设计候选。'}],current_name:store.life().entries.find(x=>x.kind==='pet')?.payload.name||'MOMIYU',proposed_name:store.jobs().find(x=>x.id===jobId)?.result.pet_update?.name},reviewImages));state('awaiting_review');
  }
  if(!l.design_review.accepted){state('rejected');if(!reviewOnly&&(input.automatic_design_revisions||0)<runtime.designRevisionLimit){input.automatic_design_revisions=(input.automatic_design_revisions||0)+1;state('rejected');require('./design-revision.cjs').reviseRejectedDesign(store,jobId,'Bounded character Agent revision from actual candidate, previous concept and contextual review.');return evolveLifecycle(runtime,jobId,{signal,reconcileMaterials:false,reviewOnly:false});}return {mode:'rejected'};}
  if(reviewOnly){state('awaiting_review');return {mode:'reviewed'};}
  if(!l.plan){const skills=store.lifeContext(settings).skills.filter(x=>x.assets).slice(0,2).map(x=>({id:x.id,name:x.payload.name,description:x.payload.description}));l.skills=skills;const maxPages=runtime.actionMaterialPageLimit();if(!Number.isInteger(maxPages)||maxPages<1||maxPages>3)throw new Error('invalid_material_budget');l.plan=validatePlan(await ask('action-plan',{current_actions:currentData.actions,candidate_context:{experiences:input.request.experiences,pet_context:input.request.pet_context},skills,delivery_budget:{max_pages:maxPages,slots_per_page:6}},[image('current',currentBytes),image('candidate',design)]),currentData.actions);if(l.plan.pages>maxPages)throw new Error('action_plan_exceeds_budget');if(skills.some(s=>['startup','running','success','failed','cancelled'].some(status=>!l.plan.actions.some(a=>a.id==='skill.'+s.id+'.'+status))))throw new Error('missing_skill_action');state('awaiting_materials');}
  if(reconcileMaterials&&l.pages.length&&l.reviews.some(r=>!r.accepted||r.action_checks.some(c=>!c.accepted))){
   if(l.pages.length>2||l.reconciled)throw new Error('material_reconciliation_unavailable');stage='reviewing';state('reviewing');
   const alignment=await ask('action-reconcile',{scope:'只核对四项必要基础动作及已有可用技能；未发布的其他可选动作可以留待后续，不要求全部实现。',current_actions:currentData.actions,planned_actions:l.plan,material_reviews:l.reviews,pet_context:input.request.pet_context,required_skills:l.skills},l.pages.map((p,i)=>image('page_'+i,read(p))));
   if(typeof alignment.accepted!=='boolean'||typeof alignment.reason!=='string'||!Array.isArray(alignment.observed_poses)||alignment.observed_poses.length!==l.pages.length*6||new Set(alignment.observed_poses.map(p=>p.index)).size!==l.pages.length*6||alignment.observed_poses.some(p=>!Number.isInteger(p.index)||p.index<0||p.index>=l.pages.length*6||typeof p.description!=='string'))throw new Error('invalid_action_reconciliation');
   l.reconciliation=alignment;state('awaiting_materials');if(!alignment.accepted)return {mode:'awaiting_materials'};
   const plan=validatePlan(alignment.plan,currentData.actions,{availablePages:l.pages.length});
   if((l.skills||[]).some(s=>['startup','running','success','failed','cancelled'].some(status=>!plan.actions.some(a=>a.id==='skill.'+s.id+'.'+status))))throw new Error('missing_skill_action');
   l.original_plan=l.plan;l.original_material_reviews=l.reviews;l.original_package_review=l.package_review;delete l.package_review;l.plan=plan;l.reviews=[];l.reconciled=true;state('awaiting_materials');
  }
  for(let page=0;page<l.plan.pages;page++){
   const actions=l.plan.actions.filter(a=>a.frames.some(n=>Math.floor(n/6)===page));
   if(!l.pages[page]){stage='generating';state('generating');const request={appearance_context:{experiences:input.request.experiences,pet_context:input.request.pet_context},actions,page,slots:Array.from({length:6},(_,i)=>({index:page*6+i,description:l.plan.poses?.find(p=>p.index===page*6+i)?.description}))};
    const bytes=await runtime.imageGenerator(settings,{system_prompt:{relative_path:'services/local-runtime/prompts/action-materials.txt'},request,stage:'materials'},design,{signal});guard();require('./appearance-material.cjs').inspectMaterial(bytes);l.pages[page]=persist(bytes);state('awaiting_materials');}
   if(!l.reviews[page]){stage='reviewing';state('reviewing');const review=check(await ask('lifecycle-review',{mode:'materials',page,slots:Array.from({length:6},(_,i)=>page*6+i),actions:actions.map(a=>({...a,frames:a.frames.filter(n=>Math.floor(n/6)===page),sequence_scope:'本页可见的局部姿态；跨页衔接另行核对。'}))},[image('design',design),image('materials',read(l.pages[page]))]));
    if(!Array.isArray(review.action_checks)||actions.some(a=>!review.action_checks.some(c=>c.id===a.id&&typeof c.accepted==='boolean'&&typeof c.reason==='string')))throw new Error('missing_action_checks');l.reviews[page]=review;state('awaiting_materials');}
  }
  const pageDisagreement=l.reviews.some(r=>!r.accepted||r.action_checks.some(c=>!c.accepted));
  if((pageDisagreement||l.pages.length>1)&&!l.package_review){
   if(l.pages.length>2)throw new Error('package_review_too_many_pages');stage='reviewing';state('reviewing');
   const review=check(await ask('action-package-review',{plan:l.plan,current_actions:currentData.actions,page_reviews:l.reviews,design_review:l.design_review,required_skills:l.skills},l.pages.map((p,i)=>image('page_'+i,read(p)))));
   if(!Array.isArray(review.action_checks)||l.plan.actions.some(a=>!review.action_checks.some(c=>c.id===a.id&&typeof c.accepted==='boolean'&&typeof c.reason==='string')))throw new Error('missing_package_action_check');l.package_review=review;state('awaiting_materials');
  }
  if(l.package_review?(!l.package_review.accepted||l.package_review.action_checks.some(c=>!c.accepted)):pageDisagreement){state('awaiting_materials');return {mode:'awaiting_materials'};}
  const id=randomUUID(),actions={schema_version:2,bindings:bindingsFor(l.plan),actions:l.plan.actions,missing:[]},pet=store.life().entries.find(x=>x.kind==='pet'),name=l.design_review.name||pet?.payload.name||'MOMIYU';if(typeof name!=='string'||!name.trim()||name.length>40)throw new Error('invalid_pet_name');
  const payload={reason:l.design_review.reason,design_concept:l.design_concept,character_review:l.design_review,stage:current.id.startsWith('egg_')?'juvenile':'evolved',parent_id:current.id,design_path:l.design,material_pages:l.pages,actions,action_reviews:l.reviews,package_review:l.package_review,skill_assets:Object.fromEntries((l.skills||[]).map(s=>[s.id,{...store.skill(s.id).assets,base_appearance_id:id,material_pages:l.pages,description:s.description,fps:4,pose_bindings:Object.fromEntries(['startup','running','success','failed','cancelled'].map(status=>[status,actions.bindings['skill.'+s.id+'.'+status]]))}]))};
  guard();store.transaction(()=>{if(store.currentAppearance().id!==l.base_version)throw new Error('stale_candidate');store.db.prepare('INSERT INTO appearance_versions VALUES(?,?,?,?,?)').run(id,jobId,'active',l.design,JSON.stringify(payload));if(current.id.startsWith('egg_'))store.db.prepare("INSERT OR REPLACE INTO meta VALUES('pending_hatch',?)").run(JSON.stringify({id,name}));store.db.prepare('UPDATE growth_requests SET state=?,input=? WHERE job_id=?').run('published',JSON.stringify(input),jobId);if(name!==pet?.payload.name)store.db.prepare('INSERT INTO life_entries VALUES(?,?,?,?)').run(randomUUID(),jobId,'pet',JSON.stringify({name,personality:pet?.payload.personality||'',reason:l.design_review.reason}));});runtime.notify();return {mode:'published'};
 }catch(error){if(!runtime.closed&&epoch===store.epoch()){const failed=stage==='generating'?'failed_no_retry':stage==='reviewing'?'awaiting_review':'judgment_failed';store.db.prepare('UPDATE growth_requests SET state=?,input=? WHERE job_id=?').run(failed,JSON.stringify(input),jobId);runtime.notify();}throw error;}
}
module.exports={evolveLifecycle};
