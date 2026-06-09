/**
 * Predict handler — /predict command.
 */

import { getTotalSpentThisMonth, getMonthlyTotals } from '../db/queries/expenses.js';
import { predict, formatPrediction } from '../tools/predictor.js';

/**
 * /predict — forecast end-of-month spending.
 */
export async function handlePredict(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const monthStr = `${year}-${month}`;

    const spentThisMonth = getTotalSpentThisMonth(userId);
    const monthlyTotals = getMonthlyTotals(userId, 4);

    // Calculate average of previous months (exclude current partial month)
    const prevMonths = monthlyTotals.filter(m => m.month !== monthStr);
    const previousAvg = prevMonths.length > 0
      ? prevMonths.reduce((s, m) => s + m.expenses, 0) / prevMonths.length
      : 0;

    if (!spentThisMonth && !previousAvg) {
      return bot.sendMessage(chatId,
        `🔮 *Not enough data yet*\n\nLog a few expenses first and I'll forecast your month.\nTry: \`lunch 25000\` or \`/add 25000 lunch\``,
        { parse_mode: 'Markdown' });
    }

    const prediction = predict(spentThisMonth, currentDay, daysInMonth, previousAvg);
    const text = formatPrediction(prediction, monthStr);

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[predict] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not generate prediction.');
  }
}
