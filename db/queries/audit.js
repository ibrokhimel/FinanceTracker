import { getDb } from '../database.js';
import { hashChain } from '../../tools/security.js';

/**
 * Log an audit entry with hash-chain (tamper-evident).
 * Each row stores prev_hash and row_hash = sha256(prev_hash || canonical(row)).
 * Catches errors silently — audit must never break a flow.
 */
export function logAudit({ userId, action, table, targetId, before, after }) {
  try {
    const db = getDb();
    const last = db.prepare('SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
    const prevHash = last?.row_hash || 'GENESIS';
    const payload = {
      user_id: userId, action, target_table: table, target_id: targetId || null,
      before: before || null, after: after || null,
    };
    const rowHash = hashChain(prevHash, payload);

    db.prepare(`
      INSERT INTO audit_log (user_id, action, target_table, target_id, before_json, after_json, prev_hash, row_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      action,
      table,
      targetId || null,
      before ? JSON.stringify(before) : null,
      after  ? JSON.stringify(after)  : null,
      prevHash,
      rowHash,
    );
  } catch (err) {
    console.warn('[audit] log failed:', err.message);
  }
}

/**
 * Verify the hash-chain is intact. Returns { ok, brokenAt }.
 */
export function verifyAuditChain() {
  const rows = getDb().prepare('SELECT * FROM audit_log ORDER BY id').all();
  let prev = 'GENESIS';
  for (const row of rows) {
    const payload = {
      user_id: row.user_id, action: row.action, target_table: row.target_table,
      target_id: row.target_id,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after:  row.after_json  ? JSON.parse(row.after_json)  : null,
    };
    const expected = hashChain(prev, payload);
    if (row.row_hash && row.row_hash !== expected) {
      return { ok: false, brokenAt: row.id };
    }
    prev = row.row_hash || prev;
  }
  return { ok: true, brokenAt: null };
}

export function getAuditFor(userId, targetTable, targetId) {
  return getDb().prepare(`
    SELECT * FROM audit_log
    WHERE user_id = ? AND target_table = ? AND target_id = ?
    ORDER BY created_at DESC
  `).all(userId, targetTable, targetId);
}

export function getLastDeleted(userId, table = 'expenses') {
  return getDb().prepare(`
    SELECT * FROM audit_log
    WHERE user_id = ? AND target_table = ? AND action = 'delete'
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, table);
}

export function getRecentAudit(userId, limit = 50) {
  return getDb().prepare(`
    SELECT * FROM audit_log WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}
