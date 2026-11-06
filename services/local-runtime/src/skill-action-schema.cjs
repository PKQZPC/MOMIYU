const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),string={type:'string'};
module.exports=object({action:{anyOf:[object({type:{type:'string',enum:['complete']},summary:string,result:string}),object({type:{type:'string',enum:['blocked']},reason:string})]}});
