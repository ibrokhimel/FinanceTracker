/**
 * Photo handler — two modes, chosen by the user via buttons:
 *
 *   🧾 Receipt        → single total → one expense (Gemini/OpenRouter vision)
 *   🏦 Bank statement → many rows → classified into expenses / income / transfers,
 *                       card-to-card transfers detected and excluded from spending,
 *                       reviewed, then committed as one undoable import batch.
 *
 * Needs a vision-capable AI key (GEMINI_API_KEY or OPENROUTER_API_KEY).
 */

import { readReceipt, readStatement } from '../tools/ai.js';
import { classifyTransactions, matchWallet } from '../tools/statement.js';
import { addExpense, getExpenses } from '../db/queries/expenses.js';
import { getCategories, findCategoryByName } from '../db/queries/categories.js';
import { getWallets } from '../db/queries/wallets.js';
import { createImportBatch, createTransfer, deleteImportBatch } from '../db/queries/transfers.js';
import { categorize } from '../tools/categorizer.js';
import { formatAmount } from '../tools/formatter.js';
import { inline } from '../bot/keyboards.js';
import { setSession, getSession, clearSession } from '../bot/session.js';
import { getDb } from '../db/database.js';

/* ─── Entry: ask what the photo is ──────────────────────────────────────── */

export async function handlePhoto(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;
  const photos = msg.photo || [];
  if (!photos.length) return;
  const fileId = photos[photos.length - 1].file_id; // largest size

  setSession(msg.from.id, { photoFileId: fileId, userId }); // no `flow` → text router ignores it
  await bot.sendMessage(chatId, "📸 What's in this photo?", inline([[
    { text: '🧾 Receipt', callback_data: 'photo:receipt' },
    { text: '🏦 Bank statement', callback_data: 'photo:stmt' },
  ]]));
}

async function fetchPhoto(bot, fileId) {
  const link = await bot.getFileLink(fileId);
  const res = await fetch(link);
  return Buffer.from(await res.arrayBuffer());
}

/* ─── Choice callback (photo:receipt | photo:stmt) ──────────────────────── */

export async function handlePhotoChoice(bot, query, kind) {
  const chatId = query.message?.chat?.id;
  const userId = query.user?.id;
  const session = getSession(query.from.id);
  const fileId = session?.photoFileId;
  if (!fileId) return bot.answerCallbackQuery(query.id, { text: 'That photo expired — send it again.' });
  bot.answerCallbackQuery(query.id).catch(() => {});
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});

  const buf = await fetchPhoto(bot, fileId).catch(() => null);
  if (!buf) return bot.sendMessage(chatId, '❌ Could not download the photo. Try again.');

  if (kind === 'receipt') return runReceipt(bot, chatId, userId, buf);
  return runStatement(bot, chatId, userId, query.from.id, buf);
}

/* ─── Receipt mode (single expense) ─────────────────────────────────────── */

async function runReceipt(bot, chatId, userId, buf) {
  await bot.sendChatAction(chatId, 'upload_photo');
  const result = await readReceipt(buf, 'image/jpeg');
  if (!result.ok) return bot.sendMessage(chatId, `📸 Couldn't read the receipt — ${ocrHint(result.error)}\nMake sure an AI key is set (see START_MAC.md), or type the amount.`);
  const r = result.json;
  if (!r.total || r.total <= 0) return bot.sendMessage(chatId, `📸 I couldn't find a total. Type the amount and I'll log it.`);

  const cats = getCategories(userId, 'expense');
  const cat = cats.find(c => c.name.toLowerCase() === (r.category_guess || '').toLowerCase());
  const expense = addExpense({ user_id: userId, amount: r.total, category_id: cat?.id || null, note: r.merchant || 'Receipt', date: r.date || today(), type: 'expense' });
  try { getDb().prepare("UPDATE expenses SET source = 'receipt', confidence = 85 WHERE id = ?").run(expense.id); } catch {}

  const reply = `📸 *Receipt logged*\n${cat?.emoji || '🧾'} *${cat?.name || 'Uncategorized'}* — ${formatAmount(r.total)}\n` +
    (r.merchant ? `🏬 ${r.merchant}\n` : '') + `📅 ${expense.date}`;
  await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown', ...inline([[
    { text: '✏️ Edit', callback_data: `exp:edit:${expense.id}` },
    { text: '🗑️ Delete', callback_data: `exp:del:${expense.id}` },
  ]]) });
}

/* ─── Statement mode (multi-transaction) ────────────────────────────────── */

