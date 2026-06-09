/**
 * /score — only scores dimensions you actually use, rescaled to 100, and refuses
 * to grade until there's a substantive signal (budget/income/debt/goal).
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
const todayISO = () => new Date().toISOString().slice(0, 10);

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
    expect(b.calls.sendMessage[0]).toMatch(/not enough/i);
  });

  it('a few expense-days alone are NOT enough (no substantive dimension)', async () => {
    for (let i = 0; i < 3; i++) {
      m.exp.addExpense({ user_id: user.id, amount: 10000, note: 'x', date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), type: 'expense' });
    }
    const b = bot();
    await m.score.handleScore(b, { chat: { id: 7600 }, user });
    expect(b.calls.sendPhoto).toHaveLength(0);
    expect(b.calls.sendMessage[0]).toMatch(/not enough/i);
  });

  it('scores once there is a substantive dimension (income)', async () => {
    m.exp.addExpense({ user_id: user.id, amount: 500000, note: 'salary', date: todayISO(), type: 'income' });
    const b = bot();
    await m.score.handleScore(b, { chat: { id: 7600 }, user });
    const saidNo = (b.calls.sendMessage[0] || '').match(/not enough/i);
    expect(saidNo).toBeFalsy();
    expect(b.calls.sendPhoto.length + b.calls.sendMessage.length).toBeGreaterThan(0);
  });
});
