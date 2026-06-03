/**
 * Regret Score — detects categories the user often edits/deletes,
 * and time-of-day windows that correlate with later remorse.
 */

import { getDb } from '../db/database.js';

/** Returns top regret categories with rates. */
export function regretByCategory(userId) {
  const rows = getDb().prepare(`
    SELECT target_table, action, COUNT(*) AS n, before_json
    FROM audit_log WHERE user_id = ? AND target_table='expenses'
    GROUP BY action
  `).all(userId);

  const allDel = getDb().prepare(`
    SELECT before_json FROM audit_log
    WHERE user_id = ? AND target_table='expenses' AND action='delete'
  `).all(userId);

  const tally = new Map();
  for (const row of allDel) {
    try {
      const exp = JSON.parse(row.before_json);
      const cat = exp.category_id;
      if (!cat) continue;
      tally.set(cat, (tally.get(cat) || 0) + 1);
    } catch {}
  }

  if (!tally.size) return [];
  const names = getDb().prepare('SELECT id, name, emoji FROM categories').all();
  const nameById = Object.fromEntries(names.map(n => [n.id, n]));

  return [...tally.entries()]
    .map(([catId, n]) => ({ ...nameById[catId], deletions: n }))
    .sort((a, b) => b.deletions - a.deletions)
    .slice(0, 5);
}

/** Late-night regret window: delete rate for entries created 22:00-03:00. */
export function lateNightRegret(userId) {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) FILTER (WHERE CAST(strftime('%H', json_extract(before_json,'$.created_at')) AS INT) BETWEEN 22 AND 23) AS late_dels,
      COUNT(*) FILTER (WHERE CAST(strftime('%H', json_extract(before_json,'$.created_at')) AS INT) BETWEEN 0 AND 3)   AS night_dels
    FROM audit_log WHERE user_id = ? AND action='delete' AND target_table='expenses'
  `).get(userId);
  return (row?.late_dels || 0) + (row?.night_dels || 0);
}

/** Should we warn the user before they spend in this category right now? */
export function shouldWarn(userId, categoryId) {
  if (!categoryId) return null;
  const data = regretByCategory(userId);
  const hit = data.find(d => d.id === categoryId);
  if (!hit || hit.deletions < 3) return null;

  const hour = new Date().getHours();
  const late = hour >= 22 || hour <= 3;
  if (late && lateNightRegret(userId) >= 2) {
    return `Last few times you ordered in this category after 11pm, you deleted the entry the next day.`;
  }
  return `You've deleted ${hit.deletions} ${hit.name} entries before — sure about this one?`;
}
