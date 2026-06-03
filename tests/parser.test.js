import { describe, it, expect } from 'vitest';
import { parseMessage, parseQuick } from '../tools/parser.js';

describe('parser', () => {
  it('parses "lunch 25000"', () => {
    const r = parseQuick('lunch 25000');
    expect(r.amount).toBe(25000);
    expect(r.type).toBe('expense');
  });

  it('parses shorthand "50k on groceries"', () => {
    const r = parseQuick('50k on groceries');
    expect(r.amount).toBe(50000);
  });

  it('parses million shorthand "salary 5m"', () => {
    const r = parseQuick('salary 5m');
    expect(r.amount).toBe(5_000_000);
    expect(r.type).toBe('income');
  });

  it('returns needsClarification for gibberish', () => {
    const r = parseQuick('hello');
    expect(r.needsClarification).toBe(true);
  });

  it('confidence score is 0-100', () => {
    const r = parseMessage('spent 25000 on lunch');
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
  });
});
