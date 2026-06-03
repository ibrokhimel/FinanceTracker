/**
 * Unified AI client with provider fallback chain.
 *
 *   chat(messages)         → text reply, tries Groq → OpenRouter → Gemini → Ollama
 *   parseExpense(text)     → structured parse using LLM JSON mode
 *   transcribe(buffer)     → Whisper transcription via Groq
 *   describeImage(buffer)  → Gemini multimodal description (used for receipts)
 *
 * Each call resolves to `{ ok, text|json, provider, error? }`.
 * Never throws — always returns an envelope.
 */

import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { config } from './config.js';
import { scrubPII } from './security.js';
import { check as rateLimit } from './rateLimit.js';
import { createLogger } from './logger.js';

const log = createLogger('ai');

/* ─── Response cache (1h TTL) ───────────────────────────────────────────── */
const CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function cacheKey(messages, opts) {
  const payload = JSON.stringify({ messages, model: opts?.json ? 'json' : 'text' });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
function cacheGet(k) {
  const v = CACHE.get(k);
  if (!v) return null;
  if (Date.now() > v.exp) { CACHE.delete(k); return null; }
  return v.value;
}
function cacheSet(k, value) {
  CACHE.set(k, { value, exp: Date.now() + CACHE_TTL_MS });
  if (CACHE.size > 500) { // simple cap
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
}

/* ─── Lazy clients ──────────────────────────────────────────────────────── */

let _groq, _gemini;
function groq() {
  if (!_groq && config.ai.groq.apiKey) _groq = new Groq({ apiKey: config.ai.groq.apiKey });
  return _groq;
}
function gemini() {
  if (!_gemini && config.ai.gemini.apiKey) _gemini = new GoogleGenerativeAI(config.ai.gemini.apiKey);
  return _gemini;
}

/* ─── Provider impls ────────────────────────────────────────────────────── */

async function chatGroq(messages, opts = {}) {
  const g = groq();
  if (!g) throw new Error('groq not configured');
  const res = await g.chat.completions.create({
    model: config.ai.groq.model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 600,
    response_format: opts.json ? { type: 'json_object' } : undefined,
  });
  opts._usage = { tokensIn: res.usage?.prompt_tokens || 0, tokensOut: res.usage?.completion_tokens || 0, model: config.ai.groq.model };
  return res.choices?.[0]?.message?.content || '';
}

async function chatOpenRouter(messages, opts = {}) {
  if (!config.ai.openrouter.apiKey) throw new Error('openrouter not configured');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.ai.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/financetracker-bot',
      'X-Title': 'FinanceTracker',
    },
    body: JSON.stringify({
      model: config.ai.openrouter.model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 600,
      response_format: opts.json ? { type: 'json_object' } : undefined,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.choices?.[0]?.message?.content || '';
}

async function chatGemini(messages, opts = {}) {
  const g = gemini();
  if (!g) throw new Error('gemini not configured');
  const model = g.getGenerativeModel({ model: config.ai.gemini.model });
  const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 600,
      responseMimeType: opts.json ? 'application/json' : 'text/plain',
    },
  });
  return result.response.text();
}

