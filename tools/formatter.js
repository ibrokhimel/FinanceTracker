/**
 * Pure formatting helpers — numbers, currencies, dates, reports.
 */

/**
 * Format a number as currency.
 * @param {number} amount
 * @param {string} [currency='UZS']
 * @returns {string} e.g. "25,000 UZS"
 */
export function formatAmount(amount, currency = 'UZS') {
  if (amount == null || isNaN(amount)) return `0 ${currency}`;
  const rounded = Math.round(amount);
  const locale = process.env.LOCALE || 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(rounded);
  } catch {
    return `${rounded.toLocaleString(locale)} ${currency}`;
  }
}

/**
 * Short format — drops currency symbol for inline use.
 * e.g. "25,000"
 */
export function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  const locale = process.env.LOCALE || 'en-US';
  return Math.round(n).toLocaleString(locale);
}

/**
 * Build a progress bar string.
 * @param {number} pct 0–100
 * @param {number} [segments=10]
 * @returns {string}
 */
export function progressBar(pct, segments = 10) {
  const filled = Math.round(Math.min(pct, 100) / 100 * segments);
  return '█'.repeat(filled) + '░'.repeat(segments - filled);
}

/**
 * Format a date for display in Telegram messages.
 * Delegates to dateHelper for relative names.
 */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  // Try to use the display helper
  try {
    const { formatDateDisplay } = require('./dateHelper.js');
    return formatDateDisplay(isoDate);
  } catch {
    const d = new Date(isoDate + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }
}

/**
 * Bold text.
 */
export function bold(s) { return `*${s}*`; }

/**
 * Italic text.
 */
export function italic(s) { return `_${s}_`; }

/**
 * Code text.
 */
export function code(s) { return `\`${s}\``; }

/**
 * Escape Markdown special characters for Telegram.
 */
export function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/([*_`[\]()~>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Build a complete report message string.
 * @param {object} opts
 * @returns {string}
 */
export function formatReport({ label, fromDate, toDate, totalExpenses, totalIncome, expenseCount, incomeCount, byCategory }) {
  let text = `📊 *${label}*\n${fromDate} → ${toDate}\n\n`;

  text += `💸 *Expenses:* ${formatAmount(totalExpenses)}\n`;
  text += `📥 *Income:* ${formatAmount(totalIncome)}\n`;
  text += `📋 *Transactions:* ${expenseCount} expenses, ${incomeCount} income\n`;

  if (totalIncome > 0) {
    const balance = totalIncome - totalExpenses;
    const emoji = balance >= 0 ? '✅' : '🔴';
    text += `\n${emoji} *Balance:* ${formatAmount(Math.abs(balance))} ${balance >= 0 ? 'surplus' : 'deficit'}\n`;
  }

  if (byCategory && byCategory.length > 0) {
    text += `\n━━━ *By Category* ━━━\n\n`;
    for (const c of byCategory) {
      const pct = totalExpenses > 0 ? (c.total / totalExpenses * 100) : 0;
      text += `${c.emoji || '📌'} *${c.name}* — ${formatAmount(c.total)} (${pct.toFixed(1)}%)\n`;
      text += `${progressBar(pct)} ${c.count} txns\n\n`;
    }
  }

  return text;
}

/**
 * Build a budget overview string.
 */
export function formatBudgetOverview(budgets) {
  if (!budgets || budgets.length === 0) {
    return '📊 *No budgets set.*\nUse `/budget food 50000` to set one.';
  }

  let text = '📊 *Monthly Budgets*\n\n';
  let overall = '';

  for (const b of budgets) {
    const pct = b.amount > 0 ? (b.spent / b.amount * 100) : 0;
    const bar = progressBar(pct);
    const emoji = pct >= 100 ? '🚨' : pct >= 80 ? '🔴' : pct >= 50 ? '🟡' : '🟢';
    const line = `${emoji} *${b.cat_name || 'Overall'}* ${formatAmount(b.spent)} / ${formatAmount(b.amount)} (${Math.round(pct)}%)\n${bar}\n\n`;

    if (b.category_id === null) overall = line;
    else text += line;
  }

  return (overall || '') + text;
}
