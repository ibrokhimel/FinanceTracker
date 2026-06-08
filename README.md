# FinanceBot — Telegram Personal Finance Tracker

[![GitHub](https://img.shields.io/badge/GitHub-ibrokhimel%2FFinanceTracker-181717?logo=github)](https://github.com/ibrokhimel/FinanceTracker)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-ISC-blue)]()

A Telegram bot for tracking expenses, managing budgets, setting savings goals, and more — mostly by tapping buttons or typing naturally.

**Local-first:** your data lives in a local SQLite file. Logging works fully offline with a regex parser; **AI features are optional** — add a free API key to unlock chat, receipt photos, voice notes, and AI summaries.

## Features

- 💸 **Natural-language logging** — Type `lunch 25000`, `bus 1500`, or `salary 500000`
- 💬 **AI chat by default** — Just type a question (`how much did I spend on food?`) and the AI answers from *your* data — no `/ask` needed (toggle in `/settings`; needs an AI key)
- 🔘 **Buttons everywhere** — Tap to create wallets, transfer, add to goals, repay debts, pause subscriptions, pick currency/theme — minimal typing
- 🧾 **Receipt photos & voice notes** — Send a receipt to OCR it, or a voice memo to transcribe + log (needs an AI key)
- 🎨 **Beautiful charts & cards** — Health score, net-worth curve, spending heatmap, budget scorecard, wallet cards, year-wrapped poster and more, rendered as polished images
- 🧠 **Auto-categorization** — 100+ keyword patterns map to 19 categories
- 📊 **Reports & forecasts** — Daily/weekly/monthly/yearly summaries + end-of-month prediction
- 💯 **Financial health score** — 0–100 with budget / savings / debt / streak / goal sub-scores
- 💰 **Budgets** — Per-category & overall, with 50/80/100% alerts (spend computed live)
- 🎯 **Savings goals · 💳 multi-wallet · 📋 debts · 🔄 subscriptions · 🔁 recurring · 📈 investments**
- ⏰ **Smart reminders** — Daily nudge, weekly digest, bill reminders, AI debrief
- 🔐 **Invite-only access** — Invite links, admin panel, per-user preferences, audit log + `/undo`

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (20+ recommended)
- A [Telegram Bot Token](https://t.me/BotFather) from @BotFather
- *(optional)* a free AI key (e.g. [Groq](https://console.groq.com/)) for the AI features

## Quick Start

> 🍎 **On a Mac?** Follow the beginner-friendly **[START_MAC.md](START_MAC.md)** instead.

1. **Install dependencies**
   ```bash
   cd FinanceTracker
   npm install
   ```
   > On macOS, if `canvas`/`better-sqlite3` fail to build, run
   > `xcode-select --install` and
   > `brew install pkg-config cairo pango libpng jpeg giflib librsvg`, then retry.

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your bot token (and optionally an AI key):
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
   # GROQ_API_KEY=your_groq_key        # optional — enables AI chat / voice / summaries
   # GEMINI_API_KEY=your_gemini_key    # optional — best for receipt photo OCR
   ```

3. **Run the bot**
   ```bash
   npm start
   ```

The bot creates a SQLite database (`finance.db`) and runs all migrations automatically on
first run. A `.bak` backup is made before each migration, so upgrades are safe — no need to
delete the database.

## Running the tests

```bash
npm test
```

## Commands

Most commands open an inline-button menu — you rarely need to type arguments.

| Command | Description |
|---|---|
| `/start` · `/help` | Onboarding · full command reference |
| `/add` · `/expenses` · `/edit` · `/delete` · `/undo` | Log / list / edit / delete / restore entries |
| `/report` · `/predict` · `/chart` · `/pdf` · `/export` | Summaries, forecast, charts, PDF, CSV |
| `/score` · `/networth` · `/debrief` · `/personality` | Health score, net worth, AI summaries |
| `/budget` · `/goals` · `/wallets` · `/debts` | Budgets, savings goals, wallets+transfers, debts |
| `/subscriptions` · `/recurring` · `/investments` · `/wishlist` | Recurring money + portfolio + wishlist |
| `/ask` | Ask the AI (or just type a question — no command needed) |
| `/settings` | Tappable preferences (currency, theme, nudge, AI chat, digest) |
| `/invite` · `/whoami` · `/usage` · `/admin` | Invites, your status, usage, admin panel |

Just typing also works: a message that isn't an expense (e.g. *"what's my biggest spend?"*)
is answered by the AI when an AI key is configured.

## Natural Language Examples

Just type these directly in the chat:

```
lunch 25000
bus 1500
coffee 450
yesterday spent 30000 on gas
received 500000 salary
got 20000 freelance payment
50k on groceries
paid 1500 for taxi
rent 500000
```

The parser understands shorthand:
- `50k` = 50,000
- `1.5m` = 1,500,000
- `yesterday` → auto-calculated date
- `last friday` → resolved to correct date

## Multi-Step Flow

If the bot can't parse your message confidently enough, it starts a conversation:

```
You: chips 500
Bot: I see 500 UZS. What was it for?
You: snacks
Bot: 🍽️ Snacks. What date? (today, yesterday, or YYYY-MM-DD)
You: today
Bot: Does this look right?
    🍽️ Food & Dining: 500 UZS
    📝 snacks
    📅 2026-06-03
    [ ✅ Save ]  [ ❌ Cancel ]
```

Tap **✅ Save** to confirm. You can still edit individual fields by typing:
- `category Transport`
- `amount 1000`
- `date yesterday`

## Budget Alerts

The bot automatically checks your budgets when you log expenses:

- 🟡 **50%** — Warning: half your budget used
- 🔴 **80%** — Danger: almost out of budget
- 🚨 **100%** — Budget exceeded

## Architecture

```
📁 FinanceTracker/
├── index.js                  ← Entry point, wires everything together
│
├── bot/
│   ├── bot.js                ← TelegramBot instance initialisation
│   ├── router.js             ← Routes messages/commands/sessions to handlers
│   ├── keyboards.js          ← Inline-button builders (menus, pickers, actions)
│   ├── session.js            ← Per-user multi-step conversation state
│   └── commands.js           ← Telegram "/" command menu registry
│
├── handlers/                 ← One file per command (~35): expenses, reports,
│   ├── expenses.js           ←   budgets, goals, wallets, debts, subscriptions,
│   ├── callbacks.js          ←   recurring, investments, charts, score, networth,
│   ├── flows.js              ←   ask, photo, voice, invite, admin, settings …
│   ├── ask.js                ← callbacks.js = inline-button dispatcher
│   └── settings.js           ← flows.js   = button-initiated multi-step inputs
│
├── tools/
│   ├── parser.js             ← Regex NLP: "lunch 25000" → { amount, category, date }
│   ├── ai.js                 ← Unified AI client (Groq→OpenRouter→Gemini→Ollama)
│   ├── charts.js             ← Charts + cards → PNG (Chart.js + Satori)
│   ├── render.js             ← HTML/CSS → PNG core (satori + resvg + Poppins/emoji)
│   ├── categorizer.js        ← 100+ keyword → category map
│   ├── formatter.js          ← Currency, date, progress-bar formatting
│   ├── commandHelp.js        ← Consistent "how to use this" usage messages
│   ├── reminderScheduler.js  ← Cron jobs (nudges, digest, bills, recurring)
│   └── …                     ← currency, predictor, friction, regret, security …
│
├── db/
│   ├── database.js           ← SQLite connection (better-sqlite3)
│   ├── schema.js             ← CREATE TABLE statements + default data
│   ├── migrations.js         ← Versioned migrations (auto-applied on boot)
│   └── queries/              ← Raw SQL per table (users, expenses, budgets, …)
│
├── assets/fonts/             ← Poppins TTFs used by the image renderer
├── tests/                    ← Vitest suites (charts, buttons, handlers, parser …)
├── .env.example · package.json · README.md · START_MAC.md
```

## Design Rules

| Layer | Job | Can import |
|---|---|---|
| `tools/` | Pure functions, no side effects | Other tools only |
| `db/queries/` | Raw SQL, no business logic | `db/database.js` only |
| `handlers/` | Orchestration (call tool → db → send) | Tools + queries + bot core |
| `bot/` | Telegram plumbing, routing, state | — |
| `index.js` | Wire everything together | Everything |

## Customization

- **Currency**: `/settings currency USD` (default: UZS)
- **Nudge Time**: `/settings nudge 21:00`
- **Weekly Digest**: `/settings digest on`
- **Month Start Date**: `/settings monthday 15`
- **Locale**: Set `LOCALE=uz-UZ` in `.env` for number formatting

## Data Storage

All data is stored locally in `finance.db` (SQLite) and never leaves your machine, except
when an **AI feature** is used — then the relevant message (with basic PII scrubbed) is sent
to your configured AI provider to generate a reply. Logging, reports, budgets, charts and
every button work fully offline; only chat, receipt OCR, voice, and AI summaries call out.

## Sample Conversation

```
You: lunch 25000
Bot: 💸 Expense logged!
     🍽️ Food & Dining: 25,000 UZS
     📅 2026-06-03

You: /report
Bot: 📊 This Month
     2026-06-01 → 2026-06-30

     💸 Expenses: 125,000 UZS
     📥 Income: 500,000 UZS
     📋 Transactions: 5 expenses, 1 income

     ━━━ By Category ━━━

     🍽️ Food & Dining — 60,000 UZS (48.0%)
     ████████░░ 3 txns

     🚗 Transport — 40,000 UZS (32.0%)
     █████░░░░░ 1 txn

You: /predict
Bot: 🔮 End-of-Month Forecast
     📅 2026-06

     💸 Spent: 125,000 UZS
     📊 Daily avg: 41,667 UZS
     📆 Day 3 of 30 (27 days left)

     🔮 Projected total: 1,250,000 UZS
     🟡 Trend: +15.2% vs previous months
```

## License

ISC
