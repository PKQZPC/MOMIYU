const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {readProxyConfig}=require('./model.cjs');
const {projectDirectory}=require('../../../apps/desktop/paths.cjs');
const {parseAgentJSON}=require('./agent-json.cjs');
const {validateCharacterReview}=require('./character-review.cjs');
const {validateDesignConcept,designReferences}=require('./character-design.cjs');
const root=path.resolve(__dirname,'../../..');
async function generateAppearance(settings,input,currentBytes,{signal,historicalBytes=[],previousCandidateBytes,fetchImpl=fetch,readConfig=readProxyConfig,onUsage}={}){
 if(!settings.modelEnabled||!settings.imageGeneration)throw new Error('image_generation_disabled');
 const config=readConfig(settings.proxyConfig),form=new FormData();
 const design=input.request.delivery_requirements?.canvas==='1024×1024 PNG',canvasSize=design?'1024x1024':'1536x1024';
 const promptFile=input.stage==='materials'?'action-materials.txt':input.design_concept?'image-render.txt':'image-agent.txt';
 const renderRequest=input.design_concept?{design:input.design_concept.render_prompt,visual_references:input.request.visual_references.filter(x=>['image_current',...(historicalBytes.length?['image_historical']:[]),...(previousCandidateBytes?['image_previous_candidate']:[])].includes(x.image_id)),delivery_requirements:input.request.delivery_requirements}:input.request;
 const attachmentOrder=input.design_concept?'\n图片附件按顺序为：image_current（当前形象）'+(historicalBytes.length?'、image_historical（历史形象）':'')+(previousCandidateBytes?'、image_previous_candidate（未采用候选）':'')+'。':'';
 for(const [key,value] of Object.entries({model:'gpt-image-1.5',prompt:fs.readFileSync(path.join(__dirname,'../prompts',promptFile),'utf8')+'\n'+JSON.stringify(renderRequest)+attachmentOrder,size:canvasSize,quality:'low',background:'transparent',n:'1'}))form.set(key,value);
 form.append('image[]',new Blob([currentBytes],{type:'image/png'}),'image_current.png');
 for(const bytes of historicalBytes.slice(0,1))form.append('image[]',new Blob([bytes],{type:'image/png'}),'image_historical.png');
 if(previousCandidateBytes)form.append('image[]',new Blob([previousCandidateBytes],{type:'image/png'}),'image_previous_candidate.png');
 const response=await fetchImpl(config.baseURL+'/images/edits',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.apiKey}`},body:form,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(240000)]):AbortSignal.timeout(240000)});
 if(!response.ok)throw new Error('image_http_'+response.status);
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1048576)throw new Error('image_response_too_large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(result.data?.length!==1||typeof result.data[0].b64_json!=='string')throw new Error('invalid_generated_image');
 const bytes=Buffer.from(result.data[0].b64_json,'base64');
 if(bytes.length>4*1048576||bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)<512||bytes.readUInt32BE(20)<512||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>5000000||![4,6].includes(bytes[25]))throw new Error('invalid_generated_image');onUsage?.(result.usage);return bytes;
}
async function evolve(runtime,jobId,{signal,reconcileMaterials=false,reviewOnly=false,recheckCandidate=false,deferImages=false}){
 if(runtime.store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get())return require('./lifecycle-evolution.cjs').evolveLifecycle(runtime,jobId,{signal,reconcileMaterials,reviewOnly,recheckCandidate,deferImages});
 if(reviewOnly)throw new Error('review_only_requires_lifecycle_profile');
 const store=runtime.store,settings=store.settings(),epoch=store.epoch();if(!settings.imageGeneration)return;
 let row=store.db.prepare('SELECT * FROM growth_requests WHERE job_id=?').get(jobId);
 if(!row||!['awaiting_image_generation','judgment_failed','awaiting_review'].includes(row.state))return;
 const guard=()=>{if(signal.aborted||runtime.closed||epoch!==store.epoch())throw new Error('request_cancelled');};
 const setState=(state,input)=>{store.db.prepare('UPDATE growth_requests SET state=?,input=? WHERE job_id=?').run(state,JSON.stringify(input),jobId);runtime.notify();};
 let input=JSON.parse(row.input),stage='judging_growth';
 try{
  if(row.state!=='awaiting_review'){
   const context=require('./growth-context.cjs').growthContext(store,jobId,settings);input=context.input;
   setState('judging_growth',input);
   const response=await runtime.model(settings,fs.readFileSync(path.join(__dirname,'../prompts/growth-judge.txt'),'utf8'),JSON.stringify(context.judgment),{signal,images:context.references.map(x=>({id:x.id,dataUrl:'data:image/png;base64,'+x.bytes.toString('base64')}))});guard();
   const judgment=parseAgentJSON(response.text);
   if(typeof judgment.should_change!=='boolean'||typeof judgment.reason!=='string'||!judgment.reason.trim()||judgment.reason.length>3000)throw new Error('invalid_growth_judgment');
   input.growth_judgment={should_change:judgment.should_change,reason:judgment.reason,usage:response.usage};
   for(const parent of context.parents)store.db.prepare('INSERT OR IGNORE INTO job_dependencies VALUES(?,?)').run(jobId,parent);
   if(!judgment.should_change){setState('accumulating',input);return {mode:'accumulating'};}
   input.request.growth_context=judgment.reason;
   input.base_version=store.currentAppearance().id;
   input.skill_context=store.lifeContext(settings).skills.filter(x=>x.assets).map(x=>({id:x.id,name:x.payload.name,motion:x.assets}));
   stage='planning_design';setState('planning_design',input);const references=designReferences(input,context.references[0].bytes);
   const conceptResult=await runtime.model(settings,fs.readFileSync(path.join(__dirname,'../prompts/character-design.txt'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../prompts/image-agent.txt'),'utf8'),JSON.stringify(input.request),{signal,images:references.map(x=>({id:x.id,dataUrl:'data:image/png;base64,'+x.bytes.toString('base64'),detail:x.detail})),maxOutputTokens:4000});guard();input.design_concept=validateDesignConcept(parseAgentJSON(conceptResult.text));
   if(deferImages){setState('awaiting_image_generation',input);return {mode:'awaiting_image_generation'};}
   stage='generating';setState('generating',input);
   const bytes=await runtime.imageGenerator(settings,input,context.references[0].bytes,{signal,historicalBytes:context.references.slice(1).map(x=>x.bytes)});guard();
   input.material_check=require('./appearance-material.cjs').inspectMaterial(bytes);
   const directory=projectDirectory(root,path.join(path.dirname(store.filename),'appearances'));fs.mkdirSync(directory,{recursive:true});const id=randomUUID(),filename=path.join(directory,id+'.png');fs.writeFileSync(filename,bytes,{flag:'wx'});
   input.candidate_id=id;
   store.transaction(()=>{store.db.prepare('INSERT INTO appearance_versions VALUES(?,?,?,?,?)').run(id,jobId,'candidate',path.relative(root,filename),JSON.stringify({reason:'候选素材已保存，等待检查。',sleep_frame:0}));store.db.prepare('UPDATE growth_requests SET state=?,input=? WHERE job_id=?').run('awaiting_review',JSON.stringify(input),jobId);});runtime.notify();
  }
  stage='reviewing';
  const current=store.currentAppearance();
  if(input.base_version!==current.id){setState('stale_candidate',input);return {mode:'stale_candidate'};}
  const candidate=store.db.prepare('SELECT * FROM appearance_versions WHERE id=? AND job_id=?').get(input.candidate_id,jobId);if(!candidate)throw new Error('missing_appearance_candidate');
  setState('reviewing',input);
  const original=fs.readFileSync(current.filename),bytes=fs.readFileSync(path.join(root,candidate.path));
  input.candidate_motion=input.candidate_motion||{};
  for(const skill of input.skill_context||[])if(!input.candidate_motion[skill.id]){
   const response=await runtime.model(settings,fs.readFileSync(path.join(__dirname,'../prompts/skill-motion.txt'),'utf8'),JSON.stringify({skill:{name:skill.name,description:skill.motion.description}}),{signal,images:[{id:'candidate_pet_poses',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]});guard();const motion=parseAgentJSON(response.text);
   if(!Number.isFinite(motion.fps)||motion.fps<1||motion.fps>12||typeof motion.description!=='string'||motion.description.length>1000||['startup','running','success','failed','cancelled'].some(k=>!Array.isArray(motion[k])||motion[k].length<2||motion[k].length>12||motion[k].some(n=>!Number.isInteger(n)||n<0||n>5)))throw new Error('invalid_skill_motion');
   input.candidate_motion[skill.id]=motion;setState('reviewing',input);
  }
  const job=store.jobs().find(x=>x.id===jobId),pet=store.life().entries.find(x=>x.kind==='pet');
  const historical=input.attachments?.find(x=>x.image_id==='image_historical');
  const review=validateCharacterReview(parseAgentJSON((await runtime.model(settings,fs.readFileSync(path.join(__dirname,'../prompts/appearance-review.txt'),'utf8'),JSON.stringify({experiences:input.request.experiences,growth_context:input.request.growth_context,pet_context:input.request.pet_context,visual_references:[...input.request.visual_references,{image_id:'image_candidate',role:'candidate_form',description:'本轮候选图集。'}],skill_context:(input.skill_context||[]).map(x=>({...x,motion:input.candidate_motion[x.id]})),current_name:pet?.payload.name||'MOMIYU',proposed_name:job.result.pet_update?.name}),{signal,images:[{id:'image_current',dataUrl:'data:image/png;base64,'+original.toString('base64')},...(historical?[{id:'image_historical',dataUrl:'data:image/png;base64,'+fs.readFileSync(path.join(root,historical.relative_path)).toString('base64')}]:[]),{id:'image_candidate',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]})).text));guard();
  if(typeof review.accepted!=='boolean'||typeof review.compatible_skills!=='boolean'||typeof review.reason!=='string'||review.reason.length>3000||!Number.isInteger(review.sleep_frame)||review.sleep_frame<0||review.sleep_frame>5||(review.name!==undefined&&(typeof review.name!=='string'||!review.name.trim()||review.name.length>40)))throw new Error('invalid_appearance_review');
  const bindings=review.actions?.bindings;
  const validBinding=b=>b&&((Number.isInteger(b.pose)&&b.pose>=0&&b.pose<6)||(b.asset==='sample_sleep'&&bytes.equals(original)&&current.id==='sample_appearance_v1'));
  const actionsReady=bindings&&['base.idle','base.greet','sleep.rest','sleep.wake'].every(k=>validBinding(bindings[k]))&&!(bindings['sleep.rest'].pose!==undefined&&bindings['sleep.rest'].pose===bindings['sleep.wake'].pose);
  const accepted=review.accepted&&review.compatible_skills&&!!actionsReady;
  const needsMaterials=review.accepted&&review.compatible_skills&&!actionsReady;
  store.transaction(()=>{
   store.db.prepare('UPDATE appearance_versions SET state=?,payload=? WHERE id=?').run(accepted?'active':needsMaterials?'candidate':'rejected',JSON.stringify({...review,skill_assets:input.candidate_motion}),candidate.id);
   store.db.prepare('UPDATE growth_requests SET state=? WHERE job_id=?').run(accepted?'published':needsMaterials?'awaiting_materials':'rejected',jobId);
   if(accepted&&review.name)store.db.prepare('INSERT INTO life_entries VALUES(?,?,?,?)').run(randomUUID(),jobId,'pet',JSON.stringify({name:review.name,personality:pet?.payload.personality||job.result.pet_update?.personality||'慢慢形成自己的个性。',reason:review.reason}));
  });runtime.notify();return {mode:accepted?'published':needsMaterials?'awaiting_materials':'rejected'};
 }catch(error){
  if(!runtime.closed&&epoch===store.epoch())setState(stage==='generating'?'failed_no_retry':stage==='reviewing'?'awaiting_review':'judgment_failed',input);
  throw error;
 }
}
module.exports={generateAppearance,evolve};
