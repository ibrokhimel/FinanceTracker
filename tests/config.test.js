import { describe, it, expect } from 'vitest';
import { config, configHealth } from '../tools/config.js';

describe('config loader', () => {
  it('exposes a frozen config object', () => {
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('has telegram, ai, currency sections', () => {
    expect(config).toHaveProperty('telegram');
    expect(config).toHaveProperty('ai.groq');
    expect(config).toHaveProperty('ai.gemini');
    expect(config).toHaveProperty('ai.openrouter');
    expect(config).toHaveProperty('currency.base');
  });

  it('falls back to default models when not specified', () => {
    expect(config.ai.groq.model).toBeTruthy();
    expect(config.ai.gemini.model).toBeTruthy();
  });

  it('reports health for each provider', () => {
    const h = configHealth();
    expect(h).toHaveProperty('telegram');
    expect(h).toHaveProperty('groq');
    expect(h).toHaveProperty('gemini');
  });
});
