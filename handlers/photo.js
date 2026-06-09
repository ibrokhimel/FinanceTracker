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

/* ─── Entry: collect photo(s), then ask what they are ───────────────────── */

// Photos sent together as an album arrive as separate messages sharing a
// media_group_id. We buffer them briefly and process the whole batch at once,
// instead of rate-limiting ("send slower"). key → { fileIds, userId, timer }
const albumBuffers = new Map();
const ALBUM_DEBOUNCE_MS = 1500;

export async function handlePhoto(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  const tgId = msg.from.id;
  if (!userId) return;
  const photos = msg.photo || [];
  if (!photos.length) return;
  const fileId = photos[photos.length - 1].file_id; // largest size

  if (msg.media_group_id) {
    const key = `${tgId}:${msg.media_group_id}`;
    let buf = albumBuffers.get(key);
    if (!buf) { buf = { fileIds: [], userId, chatId, timer: null }; albumBuffers.set(key, buf); }
    buf.fileIds.push(fileId);
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => {
      albumBuffers.delete(key);
      promptForBatch(bot, chatId, tgId, userId, buf.fileIds).catch(() => {});
    }, ALBUM_DEBOUNCE_MS);
    return;
  }

  return promptForBatch(bot, chatId, tgId, userId, [fileId]);
}

async function promptForBatch(bot, chatId, tgId, userId, fileIds) {
  setSession(tgId, { photoFileIds: fileIds, userId }); // no `flow` → text router ignores it
  const n = fileIds.length;
  await bot.sendMessage(chatId,
    n > 1 ? `📸 Got *${n}* images. What are they?` : "📸 What's in this photo?",
    { parse_mode: 'Markdown', ...inline([[
      { text: '🧾 Receipt', callback_data: 'photo:receipt' },
      { text: '🏦 Bank statement', callback_data: 'photo:stmt' },
    ]]) });
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
  const ids = session?.photoFileIds || (session?.photoFileId ? [session.photoFileId] : []);
  if (!ids.length) return bot.answerCallbackQuery(query.id, { text: 'Those photos expired — send them again.' });
  bot.answerCallbackQuery(query.id).catch(() => {});
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});

  const buffers = (await Promise.all(ids.map(id => fetchPhoto(bot, id).catch(() => null)))).filter(Boolean);
  if (!buffers.length) return bot.sendMessage(chatId, '❌ Could not download the image(s). Try again.');

  if (kind === 'receipt') return runReceipt(bot, chatId, userId, buffers);
  return runStatement(bot, chatId, userId, query.from.id, buffers);
}

/* ─── Receipt mode (one expense per image) ──────────────────────────────── */

async function runReceipt(bot, chatId, userId, buffers) {
  await bot.sendChatAction(chatId, 'upload_photo');
  const cats = getCategories(userId, 'expense');
  const logged = [];
  for (const buf of buffers) {
    const result = await readReceipt(buf, 'image/jpeg');
    if (!result.ok) continue;
    const r = result.json;
    if (!r.total || r.total <= 0) continue;
    const cat = cats.find(c => c.name.toLowerCase() === (r.category_guess || '').toLowerCase());
    const e = addExpense({ user_id: userId, amount: r.total, category_id: cat?.id || null, note: r.merchant || 'Receipt', date: r.date || today(), type: 'expense' });
    try { getDb().prepare("UPDATE expenses SET source = 'receipt', confidence = 85 WHERE id = ?").run(e.id); } catch {}
    logged.push({ e, r, cat });
  }

  if (!logged.length) return bot.sendMessage(chatId, `📸 Couldn't read ${buffers.length > 1 ? 'those receipts' : 'that receipt'} — ${ocrHint('')}\nMake sure a vision AI key is set (START_MAC.md), or type the amount.`);

  if (logged.length === 1) {
    const { e, r, cat } = logged[0];
    return bot.sendMessage(chatId,
      `📸 *Receipt logged*\n${cat?.emoji || '🧾'} *${cat?.name || 'Uncategorized'}* — ${formatAmount(r.total)}\n${r.merchant ? `🏬 ${r.merchant}\n` : ''}📅 ${e.date}`,
      { parse_mode: 'Markdown', ...inline([[
        { text: '✏️ Edit', callback_data: `exp:edit:${e.id}` },
        { text: '🗑️ Delete', callback_data: `exp:del:${e.id}` },
      ]]) });
  }
  const sum = logged.reduce((a, l) => a + l.r.total, 0);
  return bot.sendMessage(chatId, `📸 *${logged.length} receipts logged* — ${formatAmount(sum)} total.`, { parse_mode: 'Markdown' });
}

