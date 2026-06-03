/**
 * /payday — analyse the N-day window after each salary deposit, surface
 * post-payday spending spikes, and warn if user is currently in a danger window.
 */

import { getDb } from '../db/database.js';
import { formatAmount } from '../tools/formatter.js';

function recentSalaries(userId) {
  return getDb().prepare(`
    SELECT e.date, e.amount FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ? AND e.type='income'
      AND (LOWER(c.name) LIKE '%salary%' OR LOWER(e.note) LIKE '%salary%' OR LOWER(e.note) LIKE '%payday%')
      AND e.date > date('now','-180 days')
    ORDER BY e.date DESC
  `).all(userId);
}

function spendInWindow(userId, fromDate, days) {
  return getDb().prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM expenses WHERE user_id = ? AND type='expense'
      AND date >= ? AND date < date(?, '+' || ? || ' days')
  `).get(userId, fromDate, fromDate, days).total;
}

function avgDailySpend(userId) {
  const row = getDb().prepare(`
    SELECT AVG(t) AS a FROM (
      SELECT SUM(amount) AS t FROM expenses
      WHERE user_id = ? AND type='expense' AND date > date('now','-90 days')
      GROUP BY date
    )
  `).get(userId);
  return row?.a || 0;
}

export async function handlePayday(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const salaries = recentSalaries(userId);
  if (!salaries.length) {
    return bot.sendMessage(chatId, '💰 No salary entries found yet. Log income as `salary 5m` and try again.', { parse_mode: 'Markdown' });
  }

  const avg = avgDailySpend(userId);
  const WINDOW = 3;
  const results = salaries.slice(0, 6).map(s => {
    const spent = spendInWindow(userId, s.date, WINDOW);
    const ratio = avg > 0 ? spent / (avg * WINDOW) : 0;
    return { ...s, spent, ratio };
  });

  const spikes = results.filter(r => r.ratio >= 1.5);
  const isSpiker = spikes.length >= results.length / 2;

  let out = `💰 *Payday Behavior*\n\n`;
  for (const r of results.slice(0, 5)) {
    const flag = r.ratio >= 1.5 ? '🔴' : r.ratio >= 1.2 ? '🟡' : '🟢';
    out += `${flag} ${r.date}: spent ${formatAmount(r.spent)} in next ${WINDOW}d (${r.ratio.toFixed(1)}× normal)\n`;
  }

  if (isSpiker) {
    out += `\n📊 *Pattern:* You typically overspend in the ${WINDOW} days after payday.`;
    // currently in danger window?
    const last = salaries[0];
    const daysSince = Math.round((Date.now() - new Date(last.date + 'T00:00:00').getTime()) / 86400000);
    if (daysSince >= 0 && daysSince <= WINDOW) {
      out += `\n\n⚠️ *You're in that window now* (${daysSince}d since salary on ${last.date}). Heads up.`;
    }
  } else {
    out += `\n✅ No consistent post-payday spike — well controlled.`;
  }

  await bot.sendMessage(chatId, out, { parse_mode: 'Markdown' });
}
