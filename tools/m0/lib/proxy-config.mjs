import fs from 'node:fs';

// A bounded reader for the local CLIProxyAPI config, not a general YAML parser.
export function readProxyConfig(filename) {
  const lines = fs.readFileSync(filename, 'utf8').split(/\r?\n/);
  const scalar = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');
  let host = '127.0.0.1', port, inKeys = false; const keys = [];
  for (const line of lines) {
    if (/^host:/.test(line)) host = scalar(line.slice(5));
    if (/^port:/.test(line)) port = Number(line.slice(5).trim());
    if (/^api-keys:\s*$/.test(line)) { inKeys = true; continue; }
    if (inKeys && /^\S/.test(line)) inKeys = false;
    if (inKeys && /^\s+-\s+/.test(line)) keys.push(scalar(line.replace(/^\s+-\s+/, '')));
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('M0 only connects to a loopback proxy.');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !keys[0]) throw new Error('A valid port and API key are required.');
  return { baseURL: `http://${host === '::1' ? '[::1]' : host}:${port}/v1`, apiKey: keys[0] };
}

export function outputText(response) {
  return (response.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
}
