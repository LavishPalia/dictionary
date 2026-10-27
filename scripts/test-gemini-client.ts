// Checks the shared Gemini client (scripts/lib/gemini.ts) against a stubbed fetch; no network.
// Usage: npx tsx scripts/test-gemini-client.ts
process.env.GEMINI_BACKOFF_MS = '1'; // keep retry waits instant
import { callGeminiJson, currentModel, DailyQuotaError, GEMINI_MODELS } from './lib/gemini';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

type Stub = { status: number; body: unknown };
const calls: Array<{ url: string; body: any }> = [];
let queue: Stub[] = [];
globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
  calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
  const s = queue.shift() ?? { status: 500, body: {} };
  return { status: s.status, ok: s.status >= 200 && s.status < 300, json: async () => s.body } as Response;
}) as typeof fetch;

const okBody = (items: unknown[]) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] });
const perDay = { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }] }] } };
const req = { system: 'SYS', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], schema: { type: 'ARRAY' } };
const usedModel = (i: number) => calls[i].url.split('/models/')[1].split(':')[0];

async function main() {
  check('has several models configured', GEMINI_MODELS.length >= 2);
  check('currentModel starts at the first model', currentModel() === GEMINI_MODELS[0]);

  // Request shape, and a 503 that is retried then succeeds.
  queue = [{ status: 503, body: {} }, { status: 200, body: okBody([{ a: 1 }]) }];
  let r = await callGeminiJson<{ a: number }>('KEY', req);
  check('503 is retried then succeeds', calls.length === 2 && r.items[0].a === 1);
  check('retry stays on the same model', usedModel(0) === GEMINI_MODELS[0] && usedModel(1) === GEMINI_MODELS[0] && r.model === GEMINI_MODELS[0]);
  const b = calls[1].body;
  check('body carries systemInstruction', b.systemInstruction?.parts?.[0]?.text === 'SYS');
  check('body carries contents', JSON.stringify(b.contents) === JSON.stringify(req.contents));
  check('body carries generationConfig.responseSchema', JSON.stringify(b.generationConfig?.responseSchema) === JSON.stringify(req.schema));
  check('body asks for JSON', b.generationConfig?.responseMimeType === 'application/json');

  // Per-day 429 on model 1 moves to model 2, and it sticks for the next call.
  calls.length = 0;
  queue = [{ status: 429, body: perDay }, { status: 200, body: okBody([]) }];
  r = await callGeminiJson('KEY', req);
  check('per-day 429 switches to the next model', usedModel(0) === GEMINI_MODELS[0] && usedModel(1) === GEMINI_MODELS[1] && r.model === GEMINI_MODELS[1]);
  check('currentModel reports the new model', currentModel() === GEMINI_MODELS[1]);
  calls.length = 0;
  queue = [{ status: 200, body: okBody([]) }];
  r = await callGeminiJson('KEY', req);
  check('the next call starts on model 2', usedModel(0) === GEMINI_MODELS[1]);

  // A non-daily 429 backs off and retries on the same model.
  calls.length = 0;
  queue = [{ status: 429, body: { error: 'rate' } }, { status: 200, body: okBody([]) }];
  r = await callGeminiJson('KEY', req);
  check('other 429 is retried on the same model', calls.length === 2 && r.model === GEMINI_MODELS[1]);

  // Every model out of daily quota.
  queue = GEMINI_MODELS.map(() => ({ status: 429, body: perDay }));
  let err: unknown;
  try { await callGeminiJson('KEY', req); } catch (e) { err = e; }
  check('all models out of quota throws DailyQuotaError', err instanceof DailyQuotaError, String(err));
  check('currentModel is undefined when exhausted', currentModel() === undefined);

  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nAll Gemini client checks passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
