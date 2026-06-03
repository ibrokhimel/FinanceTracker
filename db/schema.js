/**
 * Create all tables on first run (or ensure they exist on every start).
 * @param {import('better-sqlite3').Database} db
 */
export function runSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id     INTEGER UNIQUE NOT NULL,
      first_name      TEXT,
      username        TEXT,
      currency        TEXT NOT NULL DEFAULT 'UZS',
      language        TEXT NOT NULL DEFAULT 'en',
      month_start_day INTEGER DEFAULT 1,
      daily_nudge     INTEGER DEFAULT 1,
      nudge_time      TEXT DEFAULT '20:00',
      weekly_digest   INTEGER DEFAULT 1,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      name        TEXT NOT NULL,
      emoji       TEXT DEFAULT '📁',
      type        TEXT NOT NULL CHECK(type IN ('expense','income')) DEFAULT 'expense',
      is_system   INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'cash' CHECK(type IN ('cash','bank','savings','other')),
      balance     REAL NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      amount            REAL NOT NULL,
      category_id       INTEGER,
      note              TEXT,
      date              TEXT NOT NULL DEFAULT (date('now')),
      type              TEXT NOT NULL CHECK(type IN ('expense','income')) DEFAULT 'expense',
      tags              TEXT,
      wallet_id         INTEGER,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (wallet_id)   REFERENCES wallets(id)   ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      category_id INTEGER,
      amount      REAL NOT NULL,
      period      TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('weekly','monthly','yearly')),
      spent       REAL NOT NULL DEFAULT 0,
      month       TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      name            TEXT NOT NULL,
      target_amount   REAL NOT NULL,
      current_amount  REAL NOT NULL DEFAULT 0,
      deadline        TEXT,
      status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS debts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      person_name       TEXT NOT NULL,
      amount            REAL NOT NULL,
      remaining_amount  REAL NOT NULL,
      type              TEXT NOT NULL CHECK(type IN ('lent','borrowed')),
      note              TEXT,
      due_date          TEXT,
      status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','partially_repaid','fully_repaid')),
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      name              TEXT NOT NULL,
      amount            REAL NOT NULL,
      category_id       INTEGER,
      billing_cycle     TEXT NOT NULL DEFAULT 'monthly' CHECK(billing_cycle IN ('weekly','monthly','quarterly','yearly')),
      next_billing_date TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled')),
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      type              TEXT NOT NULL DEFAULT 'expense' CHECK(type IN ('expense','income')),
      amount            REAL NOT NULL,
      category_id       INTEGER,
      note              TEXT,
      frequency         TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly','yearly')),
      interval_value    INTEGER DEFAULT 1,
      next_date         TEXT NOT NULL,
      end_date          TEXT,
      status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled')),
      created_at        TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_user_date   ON expenses(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category    ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month   ON budgets(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_goals_user           ON goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_debts_user           ON debts(user_id);
  `);

  seedDefaults(db);
}

function seedDefaults(db) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE is_system = 1').get();
  if (row.c > 0) return;

  const defaults = [
    ['Food & Dining',  '🍽️',  'expense'],
    ['Groceries',      '🛒',  'expense'],
    ['Transport',      '🚗',  'expense'],
    ['Housing & Rent', '🏠',  'expense'],
    ['Utilities',      '💡',  'expense'],
    ['Entertainment',  '🎬',  'expense'],
    ['Shopping',       '🛍️',  'expense'],
    ['Health',         '💊',  'expense'],
    ['Education',      '📚',  'expense'],
    ['Bills & Fees',   '🧾',  'expense'],
    ['Clothing',       '👕',  'expense'],
    ['Gifts',          '🎁',  'expense'],
    ['Travel',         '✈️',  'expense'],
    ['Insurance',      '🛡️',  'expense'],
    ['Salary',         '💰',  'income'],
    ['Freelance',      '💻',  'income'],
    ['Investments',    '📈',  'income'],
    ['Gifts Received', '🎀',  'income'],
    ['Other',          '📌',  'expense'],
  ];

  const insert = db.prepare(
    'INSERT INTO categories (user_id, name, emoji, type, is_system) VALUES (0, ?, ?, ?, 1)'
  );
  const tx = db.transaction(() => {
    for (const row of defaults) insert.run(...row);
  });
  tx();
  console.log('[schema] Default categories seeded.');
}
