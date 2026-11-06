function maySend(row, settings) {
  return settings.modelEnabled && (row.source === 'pet_chat' ? settings.sendChat : row.source === 'manual_note' ? settings.sendNotes : row.source==='system_interface'?settings.sendSystem:row.source==='system_screenshot'?settings.sendScreenshots:row.source==='raw_input'?settings.sendRawInput:row.source==='file_document' && settings.sendFiles);
}
function withSystemEvidence(store, rows) {
  const seen = new Set(),messages = new Set();
  return rows.map(row => {
    if (row.source !== 'system_interface' || !row.metadata?.event_id) return row;
    const evidence = store.systemEvidence(row.metadata.event_id,row.metadata.received_seq);
    const contentId = row.metadata.content_id;
    const include = contentId && !seen.has(contentId);
    if (contentId) seen.add(contentId);
    const view=include ? require('./conversation-evidence.cjs').presentInterface(evidence.view) : undefined;
    if(view?.conversations)for(const conversation of view.conversations)conversation.messages=conversation.messages.map(message=>{
      if(messages.has(message.id))return {id:message.id,body_ref:message.id,order_in_view:message.order_in_view};
      messages.add(message.id);return message;
    });
    return {...row,metadata:{...row.metadata,interface_content:view}};
  });
}
function selectBatch(rows, settings, {maxBytes=28000}={}) {
  const selected = []; let bytes = 2;
  for (const row of rows) {
    if (!maySend(row,settings)) continue;
    const cost = Buffer.byteLength(JSON.stringify(row),'utf8') + 1;
    if(row.source==='system_screenshot'&&selected.filter(x=>x.source==='system_screenshot').length>=2)continue;
    if (selected.length >= 40 || bytes + cost > maxBytes) break;
    selected.push(row); bytes += cost;
  }
  return selected;
}
function validateAnalysis(raw, rows) {
  const value = require('./agent-json.cjs').parseAgentJSON(raw);
  const ids = new Set(rows.map(row => row.id));
  const bounded = (input,max = 6000) => typeof input === 'string' && input.trim().length > 0 && input.length <= max;
  if (!value || typeof value !== 'object' || !bounded(value.summary) || typeof value.growth?.should_change !== 'boolean' || !bounded(value.growth.reason)) throw new Error('invalid_analysis');
  const result = {summary:value.summary,growth:{should_change:value.growth.should_change,reason:value.growth.reason}};
  if(value.pet_update){const p=value.pet_update;if(!bounded(p.reason,1200))throw new Error('invalid_analysis');const update={reason:p.reason};for(const [key,max] of [['name',40],['personality',1200]])if(p[key]!==undefined){if(typeof p[key]!=='string'||p[key].length>max)throw new Error('invalid_analysis');if(p[key].trim())update[key]=p[key];}if(update.name||update.personality)result.pet_update=update;}
  if(value.memory_updates){if(!Array.isArray(value.memory_updates)||value.memory_updates.length>8)throw new Error('invalid_analysis');result.memory_updates=value.memory_updates.map(x=>{if(!bounded(x.entry_id,100)||!bounded(x.reason,1000))throw new Error('invalid_analysis');return {entry_id:x.entry_id,reason:x.reason};});}
  for (const [field,fields] of Object.entries({experiences:['description'],user_understanding:['description','basis'],workflow_candidates:['description'],skill_candidates:['name','description','method']})) {
    if (!Array.isArray(value[field]) || value[field].length > 40) throw new Error('invalid_analysis');
    result[field] = value[field].map(item => {
      if (!item || fields.some(key => !bounded(item[key])) || !Array.isArray(item.source_refs) || !item.source_refs.length || item.source_refs.some(id => !ids.has(id))) throw new Error('invalid_analysis_evidence');
      const entry=Object.fromEntries([...fields.map(key => [key,item[key]]),['source_refs',[...new Set(item.source_refs)]]]);
      if(field==='experiences')for(const key of ['time_context','statistics'])if(item[key]!==undefined){if(!bounded(item[key],1000))throw new Error('invalid_analysis');entry[key]=item[key];}
      if(field==='skill_candidates'&&item.related_skill_id){if(!bounded(item.related_skill_id,100))throw new Error('invalid_analysis');entry.related_skill_id=item.related_skill_id;}
      return entry;
    });
  }
  // Deliberately whitelist fields. Model output cannot publish a skill, grant
  // a permission, mutate current appearance or inject runnable instructions.
  return result;
}
module.exports = {maySend,selectBatch,validateAnalysis,withSystemEvidence};
