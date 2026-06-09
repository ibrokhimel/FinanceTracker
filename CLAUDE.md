# CLAUDE.md — notes for AI assistants working on this repo

FinanceBot is a Telegram personal-finance bot (Node.js, ESM, SQLite via
better-sqlite3). Entry point `index.js`; see `README.md` for features and
`wishlist.md` for the roadmap / what's done.

## ⚠️ Versioning — DO THIS BEFORE STARTING THE SERVER

The bot has a single source-of-truth version in **`tools/version.js`** (`VERSION`).

**Whenever you make a meaningful change, BEFORE you start the server:**

1. Bump `VERSION` in `tools/version.js`
   - PATCH (`0.3.0 → 0.3.1`) for fixes/tweaks
   - MINOR (`0.3.x → 0.4.0`) for new features
2. Add a new entry at the **top** of the `CHANGELOG` array (newest first):
   `{ version, date, title, changes: ['…'] }`
3. (Optional) keep `package.json` "version" in sync.

On boot, `announceVersionIfChanged(bot)` compares `VERSION` against the last
announced version (stored in DB table `app_meta`, key `announced_version`). If it
changed, it messages every **approved** user that the bot upgraded and points them
to `/changelog`. It records the new version so each version is announced only once.
Users read the details with `/changelog` (or `/whatsnew`).

If you forget to bump the version, users won't be told anything changed.

## Architecture (where things live)

- `bot/` — Telegram plumbing: `router.js` (routes messages/commands/sessions),
  `callbacks.js`'s dispatch is in `handlers/callbacks.js`, `keyboards.js`
  (inline-button builders), `session.js`, `commands.js` (the `/` menu).
- `handlers/` — one file per command. `flows.js` = button-initiated multi-step
  inputs; `callbacks.js` = the inline-button dispatcher.
- `tools/` — pure-ish helpers: `parser.js`, `ai.js` (provider chain), `charts.js`
  + `render.js` (images via Chart.js + Satori), `statement.js`, `version.js`, …
- `db/` — `database.js`, `schema.js`, `migrations.js` (versioned, auto-applied on
  boot with a `.bak` backup), `queries/` (raw SQL per table).

## Conventions

- Migrations: add a new `{version, name, up}` to the `MIGRATIONS` array in
  `db/migrations.js`; make `up` idempotent (check `PRAGMA table_info` before
  `ALTER TABLE`). They run automatically on boot.
- Money in budgets is computed live from `expenses` (see `db/queries/budgets.js`),
  not stored counters. Transfers live in their own table and are excluded from
  income/expense by design.
- Tests: `npm test` (Vitest). Add tests under `tests/`. Don't hit Telegram/AI in
  tests — use a fake bot and a temp `DB_PATH` (see `tests/buttons.test.js`).
- Image renderers in `tools/charts.js` are **async** (Satori). Every div passed to
  Satori needs an explicit `display`.

## Running

Needs `TELEGRAM_BOT_TOKEN` in `.env` (see `START_MAC.md`). AI features need a
vision/chat key (Groq/Gemini/OpenRouter) — the bot runs without them, just without
AI extras. `npm start` to run, `npm test` to test.
