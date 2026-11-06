// Synthetic rendering probe only. No desktop capture, personal profile or network.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectFrame } = require('../lib/render-pixels.cjs');
const out = path.resolve(__dirname, '../.local');
fs.mkdirSync(out, {recursive:true});
const mode = process.env.MOMIYU_ELECTRON_MODE || 'offscreen';
if (!['offscreen', 'desktop'].includes(mode)) throw new Error('Unsupported probe mode.');
app.setPath('userData', path.join(out, `electron-user-data-${mode}`));
if (mode === 'offscreen') app.disableHardwareAcceleration();

function pixels(image) {
  const {width, height} = image.getSize();
  return inspectFrame(image.toBitmap(), width, height);
}

app.whenReady().then(async () => {
  let window, backdrop, exitCode = 0;
  const frames = [], started = Date.now();
  const report = { schema_version: '0.1.0', generated_at: new Date().toISOString(), synthetic_only: true,
    mode, electron: process.versions.electron, checks: [], frames,
    limits: ['Only the owned synthetic window is rendered/captured.', 'Not production packaging, real-app coverage or multi-monitor verification.'] };
  try {
    window = new BrowserWindow({ width: 360, height: 240, show: false, frame: false,
      transparent: true, resizable: false, hasShadow: false, skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: mode === 'offscreen', contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') }));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    if (mode === 'desktop') {
      const area = screen.getPrimaryDisplay().workArea;
      const bounds = {x:area.x+48,y:area.y+48,width:360,height:240};
      window.setBounds(bounds);
      backdrop = new BrowserWindow({...bounds, show:false, frame:false, resizable:false, skipTaskbar:true,
        webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
      await backdrop.loadFile(path.resolve(__dirname, '../../../tests/fixtures/m0/backdrop-window.html'));
      backdrop.showInactive();
      window.setAlwaysOnTop(true);
    }
    let lastImage;
    if (mode === 'offscreen') {
      window.webContents.setFrameRate(10);
      window.webContents.on('paint', (_event, dirty, image) => {
        lastImage = image;
        if (frames.length < 30) frames.push({ elapsed_ms: Date.now() - started, dirty, pixels: pixels(image) });
      });
    }
    await window.loadFile(path.resolve(__dirname, '../../../tests/fixtures/m0/transparent-window.html'));
    report.renderer = await window.webContents.executeJavaScript(`({nodeExposed:typeof require!=='undefined',petPresent:!!document.getElementById('pet'),htmlBackground:getComputedStyle(document.documentElement).backgroundColor,bodyBackground:getComputedStyle(document.body).backgroundColor,petBackground:getComputedStyle(document.getElementById('pet')).backgroundColor,dpr:devicePixelRatio})`);
    if (mode === 'desktop') window.showInactive();
    const deadline = Date.now() + 10000;
    let capture;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (mode === 'offscreen') { window.webContents.invalidate(); capture = lastImage; }
      else { capture = await Promise.race([window.webContents.capturePage(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Owned window capture timed out.')),3000))]); }
      if (capture && pixels(capture).valid) break;
    }
    if (!capture) throw new Error('No content frame received before deadline.');
    fs.writeFileSync(path.join(out, `electron-${mode}.png`), capture.toPNG());
    report.pixels = pixels(capture);
    report.background_color = window.getBackgroundColor();
    report.checks.push({ name: 'transparent background and correctly colored body', passed: report.pixels.valid });
    report.checks.push({ name: 'renderer isolation and expected DOM', passed: !report.renderer.nodeExposed && report.renderer.petPresent });
    const reply = spawnSync(process.env.MOMIYU_PYTHON, ['-c', 'import sys,json; v=json.loads(sys.stdin.readline()); print(json.dumps({"request_id":v["request_id"],"contract_version":"0.1.0","synthetic":True}))'],
      { input: JSON.stringify({ request_id: 'm0-ipc' }) + '\n', encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (reply.status !== 0) throw new Error('Controlled Python IPC failed.');
    report.python_ipc = JSON.parse(reply.stdout.trim());
    report.checks.push({ name: 'controlled Python IPC', passed: report.python_ipc.request_id === 'm0-ipc' && report.python_ipc.synthetic === true });
    if (mode === 'desktop') {
      await new Promise(resolve => setTimeout(resolve, 350));
      const bounds = window.getBounds();
      const handle = Number(window.getNativeWindowHandle().readBigUInt64LE());
      const behind = Number(backdrop.getNativeWindowHandle().readBigUInt64LE());
      const points = [{role:'clear',...screen.dipToScreenPoint({x:bounds.x+10,y:bounds.y+10})},
        {role:'body',...screen.dipToScreenPoint({x:bounds.x+80,y:bounds.y+80})}];
      const sample = () => {
        const reply=spawnSync(process.env.MOMIYU_PYTHON,[path.join(__dirname,'probe_composition.py')],
          {input:JSON.stringify({pid:process.pid,handles:[handle,behind],backdrop:behind,points})+'\n',encoding:'utf8',windowsHide:true,timeout:5000});
        if(reply.status!==0)throw new Error('Owned composition/hit-test probe failed: '+reply.stderr.trim());
        return JSON.parse(reply.stdout);
      };
      // Compare actual screen colors before/after overlay; monitor ICC conversion
      // can substantially alter a saturated CSS backdrop color.
      window.hide();
      await new Promise(resolve=>setTimeout(resolve,150));
      const baseline=sample();
      window.showInactive();
      await new Promise(resolve=>setTimeout(resolve,500));
      const shown=sample();
      window.setIgnoreMouseEvents(true, {forward:true});
      await new Promise(resolve=>setTimeout(resolve,150));
      const ignored=sample();
      window.setIgnoreMouseEvents(false);
      const restored=sample();
      report.composition={baseline,shown,ignored,restored};
      const near=(actual,expected)=>actual.every((value,i)=>Math.abs(value-expected[i])<=5);
      report.checks.push({name:'Windows composition shows owned backdrop through clear area',passed:near(baseline.samples[0].rgb,baseline.samples[1].rgb)&&near(shown.samples[0].rgb,baseline.samples[0].rgb)&&near(shown.samples[1].rgb,[191,177,214])&&!near(shown.samples[1].rgb,baseline.samples[1].rgb)});
      report.checks.push({name:'mouse ignore hits backdrop and restores body hit target',passed:shown.samples[1].hit_handle===handle&&ignored.samples[1].hit_handle===behind&&restored.samples[1].hit_handle===handle});
    }
    report.app_metrics=app.getAppMetrics().map(({type,cpu,memory})=>({type,cpu,memory}));
    report.elapsed_ms = Date.now() - started;
    report.status = report.checks.every(c => c.passed) ? 'passed' : 'failed';
    if (report.status === 'failed') exitCode = 1;
  } catch (error) { report.status = 'failed'; report.error = error.message; exitCode = 1; }
  finally {
    fs.writeFileSync(path.join(out, `electron-${mode}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode, status: report.status, checks: report.checks }));
    if (window) window.destroy();
    if (backdrop) backdrop.destroy();
    app.exit(exitCode);
  }
});
