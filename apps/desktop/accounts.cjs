const fs = require('node:fs');
const path = require('node:path');
const {randomBytes, randomUUID, scryptSync, timingSafeEqual} = require('node:crypto');
const {projectDirectory} = require('./paths.cjs');

function credential(password, confirmation) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('invalid_account_password');
  if (password !== confirmation) throw new Error('account_password_mismatch');
  const salt = randomBytes(16).toString('hex');
  return {salt, hash:scryptSync(password, salt, 64).toString('hex')};
}

class Accounts {
  constructor(root) {
    this.root = root;
    this.base = projectDirectory(root, path.join(root, '.local/desktop'));
    this.file = path.join(this.base, 'accounts.json');
    if (fs.existsSync(this.file)) {
      if (!fs.lstatSync(this.file).isFile()) throw new Error('invalid_account_registry');
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (this.data.version !== 1 || !Array.isArray(this.data.accounts)) throw new Error('invalid_account_registry');
      return;
    }

    const accounts = [];
    const addExisting = (name, directory) => {
      if (!fs.existsSync(path.join(directory, 'momiyu.sqlite'))) return;
      if (accounts.some(account => path.resolve(root, account.directory).toLowerCase() === directory.toLowerCase())) return;
      projectDirectory(root, directory);
      accounts.push({id:randomUUID(), name, directory:path.relative(root, directory)});
    };
    addExisting('我的账号', path.join(this.base, 'profiles/default'));
    const receipt = path.join(this.base, 'demo-session.json');
    if (fs.existsSync(receipt)) {
      const {demo_profile: profile} = JSON.parse(fs.readFileSync(receipt, 'utf8').replace(/^\uFEFF/, ''));
      if (typeof profile === 'string') {
        const directory = path.resolve(root, profile);
        const relative = path.relative(path.join(root, 'demo_data/.local/runs'), directory);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory) === 'profile') {
          addExisting('测试账号', directory);
        }
      }
    }
    this.save({version:1, accounts, activeId:accounts.at(-1)?.id ?? null});
  }

  save(data) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), {flag:'wx'});
    try { fs.renameSync(temporary, this.file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    this.data = data;
  }

  snapshot() {
    return {activeId:this.data.activeId, rememberedId:this.data.rememberedId ?? null, list:this.data.accounts.map(({id,name,password}) => ({id,name,needsPassword:!password}))};
  }

  find(id) { return this.data.accounts.find(account => account.id === id); }

  create({name,password,confirmation} = {}) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\u0000-\u001f]/.test(name)) throw new Error('invalid_account_name');
    name = name.trim();
    if (this.data.accounts.some(account => account.name.toLowerCase() === name.toLowerCase())) throw new Error('duplicate_account_name');
    const id = randomUUID();
    return {id, name, directory:path.relative(this.root, path.join(this.base, 'profiles', id)), password:credential(password, confirmation)};
  }

  authenticate({id,password,confirmation} = {}) {
    const account = this.find(id);
    if (!account) throw new Error('account_unavailable');
    if (account.password && id === this.data.rememberedId && password === undefined) return account;
    if (!account.password) return {...account,password:credential(password, confirmation)};
    if (typeof password !== 'string' || password.length > 128) throw new Error('incorrect_account_password');
    const {salt,hash} = account.password;
    const expected = Buffer.from(hash, 'hex');
    if (expected.length !== 64 || !timingSafeEqual(expected, scryptSync(password, salt, 64))) throw new Error('incorrect_account_password');
    return account;
  }

  directory(account, creating = false) {
    if (!account || typeof account.directory !== 'string') throw new Error('account_unavailable');
    const directory = path.resolve(this.root, account.directory);
    const database = path.join(directory, 'momiyu.sqlite');
    if (!creating && (!fs.existsSync(database) || !fs.lstatSync(database).isFile())) throw new Error('account_unavailable');
    return projectDirectory(this.root, directory);
  }

  activate(account, creating = false, remember = false) {
    const accounts = creating ? [...this.data.accounts, account] : this.data.accounts.map(existing => existing.id === account.id ? account : existing);
    this.save({...this.data, accounts, activeId:account.id, rememberedId:remember ? account.id : null});
  }

  forget() {
    if (this.data.rememberedId) this.save({...this.data, rememberedId:null});
  }
}

module.exports = {Accounts};
