/**
 * Button-initiated multi-step input flows.
 *
 * When an inline button needs a value the user must type (an amount, a name),
 * the callback sets a session flow and we land here to finish the job. Keeps the
 * "tap, then type one thing" UX consistent across wallets, goals and debts.
 *
 * The router dispatches to these based on session.flow.
 */

import { setSession, clearSession, FLOWS } from '../bot/session.js';
import { formatAmount, progressBar } from '../tools/formatter.js';
import { walletTypePicker } from '../bot/keyboards.js';
import { createWallet, getWallets, transferBetweenWallets } from '../db/queries/wallets.js';
import { createGoal, updateGoalProgress, getGoals } from '../db/queries/goals.js';
import { createDebt, repayDebt, getDebtById } from '../db/queries/debts.js';

/** Parse "25", "25k", "1.5m", "1,200" → number (or NaN). */
export function parseMoney(str) {
  if (!str) return NaN;
  str = String(str).trim().replace(/,/g, '');
  if (/k$/i.test(str)) return parseFloat(str) * 1_000;
  if (/m$/i.test(str)) return parseFloat(str) * 1_000_000;
  if (/b$/i.test(str)) return parseFloat(str) * 1_000_000_000;
  return parseFloat(str);
}

/* ─── Wallets ───────────────────────────────────────────────────────────── */

export async function handleWalletNameReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  clearSession(msg.from.id);
  if (!userId) return;

  const name = msg.text.trim().slice(0, 40);
  if (!name) return bot.sendMessage(chatId, '❌ Need a name. Tap 🔁 Transfer or /wallets to try again.');

  const wallet = createWallet(userId, { name, type: 'cash' });
  await bot.sendMessage(chatId,
    `✅ *Wallet created:* ${wallet.name}\n\nWhat type is it?`,
    { parse_mode: 'Markdown', ...walletTypePicker(wallet.id) });
}

export async function handleTransferAmountReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  clearSession(msg.from.id);
  if (!userId) return;

  const amount = parseMoney(msg.text);
  if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ That\'s not a valid amount. Tap 🔁 Transfer on /wallets to retry.');

  const wallets = getWallets(userId);
  const from = wallets.find(w => w.id === session.fromId);
  const to   = wallets.find(w => w.id === session.toId);
  if (!from || !to) return bot.sendMessage(chatId, '❌ One of those wallets no longer exists.');
  if (from.balance < amount) return bot.sendMessage(chatId, `❌ ${from.name} only has ${formatAmount(from.balance)}.`);

  transferBetweenWallets(from.id, to.id, amount);
  await bot.sendMessage(chatId, `💸 *Transfer complete!*\n${formatAmount(amount)}: ${from.name} → ${to.name}`, { parse_mode: 'Markdown' });
}

/* ─── Goals ─────────────────────────────────────────────────────────────── */

export async function handleGoalNameReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) { clearSession(msg.from.id); return; }

  const name = msg.text.trim().slice(0, 60);
  if (!name) { clearSession(msg.from.id); return bot.sendMessage(chatId, '❌ Need a name. /goals to try again.'); }

  setSession(msg.from.id, { flow: FLOWS.AWAITING_GOAL_AMOUNT, newGoalName: name, userId });
  await bot.sendMessage(chatId, `🎯 Goal *${name}* — what's the target amount?`, { parse_mode: 'Markdown' });
}

export async function handleGoalAmountReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  clearSession(msg.from.id);
  if (!userId) return;

  const amount = parseMoney(msg.text);
  if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Not a valid amount. /goals to try again.');

  // Adding to an existing goal (fixes the old "always first goal" bug).
  if (session.addToGoalId) {
    const updated = updateGoalProgress(session.addToGoalId, amount);
    if (!updated) return bot.sendMessage(chatId, '❌ That goal no longer exists.');
    if (updated.status === 'completed') {
      return bot.sendMessage(chatId, `🎉 *Goal reached:* ${updated.name}! (${formatAmount(updated.target_amount)})`, { parse_mode: 'Markdown' });
    }
    const pct = (updated.current_amount / updated.target_amount) * 100;
    return bot.sendMessage(chatId,
      `💰 *${updated.name}*: ${formatAmount(updated.current_amount)} / ${formatAmount(updated.target_amount)} (${Math.round(pct)}%)\n${progressBar(pct)}`,
      { parse_mode: 'Markdown' });
  }

  // Creating a new goal.
  const goal = createGoal(userId, { name: session.newGoalName || 'Goal', targetAmount: amount });
  await bot.sendMessage(chatId, `🎯 *New goal:* ${goal.name}\nTarget: ${formatAmount(goal.target_amount)}`, { parse_mode: 'Markdown' });
}

/* ─── Debts ─────────────────────────────────────────────────────────────── */

export async function handleDebtNameReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) { clearSession(msg.from.id); return; }

  const person = msg.text.trim().slice(0, 60);
  if (!person) { clearSession(msg.from.id); return bot.sendMessage(chatId, '❌ Need a name. /debts to try again.'); }

  setSession(msg.from.id, { flow: FLOWS.AWAITING_DEBT_AMOUNT, debtType: session.debtType, debtPerson: person, userId });
  const verb = session.debtType === 'lent' ? 'lent to' : 'borrowed from';
  await bot.sendMessage(chatId, `How much ${verb} *${person}*?`, { parse_mode: 'Markdown' });
}

export async function handleDebtAmountReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  clearSession(msg.from.id);
  if (!userId) return;

  const amount = parseMoney(msg.text);
  if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Not a valid amount. /debts to try again.');

  // Repaying an existing debt.
  if (session.repayDebtId) {
    const d = getDebtById(session.repayDebtId);
    if (!d || d.user_id !== userId) return bot.sendMessage(chatId, '❌ That debt no longer exists.');
    const updated = repayDebt(session.repayDebtId, amount);
    const status = updated.status === 'fully_repaid' ? '✅ Fully repaid!' : `📊 Remaining: ${formatAmount(updated.remaining_amount)}`;
    return bot.sendMessage(chatId, `💸 *Repayment recorded!*\n${formatAmount(amount)} — *${d.person_name}*\n${status}`, { parse_mode: 'Markdown' });
  }

  const type = session.debtType === 'lent' ? 'lent' : 'borrowed';
  createDebt(userId, { personName: session.debtPerson, amount, type });
  const dir = type === 'lent' ? 'to' : 'from';
  await bot.sendMessage(chatId, `📝 *Recorded!*\n${type === 'lent' ? 'Lent' : 'Borrowed'} ${formatAmount(amount)} ${dir} *${session.debtPerson}*`, { parse_mode: 'Markdown' });
}
