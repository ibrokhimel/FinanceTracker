/**
 * /stats (alias /new) — quick dashboard: the bot's current version + last update,
 * plus a snapshot of your data (this month + all-time totals, wallets, goals…).
 */

import { getSpendingSummary, getExpenses } from '../db/queries/expenses.js';
import { getWallets } from '../db/queries/wallets.js';
import { getGoals } from '../db/queries/goals.js';
import { getBudgets } from '../db/queries/budgets.js';
import { getDebts } from '../db/queries/debts.js';
import { formatAmount } from '../tools/formatter.js';
import { VERSION, latestChanges } from '../tools/version.js';
import { inline } from '../bot/keyboards.js';

export async function handleStats(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');

  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    const month = getSpendingSummary(userId, monthStart, today);
    const allTime = getSpendingSummary(userId, '2000-01-01', today);
    const wallets = getWallets(userId);
    const goals = getGoals(userId, 'active');
    const budgets = (getBudgets(userId, today.slice(0, 7)) || []).filter(b => b.amount > 0);
    const debts = getDebts(userId);
    const walletTotal = wallets.reduce((a, w) => a + w.balance, 0);
    const txCount = (allTime.expense_count || 0) + (allTime.income_count || 0);
    const last = getExpenses(userId, { limit: 1, order: 'DESC' })[0];

    const upd = latestChanges();
    let text = `📊 *FinanceBot Stats*\n`;
    text += `🤖 Version *v${VERSION}* — updated ${upd?.date || '—'}\n`;
    text += `_${upd?.title || ''}_\n\n`;

    text += `━━ *This month* ━━\n`;
    text += `💸 Spent: ${formatAmount(month.total_expenses)}\n`;
    text += `📥 Income: ${formatAmount(month.total_income)}\n`;
    text += `⚖️ Net: ${formatAmount((month.total_income || 0) - (month.total_expenses || 0))}\n\n`;

    text += `━━ *Your data* ━━\n`;
    text += `🧾 Transactions: ${txCount} all-time\n`;
    text += `💳 Wallets: ${wallets.length} (${formatAmount(walletTotal)} total)\n`;
    text += `🎯 Active goals: ${goals.length}\n`;
    text += `📁 Budgets set: ${budgets.length}\n`;
    text += `🤝 Open debts: ${debts.length}\n`;
    if (last) text += `🕘 Last entry: ${formatAmount(last.amount)} on ${last.date}\n`;

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      ...inline([[
        { text: '🆕 What\'s new', callback_data: 'log:all' },
        { text: '📈 Report', callback_data: 'rpt:monthly' },
      ]]),
    });
  } catch (err) {
    console.error('[stats] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not load stats.');
  }
}
