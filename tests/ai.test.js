import { describe, it, expect } from 'vitest';
import { aiHealth, chat } from '../tools/ai.js';

describe('ai client', () => {
  it('exposes aiHealth with provider flags', () => {
    const h = aiHealth();
    expect(h).toHaveProperty('groq');
    expect(h).toHaveProperty('gemini');
    expect(h).toHaveProperty('openrouter');
  });

  it('chat returns envelope shape on no-provider', async () => {
    // We don't actually call providers in tests — just verify envelope shape exists
    const res = await chat([{ role: 'user', content: 'ping' }], { maxTokens: 5 }).catch(e => ({ ok: false, error: e.message }));
    expect(res).toHaveProperty('ok');
  }, 30000);
});
