const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {readProxyConfig}=require('./model.cjs');
const {acquireProxyLease}=require('./proxy-lease.cjs');
const {projectDirectory}=require('../../../apps/desktop/paths.cjs');

const root=path.resolve(__dirname,'../../..');
const listening=(host,port)=>new Promise(resolve=>{
 const socket=net.connect({host,port});
 const finish=value=>{socket.destroy();resolve(value);};
 socket.once('connect',()=>finish(true));
 socket.once('error',()=>finish(false));
 socket.setTimeout(300,()=>finish(false));
});

class LocalProxy{
 constructor(store){this.store=store;}
 async run(signal,action){
  const settings=this.store.settings();
  if(!settings.localProxyExecutable)return action();
  const executable=fs.realpathSync(settings.localProxyExecutable);
  const relative=path.relative(fs.realpathSync(root),executable);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('proxy_executable_outside_project');
  const config=readProxyConfig(settings.proxyConfig),url=new URL(config.baseURL);
  if(await listening(url.hostname,Number(url.port)))return action();
  signal.throwIfAborted();
  const release=acquireProxyLease(settings.proxyConfig,'inference');
  try{return await this.runOwned(signal,action,settings,executable,url);}finally{release();}
 }
 async runOwned(signal,action,settings,executable,url){
  const directory=projectDirectory(root,path.join(path.dirname(this.store.filename),'local-proxy'));
  const logPath=path.join(directory,'server.log');
  const log=fs.openSync(logPath,'a');
  const offset=fs.fstatSync(log).size;
  let child;
  try{
   child=this.child=spawn(executable,['--config',path.resolve(settings.proxyConfig)],{
    cwd:directory,windowsHide:true,stdio:['ignore',log,log],
    env:{...process.env,TEMP:directory,TMP:directory},
   });
  }finally{fs.closeSync(log);}
  let startError;
  child.once('error',error=>{startError=error;});
  const abort=()=>child.kill();
  signal.addEventListener('abort',abort,{once:true});
  try{
   let ready=false;
   const deadline=Date.now()+15000;
   while(Date.now()<deadline){
    signal.throwIfAborted();
    if(startError||child.exitCode!==null)throw Error('local_proxy_start_failed');
    const startup=fs.readFileSync(logPath).subarray(offset).toString('utf8');
    if(/full client load complete/.test(startup)&&await listening(url.hostname,Number(url.port))){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,150));
   }
   if(!ready)throw Error('local_proxy_start_timeout');
   signal.throwIfAborted();
   return await action();
  }finally{
   signal.removeEventListener('abort',abort);
   if(child.pid&&child.exitCode===null){
    const stopped=new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,2000).unref();});
    child.kill();
    await stopped;
   }
   if(this.child===child)this.child=null;
  }
 }
 close(){this.child?.kill();}
}
module.exports={LocalProxy};
