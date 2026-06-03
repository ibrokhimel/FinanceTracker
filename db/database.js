import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { runSchema } from './schema.js';
import { runMigrations } from './migrations.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'finance.db');

let db = null;

/**
 * Initialise the SQLite connection, ensure base schema, run migrations.
 * @returns {import('better-sqlite3').Database}
 */
export function initDatabase() {
  if (db) return db;

  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runSchema(db);
    const res = runMigrations(db, DB_PATH);
    if (res.applied.length > 0) {
      console.log(`[database] Migrated v${res.from} → v${res.to} (${res.applied.length} steps)`);
    }
    console.log(`[database] Connected to ${DB_PATH}`);
    return db;
  } catch (err) {
    console.error('[database] Fatal: could not open database —', err.message);
    process.exit(1);
  }
}

/**
 * Open an in-memory or test-scoped DB (used by tests).
 */
export function openTestDatabase(filePath = ':memory:') {
  const t = new Database(filePath);
  t.pragma('journal_mode = MEMORY');
  t.pragma('foreign_keys = ON');
  runSchema(t);
  runMigrations(t, filePath === ':memory:' ? null : filePath);
  return t;
}

/**
 * Return the existing database handle.
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
  if (!db) throw new Error('Database not initialised — call initDatabase() first.');
  return db;
}