async function chatOllama(messages, opts = {}) {
  if (!config.ai.ollama.enabled) throw new Error('ollama disabled');
  const res = await fetch(`${config.ai.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ai.ollama.model,
      messages,
      stream: false,
      options: { temperature: opts.temperature ?? 0.4 },
    }),
  });
  const json = await res.json();
  return json?.message?.content || '';
}

/* ─── Public chat with fallback chain ───────────────────────────────────── */

const CHAIN = [
  ['groq', chatGroq],
  ['openrouter', chatOpenRouter],
  ['gemini', chatGemini],
  ['ollama', chatOllama],
];

export async function chat(messages, opts = {}) {
  // PII scrub user-side content (preserve system prompts)
  const safeMessages = messages.map(m =>
    m.role === 'user' ? { ...m, content: scrubPII(m.content) } : m
  );

  // Per-user rate limit (if userId passed in opts)
  if (opts.userId && !rateLimit(opts.userId, 'ai')) {
    return { ok: false, text: '', provider: null, error: 'rate-limited' };
  }

  // Cache lookup
  const key = cacheKey(safeMessages, opts);
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  const errors = [];
  for (const [name, fn] of CHAIN) {
    try {
      const text = await fn(safeMessages, opts);
      if (text && text.length > 0) {
        const env = { ok: true, text, provider: name };
        cacheSet(key, env);
        // record AI usage for /usage command
        if (opts.userId && opts._usage) {
          try {
            const { recordAiUsage } = await import('../db/queries/access.js');
            recordAiUsage({
              userId: opts.userId,
              provider: name,
              model: opts._usage.model,
              tokensIn: opts._usage.tokensIn,
              tokensOut: opts._usage.tokensOut,
              purpose: opts.purpose || 'chat',
            });
          } catch {}
        }
        return env;
      }
    } catch (err) {
      log.warn(`provider ${name} failed`, { error: err.message });
      errors.push(`${name}: ${err.message}`);
    }
  }
  return { ok: false, text: '', provider: null, error: errors.join(' | ') };
}

/* ─── Expense parser ────────────────────────────────────────────────────── */

const PARSE_SYSTEM = `You are a finance parser. Extract structured data from a user's natural-language expense or income message.

Return ONLY valid JSON, no prose. Schema:
{
  "type": "expense" | "income",
  "amount": number,
  "currency": "UZS" | "USD" | "EUR" | etc. | null,
  "category": string,
  "note": string,
  "date": "YYYY-MM-DD" | null,
  "tags": string[],
  "confidence": 0-100
}

Categories (pick one):
expense: Food & Dining, Groceries, Transport, Housing & Rent, Utilities, Entertainment, Shopping, Health, Education, Bills & Fees, Clothing, Gifts, Travel, Insurance, Other
income:  Salary, Freelance, Investments, Gifts Received, Other

Amount shorthand:
- "25k" = 25000
- "1.5m" = 1500000
- "5b" = 5000000000

If unclear, set confidence below 50.`;

export async function parseExpense(text, todayISO = new Date().toISOString().slice(0, 10)) {
  const messages = [
    { role: 'system', content: PARSE_SYSTEM },
    { role: 'user',   content: `Today is ${todayISO}.\nMessage: ${text}` },
  ];
  const res = await chat(messages, { json: true, temperature: 0.2, maxTokens: 300 });
  if (!res.ok) return null;
  try {
    const cleaned = res.text.replace(/^```json\s*|\s*```$/g, '').trim();
    const json = JSON.parse(cleaned);
    json._provider = res.provider;
    return json;
  } catch {
    return null;
  }
}

/* ─── Voice (Groq Whisper) ──────────────────────────────────────────────── */

export async function transcribe(buffer, mime = 'audio/ogg') {
  const g = groq();
  if (!g) return { ok: false, error: 'groq not configured' };
  try {
    const file = new File([buffer], 'voice.ogg', { type: mime });
    const res = await g.audio.transcriptions.create({
      file,
      model: config.ai.groq.whisperModel,
    });
    return { ok: true, text: res.text || '' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ─── Vision (Gemini multimodal) — receipts ─────────────────────────────── */

const RECEIPT_PROMPT = `Look at this receipt photo. Return ONLY JSON:
{
  "total": <number>,
  "currency": "<ISO code or null>",
  "merchant": "<name or null>",
  "date": "YYYY-MM-DD or null",
  "items": [{"name":"...", "amount":<number>}],
  "category_guess": "Food & Dining | Groceries | Transport | Shopping | Other"
}
Be accurate. If you cannot read the total, set "total" to 0.`;

const GEMINI_MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function tryGeminiReceipt(imageBuffer, mime) {
  const g = gemini();
  if (!g) throw new Error('gemini not configured');

  // Try configured model first, then fall back through the chain
  const tried = new Set();
  const order = [config.ai.gemini.model, ...GEMINI_MODEL_CHAIN].filter(m => {
    if (!m || tried.has(m)) return false;
    tried.add(m);
    return true;
  });

  let lastErr = null;
  for (const modelName of order) {
    try {
      const model = g.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        RECEIPT_PROMPT,
        { inlineData: { data: imageBuffer.toString('base64'), mimeType: mime } },
      ]);
      const text = result.response.text();
      const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
      return { json: JSON.parse(cleaned), raw: text, model: modelName };
    } catch (err) {
      lastErr = err;
      // 404 = model not available, try next; auth errors = bail
      if (!String(err.message).includes('404')) throw err;
    }
  }
  throw lastErr || new Error('no gemini model available');
}

async function tryOpenRouterVision(imageBuffer, mime) {
  if (!config.ai.openrouter.apiKey) throw new Error('openrouter not configured');
  const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.ai.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/financetracker-bot',
      'X-Title': 'FinanceTracker',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-exp:free',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: RECEIPT_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      response_format: { type: 'json_object' },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  const text = json.choices?.[0]?.message?.content || '';
  const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
  return { json: JSON.parse(cleaned), raw: text, model: 'openrouter:gemini-flash' };
}

export async function readReceipt(imageBuffer, mime = 'image/jpeg') {
  const errors = [];
  for (const [name, fn] of [['gemini', tryGeminiReceipt], ['openrouter', tryOpenRouterVision]]) {
    try {
      const result = await fn(imageBuffer, mime);
      return { ok: true, json: result.json, raw: result.raw, provider: name, model: result.model };
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return { ok: false, error: errors.join(' | ') };
}

/* ─── Free-form insight ─────────────────────────────────────────────────── */

export async function insight(prompt) {
  return chat([
    { role: 'system', content: 'You are a concise personal finance coach. Reply in 2-4 short sentences. Be specific, warm, never preachy.' },
    { role: 'user',   content: prompt },
  ], { temperature: 0.7, maxTokens: 300 });
}

/* ─── Health check ──────────────────────────────────────────────────────── */

export function aiHealth() {
  return {
    groq:       !!groq(),
    gemini:     !!gemini(),
    openrouter: !!config.ai.openrouter.apiKey,
    ollama:     !!config.ai.ollama.enabled,
  };
}
