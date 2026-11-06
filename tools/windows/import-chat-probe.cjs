// Validate actual native UIA chat evidence through storage and sleep routing.
// The analysis response is controlled: this proves transport, not AI quality.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const root=path.resolve(__dirname,'../..'),name=process.argv[2]||'chat-live';
if(!/^chat-[a-z0-9-]+$/.test(name))throw new Error('invalid_owned_probe_name');
const out=path.join(root,'.local/windows-capture',name);
const read=name=>JSON.parse(fs.readFileSync(path.join(out,name),'utf8').replace(/^\uFEFF/,''));
const fake=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
async function run(){
 assert.equal(read('report.json').status,'passed');const directory=fs.mkdtempSync(path.join(out,'database-'));const inputs=[];
 const runtime=new Runtime(directory,{observerFactory:fake,screenFactory:fake,model:async(_settings,_prompt,input)=>{
   const rows=JSON.parse(input);inputs.push(rows);return {text:JSON.stringify({summary:'Owned native chat transport check',experiences:[{description:'Observed the owned chat evidence',source_refs:[rows[0].id]}],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'Transport verification only'}})};
 }});
 try{
  runtime.chooseEgg('ivory');runtime.settings({saveSystem:true,systemApps:name==='chat-native'?'powershell':'msedge'});
  const accepted=read('events.json').filter(x=>x.type==='event').map(x=>runtime.store.ingestSystem(x.value));
  const snapshots=accepted.map(x=>({receipt:x,evidence:runtime.store.systemEvidence(x.id,x.seq)}));
  const chats=snapshots.flatMap(x=>x.evidence.view?.conversations||[]);assert.ok(chats.length,'no_conversations_extracted');
  const messages=chats.flatMap(c=>c.messages);assert.ok(messages.some(m=>m.direction==='sent'));assert.ok(messages.some(m=>m.direction==='received'));
  assert.ok(messages.some(m=>m.reply_or_quote_labels.length));assert.ok(messages.some(m=>m.attachment_names.includes('route.pdf')));
  assert.ok(new Set(chats.map(c=>c.id)).size>=2,'conversation_contexts_merged');
  assert.ok(chats.some(c=>c.messages.filter(m=>m.body==='Noted.').length===2),'equal_messages_collapsed');
  const first=snapshots.find(x=>x.evidence.view?.conversations?.length);assert.ok(!JSON.stringify(first.evidence).includes('The workshop starts at noon.'));
  const all=JSON.stringify(snapshots);for(const sentinel of ['UNSENT_CHAT_DRAFT_SENTINEL','HIDDEN_CHAT_SENTINEL'])assert.ok(!all.includes(sentinel));
  runtime.settings({modelEnabled:true});assert.equal((await runtime.sleep()).mode,'rest');assert.equal(inputs.length,0);
  runtime.settings({sendSystem:true});for(let i=0;runtime.store.pendingCount()&&i<10;i++)assert.equal((await runtime.sleep()).mode,'analyzed');
  assert.equal(runtime.store.pendingCount(),0);assert.ok(JSON.stringify(inputs).includes('Map received. Please use the sheltered route.'));
  assert.ok(inputs.flat().some(r=>r.metadata.interface_content?.conversations?.length));
  const report={status:'passed',actual_native_events:accepted.length,visible_conversation_contexts:new Set(chats.map(c=>c.id)).size,sent_received_quotes_attachments:true,equal_messages_preserved:true,prefix_isolated:true,unsubmitted_hidden_excluded:true,sleep_batches:inputs.length,analysis_validation:'controlled_model_transport_only',external_model_calls:0,pending_records:0,database:path.relative(root,runtime.store.filename)};
  fs.writeFileSync(path.join(out,'store-sleep-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{runtime.settings({saveSystem:false,modelEnabled:false,sendSystem:false});runtime.close();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
