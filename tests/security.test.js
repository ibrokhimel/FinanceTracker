import { describe, it, expect } from 'vitest';
import { sanitizeError, capLength, scrubPII, hashChain } from '../tools/security.js';
import { check, size } from '../tools/rateLimit.js';

describe('sanitizeError', () => {
  it('returns safe message for SQLITE_CONSTRAINT', () => {
    expect(sanitizeError({ code: 'SQLITE_CONSTRAINT' })).toContain('conflicts');
  });
  it('strips windows paths', () => {
    const s = sanitizeError({ message: 'failed at C:\\Users\\secret\\file.js' });
    expect(s).not.toContain('Users');
    expect(s).toContain('<path>');
  });
  it('strips long tokens', () => {
    const s = sanitizeError({ message: 'invalid sk-abcdefghijklmnopqrstuvwxyz123' });
    expect(s).toContain('<token>');
  });
});

describe('capLength', () => {
  it('caps to 500 by default', () => {
    expect(capLength('x'.repeat(1000)).length).toBe(500);
  });
  it('caps category names to 64', () => {
    expect(capLength('x'.repeat(200), 'categoryName').length).toBe(64);
  });
});

describe('scrubPII', () => {
  it('replaces emails', () => {
    expect(scrubPII('mail me at user@example.com please')).toBe('mail me at <email> please');
  });
  it('replaces phone numbers', () => {
    expect(scrubPII('call +1 555 123 4567')).toContain('<phone>');
  });
});

describe('hashChain', () => {
  it('produces stable hash for same input', () => {
    const a = hashChain('prev', { x: 1, y: 'foo' });
    const b = hashChain('prev', { y: 'foo', x: 1 });
    expect(a).toBe(b); // order-independent
  });
  it('changes hash when payload differs', () => {
    expect(hashChain('prev', { x: 1 })).not.toBe(hashChain('prev', { x: 2 }));
  });
});

describe('rate limiter', () => {
  it('allows up to limit then throttles', () => {
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      if (check(`u_${Date.now()}_rl`, 'msg')) allowed++;
    }
    // first 30 msgs should pass
    expect(allowed).toBeGreaterThanOrEqual(25);
    expect(allowed).toBeLessThanOrEqual(31);
  });
  it('tracks bucket size', () => {
    expect(size()).toBeGreaterThan(0);
  });
});
