const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),string={type:'string'};
module.exports=[
 {type:'function',name:'search_experiences',description:'检索用户已授权的本地经历。query为简短主题或空格分隔的关键词。返回实际记录和是否截断。',strict:true,parameters:object({query:string})},
 {type:'function',name:'read_experience',description:'读取一条已经授权的本地经历，id必须来自实际工具结果或提供的记录索引。',strict:true,parameters:object({id:string})},
 {type:'function',name:'save_result',description:'在本次任务目录新建md、txt或json结果文件。不覆盖已有文件，不支持任意路径。name为简短文件名，content为完整交付文本。',strict:true,parameters:object({name:string,content:string})}
];
