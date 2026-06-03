/**
 * Security helpers.
 *
 *  - sanitizeError(err): a user-safe error message (no stack, no internals)
 *  - capLength(text, n):  hard cap on user input lengths
 *  - scrubPII(text):      remove emails/phones before sending to third-party AI
 *  - hashChain(prev, row): SHA-256 over previous hash + canonical row JSON
 */

import crypto from 'crypto';

const SAFE_ERRORS = new Map([
  ['ENOENT',           '📄 File not found'],
  ['EACCES',           '🚫 Permission denied'],
  ['SQLITE_CONSTRAINT','📌 That value conflicts with existing data'],
  ['ETIMEDOUT',        '⏱️ Service timed out — try again'],
  ['ECONNREFUSED',     '🔌 Could not reach the service'],
]);

export function sanitizeError(err) {
  if (!err) return 'Unknown error';
  const code = err.code;
  if (code && SAFE_ERRORS.has(code)) return SAFE_ERRORS.get(code);
  const msg = (err.message || String(err)).slice(0, 200);
  // Strip absolute paths, IPs, tokens
  return msg
    .replace(/[A-Za-z]:\\[^\s]+/g, '<path>')
    .replace(/\/[\w./-]+\.js[^\s]*/g, '<path>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '<token>');
}

const LIMITS = {
  text:        500,
  categoryName: 64,
  note:        200,
  personName:   80,
};

export function capLength(text, kind = 'text') {
  if (text == null) return '';
  const n = LIMITS[kind] || 500;
  return String(text).slice(0, n);
}

const PHONE_RE = /\+?\d[\d\s\-()]{7,}\d/g;
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const CARD_RE  = /\b(?:\d[ -]?){13,19}\b/g;

export function scrubPII(text) {
  if (!text) return '';
  return String(text)
    .replace(EMAIL_RE, '<email>')
    .replace(CARD_RE,  '<card>')
    .replace(PHONE_RE, '<phone>');
}

export function hashChain(prevHash, row) {
  const canonical = JSON.stringify(row, Object.keys(row).sort());
  return crypto.createHash('sha256').update((prevHash || '') + '|' + canonical).digest('hex');
}
