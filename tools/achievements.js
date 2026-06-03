/**
 * Achievement engine — silently checks for milestones and inserts
 * a row into the achievements table when one is earned for the first time.
 *
 * Returns array of newly-earned achievements (so handlers can send badge cards).
 */

import { getDb } from '../db/database.js';

const RULES = [
  {
    kind: 'streak_7',
    check: (db, userId) => {
      const r = db.prepare(`
        SELECT COUNT(DISTINCT date) AS d FROM expenses
        WHERE user_id = ? AND date > date('now','-7 days')
      `).get(userId);
      return r.d >= 7 ? { title: '7-Day Streak', subtitle: 'logged 7 days in a row', emoji: '🔥' } : null;
    },
  },
  {
    kind: 'streak_30',
    check: (db, userId) => {
      const r = db.prepare(`
        SELECT COUNT(DISTINCT date) AS d FROM expenses
        WHERE user_id = ? AND date > date('now','-30 days')
      `).get(userId);
      return r.d >= 25 ? { title: '30-Day Streak', subtitle: 'almost daily logs', emoji: '🏆' } : null;
    },
  },
  {
    kind: 'first_goal',
    check: (db, userId) => {
      const r = db.prepare("SELECT COUNT(*) AS c FROM goals WHERE user_id = ? AND status='completed'").get(userId);
      return r.c >= 1 ? { title: 'Goal Achieved', subtitle: 'first savings goal hit', emoji: '🎯' } : null;
    },
  },
  {
    kind: 'debt_free',
    check: (db, userId) => {
      const r = db.prepare("SELECT COUNT(*) AS c FROM debts WHERE user_id = ? AND status='fully_repaid'").get(userId);
      return r.c >= 1 ? { title: 'Debt Slayer', subtitle: 'paid off a debt in full', emoji: '⚔️' } : null;
    },
  },
  {
    kind: 'budget_perfect',
    check: (db, userId) => {
      const month = new Date().toISOString().slice(0, 7);
      const r = db.prepare(`
        SELECT COUNT(*) AS tot, SUM(CASE WHEN spent <= amount THEN 1 ELSE 0 END) AS ok
        FROM budgets WHERE user_id = ? AND month = ? AND category_id IS NOT NULL
      `).get(userId, month);
      return r.tot > 0 && r.tot === r.ok ? { title: 'Frugal Hero', subtitle: 'all budgets respected', emoji: '💎' } : null;
    },
  },
];

/**
 * Run all rules. Returns newly-earned (not previously recorded) achievements.
 */
export function evaluate(userId) {
  const db = getDb();
  const earned = [];
  for (const rule of RULES) {
    const result = rule.check(db, userId);
    if (!result) continue;
    try {
      const info = db.prepare(
        'INSERT OR IGNORE INTO achievements (user_id, kind, title, subtitle) VALUES (?, ?, ?, ?)'
      ).run(userId, rule.kind, result.title, result.subtitle);
      if (info.changes > 0) earned.push({ ...result, kind: rule.kind });
    } catch (err) {
      console.warn('[achievements] eval error:', err.message);
    }
  }
  return earned;
}
