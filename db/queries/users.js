import { getDb } from '../database.js';

/* ───── users ───── */

export function findOrCreateUser(telegramId, firstName, username) {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (!user) {
    const info = db.prepare(
      `INSERT INTO users (telegram_id, first_name, username)
       VALUES (?, ?, ?)`
    ).run(telegramId, firstName || 'User', username || null);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    copyDefaultCategories(db, user.id);
    createDefaultWallet(db, user.id);
  } else {
    db.prepare(
      `UPDATE users SET first_name = COALESCE(?, first_name), username = COALESCE(?, username),
       updated_at = datetime('now') WHERE id = ?`
    ).run(firstName || null, username || null, user.id);
  }
  return user;
}

export function getUser(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getUserByTelegramId(telegramId) {
  return getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

export function updateUser(id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

/* ───── helpers ───── */

function copyDefaultCategories(db, userId) {
  const rows = db.prepare('SELECT * FROM categories WHERE user_id = 0 AND is_system = 1').all();
  const insert = db.prepare(
    'INSERT INTO categories (user_id, name, emoji, type, is_system) VALUES (?, ?, ?, ?, 1)'
  );
  const tx = db.transaction(() => {
    for (const r of rows) insert.run(userId, r.name, r.emoji, r.type);
  });
  tx();
}

function createDefaultWallet(db, userId) {
  db.prepare("INSERT INTO wallets (user_id, name, type, balance) VALUES (?, 'Cash', 'cash', 0)").run(userId);
}
