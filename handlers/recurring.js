/**
 * Recurring transactions handler — /recurring command.
 */

import { createRecurring, getRecurring, cancelRecurring } from '../db/queries/recurring.js';
import { getCategories, findCategoryByName } from '../db/queries/categories.js';
import { formatAmount } from '../tools/formatter.js';
import { recurringActions } from '../bot/keyboards.js';

const FREQ_MAP = {
  daily: 'daily', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly',
  d: 'daily', w: 'weekly', m: 'monthly', y: 'yearly',
};

/**
 * /recurring [add|cancel] [args...]
 */
export async function handleRecurring(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');
  const args = msg.text.split(' ').slice(1);

  try {
    const sub = args[0]?.toLowerCase();

    if (!sub) return showRecurring(bot, chatId, userId);

    if (sub === 'add' && args.length >= 3) {
      return handleRecurringAdd(bot, chatId, userId, args.slice(1));
    }

    if (sub === 'cancel' && args.length >= 2) {
      return handleRecurringCancel(bot, chatId, userId, args[1]);
    }

    return showRecurring(bot, chatId, userId);
  } catch (err) {
    console.error('[recurring] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process recurring command.');
  }
}

async function handleRecurringAdd(bot, chatId, userId, args) {
  // Parse: "Name" amount frequency [category]
  let name, amount, frequency = 'monthly', categoryName = null;

  // Check for quoted name
  const qMatch = args.join(' ').match(/"([^"]+)"/);
  if (qMatch) {
    name = qMatch[1];
    const rest = args.join(' ').replace(/"([^"]+)"/, '').trim().split(/\s+/).filter(Boolean);
    amount = parseAmount(rest[0]);
    if (rest.length > 1 && FREQ_MAP[rest[1]?.toLowerCase()]) {
      frequency = FREQ_MAP[rest[1].toLowerCase()];
    }
    if (rest.length > 2) categoryName = rest.slice(2).join(' ');
  } else {
    // Try: amount frequency note or amount note frequency
    const amt = parseAmount(args[0]);
    if (amt && amt > 0) {
      amount = amt;
      const rest = args.slice(1);
      if (rest.length > 0 && FREQ_MAP[rest[0]?.toLowerCase()]) {
        frequency = FREQ_MAP[rest[0].toLowerCase()];
        name = rest.slice(1).join(' ');
      } else {
        name = rest.join(' ');
      }
    }
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    return bot.sendMessage(chatId, '❌ Invalid amount.\nUsage: `/recurring add "Netflix" 15000 monthly`', { parse_mode: 'Markdown' });
  }

  if (!name) name = 'Recurring';

  // Find category
  let categoryId = null;
  if (categoryName) {
    const cat = findCategoryByName(userId, categoryName);
    if (cat) categoryId = cat.id;
  }

  // Calculate next date
  const nextDate = calcNextDate(frequency);

  const tx = createRecurring(userId, {
    type: 'expense',
    amount,
    categoryId,
    note: name,
    frequency,
    nextDate,
  });

  await bot.sendMessage(chatId,
    `🔄 *Recurring transaction added!*\n*${name}* — ${formatAmount(amount)}/${frequency}\n📅 Next: ${nextDate}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleRecurringCancel(bot, chatId, userId, idStr) {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');

  const list = getRecurring(userId, 'active');
  const found = list.find(r => r.id === id);
  if (!found) return bot.sendMessage(chatId, `❌ Active recurring #${id} not found.`);

  cancelRecurring(id);
  await bot.sendMessage(chatId, `🗑️ *Cancelled* recurring: ${found.note || 'Unnamed'} (${formatAmount(found.amount)}/${found.frequency})`, { parse_mode: 'Markdown' });
}

async function showRecurring(bot, chatId, userId) {
  const active = getRecurring(userId, 'active');
  const cancelled = getRecurring(userId, 'cancelled');

  let text = '🔄 *Recurring Transactions*\n\n';

  if (!active.length && !cancelled.length) {
    text += 'None set up — tap below to add one.';
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...recurringActions([]) });
  }

  if (active.length) {
    text += `━━ *Active* ━━\n\n`;
    for (const r of active) {
      const emoji = r.cat_emoji || '🔄';
      const monthly = toMonthly(r.amount, r.frequency);
      text += `${emoji} *${r.note || 'Unnamed'}* — ${formatAmount(r.amount)}/${r.frequency}\n   📅 Next: ${r.next_date}`;
      if (r.frequency !== 'monthly') text += ` (~${formatAmount(monthly)}/mo)`;
      text += '\n';
      if (r.end_date) text += `   📅 Until: ${r.end_date}\n`;
      text += `   🆔 #${r.id}\n\n`;
    }
  }

  if (cancelled.length) {
    text += `━━ *Cancelled* ━━\n`;
    for (const r of cancelled.slice(0, 3)) {
      text += `🗑️ ${r.note || 'Unnamed'} — ${formatAmount(r.amount)}/${r.frequency}\n`;
    }
    text += '\n';
  }

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...recurringActions(active) });
}

/* ─── helpers ─── */

function calcNextDate(frequency) {
  const now = new Date();
  switch (frequency) {
    case 'daily':   return new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
    case 'weekly':  return new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    case 'monthly': return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString().slice(0, 10);
    case 'yearly':  return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    default:        return new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  }
}

function toMonthly(amount, frequency) {
  switch (frequency) {
    case 'weekly':   return amount * 4.33;
    case 'monthly':  return amount;
    case 'yearly':   return amount / 12;
    default:         return amount;
  }
}

function parseAmount(str) {
  if (!str) return NaN;
  str = str.replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1000;
  if (/m$/i.test(str)) return parseFloat(str) * 1_000_000;
  return parseFloat(str);
}
