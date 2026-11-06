// Run the production desktop entry and renderer against an isolated workspace.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {setTimeout: delay} = require('node:timers/promises');

const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, 'tools/m0/.local/electron-runtime/v45.1.0/electron.exe');
const base = path.join(root, '.local/desktop/account-tests');
fs.mkdirSync(base, {recursive:true});
const workspace = fs.mkdtempSync(path.join(base, 'journey-'));
for (const directory of ['apps/desktop','services/local-runtime','packages','demos/pet-animation/assets']) {
  fs.cpSync(path.join(root,directory), path.join(workspace,directory), {recursive:true});
}

const desktop = path.join(workspace,'.local/desktop');
const demo = path.join(workspace,'demo_data/.local/runs/account-fixture/profile');
const {Runtime} = require(path.join(workspace,'services/local-runtime/src/runtime.cjs'));
const fixture = new Runtime(demo);
fixture.chooseEgg('mint');
fixture.settings({saveNotes:true});
fixture.note('Existing test account evidence');
fixture.close();
fs.mkdirSync(desktop,{recursive:true});
fs.writeFileSync(path.join(desktop,'demo-session.json'),JSON.stringify({demo_profile:demo}));

async function until(read, description) {
  const end = Date.now() + 12000;
  let error;
  while (Date.now() < end) {
    try { const result = await read(); if (result) return result; }
    catch (caught) { error = caught; }
    await delay(120);
  }
  throw new Error(`Timed out: ${description}`, {cause:error});
}

async function launch() {
  const env = {...process.env};
  delete env.MOMIYU_DATA_DIR;
  delete env.ELECTRON_RUN_AS_NODE;
  const logFile = path.join(workspace,'electron-stderr.log');
  const errorLog = fs.openSync(logFile,'w');
  const child = spawn(runtime,[path.join(workspace,'apps/desktop/main.cjs'),'--remote-debugging-port=0','--hidden-validation'],{
    cwd:workspace,env,windowsHide:true,stdio:['ignore','ignore',errorLog],
  });
  fs.closeSync(errorLog);
  let socket;
  try {
    const target = await until(async () => {
      const port = fs.readFileSync(logFile,'utf8').match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1];
      if (!port) return null;
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return pages.find(page => page.url.endsWith('/renderer/index.html'));
    },'main panel starts');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await until(() => socket.readyState === WebSocket.OPEN,'debug socket');
    let id = 0;
    const evaluate = expression => new Promise((resolve,reject) => {
      const request = ++id;
      const receive = event => {
        const message = JSON.parse(event.data);
        if (message.id !== request) return;
        clearTimeout(timer);
        socket.removeEventListener('message',receive);
        if (message.error || message.result.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
        else resolve(message.result.result.value);
      };
      const timer = setTimeout(() => {socket.removeEventListener('message',receive);reject(new Error('evaluation_timeout'));},4000);
      socket.addEventListener('message',receive);
      socket.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
    });
    const state = () => evaluate('momiyu.invoke("state")');
    async function close() {
      if (child.exitCode === null) {
        evaluate('void momiyu.invoke("quit")').catch(()=>{});
        await until(() => child.exitCode !== null,'desktop exits').catch(() => child.kill());
      }
      socket.close();
    }
    return {evaluate,state,close};
  } catch (error) { socket?.close(); child.kill(); throw error; }
}

