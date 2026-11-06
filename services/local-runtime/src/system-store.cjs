const fs=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {apps}=require('./windows-observer.cjs');
const {normalizeStructure,extractConversations}=require('./conversation-evidence.cjs');
const bounded=(value,max)=>{if(typeof value!=='string'||value.length>max)throw new Error('invalid_system_packet');return value;};
module.exports=Store=>{
  Store.prototype.initializeSystem=function(){const previous=this.db.prepare("SELECT value FROM meta WHERE key='system_schema_version'").get()?.value;if(previous&&previous!=='1')throw new Error('unsupported_system_schema');this.db.exec(`CREATE TABLE IF NOT EXISTS system_contents(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,first_seq INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS system_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,observation_id TEXT REFERENCES observations(id) ON DELETE CASCADE,content_id TEXT REFERENCES system_contents(id),payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS system_events_context ON system_events(json_extract(payload,'$.session_id'),json_extract(payload,'$.window_id'),json_extract(payload,'$.process_id'),seq);
    INSERT OR IGNORE INTO meta VALUES('system_schema_version','1');`);};
  Store.prototype.ingestSystem=function(input){
    const settings=this.settings();if(!settings.saveSystem||(!this.observeForeground&&!apps(settings.systemApps).includes(input.app)))throw new Error('collection_disabled');
    if(!['foreground','focus','action','result','submission'].includes(input.kind)||input.foreground!==true||!Number.isSafeInteger(input.process_id)||!/^[a-z0-9._-]{1,64}$/.test(input.app))throw new Error('invalid_system_packet');
    const packet={event_id:bounded(input.event_id,100),session_id:bounded(input.session_id,100),kind:input.kind,occurred_at:bounded(input.occurred_at,50),app:input.app,process_id:input.process_id,window_id:bounded(input.window_id,60),title:bounded(input.title||'',240),actor:bounded(input.actor||'unknown',60),outcome:bounded(input.outcome||'observed_context',80),omission:bounded(input.omission||'',100)};
    if(input.page_url)packet.page_url=bounded(input.page_url,2048);
    if(input.submission){if(input.kind!=='submission'||!['submit_control','enter_with_observed_result'].includes(input.submission.method)||input.submission.confirmation!=='submission_intent_and_new_visible_echo')throw new Error('invalid_submission');packet.submission={text:bounded(input.submission.text,4000),input_id:bounded(input.submission.input_id,200),input_name:bounded(input.submission.input_name||'',180),method:input.submission.method,confirmation:input.submission.confirmation};}
    if(input.kind==='submission'&&!packet.submission)throw new Error('invalid_submission');
    if(input.result_for)packet.result_for=bounded(input.result_for,100);
    const normalizeTarget=t=>({id:bounded(t.id,200),type:bounded(t.type,80),name:bounded(t.name||'',180),enabled:t.enabled===true,...(typeof t.selected==='boolean'?{selected:t.selected}:{}),...(typeof t.toggle==='string'?{toggle:bounded(t.toggle,20)}:{})});
    if(input.target){packet.target=normalizeTarget(input.target);if(input.kind==='action')packet.target_timing='resolved_at_capture_after_mouse_up';}
    if(input.kind==='action')packet.result_observation_limits={window_ms:15000,max_changed_views:6};
    let view;if(input.view)view={structure:normalizeStructure(input.view.structure),url:bounded(input.view.url||'',2048),text:bounded(input.view.text||'',6000),controls:(input.view.controls||[]).slice(0,24).map(normalizeTarget),truncated:input.view.truncated===true,omission:bounded(input.view.omission||'',100)};
    if(view?.structure.length){view.conversations=extractConversations(view.structure,{...packet,page_url:packet.page_url||view.url},packet.submission);}
    if(this.db.prepare('SELECT 1 FROM system_events WHERE id=?').get(packet.event_id))return {duplicate:true};
    let bytes=0;for(const suffix of ['','-wal','-shm'])try{bytes+=fs.statSync(this.filename+suffix).size;}catch{}
    const disk=fs.statfsSync(path.dirname(this.filename));if(bytes+262144>10240*1048576||disk.bavail*disk.bsize<16*1048576)throw new Error('capture_storage_full');
    let accepted;this.transaction(()=>{
      const previous=this.db.prepare("SELECT seq,content_id FROM system_events WHERE json_extract(payload,'$.session_id')=? AND json_extract(payload,'$.window_id')=? AND json_extract(payload,'$.process_id')=? AND content_id IS NOT NULL ORDER BY seq DESC LIMIT 1").get(packet.session_id,packet.window_id,packet.process_id);
      packet.before_content_id=previous?.content_id||null;
      const seq=Number(this.db.prepare('INSERT INTO system_events(id,payload) VALUES(?,?)').run(packet.event_id,'{}').lastInsertRowid);let contentId=null;
      if(view){const hash=createHash('sha256').update(JSON.stringify({app:packet.app,window_id:packet.window_id,title:packet.title,view})).digest('hex');contentId=this.db.prepare('SELECT id FROM system_contents WHERE hash=?').get(hash)?.id;if(!contentId){contentId=randomUUID();this.db.prepare('INSERT INTO system_contents VALUES(?,?,?,?)').run(contentId,hash,JSON.stringify(view),seq);}}
      const summary=[`${packet.app} · ${packet.kind} · ${packet.title}`,packet.target?`对象：${packet.target.type} ${packet.target.name}`:'',packet.submission?'已提交文字：'+packet.submission.text:'',view?.conversations?.length?view.conversations.map(c=>`会话：${c.label||'未知名称'}\n`+c.messages.slice(-3).map(m=>`${m.speaker||'说话者未知'} [${m.direction}]：${m.body}`).join('\n')).join('\n').slice(0,2000):view?.text?.slice(0,1400)||'',packet.omission?`内容缺失：${packet.omission}`:''].filter(Boolean).join('\n').slice(0,4000);
      const metadata={...packet,received_seq:seq,content_id:contentId,process_evidence:'system-event-v1',conversation_refs:(view?.conversations||[]).map(c=>({id:c.id,label:c.label,message_count:c.messages.length,coverage:c.coverage})),summary_is_excerpt:!!(view?.text?.length>1400),full_evidence_available:true};
      const row=this.add('system_interface','observation',summary,metadata);this.db.prepare('UPDATE system_events SET observation_id=?,content_id=?,payload=? WHERE seq=?').run(row.id,contentId,JSON.stringify(packet),seq);accepted={id:packet.event_id,seq,content_id:contentId};
    });return accepted;
  };
  Store.prototype.systemEvidence=function(id,checkpoint){if(!Number.isSafeInteger(checkpoint)||checkpoint<1)throw new Error('explicit_checkpoint_required');const row=this.db.prepare('SELECT * FROM system_events WHERE id=?').get(id);if(!row)throw new Error('missing_or_deleted');if(row.seq>checkpoint)throw new Error('future_evidence');const content=row.content_id?this.db.prepare('SELECT * FROM system_contents WHERE id=?').get(row.content_id):null;if(content?.first_seq>checkpoint)throw new Error('future_evidence');return {seq:row.seq,event:JSON.parse(row.payload),view:content?JSON.parse(content.payload):null};};
  Store.prototype.cleanSystemContents=function(){this.db.exec('DELETE FROM system_contents WHERE id NOT IN (SELECT content_id FROM system_events WHERE content_id IS NOT NULL)');};
};
