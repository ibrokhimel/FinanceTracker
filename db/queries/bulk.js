/**
 * Bulk operations on expenses — delete-all / delete-by-filter / remove-duplicates,
 * plus a full account wipe. Deletes are recorded as a `bulk_batch` (the deleted
 * rows are stored as JSON) so a single undo re-inserts everything, ids preserved.
 */

import { getDb } from '../database.js';

export function countExpenses(userId) {
  return getDb().prepare('SELECT COUNT(*) AS c FROM expenses WHERE user_id = ?').get(userId).c;
}

function saveBatch(db, userId, kind, rows) {
  return db.prepare('INSERT INTO bulk_batches (user_id, kind, payload, count) VALUES (?, ?, ?, ?)')
    .run(userId, kind, JSON.stringify(rows), rows.length).lastInsertRowid;
}

/** Delete every expense/income for a user. Returns { batchId, count }. */
export function bulkDeleteAll(userId, kind = 'delete-all') {
  const db = getDb();
  return db.transaction(() => {
    const rows = db.prepare('SELECT * FROM expenses WHERE user_id = ?').all(userId);
    if (!rows.length) return { batchId: null, count: 0 };
    const batchId = saveBatch(db, userId, kind, rows);
    db.prepare('DELETE FROM expenses WHERE user_id = ?').run(userId);
    return { batchId, count: rows.length };
  })();
}

/** Delete a specific set of expense ids (must belong to the user). */
export function bulkDeleteByIds(userId, ids, kind = 'bulk-delete') {
  const db = getDb();
  const clean = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!clean.length) return { batchId: null, count: 0 };
  const ph = clean.map(() => '?').join(',');
  return db.transaction(() => {
    const rows = db.prepare(`SELECT * FROM expenses WHERE user_id = ? AND id IN (${ph})`).all(userId, ...clean);
    if (!rows.length) return { batchId: null, count: 0 };
    const batchId = saveBatch(db, userId, kind, rows);
    db.prepare(`DELETE FROM expenses WHERE user_id = ? AND id IN (${ph})`).run(userId, ...clean);
    return { batchId, count: rows.length };
  })();
}

/** Ids of duplicate rows (same date+amount+type+note); keeps the earliest of each. */
export function findDuplicateIds(userId) {
  const rows = getDb().prepare(
    "SELECT id, date, amount, type, LOWER(COALESCE(note,'')) AS n FROM expenses WHERE user_id = ? ORDER BY id"
  ).all(userId);
  const seen = new Set();
  const dupes = [];
  for (const r of rows) {
    const key = `${r.date}|${Math.round(r.amount)}|${r.type}|${r.n}`;
    if (seen.has(key)) dupes.push(r.id);
    else seen.add(key);
  }
  return dupes;
}

/** Re-insert a deleted batch. Returns { count }. */
export function undoBulkBatch(userId, batchId) {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM bulk_batches WHERE id = ? AND user_id = ?').get(batchId, userId);
  if (!batch) return { count: 0 };
  const rows = JSON.parse(batch.payload);
  return {
    count: db.transaction(() => {
      let n = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        const ph = cols.map(() => '?').join(',');
        try { db.prepare(`INSERT OR IGNORE INTO expenses (${cols.join(',')}) VALUES (${ph})`).run(...cols.map(c => row[c])); n++; } catch {}
      }
      db.prepare('DELETE FROM bulk_batches WHERE id = ?').run(batchId);
      return n;
    })(),
  };
}

/** Full reset: wipe all financial data and zero wallet balances (keeps the account,
 *  wallets, categories). NOT undoable — callers must export a CSV first. */
export function wipeUserData(userId) {
  const db = getDb();
  const tables = ['expenses', 'transfers', 'budgets', 'goals', 'debts', 'subscriptions',
    'recurring_transactions', 'wishlist', 'investments', 'life_events', 'streaks',
    'import_batches', 'bulk_batches'];
  db.transaction(() => {
    for (const t of tables) { try { db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId); } catch {} }
    try { db.prepare("UPDATE wallets SET balance = 0, updated_at = datetime('now') WHERE user_id = ?").run(userId); } catch {}
  })();
}
