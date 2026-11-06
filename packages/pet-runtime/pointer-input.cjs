// Adapted from DeskCat src/renderer/input-handler.js, b571847.
// Copyright (c) 2026 Ashok Kumar. MIT; see third-party/licenses/deskcat.txt.
(function(root) {
  function alphaHitTest({rgba, width, height, rect}, x, y, threshold = 16) {
    if (!rgba || rgba.length !== width * height * 4 || rect.width <= 0 || rect.height <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const px = Math.floor((x - rect.x) * width / rect.width), py = Math.floor((y - rect.y) * height / rect.height);
    return px >= 0 && py >= 0 && px < width && py < height && rgba[(py * width + px) * 4 + 3] >= threshold;
  }
  function createInputHandler(element, {hitTest, emit, reportHover = () => {}, dragThreshold = 4}) {
    let active = null, last = null;
    const sendHover=reportHover; let lastHover;
    reportHover=value=>{value=Boolean(value);if(value!==lastHover){lastHover=value;sendHover(value);}};
    const listeners = [];
    const on = (name, fn) => {element.addEventListener(name, fn); listeners.push([name, fn]);};
    const finish = (event, cancelled) => {
      if (!active || active.id !== event.pointerId) return;
      const previous = active; active = null;
      last = cancelled ? null : {x:event.clientX,y:event.clientY};
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
      if (previous.dragging) emit({type:cancelled?'drag-cancel':'drag-end',x:event.clientX,y:event.clientY});
      else if (!cancelled && (hitTest(event.clientX,event.clientY)||Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<dragThreshold)) emit({type:'pet',x:event.clientX,y:event.clientY});
      reportHover(!cancelled && hitTest(event.clientX,event.clientY));
    };
    on('pointerdown', event => {
      if (active || event.button !== 0 || event.isPrimary === false || !hitTest(event.clientX,event.clientY)) return;
      active = {id:event.pointerId,x:event.clientX,y:event.clientY,sx:event.screenX,sy:event.screenY,dragging:false};
      last = {x:event.clientX,y:event.clientY};
      element.setPointerCapture?.(event.pointerId); reportHover(true);
    });
    on('pointermove', event => {
      if (active && active.id !== event.pointerId) return;
      last = {x:event.clientX,y:event.clientY};
      if (!active) {reportHover(hitTest(event.clientX,event.clientY)); return;}
      if (active.id !== event.pointerId) return;
      const dx=Number.isFinite(event.screenX)&&Number.isFinite(active.sx)?event.screenX-active.sx:event.clientX-active.x;
      const dy=Number.isFinite(event.screenY)&&Number.isFinite(active.sy)?event.screenY-active.sy:event.clientY-active.y;
      if (!active.dragging && Math.hypot(dx,dy) >= dragThreshold) {
        active.dragging = true; emit({type:'drag-start',x:active.x,y:active.y,screenX:active.sx,screenY:active.sy});
      }
      if (active.dragging) emit({type:'drag-move',x:event.clientX,y:event.clientY});
      reportHover(true); // Never enable passthrough in the middle of a captured drag.
    });
    on('pointerup', event => finish(event,false));
    on('pointercancel', event => finish(event,true));
    on('lostpointercapture', event => finish(event,true));
    on('pointerleave', () => {if (!active) {last=null;reportHover(false);}});
    // Electron forwards mousemove while the transparent window ignores input.
    // On Windows this does not reliably synthesize a matching pointermove.
    on('mousemove',event=>{if(!active){last={x:event.clientX,y:event.clientY};reportHover(hitTest(event.clientX,event.clientY));}});
    on('mouseleave',()=>{if(!active){last=null;reportHover(false);}});
    on('dblclick', event => {if (event.button === 0 && hitTest(event.clientX,event.clientY)) emit({type:'play',x:event.clientX,y:event.clientY});});
    return {get captured(){return !!active;},reconcile(point){last={x:point.x,y:point.y};reportHover(!!active||hitTest(last.x,last.y));},
      refresh() {reportHover(!!active || !!last && hitTest(last.x,last.y));},
      cancel() {if(active) finish({pointerId:active.id,clientX:active.x,clientY:active.y},true);},
      dispose() {this.cancel(); for(const [name,fn] of listeners) element.removeEventListener(name,fn); reportHover(false);}};
  }
  const api={alphaHitTest,createInputHandler};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.MomiyuM0Input=api;
})(globalThis);
