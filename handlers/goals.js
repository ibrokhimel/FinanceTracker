/**
 * Goals handler — /goals command.
 */

import { createGoal, getGoals, updateGoalProgress } from '../db/queries/goals.js';
import { formatAmount } from '../tools/formatter.js';
import { progressBar } from '../tools/formatter.js';

/**
 * /goals [new "Name" amount | add amount]
 */
export async function handleGoals(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');
  const args = msg.text.split(' ').slice(1);

  try {
    const sub = args[0]?.toLowerCase();

    if (!sub) return showGoals(bot, chatId, userId);

    if (sub === 'new' && args.length >= 3) {
      let name, target;

      if (args[1].startsWith('"')) {
        const m = msg.text.match(/"([^"]+)"/);
        name = m ? m[1] : args.slice(1, -1).join(' ');
        target = parseAmount(args[args.length - 1]);
      } else {
        target = parseAmount(args[args.length - 1]);
        name = args.slice(1, -1).join(' ');
      }

      if (isNaN(target) || target <= 0) return bot.sendMessage(chatId, '❌ Invalid target amount.');

      const goal = createGoal(userId, { name, targetAmount: target });
      await bot.sendMessage(chatId,
        `🎯 *New Savings Goal!*\n*${goal.name}*\nTarget: ${formatAmount(goal.target_amount)}`,
        { parse_mode: 'Markdown' }
      );
    } else if (sub === 'add' && args.length >= 2) {
      const amount = parseAmount(args[1]);
      if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount.');

      const active = getGoals(userId, 'active');
      if (!active.length) return bot.sendMessage(chatId, 'No active goals. Create one: `/goals new "Trip" 100000`', { parse_mode: 'Markdown' });

      const goal = active[0];
      const updated = updateGoalProgress(goal.id, amount);

      if (updated.status === 'completed') {
        return bot.sendMessage(chatId,
          `🎉 *Congratulations!*\nGoal reached: *${updated.name}*!\nTotal: ${formatAmount(updated.target_amount)}`,
          { parse_mode: 'Markdown' }
        );
      }

      const pct = (updated.current_amount / updated.target_amount) * 100;
      await bot.sendMessage(chatId,
        `💰 *Progress updated!*\n*${goal.name}*: ${formatAmount(updated.current_amount)} / ${formatAmount(goal.target_amount)} (${Math.round(pct)}%)\n${progressBar(pct)}\n\n${getMotivation(pct)}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      return showGoals(bot, chatId, userId);
    }
  } catch (err) {
    console.error('[goals] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process goals command.');
  }
}

async function showGoals(bot, chatId, userId) {
  const active = getGoals(userId, 'active');
  const completed = getGoals(userId, 'completed');

  let text = '🎯 *Savings Goals*\n\n';

  if (!active.length && !completed.length) {
    text += 'No goals yet. Create one:\n`/goals new "Emergency Fund" 500000`\n`/goals add 10000`';
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  if (active.length) {
    text += `━━ *Active Goals* ━━\n\n`;
    for (const g of active) {
      const pct = (g.current_amount / g.target_amount) * 100;
      text += `*${g.name}*\n${formatAmount(g.current_amount)} / ${formatAmount(g.target_amount)} (${Math.round(pct)}%)\n${progressBar(pct)}\n`;
      if (g.deadline) text += `📅 Due: ${g.deadline}\n`;
      text += '\n';
    }
  }

  if (completed.length) {
    text += `━━ *Completed* ━━\n\n`;
    for (const g of completed.slice(0, 3)) {
      text += `✅ ${g.name} — ${formatAmount(g.target_amount)}\n`;
    }
  }

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

function getMotivation(pct) {
  if (pct >= 75) return 'Almost there! Keep pushing! 🔥';
  if (pct >= 50) return 'Halfway there! You got this! 💪';
  if (pct >= 25) return 'Great start! Keep going! 🚀';
  return 'Every bit counts! Keep saving! 💰';
}

function parseAmount(str) {
  str = str.replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1000;
  if (/m$/i.test(str)) return parseFloat(str) * 1_000_000;
  return parseFloat(str);
}
