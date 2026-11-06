const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const MAX_BYTES=32768;
function readDocument(filename) {
  if (!['.txt','.md','.csv'].includes(path.extname(filename).toLowerCase())) throw new Error('unsupported_document');
  const stat=fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid_document');
  if (stat.size>MAX_BYTES) throw new Error('document_too_large');
  const handle=fs.openSync(filename,'r');
  try {
    const opened=fs.fstatSync(handle);if(opened.size>MAX_BYTES)throw new Error('document_too_large');
    const bytes=Buffer.alloc(MAX_BYTES+1),count=fs.readSync(handle,bytes,0,bytes.length,0);
    if(count>MAX_BYTES)throw new Error('document_too_large');
    const body=bytes.subarray(0,count);let content;
    try{content=new TextDecoder('utf-8',{fatal:true}).decode(body);}catch{throw new Error('invalid_document');}
    if(content.includes('\0'))throw new Error('invalid_document');
    return {content,hash:createHash('sha256').update(body).digest('hex'),modified_at:opened.mtime.toISOString()};
  } finally {fs.closeSync(handle);}
}
class FileObserver {
  constructor(store,changed) {this.store=store;this.changed=changed;this.handles=new Map();}
  start() {
    if(!this.store.settings().saveFiles)return;
    for(const item of this.store.watches())this.attach(item);
  }
  add(filename) {
    if(!this.store.settings().saveFiles)throw new Error('collection_disabled');
    filename=path.resolve(filename);readDocument(filename);
    const item=this.store.addWatch(filename);this.attach(item);return item.id;
  }
  attach(item) {
    if(this.handles.has(item.id))return;
    let timer;
    try {
      const watcher=fs.watch(path.dirname(item.path),(_event,filename)=>{
        if(!filename || String(filename).toLowerCase()!==path.basename(item.path).toLowerCase())return;
        clearTimeout(timer);timer=setTimeout(()=>this.scan(item.id),250);
      });
      watcher.on('error',()=>{this.detach(item.id);});
      this.handles.set(item.id,{watcher,stopTimer:()=>clearTimeout(timer)});
      this.scan(item.id);
    } catch {this.store.updateWatch(item.id,item.last_hash,item.version,'unavailable');}
  }
  scan(id) {
    if(!this.handles.has(id) || !this.store.settings().saveFiles)return;
    const item=this.store.watches().find(value=>value.id===id);if(!item)return;
    try {
      const document=readDocument(item.path);
      if(document.hash===item.last_hash)return;
      const version=item.version+1,parts=[];
      for(let start=0;start<document.content.length;) {
        let end=Math.min(start+4000,document.content.length);
        if(end<document.content.length && /[\uD800-\uDBFF]/u.test(document.content[end-1]))end--;
        parts.push(document.content.slice(start,end));start=end;
      }
      if(!parts.length)parts.push('');
      this.store.transaction(()=>{
        for(let index=0;index<parts.length;index++)this.store.add('file_document','observation',parts[index],{
          event:item.version?'saved_content_change':'selected_file_snapshot',object_id:id,name:item.name,
          version,previous_version:item.version||null,sha256:document.hash,modified_at:document.modified_at,part:index+1,parts:parts.length,
        });
        this.store.updateWatch(id,document.hash,version,'observing');
      });
    } catch {this.store.updateWatch(id,item.last_hash,item.version,'unavailable');}
    this.changed();
  }
  detach(id) {const handle=this.handles.get(id);if(handle){handle.stopTimer();handle.watcher.close();this.handles.delete(id);}}
  stop() {for(const id of [...this.handles.keys()])this.detach(id);}
}
module.exports={FileObserver,readDocument,MAX_BYTES};
