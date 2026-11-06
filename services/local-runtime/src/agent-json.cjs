// Accept a JSON object, optionally enclosed in one Markdown JSON fence.
// Never execute or extract code from prose surrounding an object.
function parseAgentJSON(text){
 if(typeof text!=='string')throw new Error('invalid_agent_output');
 const match=text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
 try{const value=JSON.parse(match?match[1]:text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new Error('invalid_agent_output');}
}
module.exports={parseAgentJSON};
