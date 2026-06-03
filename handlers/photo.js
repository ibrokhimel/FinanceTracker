/**
 * Photo handler — receipt OCR via Gemini multimodal.
 *
 * Flow:
 *   1. Largest photo size → buffer
 *   2. Gemini reads receipt → JSON {total, currency, merchant, category_guess}
 *   3. Save as expense with source='receipt' and confidence based on extraction.
 *   4. Show inline keyboard with Edit/Delete/Split.
 */

import { readReceipt } from '../tools/ai.js';
import { addExpense } from '../db/queries/expenses.js';
import { getCategories } from '../db/queries/categories.js';
import { formatAmount } from '../tools/formatter.js';
import { inline } from '../bot/keyboards.js';
import { getDb } from '../db/database.js';

export async function handlePhoto(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return;

  const photos = msg.photo || [];
  if (!photos.length) return;

  const largest = photos[photos.length - 1];

  try {
    await bot.sendChatAction(chatId, 'upload_photo');
    const link = await bot.getFileLink(largest.file_id);
    const res = await fetch(link);
    const buf = Buffer.from(await res.arrayBuffer());

    const result = await readReceipt(buf, 'image/jpeg');
    if (!result.ok) {
      console.error('[photo] OCR failed:', result.error);
      const short = String(result.error || '').includes('404')
        ? 'Gemini model not available (key may need permissions).'
        : 'OCR provider unreachable.';
      return bot.sendMessage(chatId, `📸 Couldn't read the receipt — ${short}\nTry typing the amount instead.`);
    }

    const r = result.json;
    if (!r.total || r.total <= 0) {
      return bot.sendMessage(chatId, `📸 I couldn't find a total on this receipt. Type the amount and I'll log it.`);
    }

    // Find category
    const cats = getCategories(userId, 'expense');
    const cat = cats.find(c => c.name.toLowerCase() === (r.category_guess || '').toLowerCase());

    const expense = addExpense({
      user_id: userId,
      amount: r.total,
      category_id: cat?.id || null,
      note: r.merchant || 'Receipt',
      date: r.date || new Date().toISOString().slice(0, 10),
      type: 'expense',
    });

    // Persist metadata
    try {
      getDb().prepare("UPDATE expenses SET source = 'receipt', confidence = 85 WHERE id = ?").run(expense.id);
    } catch {}

    const items = (r.items || []).slice(0, 5).map(i => `   • ${i.name} — ${formatAmount(i.amount)}`).join('\n');

    const reply = `📸 *Receipt logged*\n${cat?.emoji || '🧾'} *${cat?.name || 'Uncategorized'}* — ${formatAmount(r.total)}\n` +
                  (r.merchant ? `🏬 ${r.merchant}\n` : '') +
                  `📅 ${expense.date}\n` +
                  (items ? `\n*Items:*\n${items}\n` : '');

    const kb = inline([
      [
        { text: '✏️ Edit',  callback_data: `exp:edit:${expense.id}` },
        { text: '🗑️ Delete',callback_data: `exp:del:${expense.id}` },
      ],
      [
        { text: '➗ Split',  callback_data: `exp:split:${expense.id}` },
      ],
    ]);

    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown', ...kb });
  } catch (err) {
    console.error('[photo] error:', err.message);
    await bot.sendMessage(chatId, `❌ Receipt error: ${err.message}`);
  }
}
