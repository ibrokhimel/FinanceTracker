/**
 * Central config loader.
 * Reads credentials.json, falls back to .env, returns frozen config object.
 *
 * Usage:  import { config } from './tools/config.js';
 *         config.ai.groq.api_key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CRED_PATH = path.join(ROOT, 'credentials.json');

function loadJson() {
  try {
    const raw = fs.readFileSync(CRED_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[config] credentials.json exists but could not be parsed:', err.message);
    }
    return {};
  }
}

const json = loadJson();

function pick(jsonVal, envKey, fallback) {
  const v = jsonVal ?? process.env[envKey];
  if (v === '' || v === undefined || v === null) return fallback ?? null;
  return v;
}

export const config = Object.freeze({
  telegram: {
    botToken: pick(json.telegram?.bot_token, 'TELEGRAM_BOT_TOKEN'),
  },
  ai: {
    groq: {
      apiKey: pick(json.ai?.groq?.api_key, 'GROQ_API_KEY'),
      model: pick(json.ai?.groq?.default_model, 'GROQ_MODEL', 'llama-3.3-70b-versatile'),
      whisperModel: pick(json.ai?.groq?.whisper_model, 'GROQ_WHISPER_MODEL', 'whisper-large-v3'),
    },
    gemini: {
      apiKey: pick(json.ai?.gemini?.api_key, 'GEMINI_API_KEY'),
      model: pick(json.ai?.gemini?.default_model, 'GEMINI_MODEL', 'gemini-2.5-flash'),
    },
    openrouter: {
      apiKey: pick(json.ai?.openrouter?.api_key, 'OPENROUTER_API_KEY'),
      model: pick(json.ai?.openrouter?.default_model, 'OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free'),
    },
    ollama: {
      enabled: json.ai?.ollama?.enabled ?? false,
      baseUrl: pick(json.ai?.ollama?.base_url, 'OLLAMA_BASE_URL', 'http://localhost:11434'),
      model: pick(json.ai?.ollama?.default_model, 'OLLAMA_MODEL', 'mistral'),
    },
  },
  voice: {
    provider: pick(json.voice?.provider, 'VOICE_PROVIDER', 'groq'),
  },
  ocr: {
    provider: pick(json.ocr?.provider, 'OCR_PROVIDER', 'gemini'),
  },
  currency: {
    base: pick(json.currency?.base_currency, 'BASE_CURRENCY', 'UZS'),
    provider: pick(json.currency?.provider, 'CURRENCY_PROVIDER', 'exchangerate_host'),
    exchangerateHost: {
      apiKey: pick(json.currency?.exchangerate_host?.api_key, 'EXCHANGERATE_API_KEY'),
    },
    fixer: {
      apiKey: pick(json.currency?.fixer?.api_key, 'FIXER_API_KEY'),
    },
  },
  settings: {
    locale: pick(json.settings?.locale, 'LOCALE', 'en-US'),
    timezone: pick(json.settings?.timezone, 'TZ', 'Asia/Tashkent'),
    dbPath: pick(json.settings?.db_path, 'DB_PATH'),
  },
});

/**
 * Validate on startup. Throws (and exits) if a hard-required field is missing.
 * Logs warnings for soft-required (AI providers) but allows boot.
 */
export function validateConfig({ exitOnFail = true } = {}) {
  const errors = [];
  const warnings = [];

  if (!config.telegram.botToken) errors.push('telegram.bot_token is REQUIRED');

  const anyAI = config.ai.groq.apiKey || config.ai.gemini.apiKey || config.ai.openrouter.apiKey || config.ai.ollama.enabled;
  if (!anyAI) warnings.push('no AI provider configured — debrief, personality, OCR, voice will be unavailable');
  if (!config.currency.exchangerateHost.apiKey) warnings.push('no exchange-rate API key — using frankfurter (no-key) fallback');

  if (errors.length) {
    console.error('❌ Config errors:');
    for (const e of errors) console.error('   • ' + e);
    if (exitOnFail) process.exit(1);
  }
  for (const w of warnings) console.warn('⚠️  ' + w);
  return { errors, warnings };
}

/**
 * Quick health check — which providers are usable.
 */
export function configHealth() {
  return {
    telegram: !!config.telegram.botToken,
    groq: !!config.ai.groq.apiKey,
    gemini: !!config.ai.gemini.apiKey,
    openrouter: !!config.ai.openrouter.apiKey,
    ollama: !!config.ai.ollama.enabled,
    exchangerate: !!config.currency.exchangerateHost.apiKey,
  };
}
