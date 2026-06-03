/**
 * Report handler — /report command.
 * Orchestration: date calc → db query → reportBuilder → Telegram send.
 */

import { getSpendingSummary } from '../db/queries/expenses.js';
import { buildSpendingReport } from '../tools/reportBuilder.js';

/**
 * /report [daily|weekly|monthly|yearly|last_month]
 */
export async function handleReport(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const period = msg.text.split(' ').slice(1)[0]?.toLowerCase() || 'monthly';

  try {
    const { startDate, endDate, label } = getDateRange(period);
    const summary = getSpendingSummary(userId, startDate, endDate);

    const text = buildSpendingReport({
      label,
      fromDate: startDate,
      toDate: endDate,
      totalExpenses: summary.total_expenses,
      totalIncome: summary.total_income,
      expenseCount: summary.expense_count,
      incomeCount: summary.income_count,
      byCategory: summary.byCategory,
    });

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[reports] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not generate report.');
  }
}

function getDateRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  switch (period) {
    case 'today':
    case 'daily':
      return { startDate: `${y}-${m}-${d}`, endDate: `${y}-${m}-${d}`, label: 'Today' };
    case 'yesterday': {
      const yest = new Date(Date.now() - 86400000);
      const ys = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
      return { startDate: ys, endDate: ys, label: 'Yesterday' };
    }
    case 'week':
    case 'weekly': {
      const ws = new Date(now);
      ws.setDate(now.getDate() - now.getDay());
      return { startDate: ws.toISOString().slice(0, 10), endDate: `${y}-${m}-${d}`, label: 'This Week' };
    }
    case 'month':
    case 'monthly': {
      const dim = new Date(y, now.getMonth() + 1, 0).getDate();
      return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${String(dim).padStart(2,'0')}`, label: 'This Month' };
    }
    case 'year':
    case 'yearly':
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31`, label: 'This Year' };
    case 'last_month': {
      const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const ly = now.getMonth() === 0 ? y - 1 : y;
      const dim = new Date(ly, lm + 1, 0).getDate();
      return { startDate: `${ly}-${String(lm+1).padStart(2,'0')}-01`, endDate: `${ly}-${String(lm+1).padStart(2,'0')}-${String(dim).padStart(2,'0')}`, label: 'Last Month' };
    }
    default:
      return getDateRange('monthly');
  }
}
