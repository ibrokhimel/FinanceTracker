# Wishlist — FinanceTracker

Prioritized features for future development.  
**P0** = core workflow gaps · **P1** = important quality-of-life · **P2** = nice to have

---

## ✅ Implemented

### 0.1 Income tracking
- ✅ Parser detects income from natural text (`salary 5m`, `freelance 200k`)
- ✅ `/add salary 500000` works — stores as `type='income'`
- ✅ `/report` shows income vs expenses with balance and category breakdown

### 0.2 Budget setup wizard
- ✅ `/budget wizard` interactive multi-step flow
- Step 1: asks which category (shows all expense categories)
- Step 2: asks how much per month
- Visual progress bars in budget overview

### 1.1 Edit & delete expenses
- ✅ `/expenses` — list recent 10 expenses with IDs
- ✅ `/edit <id> amount <value>` — change amount
- ✅ `/edit <id> note <text>` — change note
- ✅ `/edit <id> category <name>` — change category
- ✅ `/edit <id> date <date>` — change date
- ✅ `/delete <id>` — delete with confirmation prompt

### 1.2 Export to CSV
- ✅ `/export` — sends CSV file as Telegram document
- ✅ Supports periods: daily, weekly, monthly, yearly, all
- ✅ BOM for Excel UTF-8 compatibility, temp file cleanup

### 1.3 Search / filter expenses
- ✅ `/search lunch` — keyword search (note, category, tags)
- ✅ `/search >50000` — amount range search (>, <, >=, <=)
- ✅ Shows results with IDs for editing

### 1.4 Recurring transactions auto-logging
- ✅ Cron job runs hourly — inserts due recurring items as expenses
- ✅ `/recurring add "Name" 50000 monthly` — create recurring
- ✅ `/recurring cancel <id>` — stop a recurring

### 2.1 Wishlist / savings targets
- ✅ `/wishlist` — view all items with priority and total
- ✅ `/wishlist add "Name" price priority` — add item
- ✅ `/wishlist buy <id>` — mark as purchased
- ✅ `/wishlist remove <id>` — delete item
- ✅ `/wishlist stats` — totals and purchase stats

---

## P0 — Still Open

### 0.3 Multi-currency / auto-conversion
- Store original amount + currency, convert at view-time
- Could use free exchange rate API
- Low priority for single-currency users

---

## P1 — Still Open

### 1.5 Smart notifications
- Already has: daily nudge, weekly digest, budget alerts, bill reminders
- Could improve: smarter timing, custom alert rules, push notifications

---

## P2 — Still Open

### 2.2 Receipt photo OCR
- Snap receipt → bot reads total via OCR
- Needs Google Vision / similar paid API

### 2.3 Split bills
- `/split dinner 60000 Alice Bob` → per-person debts

### 2.4 Investment tracking
- Track stocks, crypto, portfolio value

### 2.5 Dark mode / theme toggle
- `/theme dark` → change formatting

### 2.6 Web dashboard
- React + Express frontend over the same SQLite DB
