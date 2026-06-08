/**
 * Debts handler — /debts command.
 */

import { createDebt, getDebts, repayDebt } from '../db/queries/debts.js';
import { formatAmount } from '../tools/formatter.js';
import { debtsActions } from '../bot/keyboards.js';

/**
 * /debts [lent|borrowed|repay] [person] [amount]
 */
export async function handleDebts(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');
  const args = msg.text.split(' ').slice(1);

  try {
    const sub = args[0]?.toLowerCase();

    if (!sub) return showDebts(bot, chatId, userId);

    if ((sub === 'lent' || sub === 'borrowed') && args.length >= 3) {
      let person, amount;

      if (args[1].startsWith('"')) {
        const m = msg.text.match(/"([^"]+)"/);
        person = m ? m[1] : args[1];
        amount = parseAmount(args[args.length - 1]);
      } else {
        person = args[1];
        amount = parseAmount(args[args.length - 1]);
      }

      if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount.');

      const debt = createDebt(userId, { personName: person, amount, type: sub === 'lent' ? 'lent' : 'borrowed' });
      const dir = sub === 'lent' ? 'to' : 'from';
      await bot.sendMessage(chatId, `📝 *Recorded!*\n${sub === 'lent' ? 'Lent' : 'Borrowed'} ${formatAmount(amount)} ${dir} *${person}*`, { parse_mode: 'Markdown' });
    } else if (sub === 'repay' && args.length >= 3) {
      const person = args[1];
      const amount = parseAmount(args[2]);
      if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount.');

      const debts = getDebts(userId);
      const debt = debts.find(d => d.person_name.toLowerCase().includes(person.toLowerCase()));
      if (!debt) return bot.sendMessage(chatId, `❌ No debt found with "${person}".`);

      const updated = repayDebt(debt.id, amount);
      const status = updated.status === 'fully_repaid' ? '✅ Fully repaid!' : `📊 Remaining: ${formatAmount(updated.remaining_amount)}`;
      await bot.sendMessage(chatId, `💸 *Repayment recorded!*\n${formatAmount(amount)} paid ${debt.type === 'lent' ? 'by' : 'to'} *${debt.person_name}*\n${status}`, { parse_mode: 'Markdown' });
    } else {
      return showDebts(bot, chatId, userId);
    }
  } catch (err) {
    console.error('[debts] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process debts command.');
  }
}

async function showDebts(bot, chatId, userId) {
  const lent = getDebts(userId, 'lent');
  const borrowed = getDebts(userId, 'borrowed');

  let text = '📋 *Debts Tracker*\n\n';
  if (!lent.length && !borrowed.length) {
    text += 'No debts recorded — tap below to add one.';
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...debtsActions([]) });
  }

  if (lent.length) {
    text += `━━ *You lent* ━━\n\n`;
    let total = 0;
    for (const d of lent) {
      text += `👤 *${d.person_name}* — ${formatAmount(d.remaining_amount)} remaining\n   Total: ${formatAmount(d.amount)}\n`;
      if (d.due_date) text += `   📅 Due: ${d.due_date}\n`;
      text += '\n';
      total += d.remaining_amount;
    }
    text += `Total outstanding: ${formatAmount(total)}\n\n`;
  }

  if (borrowed.length) {
    text += `━━ *You borrowed* ━━\n\n`;
    let total = 0;
    for (const d of borrowed) {
      text += `👤 *${d.person_name}* — ${formatAmount(d.remaining_amount)} remaining\n   Total: ${formatAmount(d.amount)}\n`;
      if (d.due_date) text += `   📅 Due: ${d.due_date}\n`;
      text += '\n';
      total += d.remaining_amount;
    }
    text += `Total owed: ${formatAmount(total)}\n`;
  }

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...debtsActions([...lent, ...borrowed]) });
}

function parseAmount(str) {
  str = str.replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1000;
  return parseFloat(str);
}
