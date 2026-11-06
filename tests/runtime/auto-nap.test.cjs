const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const root=path.resolve(__dirname,'../../.local/auto-nap-tests');
fs.mkdirSync(root,{recursive:true});
const off=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
function fixture(t,model){
 const dir=fs.mkdtempSync(path.join(root,'case-'));
 const runtime=new Runtime(dir,{model,observerFactory:off,screenFactory:off});
 t.after(()=>runtime.close());
 runtime.chooseEgg('ivory');
 runtime.settings({autoNapEnabled:true,autoNapStart:'22:00',autoNapEnd:'02:00'});
 return runtime;
}
const at=(day,hour,minute=0)=>new Date(2026,10,4+day,hour,minute);
test('overnight window respects device state, active tasks and a manual wake',async t=>{
 const r=fixture(t);
 r.autoNap.tick(at(0,21));assert.equal(r.store.settings().resting,false);
 r.autoNap.tick(at(0,22),{available:false});assert.equal(r.store.settings().resting,false);
 const task={kind:'task',controller:new AbortController()};
 r.active=task;r.autoNap.tick(at(0,22));assert.equal(task.controller.signal.aborted,false);
 assert.equal(r.store.settings().resting,false);
 r.active=null;r.autoNap.tick(at(0,23));assert.equal(r.store.settings().resting,true);
 await r.autoNap.current.promise;
 assert.equal(r.store.jobs().length,0);
 r.wake();r.autoNap.tick(at(1,1));assert.equal(r.store.settings().resting,false);
 r.autoNap.tick(at(1,22));assert.equal(r.store.settings().resting,true);
 r.autoNap.tick(at(2,2));assert.equal(r.store.settings().resting,false);
});
test('automatic nap processes eligible evidence and wakes at the window end',async t=>{
 let calls=0;
 const r=fixture(t,async(_settings,prompt,input)=>{
  calls++;
  const rows=JSON.parse(input);
  assert.equal(rows.length,1);
  return {text:JSON.stringify({summary:'Synthetic nap',experiences:[{description:'An observed event.',source_refs:[rows[0].id]}],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'Keep accumulating'}})};
 });
 r.canAnalyzeAutomatically=()=>true;
 r.settings({modelEnabled:true,saveNotes:true,sendNotes:true});
 r.note('Synthetic experience');
 r.autoNap.tick(at(0,22,1),{interacting:true});
 assert.equal(r.store.settings().resting,false);
 r.autoNap.tick(at(0,22,1));
 await r.autoNap.current.promise;
 assert.equal(calls,1);
 assert.equal(r.store.jobs()[0].status,'completed');
 r.autoNap.tick(at(1,2));assert.equal(r.store.settings().resting,false);
});

test('early wake preserves unprocessed evidence and blocks late analysis publication',async t=>{
 let resolveModel,seen;
 const r=fixture(t,async(_settings,_prompt,input)=>{
  seen=JSON.parse(input);
  return new Promise(resolve=>{resolveModel=resolve;});
 });
 r.canAnalyzeAutomatically=()=>true;
 r.settings({modelEnabled:true,saveNotes:true,sendNotes:true});
 r.note('Evidence collected before sleep');
 r.autoNap.tick(at(0,22));
 const nap=r.autoNap.current;
 assert.equal(seen.length,1);
 r.note('Evidence collected after the cutoff');
 r.wake();
 assert.equal(r.store.settings().resting,false);
 assert.equal(nap.task.controller.signal.aborted,true);
 resolveModel({text:JSON.stringify({summary:'Late result',experiences:[],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'Late'}})});
 await nap.promise;
 assert.equal(r.store.jobs()[0].status,'cancelled');
 assert.equal(r.store.modelPending(r.store.settings()).length,2);
 r.autoNap.tick(at(0,22,1));
 assert.equal(r.store.settings().resting,false);
});

test('natural nap starts without a schedule and creates no job without model access',async t=>{
 const r=fixture(t,()=>assert.fail('model called during rest-only nap'));
 r.settings({autoNapEnabled:false});
 r.autoNap.idleSince=at(0,10).getTime();
 r.autoNap.tick(at(0,10,19));
 assert.equal(r.store.settings().resting,false);
 r.autoNap.tick(at(0,10,20));
 await r.autoNap.current.promise;
 assert.equal(r.store.settings().resting,true);
 assert.equal(r.store.jobs().length,0);
 assert.equal(r.autoNap.snapshot().last.trigger,'idle');
 assert.equal(r.autoNap.snapshot().last.analysis,'rest');
 r.autoNap.tick(at(0,10,25));
 assert.equal(r.autoNap.snapshot().last.endedAt,at(0,10,25).toISOString());
 assert.equal(r.store.settings().resting,false);
 r.autoNap.tick(at(0,10,26));
 assert.equal(r.store.settings().resting,false);
});

