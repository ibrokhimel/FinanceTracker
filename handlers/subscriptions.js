/**
 * Subscriptions handler — /subscriptions command.
 */

import { createSubscription, getSubscriptions, updateSubscriptionStatus } from '../db/queries/subscriptions.js';
import { formatAmount } from '../tools/formatter.js';

/**
 * /subscriptions [add|cancel|pause] [name] [amount|cycle]
 */
export async function handleSubscriptions(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const args = msg.text.split(' ').slice(1);

  try {
    const sub = args[0]?.toLowerCase();

    if (!sub) return showSubs(bot, chatId, userId);

    if (sub === 'add' && args.length >= 3) {
      let name, amount, billingCycle = 'monthly';
      const cycles = ['weekly', 'monthly', 'quarterly', 'yearly'];

      const last = args[args.length - 1]?.toLowerCase();
      if (cycles.includes(last)) {
        billingCycle = last;
        amount = parseAmount(args[args.length - 2]);
        name = args.slice(1, -2).join(' ');
      } else {
        amount = parseAmount(args[args.length - 1]);
        name = args.slice(1, -1).join(' ');
      }

      if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount.');

      const next = getNextDate(billingCycle);
      const s = createSubscription(userId, { name, amount, billingCycle, nextBillingDate: next });

      await bot.sendMessage(chatId,
        `✅ *Subscription added!*\n*${s.name}* — ${formatAmount(s.amount)}/${s.billing_cycle}\n📅 Next: ${s.next_billing_date}`,
        { parse_mode: 'Markdown' }
      );
    } else if ((sub === 'cancel' || sub === 'pause') && args.length >= 2) {
      const name = args.slice(1).join(' ');
      const list = getSubscriptions(userId, 'active');
      const found = list.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
      if (!found) return bot.sendMessage(chatId, `❌ No active subscription matching "${name}".`);

      const newStatus = sub === 'cancel' ? 'cancelled' : 'paused';
      updateSubscriptionStatus(found.id, newStatus);

      const emoji = sub === 'cancel' ? '🗑️' : '⏸️';
      const msgText = sub === 'cancel'
        ? `${emoji} *Cancelled* ${found.name}. You'll save ${formatAmount(found.amount)}/${found.billing_cycle}!`
        : `${emoji} *Paused* ${found.name}. Resume later with /subscriptions.`;

      await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } else {
      return showSubs(bot, chatId, userId);
    }
  } catch (err) {
    console.error('[subscriptions] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process subscriptions command.');
  }
}

async function showSubs(bot, chatId, userId) {
  const active = getSubscriptions(userId, 'active');
  const paused = getSubscriptions(userId, 'paused');
  const cancelled = getSubscriptions(userId, 'cancelled');

  let text = '🔄 *Subscriptions*\n\n';

  if (!active.length && !paused.length && !cancelled.length) {
    text += 'None tracked.\n\nAdd one:\n`/subscriptions add Netflix 1500`\n`/subscriptions add Spotify 1000 yearly`';
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  if (active.length) {
    text += `━━ *Active* ━━\n\n`;
    let monthly = 0;
    for (const s of active) {
      const mc = toMonthly(s.amount, s.billing_cycle);
      text += `${s.cat_emoji || '🔄'} *${s.name}* — ${formatAmount(s.amount)}/${s.billing_cycle}\n   📅 Next: ${s.next_billing_date}\n`;
      if (s.billing_cycle !== 'monthly') text += `   ~${formatAmount(mc)}/month\n`;
      text += '\n';
      monthly += mc;
    }
    text += `📊 *Monthly total:* ${formatAmount(monthly)}\n\n`;
  }

  if (paused.length) {
    text += `━━ *Paused* ━━\n`;
    for (const s of paused) text += `⏸️ ${s.name} — ${formatAmount(s.amount)}/${s.billing_cycle}\n`;
    text += '\n';
  }

  if (cancelled.length) {
    text += `━━ *Cancelled* ━━\n`;
    for (const s of cancelled.slice(0, 3)) text += `🗑️ ${s.name}\n`;
  }

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

function getNextDate(cycle) {
  const now = new Date();
  switch (cycle) {
    case 'weekly':    return new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    case 'monthly':   return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString().slice(0, 10);
    case 'quarterly': return new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString().slice(0, 10);
    case 'yearly':    return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    default:          return new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  }
}

function toMonthly(amount, cycle) {
  switch (cycle) {
    case 'weekly':    return amount * 4.33;
    case 'monthly':   return amount;
    case 'quarterly': return amount / 3;
    case 'yearly':    return amount / 12;
    default:          return amount;
  }
}

function parseAmount(str) {
  str = str.replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1000;
  return parseFloat(str);
}
