const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cut=(value,max)=>typeof value==='string'?value.slice(0,max):'';

function normalizeStructure(raw){
  if(raw===undefined)return [];
  if(!Array.isArray(raw)||raw.length>160)throw new Error('invalid_interface_structure');
  let remaining=10000;const ids=new Set();
  return raw.map(item=>{
    if(!item||typeof item.id!=='string'||item.id.length>200||ids.has(item.id)||typeof item.parent!=='string'||item.parent.length>200)throw new Error('invalid_interface_structure');
    ids.add(item.id);const node={id:item.id,parent:item.parent,type:cut(item.type,80),localized_type:cut(item.localized_type,60),name_truncated:item.name_truncated===true};
    for(const [key,max] of [['name',800],['help',240],['status',120]]){node[key]=cut(item[key],Math.min(max,remaining));remaining-=node[key].length;}
    if(node.type==='ControlType.Edit')throw new Error('editable_interface_structure');
    return node;
  });
}

// Semantic interface evidence, independent of executable names, brands and DOM
// selectors. Missing direction/identity remain unknown, not guessed from layout.
function extractConversations(nodes,context,submission){
  const byId=new Map(nodes.map(n=>[n.id,n])),children=new Map();
  for(const n of nodes){if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n);}
  const under=(n,parent)=>{const seen=new Set();while(n&&!seen.has(n.id)){if(n.id===parent.id)return true;seen.add(n.id);n=byId.get(n.parent);}return false;};
  const label=n=>[n.name,n.help,n.status,n.localized_type].filter(Boolean).join(' ');
  const conversations=nodes.filter(n=>/\b(conversation|chat(?: history| log| with)?|messages|message history|message list|message feed)\b|会话|聊天|消息列表|消息记录|对话记录/i.test(label(n))&&!['ControlType.Text','ControlType.Button','ControlType.Hyperlink'].includes(n.type));
  const output=[];let remaining=8000;
  const containers=conversations.filter(n=>!conversations.some(other=>other.id!==n.id&&under(other,n)));
  for(const container of containers.slice(0,3)){
    const candidates=nodes.filter(n=>n.id!==container.id&&under(n,container)&&(n.type==='ControlType.ListItem'||n.type==='ControlType.DataItem'||/\b(sent (?:by|from)|received (?:from|message)|message from)\b|发出的消息|收到的消息|发送者[：:]/i.test(label(n))));
    const messageRoots=candidates.filter(n=>!candidates.some(other=>other.id!==n.id&&under(n,other)));
    const conversationId=hash([context.app,context.window_id,context.page_url||'',container.name||container.id]);
    const messages=[];const occurrences=new Map();
    for(const node of messageRoots.slice(-20)){
      const parts=nodes.filter(n=>n.id!==node.id&&under(n,node)&&n.type==='ControlType.Text');
      const quotes=parts.filter(n=>/^(quote|reply to|引用|回复)[：: ]/i.test(n.name)).map(n=>n.name);
      const attachments=parts.filter(n=>/^(attachment|附件)[：: ]/i.test(n.name)).map(n=>n.name.replace(/^(attachment|附件)[：: ]+/i,'').slice(0,240));
      let body=parts.filter(n=>!quotes.includes(n.name)&&!/^(attachment|附件)[：: ]/i.test(n.name)).map(n=>n.name).join('\n');
      const metadata=label(node);
      if(!body){const separator=node.name.indexOf(' | ');if(separator>=0)body=node.name.slice(separator+3);}
      const excerpt=body.length>Math.min(4000,remaining)||parts.some(n=>n.name_truncated)||node.name_truncated;
      body=cut(body,Math.min(4000,remaining));if(!body.trim())continue;remaining-=body.length;
      const sender=metadata.match(/(?:sent (?:by|from)|received from|message from)\s+(.+?)(?:\s+at\s+|\s*\||$)/i)||metadata.match(/(?:发送者|来自)[：:]\s*([^，,|]+)/);
      const time=metadata.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
      let direction=/\breceived (?:from|message)\b|收到的消息/i.test(metadata)?'received':/\bsent (?:by|from)\b|发出的消息/i.test(metadata)?'sent':'unknown';
      let basis=direction==='unknown'?'not_exposed':'accessible_message_label';
      if(submission&&body===submission.text){direction='sent';basis='confirmed_submission_echo';}
      const fingerprint=hash([body,sender?.[1]||null,time?.[0]||null,quotes,attachments]);const occurrence=(occurrences.get(fingerprint)||0)+1;occurrences.set(fingerprint,occurrence);
      messages.push({id:hash([conversationId,node.id,fingerprint,occurrence]),source_node:node.id,body,excerpt,direction,direction_basis:basis,speaker:sender?.[1]?.trim()||null,displayed_time:time?.[0]||null,observed_at:context.occurred_at,reply_or_quote_labels:quotes.slice(0,3),attachment_names:attachments.slice(0,5),order_in_view:messages.length,identity_scope:'visible_accessibility_node_and_content'});
      if(remaining<=0)break;
    }
    if(messages.length)output.push({id:conversationId,label:container.name||null,identity_scope:'application_window_page_and_accessible_label',coverage:'visible_excerpt_not_complete_history',messages});
    if(remaining<=0)break;
  }
  return output;
}
function presentInterface(view){
  if(!view)return null;
  const {structure,...result}=view;
  if(!view.conversations?.length)return result;
  // Raw accessibility trees are retained locally. Model context receives the
  // normalized visible messages once, within a byte cap, with omissions marked.
  let budget=10000;result.text='';result.controls=[];
  result.conversations=view.conversations.map(c=>{
    const messages=[];
    for(const m of [...c.messages].reverse()){
      const next={...m,body:m.body.slice(0,1200),excerpt:m.excerpt===true||m.body.length>1200};
      const size=Buffer.byteLength(JSON.stringify(next));if(size>budget)break;
      budget-=size;messages.unshift(next);
    }
    return {...c,messages,omitted_messages:c.messages.length-messages.length};
  });
  return result;
}
module.exports={normalizeStructure,extractConversations,presentInterface};
