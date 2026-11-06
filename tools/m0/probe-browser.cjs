const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const moduleRoot = process.env.MOMIYU_QA_MODULES;
if (!moduleRoot) throw new Error('Set MOMIYU_QA_MODULES to the existing Playwright node_modules directory.');
const { chromium, request } = require(path.join(moduleRoot, 'playwright'));
const root = path.resolve(__dirname, '../..'), out = path.join(__dirname, '.local');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const checks=[], browsers=[], requests=[], token=crypto.randomBytes(24).toString('hex');
  const server=http.createServer((req,res)=>{
    if(req.method!=='POST'||req.headers.authorization!==`Bearer ${token}`){res.writeHead(403).end();return;}
    let data='';req.on('data',chunk=>{data+=chunk;if(data.length>8192)req.destroy()});
    req.on('end',()=>{try{const event=JSON.parse(data);requests.push(event);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({accepted:true,event_type:event.type}));}catch{res.writeHead(400).end();}});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const channel of ['msedge','chrome']){
      let browser;
      try{browser=await chromium.launch({headless:true,channel});}catch{browsers.push({channel,status:'unavailable',reason:'Installed browser could not be launched; nothing downloaded.'});continue;}
      try{
        const page=await browser.newPage({viewport:{width:1000,height:700}});
        const remote=[];page.on('request',req=>{if(/^https?:/.test(req.url()))remote.push(req.url())});
        await page.goto(pathToFileURL(path.join(root,'tests/fixtures/m0/workspace.html')).href);
        const dom=await page.locator('[data-object-id="doc-a"]').evaluate(e=>({id:e.dataset.objectId,version:e.dataset.version,text:e.innerText}));
        assert.equal(dom.id,'doc-a');assert.equal(dom.version,'1');
        await page.locator('#text').fill('a draft to discard');await page.locator('#text').fill('青色到蓝色');await page.locator('#password').fill('fixture-secret-not-collected');
        assert.equal(await page.evaluate(()=>fixture.observations.length),0);
        await page.locator('#save').click();
        const events=await page.evaluate(()=>fixture.observations);
        assert.equal(events.length,1);assert.equal(events[0].value,'青色到蓝色');assert.equal(events[0].version,2);assert.equal(events[0].result,'saved');
        assert.ok(!JSON.stringify(events).includes('draft to discard'));assert.ok(!JSON.stringify(events).includes('fixture-secret'));
        const messages=await page.locator('[data-message-id]').evaluateAll(elements=>elements.map(e=>({id:e.dataset.messageId,speaker:e.dataset.speaker,reply_to:e.dataset.replyTo||null,text:e.textContent,time:e.dataset.time})));
        assert.equal(messages[1].reply_to,messages[0].id);assert.equal(messages[1].speaker,'user');
        await page.evaluate(()=>fixture.setCollection(false));await page.locator('#text').fill('not collected');await page.locator('#save').click();
        assert.equal(await page.evaluate(()=>fixture.observations.length),1);
        assert.deepEqual(await page.evaluate(()=>fixture.modelInput(fixture.observations)),[]);
        await page.evaluate(()=>fixture.setModel(true));
        assert.deepEqual(await page.evaluate(()=>fixture.modelInput([{source_id:'fixture-local',type:'text_saved',value:'local only'}])),[]);
        const bridge=await request.newContext();
        const forbidden=await bridge.post(endpoint,{data:events[0]});assert.equal(forbidden.status(),403);
        const accepted=await bridge.post(endpoint,{headers:{Authorization:`Bearer ${token}`},data:events[0]});assert.equal(accepted.status(),200);assert.equal((await accepted.json()).accepted,true);await bridge.dispose();
        const image1=await page.locator('[data-object-id="doc-a"]').screenshot();const image2=await page.locator('[data-object-id="doc-a"]').screenshot();
        assert.equal(crypto.createHash('sha256').update(image1).digest('hex'),crypto.createHash('sha256').update(image2).digest('hex'));
        fs.writeFileSync(path.join(out,`${channel}-fixture.png`),await page.screenshot());
        assert.deepEqual(remote,[]);
        checks.push(...['versioned DOM content','submitted values and observed result','draft/password excluded','conversation relation','collection off','model off','local-only transmission excluded','authenticated loopback bridge','identical-view hash','no remote fixture requests'].map(name=>({channel,name,passed:true})));
        browsers.push({channel,status:'passed',version:browser.version(),fixture_only:true,dom,messages});
      }finally{await browser.close();}
    }
    assert.ok(browsers.some(b=>b.status==='passed'),'At least one installed browser must be tested.');
    const report={schema_version:'0.1.0',generated_at:new Date().toISOString(),synthetic_only:true,status:browsers.every(b=>b.status==='passed')?'passed':'limited',checks,browsers,bridge_received:requests.length,limitations:['Controlled page adapter only, not an installed extension or universal website integration.','Hash equality does not validate perceptual/contextual dedup or 30-minute activity timing.','No private apps, background pages or persistent profile accessed.']};
    fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.join(out,'browser.json'),status:report.status,checks:checks.length,browsers:browsers.map(b=>({channel:b.channel,status:b.status}))}));
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
