// Actual Windows pixels, without opening or switching any window.
// An isolated test clock starts due; the product interval stays 30 minutes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Runtime}=require('../../services/local-runtime/src/runtime.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.local/windows-capture/independent-check');fs.mkdirSync(out,{recursive:true});
let analyzedImage;
let changed;const wait=new Promise(resolve=>changed=resolve);
const runtime=new Runtime(fs.mkdtempSync(path.join(out,'data-')),{screenshotOnly:true,model:async(_settings,_prompt,input,options)=>{const sources=JSON.parse(input).map(row=>row.source);assert.ok(sources.includes('system_screenshot'));assert.ok(sources.includes('raw_input'));analyzedImage=options.images[0].dataUrl;return {text:JSON.stringify({summary:'Screenshot evidence verified',experiences:[],user_understanding:[],workflow_candidates:[],skill_candidates:[],growth:{should_change:false,reason:'Test capture only'}})};},changed:state=>{if(state.observations.some(x=>x.source==='system_screenshot'))changed();}});
async function run(){let timeout;try{
 runtime.store.db.prepare("INSERT OR REPLACE INTO meta VALUES('screen_use_ms','1800000')").run();runtime.settings({saveScreenshots:true});
 await Promise.race([wait,new Promise((_,reject)=>timeout=setTimeout(()=>reject(new Error('actual_screenshot_timeout: '+runtime.screen.status)),20000))]);
 const row=runtime.store.observations().find(x=>x.source==='system_screenshot');assert.ok(row);assert.equal(runtime.store.settings().saveSystem,false);
 const data=runtime.store.readScreenshot(row.id);runtime.chooseEgg('ivory');
 runtime.store.patchSettings({saveRawInput:true,sendRawInput:true});
 runtime.rawInput.startedAt=new Date().toISOString();runtime.rawInput.keys.push(77,79,77,73);
 runtime.settings({modelEnabled:true,sendScreenshots:true});
 assert.equal((await runtime.sleep()).mode,'analyzed');assert.equal(analyzedImage,data);assert.equal(runtime.store.jobs()[0].status,'completed');
 const original=runtime.store.db.prepare('SELECT payload FROM screen_events WHERE observation_id=?').get(row.id);const picture={...JSON.parse(original.payload).screenshot,png:data.split(',')[1]};
 const reuse=runtime.store.ingestScreen({event_id:require('node:crypto').randomUUID(),occurred_at:new Date().toISOString(),screenshot:picture});assert.equal(reuse.screenshot.reused,true);
 const report={status:'passed',actual_windows_capture:true,sleep_with_mock_model:true,raw_input_fixture:true,interface_observation:false,browser_opened:false,reused:reuse.screenshot.reused,files:fs.readdirSync(runtime.store.screenDirectory).length,width:row.metadata.screenshot.width,height:row.metadata.screenshot.height,model_calls:0,database:path.relative(root,runtime.store.filename),generated_at:new Date().toISOString()};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{clearTimeout(timeout);runtime.close();}}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
