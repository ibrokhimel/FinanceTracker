/**
 * /score guard — an empty account should NOT get a (D) score; it should say
 * "not enough data". Once there's activity, it renders a real score card.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-score.db');

let m = {}, user;
function bot() {
  const calls = { sendMessage: [], sendPhoto: [], sendChatAction: [] };
  return {
    calls,
    sendMessage: (id, t) => { calls.sendMessage.push(t); return Promise.resolve(); },
    sendPhoto: (id, b, o) => { calls.sendPhoto.push(o); return Promise.resolve(); },
    sendChatAction: () => Promise.resolve(),
  };
}

beforeAll(async () => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  const { initDatabase } = await import('../db/database.js');
  initDatabase();
  m.score = await import('../handlers/score.js');
  m.users = await import('../db/queries/users.js');
  m.exp = await import('../db/queries/expenses.js');
  user = m.users.findOrCreateUser(7600, 'T', 't');
});

describe('handleScore', () => {
  it('refuses to score an empty account', async () => {
    const b = bot();
    await m.score.handleScore(b, { chat: { id: 7600 }, user });
    expect(b.calls.sendPhoto).toHaveLength(0);
    expect(b.calls.sendMessage[0]).toMatch(/not enough data/i);
  });

  it('scores once there is activity', async () => {
    for (let i = 0; i < 3; i++) m.exp.addExpense({ user_id: user.id, amount: 10000, note: 'x', date: '2026-06-05', type: 'expense' });
    const b = bot();
    await m.score.handleScore(b, { chat: { id: 7600 }, user });
    // a real score is rendered (photo) — or the text fallback, but never the "not enough data" notice
    const saidNoData = (b.calls.sendMessage[0] || '').match(/not enough data/i);
    expect(saidNoData).toBeFalsy();
    expect(b.calls.sendPhoto.length + b.calls.sendMessage.length).toBeGreaterThan(0);
  });
});
