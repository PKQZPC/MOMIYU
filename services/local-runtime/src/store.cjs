const {DatabaseSync} = require('node:sqlite');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const analysisStatusSql=`CASE
  WHEN EXISTS(SELECT 1 FROM job_sources s JOIN jobs j ON j.id=s.job_id WHERE s.observation_id=o.id AND j.status='completed') THEN 'completed'
  WHEN EXISTS(SELECT 1 FROM job_sources s JOIN jobs j ON j.id=s.job_id WHERE s.observation_id=o.id AND j.status='running') THEN 'running'
  WHEN EXISTS(SELECT 1 FROM job_sources s JOIN jobs j ON j.id=s.job_id WHERE s.observation_id=o.id AND j.status='failed') THEN 'failed'
  ELSE 'pending'
END`;

const DEFAULTS = Object.freeze({
  alias: '',petScale:100, saveChat: false, saveNotes: false, sendChat: false, sendNotes: false,
  saveFiles:false,sendFiles:false,saveRawInput:false,sendRawInput:false,
  saveSystem:false,sendSystem:false,systemApps:'',saveScreenshots:false,sendScreenshots:false,imageGeneration:false,
  modelEnabled: false, model: 'gpt-5.6-luna', proxyConfig: '', localProxyExecutable:'', resting: false,
  adaptiveNapEnabled:true,naturalNapEnabled:true,autoNapEnabled:true,autoNapStart:'23:00',autoNapEnd:'07:00',
});
function text(value, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid_text');
  return value.trim();
}
function validateSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('invalid_settings');
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new Error('unknown_setting');
    if(key==='petScale'&&(!Number.isInteger(value)||value<60||value>160))throw new Error('invalid_setting');
    if (typeof DEFAULTS[key] === 'boolean' && typeof value !== 'boolean') throw new Error('invalid_setting');
    if (typeof DEFAULTS[key] === 'string' && (typeof value !== 'string' || value.length > (['proxyConfig','localProxyExecutable'].includes(key) ? 1024 : 80))) throw new Error('invalid_setting');
    if (key === 'model' && !['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra'].includes(value)) throw new Error('invalid_model');
    if(['autoNapStart','autoNapEnd'].includes(key)&&value!==''&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('invalid_nap_time');
    if(key==='systemApps'&&value.split(',').some(name=>name.trim()&&!/^[a-zA-Z0-9._-]{1,64}$/.test(name.trim())))throw new Error('invalid_app_list');
  }
}
class Store {
  constructor(directory) {
    fs.mkdirSync(directory, {recursive: true});
    this.filename = path.join(directory, 'momiyu.sqlite');
    this.db = new DatabaseSync(this.filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA temp_store=MEMORY; CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
    const previous=this.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value;
    if (previous && !['1','2'].includes(previous)) {this.db.close();throw new Error('unsupported_database_version');}
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(
        id TEXT PRIMARY KEY,source TEXT NOT NULL,role TEXT NOT NULL,
        content TEXT NOT NULL,created_at TEXT NOT NULL,metadata TEXT);
      CREATE TABLE IF NOT EXISTS jobs(
        id TEXT PRIMARY KEY,status TEXT NOT NULL,created_at TEXT NOT NULL,
        finished_at TEXT,result TEXT,usage TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS job_sources(
        job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
        observation_id TEXT REFERENCES observations(id) ON DELETE CASCADE,
        PRIMARY KEY(job_id,observation_id));
      CREATE INDEX IF NOT EXISTS job_sources_observation ON job_sources(observation_id);
      CREATE TABLE IF NOT EXISTS watched_files(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,last_hash TEXT,version INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS growth_requests(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        state TEXT NOT NULL,input TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES('schema_version','2');
      INSERT OR IGNORE INTO meta VALUES('epoch','0');
      UPDATE jobs SET status='interrupted',error='application_restarted' WHERE status='running';`);
    if (previous==='1') this.transaction(()=>{
      this.db.exec('ALTER TABLE observations ADD COLUMN metadata TEXT;');
      this.db.prepare("UPDATE meta SET value='2' WHERE key='schema_version'").run();
    });
    this.initializeSystem();
    this.initializeScreenshots();
    this.initializeLife();
  }
  settings() {
    const result = {...DEFAULTS};
    for (const row of this.db.prepare('SELECT key,value FROM settings').all()) {
      if (Object.hasOwn(DEFAULTS, row.key)) result[row.key] = JSON.parse(row.value);
    }
    const explicitMode=this.db.prepare("SELECT 1 FROM settings WHERE key='adaptiveNapEnabled'").get();
    if(!explicitMode&&this.db.prepare("SELECT 1 FROM settings WHERE key IN ('autoNapStart','autoNapEnd')").get())result.adaptiveNapEnabled=false;
    validateSettings(result);
    return result;
  }
  patchSettings(patch) {
    validateSettings(patch);
    this.transaction(() => {
      for (const [key,value] of Object.entries(patch)) this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,JSON.stringify(value));
    });
    return this.settings();
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  epoch() { return Number(this.db.prepare("SELECT value FROM meta WHERE key='epoch'").get().value); }
  bumpEpoch() { this.db.prepare("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='epoch'").run(); }
  add(source, role, content, metadata=null) {
    const settings = this.settings();
    if (!['pet_chat','manual_note','file_document','system_interface','system_screenshot','raw_input'].includes(source) || !(['file_document','system_interface','system_screenshot','raw_input'].includes(source) ? role==='observation' : ['user','assistant'].includes(role))) throw new Error('invalid_source');
    if (!(source === 'pet_chat' ? settings.saveChat : source==='manual_note' ? settings.saveNotes : source==='system_interface'?settings.saveSystem:source==='system_screenshot'?settings.saveScreenshots:source==='raw_input'?settings.saveRawInput:settings.saveFiles)) throw new Error('collection_disabled');
    if(source==='file_document' && (typeof content!=='string'||content.length>4000))throw new Error('invalid_text');
    const row = {id: randomUUID(),source,role,content:source==='file_document'?content:text(content),created_at:new Date().toISOString(),metadata};
    this.db.prepare('INSERT INTO observations(id,source,role,content,created_at,metadata) VALUES(?,?,?,?,?,?)').run(row.id,row.source,row.role,row.content,row.created_at,metadata?JSON.stringify(metadata):null);
    return row;
  }
  observations(limit = 100) {
    return this.db.prepare(`SELECT o.*, ${analysisStatusSql} AS analysis_status FROM observations o ORDER BY o.rowid DESC LIMIT ?`).all(Math.min(200,Math.max(1,limit))).reverse().map(row=>({...row,metadata:row.metadata?JSON.parse(row.metadata):null}));
  }
  counts() {
    return {observations:this.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n,
      completedJobs:this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='completed'").get().n};
  }
  pending() {
    return this.db.prepare(`SELECT o.* FROM observations o WHERE NOT EXISTS (
      SELECT 1 FROM job_sources s JOIN jobs j ON j.id=s.job_id
      WHERE s.observation_id=o.id AND j.status='completed') ORDER BY o.rowid LIMIT 200`).all().map(row=>({...row,metadata:row.metadata?JSON.parse(row.metadata):null}));
  }
  pendingCount(){return this.db.prepare("SELECT COUNT(*) AS n FROM observations o WHERE NOT EXISTS (SELECT 1 FROM job_sources s JOIN jobs j ON j.id=s.job_id WHERE s.observation_id=o.id AND j.status='completed')").get().n;}
  analysisCoverage(){
    return this.db.prepare(`SELECT source, status, COUNT(*) AS count FROM (
      SELECT o.source, ${analysisStatusSql} AS status FROM observations o
    ) GROUP BY source,status`).all();
  }
  modelPending(settings,{automatic=false}={}){if(!settings.modelEnabled)return [];return this.db.prepare(`SELECT o.* FROM observations o WHERE NOT EXISTS (SELECT 1 FROM job_sources s JOIN jobs j ON j.id=s.job_id WHERE s.observation_id=o.id AND j.status='completed') AND (NOT ? OR NOT EXISTS (SELECT 1 FROM job_sources s JOIN jobs j ON j.id=s.job_id WHERE s.observation_id=o.id AND j.status='failed')) AND ((source='pet_chat' AND ?) OR (source='manual_note' AND ?) OR (source='file_document' AND ?) OR (source='system_interface' AND ?) OR (source='system_screenshot' AND ?) OR (source='raw_input' AND ?)) ORDER BY CASE WHEN ? AND source='system_screenshot' THEN 0 ELSE 1 END, o.rowid LIMIT 80`).all(Number(automatic),Number(settings.sendChat),Number(settings.sendNotes),Number(settings.sendFiles),Number(settings.sendSystem),Number(settings.sendScreenshots),Number(settings.sendRawInput),Number(settings.sendRawInput)).map(row=>({...row,metadata:row.metadata?JSON.parse(row.metadata):null}));}
  startJob(rows) {
    const id = randomUUID();
    this.transaction(() => {
      this.db.prepare('INSERT INTO jobs(id,status,created_at) VALUES(?,?,?)').run(id,'running',new Date().toISOString());
      for (const row of rows) this.db.prepare('INSERT INTO job_sources VALUES(?,?)').run(id,row.id);
    });
    return id;
  }
  finishJob(id, {status,result = null,usage = null,error = null}, epoch) {
    if (epoch !== this.epoch()) return false;
    const changed = this.db.prepare("UPDATE jobs SET status=?,finished_at=?,result=?,usage=?,error=? WHERE id=? AND status='running'")
      .run(status,new Date().toISOString(),result ? JSON.stringify(result) : null,usage ? JSON.stringify(usage) : null,error,id);
    return changed.changes === 1;
  }
  jobs() {
    return this.db.prepare('SELECT j.*,g.state AS growth_state,g.input AS growth_input FROM jobs j LEFT JOIN growth_requests g ON g.job_id=j.id ORDER BY j.rowid DESC LIMIT 20').all().map(row => ({...row,result:row.result ? JSON.parse(row.result) : null,usage:row.usage ? JSON.parse(row.usage) : null,growth_input:row.growth_input?JSON.parse(row.growth_input):null}));
  }
  job(id) {
    const row=this.db.prepare('SELECT j.*,g.state AS growth_state,g.input AS growth_input FROM jobs j LEFT JOIN growth_requests g ON g.job_id=j.id WHERE j.id=?').get(id);
    return row?{...row,result:row.result?JSON.parse(row.result):null,usage:row.usage?JSON.parse(row.usage):null,growth_input:row.growth_input?JSON.parse(row.growth_input):null}:null;
  }
  addGrowthRequest(jobId,input) {this.db.prepare('INSERT INTO growth_requests VALUES(?,?,?)').run(jobId,'awaiting_image_generation',JSON.stringify(input));}
  watches() {return this.db.prepare('SELECT * FROM watched_files ORDER BY rowid').all();}
  addWatch(filename) {
    const existing=this.db.prepare('SELECT * FROM watched_files WHERE path=?').get(filename);if(existing)return existing;
    const id=randomUUID();this.db.prepare('INSERT INTO watched_files(id,path,name,status) VALUES(?,?,?,?)').run(id,filename,path.basename(filename),'waiting');
    return this.db.prepare('SELECT * FROM watched_files WHERE id=?').get(id);
  }
  updateWatch(id,hash,version,status) {this.db.prepare('UPDATE watched_files SET last_hash=?,version=?,status=? WHERE id=?').run(hash,version,status,id);}
  removeWatch(id) {
    this.transaction(()=>{
      const ids=this.db.prepare("SELECT id FROM observations WHERE source='file_document' AND json_extract(metadata,'$.object_id')=?").all(id);
      for(const row of ids) {this.deleteDerivedJobs(this.db.prepare('SELECT job_id FROM job_sources WHERE observation_id=?').all(row.id).map(x=>x.job_id));this.db.prepare('DELETE FROM observations WHERE id=?').run(row.id);}
      this.db.prepare('DELETE FROM watched_files WHERE id=?').run(id);this.bumpEpoch();
    });
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    this.cleanDerivedFiles();
  }
  deleteObservation(id) {
    if (typeof id !== 'string') throw new Error('invalid_id');
    this.transaction(() => {
      // Remove derived candidates before deleting their source, so summaries
      // cannot restore a deleted observation after a restart.
      this.deleteDerivedJobs(this.db.prepare('SELECT job_id FROM job_sources WHERE observation_id=?').all(id).map(x=>x.job_id));
      this.db.prepare('DELETE FROM observations WHERE id=?').run(id);
      this.cleanSystemContents();
      this.bumpEpoch();
    });
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    this.cleanScreenshots();
    this.cleanDerivedFiles();
  }
  clear() {
    this.transaction(() => { this.db.exec("DELETE FROM jobs; DELETE FROM observations; DELETE FROM watched_files; DELETE FROM meta WHERE key='screen_use_ms';");this.cleanSystemContents(); this.bumpEpoch(); });
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    this.cleanScreenshots();
    this.cleanDerivedFiles();
  }
  close() { this.db.close(); }
}
require('./system-store.cjs')(Store);
require('./screenshot-store.cjs')(Store);
require('./life-store.cjs')(Store);
module.exports = {Store, DEFAULTS, text};
