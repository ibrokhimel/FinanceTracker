import { getDb } from '../database.js';

export function createRecurring(userId, { type, amount, categoryId, note, frequency, intervalValue, nextDate, endDate }) {
  const info = getDb().prepare(
    `INSERT INTO recurring_transactions (user_id, type, amount, category_id, note, frequency, interval_value, next_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, type || 'expense', amount, categoryId || null, note || null,
    frequency || 'monthly', intervalValue || 1, nextDate, endDate || null);
  return getDb().prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(info.lastInsertRowid);
}

export function getRecurring(userId, status) {
  const db = getDb();
  if (status) {
    return db.prepare(
      `SELECT rt.*, c.name AS cat_name, c.emoji AS cat_emoji
       FROM recurring_transactions rt LEFT JOIN categories c ON rt.category_id = c.id
       WHERE rt.user_id = ? AND rt.status = ? ORDER BY rt.next_date`
    ).all(userId, status);
  }
  return db.prepare(
    `SELECT rt.*, c.name AS cat_name, c.emoji AS cat_emoji
     FROM recurring_transactions rt LEFT JOIN categories c ON rt.category_id = c.id
     WHERE rt.user_id = ? ORDER BY rt.status, rt.next_date`
  ).all(userId);
}

// Note: recurring_transactions has no updated_at column (see db/schema.js), so
// these must not reference it — doing so previously made /recurring cancel throw.
export function updateRecurringStatus(id, status) {
  getDb().prepare('UPDATE recurring_transactions SET status = ? WHERE id = ?').run(status, id);
}

export function deleteRecurring(id) {
  getDb().prepare('DELETE FROM recurring_transactions WHERE id = ?').run(id);
}

export function cancelRecurring(id) {
  getDb().prepare("UPDATE recurring_transactions SET status = 'cancelled' WHERE id = ?").run(id);
}