/* ─── Statement mode (multi-image, multi-transaction) ───────────────────── */

async function runStatement(bot, chatId, userId, tgId, buffers) {
  await bot.sendChatAction(chatId, 'typing');
  const wallets = getWallets(userId);
  const hint = wallets.map(w => w.name + (w.aliases ? ` (${w.aliases})` : '')).join(', ');

  // Read every image and merge their rows.
  const all = [];
  let readErr = null;
  for (const buf of buffers) {
    const res = await readStatement(buf, 'image/jpeg', hint);
    if (res.ok) all.push(...res.transactions);
    else readErr = res.error;
  }
  if (!all.length) {
    if (readErr) return bot.sendMessage(chatId, `🏦 Couldn't read the statement — ${ocrHint(readErr)}\nMake sure a vision AI key (Gemini/OpenRouter) is set — see START_MAC.md.`);
    return bot.sendMessage(chatId, `🏦 I couldn't find any transactions. Try clearer, full-screen screenshots.`);
  }

  // De-dupe rows that repeat across overlapping screenshots.
  const seen = new Set();
  const merged = all.filter(t => {
    const k = `${t.date}|${Math.round(t.amount)}|${t.direction}|${(t.description || '').toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Dedupe against the last ~90 days of entries already in the ledger.
  const existing = getExpenses(userId, { fromDate: daysAgo(90), toDate: today(), limit: 2000 })
    .map(e => ({ date: e.date, amount: e.amount, note: e.note }));
  const cls = classifyTransactions(merged, { wallets, existing });

  // Stash for the commit step (no `flow` so the text router won't grab it).
  setSession(tgId, { importBatch: { expenses: cls.expenses, income: cls.income, transfers: cls.transfers }, userId });

  const sum = (arr) => arr.reduce((a, t) => a + (t.amount || 0), 0);
  let text = `🏦 *Found ${merged.length} transaction${merged.length === 1 ? '' : 's'}*${buffers.length > 1 ? ` across ${buffers.length} images` : ''}\n\n`;
  text += `💸 Expenses: ${cls.expenses.length}  (${formatAmount(sum(cls.expenses))})\n`;
  text += `📥 Income: ${cls.income.length}  (${formatAmount(sum(cls.income))})\n`;
  text += `🔁 Transfers (skipped from spending): ${cls.transfers.length}\n`;
  if (cls.duplicates.length) text += `♻️ Already logged (skipped): ${cls.duplicates.length}\n`;
  const preview = [...cls.expenses, ...cls.income].slice(0, 6)
    .map(t => `• ${t.date || '?'}${t.time ? ' ' + t.time : ''} ${t.direction === 'credit' ? '📥' : '💸'} ${formatAmount(t.amount)} — ${t.description || '—'}`).join('\n');
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

  // Keep the real transaction time visible (the expenses table stores date only).
  const noteOf = (t) => (t.description || 'Imported') + (t.time ? ` @${t.time}` : '');

  let nExp = 0, nInc = 0, nTx = 0;
  for (const t of batch.expenses) {
    const c = categorize(t.description || '');
    const cat = c.category ? findCategoryByName(userId, c.category) : null;
    const e = addExpense({ user_id: userId, amount: t.amount, category_id: cat?.id || null, note: noteOf(t), date: t.date || today(), type: 'expense' });
    tagExpense.run(batchId, e.id); nExp++;
  }
  for (const t of batch.income) {
    const e = addExpense({ user_id: userId, amount: t.amount, category_id: null, note: noteOf(t), date: t.date || today(), type: 'income' });
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
