const fs = require('node:fs');
const path = require('node:path');
const {Store,text} = require('./store.cjs');
const {requestModel,inspectConnection,readProxyConfig} = require('./model.cjs');
const {maySend,selectBatch,validateAnalysis,withSystemEvidence} = require('./analysis.cjs');
const {FileObserver}=require('./file-observer.cjs');
const {prepareGrowth}=require('./growth.cjs');
const {WindowsObserver}=require('./windows-observer.cjs');
const {RawInputObserver}=require('./raw-input-observer.cjs');
const {AutoNap}=require('./auto-nap.cjs');
const {ScreenObserver}=require('./screen-observer.cjs');
const {consolidateSkills}=require('./skill-learning.cjs');
const {executeSkill}=require('./skill-execution.cjs');
const {generateAppearance,evolve}=require('./appearance.cjs');
const prompt = name => fs.readFileSync(path.join(__dirname,'../prompts',name + '.txt'),'utf8');
class Runtime {
  constructor(directory, {model = requestModel,imageGenerator=generateAppearance,actionMaterialPageLimit=()=>3,designRevisionLimit=0,changed = () => {},connectionInspector=inspectConnection,observerFactory=(...args)=>new WindowsObserver(...args),screenFactory=(...args)=>new ScreenObserver(...args),startObservers=true,observeForeground=false,screenshotOnly=false} = {}) {
    if(!Number.isInteger(designRevisionLimit)||designRevisionLimit<0||designRevisionLimit>2)throw new Error('invalid_design_revision_limit');
    this.store = new Store(directory); this.store.observeForeground = observeForeground; this.screenshotOnly = screenshotOnly;
    if(screenshotOnly) this.store.patchSettings({saveSystem:false,sendSystem:false}); this.model = model; this.changed = changed;
    if(!this.store.counts().observations&&!this.store.counts().completedJobs&&!this.store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get())this.store.db.prepare('INSERT INTO meta VALUES(?,?)').run('pet_origin',JSON.stringify({color:'ivory',selected:false}));
    this.active = null; this.closed = false;
    this.localProxy=new (require('./local-proxy.cjs').LocalProxy)(this.store);
    this.autoNap=new AutoNap(this);
    this.connectionInspector=connectionInspector;this.connectionState={status:'unchecked'};
    this.imageGenerator=imageGenerator;
    this.actionMaterialPageLimit=actionMaterialPageLimit;
    this.designRevisionLimit=designRevisionLimit;
    this.files=new FileObserver(this.store,()=>this.notify());
    this.system=observerFactory(this.store,()=>this.notify());
    this.screen=screenFactory(this.store,()=>this.notify());
    this.rawInput=new RawInputObserver(this.store,()=>this.notify());
    if(startObservers)this.startObservation();
  }
  canAnalyzeAutomatically(){
    if(!this.store.settings().modelEnabled)return false;
    try{readProxyConfig(this.store.settings().proxyConfig);return true;}catch{return false;}
  }
  startObservation() { this.files.start(); this.system.start(); this.screen.start(); this.rawInput.start(); }
  stopObservation() { this.system.stop(); this.screen.stop(); this.rawInput.stop(); this.files.stop(); }
  snapshot() {
    const origin=JSON.parse(this.store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get()?.value||'null');
    return {nap:this.autoNap.snapshot(),demoDataset:JSON.parse(this.store.db.prepare("SELECT value FROM meta WHERE key='demo_dataset'").get()?.value||'null'),settings:this.store.settings(),observations:this.store.observations(),jobs:this.store.jobs(),life:this.store.life(),appearance:{id:this.store.currentAppearance().id,origin,history:this.store.appearanceHistory().map(x=>({id:x.id,job_id:x.job_id,state:x.state,stage:x.payload.stage,parent_id:x.payload.parent_id,created_at:x.created_at,reason:x.payload.reason,actions:x.payload.actions?.actions}))},counts:this.store.counts(),dataEpoch:this.store.epoch(),watches:this.store.watches().map(({id,name,version,status})=>({id,name,version,status})),system:this.system?.snapshot()||{status:'off'},screen:this.screen?.snapshot()||{status:'off'},connection:this.connectionState,busy:this.active?.kind || null,pending:this.store.pendingCount()};
  }
  notify() { if (!this.closed) this.changed(this.snapshot()); }
  cancel() { this.active?.controller.abort(); }
  settings(patch) {
    if(patch&&Object.keys(patch).length===1&&Object.hasOwn(patch,'petScale')){const value=this.store.patchSettings(patch);this.notify();return value;}
    if(patch&&Object.keys(patch).length&&Object.keys(patch).every(key=>['adaptiveNapEnabled','naturalNapEnabled','autoNapEnabled','autoNapStart','autoNapEnd'].includes(key))){
      if(!Object.hasOwn(patch,'adaptiveNapEnabled')&&['autoNapStart','autoNapEnd'].some(key=>Object.hasOwn(patch,key)))patch={...patch,adaptiveNapEnabled:false};
      const next={...this.store.settings(),...patch};
      if(next.autoNapEnabled&&(!next.autoNapStart||!next.autoNapEnd||next.autoNapStart===next.autoNapEnd))throw new Error('invalid_nap_window');
      const value=this.store.patchSettings(patch);this.notify();return value;
    }
    // Any permission/configuration change invalidates the in-flight request.
    if(this.screenshotOnly && (Object.hasOwn(patch,'saveSystem') || Object.hasOwn(patch,'sendSystem'))) patch={...patch,saveSystem:false,sendSystem:false};
    this.cancel(); const value = this.store.patchSettings(patch);if(['model','modelEnabled','proxyConfig'].some(key=>Object.hasOwn(patch,key)))this.connectionState={status:'unchecked'};this.files.stop();this.files.start();if(['saveSystem','systemApps'].some(key=>Object.hasOwn(patch,key))){this.system.stop();this.system.start();}if(Object.hasOwn(patch,'saveScreenshots')){this.screen.stop();this.screen.start();} if(Object.hasOwn(patch,'saveRawInput')){if(value.saveRawInput)this.rawInput.start();else this.rawInput.stop();} this.notify(); return value;
  }
  async checkConnection() {
    return this.withRequest('connection',async signal=>{
      try{const result=await this.connectionInspector(this.store.settings(),{signal});if(signal.aborted||this.closed)throw new Error('request_cancelled');this.connectionState=result;return result;}
      catch(error){this.connectionState={status:'unavailable'};throw error;}
    });
  }
  watchFile(filename) {const id=this.files.add(filename);this.notify();return id;}
  unwatchFile(id) {this.cancel();this.files.detach(id);this.store.removeWatch(id);this.notify();}
  note(content) { const row = this.store.add('manual_note','user',content); this.notify(); return row; }
  chooseEgg(choice){
    if(this.active)throw new Error('request_in_progress');
    const origin=JSON.parse(this.store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get()?.value||'null');
    if(!origin||origin.selected||!this.store.currentAppearance().id.startsWith('egg_')||this.store.jobs().length)throw new Error('egg_selection_closed');
    if(typeof choice==='string')choice={color:choice,style:'soft'};
    if(!choice||Array.isArray(choice)||typeof choice!=='object'||Object.keys(choice).some(k=>!['color','style'].includes(k)))throw new Error('invalid_egg_selection');
    const {color,style='soft'}=choice,{eggAsset}=require('./egg.cjs');eggAsset(path.dirname(this.store.filename),color,style);
    this.store.transaction(()=>{const latest=JSON.parse(this.store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get().value);if(latest.selected)throw new Error('egg_selection_closed');this.store.db.prepare('UPDATE meta SET value=? WHERE key=?').run(JSON.stringify({color,style,selected:true,selected_at:new Date().toISOString()}),'pet_origin');});
    this.notify();return this.snapshot().appearance;
  }
  remove(id) { this.cancel(); this.store.deleteObservation(id); this.notify(); }
  clear() { this.cancel();this.system.stop();this.screen.stop();this.screen.useMs=0;this.store.patchSettings({saveSystem:false,saveScreenshots:false,saveRawInput:false});this.rawInput.stop();this.files.stop(); this.store.clear(); this.notify(); }
  async withRequest(kind, fn) {
    if (this.active) throw new Error('request_in_progress');
    const task = {kind,controller:new AbortController()}; this.active = task; this.notify();
    try {
      if(kind==='chatgpt-binding'||this.chatgpt?.snapshot())return await fn(task.controller.signal);
      return await this.localProxy.run(task.controller.signal,()=>fn(task.controller.signal));
    }
    finally { if (this.active === task) this.active = null; this.notify(); }
  }
  async chat(content) {
    content = text(content);
    if (this.active) throw new Error('request_in_progress');
    const settings = this.store.settings(),epoch = this.store.epoch();
    // History is captured before adding the current message so it is sent once.
    const history = this.store.observations(12).filter(row => row.source === 'pet_chat' && maySend(row,settings));
    if (settings.saveChat) this.store.add('pet_chat','user',content);
    this.notify();
    if (!settings.modelEnabled || !settings.sendChat) return {mode:'local',text:'我在这里陪你。现在还没开启模型聊天；你可以在设置中决定是否把聊天交给模型。'};
    return this.withRequest('chat', async signal => {
      const input = JSON.stringify({history:selectBatch(history,settings,{maxBytes:12000}),message:content,pet_memory:this.store.modelLifeContext(settings).entries.slice(0,6)});
      const response = await this.model(settings,prompt('chat'),input,{signal});
      if (signal.aborted || this.closed || epoch !== this.store.epoch()) throw new Error('request_cancelled');
      if (settings.saveChat) this.store.add('pet_chat','assistant',text(response.text));
      return {mode:'model',text:response.text,usage:response.usage};
    });
  }
  async sleep({analyze=true,automatic=false,deferImages=false}={}) {
    if (this.active) throw new Error('request_in_progress');
    this.rawInput.flush();
    this.store.patchSettings({resting:true}); this.notify();
    if(!analyze)return {mode:'rest',message:'先打个小盹。这次只休息。'};
    const origin=JSON.parse(this.store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get()?.value||'null');
    if(origin&&!origin.selected)return {mode:'rest',message:'先选一颗属于你的蛋吧，领取后再一起积累成长。'};
    const settings = this.store.settings(),context=this.store.modelLifeContext(settings),contextAliases=require('./context-aliases.cjs').aliasLifeContext(context);
    const instructions=prompt('sleep')+(context.entries.length||context.skills.length?'\n既有记忆与固定技能版本（只用于本轮整理，不用于独立前缀预测；entry_id 引用 m 开头的短标识，related_skill_id 引用 s 开头的短标识）：'+JSON.stringify(contextAliases.presented):'');
    const rows = selectBatch(withSystemEvidence(this.store,this.store.modelPending(settings,{automatic})),settings,{maxBytes:Math.min(28000,35000-Buffer.byteLength(instructions))});
    const resume=this.store.pendingPhase({automatic});
    const growthResume=settings.modelEnabled&&settings.imageGeneration&&this.store.jobs().find(j=>['awaiting_image_generation','awaiting_review',...(automatic?[]:['judgment_failed'])].includes(j.growth_state)&&this.store.jobRows(j.id).every(r=>maySend(r,settings)));
    if(growthResume)return this.withRequest('growth',async signal=>{await evolve(this,growthResume.id,{signal,deferImages});return {mode:'resumed',id:growthResume.id,message:'接着把上次的成长收好啦。'};});
    if(settings.modelEnabled&&!rows.length&&resume&&this.store.jobRows(resume).every(r=>maySend(r,settings)))return this.withRequest('sleep',async signal=>{await consolidateSkills(this,resume,{signal});return {mode:'resumed',id:resume,message:'上次没整理完的部分接着收好啦。'};});
    if (!rows.length) return {mode:'rest',message:'先打个小盹。没有需要且获准分析的新内容，这次只休息。'};
    return this.withRequest('sleep',async signal => {
      const epoch = this.store.epoch(),id = this.store.startJob(rows);
      try {
        const aliases=new Map(rows.map((row,i)=>['e'+String(i+1).padStart(2,'0'),row.id]));
        const presented=rows.map((row,i)=>({...row,id:'e'+String(i+1).padStart(2,'0')}));
        const images=[],seen=new Set();
        for(const [i,row] of rows.entries())if(row.source==='system_screenshot'&&!seen.has(row.metadata.screenshot.hash)){const dataUrl=this.store.readScreenshot(row.id);images.push({id:presented[i].id,dataUrl});seen.add(row.metadata.screenshot.hash);}
        const response = await this.model(settings,instructions,JSON.stringify(presented),{signal,images});
        if (signal.aborted || this.closed || epoch !== this.store.epoch()) throw new Error('request_cancelled');
        const result = validateAnalysis(response.text,presented);
        require('./context-aliases.cjs').restoreContextLinks(result,contextAliases);
        for(const field of ['experiences','user_understanding','workflow_candidates','skill_candidates'])for(const entry of result[field])entry.source_refs=entry.source_refs.map(ref=>aliases.get(ref));
        const growth=prepareGrowth(this.store.db.prepare("SELECT value FROM meta WHERE key='pet_origin'").get()?{...result,growth:{...result.growth,should_change:true}}:result,path.resolve(__dirname,'../../..'),this.store.currentAppearance());
        this.store.transaction(()=>{
          if (!this.store.finishJob(id,{status:'completed',result,usage:response.usage},epoch)) throw new Error('stale_analysis');
          if(growth)this.store.addGrowthRequest(id,growth);
          this.store.linkDependencies(id,context);
          this.store.addLife(id,result);
        });
        try{await consolidateSkills(this,id,{signal});}catch(error){if(signal.aborted)throw error;/* Independent phase remains resumable; base evidence is committed. */}
        if(settings.imageGeneration)try{await evolve(this,id,{signal,deferImages});}catch(error){if(signal.aborted)throw error;}
        return {mode:'analyzed',id,message:'这一小段经历整理好啦，放在成长页等你来看。'};
      } catch (error) {
        if (!this.closed&&this.store.db.prepare('SELECT status FROM jobs WHERE id=?').get(id)?.status!=='completed') this.store.finishJob(id,{status:signal.aborted ? 'cancelled' : 'failed',error:signal.aborted ? 'cancelled' : 'analysis_failed'},epoch);
        throw error;
      }
    });
  }
  async prepareSkill(id){if(this.active)throw new Error('request_in_progress');this.rawInput.flush();
    this.store.patchSettings({resting:true});return this.withRequest('skill-materials',signal=>require('./skill-materials.cjs').prepareSkillMaterials(this,id,{signal}));}
  async useSkill({id,goal,resumeTaskId=null}){if(this.active)throw new Error('request_in_progress');this.store.patchSettings({resting:false});return this.withRequest('task',signal=>executeSkill(this,id,goal,{signal,resumeTaskId}));}
  async continueGrowth(id,{reconcileMaterials=false,reviewOnly=false,recheckCandidate=false}={}){if(!this.store.jobRows(id).length||!this.store.jobRows(id).every(r=>maySend(r,this.store.settings())))throw new Error('growth_source_not_authorized');return this.withRequest('growth',signal=>evolve(this,id,{signal,reconcileMaterials,reviewOnly,recheckCandidate}));}
  wake() { this.autoNap.finish(); this.cancel(); this.store.patchSettings({resting:false}); this.notify(); }
  close() { this.closed = true; this.autoNap.finish(); this.chatgpt?.close(); this.stopObservation(); this.cancel(); this.localProxy.close(); this.store.close(); }
}
module.exports = {Runtime};
