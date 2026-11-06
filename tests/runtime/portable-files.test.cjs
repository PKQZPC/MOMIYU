const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const {Store}=require('../../services/local-runtime/src/store.cjs');
const {readDocument}=require('../../services/local-runtime/src/file-observer.cjs');
const {configurePaths,projectDirectory}=require('../../apps/desktop/paths.cjs');
const cache=path.resolve(__dirname,'../../.local/portable-tests');fs.mkdirSync(cache,{recursive:true});
function fixture(t,options) {
  const directory=fs.mkdtempSync(path.join(cache,'case-')),runtime=new Runtime(directory,options);
  runtime.chooseEgg('ivory');
  t.after(()=>{runtime.close();if(path.dirname(directory)!==cache)throw new Error('unsafe_cleanup');fs.rmSync(directory,{recursive:true,force:true});});
  return {runtime,directory};
}
const waitFor=async predicate=>{const end=Date.now()+3500;while(!predicate()){if(Date.now()>end)throw new Error('observation_timeout');await new Promise(resolve=>setTimeout(resolve,60));}};
function result(rows,grow=false) {return {summary:'整理了文件中的一次尝试。',experiences:[{description:'文件记录了一次尝试与纠正。',source_refs:[rows[0].id]}],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:grow,reason:grow?'持续的尝试与纠正带来了新的积累。':'先继续积累。'}};}

test('portable path configuration keeps every Electron data category inside the project',t=>{
  const {directory}=fixture(t);const calls={};const app={setPath:(name,value)=>{calls[name]=value;},setAppLogsPath:value=>{calls.logs=value;},commandLine:{appendSwitch:(_name,value)=>{calls.cache=value;}}};
  const previousTemp=process.env.TEMP,previousTmp=process.env.TMP;
  try{const paths=configurePaths(app,directory);for(const value of Object.values(calls))assert.ok(value.startsWith(directory+path.sep));assert.equal(process.env.TEMP,paths.temp);}
  finally{if(previousTemp===undefined)delete process.env.TEMP;else process.env.TEMP=previousTemp;if(previousTmp===undefined)delete process.env.TMP;else process.env.TMP=previousTmp;}
  assert.throws(()=>projectDirectory(directory,path.resolve(directory,'..','outside')),/outside_project/);
});
test('real selected-file saves produce versions; identical saves and unselected siblings do not',async t=>{
  const {runtime,directory}=fixture(t);const filename=path.join(directory,'chosen.md'),other=path.join(directory,'other.md');fs.writeFileSync(filename,'  original content\n');
  assert.throws(()=>runtime.watchFile(filename),/collection_disabled/);runtime.settings({saveFiles:true});const id=runtime.watchFile(filename);
  assert.equal(runtime.snapshot().observations[0].content,'  original content\n');assert.equal(runtime.snapshot().observations[0].role,'observation');
  fs.writeFileSync(other,'not selected');fs.writeFileSync(filename,'corrected content');
  await waitFor(()=>runtime.snapshot().observations.length===2);
  const rows=runtime.snapshot().observations;assert.equal(rows[1].metadata.version,2);assert.equal(rows[1].metadata.previous_version,1);assert.equal(rows[1].metadata.object_id,id);
  fs.writeFileSync(filename,'corrected content');await new Promise(resolve=>setTimeout(resolve,400));assert.equal(runtime.snapshot().observations.length,2);
  runtime.settings({saveFiles:false});fs.writeFileSync(filename,'paused change');await new Promise(resolve=>setTimeout(resolve,400));assert.equal(runtime.snapshot().observations.length,2);
});
test('bounded file ingestion preserves complete Unicode content including empty versions',t=>{
  const {runtime,directory}=fixture(t);runtime.settings({saveFiles:true});const filename=path.join(directory,'unicode.txt'),content='x'.repeat(3999)+'🦊'+ '日'.repeat(2000);fs.writeFileSync(filename,content);
  const id=runtime.watchFile(filename);const rows=runtime.snapshot().observations;assert.ok(rows.every(row=>row.content.length<=4000));assert.equal(rows.map(row=>row.content).join(''),content);
  fs.writeFileSync(filename,'');runtime.files.scan(id);assert.equal(runtime.snapshot().observations.at(-1).content,'');assert.equal(runtime.snapshot().watches[0].version,2);
  const large=path.join(directory,'large.txt');fs.writeFileSync(large,'a'.repeat(32769));assert.throws(()=>readDocument(large),/too_large/);
});
test('schema v1 migrates to v2 without losing records',t=>{
  const {runtime,directory}=fixture(t);runtime.settings({saveNotes:true});runtime.note('existing record');runtime.store.db.exec("ALTER TABLE observations DROP COLUMN metadata; UPDATE meta SET value='1' WHERE key='schema_version';");
  runtime.close();runtime.closed=false;runtime.store=new Store(directory);runtime.files.store=runtime.store;
  assert.equal(runtime.snapshot().observations[0].content,'existing record');assert.equal(runtime.snapshot().observations[0].metadata,null);assert.equal(runtime.store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value,'2');
});
test('selected-file permissions gate sleep; growth preparation has actual reference and no prescribed visual change',async t=>{
  let calls=0;const {runtime,directory}=fixture(t,{model:async(_settings,_system,input)=>{calls++;const rows=JSON.parse(input);assert.ok(rows.every(row=>row.source==='file_document'));return {text:JSON.stringify(result(rows,true)),usage:{total_tokens:50}};}});
  runtime.settings({saveFiles:true,modelEnabled:true});const filename=path.join(directory,'notes.md');fs.writeFileSync(filename,'第一次尝试失败，比较结果后改正方法。');const id=runtime.watchFile(filename);
  assert.equal((await runtime.sleep()).mode,'rest');assert.equal(calls,0);
  runtime.settings({sendFiles:true});await runtime.sleep();const job=runtime.snapshot().jobs[0];assert.equal(job.growth_state,'awaiting_image_generation');
  assert.equal(job.growth_input.request.growth_context,'持续的尝试与纠正带来了新的积累。');assert.equal(job.growth_input.request.visual_references[0].role,'current_form');
  assert.ok(fs.existsSync(path.resolve(__dirname,'../..',job.growth_input.attachments[0].relative_path)));assert.equal(job.growth_input.attachments[0].sha256.length,64);
  runtime.unwatchFile(id);assert.equal(runtime.snapshot().watches.length,0);assert.equal(runtime.snapshot().jobs.length,0);assert.equal(runtime.snapshot().observations.length,0);
});
