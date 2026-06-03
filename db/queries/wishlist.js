import { getDb } from '../database.js';

export function createWishlistItem(userId, { name, price, priority, link, note }) {
  const info = getDb().prepare(
    'INSERT INTO wishlist (user_id, name, price, priority, link, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, name, price, priority || 'medium', link || null, note || null);
  return getDb().prepare('SELECT * FROM wishlist WHERE id = ?').get(info.lastInsertRowid);
}

export function getWishlist(userId, status) {
  const db = getDb();
  if (status) {
    return db.prepare('SELECT * FROM wishlist WHERE user_id = ? AND status = ? ORDER BY \n' +
      "  CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC"
    ).all(userId, status);
  }
  return db.prepare("SELECT * FROM wishlist WHERE user_id = ? AND status != 'purchased' ORDER BY \n" +
    "  CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC"
  ).all(userId);
}

export function updateWishlistStatus(id, status) {
  getDb().prepare("UPDATE wishlist SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

export function deleteWishlistItem(id) {
  getDb().prepare('DELETE FROM wishlist WHERE id = ?').run(id);
}

export function getWishlistStats(userId) {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(price), 0) AS total FROM wishlist WHERE user_id = ? AND status != 'purchased'").get(userId);
  const purchased = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(price), 0) AS total FROM wishlist WHERE user_id = ? AND status = 'purchased'").get(userId);
  return { wishlisted: total.count, totalPrice: total.total, purchased: purchased.count, spent: purchased.total };
}
