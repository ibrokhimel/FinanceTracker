/**
 * /undo and /history handlers — leverages audit_log table.
 */

import { getDb } from '../db/database.js';
import { getAuditFor, getLastDeleted, logAudit } from '../db/queries/audit.js';
import { addExpense } from '../db/queries/expenses.js';
import { formatAmount } from '../tools/formatter.js';

/** /undo — restore last deleted expense */
export async function handleUndo(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const last = getLastDeleted(userId, 'expenses');
  if (!last) return bot.sendMessage(chatId, 'Nothing to undo.');

  try {
    const before = JSON.parse(last.before_json);
    const restored = addExpense({
      user_id: before.user_id,
      amount: before.amount,
      category_id: before.category_id,
      note: before.note,
      date: before.date,
      type: before.type,
      wallet_id: before.wallet_id,
    });
    logAudit({ userId, action: 'restore', table: 'expenses', targetId: restored.id, after: restored });
    await bot.sendMessage(chatId,
      `↩️ *Restored:* ${formatAmount(before.amount)} — ${before.note || 'expense'}`,
      { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Couldn't restore: ${err.message}`);
  }
}

/** /history <id> — show edits to a specific transaction */
export async function handleHistory(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const parts = msg.text.split(/\s+/).slice(1);
  if (!parts[0]) {
    return bot.sendMessage(chatId, 'Usage: `/history <expense-id>`', { parse_mode: 'Markdown' });
  }
  const id = parseInt(parts[0], 10);
  const events = getAuditFor(userId, 'expenses', id);
  if (!events.length) return bot.sendMessage(chatId, 'No audit history for that entry.');

  const lines = events.map(e => {
    const when = e.created_at.replace('T', ' ').slice(0, 16);
    return `• ${when} — *${e.action}*`;
  }).join('\n');
  await bot.sendMessage(chatId, `📜 *Audit history for #${id}*\n\n${lines}`, { parse_mode: 'Markdown' });
}
