// Shared Gemini transport for the offline generators (gloss, related words, example sentences).
// Never called at build or runtime. Handles model fallback on daily quota and backoff on transient errors.

/** Models tried in order; on a daily-quota 429 the next one is used. Override with GEMINI_MODEL. */
export const GEMINI_MODELS = (process.env.GEMINI_MODEL || [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
].join(',')).split(',').map((m) => m.trim());
export const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL || ''; // '' = model default

export class DailyQuotaError extends Error {}

let modelIndex = 0;
/** The model the next request will use, or undefined once every model is out of daily quota. */
export function currentModel(): string | undefined {
  return GEMINI_MODELS[modelIndex];
}

export interface GeminiJsonRequest {
  system: string;
  contents: unknown[];
  schema: object;
}

export async function callGeminiJson<T>(apiKey: string, req: GeminiJsonRequest): Promise<{ model: string; items: T[] }> {
  const backoffMs = Number(process.env.GEMINI_BACKOFF_MS || 2000); // tests shrink this
  for (let attempt = 0; ; attempt++) {
    const model = GEMINI_MODELS[modelIndex];
    if (!model) throw new DailyQuotaError('All configured Gemini models are out of daily quota');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: req.schema,
          ...(THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429 && /PerDay/.test(JSON.stringify(body))) {
      process.stderr.write(`[gemini] ${model}: daily quota exhausted, switching model\n`);
      modelIndex++;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 6) throw new Error(`Gemini HTTP ${res.status} after retries`);
      process.stderr.write(`[gemini] ${model}: HTTP ${res.status}, backing off ${(backoffMs * 2 ** attempt) / 1000}s\n`);
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('');
    if (!text) throw new Error(`Empty Gemini response: ${JSON.stringify(body).slice(0, 300)}`);
    return { model, items: JSON.parse(text) as T[] };
  }
}
