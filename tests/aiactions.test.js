/**
 * AI action executor (P1.6) — the pure DB-writing half, no AI involved.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DB = path.join(__dirname, '..', 'test-aiactions.db');

let m = {}, user;

beforeAll(async () => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  const { initDatabase } = await import('../db/database.js');
  initDatabase();
  m.act = await import('../handlers/aiActions.js');
  m.users = await import('../db/queries/users.js');
  m.exp = await import('../db/queries/expenses.js');
  m.budgets = await import('../db/queries/budgets.js');
  m.goals = await import('../db/queries/goals.js');
  user = m.users.findOrCreateUser(8200, 'T', 't');
});

describe('executeAction', () => {
  it('add_expense logs an expense with category', () => {
    const r = m.act.executeAction(user.id, { type: 'add_expense', amount: 50000, category: 'Food & Dining', note: 'lunch' });
    expect(r.ok).toBe(true);
    expect(r.expenseId).toBeGreaterThan(0);
    const e = m.exp.getExpenseById(r.expenseId);
    expect(e.amount).toBe(50000);
    expect(e.type).toBe('expense');
  });

  it('add_income logs income', () => {
    const r = m.act.executeAction(user.id, { type: 'add_income', amount: 5000000, note: 'salary' });
    expect(r.ok).toBe(true);
    expect(m.exp.getExpenseById(r.expenseId).type).toBe('income');
  });

  it('set_budget creates a budget for a known category', () => {
    const r = m.act.executeAction(user.id, { type: 'set_budget', category: 'Transport', amount: 300000 });
    expect(r.ok).toBe(true);
    const b = m.budgets.getBudgets(user.id).find(x => x.cat_name === 'Transport');
    expect(b.amount).toBe(300000);
  });

  it('set_budget rejects an unknown category', () => {
    const r = m.act.executeAction(user.id, { type: 'set_budget', category: 'Nonexistent', amount: 1000 });
    expect(r.ok).toBe(false);
  });

  it('create_goal then add_to_goal', () => {
    const r1 = m.act.executeAction(user.id, { type: 'create_goal', name: 'Laptop', amount: 2000000 });
    expect(r1.ok).toBe(true);
    const r2 = m.act.executeAction(user.id, { type: 'add_to_goal', name: 'Laptop', amount: 500000 });
    expect(r2.ok).toBe(true);
    const g = m.goals.getGoals(user.id).find(x => x.name === 'Laptop');
    expect(g.current_amount).toBe(500000);
  });

  it('delete_expense removes an owned expense', () => {
    const r = m.act.executeAction(user.id, { type: 'add_expense', amount: 1234, note: 'x' });
    const d = m.act.executeAction(user.id, { type: 'delete_expense', id: r.expenseId });
    expect(d.ok).toBe(true);
    expect(m.exp.getExpenseById(r.expenseId)).toBeFalsy();
  });
});
