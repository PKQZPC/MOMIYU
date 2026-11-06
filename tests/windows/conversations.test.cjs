const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {normalizeStructure,extractConversations,presentInterface}=require('../../services/local-runtime/src/conversation-evidence.cjs');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const fake=()=>({start(){},stop(){},snapshot(){return {status:'off'};}});
const node=(id,parent,type,name)=>({id,parent,type:'ControlType.'+type,name});
function tree(layout='ListItem',label='Conversation: Garden team'){
 return [node('chat','','Group',label),node('m1','chat',layout,'Received from Alex at 09:01'),node('b1','m1','Text','Bring the map.'),node('m2','chat',layout,'Sent by You at 09:02'),node('b2','m2','Text','Noted.'),node('m3','chat',layout,'Sent by You at 09:03'),node('b3','m3','Text','Noted.'),node('quote','m3','Text','Reply to: Bring the map.'),node('file','m3','Text','Attachment: route.pdf')];
}
const context={app:'generic',window_id:'1',occurred_at:new Date().toISOString()};
test('list and group layouts preserve message direction, duplicates and quoted context',()=>{
 for(const layout of ['ListItem','Group']){const [chat]=extractConversations(normalizeStructure(tree(layout)),context);
  assert.equal(chat.messages.length,3);assert.equal(chat.messages[0].speaker,'Alex');assert.equal(chat.messages[0].direction,'received');assert.equal(chat.messages[1].direction,'sent');
  assert.notEqual(chat.messages[1].id,chat.messages[2].id);assert.deepEqual(chat.messages[2].attachment_names,['route.pdf']);assert.equal(chat.messages[2].reply_or_quote_labels[0],'Reply to: Bring the map.');
 }
});
test('ambiguous messages stay unknown; changing conversation does not merge equal message bodies',()=>{
 const raw=tree();raw[1].name='Message';const a=extractConversations(normalizeStructure(raw),context)[0];
 assert.equal(a.messages[0].direction,'unknown');assert.equal(a.messages[0].speaker,null);
 const b=extractConversations(normalizeStructure(tree('ListItem','Conversation: Other team')),context)[0];assert.notEqual(a.id,b.id);assert.notEqual(a.messages[1].id,b.messages[1].id);
 assert.throws(()=>normalizeStructure([node('draft','','Edit','draft')]),/editable_interface_structure/);
});
test('nested attachment rows do not replace the containing message',()=>{
 const raw=tree();raw.push(node('files','m3','ListItem','Attachment files'),node('file2','files','Text','Attachment: second.pdf'));
 const [chat]=extractConversations(normalizeStructure(raw),context);assert.equal(chat.messages.length,3);assert.equal(chat.messages[2].body,'Noted.');assert.ok(chat.messages[2].attachment_names.includes('second.pdf'));
});
test('model presentation limits chat bytes, labels omitted messages and removes raw structure',()=>{
 const full={text:'duplicated text',controls:[],structure:tree(),conversations:[{id:'c',messages:Array.from({length:20},(_,i)=>({id:String(i),body:'消息内容'.repeat(300)}))}]};
 const view=presentInterface(full);assert.equal(view.structure,undefined);assert.ok(Buffer.byteLength(JSON.stringify(view))<11000);assert.ok(view.conversations[0].omitted_messages>0);assert.equal(full.conversations[0].messages.length,20);
});
test('captured conversation versions reach sleep only with permission and preserve earlier checkpoints',async t=>{
 const base=path.resolve(__dirname,'../../.local/conversation-tests');fs.mkdirSync(base,{recursive:true});const directory=fs.mkdtempSync(path.join(base,'case-'));let sent;
 const r=new Runtime(directory,{observerFactory:fake,screenFactory:fake,model:async(_s,_p,input)=>{sent=JSON.parse(input);return {text:JSON.stringify({summary:'Observed messages',experiences:[],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'Keep accumulating'}})};}});
 t.after(()=>{r.close();fs.rmSync(directory,{recursive:true,force:true});});r.chooseEgg('ivory');r.settings({saveSystem:true,systemApps:'generic'});
 const packet=structure=>({event_id:randomUUID(),session_id:'native',kind:'focus',app:'generic',process_id:9,window_id:'1',occurred_at:new Date().toISOString(),title:'Chat',foreground:true,view:{text:'Messages',structure,controls:[]}});
 const early=r.store.ingestSystem(packet(tree().slice(0,3)));const later=tree();later.push(node('m4','chat','ListItem','Received from Alex at 09:04'),node('b4','m4','Text','Later corrected route'));r.store.ingestSystem(packet(later));
 assert.ok(!JSON.stringify(r.store.systemEvidence(early.id,early.seq)).includes('Later corrected route'));
 r.settings({modelEnabled:true});assert.equal((await r.sleep()).mode,'rest');assert.equal(sent,undefined);
 r.settings({sendSystem:true});await r.sleep();assert.ok(JSON.stringify(sent).includes('Later corrected route'));assert.ok(sent[0].metadata.interface_content.conversations.length);assert.equal(sent[0].metadata.interface_content.structure,undefined);
 const repeated=sent.flatMap(x=>x.metadata.interface_content?.conversations||[]).flatMap(c=>c.messages);assert.ok(repeated.some(m=>m.body_ref));
 r.remove(r.store.observations()[0].id);assert.throws(()=>r.store.systemEvidence(early.id,early.seq),/missing_or_deleted/);
});
