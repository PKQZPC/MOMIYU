const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {projectDirectory}=require('../../../apps/desktop/paths.cjs');
class ScreenObserver {
  constructor(store,changed,{spawnProcess=spawn}={}){this.store=store;this.changed=changed;this.spawnProcess=spawnProcess;this.status='off';this.generation=0;}
  snapshot(){return {status:this.status,useMs:this.useMs||0,intervalMs:1800000};}
  checkpoint(){if(Number.isFinite(this.useMs))this.store.db.prepare("INSERT OR REPLACE INTO meta VALUES('screen_use_ms',?)").run(String(this.useMs));}
  start(){
    if(!this.store.settings().saveScreenshots){this.status='off';return;}
    if(process.platform!=='win32'){this.status='unsupported_platform';return;}
    const root=path.resolve(__dirname,'../../..'),temp=projectDirectory(root,path.join(root,'.local/windows-capture/tmp'));fs.mkdirSync(temp,{recursive:true});
    this.useMs=Math.max(0,Math.min(1800000,Number(this.store.db.prepare("SELECT value FROM meta WHERE key='screen_use_ms'").get()?.value)||0));
    const generation=++this.generation;this.status='starting';let buffer='',last=Date.now(),lastSave=0;
    const child=this.child=this.spawnProcess(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(root,'packages/windows-capture/screen.ps1'),'-AccumulatedUseMs',String(this.useMs)],{cwd:root,windowsHide:true,env:{...process.env,TEMP:temp,TMP:temp,PSModuleAnalysisCachePath:path.join(temp,'module-analysis-cache')},stdio:['pipe','pipe','pipe']});
    const fail=status=>{if(generation!==this.generation)return;this.stop();this.status=status;this.changed();};
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      if(generation!==this.generation)return;buffer+=chunk;if(Buffer.byteLength(buffer)>8388608)return fail('invalid_output');let end;
      while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{
        const item=JSON.parse(line);last=Date.now();
        if(item.type==='heartbeat'&&Number.isFinite(item.use_ms)){this.useMs=Math.max(0,Math.min(1800000,item.use_ms));this.status=item.usable?'waiting':'paused';if(Date.now()-lastSave>30000){this.checkpoint();lastSave=Date.now();this.changed();}}
        if(item.type==='screen'){this.store.ingestScreen(item);child.stdin.write('saved\n');this.useMs=0;this.checkpoint();this.status='saved';this.changed();}
        if(item.type==='coverage'){this.status=item.status;this.changed();}
      }catch{return fail('capture_paused');}}
    });
    child.stderr.resume();child.stdin.on('error',()=>fail('helper_exited'));child.on('error',()=>fail('helper_failed'));child.on('exit',()=>fail('helper_exited'));
    this.timer=setInterval(()=>{if(Date.now()-last>15000)fail('helper_timeout');},2000);this.timer.unref();
  }
  stop(){this.generation++;clearInterval(this.timer);this.checkpoint();this.child?.kill();this.child=null;this.status='off';}
}
module.exports={ScreenObserver};
