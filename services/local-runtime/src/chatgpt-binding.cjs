const {createServer}=require('node:http');
const {randomBytes,createHash,createPublicKey,verify}=require('node:crypto');
const {requestModel,inspectConnection}=require('./model.cjs');
const {generateAppearance}=require('./appearance.cjs');

const issuer='https://auth.openai.com', resource='https://chatgpt.com/backend-api/codex', clientId='app_EMoamEEZ73f0CkXaXp7hrann';
const scope='openid profile email offline_access';
const random=()=>randomBytes(32).toString('base64url');
async function json(url,options={}){
 const res=await fetch(url,{...options,redirect:'error',signal:options.signal||AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error('chatgpt_http_'+res.status);
 return res.json();
}
const tokens=(params,signal)=>json(issuer+'/oauth/token',{method:'POST',body:new URLSearchParams({...params,client_id:clientId}),signal});
function verifyIdentity(jwt,keys,client,nonce){
 const parts=String(jwt).split('.');
 if(parts.length!==3)throw new Error('chatgpt_identity_invalid');
 const [header,body,sig]=parts;
 const decode=x=>JSON.parse(Buffer.from(x,'base64url').toString());
 const h=decode(header),claims=decode(body),key=keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig'));
 if(h.alg!=='RS256'||!key||!verify('RSA-SHA256',Buffer.from(header+'.'+body),createPublicKey({key,format:'jwk'}),Buffer.from(sig,'base64url'))||
 claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(client)||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000||(claims.nonce!==undefined&&claims.nonce!==nonce)||typeof claims.sub!=='string'||!claims.sub)throw new Error('chatgpt_identity_invalid');
 return claims;
}
function credentials(value,previous={}){
 const expiresIn=Number(value.expires_in);
 if(!value.access_token||!(value.refresh_token||previous.refresh_token)||!Number.isFinite(expiresIn)||expiresIn<=0)throw new Error('chatgpt_binding_incomplete');
 return {...previous,access_token:value.access_token,refresh_token:value.refresh_token||previous.refresh_token,expires:Date.now()+expiresIn*1000};
}
class ChatGPTBinding{
 constructor(store,storage,open){this.store=store;this.storage=storage;this.open=open;
  store.db.exec('CREATE TABLE IF NOT EXISTS chatgpt_usage (at TEXT, kind TEXT, model TEXT, status TEXT, input_tokens INTEGER, output_tokens INTEGER)');
 }
 usage(before=null){
  if(before!==null&&(!Number.isSafeInteger(before)||before<1))throw new Error('invalid_usage_cursor');
  const where=before===null?'':'WHERE rowid < ?';
  const rows=this.store.db.prepare('SELECT rowid AS id,* FROM chatgpt_usage '+where+' ORDER BY rowid DESC LIMIT 6').all(...(before===null?[]:[before]));
  return {rows:rows.slice(0,5),next:rows.length>5?rows[4].id:null};
 }
 usageTotals(){
  return this.store.db.prepare(`SELECT COUNT(*) AS calls,SUM(input_tokens) AS input_tokens,
   SUM(output_tokens) AS output_tokens,
   SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS unknown_usage_calls
   FROM chatgpt_usage`).get();
 }
 read(){
  const row=this.store.db.prepare("SELECT value FROM meta WHERE key='codex_direct_binding'").get();
  return row?JSON.parse(this.storage.decryptString(Buffer.from(row.value,'base64'))):null;
 }
 write(binding){
  const encoded=this.storage.encryptString(JSON.stringify(binding)).toString('base64');
  this.store.db.prepare("INSERT OR REPLACE INTO meta VALUES('codex_direct_binding',?)").run(encoded);
 }
 snapshot(){
  try{
   const b=this.read();
   return b?{account:b.account,model:this.store.settings().model}:null;
  }catch{return {unavailable:true};}
 }
 async bind(signal){
  if(!this.storage.isEncryptionAvailable())throw new Error('chatgpt_secure_storage_unavailable');
  const state=random(),nonce=random(),verifier=random();
  let accept;
  const callback=new Promise(resolve=>accept=resolve);
  const server=createServer((req,res)=>{
   const url=new URL(req.url,'http://127.0.0.1');
   if(req.method!=='GET'||url.pathname!=='/auth/callback'||url.searchParams.get('state')!==state){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end('Return to MOMIYU to see the authorization result.');
   accept(url.searchParams);
  });
  const aborted=()=>accept(null);
  signal.addEventListener('abort',aborted,{once:true});
  const timeout=setTimeout(aborted,180000);
  try{
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1455,'127.0.0.1',resolve);});
   signal.throwIfAborted();
   const redirect_uri='http://localhost:1455/auth/callback';
   const query=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri,scope,state,nonce,id_token_add_organizations:'true',codex_cli_simplified_flow:'true',originator:'MOMIYU',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
   await this.open(issuer+'/oauth/authorize?'+query);
   const returned=await callback;
   const code=returned?.get('code');
   if(!returned||returned.has('error')||!code)throw new Error('chatgpt_binding_incomplete');
   const value=await tokens({grant_type:'authorization_code',code,redirect_uri,code_verifier:verifier},signal);
   const jwks=await json(issuer+'/.well-known/jwks.json',{signal});
   const identity=verifyIdentity(value.id_token,jwks.keys,clientId,nonce);
   const accountId=identity['https://api.openai.com/auth']?.chatgpt_account_id;
   if(typeof accountId!=='string'||!accountId)throw new Error('chatgpt_identity_invalid');
   const binding=credentials(value,{accountId,account:typeof identity.email==='string'?identity.email.replace(/^(.).*@/,'$1***@'):'ChatGPT'});
   signal.throwIfAborted();
   this.write(binding);
  }finally{clearTimeout(timeout);signal.removeEventListener('abort',aborted);server.close();server.closeAllConnections();}
 }
 unbind(){this.store.db.prepare("DELETE FROM meta WHERE key IN ('codex_direct_binding','codex_binding','chatgpt_binding')").run();}
 close(){this.closed=true;}
 async connection(signal){
  let b=this.read();
  if(!b)throw new Error('chatgpt_binding_incomplete');
  if(b.expires<Date.now()+60000){
   const value=await tokens({grant_type:'refresh_token',refresh_token:b.refresh_token},signal);
   signal?.throwIfAborted();
   this.write(b=credentials(value,b));
  }
  return b;
 }
 async track(kind,model,signal,action){
  const attempt=this.store.db.prepare('INSERT INTO chatgpt_usage VALUES(?,?,?,?,?,?)')
   .run(new Date().toISOString(),kind,model,'running',null,null).lastInsertRowid;
  let usage,status='failed';
  try{const result=await action();usage=result.usage;status='completed';return result;}
  finally{
   if(!this.closed)this.store.db.prepare('UPDATE chatgpt_usage SET status=?,input_tokens=?,output_tokens=? WHERE rowid=?')
    .run(signal?.aborted?'cancelled':status,Number.isSafeInteger(usage?.input_tokens)?usage.input_tokens:null,Number.isSafeInteger(usage?.output_tokens)?usage.output_tokens:null,attempt);
  }
 }
 async model(settings,system,input,options,kind){
  return this.track(kind,settings.model,options.signal,async()=>{
   const b=await this.connection(options.signal);
   return requestModel(settings,system,input,{...options,readConfig:()=>({baseURL:resource,apiKey:b.access_token}),fetchImpl:(url,opts)=>streamResponse(url,opts,b)});
  });
 }
 async image(settings,input,bytes,options){
  const result=await this.track('image','gpt-image-1.5',options.signal,async()=>{
   const b=await this.connection(options.signal);
   let usage;
   const output=await generateAppearance(settings,input,bytes,{...options,readConfig:()=>({baseURL:resource,apiKey:b.access_token}),fetchImpl:(url,opts)=>imageResponse(url,opts,b),onUsage:value=>{usage=value;}});
   return {output,usage};
  });
  return result.output;
 }
 async inspect(settings,{signal}){
  const b=await this.connection(signal);
  return inspectConnection({...settings,proxyConfig:resource},{signal,readConfig:()=>({baseURL:resource,apiKey:b.access_token}),fetchImpl:async(url,opts)=>{
   const response=await fetch(url+'?client_version=0.145.0',{...opts,headers:headers(opts.headers,b)});
   if(!response.ok)return response;
   const value=await response.json();
   return Response.json({data:(value.models||[]).map(model=>({id:model.slug}))});
  }});
 }
}
function headers(base,b){return {...base,'ChatGPT-Account-ID':b.accountId,originator:'MOMIYU'};}
async function imageResponse(url,options,b){
 const form=options.body,images=[];
 for(const file of form.getAll('image[]'))images.push({image_url:'data:'+file.type+';base64,'+Buffer.from(await file.arrayBuffer()).toString('base64')});
 const body=Object.fromEntries([...form].filter(([,value])=>typeof value==='string'));
 body.n=Number(body.n);
 body.images=images;
 return fetch(url,{...options,headers:headers({...options.headers,'Content-Type':'application/json'},b),body:JSON.stringify(body)});
}
async function streamResponse(url,options,b){
 const body=JSON.parse(options.body);
 body.stream=true;
 delete body.max_output_tokens;
 if(typeof body.input==='string')body.input=[{role:'user',content:body.input}];
 const response=await fetch(url,{...options,headers:headers({...options.headers,Accept:'text/event-stream'},b),body:JSON.stringify(body)});
 if(!response.ok)return response;
 let buffer='',bytes=0;
 const items=new Map();
 for await(const chunk of response.body.pipeThrough(new TextDecoderStream())){
  bytes+=Buffer.byteLength(chunk);
  if(bytes>2*1024*1024)throw new Error('model_response_too_large');
  buffer+=chunk;
  let end;
  while((end=buffer.indexOf('\n'))!==-1){
   const line=buffer.slice(0,end).trimEnd();buffer=buffer.slice(end+1);
   if(!line.startsWith('data: ')||line==='data: [DONE]')continue;
   const event=JSON.parse(line.slice(6));
   if(event.type==='response.output_item.done'&&event.item)items.set(event.output_index??items.size,event.item);
   if(event.type==='response.completed'){
    if(!event.response.output?.length)event.response.output=[...items.entries()].sort((a,b)=>a[0]-b[0]).map(([,item])=>item);
    return Response.json(event.response);
   }
   if(['response.failed','response.incomplete','error'].includes(event.type))throw new Error(event.response?.error?.code==='subscription_sharing_usage_limit_exceeded'?'chatgpt_limit':'model_incomplete');
  }
 }
 throw new Error('model_incomplete');
}
module.exports={ChatGPTBinding};
