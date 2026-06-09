/**
 * Transfers (wallet→wallet money moves) + statement-import batches.
 *
 * Transfers are deliberately excluded from income/expense reports — they're not
 * spending, just money changing pockets. A statement import groups all the rows
 * it created under one batch so the whole thing can be undone in one go.
 */

import { getDb } from '../database.js';

export function createImportBatch(userId, source = 'screenshot') {
  const info = getDb().prepare('INSERT INTO import_batches (user_id, source) VALUES (?, ?)').run(userId, source);
  return info.lastInsertRowid;
}

export function createTransfer(userId, { fromWallet, toWallet, amount, date, note, source = 'manual', importBatchId = null }) {
  const db = getDb();
  const info = db.prepare(
    `INSERT INTO transfers (user_id, from_wallet, to_wallet, amount, date, note, source, import_batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, fromWallet || null, toWallet || null, amount, date, note || null, source, importBatchId);
  // Keep wallet balances in sync when we know the wallets.
  if (fromWallet) db.prepare("UPDATE wallets SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?").run(amount, fromWallet);
  if (toWallet)   db.prepare("UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?").run(amount, toWallet);
  return db.prepare('SELECT * FROM transfers WHERE id = ?').get(info.lastInsertRowid);
}

export function getTransfers(userId, limit = 50) {
  return getDb().prepare('SELECT * FROM transfers WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT ?').all(userId, limit);
}

/** Undo a whole imported batch: remove its expenses/income and reverse its transfers. */
export function deleteImportBatch(userId, batchId) {
  const db = getDb();
  const tx = db.transaction(() => {
    const transfers = db.prepare('SELECT * FROM transfers WHERE user_id = ? AND import_batch_id = ?').all(userId, batchId);
    for (const t of transfers) {
      if (t.from_wallet) db.prepare('UPDATE wallets SET balance = balance + ? WHERE id = ?').run(t.amount, t.from_wallet);
      if (t.to_wallet)   db.prepare('UPDATE wallets SET balance = balance - ? WHERE id = ?').run(t.amount, t.to_wallet);
    }
    const delT = db.prepare('DELETE FROM transfers WHERE user_id = ? AND import_batch_id = ?').run(userId, batchId).changes;
    const delE = db.prepare('DELETE FROM expenses WHERE user_id = ? AND import_batch_id = ?').run(userId, batchId).changes;
    return { transfers: delT, entries: delE };
  });
  return tx();
}
