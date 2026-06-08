import { getDb } from '../database.js';

export function createGoal(userId, { name, targetAmount, deadline }) {
  const info = getDb().prepare(
    'INSERT INTO goals (user_id, name, target_amount, deadline) VALUES (?, ?, ?, ?)'
  ).run(userId, name, targetAmount, deadline || null);
  return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(info.lastInsertRowid);
}

export function getGoals(userId, status) {
  if (status) return getDb().prepare('SELECT * FROM goals WHERE user_id = ? AND status = ? ORDER BY created_at DESC').all(userId, status);
  return getDb().prepare("SELECT * FROM goals WHERE user_id = ? AND status != 'cancelled' ORDER BY created_at DESC").all(userId);
}

export function getGoalById(id) {
  return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(id);
}

export function setGoalStatus(goalId, status) {
  getDb().prepare("UPDATE goals SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, goalId);
  return getGoalById(goalId);
}

export function updateGoalProgress(goalId, amount) {
  const db = getDb();
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
  if (!goal) return null;
  const newCurrent = goal.current_amount + amount;
  const status = newCurrent >= goal.target_amount ? 'completed' : 'active';
  db.prepare("UPDATE goals SET current_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(newCurrent, status, goalId);
  return { ...goal, current_amount: newCurrent, status };
}
