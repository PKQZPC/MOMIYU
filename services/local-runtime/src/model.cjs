const fs = require('node:fs');

// Bounded parser adapted from the verified M0 loopback-proxy reader.
function readProxyConfig(filename) {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('invalid_proxy_config');
  const scalar = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');
  let host = '127.0.0.1', port, inKeys = false;
  const keys = [];
  for (const line of fs.readFileSync(filename,'utf8').split(/\r?\n/)) {
    if (/^host:/.test(line)) host = scalar(line.slice(5));
    if (/^port:/.test(line)) port = Number(line.slice(5).trim());
    if (/^api-keys:\s*$/.test(line)) { inKeys = true; continue; }
    if (inKeys && /^\S/.test(line)) inKeys = false;
    if (inKeys && /^\s+-\s+/.test(line)) keys.push(scalar(line.replace(/^\s+-\s+/,'')));
  }
  if (!['127.0.0.1','localhost','::1'].includes(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !keys[0]) throw new Error('invalid_loopback_proxy');
  return {baseURL:`http://${host === '::1' ? '[::1]' : host}:${port}/v1`,apiKey:keys[0]};
}
async function requestModel(settings, system, input, {signal, images=[], maxOutputTokens=2200,outputSchema=null,tools=[],toolChoice='auto',toolHistory=[], fetchImpl = fetch, readConfig = readProxyConfig} = {}) {
  if (!settings.modelEnabled) throw new Error('model_disabled');
  if(!Number.isInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>6000)throw new Error('invalid_output_budget');
  if (Buffer.byteLength(input,'utf8') + Buffer.byteLength(system,'utf8') > 36000) throw new Error('input_budget_exceeded');
  const config = readConfig(settings.proxyConfig);
  if(!Array.isArray(images)||images.length>3||images.some(x=>typeof x.id!=='string'||typeof x.dataUrl!=='string'||!x.dataUrl.startsWith('data:image/png;base64,')||x.dataUrl.length>5600000))throw new Error('invalid_image_input');
  let payload=images.length?[{role:'user',content:[{type:'input_text',text:input},...images.flatMap(x=>[{type:'input_text',text:'以下图片对应经历记录 id：'+x.id},{type:'input_image',image_url:x.dataUrl,detail:x.detail==='high'?'high':'low'}])]}]:input;
  if(toolHistory.length){if(toolHistory.length>12||Buffer.byteLength(JSON.stringify(toolHistory))+Buffer.byteLength(input)+Buffer.byteLength(system)>36000)throw new Error('input_budget_exceeded');payload=[{role:'user',content:input},...toolHistory];}
  const response = await fetchImpl(config.baseURL + '/responses', {
    method:'POST', redirect:'error',
    headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:settings.model,store:false,stream:false,instructions:system,input:payload,max_output_tokens:maxOutputTokens,reasoning:{effort:'low'},...(tools.length?{tools,tool_choice:toolChoice,parallel_tool_calls:false}:{}),...(outputSchema?{text:{format:{type:'json_schema',name:'agent_action',strict:true,schema:outputSchema}}}:{})}),
    signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error('model_http_' + response.status);
  // Read bounded response bytes, including for a streaming HTTP body.
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length; if (size > 2 * 1024 * 1024) throw new Error('model_response_too_large');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (data.status !== 'completed') throw new Error('model_incomplete');
  const nativeCalls=(data.output||[]).filter(x=>x.type==='function_call');
  if(nativeCalls.length){
    const calls=[];for(const item of nativeCalls){const name=tools.find(t=>item.name===t.name||item.name==='functions.'+t.name)?.name,args=typeof item.arguments==='string'?item.arguments:item.arguments&&typeof item.arguments==='object'?JSON.stringify(item.arguments):null;if(!name||!args||args.length>36000){const error=new Error('invalid_model_tool_call');error.tool_metadata=nativeCalls.map(x=>({name:x.name,arguments_type:typeof x.arguments}));throw error;}if(!calls.some(c=>c.name===name&&c.arguments===args))calls.push({call_id:item.call_id,name,arguments:args});}
    if(calls.length>4)throw new Error('too_many_tool_calls');const usage={};for(const key of ['input_tokens','output_tokens','total_tokens'])if(Number.isSafeInteger(data.usage?.[key]))usage[key]=data.usage[key];return {text:'',toolCall:calls[0],toolCalls:calls,usage,output_metadata:{native_count:nativeCalls.length,unique_count:calls.length}};
  }
  const messages=(data.output||[]).filter(item=>Array.isArray(item.content)&&(!item.type||item.type==='message')&&(!item.role||item.role==='assistant'));
  const selected=messages.filter(item=>item.phase==='final_answer').at(-1)||messages.filter(item=>!item.phase).at(-1);
  if(!selected)throw new Error('model_incomplete');
  const output=(selected.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('\n');
  if (!output.trim() || output.length > 16000) throw new Error('invalid_model_output');
  const usage = {};
  for (const field of ['input_tokens','output_tokens','total_tokens']) if (Number.isSafeInteger(data.usage?.[field]) && data.usage[field] >= 0) usage[field] = data.usage[field];
  return {text:output,usage,output_metadata:messages.map(item=>({phase:item.phase||null,text_blocks:(item.content||[]).filter(c=>c.type==='output_text').length}))};
}
async function inspectConnection(settings,{signal,fetchImpl=fetch,readConfig=readProxyConfig}={}) {
  if(!settings.modelEnabled)throw new Error('model_disabled');
  if(!settings.proxyConfig)throw new Error('proxy_not_configured');
  const config=readConfig(settings.proxyConfig);
  let response;
  try {
    response=await fetchImpl(config.baseURL+'/models',{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${config.apiKey}`},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000)});
  } catch {if(signal?.aborted)throw new Error('request_cancelled');throw new Error('proxy_unavailable');}
  if(!response.ok)throw new Error('model_http_'+response.status);
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144)throw new Error('model_response_too_large');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const models=(Array.isArray(result.data)?result.data:[]).map(item=>item?.id).filter(value=>typeof value==='string'&&value.length<=128);
  return {status:models.includes(settings.model)?'ready':'model_unavailable',selected_model:settings.model,available_debug_models:models.filter(model=>['gpt-5.6-luna','gpt-5.6-sol','gpt-5.6-terra'].includes(model))};
}
module.exports = {readProxyConfig,requestModel,inspectConnection};
