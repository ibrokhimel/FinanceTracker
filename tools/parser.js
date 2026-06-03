/**
 * Regex-based natural language parser for finance messages.
 * Pure function — takes raw text, returns structured result.
 * Calls categorizer.js and dateHelper.js internally.
 */

import { categorize } from './categorizer.js';
import { resolveDate } from './dateHelper.js';

/* ─── Amount parsing ─────────────────────────────────────────────────────── */

const AMOUNT_PATTERNS = [
  // "50k", "1.5m", "200k"
  /(\d+(?:\.\d+)?)\s*([kKmMbB])\b/,
  // "25,000" or "25000"
  /([\d,]+(?:\.\d{1,2})?)/,
];

function parseAmount(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const lower = raw.toLowerCase().trim();

  // Shorthand notation
  const shorthandMatch = lower.match(/(\d+(?:\.\d+)?)\s*([kkmb])/);
  if (shorthandMatch) {
    const num = parseFloat(shorthandMatch[1]);
    const suffix = shorthandMatch[2];
    if (suffix === 'k') return Math.round(num * 1000);
    if (suffix === 'm') return Math.round(num * 1_000_000);
    if (suffix === 'b') return Math.round(num * 1_000_000_000);
  }

  // Numeric amount — find the first number
  const numMatch = lower.match(/(\d[\d,]*)(?:\.\d+)?/);
  if (numMatch) {
    return Math.round(parseFloat(numMatch[1].replace(/,/g, '')));
  }

  return null;
}

/* ─── Pattern detection ──────────────────────────────────────────────────── */

const PATTERNS = [
  // "spent 25000 on lunch", "spent 50k on dinner"
  /(?:spent|paid|cost|spend|used|wasted)\s+(\S+(?:\s+\S+)?)\s+(?:on|for|at|in)\s+(.+)/i,

  // "received 500000 salary", "got 20000 freelance"
  /(?:received|got|earned|made|deposited)\s+(\S+(?:\s+\S+)?)\s+(?:(?:from|for)\s+)?(.+)/i,

  // "lunch 25000", "coffee 450", "bus 1500"  (note first, amount second)
  /^(.+?)\s+(?:is\s+)?(\d[\d,]*\s*[kKmM]?)\s*$/i,

  // "25000 on lunch", "1500 for bus", "50000 for rent"
  /(\d[\d,]*\s*[kKmM]?)\s+(?:on|for|at|in)\s+(.+)/i,

  // "paid 25000 lunch" (no preposition)
  /(?:paid|spent|cost)\s+(\S+(?:\s+\S+)?)\s+(.+)/i,
];

const INCOME_PATTERNS = [
  /(?:received|got|earned|salary|income)\s+(\S+(?:\s+\S+)?)/i,
  /(\S+(?:\s+\S+)?)\s+(?:salary|income|salary for|income for)/i,
];

const DATE_PATTERNS = [
  /(?:yesterday|today|last\s+\w+|this\s+\w+|\d+\s+days?\s+ago)/i,
  /on\s+(\d{1,2})(?:st|nd|rd|th)?/i,
];

/* ─── Main parser ────────────────────────────────────────────────────────── */

/**
 * Parse a natural language finance message.
 *
 * @param {string} text - Raw user message
 * @returns {{
 *   type: 'expense'|'income',
 *   amount: number|null,
 *   category: string|null,
 *   emoji: string|null,
 *   note: string|null,
 *   date: string|null,
 *   tags: string[],
 *   confidence: number,       // 0-100
 *   needsClarification: boolean,
 *   rawText: string
 * }}
 */
