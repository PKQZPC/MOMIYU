const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Runtime} = require('../../services/local-runtime/src/runtime.cjs');
const {Store} = require('../../services/local-runtime/src/store.cjs');
const {selectBatch,validateAnalysis} = require('../../services/local-runtime/src/analysis.cjs');
const {requestModel,inspectConnection} = require('../../services/local-runtime/src/model.cjs');
const http = require('node:http');
const cache = path.resolve(__dirname,'../../.local/runtime-tests');
fs.mkdirSync(cache,{recursive:true});
function fixture(t,options) {
  const directory=fs.mkdtempSync(path.join(cache,'case-'));
  const runtime=new Runtime(directory,options);
  runtime.chooseEgg('ivory');
  t.after(() => {runtime.close();if(path.dirname(directory)!==cache)throw new Error('unsafe_cleanup');fs.rmSync(directory,{recursive:true,force:true});});
  return {runtime,directory};
}
function analysis(rows) {return {summary:'整理了一段尝试。',experiences:[{description:'用户尝试并纠正了方法。',source_refs:[rows[0].id]}],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'继续积累。'}};}
function enable(runtime,patch={}) {runtime.settings({saveChat:true,saveNotes:true,modelEnabled:true,sendChat:true,sendNotes:true,...patch});}

test('default sources and sending are off; local-only chat makes no request',async t => {
  let calls=0;const {runtime}=fixture(t,{model:async()=>{calls++;throw new Error('unexpected');}});
  assert.throws(()=>runtime.note('not authorized'),/collection_disabled/);
  const reply=await runtime.chat('hello');assert.equal(reply.mode,'local');assert.equal(calls,0);assert.equal(runtime.snapshot().observations.length,0);
  runtime.settings({saveChat:true});await runtime.chat('save only');assert.equal(calls,0);assert.equal(runtime.snapshot().observations.length,1);
});
test('settings and records survive restart; unfinished jobs become interrupted',t => {
  const {runtime,directory}=fixture(t);runtime.settings({alias:'小米',saveNotes:true});const row=runtime.note('先试一种方法。');runtime.store.startJob([row]);
  runtime.close();runtime.closed=false;runtime.store=new Store(directory);
  assert.equal(runtime.snapshot().settings.alias,'小米');assert.equal(runtime.snapshot().observations[0].content,'先试一种方法。');assert.equal(runtime.snapshot().jobs[0].status,'interrupted');assert.equal(runtime.store.pending().length,1);
});
test('sleep without eligible evidence rests without calling AI',async t => {
  let calls=0;const {runtime}=fixture(t,{model:async()=>{calls++;}});runtime.settings({saveNotes:true});runtime.note('local only');
  assert.equal((await runtime.sleep()).mode,'rest');assert.equal(runtime.snapshot().settings.resting,true);assert.equal(calls,0);runtime.wake();assert.equal(runtime.snapshot().settings.resting,false);
});
test('per-source grants filter input; completed evidence is not processed twice',async t => {
  const inputs=[];const {runtime}=fixture(t,{model:async(_settings,_prompt,input)=>{const rows=JSON.parse(input);inputs.push(rows);return {text:JSON.stringify(analysis(rows)),usage:{total_tokens:30}};}});
  enable(runtime,{sendChat:false});runtime.store.add('pet_chat','user','private conversation');runtime.note('permitted experience');
  await runtime.sleep();assert.equal(inputs.length,1);assert.equal(inputs[0].length,1);assert.equal(inputs[0][0].source,'manual_note');
  assert.equal((await runtime.sleep()).mode,'rest');assert.equal(inputs.length,1);assert.equal(runtime.snapshot().jobs[0].result.growth.should_change,false);
});
test('candidate schema rejects unknown provenance and strips acquisition or permission fields',() => {
  const rows=[{id:'a'}],value=analysis(rows);value.skill_candidates=[{name:'线索整理',description:'MOMIYU 会整理线索。',method:'先观察，再比较。',source_refs:['a'],acquired:true}];value.settings={modelEnabled:true};
  const result=validateAnalysis(JSON.stringify(value),rows);assert.equal(result.skill_candidates[0].acquired,undefined);assert.equal(result.settings,undefined);
  value.experiences[0].source_refs=['future'];assert.throws(()=>validateAnalysis(JSON.stringify(value),rows),/invalid_analysis_evidence/);
});
test('wake cancels pending consolidation without accepting its late answer',async t => {
  let resolve;const {runtime}=fixture(t,{model:(_s,_p,input)=>new Promise(done=>{resolve=()=>done({text:JSON.stringify(analysis(JSON.parse(input))),usage:{}});})});
  enable(runtime);runtime.note('a process');const work=runtime.sleep();runtime.wake();resolve();await assert.rejects(work,/request_cancelled/);
  assert.equal(runtime.snapshot().jobs[0].status,'cancelled');assert.equal(runtime.snapshot().jobs[0].result,null);assert.equal(runtime.store.pending().length,1);
});
test('revoking sending stops in-flight calls; duplicate work is refused',async t => {
  let resolve;const {runtime}=fixture(t,{model:()=>new Promise(done=>{resolve=()=>done({text:'late answer',usage:{}});})});
  enable(runtime);const work=runtime.chat('hello');await assert.rejects(runtime.chat('duplicate'),/request_in_progress/);
  runtime.settings({sendChat:false});resolve();await assert.rejects(work,/request_cancelled/);assert.equal(runtime.snapshot().observations.filter(row=>row.role==='assistant').length,0);
});
test('deleting evidence removes derived candidates and prevents resurrection',async t => {
  const {runtime,directory}=fixture(t,{model:async(_s,_p,input)=>({text:JSON.stringify(analysis(JSON.parse(input))),usage:{}})});
  enable(runtime);const row=runtime.note('content to delete');await runtime.sleep();assert.equal(runtime.snapshot().jobs.length,1);runtime.remove(row.id);assert.equal(runtime.snapshot().jobs.length,0);
  runtime.close();runtime.closed=false;runtime.store=new Store(directory);assert.equal(runtime.snapshot().observations.length,0);assert.equal(runtime.snapshot().jobs.length,0);
});
test('deletion during a request invalidates its snapshot',async t => {
  let resolve;const {runtime}=fixture(t,{model:(_s,_p,input)=>new Promise(done=>{resolve=()=>done({text:JSON.stringify(analysis(JSON.parse(input))),usage:{}});})});
  enable(runtime);const row=runtime.note('delete during analysis');const work=runtime.sleep();runtime.remove(row.id);resolve();await assert.rejects(work,/request_cancelled/);assert.equal(runtime.snapshot().jobs.length,0);
});
test('invalid model results fail without consuming evidence; clear removes derived content',async t => {
  const {runtime}=fixture(t,{model:async()=>({text:'not json',usage:{}})});enable(runtime);runtime.note('a process');await assert.rejects(runtime.sleep());
  assert.equal(runtime.snapshot().jobs[0].status,'failed');assert.equal(runtime.store.pending().length,1);runtime.clear();assert.equal(runtime.snapshot().jobs.length,0);assert.equal(runtime.snapshot().observations.length,0);
});
test('input batches are bounded and preserve whole records for later batches',() => {
  const rows=Array.from({length:50},(_,i)=>({id:String(i),source:'manual_note',content:'经'.repeat(4000)}));
  const selected=selectBatch(rows,{modelEnabled:true,sendNotes:true});assert.equal(selected.length,2);assert.ok(Buffer.byteLength(JSON.stringify(selected))<=28000);assert.equal(selected[1].content,rows[1].content);
});
test('native tool results use matching call IDs in actual request input',async()=>{
 const history=[{type:'function_call',call_id:'call_fixture',name:'search_experiences',arguments:'{"query":"活动"}'},{type:'function_call_output',call_id:'call_fixture',output:'[{"content":"真实工具结果"}]'}];await requestModel({modelEnabled:true,model:'fixture',proxyConfig:'fixture'},'system','task',{toolHistory:history,readConfig:()=>({baseURL:'http://127.0.0.1',apiKey:'fixture'}),fetchImpl:async(_url,options)=>{const p=JSON.parse(options.body);assert.deepEqual(p.input.slice(1),history);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'done'}]}]}));}});
});

