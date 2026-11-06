const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {ChatGPTBinding}=require('../../services/local-runtime/src/chatgpt-binding.cjs');

test('usage records started requests, returned tokens, failure and cancellation',async t=>{
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 const binding=new ChatGPTBinding({db},{},()=>{});
 let release;
 const pending=binding.track('sleep','test-model',undefined,()=>new Promise(resolve=>{release=resolve;}));
 assert.equal(binding.usage().rows[0].status,'running');
 release({usage:{input_tokens:100,output_tokens:25}});
 await pending;
 await assert.rejects(binding.track('growth','test-model',undefined,async()=>{throw Error('offline');}));
 const controller=new AbortController();
 await assert.rejects(binding.track('task','test-model',controller.signal,async()=>{
  controller.abort();
  throw controller.signal.reason;
 }));
 const rows=binding.usage().rows;
 assert.deepEqual(rows.map(row=>row.status),['cancelled','failed','completed']);
 assert.equal(rows[0].input_tokens,null);
 assert.deepEqual({...binding.usageTotals()},{calls:3,input_tokens:100,output_tokens:25,unknown_usage_calls:2});
});

test('closing during a request preserves an attempt with unknown usage',async t=>{
 const db=new DatabaseSync(':memory:');
 t.after(()=>db.close());
 const binding=new ChatGPTBinding({db},{},()=>{});
 await binding.track('sleep','test-model',undefined,async()=>{
  binding.close();
  return {usage:{input_tokens:7,output_tokens:2}};
 });
 assert.equal(binding.usage().rows[0].status,'running');
 assert.equal(binding.usageTotals().unknown_usage_calls,1);
});
