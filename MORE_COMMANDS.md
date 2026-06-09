# More Commands

## ✅ Shipped (v0.7.0)
- **Delete all** — `/clear` and a **🗑️ Delete all** button on `/expenses` (confirm + ↩️ Undo).
- **Delete search results** — **🗑️ Delete these** button on `/search` (confirm + ↩️ Undo).
- **Remove duplicates** — `/duplicates` (a.k.a. `/dupes`) finds same date+amount+note rows,
  keeps one of each, removes the rest (confirm + ↩️ Undo).
- **Reset account** — `/reset` wipes all data after you type **RESET**; auto-exports a CSV first.
- **Undoable batches** — every bulk delete stores the removed rows (`bulk_batches`) and
  restores them with ids preserved via the ↩️ Undo button.

**Still planned (phase 2):** multi-select checkboxes (#3), bulk recategorize (#4),
bulk edit (#6), `/batches` history (#7), archive (#9), quick `/today` `/week` lists
(#11), "delete last N" (#12). Details below.

---

## Proposals (phase 2)

Ideas for **bulk management & data control** — the stuff that's missing once you've
logged a lot of entries. Headlined by the requested "delete all", plus features in
the same spirit. Nothing here is coded yet; this is the plan.

**Design rules for all of these (so they're safe & on-brand):**
- **Button-first** — tap, don't type. Confirmations are inline buttons.
- **Always confirmed** — destructive actions show a count + ✅ / ❌ before running.
- **Always undoable** — bulk actions write one `bulk_batch` (like screenshot imports)
  so a single **↩️ Undo** restores everything. Big wipes auto-export a CSV first.
- **Respects filters** — "delete all" can mean *everything* or *just what's shown*.

---

## P0 — the ask: delete expenses in bulk

### 1. `/expenses` → 🗑️ **Delete all** button
- Add a **🗑️ Delete all** button under the expense list.
- Tap → confirm: *"Delete all 142 entries? This can be undone."* → ✅ / ❌.
- Runs as one undoable batch → reply has **↩️ Undo** (restores all).
- Alias command: **`/clear`**.

### 2. **Delete what's shown** (filtered delete)
The same 🗑️ button appears on filtered views, and only deletes that subset:
- `/search coffee` → 🗑️ Delete these (all coffee entries)
- `/expenses food` / `/expenses june` / `/expenses >50k` → delete that filter
- `/report` (a month) → 🗑️ Delete this month's entries
- Confirmation always names the filter + count: *"Delete 18 'Food' entries from June?"*

### 3. **Multi-select delete** (pick exactly which)
- In `/expenses`, each row gets a tap-to-toggle checkbox (⬜ → ✅).
- A footer **🗑️ Delete selected (3)** / **Select all** / **Clear**.
- Best when you want most-but-not-all gone. Reuses the same undo batch.

---

## P1 — related bulk management

### 4. **Bulk recategorize** — `/recategorize`
- Move every entry from one category to another (e.g. *Uncategorized → Groceries*),
  or recategorize the current selection. Category pickers as buttons.

### 5. **Find & remove duplicates** — `/duplicates`
- Detects same `date + amount + note` (common after re-importing a screenshot),
  shows the dupes grouped, and **🗑️ Remove duplicates** keeps one of each. Undoable.

### 6. **Bulk edit** — set on the selection
- For selected/filtered entries: change **date**, **wallet**, or **tag** in one go
  (e.g. assign 10 entries to the "Bank" wallet, or tag them `#trip`).

### 7. **Undo bulk / batch history** — `/batches`
- List recent bulk actions & imports with a one-tap **↩️ Undo** each (extends the
  existing screenshot-import undo to all bulk ops).

---

## P2 — data control & lifecycle

### 8. **Reset account** — `/reset` (a.k.a. wipe)
- Wipes *all* of your data (expenses, budgets, goals, wallets, debts…).
- Hard confirm: type the word **RESET** (not just a button) — irreversible.
- **Auto-exports a CSV first** and DMs it to you before deleting, as a safety net.

### 9. **Archive old data** — `/archive <YYYY>`
- Move entries older than a cutoff into an archive so `/report` & `/score` reflect
  recent activity, without permanently deleting history. `/unarchive` to bring back.

### 10. **Empty a category / wallet**
- From `/wallets` or a category view: **🗑️ Delete all in here** (e.g. clear a test
  wallet's entries) without touching the rest.

---

## P3 — quality-of-life selectors that make bulk natural

### 11. Quick filtered lists with actions
- `/today`, `/week`, `/month` → the entries for that period with per-row **🗑️** and
  the bulk **Delete all / Select** footer. Makes "delete today's mistakes" one tap.

### 12. "Delete last N" / "Delete last entry"
- `/undo` already restores the last delete; add **↩️ from the log** and a
  **"🗑️ Delete last 5"** quick action for fast cleanup of a bad logging streak.

---

## Implementation notes (for whoever builds this)

- Add a `bulk_batches` table (or reuse `import_batches` with a `kind` column) and a
  nullable `bulk_batch_id` on `expenses`, mirroring the screenshot-import undo so
  every bulk op is one **↩️ Undo**.
- Soft-delete option: instead of hard `DELETE`, set a `deleted_at` so undo is cheap
  and `/undo` history is richer. (Decide vs. the existing audit-log restore path.)
- Reuse `db/queries/transfers.js:deleteImportBatch` as the template for batch undo.
- Every destructive handler must go through a confirm callback (`bulkdel:*`) — never
  delete on first tap.
- Bump the version + changelog when shipped (see `CLAUDE.md`), and the upgrade
  notification will tell users automatically.
