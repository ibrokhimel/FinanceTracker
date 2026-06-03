import { describe, it, expect } from 'vitest';
import { detectCurrency, convert } from '../tools/currency.js';

describe('currency.detectCurrency', () => {
  it('detects USD', () => {
    expect(detectCurrency('lunch 25 usd')).toBe('USD');
  });
  it('detects UZS', () => {
    expect(detectCurrency('50k UZS coffee')).toBe('UZS');
  });
  it('returns null when none found', () => {
    expect(detectCurrency('lunch 25000')).toBe(null);
  });
});

describe('currency.convert', () => {
  it('returns same amount when from === to', async () => {
    const r = await convert(100, 'USD', 'USD');
    expect(r).toBe(100);
  });
  it('returns 0 for zero amount', async () => {
    const r = await convert(0, 'USD', 'EUR');
    expect(r).toBe(0);
  });
});
