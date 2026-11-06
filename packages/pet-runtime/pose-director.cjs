(function(root){
 class PoseDirector{
  constructor(plan){this.setPlan(plan);this.resting=false;this.hovered=false;this.armed=true;this.until=0;this.wakeUntil=0;this.task=null;this.taskKey='';this.taskSeen=false;}
  setPlan(plan){this.plan=plan||{bindings:{'base.idle':{pose:0}},missing:['action_map']};this.until=0;this.wakeUntil=0;}
  pointerInside(value){if(!value)this.armed=true;}
  hover(value,now){if(value&&!this.hovered&&this.armed&&!this.resting){this.greet(now);this.armed=false;}this.hovered=!!value;if(!value)this.until=0;}
  duration(binding,fallback){return binding?.frames?.length&&Number.isFinite(binding.fps)&&binding.fps>0?Math.max(100,Math.min(8000,binding.frames.length/binding.fps*1000)):fallback;}
  greet(now){if(!this.resting)this.until=now+this.duration(this.plan.bindings['base.greet'],850);}
  rest(value,now){if(this.resting&&!value)this.wakeUntil=now+this.duration(this.plan.bindings['sleep.wake'],700);this.resting=!!value;if(value){this.until=0;this.wakeUntil=0;}}
  setTask(value,now){const key=value?value.id+':'+value.status:'';if(key===this.taskKey)return;const terminal=value&&['success','failed','cancelled'].includes(value.status);const historical=!this.taskSeen&&terminal;this.taskSeen=true;this.taskKey=key;this.task=historical?null:value;this.taskAt=now;}
  select(now){
   let action='base.idle',binding;
   if(this.resting)action='sleep.rest';
   else if(this.task){const terminal=['success','failed','cancelled'].includes(this.task.status),motion=this.task.assets?.pose_bindings?.[this.task.status];if(!terminal||now-this.taskAt<this.duration(motion,900)){action='skill.'+this.task.status;binding=motion;}}
   if(action==='base.idle'&&now<this.wakeUntil)action='sleep.wake';
   if(action==='base.idle'&&this.hovered&&now<this.until)action='base.greet';
   binding=binding||this.plan.bindings[action];
   if(action==='base.idle'&&!this.hovered&&binding?.frames?.length)binding={...binding,frames:[binding.frames[0]],loop:false};
   return {action,binding:binding||this.plan.bindings['base.idle']||{pose:0},missing:!binding};
  }
 }
 const api={PoseDirector};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MomiyuPoseDirector=api;
})(globalThis);
