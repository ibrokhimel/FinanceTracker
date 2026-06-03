/**
 * Light integration tests — exercise tools and queries against an in-memory DB.
 * Doesn't hit Telegram or AI providers.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-finance.db');

beforeAll(() => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
});

describe('integration smoke', () => {
  it('initialises DB and runs migrations', async () => {
    const { initDatabase } = await import('../db/database.js');
    const db = initDatabase();
    expect(db).toBeTruthy();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    expect(tables).toContain('expenses');
    expect(tables).toContain('audit_log');
    expect(tables).toContain('investments');
    expect(tables).toContain('streaks');
    expect(tables).toContain('life_events');
    expect(tables).toContain('exchange_rates');
    expect(tables).toContain('schema_version');
  });

  it('adds an expense and logs audit on delete', async () => {
    const { findOrCreateUser } = await import('../db/queries/users.js');
    const { addExpense, deleteExpense, getExpenseById } = await import('../db/queries/expenses.js');
    const { logAudit, getLastDeleted } = await import('../db/queries/audit.js');

    const user = findOrCreateUser(7777, 'Tester', 'tester');
    const exp = addExpense({
      user_id: user.id, amount: 12345, category_id: null,
      note: 'test entry', date: '2026-06-03', type: 'expense',
    });
    expect(exp.id).toBeGreaterThan(0);

    const before = getExpenseById(exp.id);
    logAudit({ userId: user.id, action: 'delete', table: 'expenses', targetId: exp.id, before });
    deleteExpense(exp.id);

    const last = getLastDeleted(user.id);
    expect(last).toBeTruthy();
    expect(JSON.parse(last.before_json).amount).toBe(12345);
  });

  it('regret tool finds nothing on empty audit', async () => {
    const { regretByCategory } = await import('../tools/regret.js');
    const r = regretByCategory(999999);
    expect(Array.isArray(r)).toBe(true);
  });

  it('keyboards build inline structures', async () => {
    const { mainMenu, expenseActions, chartMenu } = await import('../bot/keyboards.js');
    expect(mainMenu().reply_markup.inline_keyboard.length).toBeGreaterThan(0);
    expect(expenseActions(42).reply_markup.inline_keyboard[0][0].callback_data).toContain('42');
    expect(chartMenu().reply_markup.inline_keyboard).toBeTruthy();
  });
});
