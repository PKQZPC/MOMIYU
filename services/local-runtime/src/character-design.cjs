// The character Agent owns the concept; the image endpoint only renders it.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const fields=['concept','experience_basis','continuity','render_prompt'];
function validateDesignConcept(value,{revision=false}={}){
 if(!value||fields.some(k=>typeof value[k]!=='string'||!value[k].trim()||value[k].length>6000)||(value.revision_response!==undefined&&(typeof value.revision_response!=='string'||value.revision_response.length>3000))||(revision&&(typeof value.revision_response!=='string'||!value.revision_response.trim())))throw new Error('invalid_design_concept');
 return Object.fromEntries([...fields,'revision_response'].filter(k=>typeof value[k]==='string').map(k=>[k,value[k]]));
}
function designReferences(input,currentBytes){
 const images=[{id:'image_current',bytes:currentBytes,detail:'high'}];
 for(const id of ['image_historical','image_previous_candidate']){const attachment=input.attachments.find(x=>x.image_id===id);if(!attachment)continue;const filename=fs.realpathSync(path.resolve(root,attachment.relative_path));if(!filename.startsWith(fs.realpathSync(root)+path.sep))throw new Error('design_reference_outside_project');images.push({id,bytes:fs.readFileSync(filename),detail:id==='image_previous_candidate'?'high':'low'});}
 if(input.request.task.previous_candidate_review&&!images.some(x=>x.id==='image_previous_candidate'))throw new Error('revision_candidate_image_required');
 return images;
}
module.exports={validateDesignConcept,designReferences};
