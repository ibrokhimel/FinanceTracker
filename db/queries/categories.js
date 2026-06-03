import { getDb } from '../database.js';

export function getCategories(userId, type) {
  const db = getDb();
  if (type) return db.prepare('SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY name').all(userId, type);
  return db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, name').all(userId);
}

export function getCategoryById(id) {
  return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function findCategoryByName(userId, name) {
  return getDb().prepare(
    'SELECT * FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)'
  ).get(userId, name);
}

export function findCategoryByKeyword(userId, keyword) {
  return getDb().prepare(
    `SELECT * FROM categories WHERE user_id = ? AND (LOWER(name) LIKE LOWER(?) OR LOWER(emoji) = LOWER(?))`
  ).get(userId, `%${keyword}%`, keyword);
}

export function createCategory(userId, { name, emoji, type }) {
  const info = getDb().prepare(
    'INSERT INTO categories (user_id, name, emoji, type) VALUES (?, ?, ?, ?)'
  ).run(userId, name, emoji || '📁', type || 'expense');
  return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
}

export function deleteCategory(id) {
  const db = getDb();
  db.prepare('UPDATE expenses SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}
