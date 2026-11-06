const {contextBridge,ipcRenderer} = require('electron');
const operations = new Set(['state','panel','rest','wake','quit','settings','chat','note','remove','clear','cancel','proxy','choose-file','unwatch-file','check-connection','screenshot','appearance','use-skill','prepare-skill','skill-appearance','grow','choose-egg','egg-options','create-account','switch-account','sign-out','ack-hatch','bind-chatgpt','unbind-chatgpt','chatgpt-usage','chatgpt-usage-history','nap-compose']);
contextBridge.exposeInMainWorld('momiyu',{
  invoke:async (operation,payload) => {
    if (!operations.has(operation)) throw new Error('unknown_operation');
    const response = await ipcRenderer.invoke('momiyu:invoke',operation,payload);
    if (!response.ok) throw new Error(response.error);
    return response.value;
  },
  subscribe:listener => {
    const handler = (_event,value) => listener(value);
    ipcRenderer.on('momiyu:state',handler);
    return () => ipcRenderer.removeListener('momiyu:state',handler);
  },
  onPage:listener => {
    const handler=(_event,page)=>listener(page);
    ipcRenderer.on('momiyu:page',handler);
    return ()=>ipcRenderer.removeListener('momiyu:page',handler);
  },
  hover:value => { if (typeof value === 'boolean') ipcRenderer.send('momiyu:hover',value); },
  drag:(phase,point) => { if (['start','move','end'].includes(phase)) ipcRenderer.send('momiyu:drag',phase,point); },
});
