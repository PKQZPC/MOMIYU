// Adapted from TonyNa-code/desktop-pet src/character-import.js, d4f7992.
// Copyright (c) 2026 Desktop Pet Contributors. MIT; third-party/licenses/desktop-pet.txt.
// M0 folder-only format: multiple sheets, immutable identities, explicit skill mapping.
const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const MAX_BYTES = 64 * 1024 * 1024;
const safeName = name => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(name) && !name.includes('..') && !['constructor','prototype','__proto__'].includes(name);
function readLimited(file, limit) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('invalid_file');
  return fs.readFileSync(file);
}
function pngSize(bytes) {
  if (bytes.length < 33 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('invalid_png');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000) throw new Error('image_too_large');
  return {width,height};
}
function freeze(value) {if (value && typeof value === 'object') {for (const child of Object.values(value)) freeze(child); Object.freeze(value);} return value;}
function digestFor(raw, files) {
  const hash = createHash('sha256').update(JSON.stringify(raw));
  for (const name of Object.keys(files).sort()) hash.update(name).update(files[name]);
  return hash.digest('hex');
}
function readPack(source, decodeImage) {
  const stat = fs.lstatSync(source);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('folder_required');
  if (typeof decodeImage !== 'function') throw new Error('decoder_required');
  const raw = JSON.parse(readLimited(path.join(source,'character.json'),262144).toString('utf8'));
  const sprite = raw.sprite || 'sprite.png', preview = raw.preview || 'preview.png';
  const inputSheets = raw.sheets || {main:{file:sprite,frame:raw.frame,columns:raw.columns}};
  if (!inputSheets || typeof inputSheets !== 'object' || Array.isArray(inputSheets) || !Object.hasOwn(inputSheets,'main') || Object.keys(inputSheets).length > 32) throw new Error('invalid_sheets');
  const files = Object.create(null), sheets = Object.create(null);
  let totalBytes = 0, totalPixels = 0;
  function image(name) {
    if (!safeName(name) || !name.endsWith('.png')) throw new Error('invalid_name');
    if (Object.hasOwn(files,name)) return pngSize(files[name]);
    const bytes = readLimited(path.join(source,name),MAX_BYTES), size = pngSize(bytes);
    totalBytes += bytes.length; totalPixels += size.width * size.height;
    if (totalBytes > MAX_BYTES || totalPixels > 32000000) throw new Error('pack_too_large');
    const decoded = decodeImage(bytes);
    if (!decoded || decoded.width !== size.width || decoded.height !== size.height) throw new Error('image_decode_failed');
    files[name] = bytes; return size;
  }
  for (const [id,sheet] of Object.entries(inputSheets)) {
    if (!safeName(id) || !sheet || !sheet.frame || ![sheet.frame.width,sheet.frame.height,sheet.columns].every(n => Number.isInteger(n) && n > 0)) throw new Error('invalid_grid');
    const size = image(sheet.file);
    if (size.width !== sheet.frame.width * sheet.columns || size.height % sheet.frame.height !== 0) throw new Error('grid_mismatch');
    sheets[id] = {file:sheet.file,frame:{...sheet.frame},columns:sheet.columns,rows:size.height/sheet.frame.height,width:size.width,height:size.height};
  }
  if (image(preview).width * image(preview).height > 4000000) throw new Error('preview_too_large');
  const states = Object.create(null);
  if (!raw.states || typeof raw.states !== 'object' || !Object.hasOwn(raw.states,'idle') || Object.keys(raw.states).length > 128) throw new Error('missing_idle');
  for (const [name,state] of Object.entries(raw.states)) {
    const sheet = state && sheets[state.sheet || 'main'];
    if (!safeName(name) || !sheet || !Number.isInteger(state.row) || state.row < 0 || state.row >= sheet.rows || !Number.isInteger(state.frames) || state.frames < 1 || state.frames > sheet.columns || !Number.isFinite(state.interval) || state.interval < 16 || state.interval > 60000 || (state.loop !== undefined && typeof state.loop !== 'boolean')) throw new Error('invalid_state');
    states[name] = {sheet:state.sheet || 'main',row:state.row,frames:state.frames,interval:state.interval,loop:state.loop ?? name === 'idle'};
  }
  for (const key of ['automaticActions','clickActions']) if (raw[key] !== undefined && (!Array.isArray(raw[key]) || raw[key].length > 256 || raw[key].some(name => !Object.hasOwn(states,name)))) throw new Error('invalid_action');
  if (raw.staticExpressions !== undefined && (!Array.isArray(raw.staticExpressions) || raw.staticExpressions.length > 512 || raw.staticExpressions.some(item => !item || !Object.hasOwn(states,item.state) || !Number.isInteger(item.frame) || item.frame < 0 || item.frame >= states[item.state].frames))) throw new Error('invalid_expression');
  const skills = Object.create(null);
  if (raw.skills !== undefined && (!raw.skills || typeof raw.skills !== 'object' || Array.isArray(raw.skills) || Object.keys(raw.skills).length > 128)) throw new Error('invalid_skills');
  for (const [id,clip] of Object.entries(raw.skills || {})) {
    if (!id || id.length > 128 || !Object.hasOwn(states,clip) || states[clip].loop) throw new Error('invalid_skill');
    skills[id] = clip;
  }
  const digest = digestFor(raw,files);
  const manifest = freeze({format:'m0-pet-pack-1',id:`pack-${digest}`,name:String(raw.name || 'Synthetic pet').slice(0,80),preview,sheets,states,skills});
  return {manifest,files,raw:freeze(raw),digest};
}
function installPack(pack, root, decodeImage) {
  if (digestFor(pack.raw,pack.files) !== pack.digest || pack.manifest.id !== `pack-${pack.digest}`) throw new Error('changed_candidate');
  fs.mkdirSync(root,{recursive:true});
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('symlink_store');
  const base = fs.realpathSync(root), target = path.join(base,pack.manifest.id);
  if (fs.existsSync(target)) {
    if (readPack(target,decodeImage).digest !== pack.digest) throw new Error('changed_installed_version');
    return target;
  }
  const staging = path.join(base,`.import-${randomUUID()}`);
  fs.mkdirSync(staging);
  try {
    for (const [name,bytes] of Object.entries(pack.files)) {if (!safeName(name)) throw new Error('invalid_name'); fs.writeFileSync(path.join(staging,name),bytes,{flag:'wx'});}
    fs.writeFileSync(path.join(staging,'character.json'),JSON.stringify(pack.raw),{flag:'wx'});
    if (readPack(staging,decodeImage).digest !== pack.digest) throw new Error('staging_mismatch');
    fs.renameSync(staging,target); return target;
  } finally {
    // Both paths are resolved under the explicitly supplied store before cleanup.
    if (path.dirname(staging) !== base) throw new Error('unsafe_staging_path');
    fs.rmSync(staging,{recursive:true,force:true});
  }
}
class PackSelection {
  constructor(decodeImage) {this.decodeImage=decodeImage; this.current=null;}
  activate(source) {const candidate=readPack(source,this.decodeImage); this.current=candidate; return candidate.manifest;}
}
module.exports={readPack,installPack,pngSize,PackSelection};
