import { getDb } from '../database.js';

export function setBudget(userId, { categoryId, amount, period, month }) {
  const db = getDb();
  const m = month || new Date().toISOString().slice(0, 7);
  const existing = db.prepare(
    'SELECT * FROM budgets WHERE user_id = ? AND category_id IS ? AND month = ?'
  ).get(userId, categoryId || null, m);

  if (existing) {
    db.prepare("UPDATE budgets SET amount = ?, updated_at = datetime('now') WHERE id = ?").run(amount, existing.id);
    return getBudgetById(existing.id);
  }
  const info = db.prepare(
    'INSERT INTO budgets (user_id, category_id, amount, period, month) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, categoryId || null, amount, period || 'monthly', m);
  return getBudgetById(info.lastInsertRowid);
}

export function getBudgetById(id) {
  return getDb().prepare('SELECT * FROM budgets WHERE id = ?').get(id);
}

// `spent` is computed live from the expenses table for the budget's month, so it
// always reflects reality (deletes/edits included) rather than a stale counter.
// Category budgets sum that category; an overall budget (category_id IS NULL)
// sums every expense for the month.
const SPENT_SUBQUERY = `
  COALESCE((
    SELECT SUM(e.amount) FROM expenses e
    WHERE e.user_id = b.user_id AND e.type = 'expense'
      AND substr(e.date, 1, 7) = b.month
      AND (b.category_id IS NULL OR e.category_id = b.category_id)
  ), 0) AS spent`;

export function getBudgets(userId, month) {
  const m = month || new Date().toISOString().slice(0, 7);
  return getDb().prepare(
    `SELECT b.id, b.user_id, b.category_id, b.amount, b.period, b.month,
            c.name AS cat_name, c.emoji AS cat_emoji,${SPENT_SUBQUERY}
     FROM budgets b LEFT JOIN categories c ON b.category_id = c.id
     WHERE b.user_id = ? AND b.month = ?
     ORDER BY b.category_id IS NULL DESC, c.name`
  ).all(userId, m);
}

export function getBudgetAlerts(userId) {
  const rows = getDb().prepare(
    `SELECT b.id, b.user_id, b.category_id, b.amount, b.period, b.month,
            c.name AS cat_name, c.emoji AS cat_emoji,${SPENT_SUBQUERY}
     FROM budgets b LEFT JOIN categories c ON b.category_id = c.id
     WHERE b.user_id = ? AND b.amount > 0`
  ).all(userId);

  return rows
    .map(b => {
      const pct = (b.spent / b.amount) * 100;
      let level = null;
      if (pct >= 100) level = 'exceeded';
      else if (pct >= 80) level = 'danger';
      else if (pct >= 50) level = 'warning';
      return { ...b, percent: Math.round(pct), level };
    })
    .filter(b => b.level);
}
