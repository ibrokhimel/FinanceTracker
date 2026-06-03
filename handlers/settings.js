/**
 * Settings handler — /start, /settings, /help commands.
 */

import { updateUser } from '../db/queries/users.js';
import { buildWelcome } from '../tools/reportBuilder.js';

/**
 * /start — welcome message and onboarding.
 */
export async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'User';

  await bot.sendMessage(chatId, buildWelcome(firstName), { parse_mode: 'Markdown' });
}

/**
 * /settings [setting] [value]
 */
export async function handleSettings(bot, msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  if (!user) return bot.sendMessage(chatId, '❌ Could not identify your account.');
  const args = msg.text.split(' ').slice(1);

  if (args.length === 0) {
    let text = `⚙️ *Your Settings*\n\n`;
    text += `👤 Name: ${user.first_name}\n`;
    text += `💵 Currency: ${user.currency}\n`;
    text += `🌐 Language: ${user.language}\n`;
    text += `📅 Month starts: Day ${user.month_start_day}\n`;
    text += `⏰ Daily nudge: ${user.daily_nudge ? `Yes at ${user.nudge_time}` : 'Off'}\n`;
    text += `📊 Weekly digest: ${user.weekly_digest ? 'On' : 'Off'}\n\n`;
    text += `*Change settings:*\n`;
    text += `/settings currency USD\n`;
    text += `/settings nudge 21:00\n`;
    text += `/settings nudge off\n`;
    text += `/settings digest on/off\n`;
    text += `/settings monthday 15\n`;
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  const key = args[0].toLowerCase();
  const value = args.slice(1).join(' ');

  switch (key) {
    case 'currency': {
      const valid = ['UZS', 'USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED', 'SAR'];
      const v = value.toUpperCase();
      if (!valid.includes(v)) return bot.sendMessage(chatId, `❌ Invalid. Options: ${valid.join(', ')}`);
      updateUser(user.id, { currency: v });
      await bot.sendMessage(chatId, `✅ Currency → ${v}`);
      break;
    }
    case 'nudge': {
      if (['off', '0', 'false', 'no'].includes(value.toLowerCase())) {
        updateUser(user.id, { daily_nudge: 0 });
        await bot.sendMessage(chatId, '⏰ Daily nudge disabled.');
      } else {
        const t = value.match(/(\d{1,2}):(\d{2})/);
        if (t) {
          updateUser(user.id, { daily_nudge: 1, nudge_time: value });
          await bot.sendMessage(chatId, `⏰ Daily nudge set for ${value}`);
        } else {
          await bot.sendMessage(chatId, '❌ Use: `/settings nudge 21:00`', { parse_mode: 'Markdown' });
        }
      }
      break;
    }
    case 'digest': {
      const on = ['on', '1', 'true', 'yes'].includes(value.toLowerCase());
      updateUser(user.id, { weekly_digest: on ? 1 : 0 });
      await bot.sendMessage(chatId, `📊 Weekly digest ${on ? 'enabled' : 'disabled'}.`);
      break;
    }
    case 'monthday': {
      const d = parseInt(value, 10);
      if (isNaN(d) || d < 1 || d > 28) return bot.sendMessage(chatId, '❌ Month start day 1–28.');
      updateUser(user.id, { month_start_day: d });
      await bot.sendMessage(chatId, `📅 Month starts day ${d}.`);
      break;
    }
    default:
      await bot.sendMessage(chatId, `❌ Unknown setting "${key}". Use /settings to see options.`);
  }
}

/**
 * /help — full command list.
 */
export async function handleHelp(bot, msg) {
  const chatId = msg.chat.id;

  const text = `📚 *FinanceBot Commands*

*Logging*
💸 Just type naturally: \`lunch 25000\`, \`bus 1500\`
💰 Or income: \`salary 5m\`, \`freelance 200k\`
/add — Manually add expense or income

*Reports*
/report — Spending summary (daily/weekly/monthly/yearly)
/predict — End-of-month forecast
/search — Search expenses by keyword or amount
/export — Export to CSV file

*Budgets*
/budget — View or set budgets (per category or overall)
/budget wizard — Interactive budget setup

*Edit & Delete*
/expenses — List recent expenses with IDs
/edit <id> <field> <value> — Edit an expense
/delete <id> — Delete an expense (with confirmation)

*Goals*
/goals — View goals
/goals new "Trip" 100000 — Create goal
/goals add 5000 — Add to goal

*Wallets*
/wallets — View balances
/wallets new "Bank" bank — Create
/wallets transfer Cash Bank 50000 — Transfer

*Debts*
/debts — View debts
/debts lent Ahmed 50000 — Record
/debts borrowed Sara 30000 — Record
/debts repay Ahmed 10000 — Repay

*Subscriptions & Recurring*
/subscriptions — View subscriptions
/subscriptions add Netflix 1500 — Add
/subscriptions cancel Netflix — Cancel
/recurring — View recurring transactions
/recurring add "Gym" 50000 monthly — Add recurring

*Wishlist*
/wishlist — View wishlist
/wishlist add "MacBook" 2500000 — Add item
/wishlist buy <id> — Mark as purchased

*Settings*
/settings — Preferences
/help — This message

💡 Use \`k\`/\`m\` for shorthand: \`50k\` = 50000, \`5m\` = 5000000`;

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}
