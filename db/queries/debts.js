import { getDb } from '../database.js';

export function createDebt(userId, { personName, amount, type, note, dueDate }) {
  const info = getDb().prepare(
    'INSERT INTO debts (user_id, person_name, amount, remaining_amount, type, note, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, personName, amount, amount, type, note || null, dueDate || null);
  return getDb().prepare('SELECT * FROM debts WHERE id = ?').get(info.lastInsertRowid);
}

export function getDebts(userId, type) {
  const db = getDb();
  if (type) {
    return db.prepare("SELECT * FROM debts WHERE user_id = ? AND type = ? AND status != 'fully_repaid' ORDER BY created_at DESC").all(userId, type);
  }
  return db.prepare("SELECT * FROM debts WHERE user_id = ? AND status != 'fully_repaid' ORDER BY type, created_at DESC").all(userId);
}

export function getDebtById(id) {
  return getDb().prepare('SELECT * FROM debts WHERE id = ?').get(id);
}

export function repayDebt(debtId, amount) {
  const db = getDb();
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId);
  if (!debt) return null;
  const newRemaining = Math.max(0, debt.remaining_amount - amount);
  const status = newRemaining <= 0 ? 'fully_repaid' : 'partially_repaid';
  db.prepare("UPDATE debts SET remaining_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(newRemaining, status, debtId);
  return { ...debt, remaining_amount: newRemaining, status };
}

export function settleDebt(debtId) {
  const db = getDb();
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId);
  if (!debt) return null;
  db.prepare("UPDATE debts SET remaining_amount = 0, status = 'fully_repaid', updated_at = datetime('now') WHERE id = ?").run(debtId);
  return { ...debt, remaining_amount: 0, status: 'fully_repaid' };
}
