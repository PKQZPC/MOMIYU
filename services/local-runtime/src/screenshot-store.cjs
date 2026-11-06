const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {projectDirectory}=require('../../../apps/desktop/paths.cjs');
const root=path.resolve(__dirname,'../../..'),budget=10*1024**3;
module.exports=Store=>{
  Store.prototype.initializeScreenshots=function(){
    this.screenDirectory=projectDirectory(root,path.join(path.dirname(this.filename),'screenshots'));
    fs.mkdirSync(this.screenDirectory,{recursive:true});
    this.db.exec('CREATE TABLE IF NOT EXISTS screenshots(hash TEXT PRIMARY KEY,bytes INTEGER NOT NULL,context TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS screen_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,observation_id TEXT REFERENCES observations(id) ON DELETE CASCADE,payload TEXT NOT NULL);');
    this.cleanScreenshots();
  };
  Store.prototype.screenshotBytes=function(){let bytes=0;for(const name of fs.readdirSync(this.screenDirectory)){if(/^[a-f0-9]{64}\.png$/.test(name))bytes+=fs.lstatSync(path.join(this.screenDirectory,name)).size;}return bytes;};
  Store.prototype.saveScreenshot=function(input,context){
    if(!this.settings().saveScreenshots)throw new Error('screenshot_collection_disabled');
    if(!['baseline_30m','foreground_context','page_changed','important_state','structural_gap'].includes(input.reason)||!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<1||input.height<1||input.width>960||input.height>960||typeof input.png!=='string'||input.png.length>5600000)throw new Error('invalid_screenshot');
    const image=Buffer.from(input.png,'base64');
    if(image.length<33||image.length>4194304||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||image.readUInt32BE(16)!==input.width||image.readUInt32BE(20)!==input.height)throw new Error('invalid_screenshot');
    const hash=createHash('sha256').update(image).digest('hex'),filename=path.join(this.screenDirectory,hash+'.png'),key=JSON.stringify(context);
    const previous=this.db.prepare('SELECT context FROM screenshots WHERE hash=?').get(hash),exists=fs.existsSync(filename);
    if(exists&&(fs.lstatSync(filename).isSymbolicLink()||createHash('sha256').update(fs.readFileSync(filename)).digest('hex')!==hash))throw new Error('invalid_screenshot');
    const reused=!!previous&&exists;
    const total=this.screenshotBytes()+fs.statSync(this.filename).size;
    if(!fs.existsSync(filename)){const disk=fs.statfsSync(this.screenDirectory);if(total+image.length>budget*.9||disk.bavail*disk.bsize<image.length+16*1048576)throw new Error('screenshot_storage_full');fs.writeFileSync(filename,image,{flag:'wx'});}
    this.db.prepare('INSERT OR IGNORE INTO screenshots VALUES(?,?,?)').run(hash,image.length,key);
    return {hash,width:input.width,height:input.height,reason:input.reason,reused,area:input.area,context_consistency:input.context_consistency==='interface_changed_during_capture'?'interface_changed_during_capture':'stable',use_state:'presumed_foreground_use',accumulated_use_ms:Math.max(0,Math.min(3600000,Number(input.accumulated_use_ms)||0)),local_only:true};
  };
  Store.prototype.readScreenshot=function(observationId){
    const row=this.db.prepare('SELECT metadata FROM observations WHERE id=?').get(observationId),hash=row&&JSON.parse(row.metadata||'{}').screenshot?.hash;
    if(!hash||!/^[a-f0-9]{64}$/.test(hash))throw new Error('missing_or_deleted');
    const filename=path.join(this.screenDirectory,hash+'.png');if(fs.lstatSync(filename).isSymbolicLink())throw new Error('invalid_screenshot');
    return 'data:image/png;base64,'+fs.readFileSync(filename).toString('base64');
  };
  Store.prototype.ingestScreen=function(input){
    if(!this.settings().saveScreenshots)throw new Error('screenshot_collection_disabled');
    if(!input||typeof input.event_id!=='string'||input.event_id.length>100||typeof input.occurred_at!=='string'||!Number.isFinite(Date.parse(input.occurred_at))||input.screenshot?.reason!=='baseline_30m')throw new Error('invalid_screenshot');
    if(this.db.prepare('SELECT 1 FROM screen_events WHERE id=?').get(input.event_id))return {duplicate:true};
    let result;this.transaction(()=>{
      const screenshot=this.saveScreenshot(input.screenshot,{scope:'system_display',area:input.screenshot.area});
      const row=this.add('system_screenshot','observation','累计有效使用 30 分钟，保存一次系统画面。',{event_id:input.event_id,occurred_at:input.occurred_at,screenshot,scope:'system_display'});
      const seq=Number(this.db.prepare('INSERT INTO screen_events(id,observation_id,payload) VALUES(?,?,?)').run(input.event_id,row.id,JSON.stringify({occurred_at:input.occurred_at,screenshot})).lastInsertRowid);
      result={id:row.id,seq,screenshot};
    });return result;
  };
  Store.prototype.cleanScreenshots=function(){
    if(!this.screenDirectory)return;
    const used=new Set(this.db.prepare("SELECT json_extract(payload,'$.screenshot.hash') hash FROM system_events UNION SELECT json_extract(payload,'$.screenshot.hash') hash FROM screen_events").all().map(x=>x.hash).filter(Boolean));
    for(const name of fs.readdirSync(this.screenDirectory))if(/^[a-f0-9]{64}\.png$/.test(name)&&!used.has(name.slice(0,-4)))fs.unlinkSync(path.join(this.screenDirectory,name));
    for(const {hash} of this.db.prepare('SELECT hash FROM screenshots').all())if(!used.has(hash))this.db.prepare('DELETE FROM screenshots WHERE hash=?').run(hash);
  };
};
