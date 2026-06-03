/**
 * Search handler — /search command.
 */

import { searchExpenses } from '../db/queries/expenses.js';
import { formatAmount } from '../tools/formatter.js';

/**
 * /search <keyword|amount> — search expenses by keyword, amount, or date.
 * Examples:
 *   /search lunch          — find expenses with "lunch" in note/category
 *   /search >50000         — expenses over 50k
 *   /search <10000         — expenses under 10k
 *   /search 2026-05        — expenses in May 2026
 */
export async function handleSearch(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');

  try {
    const args = msg.text.split(' ').slice(1);
    if (!args.length) {
      return bot.sendMessage(chatId,
        `🔍 *Search Expenses*\n\nUsage:\n\`/search lunch\` — keyword search\n\`/search >50000\` — over 50k\n\`/search <10000\` — under 10k\n\`/search 2026-05\` — by month`,
        { parse_mode: 'Markdown' }
      );
    }

    const query = args.join(' ');
    const results = searchExpenses(userId, query);

    if (!results.length) {
      return bot.sendMessage(chatId, `🔍 No results for "${query}".`);
    }

    const total = results.reduce((sum, e) => e.type === 'expense' ? sum + e.amount : sum, 0);
    let text = `🔍 *Search Results:* "${query}"\n📊 ${results.length} results, total: ${formatAmount(total)}\n\n`;

    for (const e of results) {
      const emoji = e.cat_emoji || '📌';
      const icon = e.type === 'income' ? '📥' : '💸';
      text += `${icon} #${e.id} ${emoji} *${e.cat_name || 'Uncategorized'}* — ${formatAmount(e.amount)}`;
      if (e.note && e.note !== e.cat_name) text += ` (${e.note})`;
      text += `\n   📅 ${e.date}\n\n`;
    }

    text += `Use \`/edit <id>\` to edit or \`/delete <id>\` to remove.`;
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[search] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not complete search.');
  }
}
