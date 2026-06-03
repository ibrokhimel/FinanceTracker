/**
 * Friction Mode — for categories the user is trying to cut,
 * pending expenses are held for N minutes before becoming "real".
 *
 *  - User adds "Food & Dining" to friction_categories via /settings.
 *  - When a new expense in that category is logged AND budget is over 80%,
 *    we set expenses.pending_until = +10 min.
 *  - A scheduled tick finalises pending entries past their pending_until time.
 *  - Within the window, /undo or the inline Cancel button removes it cleanly.
 */

import cron from 'node-cron';
import { getDb } from '../db/database.js';

const FRICTION_MINUTES = 10;

/** Returns true if this expense should be held pending. */
export function shouldDelay(userId, categoryId) {
  if (!categoryId) return false;
  try {
    const u = getDb().prepare('SELECT friction_categories FROM users WHERE id = ?').get(userId);
    const c = getDb().prepare('SELECT name FROM categories WHERE id = ?').get(categoryId);
    if (!u?.friction_categories || !c?.name) return false;
    const list = String(u.friction_categories).toLowerCase().split(',').map(s => s.trim());
    if (!list.includes(c.name.toLowerCase())) return false;

    // Also require budget > 80% spent in this category
    const month = new Date().toISOString().slice(0, 7);
    const b = getDb().prepare(
      'SELECT amount, spent FROM budgets WHERE user_id = ? AND category_id = ? AND month = ?'
    ).get(userId, categoryId, month);
    if (!b || !b.amount) return false;
    return (b.spent / b.amount) > 0.8;
  } catch { return false; }
}

export function markPending(expenseId, minutes = FRICTION_MINUTES) {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  getDb().prepare('UPDATE expenses SET pending_until = ? WHERE id = ?').run(until, expenseId);
  return until;
}

export function isPending(expense) {
  if (!expense?.pending_until) return false;
  return new Date(expense.pending_until).getTime() > Date.now();
}

export function cancelPending(expenseId) {
  const row = getDb().prepare('SELECT * FROM expenses WHERE id = ? AND pending_until IS NOT NULL').get(expenseId);
  if (!row) return false;
  getDb().prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);
  return true;
}

/** Sweep — clears pending_until for expenses past their hold time. */
export function sweepPending() {
  const now = new Date().toISOString();
  getDb().prepare("UPDATE expenses SET pending_until = NULL WHERE pending_until IS NOT NULL AND pending_until < ?").run(now);
}

export function initFrictionSweeper() {
  cron.schedule('*/2 * * * *', () => {
    try { sweepPending(); } catch (e) { console.error('[friction] sweep:', e.message); }
  });
}
