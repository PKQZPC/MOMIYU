(function(root){
 function createDesktopInteraction({hover,open,greet,wake,isResting,presence=()=>{},linger=0,delay=500,schedule=setTimeout,cancel=clearTimeout}){
  let body=false,controls=false,sent,tap=null,leave=null;
  const send=value=>{if(value!==sent){sent=value;presence(value);hover(value);}};
  const update=()=>{const value=body||controls;if(value){if(leave!==null)cancel(leave);leave=null;send(true);}else if(linger&&sent){if(leave===null)leave=schedule(()=>{leave=null;send(false);},linger);}else send(false);};
  const clear=()=>{if(tap!==null)cancel(tap);tap=null;};
  return {
   bodyHover(value){body=!!value;update();},controlsHover(value){controls=!!value;update();},
   pointerDown(){clear();},
   click(){clear();greet();tap=schedule(()=>{tap=null;if(isResting())wake();open('chat');},delay);},
   doubleClick(){clear();open('growth');},drag(){clear();},
   dispose(){clear();if(leave!==null)cancel(leave);leave=null;body=controls=false;send(false);}
  };
 }
 const api={createDesktopInteraction};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MomiyuDesktopInteraction=api;
})(globalThis);
