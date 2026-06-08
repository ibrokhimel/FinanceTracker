import { getDb } from '../database.js';

export function addExpense({ user_id, amount, category_id, note, date, type, tags, wallet_id }) {
  const db = getDb();
  const info = db.prepare(
    `INSERT INTO expenses (user_id, amount, category_id, note, date, type, tags, wallet_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user_id, amount, category_id || null, note || null,
    date || new Date().toISOString().slice(0, 10),
    type || 'expense', tags || null, wallet_id || null
  );

  if (wallet_id) {
    const delta = type === 'expense' ? -amount : amount;
    db.prepare("UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?").run(delta, wallet_id);
  }

  // Note: budget `spent` is no longer maintained as a counter here — it's computed
  // live from this table by getBudgets()/getBudgetAlerts(), so deletes and edits
  // stay accurate. (See db/queries/budgets.js.)

  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
}

export function getExpenses(userId, opts = {}) {
  const { limit = 100, offset = 0, fromDate, toDate, categoryId, type, order = 'DESC' } = opts;
  const db = getDb();
  let sql = `SELECT e.*, c.name AS cat_name, c.emoji AS cat_emoji
             FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
             WHERE e.user_id = ?`;
  const params = [userId];

  if (fromDate)   { sql += ' AND e.date >= ?'; params.push(fromDate); }
  if (toDate)     { sql += ' AND e.date <= ?'; params.push(toDate); }
  if (categoryId) { sql += ' AND e.category_id = ?'; params.push(categoryId); }
  if (type)       { sql += ' AND e.type = ?'; params.push(type); }

  sql += ` ORDER BY e.date ${order}, e.id DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function getExpenseById(id) {
  return getDb().prepare(
    `SELECT e.*, c.name AS cat_name, c.emoji AS cat_emoji
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.id = ?`
  ).get(id);
}

export function updateExpense(id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'id') continue;
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  getDb().prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteExpense(id) {
  const db = getDb();
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!exp) return;
  if (exp.wallet_id) {
    const reversal = exp.type === 'expense' ? exp.amount : -exp.amount;
    db.prepare("UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?").run(reversal, exp.wallet_id);
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
}

export function getDailyTotals(userId, fromDate, toDate) {
  return getDb().prepare(
    `SELECT date, SUM(amount) AS total, COUNT(*) AS count
     FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND type = 'expense'
     GROUP BY date ORDER BY date`
  ).all(userId, fromDate, toDate);
}

export function getSpendingSummary(userId, fromDate, toDate) {
  const db = getDb();
  const summary = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expenses,
       COALESCE(SUM(CASE WHEN type='income'   THEN amount ELSE 0 END), 0) AS total_income,
       COUNT(CASE WHEN type='expense' THEN 1 END) AS expense_count,
       COUNT(CASE WHEN type='income'   THEN 1 END) AS income_count
     FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?`
  ).get(userId, fromDate, toDate);

  const expByCat = db.prepare(
    `SELECT c.id, c.name, c.emoji, SUM(e.amount) AS total, COUNT(*) AS count
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = ? AND e.date >= ? AND e.date <= ? AND e.type = 'expense'
     GROUP BY c.id ORDER BY total DESC`
  ).all(userId, fromDate, toDate);

  const incByCat = db.prepare(
    `SELECT c.id, c.name, c.emoji, SUM(e.amount) AS total, COUNT(*) AS count
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = ? AND e.date >= ? AND e.date <= ? AND e.type = 'income'
     GROUP BY c.id ORDER BY total DESC`
  ).all(userId, fromDate, toDate);

  return { ...summary, byCategory: expByCat, byIncomeCategory: incByCat };
}

export function getTotalSpentThisMonth(userId) {
  const now = new Date();
  const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const row = getDb().prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND type = 'expense' AND substr(date, 1, 7) = ?"
  ).get(userId, m);
  return row.total;
}

export function getMonthlyTotals(userId, months = 6) {
  return getDb().prepare(
    `SELECT substr(date, 1, 7) AS month,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses,
       SUM(CASE WHEN type='income'   THEN amount ELSE 0 END) AS income
     FROM expenses WHERE user_id = ? GROUP BY month ORDER BY month DESC LIMIT ?`
  ).all(userId, months);
}

export function searchExpenses(userId, query, opts = {}) {
  const { limit = 20, offset = 0 } = opts;
  const db = getDb();
  const params = [userId];
  let where = '';
  let isAmountSearch = false;

  // Amount range search: ">50000", "<10000", ">=5000"
  const amountMatch = query.match(/^([><]=?|!=)\s*(\d[\d,]*)$/);
  if (amountMatch) {
    isAmountSearch = true;
    const op = amountMatch[1];
    const val = parseFloat(amountMatch[2].replace(/,/g, ''));
    where = `AND e.amount ${op} ?`;
    params.push(val);
  }

  if (!isAmountSearch) {
    where = `AND (e.note LIKE ? OR c.name LIKE ? OR e.tags LIKE ? OR e.date LIKE ?)`;
    const p = `%${query}%`;
    params.push(p, p, p, p);
  }

  return db.prepare(
    `SELECT e.*, c.name AS cat_name, c.emoji AS cat_emoji
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = ? ${where}
     ORDER BY e.date DESC, e.id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
}

export function getIncomeByCategory(userId, fromDate, toDate) {
  return getDb().prepare(
    `SELECT c.id, c.name, c.emoji, SUM(e.amount) AS total, COUNT(*) AS count
     FROM expenses e JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = ? AND e.date >= ? AND e.date <= ? AND e.type = 'income'
     GROUP BY c.id ORDER BY total DESC`
  ).all(userId, fromDate, toDate);
}
