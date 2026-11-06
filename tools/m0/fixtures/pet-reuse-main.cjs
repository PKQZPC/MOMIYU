const {app,BrowserWindow,ipcMain,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {readPack}=require('../reuse/character-pack.cjs');
const out=path.resolve(__dirname,'../.local');
app.setPath('userData',path.join(out,'pet-reuse-profile'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 let window,foreign,exit=0;
 const checks=[],hover=[];let rejected=0;
 const record=(name,passed)=>{checks.push({name,passed});assert.ok(passed,name);};
 const trusted=event=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame;
 const decode=bytes=>{const image=nativeImage.createFromBuffer(bytes);return image.isEmpty()?null:image.getSize();};
 const report={schema_version:'0.1.0',generated_at:new Date().toISOString(),synthetic_only:true,electron:process.versions.electron,checks};
 try{
  const prefs={contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'pet-reuse-preload.cjs')};
  window=new BrowserWindow({width:240,height:200,show:false,frame:false,transparent:true,resizable:false,skipTaskbar:true,backgroundColor:'#00000000',webPreferences:prefs});
  window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')}));
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  ipcMain.handle('m0:pet-pack',(event,version)=>{
   if(!trusted(event)||!['v1','v2','broken'].includes(version)){rejected++;throw new Error('Source/argument denied.');}
   const pack=readPack(path.join(out,'pet-reuse-packs',version),decode);
   return {manifest:pack.manifest,images:Object.fromEntries(Object.entries(pack.manifest.sheets).map(([id,sheet])=>[id,'data:image/png;base64,'+pack.files[sheet.file].toString('base64')]))};
  });
  ipcMain.on('m0:pet-hover',(event,value)=>{
   if(!trusted(event)||typeof value!=='boolean'){rejected++;return;}
   hover.push(value);window.setIgnoreMouseEvents(!value,{forward:true});
  });
  await window.loadFile(path.resolve(__dirname,'../../../tests/fixtures/m0/pet-reuse-window.html'));
  window.showInactive();
  const js=source=>window.webContents.executeJavaScript(source);
  const wait=()=>new Promise(resolve=>setTimeout(resolve,90));
  await js('fixture.ready');
  let state=await js('fixture.snapshot()');const first=state.version;
  record('native image decode, isolated renderer and initial pack',!state.nodeExposed&&state.alphaWidth===32&&state.alphaHeight===32);
  const move=(x,y)=>window.webContents.sendInputEvent({type:'mouseMove',x,y,movementX:0,movementY:0});
  const down=(x,y)=>window.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
  const up=(x,y)=>window.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});
  move(42,42);await wait();record('transparent hole passes through despite bounding-box overlap',hover.at(-1)===false);
  move(88,88);await wait();record('opaque body restores mouse handling',hover.at(-1)===true);
  await js('fixture.advance(.1)');await wait();record('stationary pointer becomes passthrough on transparent animation frame',hover.at(-1)===false);
  await js('fixture.advance(.3)');await wait();record('stationary pointer restores body hit on next loop',hover.at(-1)===true);
  down(88,88);move(90,88);up(90,88);await wait();
  let events=await js('fixture.events.map(e=>e.type)');record('Chromium pointer events: jitter produces one click',events.join(',')==='pet');
  await js('fixture.clearEvents()');down(88,88);move(160,150);await wait();
  record('drag beyond body retains interaction until release',hover.at(-1)===true);up(160,150);await wait();
  events=await js('fixture.events.map(e=>e.type)');record('captured drag ends without accidental pet',events.includes('drag-start')&&events.includes('drag-end')&&!events.includes('pet'));
  state=await js('fixture.snapshot()');record('drag actually moves the drawn body within canvas bounds',state.rect.x>40&&state.rect.y>40&&state.rect.x+state.rect.width<=240&&state.rect.y+state.rect.height<=200);
  await js('fixture.activate("skill:synthetic-search")');
  state=await js('fixture.advance(.2)');record('independent skill sheet and full final frame',state.alphaWidth===48&&state.frame===2&&!state.done);
  state=await js('fixture.advance(.1)');record('skill completes only after full duration',state.done);
  await js('fixture.load("broken").catch(()=>null)');state=await js('fixture.snapshot()');record('incomplete candidate preserves loaded pack',state.version===first);
  await js('fixture.load("v2")');state=await js('fixture.snapshot()');record('new version refreshes player and alpha geometry',state.version!==first&&state.alphaHeight===48&&state.frame===0);
  const played=await js('fixture.runFor(450)');record('requestAnimationFrame playback advances actual rendered frames',new Set(played).size>1&&played.every(frame=>frame>=0&&frame<4));
  const superseded=await js('Promise.all([fixture.load("v1",150).then(()=>false,error=>error.message==="Superseded candidate"),fixture.load("v2")]).then(values=>values[0])');
  const afterRace=await js('fixture.snapshot()');record('late older decode cannot replace newer selected pack',superseded&&afterRace.version===state.version);
  const rejectedBefore=rejected;
  await js('petBridge.hover("invalid");petBridge.readPack("../escape").catch(()=>null)');await wait();
  foreign=new BrowserWindow({show:false,webPreferences:prefs});await foreign.loadFile(path.resolve(__dirname,'../../../tests/fixtures/m0/transparent-window.html'));
  const foreignDenied=await foreign.webContents.executeJavaScript('petBridge.readPack("v1").then(()=>false,()=>true)');
  record('IPC rejects malformed arguments and foreign renderers',foreignDenied&&rejected>=rejectedBefore+3);
  await js('fixture.dispose()');await wait();record('disposing interactions returns to passthrough',hover.at(-1)===false);
  fs.writeFileSync(path.join(out,'pet-reuse-window.png'),(await window.webContents.capturePage()).toPNG());
  report.state=state;report.rejected_ipc=rejected;report.status='passed';
 }catch(error){report.status='failed';report.error=error.message;exit=1;}
 finally{
  report.limits=['Synthetic procedural shapes only; no generated art or model call.',
   'Pointer events injected into the owned Chromium window, not global physical mouse input.',
   'M0 adaptation only; no M1 client, production release or skill execution.'];
  fs.writeFileSync(path.join(out,'pet-reuse-window.json'),JSON.stringify(report,null,2));
  if(foreign)foreign.destroy();if(window)window.destroy();ipcMain.removeHandler('m0:pet-pack');ipcMain.removeAllListeners('m0:pet-hover');app.exit(exit);
 }
});
