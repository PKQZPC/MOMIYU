const fs=require('node:fs');
const path=require('node:path');

// Login and inference must never refresh the same credential directory concurrently.
function acquireProxyLease(configPath,purpose){
 const text=fs.readFileSync(configPath,'utf8');
 const match=text.match(/^auth-dir:\s*(.+?)\s*$/m);
 if(!match)throw Error('proxy_auth_directory_missing');
 const value=match[1].replace(/^(['"])(.*)\1$/,'$2');
 if(!path.isAbsolute(value))throw Error('proxy_auth_directory_not_absolute');
 const root=fs.realpathSync(path.resolve(__dirname,'../../..'));
 const relative=path.relative(root,path.resolve(value));
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('proxy_auth_directory_outside_project');
 fs.mkdirSync(value,{recursive:true});
 const actual=path.relative(root,fs.realpathSync(value));
 if(actual.startsWith('..')||path.isAbsolute(actual))throw Error('proxy_auth_directory_outside_project');
 const file=path.join(fs.realpathSync(value),'.momiyu-process-lock');
 for(let attempt=0;attempt<2;attempt++){
  try{
   const fd=fs.openSync(file,'wx');
   const token=require('node:crypto').randomUUID();
   fs.writeFileSync(fd,JSON.stringify({pid:process.pid,purpose,token}));fs.closeSync(fd);
   let released=false;
   return ()=>{if(released)return;released=true;try{if(JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);}catch{}};
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   let owner;try{owner=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('local_proxy_in_use');}
   if(!Number.isInteger(owner.pid)||owner.pid<1)throw Error('local_proxy_in_use');
   try{process.kill(owner.pid,0);throw Error('local_proxy_in_use');}
   catch(e){if(e.code!=='ESRCH')throw Error('local_proxy_in_use');}
   try{fs.unlinkSync(file);}catch{throw Error('local_proxy_in_use');}
  }
 }
 throw Error('local_proxy_in_use');
}
module.exports={acquireProxyLease};