test('native function call is returned without requiring final text and parallel tools stay off',async()=>{
 const result=await requestModel({modelEnabled:true,model:'fixture',proxyConfig:'fixture'},'system','input',{tools:[{type:'function',name:'search_experiences',parameters:{type:'object'}}],toolChoice:'required',readConfig:()=>({baseURL:'http://127.0.0.1',apiKey:'fixture'}),fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.parallel_tool_calls,false);assert.equal(body.tool_choice,'required');return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'先找资料'}]},{type:'function_call',call_id:'call_fixture',name:'search_experiences',arguments:'{"query":"活动"}'}],usage:{total_tokens:12}}));}});assert.equal(result.toolCall.name,'search_experiences');assert.equal(result.usage.total_tokens,12);
});

test('commentary is never concatenated with final action JSON',async()=>{
 const settings={modelEnabled:true,model:'fixture',proxyConfig:'fixture'},options={readConfig:()=>({baseURL:'http://127.0.0.1',apiKey:'fixture'}),fetchImpl:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'{"action":"wrong intermediate"}'}]},{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'{"action":"actual final"}'}]}]}))};const result=await requestModel(settings,'system','input',options);assert.deepEqual(JSON.parse(result.text),{action:'actual final'});assert.deepEqual(result.output_metadata.map(x=>x.phase),['commentary','final_answer']);
});

