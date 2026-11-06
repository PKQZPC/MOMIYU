const REQUIRED=['base.idle','base.greet','sleep.rest','sleep.wake'];
function validatePlan(plan,previous,{availablePages=null,required=REQUIRED}={}){
 if(!plan||!Array.isArray(plan.actions)||plan.actions.length<4||plan.actions.length>16)throw new Error('invalid_action_plan');
 const seen=new Set(),prior=new Set([...(previous?.actions||[]),...(previous?.states||[])].map(x=>x.id));
 for(const a of plan.actions){
  if(!/^[a-z][a-z0-9_]*(?:\.[a-zA-Z0-9_-]+)+$/.test(a.id)||a.id.length>120||seen.has(a.id)||!['inherited','adapted','new'].includes(a.change)||!['name','description','trigger','reason'].every(k=>typeof a[k]==='string'&&a[k].trim()&&a[k].length<=700)||!Array.isArray(a.frames)||!a.frames.length||a.frames.length>8||a.frames.some(n=>!Number.isInteger(n)||n<0||n>17)||!Number.isFinite(a.fps)||a.fps<1||a.fps>12)throw new Error('invalid_action_plan');
  if((a.change==='inherited'||a.change==='adapted')&&!prior.has(a.id))throw new Error('invalid_action_inheritance');
  if(a.change==='new'&&prior.has(a.id))throw new Error('invalid_action_inheritance');seen.add(a.id);
 }
 if(required.some(id=>!seen.has(id)))throw new Error('missing_required_action');
 const slots=plan.actions.flatMap(a=>a.frames),pages=availablePages||Math.floor(Math.max(...slots)/6)+1;
 if(availablePages&&(!Number.isInteger(availablePages)||availablePages<1||availablePages>3||slots.some(n=>n>=availablePages*6)))throw new Error('invalid_material_page');
 if(!availablePages&&!plan.poses)for(let i=0;i<pages*6;i++)if(!slots.includes(i))throw new Error('unassigned_material_slot');
 if(plan.poses&&(!Array.isArray(plan.poses)||plan.poses.length!==pages*6||new Set(plan.poses.map(p=>p.index)).size!==pages*6||plan.poses.some(p=>!Number.isInteger(p.index)||p.index<0||p.index>=pages*6||typeof p.description!=='string'||!p.description.trim()||p.description.length>1200)))throw new Error('invalid_pose_descriptions');
 const idle=plan.actions.find(x=>x.id==='base.idle'),rest=plan.actions.find(x=>x.id==='sleep.rest');if(idle&&rest&&rest.frames.some(n=>idle.frames.includes(n)))throw new Error('sleep_requires_own_material');
 return {...plan,pages};
}
function bindingsFor(plan){return Object.fromEntries(plan.actions.map(a=>[a.id,{frames:a.frames.map(n=>({page:Math.floor(n/6),pose:n%6})),fps:a.fps,loop:!!a.loop}]));}
module.exports={REQUIRED,validatePlan,bindingsFor};
