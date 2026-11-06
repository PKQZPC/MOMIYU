import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readProxyConfig, outputText } from './lib/proxy-config.mjs';
import { m0Root, writeReport } from './lib/report.mjs';

const args = process.argv.slice(2);
const configIndex = args.indexOf('--proxy-config');
if (configIndex < 0 || !args[configIndex + 1]) throw new Error('Usage: node probe-models.mjs --proxy-config PATH [--run]');
const config = readProxyConfig(args[configIndex + 1]);
const headers = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };
async function request(route, payload) {
  const response = await fetch(`${config.baseURL}${route}`, { method: payload ? 'POST' : 'GET', headers, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
  return response.json();
}
const listed = await request('/models');
const models = (listed.data || []).map(item => item.id).sort();
const checks = [], calls = [];
if (args.includes('--run')) {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(m0Root, '../../tests/fixtures/m0/model-cases.json'), 'utf8'));
  if (!Array.isArray(fixture.cases) || fixture.cases.length > 3) throw new Error('M0 allows at most three synthetic calls per explicit run.');
  for (const testCase of fixture.cases) {
    if (!['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'].includes(testCase.model)) throw new Error('Unapproved M0 debug model.');
    if (!models.includes(testCase.model)) { checks.push({ id: testCase.id, passed: false, reason: 'model_not_listed' }); continue; }
    // At most one request per fixture case. No automatic retries or hidden fallbacks.
    const payload = { model: testCase.model, store: false, input: testCase.prompt, max_output_tokens: 700, reasoning: { effort: 'low' } };
    const started = Date.now();
    try {
      const result = await request('/responses', payload);
      const text = outputText(result);
      let parsed; try { parsed = JSON.parse(text); } catch { parsed = null; }
      const passed = result.status === 'completed' && isDeepStrictEqual(parsed, testCase.expected);
      calls.push({ id: testCase.id, model: testCase.model, response_model: result.model, response_status: result.status, duration_ms: Date.now() - started, usage: result.usage || null, request: payload, output: text });
      checks.push({ id: testCase.id, passed: Boolean(passed), response_status: result.status, parsed_json: Boolean(parsed) });
    } catch (error) {
      calls.push({ id: testCase.id, model: testCase.model, duration_ms: Date.now() - started, error: error.name === 'TimeoutError' ? 'timeout_completion_unknown' : String(error.message).replace(/Bearer\s+\S+/g, 'Bearer [redacted]') });
      checks.push({ id: testCase.id, passed: false, reason: 'request_failed_or_unknown' });
    }
  }
}
writeReport('models', { status: checks.length ? checks.every(item => item.passed) ? 'passed' : 'limited' : 'discovery_only', model_ids: models, image_generation: { status: 'not_executed', listed_models: models.filter(id => /image/.test(id)), reason: 'Image generation budget and provider format not yet confirmed.' }, checks, calls, limitations: ['Synthetic text only; not a skill acquisition or execution evaluation.', 'Model discovery does not verify image tools, privacy retention or pricing.'] });
