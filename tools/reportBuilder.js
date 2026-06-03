/**
 * Report builder — assembles report strings from data objects.
 * Pure function — takes data, returns string.
 */

import { formatAmount, progressBar } from './formatter.js';

/**
 * Build a spending report string.
 */
export function buildSpendingReport({ label, fromDate, toDate, totalExpenses, totalIncome, expenseCount, incomeCount, byCategory, byIncomeCategory }) {
  let text = `📊 *${label}*\n${fromDate} → ${toDate}\n\n`;

  text += `💸 *Expenses:* ${formatAmount(totalExpenses)}\n`;
  text += `📥 *Income:* ${formatAmount(totalIncome)}\n`;
  text += `📋 *Transactions:* ${expenseCount} expenses, ${incomeCount} income\n`;

  if (totalIncome > 0 || totalExpenses > 0) {
    const balance = totalIncome - totalExpenses;
    const emoji = balance >= 0 ? '✅' : '🔴';
    text += `\n${emoji} *Balance:* ${formatAmount(Math.abs(balance))} ${balance >= 0 ? 'surplus' : 'deficit'}\n`;
  }

  if (byCategory && byCategory.length > 0) {
    text += `\n━━━ *Expenses by Category* ━━━\n\n`;
    for (const c of byCategory) {
      const pct = totalExpenses > 0 ? (c.total / totalExpenses * 100) : 0;
      text += `${c.emoji || '📌'} *${c.name}* — ${formatAmount(c.total)} (${pct.toFixed(1)}%)\n`;
      text += `${progressBar(pct)} ${c.count} txns\n\n`;
    }
  }

  if (byIncomeCategory && byIncomeCategory.length > 0) {
    text += `━━━ *Income by Category* ━━━\n\n`;
    for (const c of byIncomeCategory) {
      const pct = totalIncome > 0 ? (c.total / totalIncome * 100) : 0;
      text += `${c.emoji || '📥'} *${c.name}* — ${formatAmount(c.total)} (${pct.toFixed(1)}%)\n`;
      text += `${progressBar(pct)} ${c.count} txns\n\n`;
    }
  }

  return text;
}

/**
 * Build a quick "recent expenses" string.
 */
export function buildRecentExpenses(expenses) {
  if (!expenses || expenses.length === 0) return 'No expenses recorded yet.';

  let text = `📋 *Recent Expenses*\n\n`;
  for (const e of expenses) {
    const emoji = e.cat_emoji || '📌';
    text += `${emoji} ${formatAmount(e.amount)} — ${e.note || 'no note'}\n`;
    text += `   📅 ${e.date}\n\n`;
  }
  return text;
}

/**
 * Build a comparison string (this period vs last period).
 */
export function buildComparison(period, current, previous) {
  let text = `📊 *Comparison: ${period}*\n\n`;

  const diff = current - previous;
  const pct = previous > 0 ? ((diff / previous) * 100).toFixed(1) : '—';

  text += `📈 Current: ${formatAmount(current)}\n`;
  text += `📉 Previous: ${formatAmount(previous)}\n`;
  text += `📊 Change: ${diff >= 0 ? '+' : ''}${formatAmount(diff)} (${pct}%)\n`;

  return text;
}

/**
 * Build a greeting with available commands.
 */
export function buildWelcome(firstName) {
  return `👋 *Welcome, ${firstName}!* 🎉

I track your finances via natural language. Just type:

💸 \`lunch 25000\` (expense)
💰 \`salary 500000\` (income)
🚗 \`bus 1500\`

*Key Commands*
/report  — spending & income summary
/budget  — set budgets per category
/expenses — list recent expenses with IDs
/edit, /delete — edit or remove entries
/search — find expenses
/export — CSV export
/goals, /wishlist — savings & wishlist
/wallets, /debts, /subscriptions
/recurring — auto-recurring transactions
/predict — end-of-month forecast
/settings — preferences
/help    — full command list

Let's get started! 🚀`;
}
