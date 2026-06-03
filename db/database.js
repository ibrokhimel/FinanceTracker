import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { runSchema } from './schema.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'finance.db');

let db = null;

/**
 * Initialise the SQLite connection and run schema creation.
 * @returns {import('better-sqlite3').Database}
 */
export function initDatabase() {
  if (db) return db;

  try {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runSchema(db);
    console.log(`[database] Connected to ${DB_PATH}`);
    return db;
  } catch (err) {
    console.error('[database] Fatal: could not open database —', err.message);
    process.exit(1);
  }
}

/**
 * Return the existing database handle.
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
  if (!db) throw new Error('Database not initialised — call initDatabase() first.');
  return db;
}
