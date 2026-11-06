// Revalidate and checkpoint a successful saved Agent output after a local
// contract correction. No model call, invented action or publication occurs.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {validatePlan}=require('../../services/local-runtime/src/action-contract.cjs');
const root=path.resolve(__dirname,'../..'),args=process.argv.slice(2),run=path.resolve(root,args[0]||''),call=Number(args[1]);
if(!run.startsWith(path.join(root,'demo_data/.local/runs')+path.sep)||!Number.isInteger(call))throw new Error('invalid_recovery_input');
const ledgerPath=path.join(run,'ledger.json'),ledger=JSON.parse(fs.readFileSync(ledgerPath)),raw=fs.readFileSync(path.join(run,'call-'+call+'.json')),response=JSON.parse(raw);
if(!response.system.startsWith('你负责为新形象')||!ledger.calls.some(c=>c.id===call&&c.status==='completed')||ledger.calls.some(c=>c.status==='reserved'))throw new Error('not_successful_plan_output');
const db=new DatabaseSync(path.join(run,'profile/momiyu.sqlite'));
try{const row=db.prepare("SELECT job_id,input FROM growth_requests WHERE state='awaiting_review' ORDER BY rowid DESC LIMIT 1").get();if(!row)throw new Error('no_pending_plan');const input=JSON.parse(row.input);if(input.lifecycle.plan||!input.lifecycle.design_review.accepted)throw new Error('plan_not_recoverable');const source=JSON.parse(response.input),plan=validatePlan(JSON.parse(response.result.text),source.current_actions);input.lifecycle.plan=plan;input.lifecycle.skills=source.skills;
 db.prepare('UPDATE growth_requests SET state=?,input=? WHERE job_id=?').run('awaiting_materials',JSON.stringify(input),row.job_id);(ledger.local_recoveries||=([])).push({job_id:row.job_id,source_call:call,source_sha256:createHash('sha256').update(raw).digest('hex'),reason:'Accept valid stable custom action namespaces; preserve the successful Agent output without repeating its request.',at:new Date().toISOString()});fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');console.log('Saved original Agent plan: '+plan.actions.length+' actions, '+plan.pages+' pages; no API calls.');
}finally{db.close();}
