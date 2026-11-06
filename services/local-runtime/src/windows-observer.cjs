const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {projectDirectory}=require('../../../apps/desktop/paths.cjs');
const apps=value=>String(value).split(',').map(x=>x.trim().toLowerCase().replace(/\.exe$/,'')).filter(Boolean);
class WindowsObserver{
  constructor(store,changed,{spawnProcess=spawn}={}){this.store=store;this.changed=changed;this.spawnProcess=spawnProcess;this.status='off';this.child=null;this.root=path.resolve(__dirname,'../../..');this.generation=0;}
  snapshot(){return {status:this.status};}
  start(){
    const settings=this.store.settings();if(!settings.saveSystem){this.status='off';return;}const allowed=apps(settings.systemApps);if(!this.store.observeForeground&&!allowed.length){this.status='choose_apps';return;}
    if(process.platform!=='win32'){this.status='unsupported_platform';return;}
    const temp=projectDirectory(this.root,path.join(this.root,'.local/windows-capture/tmp'));fs.mkdirSync(temp,{recursive:true});
    const current=++this.generation;this.status='starting';let buffer='',last=Date.now();
    const child=this.child=this.spawnProcess(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(this.root,'packages/windows-capture/observer.ps1'),...(this.store.observeForeground?['-ObserveForeground','-ExcludeProcessId',String(process.pid)]:['-AllowedApps',allowed.join(',')])],{cwd:this.root,windowsHide:true,env:{...process.env,TEMP:temp,TMP:temp,PSModuleAnalysisCachePath:path.join(temp,'module-analysis-cache')},stdio:['ignore','pipe','pipe']});
    const fail=status=>{if(current!==this.generation)return;this.stop();this.status=status;this.changed();};
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      if(current!==this.generation)return;buffer+=chunk;if(Buffer.byteLength(buffer)>262144)return fail('invalid_output');let end;
      while((end=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
        try{
          const item=JSON.parse(line);last=Date.now();
          if(item.type==='event'){
            this.store.ingestSystem(item.value);
            if(item.value.view){
              const readable = item.value.view.text?.trim() || item.value.submission?.text;
              this.status=readable?'observing':'interface_text_unavailable';
            }
            this.changed();
          }else if(item.type==='ready'){this.status=item.mouse_hook?'ready':'mouse_hook_unavailable';this.changed();}
          else if(item.type==='coverage'){this.status=item.status;this.changed();}
        }catch{return fail('capture_paused');}
      }
    });
    child.stderr.resume();child.on('error',()=>fail('helper_failed'));child.on('exit',()=>fail('helper_exited'));
    this.timer=setInterval(()=>{if(Date.now()-last>12000)fail('helper_timeout');},2000);this.timer.unref();
  }
  stop(){this.generation++;clearInterval(this.timer);this.child?.kill();this.child=null;this.status='off';}
}
module.exports={WindowsObserver,apps};
