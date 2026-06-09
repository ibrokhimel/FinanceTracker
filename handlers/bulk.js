/**
 * Bulk management — delete-all, delete search results, remove duplicates, reset.
 *
 * Every delete is confirmed with a button and is **undoable** (one ↩️ restores the
 * whole batch). /reset is the exception: it's irreversible, so it requires typing
 * the word RESET and auto-exports a CSV first.
 */

import {
  countExpenses, bulkDeleteAll, bulkDeleteByIds, findDuplicateIds, undoBulkBatch, wipeUserData,
} from '../db/queries/bulk.js';
import { setSession, getSession, clearSession, FLOWS } from '../bot/session.js';
import { inline } from '../bot/keyboards.js';
import { handleExport } from './export.js';

const confirmKb = (yesData) => inline([[
  { text: '✅ Yes, delete', callback_data: yesData },
  { text: '❌ Cancel', callback_data: 'blk:cancel' },
]]);
const undoKb = (batchId) => inline([[{ text: '↩️ Undo', callback_data: `blk:undo:${batchId}` }]]);

/* ─── /clear — delete everything ────────────────────────────────────────── */

export async function handleClear(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;
  const n = countExpenses(userId);
  if (!n) return bot.sendMessage(chatId, '🧹 Nothing to delete — your list is already empty.');
  await bot.sendMessage(chatId,
    `🗑️ *Delete ALL ${n} entries?*\nThis clears every expense & income. You can undo right after.`,
    { parse_mode: 'Markdown', ...confirmKb('blk:all') });
}

/* ─── /duplicates — find & remove repeats ───────────────────────────────── */

export async function handleDuplicates(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;
  const ids = findDuplicateIds(userId);
  if (!ids.length) return bot.sendMessage(chatId, '✨ No duplicates found — your ledger is clean.');
  setSession(msg.from.id, { dupIds: ids, userId });
  await bot.sendMessage(chatId,
    `♻️ *Found ${ids.length} duplicate ${ids.length === 1 ? 'entry' : 'entries'}* (same date, amount & note).\nRemove them? One copy of each is kept. Undoable.`,
    { parse_mode: 'Markdown', ...confirmKb('blk:dups') });
}

/* ─── /reset — wipe everything (hard confirm) ───────────────────────────── */

export async function handleReset(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;
  // Safety net: hand them a full CSV backup first.
  await bot.sendMessage(chatId, '🛟 Backing up your data first…');
  try { await handleExport(bot, { ...msg, text: '/export all' }); } catch {}
  setSession(msg.from.id, { flow: FLOWS.AWAITING_RESET_CONFIRM, userId });
  await bot.sendMessage(chatId,
    `⚠️ *Reset everything?*\nThis permanently deletes all expenses, budgets, goals, debts, subscriptions, recurring, wishlist & investments, and zeroes wallet balances. *It cannot be undone.*\n\nA CSV backup was just sent above. To proceed, reply with the word *RESET*.`,
    { parse_mode: 'Markdown' });
}

export async function handleResetConfirmReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  clearSession(msg.from.id);
  if (!userId) return;
  if (msg.text.trim() !== 'RESET') {
    return bot.sendMessage(chatId, '✅ Reset cancelled — nothing was deleted.');
  }
  wipeUserData(userId);
  await bot.sendMessage(chatId, '🧨 *Done.* Your account has been reset to a clean slate.', { parse_mode: 'Markdown' });
}

/* ─── Callbacks (namespace `blk`) ───────────────────────────────────────── */

export async function handleBulkCallback(bot, query, action, args) {
  const chatId = query.message?.chat?.id;
  const msgId = query.message?.message_id;
  const userId = query.user?.id;
  const ack = (t) => bot.answerCallbackQuery(query.id, t ? { text: t } : undefined).catch(() => {});
  const strip = () => bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {});

  if (action === 'cancel') { strip(); ack('Cancelled'); return bot.sendMessage(chatId, '👍 Cancelled — nothing deleted.'); }

  if (action === 'askall') {
    ack();
    const n = countExpenses(userId);
    if (!n) return bot.sendMessage(chatId, '🧹 Nothing to delete.');
    return bot.sendMessage(chatId, `🗑️ *Delete ALL ${n} entries?* You can undo right after.`, { parse_mode: 'Markdown', ...confirmKb('blk:all') });
  }

  if (action === 'all') {
    strip();
    const r = bulkDeleteAll(userId);
    ack(`Deleted ${r.count}`);
    if (!r.count) return bot.sendMessage(chatId, 'Nothing to delete.');
    return bot.sendMessage(chatId, `🗑️ *Deleted ${r.count} entries.*`, { parse_mode: 'Markdown', ...undoKb(r.batchId) });
  }

  if (action === 'dups') {
    strip();
    const ids = getSession(query.from.id)?.dupIds || findDuplicateIds(userId);
    clearSession(query.from.id);
    const r = bulkDeleteByIds(userId, ids, 'remove-duplicates');
    ack(`Removed ${r.count}`);
    if (!r.count) return bot.sendMessage(chatId, 'No duplicates to remove.');
    return bot.sendMessage(chatId, `♻️ *Removed ${r.count} duplicate entries.*`, { parse_mode: 'Markdown', ...undoKb(r.batchId) });
  }

  if (action === 'search') {
    strip();
    const ids = getSession(query.from.id)?.searchDeleteIds || [];
    clearSession(query.from.id);
    const r = bulkDeleteByIds(userId, ids, 'delete-search');
    ack(`Deleted ${r.count}`);
    if (!r.count) return bot.sendMessage(chatId, 'Those results expired — search again.');
    return bot.sendMessage(chatId, `🗑️ *Deleted ${r.count} matching entries.*`, { parse_mode: 'Markdown', ...undoKb(r.batchId) });
  }

  if (action === 'undo') {
    strip();
    const r = undoBulkBatch(userId, parseInt(args[0], 10));
    ack(r.count ? `Restored ${r.count}` : 'Already restored');
    return bot.sendMessage(chatId, r.count ? `↩️ *Restored ${r.count} entries.*` : 'Nothing to restore.', { parse_mode: 'Markdown' });
  }
}
