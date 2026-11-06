const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
function prepareGrowth(result,projectRoot,current) {
  if(!result.growth.should_change)return null;
  const relativePath=current?path.relative(projectRoot,current.filename).split(path.sep).join('/'):'demos/pet-animation/assets/body-poses.png',filename=path.join(projectRoot,relativePath);
  const reference=fs.readFileSync(filename);
  const promptPath='services/local-runtime/prompts/image-agent.txt';
  return {
    system_prompt:{relative_path:promptPath,sha256:createHash('sha256').update(fs.readFileSync(path.join(projectRoot,promptPath))).digest('hex')},
    request:{task:{kind:current?.id.startsWith('egg_')?'hatchling_candidate':'evolution_candidate',development_context:current?.id.startsWith('egg_')?'当前个体还在蛋中，正在积累共同经历。':!current||current.id==='sample_appearance_v1'?'当前个体为幼体，尚未发生过外观进化。':'当前个体已有形态历史，本次在最新形象基础上继续成长。'},
      growth_context:result.growth.reason,experiences:result.experiences,
      ...(result.user_understanding.length?{user_understanding:result.user_understanding}:{}),
      visual_references:[{image_id:'image_current',role:'current_form',description:'当前个体正在使用的形象参考。',version:current?.id||'sample_appearance_v1'}],
      delivery_requirements:{purpose:'形象设计参考图',canvas:'1024×1024 PNG',composition:'单个完整角色，身体不被裁切，四周留出适当空间。',background:'简单中性背景。'}},
    attachments:[{image_id:'image_current',relative_path:relativePath,sha256:createHash('sha256').update(reference).digest('hex')}],
  };
}
module.exports={prepareGrowth};
