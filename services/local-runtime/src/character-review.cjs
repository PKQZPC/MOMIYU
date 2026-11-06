// Overall contextual judgment decides adoption; observations are not thresholds.
const POLICY='reference-rules-v7';
const bounded=(s,max=1800)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
function validateCharacterReview(value){
 if(!value||!bounded(value.reason,3000))throw new Error('invalid_character_review');
 const usability=typeof value.usable==='boolean'&&typeof value.identity_consistent==='boolean';if(!usability&&typeof value.accepted!=='boolean')throw new Error('invalid_character_review');
 if(value.growth!==undefined&&(typeof value.growth.demonstrated!=='boolean'||!bounded(value.growth.changes)||!bounded(value.growth.experience_basis)))throw new Error('invalid_character_review');
 if(value.continuity!==undefined&&(typeof value.continuity.supported!=='boolean'||!bounded(value.continuity.reason)))throw new Error('invalid_character_review');
 if(value.revision_guidance!==undefined&&(typeof value.revision_guidance!=='string'||value.revision_guidance.length>3000))throw new Error('invalid_character_review');
 const result={...value,accepted:usability?value.usable&&value.identity_consistent:value.accepted,policy_version:POLICY};if(!result.revision_guidance?.trim())delete result.revision_guidance;return result;
}
module.exports={POLICY,validateCharacterReview};
