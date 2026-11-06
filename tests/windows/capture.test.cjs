const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const {WindowsObserver}=require('../../services/local-runtime/src/windows-observer.cjs');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const out=path.resolve(__dirname,'../../.local/system-tests');fs.mkdirSync(out,{recursive:true});
const fake=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
function fixture(t,options={}){const dir=fs.mkdtempSync(path.join(out,'case-')),runtime=new Runtime(dir,{observerFactory:fake,...options});t.after(()=>{runtime.close();assert.equal(path.dirname(dir),out);fs.rmSync(dir,{recursive:true,force:true});});return runtime;}
function packet(patch={}){return {event_id:randomUUID(),session_id:'test-session',kind:'foreground',occurred_at:new Date().toISOString(),app:'fixture',process_id:123,window_id:'456',title:'Owned fixture',foreground:true,view:{text:'Initial content',controls:[]},...patch};}
function enable(runtime){runtime.settings({saveSystem:true,systemApps:'fixture'});}
test('system collection is opt-in, application bounded, and separate from model sending',async t=>{
 const r=fixture(t);assert.throws(()=>r.store.ingestSystem(packet()),/collection_disabled/);enable(r);assert.throws(()=>r.store.ingestSystem(packet({app:'other'})),/collection_disabled/);assert.throws(()=>r.store.ingestSystem(packet({foreground:false})),/invalid_system_packet/);
 r.store.ingestSystem(packet());r.settings({modelEnabled:true});assert.equal((await r.sleep()).mode,'rest');assert.equal(r.store.jobs().length,0);r.settings({saveSystem:false});assert.throws(()=>r.store.ingestSystem(packet()),/collection_disabled/);
});
test('content reuse retains every action and immutable earlier evidence',t=>{
 const r=fixture(t);enable(r);const a=r.store.ingestSystem(packet()),click=packet({kind:'action',view:undefined,target:{id:'button',type:'ControlType.Button',name:'Apply',enabled:true}}),b=r.store.ingestSystem(click);
 const c=r.store.ingestSystem(packet({kind:'result',view:{text:'Error: revise selection'},result_for:click.event_id}));
 const again=r.store.ingestSystem(packet());assert.equal(a.content_id,again.content_id);assert.equal(r.store.db.prepare('SELECT COUNT(*) n FROM system_contents').get().n,2);
 const prefix=r.store.systemEvidence(b.id,b.seq);assert.equal(prefix.event.before_content_id,a.content_id);assert.equal(prefix.view,null);assert.equal(JSON.stringify(prefix).includes('Error: revise'),false);
 assert.throws(()=>r.store.systemEvidence(c.id,b.seq),/future_evidence/);assert.throws(()=>r.store.systemEvidence(a.id),/explicit_checkpoint_required/);
 assert.equal(r.store.observations()[1].role,'observation');
 const fresh=r.store.ingestSystem(packet({session_id:'another-session',kind:'action',view:undefined}));assert.equal(r.store.systemEvidence(fresh.id,fresh.seq).event.before_content_id,null);
});
test('deletion removes dependent candidates and orphaned interface versions',t=>{
 const r=fixture(t);enable(r);const saved=r.store.ingestSystem(packet()),id=r.store.startJob(r.store.observations());r.store.finishJob(id,{status:'completed',result:{summary:'derived'}},r.store.epoch());r.remove(r.store.observations()[0].id);
 assert.equal(r.store.jobs().length,0);assert.equal(r.store.db.prepare('SELECT COUNT(*) n FROM system_contents').get().n,0);assert.throws(()=>r.store.systemEvidence(saved.id,saved.seq),/missing_or_deleted/);
});
test('storage pressure refuses new captures and keeps existing evidence',t=>{
 const r=fixture(t);enable(r);r.store.ingestSystem(packet());const previous=fs.statfsSync;fs.statfsSync=()=>({bavail:0,bsize:4096});try{assert.throws(()=>r.store.ingestSystem(packet()),/capture_storage_full/);}finally{fs.statfsSync=previous;}assert.equal(r.store.observations().length,1);
});
test('helper framing reaches the real store and revocation rejects late buffered events',t=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true;};
 const r=fixture(t,{observeForeground:true,observerFactory:(store,changed)=>new WindowsObserver(store,changed,{spawnProcess:(_exe,args,options)=>{assert.ok(args.includes("-ObserveForeground"));assert.ok(!args.includes("-AllowedApps"));assert.equal(options.windowsHide,true);assert.ok(options.env.TEMP.startsWith(path.resolve(__dirname,'../..')));return child;}})});r.settings({saveSystem:true});
 const message=JSON.stringify({type:'event',value:packet()})+'\n';child.stdout.write(message.slice(0,25));assert.equal(r.store.observations().length,0);child.stdout.write(message.slice(25));assert.equal(r.store.observations().length,1);
 r.settings({saveSystem:false});assert.equal(child.killed,true);child.stdout.write(JSON.stringify({type:'event',value:packet()})+'\n');assert.equal(r.store.observations().length,1);
});
test('authorized system evidence can reach bounded sleep analysis despite a local-only backlog',async t=>{
 let sent;const r=fixture(t,{observeForeground:true,model:async(_s,_p,input)=>{sent=JSON.parse(input);return {text:JSON.stringify({summary:'Observed content',experiences:[],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'Continue accumulating'}})};}});r.settings({saveSystem:true});r.chooseEgg('ivory');r.settings({saveNotes:true,modelEnabled:true,sendSystem:true});for(let i=0;i<210;i++)r.note('Local only '+i);r.store.ingestSystem(packet());await r.sleep();assert.equal(sent.length,1);assert.equal(sent[0].source,'system_interface');assert.equal(r.store.pendingCount(),210);r.clear();assert.equal(r.store.settings().saveSystem,false);
});

test('browser submission and full page evidence reach sleep with versioned operation links',async t=>{
 let sent;const r=fixture(t,{model:async(_s,_p,input)=>{sent=JSON.parse(input);return {text:JSON.stringify({summary:'Observed browser task',experiences:[],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'Keep accumulating'}})};}});
 r.chooseEgg('ivory');r.settings({saveSystem:true,systemApps:'msedge',modelEnabled:true,sendSystem:true});
 const page='Page content '.repeat(150)+'END_OF_PAGE_EVIDENCE';
 const before=r.store.ingestSystem(packet({app:'msedge',page_url:'https://example.test/routes',view:{text:page,controls:[]}}));
 const operation=packet({app:'msedge',kind:'action',view:undefined,target:{id:'query',type:'ControlType.Edit',name:'',enabled:true}});r.store.ingestSystem(operation);
 const submission={text:'accessible route',input_id:'query',method:'submit_control',confirmation:'submission_intent_and_new_visible_echo'};
 r.store.ingestSystem(packet({app:'msedge',kind:'submission',submission,result_for:operation.event_id,view:{text:'Submitted accessible route',controls:[]}}));
 assert.throws(()=>r.store.ingestSystem(packet({app:'msedge',kind:'submission'})),/invalid_submission/);
 await r.sleep();assert.ok(JSON.stringify(sent).includes('END_OF_PAGE_EVIDENCE'));
 assert.equal(sent.find(x=>x.metadata.submission).metadata.result_for,operation.event_id);
 assert.equal(sent.find(x=>x.metadata.kind==='action').metadata.before_content_id,before.content_id);
 r.settings({sendSystem:false});assert.equal((await r.sleep()).mode,'rest');
});
