const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {acquireProxyLease}=require('../../services/local-runtime/src/proxy-lease.cjs');
test('login and inference cannot concurrently own one credential directory',t=>{
 const parent=path.resolve(__dirname,'../../.local/test-tmp');fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(path.join(parent,'momiyu-lease-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const config=path.join(dir,'config.yaml');
 // Use forward slashes as YAML paths, as in the actual proxy config.
 fs.writeFileSync(config,'auth-dir: '+JSON.stringify(path.join(dir,'auth').replaceAll('\\','/')));
 const release=acquireProxyLease(config,'login');
 assert.throws(()=>acquireProxyLease(config,'inference'),/local_proxy_in_use/);
 release();release();
 acquireProxyLease(config,'inference')();
 assert.equal(fs.existsSync(path.join(dir,'auth','.momiyu-process-lock')),false);
});
