import { getDb } from '../database.js';

export function createSubscription(userId, { name, amount, categoryId, billingCycle, nextBillingDate }) {
  const info = getDb().prepare(
    'INSERT INTO subscriptions (user_id, name, amount, category_id, billing_cycle, next_billing_date) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, name, amount, categoryId || null, billingCycle || 'monthly', nextBillingDate);
  return getDb().prepare('SELECT * FROM subscriptions WHERE id = ?').get(info.lastInsertRowid);
}

export function getSubscriptions(userId, status) {
  const db = getDb();
  if (status) {
    return db.prepare(
      'SELECT s.*, c.name AS cat_name, c.emoji AS cat_emoji FROM subscriptions s LEFT JOIN categories c ON s.category_id = c.id WHERE s.user_id = ? AND s.status = ? ORDER BY s.next_billing_date'
    ).all(userId, status);
  }
  return db.prepare(
    'SELECT s.*, c.name AS cat_name, c.emoji AS cat_emoji FROM subscriptions s LEFT JOIN categories c ON s.category_id = c.id WHERE s.user_id = ? ORDER BY s.status, s.next_billing_date'
  ).all(userId);
}

export function updateSubscriptionStatus(id, status) {
  getDb().prepare("UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}
