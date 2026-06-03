/**
 * Access control + invite + AI-usage queries.
 */

import { getDb } from '../database.js';
import crypto from 'crypto';

/* ─── Access status ──────────────────────────────────────────────────────── */

export function isApproved(userId) {
  const row = getDb().prepare('SELECT access_status FROM users WHERE id = ?').get(userId);
  return row?.access_status === 'approved';
}

export function isAdmin(userId) {
  const row = getDb().prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  return !!row?.is_admin;
}

export function setAccess(userId, status, approverId = null) {
  getDb().prepare(`
    UPDATE users SET access_status = ?, approved_by = ?, approved_at = datetime('now')
    WHERE id = ?
  `).run(status, approverId, userId);
}

export function setAdmin(userId, isAdminFlag) {
  getDb().prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdminFlag ? 1 : 0, userId);
}

export function listUsersByStatus(status) {
  return getDb().prepare(
    'SELECT id, telegram_id, first_name, username, is_admin, access_status, approved_at, invited_by FROM users WHERE id > 0 AND access_status = ? ORDER BY id'
  ).all(status);
}

export function listAllUsers() {
  return getDb().prepare(
    'SELECT id, telegram_id, first_name, username, is_admin, access_status, approved_at, invited_by FROM users WHERE id > 0 ORDER BY is_admin DESC, id'
  ).all();
}

export function countAdmins() {
  return getDb().prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;
}

/* ─── Invites ────────────────────────────────────────────────────────────── */

function newCode() {
  // 10 chars, base32-ish, URL-safe
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

export function createInvite(createdBy, { uses = 1, expiresInDays = null, note = null } = {}) {
  const code = newCode();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000).toISOString().slice(0, 19).replace('T', ' ')
    : null;
  getDb().prepare(`
    INSERT INTO invites (code, created_by, uses_remaining, expires_at, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(code, createdBy, uses, expiresAt, note);
  return getDb().prepare('SELECT * FROM invites WHERE code = ?').get(code);
}

export function getInvite(code) {
  return getDb().prepare('SELECT * FROM invites WHERE code = ?').get(code);
}

export function listInvites(createdBy) {
  return getDb().prepare('SELECT * FROM invites WHERE created_by = ? ORDER BY created_at DESC').all(createdBy);
}

export function revokeInvite(code, createdBy) {
  const res = getDb().prepare("UPDATE invites SET status = 'revoked' WHERE code = ? AND created_by = ?").run(code, createdBy);
  return res.changes > 0;
}

/** Consume one use of an invite. Returns the invite row if successful. */
export function consumeInvite(code) {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(code);
  if (!inv) return null;
  if (inv.status !== 'active') return null;
  if (inv.expires_at && new Date(inv.expires_at + 'Z').getTime() < Date.now()) return null;
  if (inv.uses_remaining <= 0) return null;

  const remaining = inv.uses_remaining - 1;
  const status = remaining <= 0 ? 'exhausted' : 'active';
  db.prepare("UPDATE invites SET uses_remaining = ?, uses_total = uses_total + 1, status = ? WHERE id = ?")
    .run(remaining, status, inv.id);
  return inv;
}

/* ─── AI usage tracking ─────────────────────────────────────────────────── */

export function recordAiUsage({ userId, provider, model, tokensIn, tokensOut, purpose }) {
  try {
    getDb().prepare(`
      INSERT INTO ai_usage (user_id, provider, model, tokens_in, tokens_out, purpose)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId || 0, provider || null, model || null, tokensIn || 0, tokensOut || 0, purpose || null);
  } catch (err) {
    console.warn('[access] recordAiUsage:', err.message);
  }
}

export function aiUsageSummary(userId, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const total = getDb().prepare(`
    SELECT
      COUNT(*) AS calls,
      COALESCE(SUM(tokens_in), 0)  AS tin,
      COALESCE(SUM(tokens_out), 0) AS tout
    FROM ai_usage WHERE user_id = ? AND created_at >= ?
  `).get(userId, since);
  const byProvider = getDb().prepare(`
    SELECT provider, COUNT(*) AS calls, COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens
    FROM ai_usage WHERE user_id = ? AND created_at >= ?
    GROUP BY provider ORDER BY tokens DESC
  `).all(userId, since);
  return { total, byProvider, sinceDays };
}
