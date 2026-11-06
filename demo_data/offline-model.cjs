// Scripted model responses for the public offline walkthrough, never real AI.
const assert=require('node:assert/strict');
const bindings=[['base.idle','Quiet company',[0]],['base.greet','A small greeting',[0,1,2,0]],['sleep.rest','Resting',[3]],['sleep.wake','Waking up',[3,4,5,0]]];
function createOfflineModel(){
 const state={round:0,learnCandidate:false,calls:[]};
 const plan=previous=>({poses:Array.from({length:6},(_,index)=>({index,description:index===3?'Eyes closed, lying down asleep.':'Example key pose '+index})),actions:bindings.map(([id,name,frames])=>({id,name,frames,description:'Example key poses, not continuous animation.',trigger:id,change:[...(previous.actions||[]),...(previous.states||[])].some(a=>a.id===id)?'adapted':'new',reason:'Scripted egg-to-juvenile adaptation.',fps:3,loop:id==='sleep.rest'}))});
 const model=async(_settings,system,input)=>{
  const v=JSON.parse(input);let answer;state.calls.push(system.split('\n')[0]);
  if(system.startsWith('你负责整理')){
   state.round++;const refs=v.map(r=>r.id),candidate=state.learnCandidate;state.learnCandidate=false;
   answer={summary:'[Offline demo] '+(candidate?'A reusable explanation method is proposed.':'Shared experiences organized.'),experiences:[{description:v.map(r=>r.content).join('\n'),source_refs:refs}],user_understanding:[],workflow_candidates:candidate||state.round>=4?[{description:'Explain a recorded process, retain branches and sources, and keep unknown outcomes explicit.',source_refs:refs}]:[],skill_candidates:candidate?[{name:'线索成图',description:'MIMO 会把零散记录整理成清楚的步骤、分支和交接说明。',method:'先读原始记录，提取主流程和实际分支，画出关系，补充问答并保留未知事项。',source_refs:refs}]:[],growth:{should_change:false,reason:'The separate growth service decides.'}};
  }else if(system.startsWith('你负责判断这只'))answer={should_change:state.round===2,reason:state.round===2?'[Offline demo] Exercise hatching after the second synthetic batch.':'[Offline demo] Keep accumulating.'};
  else if(system.startsWith('你负责自主构思'))answer={concept:'Use the included example juvenile for this offline demonstration.',experience_basis:'Scripted response to the synthetic dataset.',continuity:'Exercise the actual egg-to-juvenile lineage contract.',render_prompt:'Return the included example character asset; no image API is called.'};
  else if(system.startsWith('你负责为新形象'))answer=plan(v.current_actions);
  else if(system.startsWith('你负责核对候选角色')||system.startsWith('你负责检查同一只'))answer=v.mode==='design'?{usable:true,identity_consistent:true,reason:'[Offline demo] Scripted review of the included example asset.',name:'MIMO'}:{accepted:true,reason:'[Offline demo] Fixture poses, not a visual AI judgment.',action_checks:v.actions.map(a=>({id:a.id,accepted:true,reason:'Scripted fixture check.'}))};
  else if(system.startsWith('你负责为宠物的一项技能'))answer={poses:Array.from({length:6},(_,index)=>({index,description:'Offline skill key pose '+index})),actions:v.required_actions.map((id,i)=>({id,name:['Gather clues','Read the record','Found a path','Pause and reconsider','Settle down'][i],description:'Offline fixture pose for this task state.',trigger:id,change:'new',reason:'Demonstrate state binding only.',frames:[[0,1,0],[0,2],[1,0],[4,0],[5,0]][i],fps:3,loop:i===1}))};
  else if(system.startsWith('你核对一项技能的动作'))answer={accepted:true,reason:'[Offline demo] Example material matches the fixture contract.',action_checks:v.plan.actions.map(a=>({id:a.id,accepted:true,reason:'Scripted fixture check.'}))};
  else if(system.startsWith('你负责用固定')){
   assert.equal(v.prefix.length,1);assert.equal(v.continuation,undefined);assert.equal(v.workflow,undefined);
   answer={applicable:true,next_step:'Extract the main steps and the actual exception branch.',expected_result:'A sourced handoff explanation that preserves unknown cases.',reason:'[Offline demo] The observed prefix matches the candidate method.'};
  }else if(system.startsWith('你负责核对'))answer={verdict:'supported',reason:'[Offline demo] The scripted continuation follows the candidate method.',supported_scope:'The included synthetic process-explanation cases.',limitations:'No real-world reliability claim or internet access.'};
  else if(system.startsWith('你负责结合固定'))answer={learned:true,proficiency:'演示熟练度 · 能整理案例中的交接记录',reason:'[Offline demo] Later prefix checks and real local-tool trial are present.'};
  else if(system.startsWith('你是宠物的技能执行')){
   const steps=v.history||[],saved=steps.find(s=>s.tool==='save_result'),found=steps.find(s=>s.tool==='search_experiences');
   if(!found)return {toolCall:{call_id:'demo_search',name:'search_experiences',arguments:JSON.stringify({query:v.task.includes('读书会')?'读书会':'社团'})}};
   const rows=Array.isArray(found.result)?found.result:JSON.parse(found.result||'[]');
   const content='# Offline demo handoff\n\nThis file was created by MOMIYU’s real local tool. The model decisions are scripted.\n\n## Recorded evidence\n\n'+rows.map(r=>'- '+r.content).join('\n')+'\n\n## Method\n\n```mermaid\nflowchart LR\n  A[Read the record] --> B[Extract main steps]\n  B --> C{Actual exception recorded?}\n  C -->|Yes| D[Explain branch and return point]\n  C -->|No| E[Keep unknown cases explicit]\n  D --> F[Save handoff]\n  E --> F\n```\n\n## Questions\n\n- What is supported? The observations quoted above.\n- What still needs checking? Cases absent from the records.\n';
   if(!saved)return {toolCall:{call_id:'demo_save',name:'save_result',arguments:JSON.stringify({name:'handoff.md',content})}};
   answer={action:{type:'complete',summary:'线索已经收成一份交接说明，流程图和待确认事项也放好啦。',result:content}};
  }else throw Error('unexpected_offline_agent:'+system.slice(0,30));
  return {text:JSON.stringify(answer)};
 };
 return {model,state};
}
module.exports={createOfflineModel};
