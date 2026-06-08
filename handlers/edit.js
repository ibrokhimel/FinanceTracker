/**
 * Edit & Delete handler — /edit, /delete, /expenses commands.
 */

import { getExpenses, getExpenseById, updateExpense, deleteExpense } from '../db/queries/expenses.js';
import { findCategoryByName } from '../db/queries/categories.js';
import { parseQuick } from '../tools/parser.js';
import { resolveDate } from '../tools/dateHelper.js';
import { formatAmount } from '../tools/formatter.js';
import { setSession, clearSession, FLOWS } from '../bot/session.js';
import { logAudit } from '../db/queries/audit.js';

/**
 * /expenses [limit] — list recent expenses with IDs.
 */
export async function handleListExpenses(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');

  try {
    const args = msg.text.split(' ').slice(1);
    const limit = parseInt(args[0], 10) || 10;
    const expenses = getExpenses(userId, { limit: Math.min(limit, 50), order: 'DESC' });

    if (!expenses.length) {
      return bot.sendMessage(chatId, 'No expenses found. Add one with `/add 25000 lunch`', { parse_mode: 'Markdown' });
    }

    let text = `📋 *Recent Expenses* (last ${expenses.length})\n\n`;
    for (const e of expenses) {
      const emoji = e.cat_emoji || '📌';
      const icon = e.type === 'income' ? '📥' : '💸';
      text += `${icon} #${e.id} ${emoji} *${e.cat_name || 'Uncategorized'}* — ${formatAmount(e.amount)}`;
      if (e.note && e.note !== e.cat_name) text += ` (${e.note})`;
      text += `\n   📅 ${e.date}\n\n`;
    }
    text += `Tap 🗑️ to delete, or \`/edit <id> <field> <value>\` to change one.`;

    const { pagination, expenseListActions } = await import('../bot/keyboards.js');
    const hasNext = expenses.length === Math.min(limit, 50);
    const rows = [
      ...expenseListActions(expenses).reply_markup.inline_keyboard,
      ...pagination('exp:p', 0, hasNext, false).reply_markup.inline_keyboard,
    ];
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } });
  } catch (err) {
    console.error('[edit] list error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not load expenses.');
  }
}

/**
 * /edit <id> <field> <value> — edit an expense field.
 * Fields: amount, note/category, date, category
 */
export async function handleEditExpense(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');

  try {
    const parts = msg.text.split(' ').slice(1);
    if (parts.length < 3) {
      return bot.sendMessage(chatId,
        `✏️ *Edit an Expense*\n\nUsage:\n\`/edit 5 amount 30000\`\n\`/edit 5 note lunch at cafe\`\n\`/edit 5 category food\`\n\`/edit 5 date yesterday\`\n\nSee IDs with \`/expenses\``,
        { parse_mode: 'Markdown' }
      );
    }

    const id = parseInt(parts[0], 10);
    if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID. Use `/expenses` to see IDs.');

    const expense = getExpenseById(id);
    if (!expense || expense.user_id !== userId) {
      return bot.sendMessage(chatId, `❌ Expense #${id} not found.`);
    }

    const field = parts[1].toLowerCase();
    const value = parts.slice(2).join(' ');

    const before = { ...expense };

    switch (field) {
      case 'amount': {
        const parsed = parseQuick(value);
        if (!parsed.amount || parsed.amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount.');
        updateExpense(id, { amount: parsed.amount });
        logAudit({ userId, action: 'edit-amount', table: 'expenses', targetId: id, before, after: { ...before, amount: parsed.amount } });
        await bot.sendMessage(chatId, `✅ Updated amount → ${formatAmount(parsed.amount)}`);
        break;
      }
      case 'note': {
        updateExpense(id, { note: value });
        await bot.sendMessage(chatId, `✅ Updated note → "${value}"`);
        break;
      }
      case 'category': {
        const cat = findCategoryByName(userId, value);
        if (!cat) return bot.sendMessage(chatId, `❌ Category "${value}" not found.`);
        updateExpense(id, { category_id: cat.id });
        await bot.sendMessage(chatId, `✅ Updated category → ${cat.emoji} ${cat.name}`);
        break;
      }
      case 'date': {
        const resolved = resolveDate(value);
        if (!resolved) return bot.sendMessage(chatId, '❌ Could not parse date. Try "yesterday" or "2026-06-03".');
        updateExpense(id, { date: resolved });
        await bot.sendMessage(chatId, `✅ Updated date → ${resolved}`);
        break;
      }
      default:
        await bot.sendMessage(chatId, `❌ Unknown field "${field}". Use: amount, note, category, or date.`);
    }
  } catch (err) {
    console.error('[edit] error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not edit expense.');
  }
}

/**
 * /delete <id> — delete an expense with confirmation.
 */
export async function handleDeleteExpense(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.user?.id;
  if (!userId) return bot.sendMessage(chatId, '❌ Could not identify your account.');

  try {
    const parts = msg.text.split(' ').slice(1);
    if (!parts.length) {
      return bot.sendMessage(chatId, '🗑️ Usage: `/delete 5` — see IDs with `/expenses`', { parse_mode: 'Markdown' });
    }

    const id = parseInt(parts[0], 10);
    if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');

    const expense = getExpenseById(id);
    if (!expense || expense.user_id !== userId) {
      return bot.sendMessage(chatId, `❌ Expense #${id} not found.`);
    }

    const emoji = expense.cat_emoji || '📌';
    setSession(msg.from.id, { flow: FLOWS.AWAITING_DELETE_CONFIRMATION, deleteId: id, userId });
    await bot.sendMessage(chatId,
      `⚠️ *Delete this expense?*\n\n${emoji} ${expense.type === 'income' ? '📥' : '💸'} ${formatAmount(expense.amount)} — ${expense.note || expense.cat_name || 'Uncategorized'}\n📅 ${expense.date}\n\nReply *yes* to confirm, or anything else to cancel.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[edit] delete error:', err.message);
    await bot.sendMessage(chatId, '❌ Could not process delete.');
  }
}

/**
 * Handle delete confirmation reply.
 */
export async function handleDeleteConfirmReply(bot, msg, session) {
  const chatId = msg.chat.id;
  const userId = session.userId || msg.user?.id;
  if (!userId) return;

  try {
    const text = msg.text.trim().toLowerCase();
    if (text === 'yes' || text === 'y') {
      const before = getExpenseById(session.deleteId);
      if (before) logAudit({ userId, action: 'delete', table: 'expenses', targetId: session.deleteId, before });
      deleteExpense(session.deleteId);
      clearSession(msg.from.id);
      await bot.sendMessage(chatId, `🗑️ *Deleted!* Expense #${session.deleteId} removed. Use /undo to restore.`);
    } else {
      clearSession(msg.from.id);
      await bot.sendMessage(chatId, '👍 Delete cancelled.');
    }
  } catch (err) {
    console.error('[edit] confirm delete error:', err.message);
    clearSession(msg.from.id);
    await bot.sendMessage(chatId, '❌ Could not delete expense.');
  }
}
