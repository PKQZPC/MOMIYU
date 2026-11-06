const path = require('node:path');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const {projectDirectory} = require('../../../apps/desktop/paths.cjs');

class RawInputObserver {
  constructor(store, changed) {
    this.store = store;
    this.changed = changed;
    this.keys = [];
  }

  start() {
    if (this.child || !this.store.settings().saveRawInput || process.platform !== 'win32') return;
    const root = path.resolve(__dirname, '../../..');
    const temp = projectDirectory(root, path.join(root, '.local/windows-capture/tmp'));
    const shell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const child = this.child = spawn(shell, ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'packages/windows-capture/raw-input.ps1')], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      env: {...process.env, TEMP:temp, TMP:temp, MOMIYU_INPUT_OWNER:String(process.pid)}
    });
    const lines = createInterface({input: child.stdout});
    lines.on('line', line => {
      if (this.child !== child || !/^[0-9]{1,3}$/.test(line)) return;
      const code = Number(line);
      if (code < 1 || code > 254) return;
      if (!this.keys.length) this.startedAt = new Date().toISOString();
      this.keys.push(code);
      if (this.keys.length >= 128) this.flush();
    });
    const ended = () => {
      if (this.child === child) this.stop();
    };
    child.once('error', ended);
    child.once('exit', ended);
    this.timer = setInterval(() => this.flush(), 15000);
    this.timer.unref();
  }

  flush() {
    if (!this.keys.length) return;
    const keys = this.keys;
    this.keys = [];
    if (!this.store.settings().saveRawInput) return;
    try {
      this.store.add('raw_input', 'observation', keys.join(' '), {encoding:'windows_virtual_key', started_at:this.startedAt, key_count:keys.length});
      this.changed();
    } catch (error) {
      console.error('MOMIYU could not save a raw input batch:', error.code || error.name);
    }
  }

  stop() {
    clearInterval(this.timer);
    const child = this.child;
    this.child = null;
    child?.kill();
    this.flush();
  }
}

module.exports = {RawInputObserver};
