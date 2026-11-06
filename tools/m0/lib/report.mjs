import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const m0Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function writeReport(name, result) {
  const dir = path.join(m0Root, '.local');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${name}.json`);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify({ schema_version: '0.1.0', generated_at: new Date().toISOString(), synthetic_only: true, ...result }, null, 2));
  fs.renameSync(`${target}.tmp`, target);
  console.log(JSON.stringify({ report: target, status: result.status, checks: result.checks?.length }));
  return target;
}
