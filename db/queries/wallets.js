import { getDb } from '../database.js';

export function getWallets(userId) {
  return getDb().prepare('SELECT * FROM wallets WHERE user_id = ? ORDER BY type, name').all(userId);
}

export function getWalletById(id) {
  return getDb().prepare('SELECT * FROM wallets WHERE id = ?').get(id);
}

export function createWallet(userId, { name, type, balance }) {
  const info = getDb().prepare(
    'INSERT INTO wallets (user_id, name, type, balance) VALUES (?, ?, ?, ?)'
  ).run(userId, name, type || 'cash', balance || 0);
  return getDb().prepare('SELECT * FROM wallets WHERE id = ?').get(info.lastInsertRowid);
}

export function updateWalletType(walletId, type) {
  getDb().prepare("UPDATE wallets SET type = ?, updated_at = datetime('now') WHERE id = ?").run(type, walletId);
  return getWalletById(walletId);
}

export function updateWalletBalance(walletId, delta) {
  getDb().prepare("UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?").run(delta, walletId);
}

export function transferBetweenWallets(fromId, toId, amount) {
  const db = getDb();
  const tx = db.transaction(() => {
    updateWalletBalance(fromId, -amount);
    updateWalletBalance(toId, amount);
  });
  tx();
}
