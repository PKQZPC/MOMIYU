import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { m0Root, writeReport } from './lib/report.mjs';

const directory=path.join(m0Root,'.local',`storage-${crypto.randomUUID()}`);
fs.mkdirSync(directory,{recursive:true});
const database=path.join(directory,'metadata.sqlite');
let db=new DatabaseSync(database);
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE content_versions(id TEXT,version INTEGER,hash TEXT,PRIMARY KEY(id,version)); CREATE TABLE attributions(id TEXT,version INTEGER,event_ref TEXT,workflow_ref TEXT,PRIMARY KEY(id,version)); CREATE TABLE publications(id TEXT PRIMARY KEY,state TEXT);');
const texts=['original synthetic document','updated synthetic document'];
for(let i=0;i<texts.length;i++){
  const hash=crypto.createHash('sha256').update(texts[i]).digest('hex');
  fs.writeFileSync(path.join(directory,`${hash}.txt`),texts[i]);
  db.prepare('INSERT INTO content_versions VALUES(?,?,?)').run('document-a',i+1,hash);
}
db.prepare('INSERT INTO attributions VALUES(?,?,?,?)').run('attribution-a',1,'event-a','workflow-a');
db.prepare('INSERT INTO attributions VALUES(?,?,?,?)').run('attribution-a',2,'event-a','workflow-b');
db.exec('BEGIN');db.prepare('INSERT INTO publications VALUES(?,?)').run('candidate-failed','effective');db.exec('ROLLBACK');
assert.equal(db.prepare('SELECT count(*) AS n FROM publications').get().n,0);
db.exec('BEGIN');db.prepare('INSERT INTO publications VALUES(?,?)').run('publication-a','effective');db.exec('COMMIT');
db.close();db=new DatabaseSync(database);
const first=db.prepare('SELECT hash FROM content_versions WHERE id=? AND version=?').get('document-a',1);
assert.equal(fs.readFileSync(path.join(directory,`${first.hash}.txt`),'utf8'),texts[0]);
assert.equal(db.prepare('SELECT count(*) AS n FROM attributions').get().n,2);
assert.equal(db.prepare('SELECT state FROM publications WHERE id=?').get('publication-a').state,'effective');
db.close();
writeReport('storage',{status:'passed',checks:['separate metadata and blobs','exact historical version read','versioned attribution without source rewrite','transaction rollback','committed state survives reopen'].map(name=>({name,passed:true})),limitations:['Synthetic SQLite experiment only, not the product schema or crash/power-loss test.','Node built-in SQLite API is runtime-version-specific; Python sqlite3 remains an available alternative.']});
