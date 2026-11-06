// Fork a completed synthetic run at its hatch checkpoint. Keep the source
// untouched and remove future evidence/results from the continuation profile.
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync,backup}=require('node:sqlite'),{createHash,randomUUID}=require('node:crypto');
const {Store}=require('../../services/local-runtime/src/store.cjs');
const root=path.resolve(__dirname,'../..'),source=path.resolve(root,process.argv[2]||'');
if(!source.startsWith(path.join(root,'demo_data/.local/runs/egg_journey')+path.sep))throw new Error('invalid_source_run');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceLedgerBytes=fs.readFileSync(path.join(source,'ledger.json')),sourceLedger=JSON.parse(sourceLedgerBytes);
if(sourceLedger.status!=='completed'||sourceLedger.dataset.id!=='egg_journey')throw new Error('completed_synthetic_source_required');
const version=sourceLedger.dataset.version;if(!/^v\d+$/.test(version))throw new Error('invalid_source_dataset');
const dataset=path.join(root,'demo_data/scenarios/egg_journey',version),manifestBytes=fs.readFileSync(path.join(dataset,'manifest.json')),manifest=JSON.parse(manifestBytes);if(hash(manifestBytes)!==sourceLedger.dataset.sha256)throw new Error('source_dataset_mismatch');
const run=path.join(root,'demo_data/.local/runs/egg_journey',version,new Date().toISOString().replace(/[:.]/g,'-')+'-revalidation-'+randomUUID().slice(0,8)),profile=path.join(run,'profile');
fs.mkdirSync(profile,{recursive:true});
(async()=>{const original=new DatabaseSync(path.join(source,'profile/momiyu.sqlite'),{readOnly:true});let store;try{
 const checkpoint=original.prepare("SELECT rowid,* FROM appearance_versions WHERE state='active' AND json_extract(payload,'$.stage')='juvenile' ORDER BY rowid LIMIT 1").get();if(!checkpoint)throw new Error('hatch_checkpoint_missing');
 const payload=JSON.parse(checkpoint.payload),checkpointHash=hash(fs.readFileSync(path.join(root,checkpoint.path))),later=original.prepare('SELECT id,job_id FROM appearance_versions WHERE rowid>? ORDER BY rowid').all(checkpoint.rowid);
 await backup(original,path.join(profile,'momiyu.sqlite'));store=new Store(profile);
 store.transaction(()=>store.deleteDerivedJobs(later.map(x=>x.job_id)));
 for(const row of store.db.prepare('SELECT id FROM observations WHERE id NOT IN (SELECT observation_id FROM job_sources)').all())store.deleteObservation(row.id);
 const oldBase=path.relative(root,path.join(source,'profile/appearances')),newBase=path.relative(root,path.join(profile,'appearances')),replace=value=>typeof value==='string'&&value.startsWith(oldBase+path.sep)?newBase+value.slice(oldBase.length):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
 const keep=new Set();for(const row of store.db.prepare('SELECT path,payload FROM appearance_versions').all()){const p=JSON.parse(row.payload);for(const file of [row.path,p.design_path,...(p.material_pages||[])].filter(Boolean))if(file.startsWith(oldBase+path.sep))keep.add(file);}
 fs.mkdirSync(path.join(profile,'appearances'),{recursive:true});for(const file of keep)fs.copyFileSync(path.join(root,file),path.join(root,replace(file)));
 store.transaction(()=>{
  for(const row of store.db.prepare('SELECT id,path,payload FROM appearance_versions').all())store.db.prepare('UPDATE appearance_versions SET path=?,payload=? WHERE id=?').run(replace(row.path),JSON.stringify(replace(JSON.parse(row.payload))),row.id);
  for(const row of store.db.prepare('SELECT job_id,input FROM growth_requests').all())store.db.prepare('UPDATE growth_requests SET input=? WHERE job_id=?').run(JSON.stringify(replace(JSON.parse(row.input))),row.job_id);
 });
 store.patchSettings({modelEnabled:false,imageGeneration:false,resting:false,saveSystem:false,saveScreenshots:false});
 const priorBatches=sourceLedger.batches.filter(b=>b.status==='completed'&&manifest.files.slice(0,2).some(f=>path.basename(f.path,'.json')===b.id));if(priorBatches.length!==2)throw new Error('hatch_batches_missing');
 const seed={source_run:path.relative(root,source),source_ledger_sha256:hash(sourceLedgerBytes),appearance_id:checkpoint.id,appearance_sha256:checkpointHash,checkpoint:'after_hatching',completed_batch_ids:priorBatches.map(b=>b.id),excluded_experiment_versions:later.map(x=>x.id)};
 store.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('demo_dataset',JSON.stringify({id:'egg_journey',version}));store.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('revalidation_seed',JSON.stringify(seed));
 if(store.currentAppearance().id!==checkpoint.id||store.observations().length!==5||store.appearanceHistory().length!==1)throw new Error('invalid_fork_checkpoint');
 const ledger={schema_version:2,provenance:'synthetic',dataset:{id:'egg_journey',version,sha256:hash(manifestBytes)},status:'prepared',seed,calls:[],batches:priorBatches.map(b=>({...b,reused_from:seed.source_run})),events:[],code_hashes:{},profile:path.relative(root,profile),total_tokens:0};fs.writeFileSync(path.join(run,'ledger.json'),JSON.stringify(ledger,null,2)+'\n');
 fs.writeFileSync(path.join(run,'prepared.json'),JSON.stringify({seed,retained_observations:store.observations().length,appearance:store.currentAppearance().id,excluded_later_evidence:true,model_calls:0,image_calls:0},null,2));console.log(JSON.stringify({dataset_version:version,reused_batches:seed.completed_batch_ids,seed_appearance:checkpoint.id,run_directory:path.relative(root,run),external_calls:0}));
}finally{store?.close();original.close();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
