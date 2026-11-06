// Bounded ablation of the old data URL and resizable flag. No visible windows.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {inspectFrame}=require('../lib/render-pixels.cjs');
const out=path.resolve(__dirname,'../.local');
app.setPath('userData',path.join(out,'electron-paint-order-profile'));
app.disableHardwareAcceleration();
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  const cases=[];
  try {
    for(const source of ['legacy-data','file']) for(const resizable of [true,false]) {
      const window=new BrowserWindow({width:360,height:240,show:false,frame:false,transparent:true,resizable,backgroundColor:'#00000000',webPreferences:{offscreen:true,sandbox:true,nodeIntegration:false,contextIsolation:true}});
      const frames=[];
      try {
        window.webContents.on('paint',(_event,dirty,image)=>{const {width,height}=image.getSize();frames.push(inspectFrame(image.toBitmap(),width,height));});
        if(source==='legacy-data') await window.loadURL('data:text/html,<html><body style="margin:0;background:transparent"><div id="pet" style="margin:40px;width:80px;height:80px;background:%23bfb1d6;border-radius:50%"></div></body></html>');
        else await window.loadFile(path.resolve(__dirname,'../../../tests/fixtures/m0/transparent-window.html'));
        await window.webContents.executeJavaScript('document.documentElement.style.background="transparent";document.body.style.background="transparent";document.getElementById("pet").style.background="#bfb1d6"');
        for(let i=0;i<8;i++){window.webContents.invalidate();await new Promise(r=>setTimeout(r,150));}
        cases.push({source,resizable,frames});
      } catch(error) {cases.push({source,resizable,error:error.message,frames});} finally {window.destroy();}
    }
    fs.writeFileSync(path.join(out,'electron-paint-order.json'),JSON.stringify({synthetic_only:true,cases},null,2));
    console.log(JSON.stringify(cases.map(c=>({source:c.source,resizable:c.resizable,frames:c.frames.map(f=>({clear:f.clear,body:f.body,valid:f.valid}))}))));
  } finally {app.exit();}
});
