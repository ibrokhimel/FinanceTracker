/**
 * /personality — AI-generated spending personality profile based on actual data.
 *
 * Pulls 90 days of patterns (day-of-week, hour-of-day, top categories, salary timing)
 * and asks the AI to summarise into 3-5 personality traits.
 */

import { getDb } from '../db/database.js';
import { insight } from '../tools/ai.js';
import { formatAmount } from '../tools/formatter.js';

export async function handlePersonality(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  try {
    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const byDow = getDb().prepare(`
      SELECT CAST(strftime('%w', date) AS INT) AS dow, SUM(amount) AS total
      FROM expenses WHERE user_id = ? AND date >= ? AND type='expense'
      GROUP BY dow
    `).all(userId, since);

    const byHour = getDb().prepare(`
      SELECT CAST(strftime('%H', created_at) AS INT) AS h, SUM(amount) AS total
      FROM expenses WHERE user_id = ? AND created_at > datetime('now','-90 days') AND type='expense'
      GROUP BY h ORDER BY total DESC LIMIT 3
    `).all(userId);

    const topCat = getDb().prepare(`
      SELECT c.name, SUM(e.amount) AS total
      FROM expenses e JOIN categories c ON e.category_id=c.id
      WHERE e.user_id = ? AND e.date >= ? AND e.type='expense'
      GROUP BY c.id ORDER BY total DESC LIMIT 5
    `).all(userId, since);

    const weekday = byDow.filter(r => r.dow >= 1 && r.dow <= 5).reduce((a, r) => a + r.total, 0);
    const weekend = byDow.filter(r => r.dow === 0 || r.dow === 6).reduce((a, r) => a + r.total, 0);
    const wkendMultiplier = weekday > 0 ? (weekend / 2) / (weekday / 5) : 0;

    const facts = [
      `Top categories (90d): ${topCat.map(c => `${c.name} ${formatAmount(c.total)}`).join(', ')}`,
      `Weekend daily avg vs weekday: ${wkendMultiplier.toFixed(1)}×`,
      `Peak spend hours: ${byHour.map(h => h.h + ':00').join(', ')}`,
    ];

    await bot.sendChatAction(chatId, 'typing');
    const prompt = `Based on these spending patterns, write 3-4 short bullet points describing the user's spending personality. Use playful labels like "comfort spender", "weekend bin­ger", "payday splurger". Be specific to the data. No moralising.\n\n${facts.join('\n')}`;
    const ai = await insight(prompt);

    const text = ai.ok ? ai.text : `Based on last 90 days:\n${facts.map(f => '• ' + f).join('\n')}`;
    await bot.sendMessage(chatId, `🧠 *Spending Personality*\n\n${text}`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[personality] error:', err.message);
    await bot.sendMessage(chatId, `❌ Could not analyse: ${err.message}`);
  }
}
