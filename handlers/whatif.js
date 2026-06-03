/**
 * /whatif <category> <delta>  — show compound savings if you trim/cut a category.
 *
 * Examples:
 *   /whatif coffee 0           → savings if you spent $0/month on coffee
 *   /whatif transport -50%     → savings if you cut transport in half
 *   /whatif food -25%
 */

import { getDb } from '../db/database.js';
import { formatAmount } from '../tools/formatter.js';

function projectMonthlySavings(monthlyAvg, deltaArg) {
  const m = deltaArg.match(/^-?(\d+(?:\.\d+)?)\s*%$/);
  if (m) {
    const pct = parseFloat(m[1]) / 100;
    return monthlyAvg * pct;
  }
  if (deltaArg === '0' || /^0+(\.0+)?$/.test(deltaArg)) {
    return monthlyAvg;
  }
  const abs = parseFloat(deltaArg);
  if (!isNaN(abs)) return Math.max(0, monthlyAvg - abs);
  return null;
}

export async function handleWhatIf(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const parts = msg.text.split(/\s+/).slice(1);
  if (parts.length < 2) {
    return bot.sendMessage(chatId,
      `🔮 *What if?*\n\nExamples:\n\`/whatif coffee 0\`\n\`/whatif transport -50%\`\n\`/whatif food -25%\``,
      { parse_mode: 'Markdown' });
  }

  const cat = parts[0];
  const delta = parts[1];

  const row = getDb().prepare(`
    SELECT AVG(monthly) AS avg FROM (
      SELECT SUM(e.amount) AS monthly FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.type='expense'
        AND (LOWER(c.name) LIKE ? OR LOWER(e.note) LIKE ?)
      GROUP BY substr(e.date, 1, 7)
    )
  `).get(userId, `%${cat.toLowerCase()}%`, `%${cat.toLowerCase()}%`);

  const avg = row?.avg || 0;
  if (!avg) return bot.sendMessage(chatId, `No spending on "${cat}" found.`);

  const monthly = projectMonthlySavings(avg, delta);
  if (monthly == null) return bot.sendMessage(chatId, `Couldn't parse delta "${delta}". Try \`0\`, \`-50%\`, or a fixed amount.`);

  const y1 = monthly * 12;
  const y3 = y1 * 3;
  const y5 = y1 * 5;
  // assume 5% annual compounding if invested
  const compoundY5 = y1 * (Math.pow(1.05, 5) - 1) / 0.05;

  await bot.sendMessage(chatId,
    `🔮 *What if you cut ${cat} by ${delta}?*\n\n` +
    `Current monthly avg: ${formatAmount(avg)}\n` +
    `Projected monthly savings: *${formatAmount(monthly)}*\n\n` +
    `📅 1 year:  ${formatAmount(y1)}\n` +
    `📅 3 years: ${formatAmount(y3)}\n` +
    `📅 5 years: ${formatAmount(y5)}\n` +
    `📈 If invested @5%/yr (5y): ~${formatAmount(compoundY5)}`,
    { parse_mode: 'Markdown' });
}
