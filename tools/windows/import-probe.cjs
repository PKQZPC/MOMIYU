// Ingest only the explicitly generated synthetic native-probe stream.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.local/windows-capture/probe');
const records=JSON.parse(fs.readFileSync(path.join(out,'events.json'),'utf8').replace(/^\uFEFF/,''));
const report=JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8').replace(/^\uFEFF/,''));assert.equal(report.status,'passed');
const runtime=new Runtime(fs.mkdtempSync(path.join(out,'database-')),{observerFactory:()=>({start(){},stop(){},snapshot(){return {status:'off'};}})});
try{
 runtime.settings({saveSystem:true,systemApps:'powershell'});const accepted=[];for(const record of records)if(record.type==='event')accepted.push(runtime.store.ingestSystem(record.value));
 assert.ok(accepted.length>=3);const rows=runtime.store.observations();assert.ok(rows.every(row=>row.source==='system_interface'));assert.ok(rows.some(row=>row.content.includes('choice applied')));assert.ok(!JSON.stringify(rows).includes('UNSUBMITTED_NATIVE_SENTINEL'));
 const action=accepted.find(item=>runtime.store.systemEvidence(item.id,item.seq).event.kind==='action');assert.ok(action);assert.ok(!JSON.stringify(runtime.store.systemEvidence(action.id,action.seq)).includes('choice applied'));
 const result={status:'passed',native_events_ingested:accepted.length,model_calls:0,database:path.relative(root,runtime.store.filename),prefix_isolated:true};fs.writeFileSync(path.join(out,'store-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{runtime.close();}
