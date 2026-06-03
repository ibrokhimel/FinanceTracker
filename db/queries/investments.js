import { getDb } from '../database.js';

export function addInvestment(userId, { symbol, assetType, quantity, avgBuyPrice, currency, note }) {
  const info = getDb().prepare(
    `INSERT INTO investments (user_id, symbol, asset_type, quantity, avg_buy_price, currency, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, symbol.toUpperCase(), assetType || 'stock', quantity, avgBuyPrice, currency || 'USD', note || null);
  return getDb().prepare('SELECT * FROM investments WHERE id = ?').get(info.lastInsertRowid);
}

export function getInvestments(userId) {
  return getDb().prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY asset_type, symbol').all(userId);
}

export function deleteInvestment(id) {
  getDb().prepare('DELETE FROM investments WHERE id = ?').run(id);
}
