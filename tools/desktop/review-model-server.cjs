// Local model substitute for interactive acceptance. Never touches account state.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function startReviewServer({port,apiKey,directory,timeoutMs=240000,maxImageRequests=2}){
 const relative=path.relative(root,path.resolve(directory));
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('review_directory_outside_project');
 fs.mkdirSync(directory,{recursive:true});let seq=0,imageRequests=0;
 const pending=new Set();
 const server=http.createServer(async(req,res)=>{
  const respond=(status,value)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}};
  if(req.headers.authorization!=='Bearer '+apiKey)return respond(401,{error:{message:'review_auth_required'}});
  if(req.method==='GET'&&req.url==='/v1/models')return respond(200,{data:['gpt-5.6-luna','gpt-5.6-sol','gpt-5.6-terra','gpt-image-1.5'].map(id=>({id}))});
  if(req.method!=='POST'||!['/v1/responses','/v1/images/edits'].includes(req.url))return respond(404,{error:{message:'unsupported_review_endpoint'}});
  const kind=req.url.endsWith('/responses')?'text':'image';
  if(kind==='image'&&imageRequests>=maxImageRequests)return respond(429,{error:{message:'review_image_request_limit'}});
  const current=++seq,dir=path.join(directory,String(current).padStart(3,'0'));fs.mkdirSync(dir);
  const state={id:current,kind,status:'receiving',created_at:new Date().toISOString()};
  const persist=()=>fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify(state,null,2));persist();
  let timer,watcher;
  const end=status=>{state.status=status;persist();clearTimeout(timer);clearInterval(watcher);pending.delete(stop);};
  const stop=()=>{end('server_closed');respond(503,{error:{message:'review_server_closed'}});};
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16*1048576)throw Error('review_request_too_large');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks),attachments=[];let payload;
   const saveImage=(data,name)=>{const filename='attachment-'+attachments.length+'.png';fs.writeFileSync(path.join(dir,filename),data);attachments.push({name,path:path.join(dir,filename)});return {attachment:filename};};
   if(kind==='text'){
    payload=JSON.parse(bytes.toString('utf8'));
    // Preserve exactly what the application sent, with image bytes in sibling files.
    payload=JSON.parse(JSON.stringify(payload,(_k,v)=>{
     if(typeof v==='string'&&v.startsWith('data:image/png;base64,'))return saveImage(Buffer.from(v.slice(22),'base64'),'input_image');return v;
    }));
   }else{
    const form=await new Request('http://127.0.0.1'+req.url,{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:bytes}).formData();payload={};
    for(const [key,value]of form){if(typeof value==='string')payload[key]=value;else saveImage(Buffer.from(await value.arrayBuffer()),value.name);}
    imageRequests++;
   }
   fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify({kind,payload,attachments},null,2));
   state.status='waiting_for_model';persist();console.log(JSON.stringify({request:current,kind,attachments:attachments.length,directory:dir}));
   pending.add(stop);
   res.on('close',()=>{if(state.status==='waiting_for_model')end('client_cancelled');});
   timer=setTimeout(()=>{end('timeout');respond(504,{error:{message:'review_response_timeout'}});},timeoutMs);
   watcher=setInterval(()=>{
    const file=path.join(dir,'response.json');if(!fs.existsSync(file))return;
    try{
     const reply=JSON.parse(fs.readFileSync(file,'utf8'));
     if(reply.error){end('failed');return respond(502,{error:{message:reply.error}});}
     let output;
     if(kind==='text'){
      if(typeof reply.text!=='string'||!reply.text.trim()||reply.text.length>16000)throw Error('invalid_review_text');
      output={id:'review_'+randomUUID(),status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:reply.text}]}]};
     }else{
      const file=fs.realpathSync(reply.image_path),r=path.relative(root,file);if(r.startsWith('..')||path.isAbsolute(r))throw Error('review_image_outside_project');
      const image=fs.readFileSync(file);if(image.length>4*1048576||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('invalid_review_image');
      output={data:[{b64_json:image.toString('base64')}]};
     }
     end('responded');respond(200,output);
    }catch(error){end('invalid_response');respond(502,{error:{message:error.message}});}
   },100);
  }catch(error){end('invalid_request');respond(400,{error:{message:error.message}});}
 });
 return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve({port:server.address().port,close:()=>{for(const stop of [...pending])stop();return new Promise(r=>{server.close(r);server.closeIdleConnections();});}}));});
}
module.exports={startReviewServer};
if(require.main===module){
 const {readProxyConfig}=require('../../services/local-runtime/src/model.cjs');
 const args=process.argv.slice(2),value=flag=>{const at=args.indexOf(flag);return at<0?null:args[at+1];};
 if(!value('--proxy-config'))throw Error('explicit_proxy_config_required');
 const config=readProxyConfig(path.resolve(value('--proxy-config')));
 const directory=path.resolve(value('--output')||path.join(root,'.local/model-review',new Date().toISOString().replace(/[:.]/g,'-')));
 startReviewServer({port:Number(new URL(config.baseURL).port),apiKey:config.apiKey,directory}).then(server=>{
  fs.writeFileSync(path.join(directory,'server.json'),JSON.stringify({pid:process.pid,port:server.port,startedAt:new Date().toISOString()}));
  console.log('REVIEW_PROVIDER_READY');
  let closing=false;const close=async()=>{if(closing)return;closing=true;await server.close();};process.once('SIGTERM',close);process.once('SIGINT',close);
  setTimeout(close,30*60*1000).unref();
 }).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
}
