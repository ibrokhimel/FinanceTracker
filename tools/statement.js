/**
 * Statement classification — pure logic, no I/O (so it's easy to test).
 *
 * Takes the raw transaction rows the vision model extracted plus the user's
 * wallets, and sorts them into transfers / expenses / income / duplicates:
 *
 *   - Card-to-card moves between the user's OWN wallets are TRANSFERS — never
 *     counted as income or expense.
 *   - A debit (money out) → expense; a credit (money in) → income.
 *   - Rows that already exist (same date + amount + description) are duplicates.
 */

/** Normalise a label for fuzzy matching ("Humo *4821" → "humo*4821"). */
function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

/** Match a screenshot account label to one of the user's wallets (by name, alias, or last-4). */
export function matchWallet(label, wallets = []) {
  if (!label) return null;
  const l = norm(label);
  const last4 = (String(label).match(/(\d{4})(?!.*\d)/) || [])[1]; // trailing 4 digits
  for (const w of wallets) {
    const candidates = [w.name, ...(w.aliases ? String(w.aliases).split(',') : [])].map(norm).filter(Boolean);
    for (const c of candidates) {
      if (l === c || l.includes(c) || c.includes(l)) return w;
      if (last4 && c.includes(last4)) return w;
    }
  }
  return null;
}

function transferFromRow(t, wallets) {
  const own = matchWallet(t.account, wallets);
  const other = matchWallet(t.counterparty_account, wallets);
  // debit = money leaving t.account → from own, to counterparty; credit = reverse.
  const [fromW, toW] = t.direction === 'debit' ? [own, other] : [other, own];
  return {
    amount: t.amount,
    date: t.date,
    note: t.description || 'Transfer',
    fromWalletId: fromW?.id || null,
    toWalletId: toW?.id || null,
    raw: t,
  };
}

/**
 * @param {Array} rows  normalized rows from ai.readStatement
 * @param {{wallets?:Array, existing?:Array}} ctx
 *        existing: [{date, amount, note}] used for duplicate detection
 */
export function classifyTransactions(rows = [], { wallets = [], existing = [] } = {}) {
  const result = { transfers: [], expenses: [], income: [], duplicates: [], total: rows.length };
  const used = new Array(rows.length).fill(false);

  const isDup = (t) => existing.some(e =>
    e.date === t.date &&
    Math.round(e.amount) === Math.round(t.amount) &&
    norm(e.note) === norm(t.description)
  );

  // 1) Pair a debit+credit of equal amount where BOTH sides map to the user's
  //    own wallets — an unambiguous internal transfer captured in one screenshot.
  for (let i = 0; i < rows.length; i++) {
    if (used[i] || rows[i].is_transfer) continue;
    for (let j = i + 1; j < rows.length; j++) {
      if (used[j] || rows[j].is_transfer) continue;
      const a = rows[i], b = rows[j];
      if (Math.round(a.amount) !== Math.round(b.amount) || a.direction === b.direction) continue;
      if (matchWallet(a.account, wallets) && matchWallet(b.account, wallets)) {
        const debit = a.direction === 'debit' ? a : b;
        const credit = a.direction === 'debit' ? b : a;
        result.transfers.push({
          amount: debit.amount,
          date: debit.date,
          note: debit.description || 'Transfer',
          fromWalletId: matchWallet(debit.account, wallets)?.id || null,
          toWalletId: matchWallet(credit.account, wallets)?.id || null,
          raw: debit,
        });
        used[i] = used[j] = true;
        break;
      }
    }
  }

  // 2) Everything else: model-flagged transfers, then income/expense, minus dupes.
  for (let i = 0; i < rows.length; i++) {
    if (used[i]) continue;
    const t = rows[i];
    if (isDup(t)) { result.duplicates.push(t); continue; }
    if (t.is_transfer) result.transfers.push(transferFromRow(t, wallets));
    else if (t.direction === 'credit') result.income.push(t);
    else result.expenses.push(t);
  }

  return result;
}
