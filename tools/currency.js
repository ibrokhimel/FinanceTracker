/**
 * Currency conversion + rate caching.
 *
 * - Fetches rates from exchangerate-api.com (using credentials key) or frankfurter.app (no key).
 * - Caches rates in exchange_rates table; refreshes if older than 24h.
 * - Falls back gracefully if network/key fails — returns null amount, never throws.
 */

import { config } from './config.js';
import { getDb } from '../db/database.js';

const RATE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Fetch latest rates for a given base currency.
 * Returns a `{ <quote>: <rate> }` map or null on failure.
 */
async function fetchRatesFromApi(base) {
  const provider = config.currency.provider;

  try {
    let url;
    if (provider === 'exchangerate_host' && config.currency.exchangerateHost.apiKey) {
      url = `https://v6.exchangerate-api.com/v6/${config.currency.exchangerateHost.apiKey}/latest/${base}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.result === 'success') return json.conversion_rates;
    }

    // Fallback to frankfurter (no key, ECB rates)
    url = `https://api.frankfurter.app/latest?from=${base}`;
    const res2 = await fetch(url);
    const json2 = await res2.json();
    if (json2?.rates) {
      json2.rates[base] = 1; // include the base itself
      return json2.rates;
    }
  } catch (err) {
    console.warn('[currency] rate fetch failed:', err.message);
  }
  return null;
}

function getCachedRate(db, base, quote) {
  const row = db.prepare(`
    SELECT rate, fetched_at FROM exchange_rates
    WHERE base = ? AND quote = ?
    ORDER BY fetched_at DESC LIMIT 1
  `).get(base, quote);
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at + 'Z').getTime();
  if (age > RATE_TTL_MS) return null;
  return row.rate;
}

function storeRates(db, base, rates) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO exchange_rates (base, quote, rate, fetched_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  const tx = db.transaction(() => {
    for (const [q, r] of Object.entries(rates)) {
      if (typeof r === 'number' && isFinite(r)) insert.run(base, q, r);
    }
  });
  tx();
}

/**
 * Convert amount from `from` currency to `to` currency.
 * Returns number or null if rate unavailable.
 *
 * @param {number} amount
 * @param {string} from
 * @param {string} to
 * @returns {Promise<number|null>}
 */
export async function convert(amount, from, to) {
  if (!amount || amount === 0) return 0;
  if (!from || !to) return null;
  from = from.toUpperCase();
  to = to.toUpperCase();
  if (from === to) return amount;

  let db;
  try { db = getDb(); } catch { db = null; }

  // 1. cached?
  if (db) {
    const cached = getCachedRate(db, from, to);
    if (cached) return amount * cached;
  }

  // 2. fetch
  const rates = await fetchRatesFromApi(from);
  if (!rates) return null;

  if (db) storeRates(db, from, rates);

  const rate = rates[to];
  if (typeof rate !== 'number') return null;
  return amount * rate;
}

/**
 * Synchronous conversion using only cached rates.
 * Use this in hot paths (display formatters).
 */
export function convertCached(amount, from, to) {
  if (!amount) return 0;
  from = (from || '').toUpperCase();
  to = (to || '').toUpperCase();
  if (!from || !to || from === to) return amount;
  let db;
  try { db = getDb(); } catch { return null; }
  const rate = getCachedRate(db, from, to);
  return rate != null ? amount * rate : null;
}

/**
 * Background refresh — call at startup and once per day from cron.
 */
export async function refreshRates(bases = ['USD', 'UZS', 'EUR']) {
  let db;
  try { db = getDb(); } catch { return; }
  for (const b of bases) {
    const rates = await fetchRatesFromApi(b);
    if (rates) storeRates(db, b, rates);
  }
}

/**
 * Detect a currency code embedded in text like "lunch 25000 usd" or "5m UZS".
 * Returns ISO code or null.
 */
export function detectCurrency(text) {
  if (!text) return null;
  const m = String(text).toUpperCase().match(/\b(USD|EUR|GBP|RUB|UZS|JPY|CNY|TRY|KZT|KRW|INR|CAD|AUD|CHF|AED|SAR|PLN)\b/);
  return m ? m[1] : null;
}
