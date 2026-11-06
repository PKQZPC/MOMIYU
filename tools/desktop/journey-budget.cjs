// Explicit additive approval; call accounting is never reset by an extension.
function extendBudget(ledger,next,reason){
 const old=ledger.budget;
 if(!old||typeof reason!=='string'||reason.length<20||reason.length>700||next.approved!==true||next.model!==old.model||next.automatic_retries!==0||!Number.isInteger(next.image_calls)||!Number.isInteger(next.model_calls)||next.image_calls<old.image_calls||next.model_calls<old.model_calls||next.image_calls>9||next.model_calls>32)throw new Error('invalid_budget_extension');
 (ledger.budget_revisions||=[]).push({at:new Date().toISOString(),previous:old,current:next,reason});ledger.budget=next;
}
module.exports={extendBudget};
