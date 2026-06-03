/**
 * Report builder — assembles report strings from data objects.
 * Pure function — takes data, returns string.
 */

import { formatAmount, progressBar } from './formatter.js';

/**
 * Build a spending report string.
 */
export function buildSpendingReport({ label, fromDate, toDate, totalExpenses, totalIncome, expenseCount, incomeCount, byCategory }) {
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

I track your money via natural language. Just type:

💸 \`lunch 25000\`
🚗 \`bus 1500\`
💰 \`salary 500000\`

*Commands*
/report  — spending summary
/budget  — set & view budgets
/goals   — savings goals
/wallets — wallet balances
/debts   — debt tracker
/subscriptions — subscriptions
/predict — end-of-month forecast
/settings — preferences
/help    — all commands

Let's get started! 🚀`;
}
