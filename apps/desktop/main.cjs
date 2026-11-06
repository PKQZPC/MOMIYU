const {app,BrowserWindow,ipcMain,dialog,screen,powerMonitor,safeStorage,shell} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath,pathToFileURL} = require('node:url');
const {ChatGPTBinding}=require('../../services/local-runtime/src/chatgpt-binding.cjs');
const {requestModel,inspectConnection,readProxyConfig}=require('../../services/local-runtime/src/model.cjs');
const {generateAppearance}=require('../../services/local-runtime/src/appearance.cjs');
const {Runtime} = require('../../services/local-runtime/src/runtime.cjs');
const {configurePaths,projectDirectory} = require('./paths.cjs');
const {Accounts} = require('./accounts.cjs');
const {dragPosition}=require('../../packages/pet-runtime/window-position.cjs');
const root = path.resolve(__dirname,'../..');
const smoke = process.argv.includes('--smoke');
const visibleSmoke=smoke&&process.argv.includes('--visible-check');
const hiddenValidation=process.argv.includes('--hidden-validation');
// Windows display drivers can leave a normally composed window blank although
// offscreen capture succeeds. Use Chromium's software compositor for this demo.
if(process.platform==='win32')app.disableHardwareAcceleration();
app.setName('MOMIYU');
if(process.platform==='win32')app.setAppUserModelId('MOMIYU.Desktop');
const storagePaths=configurePaths(app,root,{smoke,dataDirectory:process.env.MOMIYU_DATA_DIR});
if (!smoke) app.setPath('userData',projectDirectory(root,path.join(root,'.local/desktop/instance')));
const ownsInstance=app.requestSingleInstanceLock();
let quitReason='unclassified';
function lifecycle(event,details={}){
 if(smoke)return;
 try{fs.appendFileSync(path.join(root,'.local/desktop/lifecycle.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,event,...details})+'\n');}catch{}
}
if(ownsInstance)lifecycle('started');
process.on('uncaughtExceptionMonitor',error=>lifecycle('uncaught-exception',{name:error?.name,code:/^[A-Z_0-9]+$/.test(error?.code||'')?error.code:undefined}));
if(!ownsInstance){console.error('MOMIYU could not acquire its single-instance lock.');app.quit();}
let panel,pet,runtime,accounts,drag,cursorTimer,quitting = false,panelPlaced=false;
let napTimer,deviceSuspended=false,deviceLocked=false;
let chatComposing=false;
let switching = false, dialogOpen = false;
let announcedHatch;
function pendingHatch(){
  const hatch=JSON.parse(runtime?.store.db.prepare("SELECT value FROM meta WHERE key='pending_hatch'").get()?.value || "null");
  return hatch && runtime.store.db.prepare("SELECT 1 FROM appearance_versions WHERE id=? AND state='active'").get(hatch.id) ? hatch : null;
}
function panelState() {
  return {...runtime?.snapshot(),appVersion:app.getVersion(),hatch:pendingHatch(),analysisCoverage:runtime?.store.analysisCoverage(),analysisConfigured:runtime?.canAnalyzeAutomatically?.()??null,chatgpt:runtime?.chatgpt?.snapshot(),modelUsage:runtime?.chatgpt?.usage(),modelUsageTotals:runtime?.chatgpt?.usageTotals(), ...(accounts ? {accounts:accounts.snapshot(), accountReady:!!runtime} : {})};
}
function openPanel(page='chat') {
  if (!['chat','growth','abilities','experiences','settings','home','accounts'].includes(page)) throw new Error('invalid_page');
  if (!runtime) page='accounts';
  const origin=runtime?.snapshot().appearance.origin;if(page==='chat'&&origin&&!origin.selected&&!runtime.store.jobs().length)page='growth';
  panel.webContents.send('momiyu:page',page);
  const anchor=pet.getBounds(),area=screen.getDisplayMatching(anchor).workArea,bounds=panel.getBounds();
  if(!panelPlaced){panel.setPosition(Math.max(area.x,Math.min(area.x+area.width-bounds.width,anchor.x-bounds.width-12)),Math.max(area.y,Math.min(area.y+area.height-bounds.height,anchor.y-bounds.height+70)));panelPlaced=true;}
  if (!hiddenValidation && (!smoke||visibleSmoke)) {
    panel.show();
    // A hidden Windows launcher can consume the first native ShowWindow call.
    if(!panel.isVisible())panel.show();
    panel.focus();
  }
  panel.webContents.invalidate();
}
function sendState() {
  if (!runtime) return;
  applyPetScale();
  const hatch=pendingHatch();
  if(hatch && announcedHatch!==hatch.id && panel && !panel.isDestroyed() && !switching){announcedHatch=hatch.id;openPanel('growth');}
  for (const window of [panel,pet]) if (window && !window.isDestroyed()) window.webContents.send('momiyu:state',window === pet ? petState() : panelState());
}
function applyPetScale(){if(!pet||pet.isDestroyed())return;const scale=runtime.store.settings().petScale/100,width=Math.round(180*scale),height=Math.round(152*scale)+38,old=pet.getBounds();if(old.width===width&&old.height===height)return;const area=screen.getDisplayMatching(old).workArea;pet.setBounds({x:Math.max(area.x,Math.min(area.x+area.width-width,old.x+old.width-width)),y:Math.max(area.y,Math.min(area.y+area.height-height,old.y+old.height-height)),width,height});}
function petState() { if(!runtime)return {settings:{resting:false},appearance:{id:'sample_appearance_v1'},motion:null};const state=runtime.snapshot(),task=state.life.tasks[0],skill=task&&state.life.skills.find(s=>s.id===task.version_id);return {settings:{resting:state.settings.resting||deviceSuspended||deviceLocked},busy:state.busy,appearance:{id:state.appearance.id},motion:task&&skill?.assets?{id:task.id,skill_id:task.version_id,status:task.status==='completed'?'success':task.status==='cancelled'?'cancelled':['failed','blocked','partial','interrupted'].includes(task.status)?'failed':task.payload.steps.length?'running':'startup',assets:skill.assets}:null}; }
function createWindow(kind) {
  const isPet = kind === 'pet';
  const area=screen.getPrimaryDisplay().workArea;
  const scale=(runtime?.store.settings().petScale ?? 100)/100;
  const width=isPet?Math.round(180*scale):Math.min(580,area.width-30),height=isPet?Math.round(152*scale)+38:Math.min(740,area.height-30);
  const window = new BrowserWindow({
    title:isPet ? 'MOMIYU' : 'MOMIYU · 小小的陪伴',
    icon:path.join(__dirname,'assets/brand/momiyu.ico'),
    width,height,
    minWidth:isPet ? 108 : Math.min(470,width),minHeight:isPet ? 129 : Math.min(570,height),
    show:false,frame:!isPet,transparent:isPet,backgroundColor:isPet ? '#00000000' : '#f7f8f3',
    resizable:!isPet,skipTaskbar:isPet,alwaysOnTop:isPet,hasShadow:!isPet,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,backgroundThrottling:false,...(hiddenValidation||smoke&&!visibleSmoke?{offscreen:true}:{})},
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.webContents.on('will-navigate',event => event.preventDefault());
  window.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame)console.error('MOMIYU window load failed:',kind,code);});
  window.webContents.on('render-process-gone',(_event,details)=>{lifecycle('renderer-gone',{kind,reason:details.reason,exitCode:details.exitCode});console.error('MOMIYU renderer stopped:',kind,details.reason);});
  window.on('close',event => {
    lifecycle('window-close',{kind,quitting,accountReady:!!runtime});
    if (!quitting && !isPet && pet && !pet.isDestroyed()) {
      event.preventDefault();
      if (runtime) window.hide();
      else app.quit();
    }
  });
  return window;
}
function trusted(event,kind) {
  const windows = kind === 'pet' ? [pet] : kind === 'panel' ? [panel] : [panel,pet];
  return windows.some(window => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame);
}
function accountRuntime(account, creating = false) {
  const candidate = new Runtime(accounts.directory(account, creating), {
    startObservers:false, screenshotOnly:true, changed:() => { if (runtime === candidate) sendState(); },
  });
  try {
    const binding=candidate.chatgpt=new ChatGPTBinding(candidate.store,safeStorage,url=>shell.openExternal(url));
    candidate.canAnalyzeAutomatically=()=>{
      const settings=candidate.store.settings(),bound=binding.snapshot();
      if(!settings.modelEnabled)return false;
      if(bound)return !bound.unavailable;
      try{readProxyConfig(settings.proxyConfig);return true;}catch{return false;}
    };
    candidate.model=(settings,system,input,options)=>{
      const kind=candidate.active?.kind;
      return binding.snapshot() ? binding.model(settings,system,input,options,kind) : binding.track(kind,settings.model,options.signal,()=>requestModel(settings,system,input,options));
    };
    candidate.imageGenerator=async(settings,input,bytes,options)=>{
      if(binding.snapshot())return binding.image(settings,input,bytes,options);
      const result=await binding.track('image','gpt-image-1.5',options.signal,async()=>{
        let usage;
        const output=await generateAppearance(settings,input,bytes,{...options,onUsage:value=>{usage=value;}});
        return {output,usage};
      });
      return result.output;
    };
    candidate.connectionInspector=(settings,options)=>binding.snapshot()?binding.inspect(settings,options):inspectConnection(settings,options);
    candidate.snapshot();
    return candidate;
  }
  catch (error) { candidate.close(); throw error; }
}

async function changeAccount(operation, payload) {
  if (!accounts) throw new Error('accounts_unavailable');
  if (switching || dialogOpen || runtime?.active) throw new Error('request_in_progress');
  const creating = operation === 'create-account';
  const account = creating ? accounts.create(payload) : accounts.authenticate(payload);
  if (account && runtime && account.id === accounts.snapshot().activeId) return;
  switching = true;
  const previous = runtime;
  let candidate;
  try {
    try { candidate = accountRuntime(account, creating); }
    catch { throw new Error('account_unavailable'); }
    previous?.stopObservation();
    try {
      candidate.startObservation();
      accounts.activate(account, creating, payload.remember === true || (payload.password === undefined && account.id === accounts.snapshot().rememberedId));
    } catch {
      candidate.close();
      previous?.startObservation();
      throw new Error('account_unavailable');
    }
    runtime = candidate;
    previous?.close();
    pet.hide();
    drag = null;
    // Recreate renderer state so unsent drafts and cached account data cannot cross profiles.
    await Promise.all([panel.loadFile(path.join(__dirname,'renderer/index.html')), pet.loadFile(path.join(__dirname,'renderer/pet.html'))]);
    sendState();
    if (!hiddenValidation) pet.showInactive();
    const origin = runtime.snapshot().appearance.origin;
    openPanel(origin && !origin.selected ? 'growth' : 'chat');
  } finally { switching = false; }
}

async function signOut() {
  if (!accounts || !runtime) throw new Error('account_required');
  if (switching || dialogOpen || runtime.active) throw new Error('request_in_progress');
  switching = true;
  try {
    accounts.forget();
    pet.hide();
    runtime.close();
    runtime = null;
    drag = null;
    await Promise.all([panel.loadFile(path.join(__dirname,'renderer/index.html')), pet.loadFile(path.join(__dirname,'renderer/pet.html'))]);
    openPanel('accounts');
  } finally { switching = false; }
}

async function selectFile(options) {
  if (dialogOpen) throw new Error('request_in_progress');
  dialogOpen = true;
  try { return await dialog.showOpenDialog(panel, options); }
  finally { dialogOpen = false; }
}

async function dispatch(event,operation,payload) {
  if (!trusted(event)) throw new Error('untrusted_sender');
  if (operation === 'state') return trusted(event,'pet') ? petState() : panelState();
  if (switching && !['appearance','skill-appearance','egg-options'].includes(operation)) throw new Error('request_in_progress');
  if (operation === 'panel') {runtime?.autoNap.finish();openPanel(payload || 'chat');return;}
  if (operation === 'quit') { quitReason='pet-quit-button';app.quit(); return; }
  if (['create-account','switch-account','sign-out'].includes(operation)) {
    if (!trusted(event,'panel')) throw new Error('panel_only');
    if (operation === 'sign-out') return signOut();
    return changeAccount(operation,payload);
  }
  if (!runtime) throw new Error('account_required');
  if (operation === 'rest') return runtime.sleep();
  if (operation === 'wake') return runtime.wake();
  if (operation === 'appearance') {if(payload!==undefined&&!trusted(event,'panel'))throw new Error('panel_only');return runtime.store.appearanceData(payload);}
  if(operation==='skill-appearance')return runtime.store.skillAppearanceData(payload);
  if (!trusted(event,'panel')) throw new Error('panel_only');
  switch (operation) {
    case 'bind-chatgpt': return runtime.withRequest('chatgpt-binding',signal=>runtime.chatgpt.bind(signal));
    case 'unbind-chatgpt': return runtime.withRequest('chatgpt-binding',()=>runtime.chatgpt.unbind());
    case 'chatgpt-usage-history': return runtime.chatgpt?.usage(payload);
    case 'chatgpt-usage': return shell.openExternal('https://chatgpt.com/settings/usage');
    case 'ack-hatch': {
      const hatch=pendingHatch();
      if(hatch?.id===payload)runtime.store.db.prepare("DELETE FROM meta WHERE key='pending_hatch'").run();
      return;
    }
    case 'settings': return runtime.settings(payload);
    case 'nap-compose':
      chatComposing=payload===true;
      if(chatComposing)runtime.autoNap.finish();
      return;
    case 'chat': await runtime.autoNap.finish(); return runtime.chat(payload);
    case 'note': return runtime.note(payload);
    case 'remove': return runtime.remove(payload);
    case 'screenshot': return runtime.store.readScreenshot(payload);
    case 'use-skill': await runtime.autoNap.finish(); return runtime.useSkill(payload);
    case 'prepare-skill': return runtime.prepareSkill(payload);
    case 'grow': return runtime.continueGrowth(payload);
    case 'choose-egg': return runtime.chooseEgg(payload);
    case 'egg-options': {const {eggAsset,colors,styles}=require('../../services/local-runtime/src/egg.cjs');return Object.entries(styles).flatMap(([style,group])=>Object.entries(colors).map(([color,palette])=>({style,styleName:group.name,color,name:palette.name,dataUrl:'data:image/png;base64,'+fs.readFileSync(eggAsset(path.dirname(runtime.store.filename),color,style)).toString('base64')})));}
    case 'clear': return runtime.clear();
    case 'cancel': return runtime.cancel();
    case 'check-connection':return runtime.checkConnection();
    case 'unwatch-file':return runtime.unwatchFile(payload);
    case 'choose-file':{
      if(!runtime.snapshot().settings.saveFiles)throw new Error('collection_disabled');
      const selected=await selectFile({title:'选择允许观察保存变化的文本文件',properties:['openFile'],filters:[{name:'UTF-8 text (up to 32 KB)',extensions:['txt','md','csv']}]});
      if(!selected.canceled&&selected.filePaths[0])return runtime.watchFile(selected.filePaths[0]);
      return null;
    }
    case 'proxy': {
      const selected = await selectFile({title:'选择现有代理配置',properties:['openFile'],filters:[{name:'YAML configuration',extensions:['yaml','yml']}]});
      if (!selected.canceled && selected.filePaths[0]) return runtime.settings({proxyConfig:selected.filePaths[0]});
      return null;
    }
    default: throw new Error('unknown_operation');
  }
}
function safeError(error) {
  const code = String(error?.message || 'operation_failed');
  return /^[a-z_]+(?:_\d{3})?$/.test(code) ? code : 'operation_failed';
}
app.on('second-instance',() => {if(panel)openPanel(accounts ? 'accounts' : 'chat');});
app.on('before-quit',() => { lifecycle('before-quit',{reason:quitReason});quitting = true;clearInterval(cursorTimer);clearInterval(napTimer); runtime?.close(); runtime = null; });
app.on('will-quit',()=>lifecycle('will-quit',{reason:quitReason}));
app.on('window-all-closed',() => {quitReason='all-windows-closed';app.quit();});
app.whenReady().then(async () => {
  if(!ownsInstance)return;
  powerMonitor.on('suspend',()=>{deviceSuspended=true;runtime?.autoNap.routine.observe(new Date(),false);runtime?.screen.stop();sendState();});
  powerMonitor.on('resume',()=>{
    deviceSuspended=false;
    runtime?.autoNap.routine.observe(new Date(),!deviceLocked);
    if(runtime)runtime.autoNap.idleSince=Date.now();
    sendState();
    if(runtime?.store.settings().saveScreenshots){runtime.screen.stop();runtime.screen.start();runtime.notify();}
  });
  powerMonitor.on('lock-screen',()=>{deviceLocked=true;runtime?.autoNap.routine.observe(new Date(),false);sendState();});
  powerMonitor.on('unlock-screen',()=>{
    deviceLocked=false;
    runtime?.autoNap.routine.observe(new Date(),!deviceSuspended);
    if(runtime)runtime.autoNap.idleSince=Date.now();
    sendState();
    if(!deviceSuspended&&runtime?.store.settings().saveScreenshots&&!runtime.screen.child){runtime.screen.start();runtime.notify();}
  });
  if (smoke || process.env.MOMIYU_DATA_DIR) runtime = new Runtime(storagePaths.userData,{screenshotOnly:true,changed:sendState});
  else accounts = new Accounts(root);
  panel = createWindow('panel'); pet = createWindow('pet');
  // Restrict renderer resource access to actual application files. Network
  // requests are made only by the permission-checked local runtime.
  const allowedRoots = ['apps/desktop/renderer','apps/desktop/assets','packages/pet-runtime','demos/pet-animation/assets'].map(folder => path.join(root,folder) + path.sep);
  panel.webContents.session.webRequest.onBeforeRequest((details,callback) => {
    let allowed = false;
    if(details.resourceType==='image'&&details.url.startsWith('data:image/png;base64,'))allowed=true;
    try {
      if (details.url.startsWith('file:')) {
        const filename = fileURLToPath(details.url);
        allowed = allowedRoots.some(base => filename.startsWith(base));
      }
    } catch {}
    callback({cancel:!allowed});
  });
  ipcMain.handle('momiyu:invoke',async (event,operation,payload) => {
    try { return {ok:true,value:await dispatch(event,operation,payload)}; }
    catch (error) { return {ok:false,error:safeError(error)}; }
  });
  ipcMain.on('momiyu:hover',(event,value) => {
    if (trusted(event,'pet') && typeof value === 'boolean' && (smoke||value||process.platform!=='win32')) pet.setIgnoreMouseEvents(!value,{forward:true});
  });
  ipcMain.on('momiyu:drag',(event,phase,point) => {
    if (!trusted(event,'pet') || !['start','move','end'].includes(phase)) return;
    if (phase === 'start') drag = {pointer:point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&Math.abs(point.x)<100000&&Math.abs(point.y)<100000?point:screen.getCursorScreenPoint(),bounds:pet.getBounds()};
    if (phase === 'move' && drag) {
      const cursor = screen.getCursorScreenPoint();
      const area=screen.getDisplayNearestPoint(cursor).workArea;
      const position=dragPosition(drag.bounds,drag.pointer,cursor,area);
      if(!position){drag=null;return;}
      try{pet.setPosition(position.x,position.y);}catch(error){drag=null;console.error('MOMIYU drag stopped:',error?.name);}
    }
    if (phase === 'end') drag = null;
  });
  const workArea = screen.getPrimaryDisplay().workArea;
  const initialPet=pet.getBounds();pet.setPosition(workArea.x+Math.max(0,workArea.width-initialPet.width-25),workArea.y+Math.max(0,workArea.height-initialPet.height-30));
  await Promise.all([panel.loadFile(path.join(__dirname,'renderer/index.html')),pet.loadFile(path.join(__dirname,'renderer/pet.html'))]);
  if (smoke) return require('../../tests/desktop/electron-smoke.cjs').run({app,panel,pet,runtime,root,storagePaths,visibleSmoke,screen});
  if(runtime&&process.argv.includes('--inspect-ui'))require('../../tools/desktop/live-inspection.cjs').start({panel,pet,runtime,root});
  if(runtime){if(!hiddenValidation)pet.showInactive();if(accounts&&runtime.snapshot().appearance.origin?.selected===false)openPanel('growth');}
  else openPanel('accounts');
  if(hiddenValidation)return;
  napTimer=setInterval(()=>{
    if(runtime&&!switching&&!dialogOpen)runtime.autoNap.tick(new Date(),{available:!deviceSuspended&&!deviceLocked,interacting:chatComposing&&panel?.isFocused()});
  },15000);
  // Transparent Windows windows can lose forwarded mouse moves. Reconcile only
  // pet-relative cursor position for hit testing; this is never saved as data.
  // Explicitly wake the renderer for hit testing: one-way forwarded mouse/IPC
  // messages can stall on an idle transparent Windows window. No data is saved.
  let reconciling=false;
  cursorTimer=setInterval(async()=>{
    if(reconciling||pet.isDestroyed())return;reconciling=true;
    try{const p=screen.getCursorScreenPoint(),b=pet.getBounds(),point={x:p.x-b.x,y:p.y-b.y};
      const hit=await pet.webContents.executeJavaScript('globalThis.reconcilePetCursor('+JSON.stringify(point)+')');
      if(!pet.isDestroyed())pet.setIgnoreMouseEvents(!(drag||hit),{forward:true});
    }catch{}finally{reconciling=false;}
  },50);
}).catch(error => { console.error('MOMIYU startup failed:',error?.name,error?.code||'');console.error(String(error?.stack||'').split('\n').slice(1).join('\n'));process.exitCode = 1; app.quit(); });
