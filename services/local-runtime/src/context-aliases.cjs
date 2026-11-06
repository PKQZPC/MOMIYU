// Present short stable-per-request IDs; never fuzzy-match a model's UUID.
function aliasLifeContext(context){
 const entries=new Map(),skills=new Map(),presented=structuredClone(context);
 presented.entries.forEach((x,i)=>{const alias='m'+String(i+1).padStart(2,'0');entries.set(alias,x.id);x.id=alias;});
 presented.skills.forEach((x,i)=>{const alias='s'+String(i+1).padStart(2,'0');skills.set(alias,x.id);x.id=alias;});
 return {presented,entries,skills};
}
function restoreContextLinks(result,aliases){
 const resolve=(id,map,error)=>map.get(id)||([...map.values()].includes(id)?id:(()=>{throw new Error(error);})());
 for(const skill of result.skill_candidates)if(skill.related_skill_id)skill.related_skill_id=resolve(skill.related_skill_id,aliases.skills,'invalid_skill_reference');
 for(const update of result.memory_updates||[])update.entry_id=resolve(update.entry_id,aliases.entries,'invalid_memory_reference');
 return result;
}
module.exports={aliasLifeContext,restoreContextLinks};
