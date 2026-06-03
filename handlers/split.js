/**
 * Split bills — /split <description> <amount> <person1> <person2> ...
 *
 * Examples:
 *   /split dinner 60000 Alice Bob          → 60000/3 each, you keep your 1/3,
 *                                            create 'lent' debts for Alice & Bob.
 *   /split rent 1500000 Alice Bob Charlie  → 4 people total (you included).
 *   /split 30000 Mike                      → no description, 2 people.
 */

import { parseQuick } from '../tools/parser.js';
import { createDebt } from '../db/queries/debts.js';
import { addExpense, getExpenseById, updateExpense } from '../db/queries/expenses.js';
import { getCategories } from '../db/queries/categories.js';
import { formatAmount } from '../tools/formatter.js';
import { clearSession } from '../bot/session.js';

export async function handleSplit(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const args = msg.text.split(/\s+/).slice(1);
  if (args.length < 2) {
    return bot.sendMessage(chatId,
      `➗ *Split a bill*\n\n\`/split dinner 60000 Alice Bob\`\n\`/split 1500000 Alice Bob Charlie\` (no description)\n\nYou'll pay your share and Alice + Bob will be added to your debts (lent).`,
      { parse_mode: 'Markdown' });
  }

  // Find the amount in args
  let amount = null, amountIdx = -1;
  for (let i = 0; i < args.length; i++) {
    const p = parseQuick(args[i]).amount;
    if (p && p > 0) { amount = p; amountIdx = i; break; }
  }
  if (!amount) {
    return bot.sendMessage(chatId, '❌ Could not find an amount. Example: `/split dinner 60000 Alice Bob`', { parse_mode: 'Markdown' });
  }

  const description = args.slice(0, amountIdx).join(' ') || 'split bill';
  const people = args.slice(amountIdx + 1);

  if (people.length === 0) {
    return bot.sendMessage(chatId, '❌ Add at least one person to split with.\nExample: `/split dinner 60000 Alice Bob`', { parse_mode: 'Markdown' });
  }

  const total = people.length + 1; // you + others
  const share = Math.round(amount / total);

  // Log your share as an expense
  const cats = getCategories(userId, 'expense');
  const guessCat = description.toLowerCase().match(/lunch|dinner|food|breakfast|coffee|drink/)
    ? cats.find(c => c.name === 'Food & Dining')
    : cats.find(c => c.name === 'Other');

  const expense = addExpense({
    user_id: userId,
    amount: share,
    category_id: guessCat?.id || null,
    note: `Split: ${description}`,
    date: new Date().toISOString().slice(0, 10),
    type: 'expense',
  });

  // Create lent debts for each other person
  const debts = [];
  for (const person of people) {
    const debt = createDebt(userId, {
      personName: person,
      amount: share,
      type: 'lent',
      note: `Split: ${description}`,
    });
    debts.push(debt);
  }

  const debtLines = debts.map(d => `• 🤝 ${d.person_name} owes you ${formatAmount(d.remaining_amount)}`).join('\n');

  await bot.sendMessage(chatId,
    `➗ *Bill split: ${description}*\n` +
    `Total: ${formatAmount(amount)} across ${total} people\n` +
    `Your share: ${formatAmount(share)} logged ✅\n\n` +
    `*New debts (lent):*\n${debtLines}\n\n` +
    `Use \`/debts\` to track repayment.`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Called when a user clicks the Split button on a receipt photo,
 * then replies with the list of people.
 */
export async function splitExistingExpense(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  const exp = getExpenseById(session.expenseId);
  if (!exp) {
    clearSession(msg.from.id);
    return bot.sendMessage(chatId, '❌ Original expense not found.');
  }

  const people = msg.text.trim().split(/\s+/).filter(Boolean);
  if (!people.length) {
    return bot.sendMessage(chatId, 'Send the people separated by spaces, e.g. `Alice Bob`', { parse_mode: 'Markdown' });
  }

  const total = people.length + 1;
  const share = Math.round(exp.amount / total);

  // Update original expense to "your share"
  updateExpense(exp.id, { amount: share, note: (exp.note || '') + ' (split)' });

  // Create lent debts
  const debts = [];
  for (const person of people) {
    debts.push(createDebt(userId, { personName: person, amount: share, type: 'lent', note: `Split: receipt #${exp.id}` }));
  }

  clearSession(msg.from.id);
  const debtLines = debts.map(d => `• 🤝 ${d.person_name} owes you ${formatAmount(share)}`).join('\n');
  await bot.sendMessage(chatId,
    `➗ *Receipt split into ${total} shares*\nYour share: ${formatAmount(share)}\n\n${debtLines}`,
    { parse_mode: 'Markdown' });
}
