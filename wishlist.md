# Wishlist — FinanceTracker

Roadmap for upgrades, grouped by priority. Written after a full structural review
(June 2026). **Priorities:**

- **P0** — bugs / broken behavior + the headline new feature (bank-screenshot import)
- **P1** — UX overhaul the owner asked for (AI-by-default, buttons everywhere, usage examples, per-user prefs)
- **P2** — quality-of-life polish and smaller cleanups
- **P3** — bigger/longer-term ideas

> Conventions used below: file paths are clickable (`handlers/ask.js:70`).
> Nothing here has been coded yet — this is the plan.

---

## P0 — Bugs & broken behavior

### 0.1 `/score` — "Budget discipline" component is unreliable
- **Symptom:** the score (40 of its 100 points come from budget discipline) doesn't reflect reality.
- **Root cause:** `handlers/score.js:budgetScore()` reads `budgets.spent`. That column is a
  *denormalized counter* that is only ever **incremented** when an expense is added
  (`db/queries/expenses.js:21` — `UPDATE budgets SET spent = spent + ?`). It is:
  - never **decremented** on `/delete`, `/undo`, or edit of an amount/category,
  - only updated if a budget row **already exists for that month** (spending before you set a
    budget never counts),
  - incremented on **both** the category budget *and* the overall (`category_id IS NULL`) budget
    in one statement, so the overall budget double-counts.
- **Fix direction:** compute `spent` on the fly from the `expenses` table (sum by category + month)
  instead of trusting the counter — a `getBudgetsWithSpend(userId, month)` query that joins/sums.
  Then `/score`, `/buddy` (`buddy.js:26-27`), budget alerts (`getBudgetAlerts`, which filters
  `b.spent > 0` and so currently misses freshly-tracked months), charts, and friction mode all
  become correct. Backfill/repair the stored counter or drop it entirely.
- **Also:** `/score` has no explanation of *why* you got each sub-score and no buttons to drill in.
  Add a short "how to improve" line per component and a "📊 See report" button.

### 0.2 `/invite` — works but feels broken (discoverability + rigid syntax)
- **Reality:** `/invite create` *already* exists (aliased to `new` in `handlers/invite.js:45`).
  The problem is it's undiscoverable and unforgiving:
  - no inline buttons anywhere — everything is typed,
  - the note must be wrapped in literal quotes (`/invite new 1 30d "Brother"`); get the order
    wrong and you silently get a no-note, 1-use link,
  - expiry only accepts the exact `\d+d` form (`7d`) — `7`, `7 days`, `1w` all silently ignored,
  - `/invite revoke` needs you to copy a code by hand.
- **Fix direction — turn it into a button-driven flow:**
  - `/invite` → list + buttons: `➕ Create`, and per-invite `📋 Copy`, `🔗 Share`, `🗑️ Revoke`.
  - `➕ Create` → ask uses (buttons: `1`, `5`, `10`, `∞`) → expiry (`Never`, `7d`, `30d`) →
    optional note (free text or "skip") → done. No syntax to memorize.
  - Keep the text form working, but on any malformed input show a worked example (see 1.3).
  - Fix the "left" math display label so it's unambiguous (`3 of 5 uses left`).

### 0.3 Headline feature — import bank-app screenshots (statement OCR)
The big one. Today `handlers/photo.js` only reads a **single receipt** → one expense. The owner
wants to send a **screenshot of their bank app's transaction list** and have everything documented,
balances tracked per card, and internal card-to-card moves recognized.

**Sub-features:**

1. **Multi-transaction extraction.** New vision prompt in `tools/ai.js` (alongside `readReceipt`)
   that returns an **array** of transactions: `{date, merchant/description, amount, direction
   (debit/credit), card/account label, balance_after?}`. Handle multiple rows per image and
   multi-image albums.
2. **Per-card / per-wallet balances.** Extend the `wallets` model so each card/account is a wallet
   with a real running `balance`. Read the "available balance" shown in the screenshot and reconcile
   it against our computed balance; flag drift for review.