const password = 'Desktop-test-only-42';
async function login(app, selector, setup = false, value = password, remember = false) {
  await app.evaluate(`document.querySelector(${JSON.stringify(selector)}).click();
    document.getElementById('login-password').value=${JSON.stringify(value)};
    document.getElementById('login-confirmation').value=${JSON.stringify(setup ? value : '')};
    document.getElementById('login-remember').checked=${remember};
    document.getElementById('login-form').requestSubmit()`);
}
async function run() {
  let app = await launch();
  try {
    const original = await app.state();
    assert.equal(original.accounts.list.length,1);
    assert.equal(original.accountReady,false);
    assert.equal(original.appearance,undefined);
    const originalId = original.accounts.activeId;
    const duplicate = spawn(runtime,[path.join(workspace,'apps/desktop/main.cjs'),'--hidden-validation'],{
      cwd:workspace,env:{...process.env,MOMIYU_DATA_DIR:demo},windowsHide:true,stdio:'ignore',
    });
    try {
      await until(() => duplicate.exitCode !== null,'second instance exits even with another profile');
      assert.equal(duplicate.exitCode,0);
    } finally { if(duplicate.exitCode===null)duplicate.kill(); }
    await until(() => app.evaluate('!document.getElementById("open-accounts").hidden && !!document.getElementById("account-form").onsubmit'),'account UI ready');
    await until(() => app.evaluate('!!document.querySelector("#accounts.active #account-list button")'),'startup chooser visible');
    await app.evaluate('document.querySelector("#account-list button").click()');
    assert.equal((await app.state()).accountReady,false);
    assert.equal(await app.evaluate('!document.getElementById("login-confirm-field").hidden && document.getElementById("account-picker").hidden && document.getElementById("account-form").hidden'),true);
    await app.evaluate('document.getElementById("login-back").click()');
    await login(app,'#account-list button',true);
    const entered = await until(async () => {
      const state = await app.state();
      return state.accountReady && state;
    },'selected legacy account opens');
    assert.equal(entered.appearance.origin.color,'mint');
    assert.equal(entered.observations[0].content,'Existing test account evidence');
    await until(() => app.evaluate('document.getElementById("open-accounts").textContent.includes("测试账号")'),'legacy account UI ready');
    await app.evaluate(`document.getElementById('open-accounts').click();
      document.getElementById('open-register').click();
      document.getElementById('register-back').click();
      document.getElementById('open-register').click();
      document.getElementById('account-name').value='验收新账号';
      document.getElementById('account-password').value=${JSON.stringify(password)};
      document.getElementById('account-confirmation').value=${JSON.stringify(password)};
      document.getElementById('account-form').requestSubmit()`);
    const created = await until(async () => {
      const state = await app.state();
      return state.accounts.list.length === 2 && state.accounts.activeId !== originalId && state;
    },'new account selected');
    assert.equal(created.appearance.origin.selected,false);
    assert.equal(created.observations.length,0);
    assert.equal(created.settings.saveNotes,false);
    await until(() => app.evaluate('document.querySelector("#growth.active .egg-confirm button") !== null'),'egg picker opens');
    await until(() => app.evaluate('[...document.querySelectorAll(".egg-options img")].filter(img=>img.naturalWidth>0).length===10'),'both egg palettes display decoded images on account entry');
    await app.evaluate('document.querySelector(".egg-confirm button").click()');
    await until(async () => (await app.state()).appearance.origin.selected,'egg selected');
    await app.evaluate('momiyu.invoke("settings",{saveNotes:true})');
    await app.evaluate('momiyu.invoke("note","New account evidence")');
    await app.evaluate("document.getElementById('open-accounts').click()");
    await login(app,'#account-list button');
    await until(async () => (await app.state()).accounts.activeId === originalId,'switch to existing account');
    const restored = await app.state();
    assert.equal(restored.appearance.origin.color,'mint');
    assert.deepEqual(restored.observations.map(row => row.content),['Existing test account evidence']);
    await until(() => app.evaluate('document.getElementById("open-accounts").textContent.includes("测试账号") && !!document.querySelector("#account-list button")'),'restored account UI ready');
    await app.evaluate("document.getElementById('open-accounts').click()");
    await login(app,'#account-list button');
    await until(async () => (await app.state()).accounts.activeId === created.accounts.activeId,'switch back to new account');
    await app.close();
    app = await launch();
    const restarted = await app.state();
    assert.equal(restarted.accounts.activeId,created.accounts.activeId);
    assert.equal(restarted.accountReady,false);
    const selector = JSON.stringify(`#accounts.active [data-account-id="${created.accounts.activeId}"]`);
    await until(() => app.evaluate(`!!document.querySelector(${selector})`),'restart displays chooser');
    await login(app,JSON.parse(selector),false,'incorrect-password');
    await until(() => app.evaluate('document.getElementById("toast").textContent.includes("密码不正确")'),'wrong password is shown');
    assert.equal((await app.state()).accountReady,false);
    await app.evaluate('document.getElementById("login-back").click()');
    await login(app,JSON.parse(selector),false,password,true);
    const reopened = await until(async () => {
      const state = await app.state();
      return state.accountReady && state;
    },'explicitly reopen last used account');
    assert.equal(reopened.appearance.origin.selected,true);
    assert.deepEqual(reopened.observations.map(row => row.content),['New account evidence']);
    await until(() => app.evaluate('document.getElementById("open-accounts").textContent.includes("验收新账号")'),'reopened account UI ready');
    const originalDatabase = path.join(demo,'momiyu.sqlite');
    const unavailable = originalDatabase + '.unavailable';
    fs.renameSync(originalDatabase,unavailable);
    try {
      const failure = await app.evaluate(`momiyu.invoke('switch-account',${JSON.stringify({id:originalId,password})}).catch(error=>error.message)`);
      assert.equal(failure,'account_unavailable');
      assert.equal((await app.state()).accounts.activeId,created.accounts.activeId);
    } finally { fs.renameSync(unavailable,originalDatabase); }
    await app.close();
    app = await launch();
    await until(() => app.evaluate(`document.querySelector(${selector})?.textContent==='继续使用'`),'remembered account is offered after restart');
    await app.evaluate(`document.querySelector(${selector}).click()`);
    await until(async () => (await app.state()).accountReady,'remembered account opens without a password');
    await until(() => app.evaluate('document.getElementById("open-accounts").textContent.includes("验收新账号")'),'remembered account panel has loaded');
    await app.evaluate("document.getElementById('open-accounts').click();document.getElementById('sign-out').click()");
    const signedOut=await until(async()=>{
      const state=await app.state();
      return !state.accountReady && state;
    },'sign out returns to the login page');
    assert.equal(signedOut.observations,undefined);
    assert.equal(signedOut.accounts.rememberedId,null);
    await until(() => app.evaluate('document.querySelector("#accounts.active") !== null'),'signed-out account list is shown');
    assert.equal(await app.evaluate("momiyu.invoke('note','blocked').catch(error=>error.message)"),'account_required');
    const registry=fs.readFileSync(path.join(workspace,'.local/desktop/accounts.json'),'utf8');
    assert.ok(!registry.includes(password));
    assert.ok(JSON.parse(registry).accounts.every(account=>account.password?.salt && account.password?.hash));
    assert.ok(!JSON.stringify(await app.state()).includes('hash'));
    console.log(JSON.stringify({status:'passed',checks:['startup waits for login','legacy password enrollment','reject duplicate launch','create from UI','ten egg images decode','choose egg','switch both ways','wrong password leaves account closed','correct login preserves data','password verifiers stay out of the renderer','missing target keeps current account','remembered login survives restart','sign out clears remembered login and closes runtime'],workspace}));
  } finally { await app.close(); }
}

run().catch(error => { console.error(error); process.exitCode=1; });
