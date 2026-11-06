// Publish checked generation outputs as a complete two-style initial egg pack.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {prepareSingleSprite}=require('../../packages/pet-runtime/single-sprite.cjs');
const root=path.resolve(__dirname,'../..'),target=path.join(root,'apps/desktop/assets/eggs/v001');
if(fs.existsSync(target))throw new Error('egg_pack_version_exists');
const hash=b=>createHash('sha256').update(b).digest('hex'),initial='.local/artwork/egg-palette/v002/generated',revised='.local/artwork/egg-palette/v003/generated',entries=[];
const ledgers=[initial,revised].map(p=>JSON.parse(fs.readFileSync(path.join(root,p,'ledger.json'))));
if(ledgers.some(l=>l.calls.some(c=>c.status!=='completed'))||ledgers.reduce((n,l)=>n+l.calls.length,0)!==9)throw new Error('incomplete_egg_generation');
for(const style of ['soft','pearl'])for(const color of ['white','green','purple','red','blue']){
 const source=style==='soft'?(color==='white'?'.local/validation-rounds/20261102-egg-journey-v001/origin/egg-palette-v4-ivory.png':revised+'/soft-'+color+'.png'):(color==='white'?revised+'/pearl-white.png':initial+'/'+color+'.png');
 const raw=fs.readFileSync(path.join(root,source)),prepared=style==='soft'&&color==='white'?{bytes:raw,metadata:{preparation:'original-white-unmodified'}}:prepareSingleSprite(raw);
 entries.push({style,color,file:style+'/'+color+'.png',sha256:hash(prepared.bytes),source_sha256:hash(raw),...prepared.metadata,bytes:prepared.bytes});
}
fs.mkdirSync(target,{recursive:true});for(const e of entries){const dest=path.join(target,e.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,e.bytes,{flag:'wx'});}
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({schema_version:1,version:'v001',source:'User-directed reference-based generation using the unchanged imagegen CLI, gpt-image-1.5 medium, zero automatic retries.',files:entries.map(({bytes,...e})=>e)},null,2)+'\n');console.log('Installed two five-color egg styles; original soft white preserved.');