3. **Card-to-card transfer detection.** When two extracted rows are a debit from one of *my* cards
   and a credit to *another of my* cards for the same amount/time, treat it as an **internal
   transfer**, not income/expense — record it as a wallet→wallet movement so it doesn't pollute
   spending/income totals. (Requires a real transfer ledger — see 0.4.)
4. **Knows my accounts / asks for what it's missing.** The AI should know which cards I have (from
   my wallets + a per-user "my accounts" preference) so it can map screenshot labels to wallets.
   If it sees an unknown card or an ambiguous transfer, it **asks** ("Is `*4821` your card?
   [Yes, it's my Humo] [No, external]") via inline buttons rather than guessing.
5. **Review-before-commit.** Don't blind-import. Show a compact summary ("12 transactions, 1
   transfer, 2 need confirmation") with buttons: `✅ Import all`, `✏️ Review`, `❌ Discard`.
   Per-row buttons during review: fix category, mark as transfer, skip, split.
6. **De-dupe.** Avoid double-logging if the same screenshot (or overlapping date range) is sent
   twice — hash the extracted rows or check (date, amount, card) against existing entries.

**Schema work this implies (see 0.4):** a transfers/ledger table, a stable "card label → wallet"
mapping, and an `import_batches` table so a whole screenshot import can be undone in one tap.

### 0.4 Wallet model needs a real transfer ledger
- Today `transferBetweenWallets` just does `balance += / -=` with **no record** of the movement
  (`db/queries/wallets.js`). There's no history, nothing to audit, and nothing for card-to-card
  detection to write into.
- **Fix direction:** add a `transfers` table (`from_wallet`, `to_wallet`, `amount`, `date`, `note`,
  `source` = manual|screenshot, `import_batch_id`). Transfers are excluded from income/expense
  reports by design. `/networth` and per-wallet balances derive from expenses + transfers.

---

## P1 — UX overhaul (the "make it lazy & easy" asks)

### 1.1 AI conversation should be the default — `/ask` optional
- **Now:** plain text only runs through the regex parser (`parseQuick`). If it doesn't look like an
  expense, `handlers/expenses.js:76` **silently returns** — questions like "how much did I spend on
  food?" do nothing unless you prefix `/ask`.
- **Want:** any plain message that isn't clearly an expense/income should fall through to the AI
  finance assistant automatically (the `handleAsk` logic, grounded in the user's data).
- **Fix direction:** in the text path, if `parseQuick` finds no confident amount, route to the AI
  chat instead of dropping it. Keep `/ask` as an explicit alias. Gate behind a per-user
  `ai_chat_default` preference (default ON) so power users can turn it off. Mind rate limits/cost
  (existing `rateLimit('ai')`), and add a cheap heuristic so "ok", "thanks", emojis don't burn AI
  calls.

### 1.2 Stop printing the AI's name/provider
- **Now:** `handlers/ask.js:70` appends `\n\n_via ${res.provider}_` (e.g. "via groq"). Remove it —
  the assistant should answer without naming the model/provider at the end. Keep the `💾` cached
  marker if desired, but drop the provider tag. (Provider/model stats still live in `/usage`, which
  is fine.)
- Also audit `/debrief`, `/personality`, `/events predict` and any other AI output for stray
  "via X" / model mentions.

### 1.3 Misused command → always show a worked example
- **Now:** inconsistent. Some handlers show good examples (`/add`, `/wallets`), others error
  unhelpfully or do nothing (`/personality`, `/predict` with no data, `/whatif` bad delta shows a
  confusing message, `/wishlist buy` with a bad id, `/events`).
- **Want:** every command, on empty/invalid input, replies with a short usage block + a concrete
  example + (ideally) buttons for the common next actions.
- **Fix direction:** a tiny shared `usage(command, examples[])` helper so every handler formats help
  the same way; call it from each handler's guard clauses. Make the "Unknown setting" /
  "didn't understand" branches point at it too.

### 1.4 Buttons everywhere — minimize typing
The owner wants to *tap*, not type. Many commands are text-only. Add inline keyboards with the
likely next replies pre-baked:

- **Expense confirm flow** (`expenses.js`): replace "reply yes / category X" text with buttons:
  `✅ Confirm`, `✏️ Category` (→ category grid, which already exists as `categoryGrid`), `📅 Date`
  (`Today`/`Yesterday`), `❌ Cancel`.
- **`/wallets`**: buttons `➕ New`, `🔁 Transfer` (pick from/to via wallet buttons + amount prompt),
  per-wallet `✏️`/`🗑️`. No more `transfer FromName ToName amount` typing.
- **`/debts`**: `lent`/`borrowed`/`repay` as buttons; pick the person from a list of known names.
- **`/goals`**: fix the bug that `add` only credits the *first* active goal — let the user pick which
  goal via buttons. Add `➕ New goal`, per-goal `➕ Add money`, `✅ Complete`.
- **`/subscriptions`, `/recurring`, `/investments`, `/wishlist`**: add/cancel/remove/buy via buttons
  with item pickers instead of needing the numeric id.
- **`/expenses` & `/search` results**: each row gets `✏️`/`🗑️`/`➗` buttons (today only freshly-logged
  expenses get them; listed/searched ones don't).
- **`/settings`**: the `settingsMenu` keyboard exists but doesn't cover `currency`, `nudge time`,
  `friction`, `monthday` interactively, and there's **no UI at all** for `friction_categories`
  (you can only set it by typing). Make every setting tappable.
- **`/score`, `/invite`**: covered in 0.1 / 0.2.

### 1.5 Richer per-user preferences (each user fully self-contained)
- **Now (in `users`):** currency, language, theme, daily_nudge+time, weekly_digest, debrief_enabled,
  ai_enabled, typical_log_hour (learned), friction_categories (CSV, no UI).
- **Add:**
  - `ai_chat_default` (1.1), AI **persona/tone** (warm vs. terse vs. "tough love"), AI verbosity.
  - **"My accounts/cards"** — the list of cards/wallets + their screenshot labels (for 0.3 mapping).
    AI consults this and asks to fill gaps.
  - Quiet hours / reminder verbosity, budget-alert style (one digest vs. per-event), default wallet,
    locale/number format, week-start day.
  - Custom categories (today only the seeded system categories exist for everyone).
- **Fix direction:** consider a flexible `user_preferences(user_id, key, value)` table for the
  long tail instead of ever-widening the `users` row; keep hot fields as columns.

### 1.6 AI can edit / add to my data on request
- The owner wants the assistant to actually *act*, not just answer ("add a 50k lunch", "delete the
  duplicate", "move that to Groceries", "set my food budget to 1m").
- **Fix direction:** give `/ask`/default-chat a small **tool/function-calling layer** mapping intents
  to existing query functions (add/edit/delete expense, set budget, create goal, transfer). Always
  confirm a write with a button (`✅ Do it` / `❌ No`) before committing, and log via the existing
  audit trail so `/undo` covers it. This is the natural payoff of 1.1 + the data already in `/ask`'s
  context builder.

---

## P2 — Quality-of-life & cleanups

- **`/goals add` targets only the first active goal** (`handlers/goals.js`) — ambiguous with multiple
  goals. Needs goal selection (also listed in 1.4).
- **Budget alerts can spam** — multiple alerts send as separate messages on a single expense; batch
  into one. Also they rely on the broken `spent` counter (fix via 0.1).
- **Two schedulers overlap** — `reminderScheduler.js` and `smartReminder.js` both run hourly and can
  both nudge the same user; reconcile responsibilities / de-dupe.
- **`/predict` with little/no data** can produce meaningless/NaN output — guard and show "need a few
  more entries first."
- **`/history <id>`** has no depth limit — could dump a huge audit list; paginate.
- **`/whatif` bad-delta message** references the command you just ran — reword + example (rolls into 1.3).
- **`/pdf <YYYY-MM>`** doesn't validate the month string — validate + example.
- **`/buddy`** shows raw Telegram IDs — show names where possible, make ids copy-friendly.
- **`/wishlist`** has no way to move an item to "saving" via UI (only "purchased"); add it.
- **Voice & receipt confirmation** — voice transcription and receipt OCR auto-log; add the same
  confirm/Edit buttons the screenshot importer will use, for consistency.
- **`/usage`** marks every provider free-tier; surface real token costs if/when known.

---

## P3 — Bigger / longer-term

- **Web dashboard** (React + Express over the same SQLite DB) — carried over from the old wishlist.
- **Open-banking / API import** instead of screenshots, where available, for real-time balances.
- **Shared/household budgets** (multi-user on one ledger) building on the `buddy` privacy model.
- **Smarter categorization that learns** from your edits (today `categorizer.js` is static keywords).
- **Multi-language UI** (the `language` field exists but isn't used for output).
- **Anomaly detection** ("this charge is 3× your usual at this merchant").

---

## ✅ Shipped — quick-wins build (June 2026)

- **P0.1 `/score` budget fix** — `budgets.spent` is now computed live from the expenses table
  (`getBudgets`/`getBudgetAlerts` in `db/queries/budgets.js`), so deletes/edits stay accurate and
  the score's budget component, budget alerts, charts and `/buddy` are all correct. The dead
  increment counter in `addExpense` was removed. Verified: deleting an expense now lowers `spent`.
- **P1.1 AI chat is the default** — plain (non-expense) messages now fall through to the AI
  assistant instead of being silently dropped (`handleTextMessage` → `answerFinanceQuestion`).
  Trivial greetings/acks are skipped; gated by a new per-user `ai_chat` pref (migration v12,
  default on) toggled with `/settings chat on/off`. `/ask` still works explicitly.
- **P1.2 No more AI provider name** — dropped the `_via <provider>_` tag from replies and told the
  model not to name itself. (`/usage` still shows provider stats.)
- **P1.3 Usage-on-misuse (started)** — added `tools/commandHelp.js` (`usage()`/`sendUsage()`) and
  wired it into `/settings` (unknown setting) and `/whatif` (bad delta). Rolling it out to the
  remaining handlers (personality, events, predict-with-no-data, wishlist buy/remove, etc.) is the
  mechanical follow-up.

## ✅ Already implemented (for reference)

- **Income tracking** — parser detects income; `/add salary 5m`; `/report` shows income vs expenses.
- **Budget wizard** — `/budget wizard`, visual progress bars.
- **Edit/delete** — `/expenses`, `/edit <id> <field> <value>`, `/delete <id>` (with confirm), `/undo`.
- **CSV export** — `/export` (daily/weekly/monthly/yearly/all), Excel-safe BOM.
- **Search** — `/search lunch`, `/search >50000`, date filters.
- **Recurring** — hourly cron auto-logs; `/recurring add|cancel`.
- **Wishlist** — `/wishlist add|buy|remove|stats`.
- **Multi-currency** — original amount+currency stored, auto-converted at log time (`currency.js`).
- **Receipt OCR (single receipt)** — `handlers/photo.js` via Gemini/OpenRouter vision.
- **Charts (15+ types)**, `/networth`, `/score`, `/personality`, `/debrief`, `/payday`.
- **Card/chart UI redesign (June 2026) — COMPLETE.** New `tools/render.js` rendering core:
  HTML/CSS → PNG via satori → resvg, with the Poppins web font (5 weights in `assets/fonts/`),
  shared design tokens (`THEME`), and emoji via Twemoji (disk-cached, graceful offline fallback).
  - All 8 cards rebuilt in satori: score, wallet, goal, badge, year-wrapped, budget scorecard,
    debt race, heatmap calendar.
  - All 3 bespoke plots converted to satori too: hour-of-day radial sunburst, cash-flow waterfall
    (floating bars), spending DNA (dot scatter). `tools/charts.js` no longer hand-draws on canvas.
  - Chart.js graphs (donut/bars/line/radar/scatter) restyled with a cohesive dark theme +
    Poppins, rounded bars, gradient fills, cleaner grids.
  - Stayed pure-JS — no Python/polyglot, no Chromium. Card renderers are now async (call sites
    updated). Docker unaffected (assets ship via COPY, resvg has musl prebuilds).
- **Invites & access control**, `/admin`, `/whoami`, `/usage`, rate limiting, PII scrubbing,
  hash-chained audit log, persisted sessions, smart + scheduled reminders, friction mode, streaks,
  events, what-if, split, accountability buddy.
</content>
</invoke>
