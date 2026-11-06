const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petBridge',Object.freeze({
  readPack:version=>ipcRenderer.invoke('m0:pet-pack',version),
  hover:value=>ipcRenderer.send('m0:pet-hover',value),
}));
