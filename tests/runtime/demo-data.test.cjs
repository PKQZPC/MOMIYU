const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const base=path.resolve(__dirname,'../../demo_data'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('public demo catalog and immutable source files retain their exact hashes',()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(base,'catalog.json')));
 for(const entry of catalog.datasets){
  const manifestPath=path.join(base,entry.manifest),bytes=fs.readFileSync(manifestPath);assert.equal(hash(bytes),entry.sha256);
  const manifest=JSON.parse(bytes);assert.equal(manifest.provenance,'synthetic');let count=0;
  for(const file of manifest.files){const b=fs.readFileSync(path.join(path.dirname(manifestPath),file.path));assert.equal(hash(b),file.sha256);count+=JSON.parse(b).records.length;}
  assert.equal(count,manifest.record_count);
 }
});