export function parseMessage(text) {
  const result = {
    type: 'expense',
    amount: null,
    category: null,
    emoji: null,
    note: null,
    date: null,
    tags: [],
    confidence: 0,
    needsClarification: false,
    rawText: text,
  };

  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    result.needsClarification = true;
    return result;
  }

  const trimmed = text.trim();

  /* ── Detect income vs expense ── */
  const isIncome = /^(received|got|earned|made|salary|income|deposited)/i.test(trimmed) ||
                   /\b(salary|income|freelance payment|dividend)\b/i.test(trimmed) &&
                   !/\b(spent|paid|cost|buy|purchase)\b/i.test(trimmed);
  result.type = isIncome ? 'income' : 'expense';

  /* ── Extract amount ── */
  let amountRaw = null;
  let noteRaw = trimmed;

  // Try each pattern
  const patternsToTry = isIncome ? [...INCOME_PATTERNS, ...PATTERNS] : PATTERNS;

  for (const pattern of patternsToTry) {
    const match = trimmed.match(pattern);
    if (match) {
      // Determine which capture group is the amount and which is the note
      const groups = match.slice(1);
      let amt = null;
      let nt = null;

      for (const g of groups) {
        const parsed = parseAmount(g);
        if (parsed !== null && parsed > 0) {
          amt = parsed;
        } else if (g && !amt) {
          nt = g;
        }
      }

      // Swap if first group is clearly a note and second is amount
      if (groups.length >= 2) {
        const a = parseAmount(groups[1]);
        if (a !== null && a > 0 && parseAmount(groups[0]) === null) {
          amt = a;
          nt = groups[0];
        }
      }

      if (amt !== null) {
        amountRaw = amt;
        noteRaw = nt || groups[groups.length - 1] || '';
        break;
      }
    }
  }

  // Fallback: find any number in the text
  if (amountRaw === null) {
    const anyNumber = trimmed.match(/(\d[\d,]*)(?:\.\d+)?/);
    if (anyNumber) {
      amountRaw = Math.round(parseFloat(anyNumber[1].replace(/,/g, '')));
      noteRaw = trimmed.replace(anyNumber[0], '').trim();
      // Clean leading prepositions
      noteRaw = noteRaw.replace(/^(?:on|for|at|in|to|is)\s+/i, '').trim();
    }
  }

  if (amountRaw === null || amountRaw <= 0) {
    result.needsClarification = true;
    result.confidence = 5;
    return result;
  }

  result.amount = amountRaw;

  /* ── Extract note and categorize ── */
  // Remove amount from note
  noteRaw = noteRaw.replace(/[\d,]+(?:\.\d+)?\s*[kKmM]?\s*/g, '').trim();
  noteRaw = noteRaw.replace(/^(?:spent|paid|cost|received|got|earned)\s+/i, '').trim();
  noteRaw = noteRaw.replace(/^(?:on|for|at|in|to|as|is)\s+/i, '').trim();
  noteRaw = noteRaw.replace(/\s+(?:on|for|at|in|to)\s+$/i, '').trim();

  result.note = noteRaw || `${isIncome ? 'Income' : 'Expense'}`;

  const catResult = categorize(result.note);
  result.category = catResult.category;
  result.emoji = catResult.emoji;

  /* ── Extract tags (#work, #family) ── */
  const tagMatch = trimmed.match(/#(\w+)/g);
  if (tagMatch) result.tags = tagMatch.map(t => t.slice(1));

  /* ── Extract date ── */
  for (const dp of DATE_PATTERNS) {
    const dm = trimmed.match(dp);
    if (dm) {
      const resolved = resolveDate(dm[0]);
      if (resolved) {
        result.date = resolved;
        break;
      }
    }
  }

  // Default date = today
  if (!result.date) {
    result.date = new Date().toISOString().slice(0, 10);
  }

  /* ── Confidence score ── */
  let score = 0;
  if (result.amount > 0) score += 40;
  if (result.category && result.category !== 'Other') score += 25;
  if (result.note && result.note.length > 1) score += 20;
  if (result.date) score += 15;
  if (result.tags.length > 0) score += 5;

  // Bonus for explicit structure
  if (/spent|paid|received|got|earned/i.test(trimmed)) score += 10;
  if (/(?:on|for|at)\s+\w+/i.test(trimmed)) score += 5;

  result.confidence = Math.min(score, 100);
  result.needsClarification = result.confidence < 40;

  return result;
}

/**
 * Wrapper that returns the most important fields for direct use.
 */
export function parseQuick(text) {
  const result = parseMessage(text);
  return {
    type: result.type,
    amount: result.amount,
    category: result.category,
    emoji: result.emoji,
    note: result.note,
    date: result.date,
    tags: result.tags,
    needsClarification: result.needsClarification,
    confidence: result.confidence,
  };
}