async function runStatement(bot, chatId, userId, tgId, buf) {
  await bot.sendChatAction(chatId, 'typing');
  const wallets = getWallets(userId);
  const hint = wallets.map(w => w.name + (w.aliases ? ` (${w.aliases})` : '')).join(', ');

  const res = await readStatement(buf, 'image/jpeg', hint);
  if (!res.ok) return bot.sendMessage(chatId, `🏦 Couldn't read the statement — ${ocrHint(res.error)}\nMake sure a vision AI key (Gemini/OpenRouter) is set — see START_MAC.md.`);
  if (!res.transactions.length) return bot.sendMessage(chatId, `🏦 I couldn't find any transactions in that image. Try a clearer, full-screen screenshot.`);

  // Dedupe against the last ~90 days of entries.
  const existing = getExpenses(userId, { fromDate: daysAgo(90), toDate: today(), limit: 1000 })
    .map(e => ({ date: e.date, amount: e.amount, note: e.note }));
  const cls = classifyTransactions(res.transactions, { wallets, existing });

  // Stash for the commit step (no `flow` so the text router won't grab it).
  setSession(tgId, { importBatch: { expenses: cls.expenses, income: cls.income, transfers: cls.transfers }, userId });

  const sum = (arr) => arr.reduce((a, t) => a + (t.amount || 0), 0);
  let text = `🏦 *Found ${res.transactions.length} transaction${res.transactions.length === 1 ? '' : 's'}*\n\n`;
  text += `💸 Expenses: ${cls.expenses.length}  (${formatAmount(sum(cls.expenses))})\n`;
  text += `📥 Income: ${cls.income.length}  (${formatAmount(sum(cls.income))})\n`;
  text += `🔁 Transfers (skipped from spending): ${cls.transfers.length}\n`;
  if (cls.duplicates.length) text += `♻️ Already logged (skipped): ${cls.duplicates.length}\n`;
  const preview = [...cls.expenses, ...cls.income].slice(0, 6)
    .map(t => `• ${t.direction === 'credit' ? '📥' : '💸'} ${formatAmount(t.amount)} — ${t.description || '—'}`).join('\n');
  if (preview) text += `\n${preview}\n`;
  text += `\nImport these?`;

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...inline([[
    { text: '✅ Import all', callback_data: 'imp:commit' },
    { text: '❌ Discard', callback_data: 'imp:cancel' },
  ]]) });
}

/* ─── Commit / cancel / undo ────────────────────────────────────────────── */

export async function handleImportCommit(bot, query) {
  const chatId = query.message?.chat?.id;
  const userId = query.user?.id;
  const session = getSession(query.from.id);
  const batch = session?.importBatch;
  bot.answerCallbackQuery(query.id).catch(() => {});
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
  if (!batch) return bot.sendMessage(chatId, 'That import expired — send the screenshot again.');

  const db = getDb();
  const batchId = createImportBatch(userId, 'screenshot');
  const tagExpense = db.prepare("UPDATE expenses SET import_batch_id = ?, source = 'screenshot' WHERE id = ?");

  let nExp = 0, nInc = 0, nTx = 0;
  for (const t of batch.expenses) {
    const c = categorize(t.description || '');
    const cat = c.category ? findCategoryByName(userId, c.category) : null;
    const e = addExpense({ user_id: userId, amount: t.amount, category_id: cat?.id || null, note: t.description || 'Imported', date: t.date || today(), type: 'expense' });
    tagExpense.run(batchId, e.id); nExp++;
  }
  for (const t of batch.income) {
    const e = addExpense({ user_id: userId, amount: t.amount, category_id: null, note: t.description || 'Imported', date: t.date || today(), type: 'income' });
    tagExpense.run(batchId, e.id); nInc++;
  }
  for (const t of batch.transfers) {
    createTransfer(userId, { fromWallet: t.fromWalletId, toWallet: t.toWalletId, amount: t.amount, date: t.date || today(), note: t.note, source: 'screenshot', importBatchId: batchId });
    nTx++;
  }
  clearSession(query.from.id);

  await bot.sendMessage(chatId,
    `✅ *Imported!*\n💸 ${nExp} expenses · 📥 ${nInc} income · 🔁 ${nTx} transfers`,
    { parse_mode: 'Markdown', ...inline([[{ text: '↩️ Undo this import', callback_data: `imp:undo:${batchId}` }]]) });
}

export async function handleImportCancel(bot, query) {
  clearSession(query.from.id);
  bot.answerCallbackQuery(query.id, { text: 'Discarded' }).catch(() => {});
  await bot.editMessageText('🗑️ Import discarded — nothing was saved.', { chat_id: query.message.chat.id, message_id: query.message.message_id }).catch(() => {});
}

export async function handleImportUndo(bot, query, batchId) {
  const userId = query.user?.id;
  const r = deleteImportBatch(userId, parseInt(batchId, 10));
  bot.answerCallbackQuery(query.id, { text: 'Undone' }).catch(() => {});
  await bot.editMessageText(`↩️ *Import undone* — removed ${r.entries} entries and ${r.transfers} transfers.`,
    { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'Markdown' }).catch(() => {});
}

/* ─── helpers ───────────────────────────────────────────────────────────── */

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ocrHint = (err) => String(err || '').includes('404') ? 'vision model not available for this key' : 'no vision AI provider reachable';
