/**
 * Migration runner.
 *
 * - Maintains a `schema_version` table with the highest applied version.
 * - On startup, applies any migrations whose version > current.
 * - Backs up the DB before any new migration is applied.
 *
 * Add new migrations to the MIGRATIONS array, in ascending version order.
 * Each migration is a {version:int, name:string, up:function(db)}.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ─── Migrations registry ────────────────────────────────────────────────── */

export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up: () => {
      // No-op — base schema is handled by schema.js for back-compat with
      // existing installations. This migration marks the baseline.
    },
  },
  {
    version: 2,
    name: 'multi_currency_support',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS exchange_rates (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          base          TEXT NOT NULL,
          quote         TEXT NOT NULL,
          rate          REAL NOT NULL,
          fetched_at    TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(base, quote, fetched_at)
        );
        CREATE INDEX IF NOT EXISTS idx_rates_pair ON exchange_rates(base, quote);
      `);

      // Add original_currency/original_amount to expenses for multi-currency.
      const cols = db.prepare("PRAGMA table_info(expenses)").all().map(c => c.name);
      if (!cols.includes('original_currency')) {
        db.exec("ALTER TABLE expenses ADD COLUMN original_currency TEXT;");
      }
      if (!cols.includes('original_amount')) {
        db.exec("ALTER TABLE expenses ADD COLUMN original_amount REAL;");
      }
    },
  },
  {
    version: 3,
    name: 'audit_log',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id      INTEGER NOT NULL,
          action       TEXT NOT NULL,
          target_table TEXT NOT NULL,
          target_id    INTEGER,
          before_json  TEXT,
          after_json   TEXT,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, created_at);
      `);
    },
  },
  {
    version: 4,
    name: 'investments_and_holdings',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS investments (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id       INTEGER NOT NULL,
          symbol        TEXT NOT NULL,
          asset_type    TEXT NOT NULL DEFAULT 'stock' CHECK(asset_type IN ('stock','crypto','etf','other')),
          quantity      REAL NOT NULL,
          avg_buy_price REAL NOT NULL,
          currency      TEXT NOT NULL DEFAULT 'USD',
          note          TEXT,
          created_at    TEXT DEFAULT (datetime('now')),
          updated_at    TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_inv_user ON investments(user_id);
      `);
    },
  },
  {
    version: 5,
    name: 'streaks_and_stakes',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS streaks (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id       INTEGER NOT NULL,
          name          TEXT NOT NULL,
          rule          TEXT NOT NULL,
          stake         TEXT,
          current_count INTEGER DEFAULT 0,
          best_count    INTEGER DEFAULT 0,
          last_event    TEXT,
          status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','broken')),
          created_at    TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    },
  },
  {
    version: 6,
    name: 'life_events',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS life_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER NOT NULL,
          name        TEXT NOT NULL,
          event_type  TEXT,
          start_date  TEXT NOT NULL,
          end_date    TEXT,
          note        TEXT,
          created_at  TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    },
  },
  {
    version: 7,
    name: 'user_extras_ai_currency_log_time',
    up: (db) => {
      const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      const add = (name, sql) => { if (!cols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${sql};`); };
      add('ai_enabled',         'ai_enabled INTEGER DEFAULT 1');
      add('debrief_enabled',    'debrief_enabled INTEGER DEFAULT 1');
      add('theme',              "theme TEXT DEFAULT 'default'");
      add('typical_log_hour',   'typical_log_hour INTEGER');
      add('friction_categories','friction_categories TEXT');
    },
  },
  {
    version: 8,
    name: 'expense_meta_for_regret_and_friction',
    up: (db) => {
      const cols = db.prepare("PRAGMA table_info(expenses)").all().map(c => c.name);
      if (!cols.includes('confidence')) {
        db.exec('ALTER TABLE expenses ADD COLUMN confidence INTEGER;');
      }
      if (!cols.includes('source')) {
        db.exec("ALTER TABLE expenses ADD COLUMN source TEXT DEFAULT 'text';");
      }
      if (!cols.includes('pending_until')) {
        db.exec('ALTER TABLE expenses ADD COLUMN pending_until TEXT;');
      }
    },
  },
  {
    version: 9,
    name: 'buddies_and_achievements',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS buddies (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id       INTEGER NOT NULL,
          buddy_user_id INTEGER NOT NULL,
          status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','blocked')),
          created_at    TEXT DEFAULT (datetime('now')),
          UNIQUE(user_id, buddy_user_id),
          FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (buddy_user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS achievements (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id      INTEGER NOT NULL,
          kind         TEXT NOT NULL,
          title        TEXT NOT NULL,
          subtitle     TEXT,
          earned_at    TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, kind)
        );
      `);
    },
  },
  {
    version: 10,
    name: 'audit_hash_chain_and_sessions',
    up: (db) => {
      const cols = db.prepare("PRAGMA table_info(audit_log)").all().map(c => c.name);
      if (!cols.includes('prev_hash')) db.exec('ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;');
      if (!cols.includes('row_hash'))  db.exec('ALTER TABLE audit_log ADD COLUMN row_hash TEXT;');

      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          telegram_id INTEGER PRIMARY KEY,
          data        TEXT NOT NULL,
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 11,
    name: 'access_control_invites_usage',
    up: (db) => {
      const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      const add = (name, sql) => { if (!userCols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${sql};`); };
      add('is_admin',      'is_admin INTEGER DEFAULT 0');
      add('access_status', "access_status TEXT DEFAULT 'pending'");
      add('approved_by',   'approved_by INTEGER');
      add('approved_at',   'approved_at TEXT');
      add('invited_by',    'invited_by INTEGER');
      add('invite_code',   'invite_code TEXT');

      db.exec(`
        CREATE TABLE IF NOT EXISTS invites (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          code            TEXT UNIQUE NOT NULL,
          created_by      INTEGER NOT NULL,
          uses_remaining  INTEGER DEFAULT 1,
          uses_total      INTEGER DEFAULT 0,
          expires_at      TEXT,
          note            TEXT,
          status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','exhausted')),
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);

        CREATE TABLE IF NOT EXISTS ai_usage (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id      INTEGER NOT NULL,
          provider     TEXT,
          model        TEXT,
          tokens_in    INTEGER DEFAULT 0,
          tokens_out   INTEGER DEFAULT 0,
          purpose      TEXT,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_aiusage_user_date ON ai_usage(user_id, created_at);
      `);

      // Bootstrap: first non-system user becomes admin + approved.
      const first = db.prepare("SELECT id FROM users WHERE id > 0 ORDER BY id ASC LIMIT 1").get();
      if (first) {
        db.prepare("UPDATE users SET is_admin = 1, access_status = 'approved', approved_at = datetime('now') WHERE id = ?").run(first.id);
      }
      // Mark any existing users approved (don't lock people out on upgrade).
      db.prepare("UPDATE users SET access_status = 'approved' WHERE id > 0 AND (access_status IS NULL OR access_status = 'pending')").run();
    },
  },
  {
    version: 12,
    name: 'ai_chat_default_pref',
    up: (db) => {
      const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      // When ON, plain (non-expense) messages are answered by the AI assistant
      // instead of being silently dropped. /ask still works explicitly.
      if (!cols.includes('ai_chat')) db.exec('ALTER TABLE users ADD COLUMN ai_chat INTEGER DEFAULT 1;');
    },
  },
  {
    version: 13,
    name: 'transfers_and_statement_import',
    up: (db) => {
      // Real transfer ledger — wallet→wallet moves that are NOT income/expense.
      db.exec(`
        CREATE TABLE IF NOT EXISTS transfers (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id         INTEGER NOT NULL,
          from_wallet     INTEGER,
          to_wallet       INTEGER,
          amount          REAL NOT NULL,
          date            TEXT NOT NULL,
          note            TEXT,
          source          TEXT NOT NULL DEFAULT 'manual',
          import_batch_id INTEGER,
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id)     REFERENCES users(id)   ON DELETE CASCADE,
          FOREIGN KEY (from_wallet) REFERENCES wallets(id) ON DELETE SET NULL,
          FOREIGN KEY (to_wallet)   REFERENCES wallets(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id, date);

        CREATE TABLE IF NOT EXISTS import_batches (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER NOT NULL,
          source      TEXT NOT NULL DEFAULT 'screenshot',
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
      // Tag rows that came from a statement import so a whole batch can be undone.
      const expCols = db.prepare("PRAGMA table_info(expenses)").all().map(c => c.name);
      if (!expCols.includes('import_batch_id')) db.exec('ALTER TABLE expenses ADD COLUMN import_batch_id INTEGER;');
      // Card labels a screenshot might show (e.g. "Humo *4821"), matched to a wallet.
      const wCols = db.prepare("PRAGMA table_info(wallets)").all().map(c => c.name);
      if (!wCols.includes('aliases')) db.exec('ALTER TABLE wallets ADD COLUMN aliases TEXT;');
    },
  },
  {
    version: 14,
    name: 'app_meta',
    up: (db) => {
      // Generic key/value store. Used for 'announced_version' (version tracking).
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT
        );
      `);
    },
  },
];

