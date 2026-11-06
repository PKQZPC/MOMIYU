// Offline format/size export of the user-selected image. No creative edits.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {configurePaths}=require('../../apps/desktop/paths.cjs');
const root=path.resolve(__dirname,'../..');
configurePaths(app,root,{dataDirectory:path.join(root,'.local/icon-build/profile')});
const directory=path.join(root,'apps/desktop/assets/brand');
const sizes=[16,20,24,32,40,48,64,128,256];
app.whenReady().then(async()=>{
  const window=new BrowserWindow({show:false,width:1024,height:1024,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  try {
    await window.loadURL('data:text/html,<html><head><meta http-equiv="Content-Security-Policy" content="default-src %27none%27; img-src data:"></head><body></body></html>');
    const imageURL='data:image/png;base64,'+fs.readFileSync(path.join(directory,'momiyu-source.png')).toString('base64');
    const png=await window.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(imageURL)};await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const scale=1024/Math.max(image.naturalWidth,image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;canvas.getContext('2d').drawImage(image,(1024-width)/2,(1024-height)/2,width,height);return canvas.toDataURL('image/png').split(',')[1];})()`);
    const source=nativeImage.createFromBuffer(Buffer.from(png,'base64'));
    if(source.isEmpty())throw new Error('Image export failed');
    const image=source.resize({width:512,height:512,quality:'best'});
    fs.writeFileSync(path.join(directory,'momiyu.png'),image.toPNG());
    const frames=sizes.map(size=>source.resize({width:size,height:size,quality:'best'}).toPNG());
    const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
    let offset=header.length;
    sizes.forEach((size,index)=>{const start=6+16*index;header[start]=size===256?0:size;header[start+1]=size===256?0:size;header.writeUInt16LE(1,start+4);header.writeUInt16LE(32,start+6);header.writeUInt32LE(frames[index].length,start+8);header.writeUInt32LE(offset,start+12);offset+=frames[index].length;});
    fs.writeFileSync(path.join(directory,'momiyu.ico'),Buffer.concat([header,...frames]));
    const preview=await window.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(imageURL)};await image.decode();const canvas=document.createElement('canvas');canvas.width=1040;canvas.height=610;const c=canvas.getContext('2d');c.fillStyle='#f5f6ef';c.fillRect(0,0,1040,610);c.fillStyle='#263e32';c.font='600 28px Segoe UI';c.fillText('MOMIYU',48,54);c.fillStyle='#8b9786';c.font='14px Segoe UI';c.fillText('User-selected artwork / Windows icon export',48,82);c.drawImage(image,42,120,330,330);c.fillStyle='#fffef8';c.fillRect(435,124,550,150);c.fillStyle='#293f36';c.fillRect(435,302,550,150);const sizes=[16,24,32,48,64,96];for(let i=0;i<sizes.length;i++){const size=sizes[i],x=458+i*82;c.drawImage(image,x,200-size/2,size,size);c.drawImage(image,x,377-size/2,size,size);c.fillStyle='#8b9786';c.font='12px Segoe UI';c.fillText(String(size)+' px',x,488);}c.fillStyle='#8b9786';c.font='14px Segoe UI';c.fillText('ORIGINAL DESIGN PRESERVED / MULTI-SIZE ICO',48,557);return canvas.toDataURL('image/png').split(',')[1];})()`);
    const out=path.join(root,'.local/icon-build');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'preview.png'),Buffer.from(preview,'base64'));
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({sizes,source:'apps/desktop/assets/brand/momiyu-source.png',png:'apps/desktop/assets/brand/momiyu.png',ico:'apps/desktop/assets/brand/momiyu.ico',generated_at:new Date().toISOString()},null,2));
  } finally {window.destroy();app.quit();}
}).catch(()=>app.exit(1));