test('model response envelope remains bounded independently of displayed text',async()=>{
 const settings={modelEnabled:true,model:'fixture',proxyConfig:'fixture'},readConfig=()=>({baseURL:'http://127.0.0.1',apiKey:'fixture'}),response=(padding,text)=>new Response(JSON.stringify({status:'completed',padding,output:[{content:[{type:'output_text',text}]}]}));
 const result=await requestModel(settings,'system','input',{readConfig,fetchImpl:async(_url,options)=>{assert.equal(JSON.parse(options.body).stream,false);return response('x'.repeat(600000),'short result');}});assert.equal(result.text,'short result');
 await assert.rejects(requestModel(settings,'system','input',{readConfig,fetchImpl:async()=>response('x'.repeat(2100000),'short')}),/model_response_too_large/);
 await assert.rejects(requestModel(settings,'system','input',{readConfig,fetchImpl:async()=>response('', 'x'.repeat(16001))}),/invalid_model_output/);
});

test('loopback model client makes exactly one request and disables redirects',async () => {
  let count=0,payload;
  const settings={modelEnabled:true,model:'gpt-5.6-luna',proxyConfig:'not read'};
  const config=()=>({baseURL:'http://127.0.0.1:8317/v1',apiKey:'synthetic-key'});
  const fetchImpl=async(url,options)=>{count++;payload=JSON.parse(options.body);assert.equal(url,'http://127.0.0.1:8317/v1/responses');assert.equal(options.redirect,'error');return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'hello'}]}],usage:{total_tokens:20}}));};
  const reply=await requestModel(settings,'system','input',{fetchImpl,readConfig:config});assert.equal(reply.text,'hello');assert.equal(payload.store,false);assert.equal(payload.max_output_tokens,2200);assert.equal(count,1);
  count=0;await assert.rejects(requestModel(settings,'system','input',{fetchImpl:async()=>{count++;return new Response('',{status:503});},readConfig:config}),/model_http_503/);assert.equal(count,1);
});

test('real HTTP transport, YAML config, chat and sleep integrate against a local fixture server',async t => {
  const received=[];
  const server=http.createServer(async(request,response)=>{
    let body='';for await(const chunk of request)body+=chunk;
    const payload=JSON.parse(body);received.push({url:request.url,payload});
    let output;
    if(payload.instructions.includes('整理本轮'))output=JSON.stringify(analysis(JSON.parse(payload.input)));
    else output='小小的进展，也值得记下来。';
    response.writeHead(200,{'Content-Type':'application/json'});
    response.end(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:output}]}],usage:{input_tokens:80,output_tokens:20,total_tokens:100}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const {runtime,directory}=fixture(t);
  const filename=path.join(directory,'fixture.yaml');
  fs.writeFileSync(filename,`host: '127.0.0.1'\nport: ${server.address().port}\napi-keys:\n  - 'synthetic-local-fixture'\n`);
  enable(runtime,{proxyConfig:filename,sendNotes:false});runtime.note('local-only sentinel');
  const reply=await runtime.chat('完成了一个小步骤。');assert.equal(reply.mode,'model');assert.ok(reply.text.includes('进展'));
  await runtime.sleep();assert.equal(received.length,2);assert.ok(received.every(item=>item.url==='/v1/responses'));
  assert.ok(received.every(item=>!JSON.stringify(item.payload).includes('local-only sentinel')));
  assert.equal(runtime.snapshot().jobs[0].status,'completed');assert.equal(runtime.snapshot().jobs[0].usage.total_tokens,100);
});

test('connection check is explicit, bounded to model discovery and sends no personal content',async()=>{
  let calls=0;const options={readConfig:()=>({baseURL:'http://127.0.0.1:8317/v1',apiKey:'synthetic-key'}),fetchImpl:async(url,request)=>{calls++;assert.equal(url,'http://127.0.0.1:8317/v1/models');assert.equal(request.method,'GET');assert.equal(request.body,undefined);return new Response(JSON.stringify({data:[{id:'gpt-5.6-luna'},{id:'gpt-5.6-sol'}]}));}};
  const value=await inspectConnection({modelEnabled:true,proxyConfig:'fixture',model:'gpt-5.6-luna'},options);assert.equal(value.status,'ready');assert.equal(calls,1);
  await assert.rejects(inspectConnection({modelEnabled:false},options),/model_disabled/);assert.equal(calls,1);
});
test('connection check cannot accept a late result after permission revocation',async t=>{
  let complete;const {runtime}=fixture(t,{connectionInspector:()=>new Promise(resolve=>{complete=()=>resolve({status:'ready'});})});
  runtime.settings({modelEnabled:true});const work=runtime.checkConnection();runtime.settings({modelEnabled:false});complete();await assert.rejects(work,/request_cancelled/);assert.notEqual(runtime.snapshot().connection.status,'ready');
});
