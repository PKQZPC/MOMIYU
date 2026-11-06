// Explicit reviewed revision, never an automatic transport/image retry.
const {POLICY}=require('./character-review.cjs');
function reviseRejectedDesign(store,jobId,reason,{allowHistoricalReview=false}={}){
 if(typeof reason!=='string'||reason.trim().length<20||reason.length>1000)throw new Error('revision_reason_required');
 const row=store.db.prepare('SELECT * FROM growth_requests WHERE job_id=?').get(jobId),input=row&&JSON.parse(row.input),previous=input?.lifecycle;
 if(row?.state!=='rejected'||previous?.design_review?.accepted!==false||(!allowHistoricalReview&&previous.design_review.policy_version!==POLICY))throw new Error('reviewed_rejection_required');
 if(previous.base_version!==store.currentAppearance().id)throw new Error('stale_candidate');
 const historical=previous.design_review.policy_version!==POLICY;
 (input.previous_design_attempts||=[]).push({at:new Date().toISOString(),reason,historical_review:historical,request:structuredClone(input.request),lifecycle:previous});
 input.request.task={...input.request.task,previous_candidate_review:{image_id:'image_previous_candidate',reason:previous.design_review.reason,growth:previous.design_review.growth,...(!historical?{continuity:previous.design_review.continuity}:{}),revision_guidance:previous.design_review.revision_guidance,previous_concept:previous.design_concept}};
 input.attachments=(input.attachments||[]).filter(x=>x.image_id!=='image_previous_candidate');input.attachments.push({image_id:'image_previous_candidate',relative_path:previous.design});
 input.request.visual_references=input.request.visual_references.filter(x=>x.role!=='previous_candidate');input.request.visual_references.push({image_id:'image_previous_candidate',role:'previous_candidate',description:'上一次未采用、供本次修订对照的实际候选；不属于已生效的成长历史。'});
 input.lifecycle={judged:true,base_version:previous.base_version,pages:[],reviews:[]};
 store.db.prepare('UPDATE growth_requests SET state=?,input=? WHERE job_id=?').run('awaiting_image_generation',JSON.stringify(input),jobId);
 return {mode:'awaiting_image_generation',previous_design:previous.design};
}
module.exports={reviseRejectedDesign};
