/**
 * Budget handler — /budget command.
 */

import { setBudget, getBudgets } from '../db/queries/budgets.js';
import { getCategories } from '../db/queries/categories.js';
import { formatAmount, formatBudgetOverview } from '../tools/formatter.js';
import { setSession, clearSession, FLOWS } from '../bot/session.js';

/**
 * /budget [category] [amount] | wizard
 */
export async function handleBudget(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');
  const args = msg.text.split(' ').slice(1);

  try {
    if (args.length === 0) {
      return showBudgets(bot, chatId, userId);
    }

    if (args[0]?.toLowerCase() === 'wizard') {
      const categories = getCategories(userId, 'expense');
      const list = categories.map(c => `${c.emoji} ${c.name}`).join('\n');
      setSession(msg.from.id, { flow: FLOWS.AWAITING_BUDGET_CATEGORY, userId });
      return bot.sendMessage(chatId,
        `📊 *Budget Wizard*\n\nWhich category would you like to set a budget for?\n\n${list}\n\nOr type *overall* for an overall monthly budget.`,
        { parse_mode: 'Markdown' }
      );
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

export async function handleBudgetCategoryReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  try {
    const answer = msg.text.trim().toLowerCase();
    const categories = getCategories(userId, 'expense');
    const cat = categories.find(c => c.name.toLowerCase() === answer || c.name.toLowerCase().includes(answer));

    let categoryName = 'overall';
    if (answer !== 'overall') {
      if (!cat) {
        const list = categories.map(c => `${c.emoji} ${c.name}`).join('\n');
        return bot.sendMessage(chatId,
          `❌ Category "${answer}" not found.\n\nChoose one:\n${list}\n\nOr type *overall* for overall budget.`,
          { parse_mode: 'Markdown' }
        );
      }
      categoryName = cat.name;
    }

    setSession(msg.from.id, {
      flow: FLOWS.AWAITING_BUDGET_AMOUNT,
      partial: { categoryId: cat?.id || null, category: categoryName, emoji: cat?.emoji || '📊' },
      userId,
    });
    await bot.sendMessage(chatId, `How much per month for *${categoryName}*?\nSend a number like \`50000\``, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[budgets] category reply error:', err.message);
    await bot.sendMessage(chatId, '❌ Something went wrong.');
  }
}

export async function handleBudgetAmountReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  try {
    const amount = parseAmount(msg.text.trim());
    if (isNaN(amount) || amount <= 0) {
      return bot.sendMessage(chatId, '❌ Please send a valid number like `50000`', { parse_mode: 'Markdown' });
    }

    clearSession(msg.from.id);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setBudget(userId, { categoryId: session.partial.categoryId, amount, period: 'monthly', month });

    const label = session.partial.category === 'overall' ? 'Overall' : `${session.partial.emoji} ${session.partial.category}`;
    await bot.sendMessage(chatId, `✅ *Budget set!*\n${label}: ${formatAmount(amount)}/month`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[budgets] amount reply error:', err.message);
    await bot.sendMessage(chatId, '❌ Something went wrong.');
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
