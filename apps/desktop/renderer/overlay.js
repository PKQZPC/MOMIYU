let snapshot;
const api = window.momiyu,actor = window.petActor,canvas = document.getElementById('pet-canvas');
const {createInputHandler} = globalThis.MomiyuM0Input;
const interaction=globalThis.MomiyuDesktopInteraction.createDesktopInteraction({hover:value=>api.hover(value),presence:value=>{document.body.classList.toggle('show-controls',value);actor.setHovered(value);},linger:180,open:page=>api.invoke('panel',page).catch(()=>{}),greet:()=>actor.greet(),wake:()=>api.invoke('wake').catch(()=>{}),isResting:()=>!!snapshot?.settings.resting});
const input = createInputHandler(canvas,{hitTest:(x,y) => actor.hit(x,y),reportHover:value => interaction.bodyHover(value),emit:event => {
  if (event.type === 'pet') interaction.click();
  if (event.type === 'play') interaction.doubleClick();
  if (event.type === 'drag-start') {interaction.drag();api.drag('start',{x:event.screenX,y:event.screenY});}
  if (event.type === 'drag-move') api.drag('move');
  if (['drag-end','drag-cancel'].includes(event.type)) api.drag('end');
}});
actor.onFrame = () => input.refresh();
function update(value) { snapshot=value; actor.setRest(value.settings.resting);actor.setAppearance(value.appearance);actor.setTask(value.motion); document.getElementById('rest').textContent=value.settings.resting ? '醒醒' : '小睡'; }
api.subscribe(update); api.invoke('state').then(update);
const controls=document.getElementById('pet-controls');
globalThis.reconcilePetCursor=point=>{
  const r=controls.getBoundingClientRect(),visible=document.body.classList.contains('show-controls');
  actor.setPointerInside(point.x>=0&&point.x<innerWidth&&point.y>=0&&point.y<innerHeight);
  input.reconcile(point);
  const overControls=visible&&point.x>=r.left&&point.x<r.right&&point.y>=r.top&&point.y<r.bottom;
  interaction.controlsHover(overControls);
  return input.captured||actor.hit(point.x,point.y)||overControls;
};
controls.addEventListener('pointerenter',()=>interaction.controlsHover(true));
controls.addEventListener('pointerleave',()=>interaction.controlsHover(false));
controls.addEventListener('mousemove',()=>interaction.controlsHover(true));
controls.addEventListener('mouseleave',()=>interaction.controlsHover(false));
canvas.addEventListener('pointerdown',()=>interaction.pointerDown());
document.getElementById('open').onclick=() => api.invoke('panel','growth');
document.getElementById('abilities').onclick=()=>api.invoke('panel','abilities');
document.getElementById('rest').onclick=() => api.invoke(snapshot?.settings.resting ? 'wake' : 'rest').catch(() => api.invoke('panel'));
document.getElementById('quit').onclick=() => api.invoke('quit');
canvas.onkeydown=event => {if(event.key==='Enter')api.invoke('panel');};
window.addEventListener('beforeunload',() => {delete globalThis.reconcilePetCursor;input.dispose();interaction.dispose();});
