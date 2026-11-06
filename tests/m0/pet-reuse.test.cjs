const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {AnimationPlayer}=require('../../tools/m0/reuse/animation-player.cjs');
const {alphaHitTest,createInputHandler}=require('../../tools/m0/reuse/pointer-input.cjs');
const {readPack,installPack,PackSelection}=require('../../tools/m0/reuse/character-pack.cjs');
const {createPack,decode}=require('../fixtures/m0/pet-pack.cjs');
const cache=path.resolve(__dirname,'../../tools/m0/.local/reuse-tests');fs.mkdirSync(cache,{recursive:true});
function fixture(t){const root=fs.mkdtempSync(path.join(cache,'case-'));t.after(()=>{if(path.dirname(root)!==cache)throw new Error('Unsafe cleanup.');fs.rmSync(root,{recursive:true,force:true});});const folder=path.join(root,'candidate');const raw=createPack(folder);return {root,folder,raw};}
function save(folder,raw){fs.writeFileSync(path.join(folder,'character.json'),JSON.stringify(raw));}
test('single-frame and multi-frame activations retain the whole last interval',()=>{
 const player=new AnimationPlayer({single:{frames:1,fps:8,loop:false},'skill:free-name':{frames:4,fps:8,loop:false}});
 player.play('single');assert.equal(player.isDone(),false);player.update(.124);assert.equal(player.isDone(),false);player.update(.001);assert.equal(player.isDone(),true);
 player.play('skill:free-name');player.update(.375);assert.equal(player.currentFrame(),3);assert.equal(player.isDone(),false);player.update(.125);assert.equal(player.isDone(),true);
});
test('looping, pause, no-restart and long elapsed values remain bounded',()=>{
 const player=new AnimationPlayer({idle:{frames:4,fps:8,loop:true}});player.play('idle');player.update(.125);player.play('idle',{restart:false});assert.equal(player.currentFrame(),1);player.update(0);assert.equal(player.currentFrame(),1);player.update(100000);assert.equal(player.currentFrame(),1);assert.equal(player.isDone(),false);
 assert.throws(()=>player.update(-1));assert.throws(()=>player.update(Infinity));assert.throws(()=>player.play('missing'));
 assert.throws(()=>new AnimationPlayer({bad:{frames:0,fps:8,loop:false}}));
});
test('scaled alpha hit test rejects transparent holes and stale geometry',()=>{
 const rgba=Buffer.alloc(4*4*4);rgba[(1*4+1)*4+3]=255;
 const old={rgba,width:4,height:4,rect:{x:10,y:20,width:40,height:40}};
 assert.equal(alphaHitTest(old,25,35),true);assert.equal(alphaHitTest(old,11,21),false);assert.equal(alphaHitTest(old,50,35),false);
 assert.equal(alphaHitTest({...old,rect:{x:60,y:20,width:40,height:40}},25,35),false);
});
class Target {
 constructor(){this.handlers=new Map();this.captured=new Set();}
 addEventListener(name,fn){if(!this.handlers.has(name))this.handlers.set(name,new Set());this.handlers.get(name).add(fn);}
 removeEventListener(name,fn){this.handlers.get(name)?.delete(fn);}
 setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}
 send(name,extra={}){for(const fn of this.handlers.get(name)||[])fn({pointerId:1,button:0,isPrimary:true,clientX:20,clientY:20,...extra});}
}
function input(){const target=new Target(),events=[],hover=[];const handler=createInputHandler(target,{hitTest:(x,y)=>x>=10&&x<50&&y>=10&&y<50,emit:e=>events.push(e.type),reportHover:v=>hover.push(v)});return {target,events,hover,handler};}
test('small jitter remains a click; right button and transparent misses are ignored',()=>{
 const {target,events}=input();target.send('pointerdown',{button:2});target.send('pointerup');target.send('pointerdown',{clientX:1});target.send('pointerup',{clientX:1});assert.deepEqual(events,[]);
 target.send('pointerdown');target.send('pointermove',{clientX:22});target.send('pointerup',{clientX:22});assert.deepEqual(events,['pet']);
});
test('drag keeps capture outside body, does not emit pet, and releases on cancel',()=>{
 const {target,events,hover}=input();target.send('pointerdown');target.send('pointermove',{clientX:80});assert.equal(hover.at(-1),true);target.send('pointercancel',{clientX:80});assert.deepEqual(events,['drag-start','drag-move','drag-cancel']);assert.equal(target.captured.size,0);assert.equal(hover.at(-1),false);
});
test('secondary pointer cannot end primary drag; disposal removes all listeners',()=>{
 const {target,events,handler}=input();target.send('pointerdown');target.send('pointerup',{pointerId:2});assert.deepEqual(events,[]);target.send('pointermove',{clientX:40});handler.dispose();assert.equal(events.at(-1),'drag-cancel');assert.equal(target.captured.size,0);const count=events.length;target.send('pointerdown');assert.equal(events.length,count);assert.ok([...target.handlers.values()].every(set=>set.size===0));
});
test('stationary pointer refresh follows changed frame alpha and keeps active capture',()=>{
 const target=new Target(),hover=[];let solid=true;
 const handler=createInputHandler(target,{hitTest:()=>solid,emit:()=>{},reportHover:value=>hover.push(value)});
 target.send('pointermove');assert.equal(hover.at(-1),true);solid=false;handler.refresh();assert.equal(hover.at(-1),false);
 solid=true;target.send('pointerdown');solid=false;handler.refresh();assert.equal(hover.at(-1),true);handler.dispose();
});
test('unchanged hover is coalesced instead of sending IPC every animation frame',()=>{
 const {target,hover,handler}=input();target.send('pointermove');for(let i=0;i<60;i++)handler.refresh();assert.deepEqual(hover,[true]);handler.dispose();assert.deepEqual(hover,[true,false]);
});
test('multi-sheet pack, arbitrary skill identity and legacy one-sheet pack load',t=>{
 const {folder,raw}=fixture(t);const pack=readPack(folder,decode);assert.equal(pack.manifest.sheets.skill.frame.width,48);assert.equal(pack.manifest.skills['skill:synthetic-search'],'activate');assert.equal(pack.manifest.format,'m0-pet-pack-1');
 delete raw.sheets;delete raw.skills;delete raw.states.activate;save(folder,raw);assert.equal(readPack(folder,decode).manifest.sheets.main.frame.width,32);
});
test('invalid candidate leaves previous selection intact; successful version changes identity',t=>{
 const {root,folder}=fixture(t),selection=new PackSelection(decode);const original=selection.activate(folder);const other=path.join(root,'v2');createPack(other,2);fs.unlinkSync(path.join(other,'skill.png'));assert.throws(()=>selection.activate(other));assert.equal(selection.current.manifest,original);
 createPack(other,2);const changed=selection.activate(other);assert.notEqual(changed.id,original.id);assert.equal(changed.sheets.main.frame.height,48);
});
test('decode is mandatory and forged PNG header or bad grid cannot pass',t=>{
 const {folder,raw}=fixture(t);assert.throws(()=>readPack(folder),/decoder_required/);const sprite=fs.readFileSync(path.join(folder,'sprite.png'));fs.writeFileSync(path.join(folder,'sprite.png'),sprite.subarray(0,33));assert.throws(()=>readPack(folder,decode),/decode_failed/);
 createPack(folder);raw.sheets.main.columns=3;save(folder,raw);assert.throws(()=>readPack(folder,decode),/grid_mismatch/);
});
test('traversal, absent clip, looping skill and unknown action are rejected',t=>{
 const {folder,raw}=fixture(t);
 for(const change of [r=>r.sheets.skill.file='../skill.png',r=>r.skills['skill:synthetic-search']='missing',r=>r.states.activate.loop=true,r=>r.clickActions=['missing']]){
  const next=structuredClone(raw);change(next);save(folder,next);assert.throws(()=>readPack(folder,decode));
 }
});
test('staged install is idempotent, detects corruption and candidate mutation',t=>{
 const {root,folder}=fixture(t),pack=readPack(folder,decode),store=path.join(root,'store');const target=installPack(pack,store,decode);assert.equal(installPack(pack,store,decode),target);assert.deepEqual(fs.readdirSync(store),[pack.manifest.id]);
 fs.writeFileSync(path.join(target,'skill.png'),Buffer.from('broken'));assert.throws(()=>installPack(pack,store,decode));
 pack.files['skill.png'][0]=0;assert.throws(()=>installPack(pack,path.join(root,'other'),decode),/changed_candidate/);
});
test('failed staged decode leaves the old installed version and no partial directory',t=>{
 const {root,folder}=fixture(t),store=path.join(root,'store');const first=readPack(folder,decode);installPack(first,store,decode);
 const other=path.join(root,'v2');createPack(other,2);const next=readPack(other,decode);
 assert.throws(()=>installPack(next,store,()=>null),/image_decode_failed/);
 assert.deepEqual(fs.readdirSync(store),[first.manifest.id]);assert.equal(readPack(path.join(store,first.manifest.id),decode).digest,first.digest);
});
