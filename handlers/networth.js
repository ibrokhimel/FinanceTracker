/**
 * /networth — current snapshot + 12-month trajectory.
 *
 * Net worth = sum(wallet balances) + sum(lent debts remaining) - sum(borrowed debts remaining).
 */

import { getWallets } from '../db/queries/wallets.js';
import { getDb } from '../db/database.js';
import { getMonthlyTotals } from '../db/queries/expenses.js';
import { formatAmount } from '../tools/formatter.js';
import { netWorthCurve } from '../tools/charts.js';

export function currentNetWorth(userId) {
  const wallets = getWallets(userId);
  const walletSum = wallets.reduce((a, w) => a + w.balance, 0);

  const debt = getDb().prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='lent'     THEN remaining_amount ELSE 0 END), 0) AS lent,
      COALESCE(SUM(CASE WHEN type='borrowed' THEN remaining_amount ELSE 0 END), 0) AS bor
    FROM debts WHERE user_id = ? AND status != 'fully_repaid'
  `).get(userId);

  return walletSum + (debt.lent || 0) - (debt.bor || 0);
}

export async function handleNetWorth(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const nw = currentNetWorth(userId);
  const wallets = getWallets(userId);
  const walletLines = wallets.map(w => `• ${w.name} (${w.type}): ${formatAmount(w.balance)}`).join('\n');

  // Trajectory: synthesize from monthly cash flow, anchored to current.
  const monthly = getMonthlyTotals(userId, 12).reverse();
  let running = nw;
  const reverseCurve = [];
  for (let i = monthly.length - 1; i >= 0; i--) {
    reverseCurve.unshift({ date: monthly[i].month, value: running });
    running -= (monthly[i].income - monthly[i].expenses);
  }

  try {
    if (reverseCurve.length) {
      const buf = await netWorthCurve(reverseCurve);
      await bot.sendPhoto(chatId, buf, {
        caption: `📈 *Net worth:* ${formatAmount(nw)}\n\n*Wallets:*\n${walletLines || '_none_'}`,
        parse_mode: 'Markdown',
      });
      return;
    }
  } catch {}

  await bot.sendMessage(chatId,
    `📈 *Net worth:* ${formatAmount(nw)}\n\n*Wallets:*\n${walletLines || '_none_'}`,
    { parse_mode: 'Markdown' });
}
