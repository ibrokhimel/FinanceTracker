/**
 * /stats — renders a dashboard with the version and the user's data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-stats.db');

let m = {}, user;

beforeAll(async () => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  const { initDatabase } = await import('../db/database.js');
  initDatabase();
  m.stats = await import('../handlers/stats.js');
  m.users = await import('../db/queries/users.js');
  m.exp = await import('../db/queries/expenses.js');
  m.version = await import('../tools/version.js');
  user = m.users.findOrCreateUser(8300, 'T', 't');
  m.exp.addExpense({ user_id: user.id, amount: 25000, note: 'lunch', date: new Date().toISOString().slice(0, 10), type: 'expense' });
});

describe('handleStats', () => {
  it('sends a dashboard including the current version', async () => {
    const sent = [];
    const bot = { sendMessage: (id, t, o) => { sent.push({ t, o }); return Promise.resolve(); } };
    await m.stats.handleStats(bot, { chat: { id: 8300 }, user });
    expect(sent).toHaveLength(1);
    expect(sent[0].t).toContain(`v${m.version.VERSION}`);
    expect(sent[0].t).toContain('Stats');
    expect(sent[0].o.reply_markup).toBeTruthy(); // has buttons
  });
});
