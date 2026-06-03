# FinanceBot — Telegram Personal Finance Tracker

A Telegram bot for tracking expenses, managing budgets, setting savings goals, and more — all through natural language.

**Zero AI. Zero API costs. Everything runs locally with regex parsing.**

## Features

- 💸 **Natural Language Logging** — Type `lunch 25000` or `bus 1500` or `salary 500000`
- 🧠 **Regex Auto-Categorization** — 100+ keyword patterns map to 19 categories automatically
- 📊 **Spending Reports** — Daily, weekly, monthly, yearly summaries with emoji progress bars
- 🔮 **Predictions** — End-of-month spending forecast based on your daily average
- 💰 **Budget Management** — Per-category & overall budgets with 50%/80%/100% threshold alerts
- 🎯 **Savings Goals** — Create goals with progress tracking and milestone celebrations
- 💳 **Multi-Wallet** — Cash, bank, savings accounts with transfer support
- 📋 **Debt Tracker** — Money lent/borrowed with repayment tracking
- 🔄 **Subscription Manager** — Track recurring bills with renewal reminders
- ⏰ **Daily Nudge** — Optional reminders to log expenses at your chosen time
- 📬 **Weekly Digest** — Auto-summary every Monday morning
- 🔁 **Recurring Transactions** — Auto-log rent, salary, subscriptions
- 💬 **Multi-step Clarification** — When the parser is unsure, it asks follow-up questions

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- A [Telegram Bot Token](https://t.me/BotFather) from @BotFather

## Quick Start

1. **Clone or copy the project files**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
   ```

4. **Run the bot**
   ```bash
   npm start
   ```

The bot will create a SQLite database (`finance.db`) automatically on first run.

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome message and onboarding |
| `/help` | Full command reference |
| `/add` | Manually add an expense |
| `/report` | Spending summary (daily/weekly/monthly/yearly) |
| `/predict` | End-of-month spending forecast |
| `/budget` | View or set monthly budgets |
| `/goals` | Manage savings goals (create, add progress) |
| `/wallets` | View wallet balances (create, transfer) |
| `/debts` | Track debts and loans (lent, borrowed, repay) |
| `/subscriptions` | Manage subscriptions (add, cancel, pause) |
| `/settings` | Change preferences (currency, nudge, digest) |

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
    Reply yes to confirm
You: yes
Bot: 💸 Expense logged! 🍽️ Food & Dining: 500 UZS
```

You can also edit individual fields during confirmation:
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
│   ├── router.js             ← Routes messages/commands to handlers
│   └── session.js            ← Per-user multi-step conversation state
│
├── handlers/
│   ├── expenses.js           ← /add + plain-text + multi-step reply handlers
│   ├── reports.js            ← /report command
│   ├── budgets.js            ← /budget command
│   ├── goals.js              ← /goals command
│   ├── wallets.js            ← /wallets command
│   ├── debts.js              ← /debts command
│   ├── subscriptions.js      ← /subscriptions command
│   ├── predict.js            ← /predict command
│   └── settings.js           ← /start, /settings, /help
│
├── tools/
│   ├── parser.js             ← Regex NLP: "lunch 25000" → { amount, category, date }
│   ├── categorizer.js        ← 100+ keyword → category map (pure function)
│   ├── dateHelper.js         ← "yesterday", "last friday" → ISO date (pure function)
│   ├── formatter.js          ← Currency, date, progress bar formatting
│   ├── budgetChecker.js      ← Budget threshold alert engine (pure function)
│   ├── predictor.js          ← End-of-month spending forecast (pure function)
│   ├── reportBuilder.js      ← Builds formatted report strings
│   └── reminderScheduler.js  ← Cron job setup (nudges, digest, bills)
│
├── db/
│   ├── database.js           ← SQLite connection (better-sqlite3)
│   ├── schema.js             ← CREATE TABLE statements + default data
│   └── queries/
│       ├── users.js          ← User CRUD
│       ├── expenses.js       ← Expense CRUD + summaries
│       ├── budgets.js        ← Budget CRUD + alert queries
│       ├── goals.js          ← Goal CRUD
│       ├── wallets.js        ← Wallet CRUD + transfers
│       ├── debts.js          ← Debt CRUD + repayments
│       └── subscriptions.js  ← Subscription CRUD
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
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

All data is stored locally in `finance.db` (SQLite). Your financial data never leaves your machine. No cloud, no API keys needed (except Telegram).

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
