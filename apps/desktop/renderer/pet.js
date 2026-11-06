/* Shared character renderer; source art is the explicitly labelled demo pack. */
(function () {
  const canvas = document.getElementById('pet-canvas'),ctx = canvas.getContext('2d');
  const frame=document.createElement('canvas');frame.width=canvas.width;frame.height=canvas.height;
  const frameCtx=frame.getContext('2d');
  const poses = new Image(),sleep = new Image();
  poses.src = '../../../demos/pet-animation/assets/body-poses.png';
  sleep.src = '../../../demos/pet-animation/assets/sleep.png';
  const {PoseDirector}=globalThis.MomiyuPoseDirector;
  const {alphaBounds,groundedRect,poseRegions}=globalThis.MomiyuSpriteLayout;
  let poseBounds=[],poseFrames=[],sleepBounds=null,paintBounds=null;
  function boundsFor(image,x,y,width,height){const temp=document.createElement('canvas');temp.width=width;temp.height=height;const c=temp.getContext('2d',{willReadFrequently:true});c.drawImage(image,x,y,width,height,0,0,width,height);return alphaBounds(c.getImageData(0,0,width,height).data,width,height)||{x:0,y:0,width,height};}
  function measurePoses(){const temp=document.createElement('canvas');temp.width=poses.naturalWidth;temp.height=poses.naturalHeight;const c=temp.getContext('2d',{willReadFrequently:true});c.drawImage(poses,0,0);const data=c.getImageData(0,0,temp.width,temp.height),split=poseRegions(data.data,temp.width,temp.height);if(split.regions.some(b=>!b))throw new Error('invalid_pose_regions');poseBounds=split.regions;
    poseFrames=poseBounds.map((b,i)=>{const frame=document.createElement('canvas');frame.width=b.width;frame.height=b.height;const target=frame.getContext('2d'),pixels=target.createImageData(b.width,b.height);for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){const p=(b.y+y)*temp.width+b.x+x,alpha=data.data[p*4+3];if(split.labels[p]!==i+1&&alpha>=16)continue;const to=(y*b.width+x)*4;pixels.data.set(data.data.subarray(p*4,p*4+4),to);}target.putImageData(pixels,0,0);return frame;});
  }
  const director=new PoseDirector();let currentSelection=null,lastKey='',blendAt=0;const previous=document.createElement('canvas');previous.width=canvas.width;previous.height=canvas.height;
  let resting = false,last = null,alpha = null,ready = false,lastDraw = 0;
  let appearanceId='',evolved=false,character=null,skillPlayer=null,skillPlayerId='';
  const hoverOnly=!!document.getElementById('pet-controls');let hovered=!hoverOnly;
  if(!hoverOnly)director.hovered=true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(now) {
    requestAnimationFrame(draw);
    if (!ready || document.hidden || now - lastDraw < 40) { last = now; return; }
    const dt = last === null ? 0 : Math.min((now-last)/1000,.1); last = now; lastDraw = now;

    const w = canvas.width,h = canvas.height;

    currentSelection=director.select(now);
    if(currentSelection.action.startsWith('skill.')&&skillPlayerId&&!skillPlayer)currentSelection={action:'base.idle',binding:director.plan.bindings['base.idle']};
    const key=appearanceId+':'+currentSelection.action+':'+JSON.stringify(currentSelection.binding);
    if(key!==lastKey){previous.getContext('2d').clearRect(0,0,w,h);previous.getContext('2d').drawImage(canvas,0,0);blendAt=now;lastKey=key;}
    ctx.clearRect(0,0,w,h);
    // Rocking reuses the same egg image; fading its opacity exposes the desktop.
    const blend=reduced||character?.kind==='egg'?1:Math.min(1,(now-blendAt)/160);
    const drawCtx=frameCtx;drawCtx.clearRect(0,0,w,h);
    const index=currentSelection.binding.pose??0;
    const useSleep=currentSelection.binding.asset==='sample_sleep';
    if(currentSelection.action.startsWith('skill.')&&skillPlayer){paintBounds=skillPlayer.draw(drawCtx,currentSelection.binding,now,w,h);} else if(character){paintBounds=character.draw(drawCtx,currentSelection.binding,now,w,h);} else if (useSleep) {
      paintBounds=groundedRect(sleepBounds,w*.84/sleepBounds.width,w,h);
      drawCtx.drawImage(sleep,sleepBounds.x,sleepBounds.y,sleepBounds.width,sleepBounds.height,paintBounds.x,paintBounds.y,paintBounds.width,paintBounds.height);
    } else {
      const b=poseBounds[index],scale=Math.min(w*.87/Math.max(...poseBounds.map(b=>b.width)),h*.86/Math.max(...poseBounds.map(b=>b.height)));
      paintBounds=groundedRect(b,scale,w,h);
      drawCtx.drawImage(poseFrames[index],0,0,b.width,b.height,paintBounds.x,paintBounds.y,paintBounds.width,paintBounds.height);
    }
    // Add premultiplied weighted layers. Drawing two translucent layers with
    // source-over gives only 75% opacity halfway through an opaque transition.
    ctx.save();
    if(blend<1){ctx.globalAlpha=1-blend;ctx.drawImage(previous,0,0);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=blend;}
    ctx.drawImage(frame,0,0);ctx.restore();
    alpha = ctx.getImageData(0,0,w,h).data;
    globalThis.petActor?.onFrame?.();
  }
  globalThis.petActor = {
    ready:Promise.all([poses.decode(),sleep.decode()]).then(() => {measurePoses();sleepBounds=boundsFor(sleep,0,0,sleep.naturalWidth,sleep.naturalHeight);ready = true;}),
    greet() {director.greet(performance.now());},
    setRest(value) { resting = !!value;director.rest(value,performance.now()); },
    setHovered(value) {hovered=!!value;director.hover(value,performance.now());},
    setPointerInside(value){director.pointerInside(value);},
    setAppearance(value) {if(!value||value.id===appearanceId)return;appearanceId=value.id;window.momiyu.invoke('appearance').then(async data=>{if(data.id!==appearanceId)return;if(data.kind==='egg'||data.kind==='character'){const player=new globalThis.MomiyuCharacterPlayer.CharacterPlayer();await player.load(data);if(data.id!==appearanceId)return;character=player;}else{const image=new Image();image.src=data.dataUrl||'../../../demos/pet-animation/assets/body-poses.png';await image.decode();if(data.id!==appearanceId)return;poses.src=image.src;await poses.decode();measurePoses();character=null;}evolved=!!data.dataUrl;director.setPlan(data.actions);lastKey='';}).catch(()=>{appearanceId='load_failed';});},
    setTask(value) {director.setTask(value,performance.now());if(!value?.assets?.material_pages){skillPlayer=null;skillPlayerId='';return;}const expected=value.skill_id+':'+value.assets.base_appearance_id;if(expected===skillPlayerId)return;skillPlayerId=expected;skillPlayer=null;window.momiyu.invoke('skill-appearance',value.skill_id).then(async data=>{const player=new globalThis.MomiyuCharacterPlayer.CharacterPlayer();await player.load(data);if(skillPlayerId===expected){skillPlayer=player;lastKey='';}}).catch(()=>{if(skillPlayerId===expected){skillPlayer=null;skillPlayerId='';}});},
    hit(x,y) {
      if (!alpha) return false;
      const r = canvas.getBoundingClientRect(),px = Math.floor((x-r.x)*canvas.width/r.width),py = Math.floor((y-r.y)*canvas.height/r.height);
      return px>=0 && py>=0 && px<canvas.width && py<canvas.height && alpha[(py*canvas.width+px)*4+3]>=16;
    },
    state() { return {ready,resting,hovered,kind:character?.kind||'legacy',frame:currentSelection?.binding.pose||0,action:currentSelection?.action,missingAction:currentSelection?.missing,hasAlpha:!!alpha,paintBounds}; },
  };
  globalThis.petActor.ready.catch(() => { canvas.setAttribute('aria-label','示例素材加载失败'); });
  requestAnimationFrame(draw);
})();