/* ─── Runner ─────────────────────────────────────────────────────────────── */

function ensureSchemaVersionTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getCurrentVersion(db) {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
  return row?.v ?? 0;
}

function backupDb(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const backup = `${dbPath}.bak`;
  try {
    fs.copyFileSync(dbPath, backup);
    return backup;
  } catch (err) {
    console.warn('[migrations] backup failed:', err.message);
    return null;
  }
}

/**
 * Apply any pending migrations.
 * @param {import('better-sqlite3').Database} db
 * @param {string} [dbPath]
 * @returns {{from:number, to:number, applied:Array<{version:number,name:string}>}}
 */
export function runMigrations(db, dbPath) {
  ensureSchemaVersionTable(db);
  const from = getCurrentVersion(db);
  const pending = MIGRATIONS.filter(m => m.version > from);

  if (pending.length === 0) {
    return { from, to: from, applied: [] };
  }

  if (dbPath) {
    const bak = backupDb(dbPath);
    if (bak) console.log(`[migrations] Backup created at ${bak}`);
  }

  const insert = db.prepare('INSERT OR REPLACE INTO schema_version (version, name) VALUES (?, ?)');
  const applied = [];

  for (const m of pending) {
    try {
      const tx = db.transaction(() => {
        m.up(db);
        insert.run(m.version, m.name);
      });
      tx();
      applied.push({ version: m.version, name: m.name });
      console.log(`[migrations] Applied v${m.version} — ${m.name}`);
    } catch (err) {
      console.error(`[migrations] FAILED v${m.version} (${m.name}):`, err.message);
      throw err;
    }
  }

  return { from, to: applied[applied.length - 1].version, applied };
}

export function currentSchemaVersion(db) {
  ensureSchemaVersionTable(db);
  return getCurrentVersion(db);
}