test('coverage distinguishes completed, failed and pending evidence',async t=>{
 const r=fixture(t);
 r.settings({modelEnabled:true,saveNotes:true,sendNotes:true});
 for(const status of ['completed','failed','pending'])r.note(status);
 const [done,failed,pending]=r.store.observations();
 for(const [row,status] of [[done,'completed'],[failed,'failed']]){
   const id=r.store.startJob([row]);
   r.store.finishJob(id,{status},r.store.epoch());
 }
 assert.deepEqual(r.store.analysisCoverage().map(x=>[x.status,x.count]).sort(),[['completed',1],['failed',1],['pending',1]]);
 assert.deepEqual(r.store.observations().map(x=>x.analysis_status),['completed','failed','pending']);
 assert.deepEqual(r.store.modelPending(r.store.settings(),{automatic:true}).map(x=>x.id),[pending.id]);
 assert.deepEqual(r.store.modelPending(r.store.settings()).map(x=>x.id),[failed.id,pending.id]);
});

test('a configured model receives nothing when all observations are local only',async t=>{
 const r=fixture(t,()=>assert.fail('local-only experience reached the model'));
 r.canAnalyzeAutomatically=()=>true;
 r.settings({modelEnabled:true,saveNotes:true});
 r.note('Local-only experience');
 r.autoNap.tick(at(0,22));
 const result=await r.autoNap.current.promise;
 assert.equal(result.mode,'rest');
 assert.equal(r.store.jobs().length,0);
 assert.equal(r.store.observations()[0].analysis_status,'pending');
});

test('routine learns repeated long breaks, keeps manual priority and persists',t=>{
 const r=fixture(t),routine=r.autoNap.routine;
 r.settings({adaptiveNapEnabled:true});
 const observe=(day,start,end)=>{
   routine.observe(at(day,start),false);
   routine.observe(at(day,start),false);
   routine.observe(at(day+(end<=start?1:0),end),true);
 };
 observe(0,1,9);observe(1,1,9);
 assert.equal(routine.schedule(r.store.settings(),at(2,9)).source,'default');
 observe(2,1,9);
 assert.deepEqual(routine.schedule(r.store.settings(),at(3,10)),{start:'01:00',end:'09:00',days:3,updatedAt:at(2,9).toISOString(),source:'routine'});
 const RestRoutine=require('../../services/local-runtime/src/rest-routine.cjs').RestRoutine;
 assert.equal(new RestRoutine(r.store).schedule(r.store.settings(),at(3,10)).start,'01:00');
 r.settings({autoNapStart:'22:30'});
 assert.equal(r.store.settings().adaptiveNapEnabled,false);
 assert.equal(routine.schedule(r.store.settings(),at(3,10)).source,'manual');
 r.settings({adaptiveNapEnabled:true});
 assert.equal(routine.schedule(r.store.settings(),at(20,10)).source,'default');
});

test('routine ignores short locks and unobserved offline gaps',t=>{
 const r=fixture(t),routine=r.autoNap.routine;
 routine.observe(at(0,10),false);
 routine.observe(at(0,10,5),true);
 routine.observe(at(5,9),true);
 assert.equal(routine.data.periods.length,0);
 routine.observe(at(5,20),false);
 const RestRoutine=require('../../services/local-runtime/src/rest-routine.cjs').RestRoutine;
 const restarted=new RestRoutine(r.store);
 restarted.observe(at(6,8),true);
 assert.equal(restarted.data.periods.length,0);
});

test('learned overnight window triggers a scheduled nap',async t=>{
 const r=fixture(t),routine=r.autoNap.routine;
 r.settings({adaptiveNapEnabled:true});
 for(let day=0;day<3;day++){
   routine.observe(at(day,23),false);
   routine.observe(at(day+1,7),true);
 }
 r.autoNap.tick(at(3,23,30));
 assert.equal(r.store.settings().resting,true);
 assert.equal(r.autoNap.last.trigger,'schedule');
 await r.autoNap.current.promise;
 r.autoNap.tick(at(4,7));
 assert.equal(r.store.settings().resting,false);
});
