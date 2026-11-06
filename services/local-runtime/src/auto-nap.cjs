function napWindow(now,start,end){
  if(!start||!end||start===end)return null;
  const time=now.getHours()*60+now.getMinutes();
  const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
  const first=minutes(start),last=minutes(end);
  const overnight=first>last;
  if(overnight ? time>=last&&time<first : time<first||time>=last)return null;
  const date=new Date(now);
  if(overnight&&time<last)date.setDate(date.getDate()-1);
  return [date.getFullYear(),date.getMonth()+1,date.getDate(),start,end].join('/');
}

const idleBeforeNap=20*60_000;
const naturalNapLength=5*60_000;

class AutoNap{
  constructor(runtime){
    this.runtime=runtime;
    this.routine=new (require('./rest-routine.cjs').RestRoutine)(runtime.store);
    this.idleSince=Date.now();
    this.last=JSON.parse(runtime.store.db.prepare("SELECT value FROM meta WHERE key='last_auto_nap'").get()?.value||'null');
    if(runtime.store.db.prepare("SELECT 1 FROM meta WHERE key='auto_nap_active'").get()){
      runtime.store.patchSettings({resting:false});
      runtime.store.db.prepare("DELETE FROM meta WHERE key='auto_nap_active'").run();
    }
  }
  record(patch){
    this.last={...this.last,...patch};
    this.runtime.store.db.prepare("INSERT OR REPLACE INTO meta VALUES('last_auto_nap',?)").run(JSON.stringify(this.last));
  }
  snapshot(){
    return {schedule:this.routine.schedule(this.runtime.store.settings()),last:this.last,decision:this.decision||'waiting',idleSince:new Date(this.idleSince).toISOString()};
  }
  tick(now=new Date(),{available=true,interacting=false}={}){
    const {runtime}=this,store=runtime.store,settings=store.settings();
    this.decision=!available?'device_unavailable':runtime.active?'task_active':settings.resting?'resting':interacting?'chat_active':'waiting';
    this.routine.observe(now,available);
    const schedule=this.routine.schedule(settings,now);
    const window=settings.autoNapEnabled&&napWindow(now,schedule.start,schedule.end);
    if(this.current){
      if(!this.current.window&&window)store.db.prepare("INSERT OR REPLACE INTO meta VALUES('auto_nap_window',?)").run(window);
      if(this.current.window ? this.current.window!==window : !settings.naturalNapEnabled||now.getTime()>=this.current.until)this.finish(now.getTime());
      return;
    }
    if(!available||runtime.active||settings.resting||interacting){this.idleSince=now.getTime();return;}
    if(!window&&(!settings.naturalNapEnabled||now.getTime()-this.idleSince<idleBeforeNap))return;
    const prior=store.db.prepare("SELECT value FROM meta WHERE key='auto_nap_window'").get()?.value;
    if(window&&prior===window){this.decision='window_already_used';return;}
    store.transaction(()=>{
      if(window)store.db.prepare("INSERT OR REPLACE INTO meta VALUES('auto_nap_window',?)").run(window);
      store.db.prepare("INSERT OR REPLACE INTO meta VALUES('auto_nap_active','1')").run();
    });
    const nap=this.current={window,until:now.getTime()+naturalNapLength,startedAt:now.toISOString()};
    this.record({startedAt:now.toISOString(),endedAt:null,trigger:window?'schedule':'idle',analysis:'checking',error:null});
    nap.promise=runtime.sleep({analyze:runtime.canAnalyzeAutomatically?.()===true,automatic:true}).then(result=>{
      if(!runtime.closed&&this.last?.startedAt===nap.startedAt){this.record({analysis:result.mode});runtime.notify();}
      return result;
    }).catch(()=>{
      if(!runtime.closed&&this.last?.startedAt===nap.startedAt){this.record({analysis:nap.ended?'cancelled':'failed',error:'analysis_incomplete'});runtime.notify();}
    });
    nap.task=runtime.active;
  }
  finish(now=Date.now()){
    this.idleSince=now;
    const nap=this.current;
    if(!nap)return;
    this.current=null;
    nap.ended=true;
    this.record({endedAt:new Date(now).toISOString()});
    const {runtime}=this;
    if(nap.task&&runtime.active===nap.task)nap.task.controller.abort();
    runtime.store.db.prepare("DELETE FROM meta WHERE key='auto_nap_active'").run();
    runtime.store.patchSettings({resting:false});
    runtime.notify();
    return nap.promise;
  }
}

module.exports={AutoNap,napWindow};
