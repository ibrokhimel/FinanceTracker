/**
 * app_meta — a tiny key/value store for bot-wide state (e.g. announced_version).
 */
import { getDb } from '../database.js';

export function getMeta(key) {
  const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setMeta(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, String(value));
}
