/**
 * Budget handler — /budget command.
 */

import { setBudget, getBudgets } from '../db/queries/budgets.js';
import { getCategories } from '../db/queries/categories.js';
import { formatAmount } from '../tools/formatter.js';
import { formatBudgetOverview } from '../tools/formatter.js';

/**
 * /budget [category] [amount]
 */
export async function handleBudget(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const args = msg.text.split(' ').slice(1);

  try {
    if (args.length === 0) {
      return showBudgets(bot, chatId, userId);
    }

    if (args.length >= 2) {
      const categoryName = args.slice(0, -1).join(' ');
      const amount = parseAmount(args[args.length - 1]);

      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chatId, '❌ Invalid amount. Use: `/budget food 50000`', { parse_mode: 'Markdown' });
      }

      const categories = getCategories(userId, 'expense');
      let categoryId = null;
      let label = 'Overall';

      if (categoryName.toLowerCase() !== 'overall') {
        const cat = categories.find(c => c.name.toLowerCase().includes(categoryName.toLowerCase()));
        if (!cat) {
          return bot.sendMessage(chatId,
            `❌ Category "${categoryName}" not found.\nYour categories: ${categories.map(c => c.name).join(', ')}`,
            { parse_mode: 'Markdown' }
          );
        }
        categoryId = cat.id;
        label = `${cat.emoji} ${cat.name}`;
      }

      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setBudget(userId, { categoryId, amount, period: 'monthly', month });

      await bot.sendMessage(chatId, `✅ *Budget set!*\n${label}: ${formatAmount(amount)}/month`, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('[budgets] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process budget command.');
  }
}

async function showBudgets(bot, chatId, userId) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const budgets = getBudgets(userId, month);

  if (budgets.length === 0) {
    return bot.sendMessage(chatId,
      `📊 *No budgets set yet.*\n\nSet one with:\n\`/budget food 50000\`\n\`/budget overall 200000\``,
      { parse_mode: 'Markdown' }
    );
  }

  const text = formatBudgetOverview(budgets);
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

function parseAmount(str) {
  str = str.replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1000;
  if (/m$/i.test(str)) return parseFloat(str) * 1_000_000;
  return parseFloat(str);
}
