const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
exports.run=async({app,panel,pet,runtime,root,storagePaths,visibleSmoke=false,screen})=>{
  const out=path.join(root,'.local/desktop');fs.mkdirSync(out,{recursive:true});
  const checks=[],errors=[];let exit=0;
  const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
  panel.webContents.on('console-message',event=>{if(String(event.message).includes('Content Security Policy'))errors.push(String(event.message));});
  const js=source=>panel.webContents.executeJavaScript(source);
  async function capture(window) {
    if(visibleSmoke) {await new Promise(resolve=>setTimeout(resolve,180));return window.webContents.capturePage();}
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{window.webContents.removeListener('paint',paint);reject(new Error('paint_timeout'));},3000);
      function paint(_event,_dirty,image){clearTimeout(timer);resolve(image);}
      window.webContents.once('paint',paint);window.webContents.invalidate();
    });
  }
  try{
    runtime.clear();runtime.settings({petScale:100,modelEnabled:false,saveChat:false,saveNotes:false,sendChat:false,sendNotes:false,saveSystem:false,sendSystem:false,systemApps:'',alias:'',resting:false});
    await js('petActor.ready');await pet.webContents.executeJavaScript('petActor.ready');
    check('desktop pet has the compact 180 by 190 window',pet.getBounds().width===180&&pet.getBounds().height===190);
    const dragBounds=pet.getBounds(),cursor=screen.getCursorScreenPoint(),originalPosition=pet.setPosition.bind(pet);let fractionalDragMoves=0;
    pet.setPosition=(x,y,...args)=>{assert.ok(Number.isInteger(x)&&Number.isInteger(y),'native window position must be integer');fractionalDragMoves++;return originalPosition(x,y,...args);};
    await pet.webContents.executeJavaScript('momiyu.drag("start",'+JSON.stringify({x:cursor.x+.5,y:cursor.y+.25})+');momiyu.drag("move");momiyu.drag("end")');
    await new Promise(resolve=>setTimeout(resolve,80));check('fractional drag IPC reaches the real native positioning API safely',fractionalDragMoves===1);pet.setPosition=originalPosition;pet.setBounds(dragBounds);
    check('pet controls are hidden until hovered',await pet.webContents.executeJavaScript('getComputedStyle(document.getElementById("pet-controls")).visibility==="hidden"'));
    let ignores;const originalIgnore=pet.setIgnoreMouseEvents.bind(pet);pet.setIgnoreMouseEvents=(value,options)=>{ignores=value;originalIgnore(value,options);};
    await pet.webContents.executeJavaScript('document.getElementById("pet-controls").dispatchEvent(new PointerEvent("pointerenter"));petActor.onFrame()');
    await new Promise(resolve=>setTimeout(resolve,80));check('control hover remains interactive across body frame refresh',ignores===false);
    check('hover reveals controls and enables ordinary interaction',await pet.webContents.executeJavaScript('getComputedStyle(document.getElementById("pet-controls")).visibility==="visible"&&petActor.state().hovered'));
    await pet.webContents.executeJavaScript('document.getElementById("pet-controls").dispatchEvent(new PointerEvent("pointerleave"))');
    await new Promise(resolve=>setTimeout(resolve,230));check('leaving controls restores transparent passthrough',ignores===true);
    check('leaving pet hides controls and quiets ordinary interaction',await pet.webContents.executeJavaScript('getComputedStyle(document.getElementById("pet-controls")).visibility==="hidden"&&!petActor.state().hovered'));
    check('every application data path stays inside the project',Object.values(storagePaths).every(value=>value.startsWith(root+path.sep)));
    check('Chromium session, temp and crash paths use configured project directories',['userData','sessionData','temp','crashDumps','logs','appData'].every(name=>app.getPath(name)===storagePaths[name]));
    check('compact panel starts on chat while remaining hidden',await js('document.getElementById("chat").classList.contains("active")')&&!panel.isVisible());
    if(visibleSmoke){pet.showInactive();check('visible acceptance begins with pet only',pet.isVisible()&&!panel.isVisible());}
    check('isolated renderer has no Node or generic IPC',await js('typeof require === "undefined" && typeof process === "undefined" && typeof momiyu.invoke === "function"'));
    check('all desktop sections render',await js('["home","chat","experiences","growth","abilities","settings","accounts"].every(id=>document.getElementById(id)?.classList.contains("page"))'));
    await js('document.getElementById("pet-size").value="80";document.getElementById("pet-size").dispatchEvent(new Event("change"))');
    await new Promise(resolve=>setTimeout(resolve,120));check('size slider resizes the actual pet and persists the setting',pet.getBounds().width===144&&runtime.store.settings().petScale===80);
    await js('document.getElementById("reset-pet-size").click()');await new Promise(resolve=>setTimeout(resolve,120));check('default size reset restores actual bounds',pet.getBounds().width===180);
    check('selected brand icon loads from project assets',await js('document.querySelector(".brand-icon").complete && document.querySelector(".brand-icon").naturalWidth === 512'));
    check('desktop panel uses the MOMIYU app version',app.getVersion()===require('../../apps/desktop/package.json').version&&await js('document.querySelector(".sidebar-bottom small").textContent')==='MOMIYU v'+app.getVersion());
    check('desktop exposes screenshot collection without interface capture',await js('!document.querySelector("[data-setting=saveSystem]")&&!document.querySelector("[data-setting=sendSystem]")&&!document.querySelector("[data-setting=saveScreenshots]").checked&&!document.getElementById("browser-copy")&&!document.getElementById("system-apps")'));
    await js('momiyu.invoke("settings",{saveNotes:true,saveChat:true,alias:"小米"})');
    await js('document.getElementById("note-input").value="this unsent draft must not be stored"');
    check('typing without submitting stores no draft',runtime.snapshot().observations.length===0);
    await js('document.querySelector("[data-page=experiences]").click();document.getElementById("note-input").value="先比较两种整理方式，再把失败的方法修改。";document.getElementById("note-form").requestSubmit()');
    await new Promise(resolve=>setTimeout(resolve,120));
    check('submitted note is truly stored',runtime.snapshot().observations.some(row=>row.source==='manual_note'&&row.content.includes('失败')));
    await js('document.querySelector("[data-page=chat]").click();document.getElementById("chat-input").value="今天完成了一点小事。";document.getElementById("chat-form").requestSubmit()');
    await new Promise(resolve=>setTimeout(resolve,120));
    check('offline reply is labelled and sends nothing',await js('document.getElementById("messages").textContent.includes("本地回应")'));
    await js('document.getElementById("chat-input").value="输入法确认";document.getElementById("chat-input").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true,cancelable:true}))');
    check('IME confirmation does not send a premature message',await js('document.getElementById("chat-input").value==="输入法确认"'));
    await js('document.getElementById("chat-input").value=""');
    check('cleared records do not remain as duplicate cached chat',await js('document.querySelectorAll(".message.user").length===1'));
    check('submitted chat is stored without saving drafts',runtime.snapshot().observations.some(row=>row.source==='pet_chat'&&row.role==='user')&&runtime.snapshot().observations.length===2);
    await js('momiyu.invoke("rest")');check('rest without model does not create a fake job',runtime.snapshot().settings.resting&&runtime.snapshot().jobs.length===0);
    await js('momiyu.invoke("wake")');check('wake restores awake state',!runtime.snapshot().settings.resting);
    const state=await pet.webContents.executeJavaScript('momiyu.invoke("state")');check('pet window receives no conversation or evidence',!state.observations&&!state.jobs);
    const denied=await pet.webContents.executeJavaScript('momiyu.invoke("settings",{modelEnabled:true}).then(()=>false,()=>true)');check('pet IPC cannot alter settings',denied&&!runtime.snapshot().settings.modelEnabled);
    await pet.webContents.executeJavaScript('momiyu.invoke("panel","growth")');
    check('pet details request routes to growth',await js('document.getElementById("growth").classList.contains("active")'));
    if(!runtime.snapshot().appearance.origin?.selected){
      await pet.webContents.executeJavaScript('momiyu.invoke("panel","chat")');
      check('unselected egg routes to the growth page',await js('document.getElementById("growth").classList.contains("active")'));
      runtime.chooseEgg('ivory');
    }
    await pet.webContents.executeJavaScript('momiyu.invoke("panel","chat")');
    check('pet chat request routes to chat',await js('document.getElementById("chat").classList.contains("active")'));
    check('unknown settings are rejected',await js('momiyu.invoke("settings",{unrestrictedTools:true}).then(()=>false,()=>true)'));
    const existingModel=runtime.model;runtime.model=async()=>{throw new Error('fixture_failure');};runtime.settings({modelEnabled:true,sendChat:true});
    await js('document.getElementById("chat-input").value="失败后还要留着这句话";document.getElementById("chat-form").requestSubmit()');
    await new Promise(resolve=>setTimeout(resolve,120));check('failed chat restores the unsent editor text',await js('document.getElementById("chat-input").value==="失败后还要留着这句话"'));
    await js('document.getElementById("chat-input").value=""');runtime.model=existingModel;runtime.settings({modelEnabled:false,sendChat:false});
    // Preview uses an existing local image: this checks IPC/image rendering,
    // not system capture. The native screen probe tests actual Windows pixels.
    runtime.settings({saveSystem:true,sendSystem:true,saveScreenshots:true});
    check('legacy interface switches cannot start capture',!runtime.store.settings().saveSystem&&!runtime.store.settings().sendSystem&&!runtime.system.child);
    const firstScreenHelper=runtime.screen.child;
    runtime.screen.useMs=180000;
    const powerMonitor=require('electron').powerMonitor;
    powerMonitor.emit('suspend');
    check('system suspend stops the screenshot helper and saves its timer',!runtime.screen.child&&runtime.screen.useMs===180000);
    powerMonitor.emit('resume');
    check('system resume restarts screenshots from the saved timer',runtime.screen.child&&runtime.screen.child!==firstScreenHelper&&runtime.screen.useMs===180000);
    check('natural nap is enabled independently of the optional schedule',await js('document.getElementById("natural-nap-enabled").checked&&document.getElementById("auto-nap-enabled").checked&&document.getElementById("auto-nap-start").value==="23:00"'));
    const imageBytes=fs.readFileSync(path.join(root,'apps/desktop/assets/brand/momiyu.png'));
    runtime.store.ingestScreen({event_id:'smoke-screen',occurred_at:new Date().toISOString(),screenshot:{png:imageBytes.toString('base64'),width:512,height:512,reason:'baseline_30m'}});runtime.notify();
    await js('document.querySelector("[data-page=experiences]").click();[...document.querySelectorAll("#observations button")].find(b=>b.textContent.includes("查看当时的画面")).click()');
    await new Promise(resolve=>setTimeout(resolve,250));
    check('local screenshot preview decodes through panel-only IPC',await js('document.querySelector(".evidence-image")?.naturalWidth===512'));
    check('pet cannot read screenshot evidence',await pet.webContents.executeJavaScript('momiyu.invoke("screenshot","smoke-screen").then(()=>false,()=>true)'));
    runtime.settings({saveSystem:false,saveScreenshots:false,systemApps:''});
    const originalModel=runtime.model;
    runtime.model=async(_settings,system,input)=>{
      if(system.startsWith('你负责整理')){const rows=JSON.parse(input);return {text:JSON.stringify({summary:'桌宠流程检查',experiences:[{description:'保存了资料整理过程。',source_refs:[rows[0].id]}],user_understanding:[],workflow_candidates:[],skill_candidates:[{name:'线索归笼',description:'把散落的记录收成清楚的笔记。',method:'检索经历，保留依据后归类并保存。',source_refs:[rows[0].id]}],growth:{should_change:false,reason:'继续积累'},pet_update:{name:'沐沐',personality:'耐心整理线索',reason:'经历积累'}})};}
      return {text:JSON.stringify({type:'complete',summary:'整理好了',result:'真实保存的测试结果：先比较，再保留依据。'})};
    };
    runtime.settings({modelEnabled:true,sendNotes:true});
    await js('momiyu.invoke("rest")');
    await js('document.querySelector("[data-page=growth]").click()');
    check('coverage shows completed notes and local-only screenshots',await js('document.getElementById("analysis-coverage").textContent.includes("主动提供的经历 · 已整理 1 条")&&document.getElementById("analysis-coverage").textContent.includes("系统截图 · 仅存本机 1 条")'));
    check('sleep produces persistent memory',await js('document.getElementById("memories").textContent.includes("保存了资料")'));
    await js('document.querySelector("[data-page=abilities]").click()');
    check('unverified skill appears under candidates only',await js('document.getElementById("skill-candidates").textContent.includes("线索归笼")&&!document.getElementById("skills").textContent.includes("线索归笼")'));
    check('candidate does not announce learned mastery',!runtime.snapshot().life.skills[0].assessment?.learned);
    runtime.model=originalModel;runtime.settings({modelEnabled:false,sendNotes:false});
    await js('document.querySelector("[data-page=home]").click();document.getElementById("greet").click()');
    await new Promise(resolve=>setTimeout(resolve,250));
    await panel.webContents.capturePage();await pet.webContents.capturePage();
    check('actual pet assets decode',await js('petActor.state().ready'));
    const petCapture=await pet.webContents.capturePage();const pixels=petCapture.toBitmap();let clear=0,visible=0;
    for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)clear++;if(pixels[i]>=16)visible++;}
    check('transparent pet window contains body and true clear pixels',clear>0&&visible>0);
    fs.writeFileSync(path.join(out,'pet.png'),petCapture.toPNG());
    fs.writeFileSync(path.join(out,'panel.png'),(await capture(panel)).toPNG());
    await js('document.querySelector("[data-page=chat]").click()');
    await js('document.getElementById("toast").hidden=true');
    fs.writeFileSync(path.join(out,'chat.png'),(await capture(panel)).toPNG());
    check('chat composer remains visible in compact window',await js('document.querySelector("#chat-form button").getBoundingClientRect().bottom<=innerHeight'));
    if(visibleSmoke){
      panel.show();panel.focus();panel.webContents.invalidate();await new Promise(resolve=>setTimeout(resolve,350));
      const filename=path.join(out,'panel-native.png');execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/desktop/capture-window.ps1'),'-WindowHandle',String(panel.getNativeWindowHandle().readBigUInt64LE()),'-OutputPath',filename],{cwd:root,windowsHide:true});
      const image=require('electron').nativeImage.createFromPath(filename),size=image.getSize(),pixels=image.toBitmap();let dark=0,samples=0;for(let y=0;y<Math.floor(size.height*.7);y+=2)for(let x=0;x<size.width;x+=2){const i=(y*size.width+x)*4;samples++;if(pixels[i]<180&&pixels[i+1]<180&&pixels[i+2]<180)dark++;}
      check('actual Windows client pixels contain rendered interface, not a blank window',dark>samples*.003);
    }
    const hatchId='smoke-hatch';
    const hatchImage='demos/pet-animation/assets/sleep.png';
    runtime.store.db.prepare('INSERT INTO appearance_versions VALUES(?,?,?,?,?)').run(hatchId,runtime.snapshot().jobs[0].id,'active',hatchImage,JSON.stringify({stage:'juvenile',design_path:hatchImage,material_pages:[hatchImage],actions:{actions:[],bindings:{}}}));
    runtime.store.db.prepare("INSERT OR REPLACE INTO meta VALUES('pending_hatch',?)").run(JSON.stringify({id:hatchId,name:'沐沐'}));
    runtime.notify();
    check('published hatch opens the celebration',await js('document.getElementById("hatch-celebration").open && document.getElementById("hatch-copy").textContent.includes("沐沐")'));
    await js('document.getElementById("hatch-portrait").decode()');
    await new Promise(resolve=>setTimeout(resolve,500));
    fs.writeFileSync(path.join(out,'hatch-celebration.png'),(await capture(panel)).toPNG());
    await js('document.getElementById("hatch-continue").click()');
    await new Promise(resolve=>setTimeout(resolve,120));
    runtime.notify();
    check('closing the celebration acknowledges it and opens growth',await js('!document.getElementById("hatch-celebration").open && document.getElementById("growth").classList.contains("active")')&&!runtime.store.db.prepare("SELECT 1 FROM meta WHERE key='pending_hatch'").get());
    check('no overflowing panel content',await js('document.documentElement.scrollWidth<=innerWidth'));
    check('no observed CSP resource violations',errors.length===0);
    check(visibleSmoke?'visible acceptance uses only the two owned app windows':'all windows remain owned and hidden',visibleSmoke?panel.isVisible()&&pet.isVisible():!panel.isVisible()&&!pet.isVisible());
  }catch(error){exit=1;checks.push('FAILED: '+error.message);}
  finally{
    fs.writeFileSync(path.join(out,'smoke.json'),JSON.stringify({status:exit?'failed':'passed',checks,errors,model_calls:0,visible_windows:visibleSmoke?2:0,process_id:process.pid,generated_at:new Date().toISOString()},null,2));
    panel.destroy();pet.destroy();app.quit();app.exit(exit);
  }
};
