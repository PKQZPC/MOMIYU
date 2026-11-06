// Controlled fixture driver; no production UI or growth decisions.
const canvas=document.getElementById('pet'),ctx=canvas.getContext('2d');
const {AnimationPlayer}=globalThis.MomiyuM0Player;
const {createInputHandler,alphaHitTest}=globalThis.MomiyuM0Input;
let current=null,player=null,images=null,alpha=null;
let loadGeneration=0;
const events=[];
let dragOrigin=null;
const rect={x:40,y:40,width:96,height:96};
function draw(){
  const clip=current.states[player.name],sheet=current.sheets[clip.sheet],frame=player.currentFrame();
  rect.height=rect.width*sheet.frame.height/sheet.frame.width;
  rect.x=Math.max(0,Math.min(canvas.width-rect.width,rect.x));
  rect.y=Math.max(0,Math.min(canvas.height-rect.height,rect.y));
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(images[clip.sheet],frame*sheet.frame.width,clip.row*sheet.frame.height,sheet.frame.width,sheet.frame.height,rect.x,rect.y,rect.width,rect.height);
  const local=document.createElement('canvas');local.width=sheet.frame.width;local.height=sheet.frame.height;
  const context=local.getContext('2d');context.drawImage(images[clip.sheet],frame*sheet.frame.width,clip.row*sheet.frame.height,sheet.frame.width,sheet.frame.height,0,0,local.width,local.height);
  alpha={rgba:context.getImageData(0,0,local.width,local.height).data,width:local.width,height:local.height,rect};
  input.refresh();
}
const input=createInputHandler(canvas,{hitTest:(x,y)=>!!alpha&&alphaHitTest(alpha,x,y),
  emit:event=>{
    events.push(event);
    if(event.type==='drag-start')dragOrigin={pointer:{x:event.x,y:event.y},rect:{...rect}};
    if(event.type==='drag-move'&&dragOrigin){rect.x=dragOrigin.rect.x+event.x-dragOrigin.pointer.x;rect.y=dragOrigin.rect.y+event.y-dragOrigin.pointer.y;draw();}
    if(event.type==='drag-end'||event.type==='drag-cancel')dragOrigin=null;
  },reportHover:value=>window.petBridge.hover(value)});
async function load(version,fixtureDelayMs=0){
  const generation=++loadGeneration;
  input.cancel();
  const candidate=await window.petBridge.readPack(version),loaded=Object.create(null);
  await Promise.all(Object.entries(candidate.images).map(async([id,url])=>{const image=new Image();image.src=url;await image.decode();loaded[id]=image;}));
  if(fixtureDelayMs)await new Promise(resolve=>setTimeout(resolve,fixtureDelayMs));
  if(generation!==loadGeneration)throw new Error('Superseded candidate');
  const clips=Object.fromEntries(Object.entries(candidate.manifest.states).map(([name,clip])=>[name,{frames:clip.frames,fps:1000/clip.interval,loop:clip.loop}]));
  const next=new AnimationPlayer(clips);next.play('idle');
  images=loaded;current=candidate.manifest;player=next;draw();return current.id;
}
globalThis.fixture={
  load,ready:load('v1'),events,
  snapshot:()=>({version:current.id,frame:player.currentFrame(),done:player.isDone(),clip:player.name,nodeExposed:typeof require!=='undefined',alphaWidth:alpha.width,alphaHeight:alpha.height,rect:{...rect}}),
  clearEvents:()=>{events.length=0;},
  advance:dt=>{player.update(dt);draw();return globalThis.fixture.snapshot();},
  activate:id=>{const clip=current.skills[id];if(!clip)throw new Error('Unknown skill.');player.play(clip);draw();},
  dispose:()=>input.dispose(),
  runFor:ms=>new Promise(resolve=>{
    const observed=[];let start=null,previous=null;
    function tick(now){
      if(start===null){start=now;previous=now;}
      player.update((now-previous)/1000);previous=now;draw();observed.push(player.currentFrame());
      if(now-start>=ms)resolve(observed);else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }),
};
